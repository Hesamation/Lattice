/**
 * Lattice — Shared Type Definitions
 */

// ─── Chain Types ─────────────────────────────────────────────────────────────

export type ChainId = "solana" | "base";

export interface ChainConfig {
  id: ChainId;
  label: string;
  network: string;
  rpcUrl: string;
  wallet: string;
  caip2: string;
  explorer: string;
  usdcAddress: string;
}

// ─── Agent Types ─────────────────────────────────────────────────────────────

export type AgentType = "llm" | "trading" | "data" | "mcp" | "monitor" | "custom";

export type AgentStatus = "deploying" | "running" | "stopped" | "error" | "draining";

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  chain: ChainId;
  status: AgentStatus;
  createdAt: number;
  updatedAt: number;
  uptime: number;
  lastPing: number;
  metrics: AgentMetrics;
  x402: AgentX402Stats;
  config: Record<string, unknown>;
}

export interface AgentMetrics {
  cpu: number;
  memory: number;
  requestsPerMinute: number;
  errorRate: number;
}

export interface AgentX402Stats {
  totalTransactions: number;
  totalSpentUsdc: number;
  dailySpentUsdc: number;
  dailyBudgetUsdc: number;
  lastTransaction: number;
}

export interface AgentDeployOptions {
  name: string;
  type: AgentType;
  chain: ChainId;
  config?: Record<string, unknown>;
  dailyBudgetUsdc?: number;
}

export interface AgentHealthReport {
  agentId: string;
  healthy: boolean;
  cpu: number;
  memory: number;
  uptime: number;
  timestamp: number;
  error?: string;
}

// ─── Agent Handler Interface ─────────────────────────────────────────────────

export interface AgentContext {
  agent: Agent;
  logger: Logger;
  x402Client: X402Client;
  config: Record<string, unknown>;
}

export interface AgentHandler {
  onDeploy(ctx: AgentContext): Promise<void>;
  onStart(ctx: AgentContext): Promise<void>;
  onStop(ctx: AgentContext): Promise<void>;
  onHealthCheck(ctx: AgentContext): Promise<AgentHealthReport>;
}

// ─── x402 Types ──────────────────────────────────────────────────────────────

export type X402Scheme = "exact" | "upto";

export interface X402PaymentRequirements {
  x402Version: number;
  resource: {
    url: string;
    description?: string;
    mimeType?: string;
  };
  accepted: {
    scheme: X402Scheme;
    network: string;
    amount: string;
    payTo: string;
    maxTimeoutSeconds: number;
    asset: string;
    extra?: Record<string, unknown>;
  };
}

export interface X402PaymentPayload {
  scheme: X402Scheme;
  network: string;
  transaction: string; // base64-encoded signed transaction
}

export interface X402Transaction {
  id: string;
  agentId: string;
  agentName: string;
  chain: ChainId;
  method: string;
  resource: string;
  amount: number;
  status: number;
  settled: boolean;
  latencyMs: number;
  timestamp: number;
  facilitator: string | null;
  txHash: string | null;
  error?: string;
}

export interface X402ClientConfig {
  facilitatorUrl: string;
  chain: ChainId;
  walletAddress: string;
  maxAmountPerRequest: number;
  dailyBudget: number;
}

// ─── x402 Client Interface ───────────────────────────────────────────────────

export interface X402Client {
  fetch(url: string, options?: RequestInit): Promise<Response>;
  getTransactionHistory(): X402Transaction[];
  getDailySpend(): number;
  getRemainingBudget(): number;
}

// ─── Treasury Types ──────────────────────────────────────────────────────────

export interface WalletBalance {
  chain: ChainId;
  address: string;
  nativeBalance: number;
  nativeSymbol: string;
  usdcBalance: number;
}

export interface TreasuryReport {
  wallets: WalletBalance[];
  totalUsdcBalance: number;
  dailySpend: number;
  dailyBudget: number;
  budgetUtilization: number;
}

// ─── Control Plane Types ─────────────────────────────────────────────────────

export interface LatticeConfig {
  chains: Record<ChainId, ChainConfig>;
  maxAgents: number;
  heartbeatInterval: number;
  logLevel: LogLevel;
  dailyBudgetUsdc: number;
  facilitatorUrl: string;
}

export interface LatticeState {
  agents: Map<string, Agent>;
  transactions: X402Transaction[];
  startedAt: number;
}

// ─── Logger Types ────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

// ─── Event Types ─────────────────────────────────────────────────────────────

export type LatticeEvent =
  | { type: "agent:deployed"; agent: Agent }
  | { type: "agent:started"; agentId: string }
  | { type: "agent:stopped"; agentId: string }
  | { type: "agent:error"; agentId: string; error: string }
  | { type: "agent:deleted"; agentId: string }
  | { type: "agent:health"; report: AgentHealthReport }
  | { type: "x402:transaction"; transaction: X402Transaction }
  | { type: "x402:budget_warning"; agentId: string; utilization: number }
  | { type: "x402:budget_exceeded"; agentId: string };

export type LatticeEventHandler = (event: LatticeEvent) => void;
