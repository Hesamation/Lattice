#!/usr/bin/env bun
/**
 * Lattice CLI — Agent Control Plane
 *
 * Usage:
 *   lattice deploy --name <name> --type <type> --chain <chain>
 *   lattice ls [--status running] [--chain solana]
 *   lattice inspect <name|id>
 *   lattice start <name|id>
 *   lattice stop <name|id>
 *   lattice drain <name|id>
 *   lattice restart <name|id>
 *   lattice rm <name|id>
 *   lattice payments [--agent <name>] [--chain <chain>] [--limit 20]
 *   lattice treasury
 *   lattice health
 *   lattice sim --mode <full|mint|transfer|stress> --chain <solana|base|all>
 */

import { LatticeControlPlane } from "../src/control-plane.js";
import { AGENT_TYPES, CHAINS } from "../src/config/chains.js";
import type { AgentType, ChainId, Agent } from "../src/types/index.js";

// ─── Color Helpers ───────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function banner() {
  console.log(`
${C.cyan}╔══════════════════════════════════════════════╗
║  ${C.bold}LATTICE${C.reset}${C.cyan} — Agent Control Plane               ║
║  ${C.dim}x402 payments on Solana & Base${C.reset}${C.cyan}              ║
╚══════════════════════════════════════════════╝${C.reset}
`);
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    running: C.green,
    deploying: C.yellow,
    stopped: C.dim,
    error: C.red,
    draining: C.yellow,
  };
  return map[status] || C.reset;
}

