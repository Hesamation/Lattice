/**
 * Lattice — x402 Protocol Client
 *
 * Implements the x402 HTTP payment flow:
 * 1. Client makes request → server returns 402 + PaymentRequirements
 * 2. Client constructs signed payment → retries with X-PAYMENT header
 * 3. Server verifies via facilitator → returns resource
 *
 * References:
 *   https://x402.org
 *   https://github.com/coinbase/x402
 *   https://docs.cdp.coinbase.com/x402/welcome
 */

import type {
  X402ClientConfig,
  X402PaymentRequirements,
  X402Transaction,
  ChainId,
} from "../../types/index.js";
import { generateTransactionId } from "../utils/id.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("x402");

export class X402Client {
  private transactions: X402Transaction[] = [];
  private dailySpend = 0;
  private dailyResetAt: number;

  constructor(
    private config: X402ClientConfig,
    private agentId: string,
    private agentName: string
  ) {
    // Reset daily spend at midnight UTC
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);
    this.dailyResetAt = tomorrow.getTime();
  }

  /**
   * Make an HTTP request with automatic x402 payment handling.
   *
   * If the server responds with 402, this client:
   * 1. Parses the PAYMENT-REQUIRED header
   * 2. Checks budget constraints
   * 3. Constructs and signs a payment payload
   * 4. Retries the request with the X-PAYMENT header
   */
  async fetch(url: string, options?: RequestInit): Promise<Response> {
    this.resetDailyIfNeeded();
    const method = options?.method ?? "GET";
    const start = performance.now();

    try {
      // Initial request
      const response = await globalThis.fetch(url, options);

      // If not 402, return as-is
      if (response.status !== 402) {
        this.recordTransaction(method, url, 0, response.status, false, start);
        return response;
      }

      // ─── Handle 402 Payment Required ─────────────────────────────

      log.info(`402 received for ${method} ${url} — initiating payment`);

      const paymentRequiredHeader = response.headers.get("payment-required") ||
                                     response.headers.get("x-payment-required");

      if (!paymentRequiredHeader) {
        log.error("402 response missing PAYMENT-REQUIRED header");
        this.recordTransaction(method, url, 0, 402, false, start, "Missing payment header");
        return response;
      }

      // Parse payment requirements
      let requirements: X402PaymentRequirements;
      try {
        const decoded = Buffer.from(paymentRequiredHeader, "base64").toString("utf-8");
        requirements = JSON.parse(decoded);
      } catch {
        try {
          requirements = JSON.parse(paymentRequiredHeader);
        } catch (err) {
          log.error("Failed to parse payment requirements");
          this.recordTransaction(method, url, 0, 402, false, start, "Invalid payment requirements");
          return response;
        }
      }

      // Validate amount against budget
      const amount = parseFloat(requirements.accepted.amount) / 1e6; // USDC atomic → dollars
      if (amount > this.config.maxAmountPerRequest) {
        log.warn(`Payment amount $${amount} exceeds max per-request ($${this.config.maxAmountPerRequest})`);
        this.recordTransaction(method, url, amount, 402, false, start, "Exceeds max per-request");
        return response;
      }

      if (this.dailySpend + amount > this.config.dailyBudget) {
        log.warn(`Payment would exceed daily budget ($${this.dailySpend + amount} > $${this.config.dailyBudget})`);
        this.recordTransaction(method, url, amount, 402, false, start, "Budget exceeded");
        return response;
      }

      // Construct payment payload
      const paymentPayload = await this.constructPayment(requirements);

      // Retry with payment
      const paidResponse = await globalThis.fetch(url, {
        ...options,
        headers: {
          ...Object.fromEntries(new Headers(options?.headers).entries()),
          "X-PAYMENT": paymentPayload,
        },
      });

      const settled = paidResponse.status === 200;
      if (settled) {
        this.dailySpend += amount;
        log.info(`Payment settled: $${amount} for ${method} ${url}`);
      } else {
        log.warn(`Payment not settled (status ${paidResponse.status}) for ${method} ${url}`);
      }

      this.recordTransaction(method, url, amount, paidResponse.status, settled, start);
      return paidResponse;

    } catch (err: any) {
      const latency = Math.round(performance.now() - start);
      log.error(`Request failed: ${method} ${url} — ${err.message}`);
      this.recordTransaction(method, url, 0, 500, false, start, err.message);
      throw err;
    }
  }

  /**
   * Construct a signed payment payload for the given requirements.
   * In production, this would sign a real transaction on Solana or Base.
   */
  private async constructPayment(requirements: X402PaymentRequirements): Promise<string> {
    const payload = {
      scheme: requirements.accepted.scheme,
      network: requirements.accepted.network,
      // In production: create and sign a USDC transfer transaction
      // For Solana: SPL Token transfer instruction, signed with agent's keypair
      // For Base: ERC-20 transfer, signed with agent's private key
      transaction: Buffer.from(JSON.stringify({
        type: "x402-payment",
        chain: this.config.chain,
        from: this.config.walletAddress,
        to: requirements.accepted.payTo,
        amount: requirements.accepted.amount,
        asset: requirements.accepted.asset,
        timestamp: Date.now(),
      })).toString("base64"),
    };

    return Buffer.from(JSON.stringify(payload)).toString("base64");
  }

  private recordTransaction(
    method: string,
    url: string,
    amount: number,
    status: number,
    settled: boolean,
    startTime: number,
    error?: string
  ): void {
    const tx: X402Transaction = {
      id: generateTransactionId(),
      agentId: this.agentId,
      agentName: this.agentName,
      chain: this.config.chain,
      method,
      resource: new URL(url).pathname,
      amount,
      status,
      settled,
      latencyMs: Math.round(performance.now() - startTime),
      timestamp: Date.now(),
      facilitator: settled ? this.extractFacilitator() : null,
      txHash: settled ? this.generateSimulatedTxHash() : null,
      error,
    };

    this.transactions.push(tx);

    // Keep last 1000 transactions in memory
    if (this.transactions.length > 1000) {
      this.transactions = this.transactions.slice(-1000);
    }
  }

  private extractFacilitator(): string {
    try {
      return new URL(this.config.facilitatorUrl).hostname;
    } catch {
      return this.config.facilitatorUrl;
    }
  }

  private generateSimulatedTxHash(): string {
    const chars = "0123456789abcdef";
    let hash = this.config.chain === "base" ? "0x" : "";
    const length = this.config.chain === "base" ? 64 : 88;
    for (let i = 0; i < length; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)];
    }
    return hash;
  }

  private resetDailyIfNeeded(): void {
    if (Date.now() >= this.dailyResetAt) {
      this.dailySpend = 0;
      const tomorrow = new Date();
      tomorrow.setUTCHours(24, 0, 0, 0);
      this.dailyResetAt = tomorrow.getTime();
    }
  }

  // ─── Public Accessors ────────────────────────────────────────────────

  getTransactionHistory(): X402Transaction[] {
    return [...this.transactions];
  }

  getDailySpend(): number {
    this.resetDailyIfNeeded();
    return this.dailySpend;
  }

  getRemainingBudget(): number {
    this.resetDailyIfNeeded();
    return Math.max(0, this.config.dailyBudget - this.dailySpend);
  }

  getTotalSpend(): number {
    return this.transactions
      .filter((t) => t.settled)
      .reduce((sum, t) => sum + t.amount, 0);
  }
}
