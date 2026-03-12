/**
 * Chain & Wallet Configuration
 */

import type { ChainConfig, ChainId, LatticeConfig, LogLevel } from "../types/index.js";

// ─── Chain Definitions ───────────────────────────────────────────────────────

function getSolanaRpcUrl(): string {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    console.warn("[lattice] HELIUS_API_KEY not set — falling back to public RPC (rate-limited)");
    return "https://api.mainnet-beta.solana.com";
  }
  return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
}

function getBaseRpcUrl(): string {
  return process.env.BASE_RPC_URL || "https://mainnet.base.org";
}

export const CHAINS: Record<ChainId, ChainConfig> = {
  solana: {
    id: "solana",
    label: "Solana",
    network: "Mainnet",
    rpcUrl: getSolanaRpcUrl(),
    wallet: "AgeNTueM7jfjKQW2ALbFwa6ZHoDpdikRdeeVxbpnuky9",
    caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    explorer: "https://explorer.solana.com",
    usdcAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  base: {
    id: "base",
    label: "Base",
    network: "Mainnet",
    rpcUrl: getBaseRpcUrl(),
    wallet: "0x5835850DeA53e7EDa795615995eFCe0b8E7361D2",
    caip2: "eip155:8453",
    explorer: "https://basescan.org",
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
};

// ─── Lattice Config Factory ────────────────────────────────────────────────────

export function loadConfig(): LatticeConfig {
  return {
    chains: CHAINS,
    maxAgents: parseInt(process.env.LATTICE_MAX_AGENTS || "50", 10),
    heartbeatInterval: parseInt(process.env.LATTICE_HEARTBEAT_INTERVAL || "10000", 10),
    logLevel: (process.env.LATTICE_LOG_LEVEL || "info") as LogLevel,
    dailyBudgetUsdc: parseFloat(process.env.LATTICE_DAILY_BUDGET_USDC || "100"),
    facilitatorUrl: process.env.X402_FACILITATOR_URL || "https://x402-facilitator.cdp.coinbase.com",
  };
}

// ─── Agent Type Metadata ─────────────────────────────────────────────────────

export const AGENT_TYPES = {
  llm: { label: "LLM Agent", icon: "◈", description: "Claude, GPT, Gemini orchestration" },
  trading: { label: "Trading Bot", icon: "◇", description: "On-chain swap & arbitrage execution" },
  data: { label: "Data Pipeline", icon: "◆", description: "Indexing, ETL, analytics feeds" },
  mcp: { label: "MCP Server", icon: "◉", description: "Tool provider for agent networks" },
  monitor: { label: "Monitor", icon: "◎", description: "Watchdog, alerting, health probes" },
  custom: { label: "Custom", icon: "◻", description: "User-defined agent template" },
} as const;
