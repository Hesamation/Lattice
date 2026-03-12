/**
 * Lattice — Control Plane
 *
 * The central orchestrator that ties together agent registry,
 * deployer, lifecycle, monitor, treasury, and payment ledger.
 */

import type { LatticeConfig, AgentDeployOptions, Agent, LatticeEvent, LatticeEventHandler } from "./types/index.js";
import { loadConfig } from "./config/chains.js";
import { AgentRegistry } from "./lib/agents/registry.js";
import { AgentDeployer, type DeployResult } from "./lib/agents/deployer.js";
import { AgentLifecycle } from "./lib/agents/lifecycle.js";
import { AgentMonitor } from "./lib/agents/monitor.js";
import { Treasury } from "./lib/payments/treasury.js";
import { PaymentLedger } from "./lib/payments/ledger.js";
import { createLogger } from "./lib/utils/logger.js";

const log = createLogger("lattice");

export class LatticeControlPlane {
  readonly config: LatticeConfig;
  readonly registry: AgentRegistry;
  readonly deployer: AgentDeployer;
  readonly lifecycle: AgentLifecycle;
  readonly monitor: AgentMonitor;
  readonly treasury: Treasury;
  readonly ledger: PaymentLedger;

  private started = false;

  constructor(configOverrides?: Partial<LatticeConfig>) {
    this.config = { ...loadConfig(), ...configOverrides };
    this.registry = new AgentRegistry();
    this.deployer = new AgentDeployer(this.registry, this.config);
    this.lifecycle = new AgentLifecycle(this.registry);
    this.monitor = new AgentMonitor(this.registry, this.config);
    this.treasury = new Treasury(this.config, this.registry);
    this.ledger = new PaymentLedger();

    // Wire up ledger to registry x402 events
    this.registry.on((event) => {
      if (event.type === "x402:budget_warning") {
        log.warn(`Budget warning: agent ${event.agentId} at ${(event.utilization * 100).toFixed(0)}%`);
      }
      if (event.type === "x402:budget_exceeded") {
        log.error(`Budget exceeded: agent ${event.agentId}`);
      }
    });
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.started) return;

    log.info("Starting Lattice Control Plane...");
    log.info(`Max agents: ${this.config.maxAgents}`);
    log.info(`Heartbeat interval: ${this.config.heartbeatInterval}ms`);
    log.info(`Daily budget: $${this.config.dailyBudgetUsdc} USDC`);
    log.info(`Facilitator: ${this.config.facilitatorUrl}`);

    // Health check chains
    const health = await this.treasury.healthCheck();
    log.info(`Solana: ${health.solana.healthy ? "OK" : "FAIL"} (${health.solana.latencyMs}ms)`);
    log.info(`Base: ${health.base.healthy ? "OK" : "FAIL"} (${health.base.latencyMs}ms)`);

    // Start health monitor
    this.monitor.start();

    this.started = true;
    log.info("Lattice Control Plane started");
  }

  async stop(): Promise<void> {
    if (!this.started) return;

    log.info("Stopping Lattice Control Plane...");

    // Drain all running agents
    const running = this.registry.list({ status: "running" });
    for (const agent of running) {
      await this.lifecycle.stop(agent.id);
    }

    this.monitor.stop();
    this.started = false;
    log.info("Lattice Control Plane stopped");
  }

  // ─── Agent Operations ────────────────────────────────────────────────

  async deploy(options: AgentDeployOptions): Promise<DeployResult> {
    return this.deployer.deploy(options);
  }

  async start_agent(nameOrId: string): Promise<boolean> {
    const agent = this.resolveAgent(nameOrId);
    if (!agent) return false;
    return this.lifecycle.start(agent.id);
  }

  async stop_agent(nameOrId: string): Promise<boolean> {
    const agent = this.resolveAgent(nameOrId);
    if (!agent) return false;
    return this.lifecycle.stop(agent.id);
  }

  async drain_agent(nameOrId: string): Promise<boolean> {
    const agent = this.resolveAgent(nameOrId);
    if (!agent) return false;
    return this.lifecycle.drain(agent.id);
  }

  async restart_agent(nameOrId: string): Promise<boolean> {
    const agent = this.resolveAgent(nameOrId);
    if (!agent) return false;
    return this.lifecycle.restart(agent.id);
  }

  async delete_agent(nameOrId: string): Promise<boolean> {
    const agent = this.resolveAgent(nameOrId);
    if (!agent) return false;
    return this.deployer.undeploy(agent.id);
  }

  inspect(nameOrId: string): Agent | undefined {
    return this.resolveAgent(nameOrId);
  }

  list(filter?: { status?: string; chain?: string; type?: string }): Agent[] {
    return this.registry.list(filter as any);
  }

  // ─── Events ──────────────────────────────────────────────────────────

  on(handler: LatticeEventHandler): () => void {
    return this.registry.on(handler);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  private resolveAgent(nameOrId: string): Agent | undefined {
    return this.registry.get(nameOrId) ?? this.registry.getByName(nameOrId);
  }
}
