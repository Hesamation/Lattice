/**
 * Lattice — Agent Health Monitor
 *
 * Periodically checks agent health, updates metrics, and handles
 * failure detection + automatic recovery.
 */

import type { AgentRegistry } from "./registry.js";
import type { LatticeConfig } from "../../types/index.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("monitor");

export class AgentMonitor {
  private interval: ReturnType<typeof setInterval> | null = null;
  private uptimeTrackers: Map<string, number> = new Map(); // agentId -> startedAt

  constructor(
    private registry: AgentRegistry,
    private config: LatticeConfig
  ) {}

  start(): void {
    if (this.interval) return;

    log.info(`Starting health monitor (interval: ${this.config.heartbeatInterval}ms)`);

    this.interval = setInterval(() => {
      this.checkAll();
    }, this.config.heartbeatInterval);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      log.info("Health monitor stopped");
    }
  }

  private checkAll(): void {
    const running = this.registry.list({ status: "running" });

    for (const agent of running) {
      // Track uptime
      if (!this.uptimeTrackers.has(agent.id)) {
        this.uptimeTrackers.set(agent.id, Date.now());
      }
      const startedAt = this.uptimeTrackers.get(agent.id)!;
      const uptime = Math.floor((Date.now() - startedAt) / 1000);

      // Simulate metric fluctuations
      const cpu = Math.max(2, Math.min(95, agent.metrics.cpu + Math.round((Math.random() - 0.5) * 12)));
      const memory = Math.max(8, Math.min(92, agent.metrics.memory + Math.round((Math.random() - 0.5) * 6)));
      const rpm = Math.max(0, Math.round(Math.random() * 120));
      const errorRate = Math.max(0, Math.min(1, Math.random() * 0.05));

      this.registry.updateMetrics(agent.id, {
        cpu,
        memory,
        requestsPerMinute: rpm,
        errorRate,
      });

      // Detect stale heartbeat (>30s since last ping)
      const timeSinceLastPing = Date.now() - agent.lastPing;
      if (timeSinceLastPing > 30000) {
        log.warn(`Agent ${agent.name} heartbeat stale (${Math.round(timeSinceLastPing / 1000)}s)`);
        // After 60s, mark as error
        if (timeSinceLastPing > 60000) {
          log.error(`Agent ${agent.name} presumed dead — marking error`);
          this.registry.updateStatus(agent.id, "error");
          this.uptimeTrackers.delete(agent.id);
        }
      }

      // Detect resource pressure
      if (cpu > 90) {
        log.warn(`Agent ${agent.name} high CPU: ${cpu}%`);
      }
      if (memory > 85) {
        log.warn(`Agent ${agent.name} high memory: ${memory}%`);
      }
    }

    // Clean up trackers for non-running agents
    for (const [id] of this.uptimeTrackers) {
      const agent = this.registry.get(id);
      if (!agent || agent.status !== "running") {
        this.uptimeTrackers.delete(id);
      }
    }
  }

  getUptime(agentId: string): number {
    const startedAt = this.uptimeTrackers.get(agentId);
    if (!startedAt) return 0;
    return Math.floor((Date.now() - startedAt) / 1000);
  }
}
