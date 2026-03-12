# LATTICE

**Agent orchestration for multi-service projects.**

Lattice coordinates agents across tools, services, and infrastructure to ship projects end-to-end. Define what needs to happen, assign agents, and Lattice handles sequencing, dependencies, budgets, and on-chain settlement via [x402](https://x402.org) on Solana and Base.

---

## How It Works

```
You define a project
    → Lattice breaks it into tasks with dependencies
    → Lattice assigns agents to each task
    → Agents consume external services via x402 (inference, data, tools)
    → Lattice tracks progress, spend, and health across everything
    → Settlement happens in USDC on Solana or Base
```

## Quick Start

```bash
# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Start the control plane
bun run start

# Deploy a new agent
bun run lattice deploy --name sentinel-alpha --type llm --chain solana

# List running agents
bun run lattice ls

# Stop an agent
bun run lattice stop sentinel-alpha

# Decommission an agent
bun run lattice rm sentinel-alpha

# View x402 payment history
bun run lattice payments --agent sentinel-alpha

# Run simulation mode
bun run lattice sim --mode full --chain all
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     LATTICE (Orchestration)                     │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ Projects  │  │ Registry │  │ Treasury │  │  Scheduler   │ │
│  │ & Tasks   │  │ & Health │  │ & Budget │  │  & Routing   │ │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  └──────┬──────┘ │
│        └──────────────┴─────────────┴───────────────┘        │
│                         │                                     │
│              ┌──────────┴──────────┐                         │
│              │   x402 Payment Layer │                         │
│              └──────┬─────────┬────┘                         │
└─────────────────────┼─────────┼──────────────────────────────┘
                      │         │
             ┌────────┴┐   ┌───┴────────┐
             │ Solana   │   │   Base      │
             │ Helius   │   │   EVM       │
             └─────────┘   └────────────┘
```

## Core Concepts

**Projects** — A project is a goal with a set of tasks, dependencies, and a budget. Lattice decomposes projects into tasks and sequences them based on dependency order.

**Agents** — The workers. Each agent has a type, a payment chain, a daily budget, and health metrics. Lattice deploys, monitors, and retires them.

**Tasks** — Units of work within a project. Tasks have inputs, outputs, an assigned agent, and an x402 spend cap. Lattice routes tasks to the right agent type and tracks completion.

**Treasury** — Multi-chain wallet management. Every agent's x402 spend is tracked against per-agent and per-project budgets. Warnings at 80%, hard stop at 100%.

## Wallets

| Chain  | Network | Address |
|--------|---------|---------|
| Solana | Mainnet | `AgeNTueM7jfjKQW2ALbFwa6ZHoDpdikRdeeVxbpnuky9` |
| Base   | Mainnet | `0x5835850DeA53e7EDa795615995eFCe0b8E7361D2` |

## Agent Types

| Type | Description | Use Case |
|------|-------------|----------|
| `llm` | LLM Agent | Claude, GPT, Gemini orchestration |
| `trading` | Trading Bot | On-chain swap & arbitrage execution |
| `data` | Data Pipeline | Indexing, ETL, analytics feeds |
| `mcp` | MCP Server | Tool provider for agent networks |
| `monitor` | Monitor | Watchdog, alerting, health probes |
| `custom` | Custom | User-defined agent template |

## CLI Reference

```
lattice <command> [options]

Commands:
  deploy    Deploy a new agent to the fleet
  ls        List all agents and their status
  inspect   Show agent details, health, and x402 spend
  start     Start a stopped agent
  stop      Gracefully stop a running agent
  restart   Restart an agent
  rm        Decommission an agent
  payments  View x402 payment history
  treasury  View wallet balances and budget status
  sim       Run transaction simulations
  health    Show fleet health summary

Options:
  --chain <solana|base>     Target chain for operations
  --type <agent-type>       Agent type filter
  --format <json|table>     Output format (default: table)
  --verbose                 Show detailed output
  -h, --help                Show help
```

## x402 Integration

Agents pay for external resources using the [x402 protocol](https://x402.org). When an agent makes an HTTP request to an x402-enabled service:

1. The service responds with `HTTP 402 Payment Required`
2. Lattice constructs a USDC payment payload via the agent's configured chain
3. The payment is verified and settled through a facilitator (default: CDP)
4. The service returns the requested resource

This is how agents pay for inference, data feeds, tool access, and any x402-enabled service. All transactions are tracked per-agent and per-project with full audit trails.

### Supported Networks

- **Solana** — CAIP-2: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` via Helius RPC
- **Base** — CAIP-2: `eip155:8453` via public or custom RPC

### Payment Configuration

```typescript
{
  scheme: "exact",
  asset: "USDC",
  facilitator: "https://x402-facilitator.cdp.coinbase.com",
  maxAmountPerRequest: "1.00",    // USDC
  dailyBudgetPerAgent: "50.00",   // USDC
}
```

## Environment Variables

```bash
# Required
HELIUS_API_KEY=           # Solana RPC via Helius
LATTICE_SOLANA_PRIVATE_KEY= # Base58-encoded Solana keypair
LATTICE_BASE_PRIVATE_KEY=   # Hex-encoded Base private key

# Optional
BASE_RPC_URL=             # Override Base RPC (default: https://mainnet.base.org)
X402_FACILITATOR_URL=     # Override facilitator (default: CDP)
LATTICE_LOG_LEVEL=          # debug | info | warn | error (default: info)
LATTICE_MAX_AGENTS=         # Max concurrent agents (default: 50)
LATTICE_HEARTBEAT_INTERVAL= # Health check interval ms (default: 10000)
```

## Project Structure

```
lattice/
├── bin/
│   └── lattice.ts                  # CLI entrypoint
├── src/
│   ├── index.ts                  # Main exports
│   ├── control-plane.ts          # Core orchestration engine
│   ├── config/
│   │   └── chains.ts             # Chain & wallet configuration
│   ├── types/
│   │   └── index.ts              # Shared type definitions
│   ├── lib/
│   │   ├── agents/
│   │   │   ├── registry.ts       # Agent registry & state management
│   │   │   ├── deployer.ts       # Agent deployment engine
│   │   │   ├── monitor.ts        # Health monitoring & heartbeat
│   │   │   └── lifecycle.ts      # Start/stop/restart logic
│   │   ├── payments/
│   │   │   ├── x402-client.ts    # x402 protocol client
│   │   │   ├── treasury.ts       # Multi-chain wallet management
│   │   │   └── ledger.ts         # Payment history & audit
│   │   ├── chains/
│   │   │   ├── solana.ts         # Solana RPC adapter
│   │   │   └── base.ts           # Base (EVM) RPC adapter
│   │   └── utils/
│   │       ├── logger.ts         # Structured logging
│   │       ├── rpc.ts            # JSON-RPC helper
│   │       └── id.ts             # ID generation
│   └── middleware/
│       └── x402.ts               # x402 payment middleware
├── test/
│   └── control-plane.test.ts     # Test suite
├── spec/
│   └── spec.md                   # Protocol specification
├── .github/
│   └── workflows/
│       └── ci.yml                # CI pipeline
├── .env.example
├── .gitignore
├── .npmignore
├── AGENTS.md
├── LICENSE
├── README.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── next-env.d.ts
```

## Development

```bash
# Run tests
bun run test

# Type check
bun run typecheck

# Lint
bun run lint

# Build
bun run build
```

## License

MIT — see [LICENSE](./LICENSE) for details.
