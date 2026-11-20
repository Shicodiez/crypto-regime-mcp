import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const upstreamTools = [
  "list_assets",
  "get_catalog",
  "get_sample",
  "get_signal",
  "get_market_scan",
  "get_trend",
  "get_regime",
  "get_regime_stats",
  "get_indicators",
  "get_derivatives",
  "get_derivatives_scan",
].map((name) => ({
  name,
  description: `${name} description.`,
  inputSchema: { type: "object" },
}));

const catalogProducts = [
  { id: "signal", price: "$0.01", priceUsdc: 0.01 },
  { id: "market-scan", price: "$0.05", priceUsdc: 0.05 },
  { id: "trend-btc", price: "$0.005", priceUsdc: 0.005 },
  { id: "regime-btc", price: "$0.005", priceUsdc: 0.005 },
  { id: "indicators-btc", price: "$0.005", priceUsdc: 0.005 },
  { id: "regime-stats-btc", price: "$0.02", priceUsdc: 0.02 },
  { id: "derivatives-btc", price: "$0.005", priceUsdc: 0.005 },
  { id: "derivatives-scan", price: "$0.05", priceUsdc: 0.05 },
];

function startMockServer({ products = catalogProducts } = {}) {
  const server = http.createServer((req, res) => {
    if (req.method === "GET") {
      const pathname = new URL(req.url, "http://127.0.0.1").pathname;
      if (pathname === "/catalog") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            generated_at: "2026-01-01T00:00:00Z",
            products,
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end();
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }

    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const payload = JSON.parse(raw);
      const messages = Array.isArray(payload) ? payload : [payload];
      const responses = [];

      for (const message of messages) {
        if (message.method === "initialize") {
          responses.push({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              protocolVersion: "2025-06-18",
              capabilities: { tools: {} },
              serverInfo: { name: "mock-docs", version: "0" },
            },
          });
        } else if (message.method === "tools/list") {
          responses.push({
            jsonrpc: "2.0",
            id: message.id,
            result: { tools: upstreamTools },
          });
        }
      }

      if (responses.length === 0) {
        res.writeHead(202);
        res.end();
        return;
      }

      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(responses.length === 1 ? responses[0] : responses));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const origin = `http://127.0.0.1:${server.address().port}`;
      resolve({
        server,
        origin,
        url: `${origin}/mcp`,
      });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function makeTempCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crypto-regime-docs-"));
  const files = {};
  for (const name of ["README.md", "server.json", "package.json"]) {
    const target = path.join(dir, name);
    fs.copyFileSync(path.join(repoRoot, name), target);
    files[name] = target;
  }
  return { dir, files };
}

function runDocs(mock, files, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      SIGNAL_API_MCP_URL: mock.url,
      SIGNAL_API_URL: mock.origin,
      SIGNAL_API_KEY: "sk_should_not_reach_the_bridge",
      EVM_PRIVATE_KEY: `0x${"11".repeat(32)}`,
    };
    const args = [
      "scripts/gen-docs.mjs",
      "--readme",
      files["README.md"],
      "--server",
      files["server.json"],
      "--package",
      files["package.json"],
      ...extraArgs,
    ];
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`gen-docs timed out; stderr=${stderr}`));
    }, 20000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

