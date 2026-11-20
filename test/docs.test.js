import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const mockTools = [
  {
    name: "free_tool",
    description: "Free tool for testing.",
    inputSchema: { type: "object" },
  },
  {
    name: "paid_tool",
    description: "Paid: $0.01 USDC per call via x402.",
    inputSchema: { type: "object" },
  },
  {
    name: "mystery_tool",
    description: "Does something useful.",
    inputSchema: { type: "object" },
  },
];

function startMockServer() {
  const server = http.createServer((req, res) => {
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
            result: { tools: mockTools },
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
      resolve({
        server,
        url: `http://127.0.0.1:${server.address().port}/mcp`,
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

function runDocs(mockUrl, files, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      SIGNAL_API_MCP_URL: mockUrl,
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

test("docs writes and docs:check accepts the generated files", async () => {
  const mock = await startMockServer();
  const temp = makeTempCopy();
  try {
    const write = await runDocs(mock.url, temp.files, []);
    assert.equal(write.code, 0, write.stderr);

    const readme = fs.readFileSync(temp.files["README.md"], "utf8");
    assert.match(readme, /\*\*3 tools\*\*/);
    assert.match(readme, /\| `free_tool` \|.*\| Free \|/);
    assert.match(readme, /\| `paid_tool` \|.*\| Paid \|/);
    assert.match(readme, /\| `mystery_tool` \|.*\| ver descripción \|/);

    const server = JSON.parse(
      fs.readFileSync(temp.files["server.json"], "utf8"),
    );
    assert.match(server.description, /3 tools/);
    assert.ok(server.description.length <= 99);

    const check = await runDocs(mock.url, temp.files, ["--check"]);
    assert.equal(check.code, 0, check.stderr);
    assert.match(check.stdout, /docs:check OK: 3 tools/);
  } finally {
    fs.rmSync(temp.dir, { recursive: true, force: true });
    await closeServer(mock.server);
  }
});

test("docs:check fails when README is stale", async () => {
  const mock = await startMockServer();
  const temp = makeTempCopy();
  try {
    const write = await runDocs(mock.url, temp.files, []);
    assert.equal(write.code, 0, write.stderr);

    const readmePath = temp.files["README.md"];
    const readme = fs.readFileSync(readmePath, "utf8");
    fs.writeFileSync(
      readmePath,
      readme.replace("**3 tools**", "**999 tools**"),
      "utf8",
    );

    const check = await runDocs(mock.url, temp.files, ["--check"]);
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
    const write = await runDocs(mock.url, temp.files, []);
    assert.equal(write.code, 0, write.stderr);

    const serverPath = temp.files["server.json"];
    const server = JSON.parse(fs.readFileSync(serverPath, "utf8"));
    server.description = "stale description";
    fs.writeFileSync(
      serverPath,
      `${JSON.stringify(server, null, 2)}\n`,
      "utf8",
    );

    const check = await runDocs(mock.url, temp.files, ["--check"]);
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

    const check = await runDocs(mock.url, temp.files, ["--check"]);
    assert.notEqual(check.code, 0);
    assert.match(check.stderr, /version mismatch/);
  } finally {
    fs.rmSync(temp.dir, { recursive: true, force: true });
    await closeServer(mock.server);
  }
});
