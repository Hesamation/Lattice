/**
 * Lattice — x402 Payment Ledger
 *
 * Maintains an append-only audit log of all x402 transactions
 * across all agents. In production, persist to a database.
 */

import type { X402Transaction, ChainId } from "../../types/index.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("ledger");

export interface LedgerQuery {
  agentId?: string;
  chain?: ChainId;
  settled?: boolean;
  since?: number;
  limit?: number;
}

export interface LedgerSummary {
  totalTransactions: number;
  settledTransactions: number;
  failedTransactions: number;
  totalVolumeUsdc: number;
  volumeByChain: Record<string, number>;
  volumeByAgent: Record<string, number>;
  avgLatencyMs: number;
}

export class PaymentLedger {
  private transactions: X402Transaction[] = [];
  private maxEntries = 10000;

  record(tx: X402Transaction): void {
    this.transactions.push(tx);
    if (this.transactions.length > this.maxEntries) {
      this.transactions = this.transactions.slice(-this.maxEntries);
    }

    if (tx.settled) {
      log.debug(`Recorded: $${tx.amount.toFixed(4)} from ${tx.agentName} via ${tx.chain}`);
    }
  }

  query(q: LedgerQuery = {}): X402Transaction[] {
    let results = [...this.transactions];

    if (q.agentId) results = results.filter((t) => t.agentId === q.agentId);
    if (q.chain) results = results.filter((t) => t.chain === q.chain);
    if (q.settled !== undefined) results = results.filter((t) => t.settled === q.settled);
    if (q.since) results = results.filter((t) => t.timestamp >= q.since);

    results.sort((a, b) => b.timestamp - a.timestamp);

    if (q.limit) results = results.slice(0, q.limit);

    return results;
  }

  summary(since?: number): LedgerSummary {
    const txs = since ? this.transactions.filter((t) => t.timestamp >= since) : this.transactions;
    const settled = txs.filter((t) => t.settled);

    const volumeByChain: Record<string, number> = {};
    const volumeByAgent: Record<string, number> = {};

    for (const tx of settled) {
      volumeByChain[tx.chain] = (volumeByChain[tx.chain] || 0) + tx.amount;
      volumeByAgent[tx.agentName] = (volumeByAgent[tx.agentName] || 0) + tx.amount;
    }

    const totalLatency = txs.reduce((s, t) => s + t.latencyMs, 0);

    return {
      totalTransactions: txs.length,
      settledTransactions: settled.length,
      failedTransactions: txs.length - settled.length,
      totalVolumeUsdc: settled.reduce((s, t) => s + t.amount, 0),
      volumeByChain,
      volumeByAgent,
      avgLatencyMs: txs.length > 0 ? Math.round(totalLatency / txs.length) : 0,
    };
  }

  clear(): void {
    this.transactions = [];
    log.info("Ledger cleared");
  }
}
