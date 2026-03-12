/**
 * Lattice — Agent Control Plane
 *
 * Main entry point and public API exports.
 */

// Core
export { LatticeControlPlane } from "./control-plane.js";

// Types
export type {
  Agent,
  AgentType,
  AgentStatus,
  AgentDeployOptions,
  AgentHealthReport,
  AgentHandler,
  AgentContext,
  ChainId,
  ChainConfig,
  LatticeConfig,
  LatticeEvent,
  LatticeEventHandler,
  X402Transaction,
  X402PaymentRequirements,
  X402PaymentPayload,
  X402ClientConfig,
  X402Client as IX402Client,
  WalletBalance,
  TreasuryReport,
  Logger,
  LogLevel,
} from "./types/index.js";

// Config
export { CHAINS, AGENT_TYPES, loadConfig } from "./config/chains.js";

// Agents
export { AgentRegistry } from "./lib/agents/registry.js";
export { AgentDeployer } from "./lib/agents/deployer.js";
export { AgentLifecycle } from "./lib/agents/lifecycle.js";
export { AgentMonitor } from "./lib/agents/monitor.js";

// Payments
export { X402Client } from "./lib/payments/x402-client.js";
export { Treasury } from "./lib/payments/treasury.js";
export { PaymentLedger } from "./lib/payments/ledger.js";

// Middleware
export { x402Middleware, type X402MiddlewareConfig } from "./middleware/x402.js";

// Chains
export { SolanaAdapter } from "./lib/chains/solana.js";
export { BaseAdapter } from "./lib/chains/base.js";

// Utils
export { createLogger } from "./lib/utils/logger.js";
export { jsonRpc, timedRpc } from "./lib/utils/rpc.js";
export { generateId, generateAgentId, generateTransactionId, slugify, truncateAddress } from "./lib/utils/id.js";
