/**
 * Lattice — Agent Deployer
 *
 * Handles the deploy → running transition, including validation,
 * resource provisioning, and x402 payment configuration.
 */

import type { AgentDeployOptions, LatticeConfig, Agent } from "../../types/index.js";
import type { AgentRegistry } from "./registry.js";
import { createLogger } from "../utils/logger.js";
import { slugify } from "../utils/id.js";

const log = createLogger("deployer");

export interface DeployResult {
  success: boolean;
  agent?: Agent;
  error?: string;
}

export class AgentDeployer {
  constructor(
    private registry: AgentRegistry,
    private config: LatticeConfig
  ) {}

  async deploy(options: AgentDeployOptions): Promise<DeployResult> {
    // ─── Validate ────────────────────────────────────────────────────

    const name = slugify(options.name);
    if (name.length < 3) {
      return { success: false, error: "Agent name must be at least 3 characters" };
    }

    if (this.registry.getByName(name)) {
      return { success: false, error: `Agent "${name}" already exists` };
    }

    if (this.registry.count() >= this.config.maxAgents) {
      return { success: false, error: `Maximum agent limit reached (${this.config.maxAgents})` };
    }

    const chainConfig = this.config.chains[options.chain];
    if (!chainConfig) {
      return { success: false, error: `Unknown chain: ${options.chain}` };
    }

    // ─── Register ────────────────────────────────────────────────────

    log.info(`Deploying agent: ${name} (${options.type}) on ${options.chain}`);

    const agent = this.registry.register({
      ...options,
      name,
      dailyBudgetUsdc: options.dailyBudgetUsdc ?? this.config.dailyBudgetUsdc,
    });

    // ─── Provision (simulate async deployment) ───────────────────────

    try {
      await this.provision(agent);
      this.registry.updateStatus(agent.id, "running");
      log.info(`Agent deployed successfully: ${agent.name} (${agent.id})`);
      return { success: true, agent };
    } catch (err: any) {
      this.registry.updateStatus(agent.id, "error");
      log.error(`Deployment failed for ${agent.name}: ${err.message}`);
      return { success: false, agent, error: err.message };
    }
  }

  private async provision(agent: Agent): Promise<void> {
    // In production, this would:
    // 1. Spin up a container/process for the agent
    // 2. Configure its x402 payment client
    // 3. Register health check endpoints
    // 4. Set up logging pipelines

    // Simulate provisioning time based on agent type
    const provisionTimes: Record<string, number> = {
      llm: 3000,
      trading: 2000,
      data: 4000,
      mcp: 2500,
      monitor: 1500,
      custom: 3000,
    };

    const delay = provisionTimes[agent.type] ?? 3000;
    await new Promise((resolve) => setTimeout(resolve, delay + Math.random() * 1000));

    // Simulate occasional deployment failures (5% rate)
    if (Math.random() < 0.05) {
      throw new Error("Provisioning failed: resource allocation timeout");
    }
  }

  async undeploy(agentId: string): Promise<boolean> {
    const agent = this.registry.get(agentId);
    if (!agent) {
      log.warn(`Cannot undeploy: agent ${agentId} not found`);
      return false;
    }

    log.info(`Undeploying agent: ${agent.name}`);

    // If running, stop first
    if (agent.status === "running") {
      this.registry.updateStatus(agentId, "draining");
      // Wait for in-flight requests to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));
      this.registry.updateStatus(agentId, "stopped");
    }

    return this.registry.delete(agentId);
  }
}
