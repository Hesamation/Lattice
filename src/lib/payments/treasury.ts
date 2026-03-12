/**
 * Lattice — Multi-Chain Treasury
 *
 * Manages wallet balances, tracks spend across chains,
 * and enforces global budget constraints.
 */

import type { TreasuryReport, WalletBalance, LatticeConfig } from "../../types/index.js";
import { SolanaAdapter } from "../chains/solana.js";
import { BaseAdapter } from "../chains/base.js";
import type { AgentRegistry } from "../agents/registry.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("treasury");

export class Treasury {
  private solana: SolanaAdapter;
  private base: BaseAdapter;
  private cachedBalances: WalletBalance[] = [];
  private lastFetch = 0;
  private cacheMaxAge = 30000; // 30s

  constructor(
    private config: LatticeConfig,
    private registry: AgentRegistry
  ) {
    this.solana = new SolanaAdapter(config.chains.solana);
    this.base = new BaseAdapter(config.chains.base);
  }

  async getBalances(forceRefresh = false): Promise<WalletBalance[]> {
    if (!forceRefresh && Date.now() - this.lastFetch < this.cacheMaxAge) {
      return this.cachedBalances;
    }

    log.info("Fetching wallet balances...");

    const results = await Promise.allSettled([
      this.solana.getBalance(),
      this.base.getBalance(),
    ]);

    this.cachedBalances = results
      .filter((r): r is PromiseFulfilledResult<WalletBalance> => r.status === "fulfilled")
      .map((r) => r.value);

    for (const r of results) {
      if (r.status === "rejected") {
        log.error("Failed to fetch balance", r.reason);
      }
    }

    this.lastFetch = Date.now();
    return this.cachedBalances;
  }

  async getReport(): Promise<TreasuryReport> {
    const wallets = await this.getBalances();
    const agents = this.registry.list();

    const totalUsdcBalance = wallets.reduce((s, w) => s + w.usdcBalance, 0);
    const dailySpend = agents.reduce((s, a) => s + a.x402.dailySpentUsdc, 0);

    return {
      wallets,
      totalUsdcBalance,
      dailySpend,
      dailyBudget: this.config.dailyBudgetUsdc,
      budgetUtilization: this.config.dailyBudgetUsdc > 0 ? dailySpend / this.config.dailyBudgetUsdc : 0,
    };
  }

  async healthCheck(): Promise<{
    solana: { healthy: boolean; latencyMs: number };
    base: { healthy: boolean; latencyMs: number };
  }> {
    const [solHealth, baseHealth] = await Promise.all([
      this.solana.healthCheck(),
      this.base.healthCheck(),
    ]);

    return {
      solana: { healthy: solHealth.healthy, latencyMs: solHealth.latencyMs },
      base: { healthy: baseHealth.healthy, latencyMs: baseHealth.latencyMs },
    };
  }
}