function formatUptime(seconds: number): string {
  if (seconds > 86400) return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
  if (seconds > 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 60)}m`;
}

function printAgentTable(agents: Agent[]) {
  if (agents.length === 0) {
    console.log(`${C.dim}  No agents found${C.reset}\n`);
    return;
  }

  console.log(`  ${C.dim}${"NAME".padEnd(22)} ${"TYPE".padEnd(12)} ${"CHAIN".padEnd(8)} ${"STATUS".padEnd(12)} ${"UPTIME".padEnd(10)} ${"x402 TX".padEnd(10)} ${"SPENT".padEnd(10)}${C.reset}`);
  console.log(`  ${"─".repeat(90)}`);

  for (const a of agents) {
    const sc = statusColor(a.status);
    const typeInfo = AGENT_TYPES[a.type as keyof typeof AGENT_TYPES];
    console.log(
      `  ${a.name.padEnd(22)} ${(typeInfo?.label ?? a.type).padEnd(12)} ` +
      `${a.chain.padEnd(8)} ${sc}${a.status.padEnd(12)}${C.reset} ` +
      `${formatUptime(a.uptime).padEnd(10)} ` +
      `${String(a.x402.totalTransactions).padEnd(10)} ` +
      `$${a.x402.totalSpentUsdc.toFixed(2).padEnd(10)}`
    );
  }
  console.log("");
}

// ─── Arg Parsing ─────────────────────────────────────────────────────────────

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx === process.argv.length - 1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function main() {
  const command = process.argv[2];

  if (!command || command === "--help" || command === "-h") {
    banner();
    console.log(`${C.bold}Usage:${C.reset} lattice <command> [options]\n`);
    console.log(`${C.bold}Commands:${C.reset}`);
    console.log(`  deploy      Deploy a new agent`);
    console.log(`  ls          List all agents`);
    console.log(`  inspect     Show agent detail`);
    console.log(`  start       Start a stopped agent`);
    console.log(`  stop        Stop a running agent`);
    console.log(`  drain       Drain agent gracefully`);
    console.log(`  restart     Restart an agent`);
    console.log(`  rm          Delete an agent`);
    console.log(`  payments    View x402 payment history`);
    console.log(`  treasury    View wallet balances`);
    console.log(`  health      Fleet health summary`);
    console.log(`  sim         Run simulations`);
    console.log("");
    process.exit(0);
  }

  const lattice = new LatticeControlPlane();

  switch (command) {
    case "deploy": {
      const name = getArg("--name");
      const type = getArg("--type") as AgentType | undefined;
      const chain = getArg("--chain") as ChainId | undefined;

      if (!name) { console.error(`${C.red}Error: --name is required${C.reset}`); process.exit(1); }
      if (!type) { console.error(`${C.red}Error: --type is required (${Object.keys(AGENT_TYPES).join(", ")})${C.reset}`); process.exit(1); }
      if (!chain) { console.error(`${C.red}Error: --chain is required (solana, base)${C.reset}`); process.exit(1); }

      banner();
      console.log(`${C.cyan}Deploying agent: ${C.bold}${name}${C.reset}`);
      console.log(`  Type:  ${type}`);
      console.log(`  Chain: ${chain}`);
      console.log(`  Wallet: ${CHAINS[chain].wallet}\n`);

      const result = await lattice.deploy({ name, type, chain });

      if (result.success) {
        console.log(`${C.green}✓ Agent deployed: ${result.agent!.name} (${result.agent!.id})${C.reset}\n`);
      } else {
        console.error(`${C.red}✗ Deployment failed: ${result.error}${C.reset}\n`);
        process.exit(1);
      }
      break;
    }

    case "ls": {
      banner();
      const filter: Record<string, string> = {};
      if (getArg("--status")) filter.status = getArg("--status")!;
      if (getArg("--chain")) filter.chain = getArg("--chain")!;
      if (getArg("--type")) filter.type = getArg("--type")!;

      const agents = lattice.list(filter);
      console.log(`${C.bold}Agents (${agents.length})${C.reset}\n`);
      printAgentTable(agents);
      break;
    }

    case "inspect": {
      const nameOrId = process.argv[3];
      if (!nameOrId) { console.error(`${C.red}Error: specify agent name or ID${C.reset}`); process.exit(1); }

      const agent = lattice.inspect(nameOrId);
      if (!agent) { console.error(`${C.red}Agent not found: ${nameOrId}${C.reset}`); process.exit(1); }

      banner();
      console.log(`${C.bold}Agent: ${agent.name}${C.reset}`);
      console.log(`  ID:      ${agent.id}`);
      console.log(`  Type:    ${agent.type}`);
      console.log(`  Chain:   ${agent.chain}`);
      console.log(`  Status:  ${statusColor(agent.status)}${agent.status}${C.reset}`);
      console.log(`  Uptime:  ${formatUptime(agent.uptime)}`);
      console.log(`  CPU:     ${agent.metrics.cpu}%`);
      console.log(`  Memory:  ${agent.metrics.memory}%`);
      console.log(`  x402 Tx: ${agent.x402.totalTransactions}`);
      console.log(`  Spent:   $${agent.x402.totalSpentUsdc.toFixed(4)} USDC`);
      console.log(`  Budget:  $${agent.x402.dailySpentUsdc.toFixed(2)} / $${agent.x402.dailyBudgetUsdc.toFixed(2)} today`);
      console.log("");
      break;
    }

    case "start": {
      const target = process.argv[3];
      if (!target) { console.error(`${C.red}Error: specify agent name or ID${C.reset}`); process.exit(1); }
      const ok = await lattice.start_agent(target);
      console.log(ok ? `${C.green}✓ Agent started: ${target}${C.reset}` : `${C.red}✗ Failed to start: ${target}${C.reset}`);
      break;
    }

    case "stop": {
      const target = process.argv[3];
      if (!target) { console.error(`${C.red}Error: specify agent name or ID${C.reset}`); process.exit(1); }
      const ok = await lattice.stop_agent(target);
      console.log(ok ? `${C.green}✓ Agent stopped: ${target}${C.reset}` : `${C.red}✗ Failed to stop: ${target}${C.reset}`);
      break;
    }

    case "drain": {
      const target = process.argv[3];
      if (!target) { console.error(`${C.red}Error: specify agent name or ID${C.reset}`); process.exit(1); }
      console.log(`${C.yellow}Draining agent: ${target} (finishing in-flight work)...${C.reset}`);
      const ok = await lattice.drain_agent(target);
      console.log(ok ? `${C.green}✓ Agent drained and stopped${C.reset}` : `${C.red}✗ Failed to drain${C.reset}`);
      break;
    }

    case "restart": {
      const target = process.argv[3];
      if (!target) { console.error(`${C.red}Error: specify agent name or ID${C.reset}`); process.exit(1); }
      console.log(`${C.yellow}Restarting agent: ${target}...${C.reset}`);
      const ok = await lattice.restart_agent(target);
      console.log(ok ? `${C.green}✓ Agent restarted${C.reset}` : `${C.red}✗ Failed to restart${C.reset}`);
      break;
    }

    case "rm": {
      const target = process.argv[3];
      if (!target) { console.error(`${C.red}Error: specify agent name or ID${C.reset}`); process.exit(1); }
      const ok = await lattice.delete_agent(target);
      console.log(ok ? `${C.green}✓ Agent deleted: ${target}${C.reset}` : `${C.red}✗ Failed to delete: ${target}${C.reset}`);
      break;
    }

    case "treasury": {
      banner();
      console.log(`${C.bold}Treasury${C.reset}\n`);
      const report = await lattice.treasury.getReport();
      for (const w of report.wallets) {
        console.log(`  ${C.cyan}${w.chain.toUpperCase()}${C.reset}`);
        console.log(`    Address: ${w.address}`);
        console.log(`    Native:  ${w.nativeBalance.toFixed(6)} ${w.nativeSymbol}`);
        console.log(`    USDC:    $${w.usdcBalance.toFixed(2)}`);
        console.log("");
      }
      console.log(`  Total USDC:  $${report.totalUsdcBalance.toFixed(2)}`);
      console.log(`  Daily Spend: $${report.dailySpend.toFixed(2)} / $${report.dailyBudget.toFixed(2)}`);
      console.log(`  Utilization: ${(report.budgetUtilization * 100).toFixed(1)}%\n`);
      break;
    }

    case "health": {
      banner();
      console.log(`${C.bold}Fleet Health${C.reset}\n`);
      await lattice.start();
      const agents = lattice.list();
      const running = agents.filter(a => a.status === "running").length;
      const errored = agents.filter(a => a.status === "error").length;
      console.log(`  Total agents:   ${agents.length}`);
      console.log(`  Running:        ${C.green}${running}${C.reset}`);
      console.log(`  Errored:        ${errored > 0 ? C.red : C.dim}${errored}${C.reset}`);
      console.log(`  Stopped:        ${agents.length - running - errored}`);

      const health = await lattice.treasury.healthCheck();
      console.log(`\n  Solana RPC:     ${health.solana.healthy ? C.green + "OK" : C.red + "FAIL"}${C.reset} (${health.solana.latencyMs}ms)`);
      console.log(`  Base RPC:       ${health.base.healthy ? C.green + "OK" : C.red + "FAIL"}${C.reset} (${health.base.latencyMs}ms)\n`);

      await lattice.stop();
      break;
    }

    case "payments": {
      banner();
      console.log(`${C.bold}x402 Payment History${C.reset}\n`);
      const summary = lattice.ledger.summary();
      console.log(`  Total:    ${summary.totalTransactions}`);
      console.log(`  Settled:  ${C.green}${summary.settledTransactions}${C.reset}`);
      console.log(`  Failed:   ${summary.failedTransactions > 0 ? C.red : C.dim}${summary.failedTransactions}${C.reset}`);
      console.log(`  Volume:   $${summary.totalVolumeUsdc.toFixed(4)} USDC`);
      console.log(`  Avg lat:  ${summary.avgLatencyMs}ms\n`);
      break;
    }

    default:
      console.error(`${C.red}Unknown command: ${command}${C.reset}`);
      console.log(`Run 'lattice --help' for usage\n`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`${C.red}Fatal: ${err.message}${C.reset}`);
  process.exit(2);
});
