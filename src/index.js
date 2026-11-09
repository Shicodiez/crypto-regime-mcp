#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { createx402MCPClient } from "@x402/mcp";
import { privateKeyToAccount } from "viem/accounts";

import { createSpendTracker, usdcFromAtomic } from "./spend.js";

const VERSION = "0.1.3";
const DEFAULT_MCP_URL = "https://signal-api.shicoars.workers.dev/mcp";
const DEFAULT_NETWORK = "eip155:8453";
const DEFAULT_MAX_SPEND_USDC = 1;

function log(message) {
  // stdout is reserved for the MCP stdio protocol.
  console.error(`[crypto-regime-mcp] ${message}`);
}

function parseMaxSpend() {
  const raw = process.env.MAX_SPEND_USDC;
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_MAX_SPEND_USDC;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("MAX_SPEND_USDC must be a non-negative number");
  }
  return value;
}

function getPrivateKey() {
  const raw = process.env.EVM_PRIVATE_KEY?.trim();
  if (!raw || !/^0x[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("EVM_PRIVATE_KEY must be a 32-byte hex private key (0x...)");
  }
  return raw;
}

async function main() {
  const mcpUrl = process.env.SIGNAL_API_MCP_URL ?? DEFAULT_MCP_URL;
  const network = process.env.NETWORK ?? DEFAULT_NETWORK;
  const maxSpendUsdc = parseMaxSpend();
  const account = privateKeyToAccount(getPrivateKey());
  const tracker = createSpendTracker(maxSpendUsdc);

  const paymentClient = createx402MCPClient({
    name: "crypto-regime-mcp",
    version: VERSION,
    schemes: [
      {
        network,
        client: new ExactEvmScheme(account),
      },
    ],
    spendControls:
      maxSpendUsdc > 0
        ? { maxAmountPerPayment: `$${maxSpendUsdc}` }
        : false,
    autoPayment: true,
    onPaymentRequested: async ({ paymentRequired }) => {
      const accept = paymentRequired.accepts?.[0];
      if (!accept) {
        log("payment blocked: no accepts entry");
        return false;
      }
      const amountUsd = usdcFromAtomic(accept.amount);
      if (amountUsd === null) {
        log(`payment blocked: invalid amount ${accept.amount}`);
        return false;
      }
      if (!tracker.canSpend(amountUsd)) {
        log(
          `payment blocked: $${amountUsd} would exceed MAX_SPEND_USDC=$${maxSpendUsdc} (spent $${tracker.spentUsdc})`,
        );
        return false;
      }
      tracker.record(amountUsd);
      log(
        `authorizing $${amountUsd} on ${accept.network} to ${accept.payTo} (spent $${tracker.spentUsdc}/$${maxSpendUsdc})`,
      );
      return true;
    },
  });

  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
  await paymentClient.connect(transport);

  const server = new Server(
    { name: "crypto-regime-mcp", version: VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const result = await paymentClient.listTools();
    return { tools: result.tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await paymentClient.callTool(name, args ?? {});
      const meta = { ...(result._meta ?? {}) };
      if (result.paymentResponse) {
        meta["x402/payment-response"] = result.paymentResponse;
      }
      return {
        content: result.content,
        isError: result.isError,
        structuredContent: result.structuredContent,
        _meta: Object.keys(meta).length > 0 ? meta : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`tool ${name} failed: ${message}`);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  await server.connect(new StdioServerTransport());
  log(
    `connected to ${mcpUrl} as ${account.address}; MAX_SPEND_USDC=$${maxSpendUsdc}`,
  );
}

main().catch((error) => {
  log(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
