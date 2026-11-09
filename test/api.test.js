import assert from "node:assert/strict";
import test from "node:test";

import {
  API_KEY_TOOL_DEFINITIONS,
  createSignalApiClient,
  isApiKeyTool,
  resolveApiPath,
} from "../src/api.js";

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

function fakeFetch(responder) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    return responder(String(url), init);
  };
  return { impl, calls };
}

function clientWith(responder) {
  const fake = fakeFetch(responder);
  const client = createSignalApiClient({
    baseUrl: "https://api.example",
    apiKey: "sk_test_key",
    fetchImpl: fake.impl,
  });
  return { client, calls: fake.calls };
}

test("paid tools call /v1 routes with X-API-Key and no x402 headers", async () => {
  const { client, calls } = clientWith(() =>
    jsonResponse(
      { signal: "LONG" },
      200,
      {
        "X-Credits-Charged": "1",
        "X-Credits-Balance": "1999",
      },
    ),
  );

  const result = await client.callTool("get_trend", { asset: "BTC" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.example/v1/trend/BTC");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers["X-API-Key"], "sk_test_key");
  assert.equal(calls[0].init.headers["PAYMENT-SIGNATURE"], undefined);
  assert.equal(calls[0].init.headers["X-PAYMENT"], undefined);
  assert.equal(result.isError, undefined);
  assert.deepEqual(JSON.parse(result.content[0].text), { signal: "LONG" });
  assert.deepEqual(result._meta["signal-api/credits"], {
    charged: 1,
    balance: 1999,
  });
});

test("maps every credit-mode tool to the expected REST route", async () => {
  const { client, calls } = clientWith(() => jsonResponse({ ok: true }));

  const cases = [
    ["get_signal", {}, "/v1/signal"],
    ["get_market_scan", {}, "/v1/market-scan"],
    ["get_trend", { asset: "eth" }, "/v1/trend/eth"],
    ["get_regime", { asset: "SOL" }, "/v1/regime/SOL"],
    ["get_indicators", { asset: "trend-btc" }, "/v1/indicators/trend-btc"],
    ["get_sample", { asset: "BTC" }, "/free/BTC"],
    ["get_credit_balance", {}, "/credits/balance"],
  ];

  for (const [name, args, path] of cases) {
    assert.equal(isApiKeyTool(name), true);
    const result = await client.callTool(name, args);
    assert.equal(result.isError, undefined);
  }

  assert.deepEqual(
    calls.map((call) => call.url),
    cases.map(([, , path]) => `https://api.example${path}`),
  );
});

test("rejects asset tools without an asset argument before calling the API", async () => {
  const { client, calls } = clientWith(() => jsonResponse({ ok: true }));

  const result = await client.callTool("get_trend", {});

  assert.equal(calls.length, 0);
  assert.equal(result.isError, true);
  assert.match(JSON.parse(result.content[0].text).error, /asset/);
});

test("returns API errors as MCP error results", async () => {
  const { client } = clientWith(() =>
    jsonResponse({ error: "Insufficient credits", balance: 5, required: 10 }, 402, {
      "X-Credits-Balance": "5",
    }),
  );

  const result = await client.callTool("get_market_scan");

  assert.equal(result.isError, true);
  assert.deepEqual(JSON.parse(result.content[0].text), {
    error: "Insufficient credits",
    balance: 5,
    required: 10,
  });
  assert.deepEqual(result._meta["signal-api/credits"], { balance: 5 });
});

test("keeps trailing slashes and base paths valid", async () => {
  const fake = fakeFetch(() => jsonResponse({ ok: true }));
  const client = createSignalApiClient({
    baseUrl: "https://api.example/gateway/",
    apiKey: "sk_test_key",
    fetchImpl: fake.impl,
  });

  await client.callTool("get_signal");

  assert.equal(fake.calls[0].url, "https://api.example/gateway/v1/signal");
});

test("resolves paths without side effects", () => {
  assert.deepEqual(resolveApiPath("get_signal"), { path: "/v1/signal" });
  assert.deepEqual(resolveApiPath("get_sample", { asset: "ETH" }), {
    path: "/free/ETH",
  });
  assert.deepEqual(resolveApiPath("get_credit_balance"), {
    path: "/credits/balance",
  });
  assert.equal(resolveApiPath("list_assets"), null);
});

test("exposes get_market_scan, get_sample and get_credit_balance definitions", () => {
  const tools = new Map(
    API_KEY_TOOL_DEFINITIONS.map((tool) => [tool.name, tool]),
  );

  assert.equal(tools.has("get_market_scan"), true);
  assert.equal(tools.has("get_sample"), true);
  assert.equal(tools.has("get_credit_balance"), true);
  assert.equal(tools.get("get_market_scan").inputSchema.type, "object");
  assert.deepEqual(tools.get("get_sample").inputSchema.required, ["asset"]);
  assert.deepEqual(tools.get("get_credit_balance").inputSchema.properties, {});
});
