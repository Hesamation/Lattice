# Lattice Protocol Specification

## Overview

Lattice is an agent control plane that manages heterogeneous agent fleets with x402-based micropayments on Solana and Base.

## Terminology

- **Control Plane** — The central Lattice process that manages all agents
- **Agent** — A managed process (LLM agent, trading bot, data pipeline, etc.)
- **Registry** — In-memory (extensible to persistent) store of agent state
- **x402 Client** — HTTP client that handles 402 Payment Required flows automatically
- **Treasury** — Multi-chain wallet balance and budget management
- **Ledger** — Append-only audit log of all x402 transactions
- **Facilitator** — Third-party service that verifies and settles x402 payments

## Agent Lifecycle

### States

| State | Description |
|-------|-------------|
| `deploying` | Agent is being provisioned |
| `running` | Agent is active and processing work |
| `stopped` | Agent is inactive |
| `error` | Agent encountered an unrecoverable error |
| `draining` | Agent is finishing in-flight work before stopping |

### Transitions

```
deploy     → deploying → running
stop       → stopped
start      → deploying → running
drain      → draining → stopped
restart    → stopped → deploying → running
rm         → (deleted from registry)
error      → (automatic on failure detection)
```

## x402 Payment Flow

### Standard Flow

1. Agent sends HTTP request to x402-enabled service
2. Service responds with `HTTP 402 Payment Required` + `PAYMENT-REQUIRED` header
3. Lattice x402 client parses payment requirements
4. Client validates amount against per-request max and daily budget
5. Client constructs signed USDC transfer (Solana SPL or Base ERC-20)
6. Client retries request with `X-PAYMENT` header containing signed payload
7. Service verifies payment via facilitator
8. Service settles payment and returns resource
9. Transaction recorded in Lattice ledger

### Budget Enforcement

- Each agent has a configurable daily USDC budget
- Per-request maximum prevents runaway payments
- At 80% utilization: warning event emitted
- At 100% utilization: agent stops making paid requests

### Supported Chains

| Chain | CAIP-2 | Asset | Facilitator |
|-------|--------|-------|-------------|
| Solana | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | USDC (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v) | CDP |
| Base | `eip155:8453` | USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) | CDP |

## Health Monitoring

- Heartbeat interval: configurable (default 10s)
- Stale threshold: 30s → warning
- Dead threshold: 60s → agent marked as error
- Metrics collected: CPU, memory, requests/min, error rate
- Automatic budget reset at midnight UTC

## API Surface

### CLI

```
lattice deploy --name <n> --type <type> --chain <chain>
lattice ls [--status <s>] [--chain <c>] [--type <t>]
lattice inspect <name|id>
lattice start <name|id>
lattice stop <name|id>
lattice drain <name|id>
lattice restart <name|id>
lattice rm <name|id>
lattice payments [--agent <n>] [--chain <c>] [--limit <n>]
lattice treasury
lattice health
```

### Programmatic

```typescript
import { LatticeControlPlane } from "lattice-orchestrator";

const lattice = new LatticeControlPlane();
await lattice.start();

const { agent } = await lattice.deploy({ name: "my-agent", type: "llm", chain: "solana" });
await lattice.stop_agent("my-agent");
await lattice.delete_agent("my-agent");

await lattice.stop();
```
