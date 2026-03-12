/**
 * Lattice — Structured Logger
 */

import type { Logger, LogLevel } from "../../types/index.js";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: COLORS.dim,
  info: COLORS.cyan,
  warn: COLORS.yellow,
  error: COLORS.red,
};

export function createLogger(scope: string, minLevel: LogLevel = "info"): Logger {
  const minPriority = LEVEL_PRIORITY[minLevel];

  function log(level: LogLevel, msg: string, data?: unknown): void {
    if (LEVEL_PRIORITY[level] < minPriority) return;

    const time = new Date().toISOString().slice(11, 23);
    const color = LEVEL_COLORS[level];
    const tag = level.toUpperCase().padEnd(5);
    const prefix = `${COLORS.dim}${time}${COLORS.reset} ${color}${tag}${COLORS.reset} ${COLORS.magenta}[${scope}]${COLORS.reset}`;

    console.log(`${prefix} ${msg}`);
    if (data !== undefined) {
      console.log(`${COLORS.dim}${JSON.stringify(data, null, 2)}${COLORS.reset}`);
    }
  }

  return {
    debug: (msg, data?) => log("debug", msg, data),
    info: (msg, data?) => log("info", msg, data),
    warn: (msg, data?) => log("warn", msg, data),
    error: (msg, data?) => log("error", msg, data),
  };
}
