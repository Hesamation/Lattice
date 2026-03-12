/**
 * Lattice — Agent Lifecycle Manager
 *
 * Start, stop, restart, and drain agents.
 */

import type { AgentRegistry } from "./registry.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("lifecycle");

export class AgentLifecycle {
  constructor(private registry: AgentRegistry) {}

  async start(agentId: string): Promise<boolean> {
    const agent = this.registry.get(agentId);
    if (!agent) {
      log.warn(`Cannot start: agent ${agentId} not found`);
      return false;
    }
    if (agent.status === "running") {
      log.warn(`Agent ${agent.name} is already running`);
      return true;
    }
    if (agent.status !== "stopped" && agent.status !== "error") {
      log.warn(`Cannot start agent ${agent.name} in state: ${agent.status}`);
      return false;
    }

    log.info(`Starting agent: ${agent.name}`);
    this.registry.updateStatus(agentId, "deploying");

    // Simulate startup
    await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
    this.registry.updateStatus(agentId, "running");
    log.info(`Agent started: ${agent.name}`);
    return true;
  }

  async stop(agentId: string): Promise<boolean> {
    const agent = this.registry.get(agentId);
    if (!agent) {
      log.warn(`Cannot stop: agent ${agentId} not found`);
      return false;
    }
    if (agent.status !== "running" && agent.status !== "error") {
      log.warn(`Cannot stop agent ${agent.name} in state: ${agent.status}`);
      return false;
    }

    log.info(`Stopping agent: ${agent.name}`);
    this.registry.updateStatus(agentId, "stopped");
    return true;
  }

  async drain(agentId: string): Promise<boolean> {
    const agent = this.registry.get(agentId);
    if (!agent) return false;
    if (agent.status !== "running") return false;

    log.info(`Draining agent: ${agent.name} (finishing in-flight work)`);
    this.registry.updateStatus(agentId, "draining");

    // Simulate draining period
    await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000));
    this.registry.updateStatus(agentId, "stopped");
    log.info(`Agent drained and stopped: ${agent.name}`);
    return true;
  }

  async restart(agentId: string): Promise<boolean> {
    const agent = this.registry.get(agentId);
    if (!agent) return false;

    log.info(`Restarting agent: ${agent.name}`);

    if (agent.status === "running") {
      await this.stop(agentId);
    }

    return this.start(agentId);
  }
}
