import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

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
              serverInfo: { name: "mock-signal-api", version: "0" },
            },
          });
        } else if (message.method === "tools/list") {
          responses.push({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              tools: [
                {
                  name: "list_assets",
                  description: "List assets",
                  inputSchema: { type: "object" },
                },
                {
                  name: "get_trend",
                  description: "Paid trend",
                  inputSchema: {
                    type: "object",
                    properties: { asset: { type: "string" } },
                  },
                },
              ],
            },
          });
        } else if (message.method === "tools/call") {
          responses.push({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ called: message.params?.name }),
                },
              ],
            },
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

function runNoKeyBridge(url) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, SIGNAL_API_MCP_URL: url };
    delete env.EVM_PRIVATE_KEY;
    delete env.SIGNAL_API_KEY;

    const child = spawn(process.execPath, ["src/index.js"], {
      cwd: repoRoot,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const responses = new Map();
    let stderr = "";
    let buffer = "";
    let settled = false;

    const finish = (error, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    };

    const timer = setTimeout(() => {
      finish(new Error(`bridge timed out; stderr=${stderr}`));
    }, 15000);

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) {
          continue;
        }

        const message = JSON.parse(line);
        if (message.id === 1) {
          child.stdin.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              method: "notifications/initialized",
            })}\n`,
          );
          child.stdin.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              method: "tools/list",
              params: {},
            })}\n`,
          );
        } else if (message.id === 2) {
          responses.set("tools", message.result);
          child.stdin.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              id: 3,
              method: "tools/call",
              params: { name: "list_assets", arguments: {} },
            })}\n`,
          );
          child.stdin.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              id: 4,
              method: "tools/call",
              params: { name: "get_trend", arguments: { asset: "BTC" } },
            })}\n`,
          );
        } else if (message.id === 3 || message.id === 4) {
          responses.set(message.id, message.result);
          if (responses.has(3) && responses.has(4)) {
            finish(null, { responses, stderr });
          }
        }
      }
    });

    child.on("exit", (code) => {
      finish(new Error(`bridge exited with code ${code}; stderr=${stderr}`));
    });

    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "nokey-test", version: "0" },
        },
      })}\n`,
    );
  });
}

test("starts without keys, lists tools, runs free tools and blocks paid tools", async () => {
  const mock = await startMockServer();
  try {
    const { responses, stderr } = await runNoKeyBridge(mock.url);

    assert.deepEqual(
      responses.get("tools").tools.map((tool) => tool.name),
      ["list_assets", "get_trend"],
    );
    assert.equal(
      responses.get(3).isError,
      undefined,
      `${responses.get(3).content?.[0]?.text} stderr=${stderr}`,
    );
    assert.equal(
      JSON.parse(responses.get(3).content[0].text).called,
      "list_assets",
    );
    assert.equal(responses.get(4).isError, true);
    assert.match(responses.get(4).content[0].text, /SIGNAL_API_KEY/);
    assert.match(responses.get(4).content[0].text, /EVM_PRIVATE_KEY/);
    assert.match(stderr, /without credentials/);
  } finally {
    mock.server.close();
  }
});

test("rejects a malformed EVM key on startup", async () => {
  const env = { ...process.env, EVM_PRIVATE_KEY: "0x1234" };
  delete env.SIGNAL_API_KEY;

  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["src/index.js"], {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("exit", (code) => resolve({ code, stderr }));
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /32-byte hex/);
});