test("docs merges both tool modes and writes 12 tools with prices", async () => {
  const mock = await startMockServer();
  const temp = makeTempCopy();
  try {
    const write = await runDocs(mock, temp.files, []);
    assert.equal(write.code, 0, write.stderr);

    const readme = fs.readFileSync(temp.files["README.md"], "utf8");
    assert.match(readme, /\*\*12 tools\*\*/);
    assert.match(readme, /\| `get_signal` \|.*\| \$0\.01 \| 1 \|/);
    assert.match(readme, /\| `get_market_scan` \|.*\| \$0\.05 \| 10 \|/);
    assert.match(readme, /\| `get_regime_stats` \|.*\| \$0\.02 \| 4 \|/);
    assert.match(readme, /\| `get_derivatives_scan` \|.*\| \$0\.05 \| 10 \|/);
    assert.match(readme, /\| `get_sample` \|.*\| free \| free \|/);
    assert.match(
      readme,
      /\| `get_credit_balance` \|.*\(credit-key mode only\) \| free \| free \|/,
    );
    assert.equal(
      (readme.match(/credit-key mode only/g) ?? []).length,
      1,
    );

    const paidTools = [
      "get_signal",
      "get_market_scan",
      "get_trend",
      "get_regime",
      "get_indicators",
      "get_regime_stats",
      "get_derivatives",
      "get_derivatives_scan",
    ];
    for (const name of paidTools) {
      const row = readme
        .split("\n")
        .find((line) => line.startsWith(`| \`${name}\` |`));
      assert.ok(row, `missing README row for ${name}`);
      const cells = row.split("|").map((cell) => cell.trim());
      assert.notEqual(cells[3], "free", `missing x402 price for ${name}`);
      assert.notEqual(cells[4], "free", `missing credits price for ${name}`);
    }

    const server = JSON.parse(
      fs.readFileSync(temp.files["server.json"], "utf8"),
    );
    assert.match(server.description, /12 tools/);
    assert.ok(server.description.length <= 99);

    const check = await runDocs(mock, temp.files, ["--check"]);
    assert.equal(check.code, 0, check.stderr);
    assert.match(check.stdout, /docs:check OK: 12 tools/);
  } finally {
    fs.rmSync(temp.dir, { recursive: true, force: true });
    await closeServer(mock.server);
  }
});

test("docs fails when a paid tool has no x402 price in the catalog", async () => {
  const mock = await startMockServer({
    products: catalogProducts.filter((product) => product.id !== "signal"),
  });
  const temp = makeTempCopy();
  try {
    const write = await runDocs(mock, temp.files, []);
    assert.notEqual(write.code, 0);
    assert.match(
      write.stderr,
      /missing x402 price for paid tool get_signal/,
    );
  } finally {
    fs.rmSync(temp.dir, { recursive: true, force: true });
    await closeServer(mock.server);
  }
});

test("docs:check fails when README is stale", async () => {
  const mock = await startMockServer();
  const temp = makeTempCopy();
  try {
    const write = await runDocs(mock, temp.files, []);
    assert.equal(write.code, 0, write.stderr);

    const readmePath = temp.files["README.md"];
    const readme = fs.readFileSync(readmePath, "utf8");
    fs.writeFileSync(
      readmePath,
      readme.replace("**12 tools**", "**999 tools**"),
      "utf8",
    );

    const check = await runDocs(mock, temp.files, ["--check"]);
    assert.notEqual(check.code, 0);
    assert.match(check.stderr, /README\.md/);
  } finally {
    fs.rmSync(temp.dir, { recursive: true, force: true });
    await closeServer(mock.server);
  }
});

test("docs:check fails when server.json is stale", async () => {
  const mock = await startMockServer();
  const temp = makeTempCopy();
  try {
    const write = await runDocs(mock, temp.files, []);
    assert.equal(write.code, 0, write.stderr);

    const serverPath = temp.files["server.json"];
    const server = JSON.parse(fs.readFileSync(serverPath, "utf8"));
    server.description = "stale description";
    fs.writeFileSync(
      serverPath,
      `${JSON.stringify(server, null, 2)}\n`,
      "utf8",
    );

    const check = await runDocs(mock, temp.files, ["--check"]);
    assert.notEqual(check.code, 0);
    assert.match(check.stderr, /server\.json/);
  } finally {
    fs.rmSync(temp.dir, { recursive: true, force: true });
    await closeServer(mock.server);
  }
});

test("docs:check fails when versions differ", async () => {
  const mock = await startMockServer();
  const temp = makeTempCopy();
  try {
    const packagePath = temp.files["package.json"];
    const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    pkg.version = "9.9.9";
    fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

    const check = await runDocs(mock, temp.files, ["--check"]);
    assert.notEqual(check.code, 0);
    assert.match(check.stderr, /version mismatch/);
  } finally {
    fs.rmSync(temp.dir, { recursive: true, force: true });
    await closeServer(mock.server);
  }
});
