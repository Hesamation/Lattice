/**
 * Lattice — ID Generation
 */

import * as crypto from "crypto";

export function generateId(length = 8): string {
  return crypto.randomBytes(length).toString("hex").slice(0, length);
}

export function generateAgentId(): string {
  return `ag-${generateId(8)}`;
}

export function generateTransactionId(): string {
  return `tx-${generateId(12)}`;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
