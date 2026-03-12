/**
 * Lattice — Solana Chain Adapter
 */

import { jsonRpc, timedRpc } from "../utils/rpc.js";
import { createLogger } from "../utils/logger.js";
import type { ChainConfig, WalletBalance } from "../../types/index.js";

const log = createLogger("solana");

export class SolanaAdapter {
  constructor(private config: ChainConfig) {}

  get rpcUrl(): string {
    return this.config.rpcUrl;
  }

  async getBalance(): Promise<WalletBalance> {
    const balance = await jsonRpc<{ value: number }>(
      this.rpcUrl,
      "getBalance",
      [this.config.wallet]
    );

    // Fetch USDC token account balance
    let usdcBalance = 0;
    try {
      const tokenAccounts = await jsonRpc<{
        value: Array<{
          account: {
            data: {
              parsed: {
                info: {
                  tokenAmount: { uiAmount: number };
                  mint: string;
                };
              };
            };
          };
        }>;
      }>(this.rpcUrl, "getTokenAccountsByOwner", [
        this.config.wallet,
        { mint: this.config.usdcAddress },
        { encoding: "jsonParsed" },
      ]);

      for (const ta of tokenAccounts.value) {
        if (ta.account.data.parsed.info.mint === this.config.usdcAddress) {
          usdcBalance += ta.account.data.parsed.info.tokenAmount.uiAmount;
        }
      }
    } catch (err) {
      log.warn("Failed to fetch USDC balance", err);
    }

    return {
      chain: "solana",
      address: this.config.wallet,
      nativeBalance: balance.value / 1e9,
      nativeSymbol: "SOL",
      usdcBalance,
    };
  }

  async getSlot(): Promise<number> {
    return jsonRpc<number>(this.rpcUrl, "getSlot", []);
  }

  async getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
    const result = await jsonRpc<{
      value: { blockhash: string; lastValidBlockHeight: number };
    }>(this.rpcUrl, "getLatestBlockhash", [{ commitment: "finalized" }]);
    return result.value;
  }

  async getRecentPriorityFees(): Promise<number> {
    const fees = await jsonRpc<Array<{ prioritizationFee: number }>>(
      this.rpcUrl,
      "getRecentPrioritizationFees",
      []
    );
    if (fees.length === 0) return 0;
    return fees.reduce((sum, f) => sum + f.prioritizationFee, 0) / fees.length;
  }

  async getRentExemption(bytes: number): Promise<number> {
    return jsonRpc<number>(this.rpcUrl, "getMinimumBalanceForRentExemption", [bytes]);
  }

  async getVersion(): Promise<string> {
    const result = await jsonRpc<{ "solana-core": string }>(this.rpcUrl, "getVersion", []);
    return result["solana-core"];
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    slot: number;
    version: string;
    balanceSol: number;
    latencyMs: number;
  }> {
    try {
      const { result: slot, durationMs } = await timedRpc<number>(this.rpcUrl, "getSlot", []);
      const version = await this.getVersion();
      const balance = await this.getBalance();
      return {
        healthy: true,
        slot,
        version,
        balanceSol: balance.nativeBalance,
        latencyMs: durationMs,
      };
    } catch (err: any) {
      log.error("Health check failed", err.message);
      return { healthy: false, slot: 0, version: "unknown", balanceSol: 0, latencyMs: 0 };
    }
  }
}
