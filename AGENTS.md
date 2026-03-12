# AGENTS.md

## Agent Architecture

Every agent managed by Lattice conforms to a standard lifecycle interface. This document describes the conventions, contracts, and expectations for agents operating under the Lattice control plane.

## Agent Identity

Each agent receives a unique identity upon deployment:

- **ID** — 8-character alphanumeric, generated at deploy time
- **Name** — User-defined, lowercase alphanumeric + hyphens, 3-48 characters
- **Type** — One of: `llm`, `trading`, `data`, `mcp`, `monitor`, `custom`
- **Chain** — Payment chain: `solana` or `base`

## Lifecycle States

```
                 ┌──────────┐
       deploy ──▶│ deploying│
                 └────┬─────┘
                      │ ready
                      ▼
                 ┌──────────┐  stop   ┌─────────┐
                 │  running  │───────▶│ stopped  │
                 └────┬─────┘        └────┬─────┘
                      │ error        start│
                      ▼                   │
                 ┌──────────┐             │
                 │  error    │◀───────────┘
                 └────┬─────┘   (on failure)
                      │ restart
                      ▼
                 ┌──────────┐
                 │ deploying│ (re-enter cycle)
                 └──────────┘

  Any state ──▶ wind-down ──▶ finishing ──▶ stopped
  Any state ──▶ decommission ──▶ (removed)
```

## Health Contract

Running agents must satisfy:

1. **Heartbeat** — Respond to health probes within the configured interval (default: 10s)
2. **Metrics** — Report `cpu`, `memory`, `uptime`, and `x402TxCount` on each heartbeat
3. **Graceful shutdown** — When receiving a `stop` or `wind-down` signal, finish in-flight work before exiting

## x402 Payment Contract

Agents that consume external x402-enabled resources must:

1. Register their payment chain (`solana` or `base`) at deploy time
2. Use the Lattice x402 client (`x402-client.ts`) for all paid HTTP requests
3. Respect the per-agent daily budget limit
4. Report all x402 transactions to the Lattice ledger

## Custom Agent Template

To create a custom agent type, implement the `AgentHandler` interface:

```typescript
import type { AgentHandler, AgentContext } from "lattice-orchestrator";

export const myAgent: AgentHandler = {
  async onDeploy(ctx: AgentContext) {
    // Initialize resources
  },
  async onStart(ctx: AgentContext) {
    // Begin work loop
  },
  async onStop(ctx: AgentContext) {
    // Graceful shutdown
  },
  async onHealthCheck(ctx: AgentContext) {
    return { healthy: true, cpu: 12, mem: 34 };
  },
};
```
