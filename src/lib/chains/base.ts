/**
 * Lattice — Base (EVM) Chain Adapter
 */

import { jsonRpc, timedRpc } from "../utils/rpc.js";
import { createLogger } from "../utils/logger.js";
import type { ChainConfig, WalletBalance } from "../../types/index.js";

const log = createLogger("base");

// Minimal ERC-20 ABI fragments (function selectors)
const ERC20_BALANCE_OF = "0x70a08231"; // balanceOf(address)

function encodeAddress(address: string): string {
  return address.toLowerCase().replace("0x", "").padStart(64, "0");
}

export class BaseAdapter {
  constructor(private config: ChainConfig) {}

  get rpcUrl(): string {
    return this.config.rpcUrl;
  }

  async getBalance(): Promise<WalletBalance> {
    const balanceHex = await jsonRpc<string>(
      this.rpcUrl,
      "eth_getBalance",
      [this.config.wallet, "latest"]
    );

    // Fetch USDC balance via balanceOf call
    let usdcBalance = 0;
    try {
      const data = ERC20_BALANCE_OF + encodeAddress(this.config.wallet);
      const usdcHex = await jsonRpc<string>(this.rpcUrl, "eth_call", [
        { to: this.config.usdcAddress, data },
        "latest",
      ]);
      usdcBalance = Number(BigInt(usdcHex)) / 1e6; // USDC has 6 decimals
    } catch (err) {
      log.warn("Failed to fetch USDC balance", err);
    }

    return {
      chain: "base",
      address: this.config.wallet,
      nativeBalance: Number(BigInt(balanceHex)) / 1e18,
      nativeSymbol: "ETH",
      usdcBalance,
    };
  }

  async getGasPrice(): Promise<{ gasPriceGwei: number; gasPriceWei: bigint }> {
    const hex = await jsonRpc<string>(this.rpcUrl, "eth_gasPrice", []);
    const wei = BigInt(hex);
    return { gasPriceGwei: Number(wei) / 1e9, gasPriceWei: wei };
  }

  async getBlockNumber(): Promise<number> {
    const hex = await jsonRpc<string>(this.rpcUrl, "eth_blockNumber", []);
    return parseInt(hex, 16);
  }

  async getChainId(): Promise<number> {
    const hex = await jsonRpc<string>(this.rpcUrl, "eth_chainId", []);
    return parseInt(hex, 16);
  }

  async getNonce(): Promise<number> {
    const hex = await jsonRpc<string>(
      this.rpcUrl,
      "eth_getTransactionCount",
      [this.config.wallet, "latest"]
    );
    return parseInt(hex, 16);
  }

  async estimateGas(tx: { from: string; to?: string; data?: string; value?: string }): Promise<number> {
    const hex = await jsonRpc<string>(this.rpcUrl, "eth_estimateGas", [tx]);
    return parseInt(hex, 16);
  }

  async getEip1559Fees(): Promise<{
    baseFeeGwei: number;
    maxPriorityFeeGwei: number;
    maxFeeGwei: number;
  }> {
    try {
      const block = await jsonRpc<{ baseFeePerGas: string }>(
        this.rpcUrl,
        "eth_getBlockByNumber",
        ["latest", false]
      );
      const priorityFee = await jsonRpc<string>(this.rpcUrl, "eth_maxPriorityFeePerGas", []);

      const baseFee = BigInt(block.baseFeePerGas);
      const priority = BigInt(priorityFee);
      const maxFee = baseFee * 2n + priority;

      return {
        baseFeeGwei: Number(baseFee) / 1e9,
        maxPriorityFeeGwei: Number(priority) / 1e9,
        maxFeeGwei: Number(maxFee) / 1e9,
      };
    } catch {
      const gas = await this.getGasPrice();
      return {
        baseFeeGwei: gas.gasPriceGwei,
        maxPriorityFeeGwei: 1.5,
        maxFeeGwei: gas.gasPriceGwei * 2,
      };
    }
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    chainId: number;
    blockNumber: number;
    balanceEth: number;
    gasPriceGwei: number;
    latencyMs: number;
  }> {
    try {
      const { result: blockHex, durationMs } = await timedRpc<string>(
        this.rpcUrl,
        "eth_blockNumber",
        []
      );
      const chainId = await this.getChainId();
      const balance = await this.getBalance();
      const gas = await this.getGasPrice();

      return {
        healthy: true,
        chainId,
        blockNumber: parseInt(blockHex, 16),
        balanceEth: balance.nativeBalance,
        gasPriceGwei: gas.gasPriceGwei,
        latencyMs: durationMs,
      };
    } catch (err: any) {
      log.error("Health check failed", err.message);
      return { healthy: false, chainId: 0, blockNumber: 0, balanceEth: 0, gasPriceGwei: 0, latencyMs: 0 };
    }
  }
}
