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

import {
  API_KEY_TOOL_DEFINITIONS,
  createSignalApiClient,
  isApiKeyTool,
} from "./api.js";
import {
  DEFAULT_MCP_URL,
  DEFAULT_NETWORK,
  getPrivateKey,
  parseMaxSpend,
  resolveApiBaseUrl,
  resolveSignalApiKey,
} from "./config.js";
import { createSpendTracker, usdcFromAtomic } from "./spend.js";

const VERSION = "0.1.4";

function log(message) {
  // stdout is reserved for the MCP stdio protocol.
  console.error(`[crypto-regime-mcp] ${message}`);
}

async function main() {
  const env = process.env;
  const mcpUrl = env.SIGNAL_API_MCP_URL ?? DEFAULT_MCP_URL;
  const apiKey = resolveSignalApiKey(env);
  const apiBaseUrl = resolveApiBaseUrl(env, mcpUrl);
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));

  let client;
  let apiClient = null;
  let account = null;
  let maxSpendUsdc = null;

  if (apiKey) {
    client = new Client({ name: "crypto-regime-mcp", version: VERSION });
    await client.connect(transport);
    apiClient = createSignalApiClient({ baseUrl: apiBaseUrl, apiKey });
  } else {
    const network = env.NETWORK ?? DEFAULT_NETWORK;
    maxSpendUsdc = parseMaxSpend(env.MAX_SPEND_USDC);
    account = privateKeyToAccount(getPrivateKey(env));
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

    await paymentClient.connect(transport);
    client = paymentClient;
  }

  const server = new Server(
    { name: "crypto-regime-mcp", version: VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const result = await client.listTools();
    if (!apiClient) {
      return { tools: result.tools };
    }

    const tools = new Map(result.tools.map((tool) => [tool.name, tool]));
    for (const tool of API_KEY_TOOL_DEFINITIONS) {
      tools.set(tool.name, tool);
    }
    return { tools: [...tools.values()] };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      if (apiClient && isApiKeyTool(name)) {
        return await apiClient.callTool(name, args ?? {});
      }

      const result = await client.callTool(name, args ?? {});
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
  if (apiClient) {
    log(
      `connected to ${mcpUrl} in credit mode via ${apiBaseUrl}; SIGNAL_API_KEY is set, paid tools use /v1/* without x402`,
    );
  } else {
    log(
      `connected to ${mcpUrl} as ${account.address}; MAX_SPEND_USDC=$${maxSpendUsdc}`,
    );
  }
}

main().catch((error) => {
  log(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
