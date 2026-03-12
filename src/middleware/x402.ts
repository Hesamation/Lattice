/**
 * Lattice — x402 Payment Middleware
 *
 * Drop-in middleware that adds x402 payment requirements to
 * your HTTP endpoints. Compatible with Express, Hono, and
 * any framework that uses (req, res, next) pattern.
 *
 * Usage:
 *   app.use("/v1/inference", x402Middleware({
 *     amount: "1000000",  // $1.00 USDC (6 decimals)
 *     chain: "solana",
 *     description: "AI inference request",
 *   }));
 */

import type { ChainId } from "../types/index.js";
import { CHAINS } from "../config/chains.js";
import { createLogger } from "../lib/utils/logger.js";

const log = createLogger("x402-mw");

export interface X402MiddlewareConfig {
  /** Payment amount in atomic USDC units (6 decimals). "1000000" = $1.00 */
  amount: string;
  /** Which chain to accept payment on */
  chain: ChainId;
  /** Human-readable description of the resource */
  description?: string;
  /** Max timeout for payment settlement (default: 300s) */
  maxTimeoutSeconds?: number;
  /** Facilitator URL (default: CDP) */
  facilitatorUrl?: string;
}

interface MinimalRequest {
  method?: string;
  url?: string;
  headers: { get?(key: string): string | null } | Record<string, string>;
}

interface MinimalResponse {
  status?(code: number): MinimalResponse;
  setHeader?(key: string, value: string): void;
  set?(key: string, value: string): void;
  json?(body: unknown): void;
  send?(body: string): void;
}

export function x402Middleware(config: X402MiddlewareConfig) {
  const chainConfig = CHAINS[config.chain];
  if (!chainConfig) {
    throw new Error(`Unknown chain: ${config.chain}`);
  }

  const facilitatorUrl = config.facilitatorUrl ?? "https://x402-facilitator.cdp.coinbase.com";

  // Pre-build the payment requirements object
  const paymentRequirements = {
    x402Version: 2,
    resource: {
      description: config.description ?? "Protected resource",
      mimeType: "application/json",
    },
    accepted: {
      scheme: "exact" as const,
      network: chainConfig.caip2,
      amount: config.amount,
      payTo: chainConfig.wallet,
      maxTimeoutSeconds: config.maxTimeoutSeconds ?? 300,
      asset: chainConfig.usdcAddress,
      extra: config.chain === "solana"
        ? { feePayer: chainConfig.wallet }
        : undefined,
    },
  };

  const encodedRequirements = Buffer.from(
    JSON.stringify(paymentRequirements)
  ).toString("base64");

  return async function middleware(
    req: MinimalRequest,
    res: MinimalResponse,
    next?: () => void | Promise<void>
  ) {
    // Check for X-PAYMENT header
    let paymentHeader: string | null = null;

    if (typeof req.headers.get === "function") {
      paymentHeader = req.headers.get("x-payment");
    } else if (typeof req.headers === "object") {
      paymentHeader = (req.headers as Record<string, string>)["x-payment"] ?? null;
    }

    if (!paymentHeader) {
      // Return 402 with payment requirements
      log.info(`402 → ${req.method} ${req.url}`);

      if (res.status && res.setHeader && res.json) {
        res.setHeader("Payment-Required", encodedRequirements);
        res.status(402).json({
          error: "Payment Required",
          paymentRequirements,
        });
      } else if (res.set && res.status && res.send) {
        res.set("Payment-Required", encodedRequirements);
        res.status(402).send(JSON.stringify({
          error: "Payment Required",
          paymentRequirements,
        }));
      }
      return;
    }

    // Verify payment via facilitator
    try {
      const verifyResponse = await fetch(`${facilitatorUrl}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: paymentHeader,
          requirements: paymentRequirements,
        }),
      });

      if (!verifyResponse.ok) {
        log.warn(`Payment verification failed: ${verifyResponse.status}`);
        if (res.status && res.json) {
          res.status(402).json({ error: "Payment verification failed" });
        }
        return;
      }

      const verification = await verifyResponse.json() as { isValid: boolean; invalidReason?: string };

      if (!verification.isValid) {
        log.warn(`Invalid payment: ${verification.invalidReason}`);
        if (res.status && res.json) {
          res.status(402).json({ error: "Invalid payment", reason: verification.invalidReason });
        }
        return;
      }

      // Payment valid — settle and proceed
      log.info(`Payment verified for ${req.method} ${req.url}`);

      // Settle payment asynchronously
      fetch(`${facilitatorUrl}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: paymentHeader,
          requirements: paymentRequirements,
        }),
      }).catch((err) => log.error("Settlement failed", err));

      // Continue to the actual handler
      if (next) await next();

    } catch (err: any) {
      log.error(`Payment verification error: ${err.message}`);
      if (res.status && res.json) {
        res.status(500).json({ error: "Payment processing error" });
      }
    }
  };
}
