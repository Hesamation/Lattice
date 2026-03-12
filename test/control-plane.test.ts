/**
 * Lattice — Control Plane Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { LatticeControlPlane } from "../src/control-plane.js";
import { AgentRegistry } from "../src/lib/agents/registry.js";
import { PaymentLedger } from "../src/lib/payments/ledger.js";
import { slugify, generateAgentId, truncateAddress } from "../src/lib/utils/id.js";

// ─── Unit: ID Utils ──────────────────────────────────────────────────────────

describe("ID Utils", () => {
  it("generates agent IDs with ag- prefix", () => {
    const id = generateAgentId();
    expect(id).toMatch(/^ag-[a-f0-9]{8}$/);
  });

  it("slugifies names correctly", () => {
    expect(slugify("My Agent Name")).toBe("my-agent-name");
    expect(slugify("TRADING_BOT!!")).toBe("trading-bot");
    expect(slugify("---leading---")).toBe("leading");
  });

  it("truncates addresses", () => {
    expect(truncateAddress("AgeNTueM7jfjKQW2ALbFwa6ZHoDpdikRdeeVxbpnuky9")).toBe("DdQA9X…M9c2");
    expect(truncateAddress("0x5835850DeA53e7EDa795615995eFCe0b8E7361D2")).toBe("0xB676…61F2");
  });
});

// ─── Unit: Agent Registry ────────────────────────────────────────────────────

describe("AgentRegistry", () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  it("registers an agent", () => {
    const agent = registry.register({
      name: "test-agent",
      type: "llm",
      chain: "solana",
    });

    expect(agent.id).toMatch(/^ag-/);
    expect(agent.name).toBe("test-agent");
    expect(agent.type).toBe("llm");
    expect(agent.chain).toBe("solana");
    expect(agent.status).toBe("deploying");
  });

  it("prevents duplicate names", () => {
    registry.register({ name: "unique-name", type: "llm", chain: "solana" });
    expect(() => {
      registry.register({ name: "unique-name", type: "trading", chain: "base" });
    }).toThrow("already exists");
  });

  it("lists agents with filters", () => {
    registry.register({ name: "sol-agent", type: "llm", chain: "solana" });
    registry.register({ name: "base-agent", type: "trading", chain: "base" });

    expect(registry.list()).toHaveLength(2);
    expect(registry.list({ chain: "solana" })).toHaveLength(1);
    expect(registry.list({ chain: "base" })).toHaveLength(1);
  });

  it("updates agent status", () => {
    const agent = registry.register({ name: "status-test", type: "monitor", chain: "solana" });
    registry.updateStatus(agent.id, "running");
    expect(registry.get(agent.id)?.status).toBe("running");
  });

  it("deletes agents", () => {
    const agent = registry.register({ name: "deletable", type: "data", chain: "base" });
    expect(registry.count()).toBe(1);
    registry.delete(agent.id);
    expect(registry.count()).toBe(0);
  });

  it("tracks x402 stats", () => {
    const agent = registry.register({ name: "x402-test", type: "mcp", chain: "solana" });
    registry.updateX402Stats(agent.id, 1.50, true);
    registry.updateX402Stats(agent.id, 0.25, true);
    registry.updateX402Stats(agent.id, 0, false);

    const updated = registry.get(agent.id)!;
    expect(updated.x402.totalTransactions).toBe(3);
    expect(updated.x402.totalSpentUsdc).toBeCloseTo(1.75);
  });

  it("emits events", () => {
    const events: string[] = [];
    registry.on((e) => events.push(e.type));

    const agent = registry.register({ name: "event-test", type: "llm", chain: "solana" });
    registry.updateStatus(agent.id, "running");
    registry.updateStatus(agent.id, "stopped");
    registry.delete(agent.id);

    expect(events).toEqual([
      "agent:deployed",
      "agent:started",
      "agent:stopped",
      "agent:deleted",
    ]);
  });

  it("emits budget warnings", () => {
    const events: string[] = [];
    registry.on((e) => events.push(e.type));

    const agent = registry.register({
      name: "budget-test",
      type: "llm",
      chain: "solana",
      dailyBudgetUsdc: 10,
    });

    // Spend 85% of budget
    registry.updateX402Stats(agent.id, 8.5, true);
    expect(events).toContain("x402:budget_warning");
  });
});

// ─── Unit: Payment Ledger ────────────────────────────────────────────────────

describe("PaymentLedger", () => {
  let ledger: PaymentLedger;

  beforeEach(() => {
    ledger = new PaymentLedger();
  });

  it("records and queries transactions", () => {
    ledger.record({
      id: "tx-001",
      agentId: "ag-001",
      agentName: "test",
      chain: "solana",
      method: "GET",
      resource: "/v1/data",
      amount: 0.01,
      status: 200,
      settled: true,
      latencyMs: 150,
      timestamp: Date.now(),
      facilitator: "cdp.coinbase.com",
      txHash: "0xabc",
    });

    expect(ledger.query()).toHaveLength(1);
    expect(ledger.query({ chain: "solana" })).toHaveLength(1);
    expect(ledger.query({ chain: "base" })).toHaveLength(0);
  });

  it("produces accurate summaries", () => {
    ledger.record({
      id: "tx-001", agentId: "ag-001", agentName: "agent-a", chain: "solana",
      method: "GET", resource: "/data", amount: 0.50, status: 200, settled: true,
      latencyMs: 100, timestamp: Date.now(), facilitator: "cdp", txHash: "0x1",
    });
    ledger.record({
      id: "tx-002", agentId: "ag-002", agentName: "agent-b", chain: "base",
      method: "POST", resource: "/infer", amount: 1.00, status: 200, settled: true,
      latencyMs: 200, timestamp: Date.now(), facilitator: "cdp", txHash: "0x2",
    });
    ledger.record({
      id: "tx-003", agentId: "ag-001", agentName: "agent-a", chain: "solana",
      method: "GET", resource: "/data", amount: 0, status: 500, settled: false,
      latencyMs: 3000, timestamp: Date.now(), facilitator: null, txHash: null, error: "timeout",
    });

    const summary = ledger.summary();
    expect(summary.totalTransactions).toBe(3);
    expect(summary.settledTransactions).toBe(2);
    expect(summary.failedTransactions).toBe(1);
    expect(summary.totalVolumeUsdc).toBeCloseTo(1.50);
    expect(summary.volumeByChain["solana"]).toBeCloseTo(0.50);
    expect(summary.volumeByChain["base"]).toBeCloseTo(1.00);
    expect(summary.volumeByAgent["agent-a"]).toBeCloseTo(0.50);
    expect(summary.volumeByAgent["agent-b"]).toBeCloseTo(1.00);
  });
});

// ─── Integration: Control Plane ──────────────────────────────────────────────

describe("LatticeControlPlane", () => {
  let lattice: LatticeControlPlane;

  beforeEach(() => {
    lattice = new LatticeControlPlane({
      maxAgents: 5,
      heartbeatInterval: 60000, // Long interval so monitor doesn't fire during tests
    });
  });

  it("deploys an agent", async () => {
    const result = await lattice.deploy({
      name: "integration-test",
      type: "llm",
      chain: "solana",
    });

    expect(result.success).toBe(true);
    expect(result.agent).toBeDefined();
    expect(result.agent!.name).toBe("integration-test");
    expect(result.agent!.status).toBe("running");
  });

  it("enforces max agent limit", async () => {
    for (let i = 0; i < 5; i++) {
      await lattice.deploy({ name: `agent-${i}`, type: "llm", chain: "solana" });
    }

    const result = await lattice.deploy({ name: "agent-overflow", type: "llm", chain: "solana" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Maximum agent limit");
  });

  it("lists agents", async () => {
    await lattice.deploy({ name: "sol-test", type: "llm", chain: "solana" });
    await lattice.deploy({ name: "base-test", type: "trading", chain: "base" });

    const all = lattice.list();
    expect(all.length).toBe(2);

    const solOnly = lattice.list({ chain: "solana" });
    expect(solOnly.length).toBe(1);
    expect(solOnly[0].name).toBe("sol-test");
  });

  it("stops and starts agents", async () => {
    const { agent } = await lattice.deploy({ name: "lifecycle-test", type: "monitor", chain: "base" });

    await lattice.stop_agent(agent!.name);
    expect(lattice.inspect(agent!.name)?.status).toBe("stopped");

    await lattice.start_agent(agent!.name);
    expect(lattice.inspect(agent!.name)?.status).toBe("running");
  });

  it("deletes agents", async () => {
    await lattice.deploy({ name: "to-delete", type: "data", chain: "solana" });
    expect(lattice.list()).toHaveLength(1);

    await lattice.delete_agent("to-delete");
    expect(lattice.list()).toHaveLength(0);
  });
});
