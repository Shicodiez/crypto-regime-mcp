import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MAX_SPEND_USDC,
  getPrivateKey,
  parseMaxSpend,
  resolveApiBaseUrl,
  resolveSignalApiKey,
} from "../src/config.js";

test("detects credit mode from SIGNAL_API_KEY", () => {
  assert.equal(resolveSignalApiKey({ SIGNAL_API_KEY: " sk_test " }), "sk_test");
  assert.equal(resolveSignalApiKey({ SIGNAL_API_KEY: "   " }), null);
  assert.equal(resolveSignalApiKey({}), null);
});

test("derives the REST base URL from the MCP URL or SIGNAL_API_URL", () => {
  assert.equal(
    resolveApiBaseUrl({}, "https://signal-api.example/mcp"),
    "https://signal-api.example",
  );
  assert.equal(
    resolveApiBaseUrl({ SIGNAL_API_URL: " http://localhost:8787 " }, "https://ignored"),
    "http://localhost:8787",
  );
  assert.equal(
    resolveApiBaseUrl({}, "not a url"),
    "https://signal-api.shicoars.workers.dev",
  );
});

test("parses the x402 session cap", () => {
  assert.equal(parseMaxSpend(undefined), DEFAULT_MAX_SPEND_USDC);
  assert.equal(parseMaxSpend(""), DEFAULT_MAX_SPEND_USDC);
  assert.equal(parseMaxSpend(" 2 "), 2);
  assert.equal(parseMaxSpend("0"), 0);
  assert.throws(() => parseMaxSpend("-1"), /non-negative/);
  assert.throws(() => parseMaxSpend("nope"), /non-negative/);
});

test("validates the EVM private key only when x402 mode is used", () => {
  const key = `0x${"11".repeat(32)}`;
  assert.equal(getPrivateKey({ EVM_PRIVATE_KEY: key }), key);
  assert.throws(() => getPrivateKey({}), /SIGNAL_API_KEY/);
  assert.throws(
    () => getPrivateKey({ EVM_PRIVATE_KEY: "0x1234" }),
    /32-byte hex/,
  );
});
