/**
 * Lattice — Agent Registry
 *
 * In-memory agent state management. In production, back this with
 * a persistent store (SQLite, Postgres, Redis, etc.)
 */

import type { Agent, AgentStatus, AgentDeployOptions, LatticeEvent, LatticeEventHandler } from "../../types/index.js";
import { generateAgentId } from "../utils/id.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("registry");

export class AgentRegistry {
  private agents: Map<string, Agent> = new Map();
  private listeners: LatticeEventHandler[] = [];

  // ─── Queries ─────────────────────────────────────────────────────────

  get(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  getByName(name: string): Agent | undefined {
    for (const agent of this.agents.values()) {
      if (agent.name === name) return agent;
    }
    return undefined;
  }

  list(filter?: { status?: AgentStatus; chain?: string; type?: string }): Agent[] {
    let result = Array.from(this.agents.values());
    if (filter?.status) result = result.filter((a) => a.status === filter.status);
    if (filter?.chain) result = result.filter((a) => a.chain === filter.chain);
    if (filter?.type) result = result.filter((a) => a.type === filter.type);
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  count(): number {
    return this.agents.size;
  }

  countByStatus(status: AgentStatus): number {
    return this.list({ status }).length;
  }

  // ─── Mutations ───────────────────────────────────────────────────────

  register(options: AgentDeployOptions): Agent {
    // Validate unique name
    if (this.getByName(options.name)) {
      throw new Error(`Agent with name "${options.name}" already exists`);
    }

    const now = Date.now();
    const agent: Agent = {
      id: generateAgentId(),
      name: options.name,
      type: options.type,
      chain: options.chain,
      status: "deploying",
      createdAt: now,
      updatedAt: now,
      uptime: 0,
      lastPing: now,
      metrics: { cpu: 0, memory: 0, requestsPerMinute: 0, errorRate: 0 },
      x402: {
        totalTransactions: 0,
        totalSpentUsdc: 0,
        dailySpentUsdc: 0,
        dailyBudgetUsdc: options.dailyBudgetUsdc ?? 50,
        lastTransaction: 0,
      },
      config: options.config ?? {},
    };

    this.agents.set(agent.id, agent);
    log.info(`Registered agent: ${agent.name} (${agent.id}) on ${agent.chain}`);
    this.emit({ type: "agent:deployed", agent });
    return agent;
  }

  updateStatus(id: string, status: AgentStatus): void {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`Agent ${id} not found`);

    agent.status = status;
    agent.updatedAt = Date.now();

    if (status === "running") {
      this.emit({ type: "agent:started", agentId: id });
    } else if (status === "stopped") {
      agent.uptime = 0;
      agent.metrics = { cpu: 0, memory: 0, requestsPerMinute: 0, errorRate: 0 };
      this.emit({ type: "agent:stopped", agentId: id });
    } else if (status === "error") {
      this.emit({ type: "agent:error", agentId: id, error: "Agent entered error state" });
    }

    log.info(`Agent ${agent.name} status → ${status}`);
  }

  updateMetrics(id: string, metrics: Partial<Agent["metrics"]>): void {
    const agent = this.agents.get(id);
    if (!agent) return;

    Object.assign(agent.metrics, metrics);
    agent.lastPing = Date.now();
    agent.updatedAt = Date.now();
  }

  updateX402Stats(id: string, amount: number, settled: boolean): void {
    const agent = this.agents.get(id);
    if (!agent) return;

    agent.x402.totalTransactions++;
    if (settled) {
      agent.x402.totalSpentUsdc += amount;
      agent.x402.dailySpentUsdc += amount;
    }
    agent.x402.lastTransaction = Date.now();
    agent.updatedAt = Date.now();

    // Budget warnings
    const utilization = agent.x402.dailySpentUsdc / agent.x402.dailyBudgetUsdc;
    if (utilization >= 1) {
      this.emit({ type: "x402:budget_exceeded", agentId: id });
    } else if (utilization >= 0.8) {
      this.emit({ type: "x402:budget_warning", agentId: id, utilization });
    }
  }

  delete(id: string): boolean {
    const agent = this.agents.get(id);
    if (!agent) return false;

    this.agents.delete(id);
    log.info(`Deleted agent: ${agent.name} (${id})`);
    this.emit({ type: "agent:deleted", agentId: id });
    return true;
  }

  // Reset daily budgets (call at midnight UTC)
  resetDailyBudgets(): void {
    for (const agent of this.agents.values()) {
      agent.x402.dailySpentUsdc = 0;
    }
    log.info("Daily budgets reset");
  }

  // ─── Events ──────────────────────────────────────────────────────────

  on(handler: LatticeEventHandler): () => void {
    this.listeners.push(handler);
    return () => {
      this.listeners = this.listeners.filter((h) => h !== handler);
    };
  }

  private emit(event: LatticeEvent): void {
    for (const handler of this.listeners) {
      try {
        handler(event);
      } catch (err) {
        log.error("Event handler error", err);
      }
    }
  }
}
