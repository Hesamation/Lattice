/**
 * Lattice — JSON-RPC Transport
 */

let rpcIdCounter = 0;

export interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface RpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: RpcError;
}

export async function jsonRpc<T = unknown>(
  url: string,
  method: string,
  params: unknown[],
  timeoutMs = 30000
): Promise<T> {
  const id = ++rpcIdCounter;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`RPC HTTP ${res.status}: ${res.statusText}`);
    }

    const json = (await res.json()) as RpcResponse<T>;

    if (json.error) {
      throw new Error(`RPC Error ${json.error.code}: ${json.error.message}`);
    }

    return json.result as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function timedRpc<T = unknown>(
  url: string,
  method: string,
  params: unknown[],
  timeoutMs = 30000
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await jsonRpc<T>(url, method, params, timeoutMs);
  return { result, durationMs: Math.round(performance.now() - start) };
}
