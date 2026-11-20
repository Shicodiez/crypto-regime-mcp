#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const START = "<!-- TOOLS:START -->";
const END = "<!-- TOOLS:END -->";
const MAX_DESCRIPTION = 99;
const SHORT_DESCRIPTION = 140;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function shortDescription(text) {
  let value = String(text ?? "")
    .replace(/\s*Paid:\s*\$[\d.]+\s*USDC per call via x402\.\s*/gi, " ")
    .replace(/\s*Free\.\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (value.length > SHORT_DESCRIPTION) {
    const cut = value
      .slice(0, SHORT_DESCRIPTION - 3)
      .replace(/\s+\S*$/, "")
      .replace(/[.,;:!?]+$/, "");
    value = `${cut}...`;
  }
  value = value.replace(/\|/g, "\\|");
  return value || "ver descripción";
}

function accessFromDescription(text) {
  const value = String(text ?? "").toLowerCase();
  const free = value.indexOf("free");
  const paid = value.search(/\bpaid\b|\bx402\b|\bcredits?\b|\bpayment\b/);

  if (free !== -1 && (paid === -1 || free < paid)) {
    return "Free";
  }
  if (paid !== -1) {
    return "Paid";
  }
  if (free !== -1) {
    return "Free";
  }
  return "ver descripción";
}

function renderToolsSection(tools) {
  const count = tools.length;
  const lines = [
    `**${count} tools** exposed without keys. Access is inferred from each tool description.`,
    "",
    "| Tool | Description | Access |",
    "|---|---|---|",
  ];

  for (const tool of tools) {
    const name = `\`${tool.name}\``;
    const description = shortDescription(tool.description);
    const access = accessFromDescription(tool.description);
    lines.push(`| ${name} | ${description} | ${access} |`);
  }

  if (!tools.some((tool) => tool.name === "get_credit_balance")) {
    lines.push("");
    lines.push(
      "Credit mode adds the `get_credit_balance` helper (free); it is not part of the no-key tools/list.",
    );
  }

  return lines.join("\n");
}

function replaceToolsSection(readme, section) {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`README must contain ${START} and ${END}`);
  }

  const before = readme.slice(0, start + START.length).replace(/\s+$/, "");
  const after = readme.slice(end);
  return `${before}\n${section.trim()}\n${after}`;
}

function updateCountMentions(readme, count) {
  const pattern = /\b\d+\s+tools\b/g;
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start === -1 || end === -1) {
    return readme;
  }

  const before = readme.slice(0, start).replace(pattern, `${count} tools`);
  const block = readme.slice(start, end + END.length);
  const after = readme.slice(end + END.length).replace(pattern, `${count} tools`);
  return `${before}${block}${after}`;
}

function buildServerDescription(count) {
  return `Crypto trend, regime, indicators, stats, scan and perps; ${count} tools; credits or x402.`;
}

function checkVersions(pkg, server) {
  const packageVersion = pkg.version;
  const serverVersion = server.version;
  const nestedVersion = server.packages?.[0]?.version;

  if (!packageVersion) {
    throw new Error("package.json has no version");
  }
  if (
    serverVersion !== packageVersion ||
    nestedVersion !== packageVersion
  ) {
    throw new Error(
      `version mismatch: package.json=${packageVersion}, server.json=${serverVersion}, packages[0]=${nestedVersion}`,
    );
  }
  return packageVersion;
}

async function listTools(mcpUrl) {
  const env = { ...getDefaultEnvironment() };
  if (mcpUrl) {
    env.SIGNAL_API_MCP_URL = mcpUrl;
  }
  delete env.SIGNAL_API_KEY;
  delete env.EVM_PRIVATE_KEY;

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "src", "index.js")],
    cwd: repoRoot,
    env,
    stderr: "pipe",
  });

  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const client = new Client({
    name: "crypto-regime-mcp-docs",
    version: "0",
  });

  const timeout = new Promise((_, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("tools/list timed out after 30s"));
    }, 30000);
    timer.unref?.();
  });

  try {
    const result = await Promise.race([
      (async () => {
        await client.connect(transport);
        return client.listTools();
      })(),
      timeout,
    ]);
    if (!Array.isArray(result.tools)) {
      throw new Error("tools/list did not return a tools array");
    }
    return result.tools;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `tools/list failed: ${detail}${stderr ? `\n${stderr.trim()}` : ""}`,
    );
  } finally {
    await client.close().catch(() => {});
  }
}

function argument(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return fallback;
}

async function main() {
  const check = process.argv.includes("--check");
  const readmePath = path.resolve(
    argument("--readme", path.join(repoRoot, "README.md")),
  );
  const serverPath = path.resolve(
    argument("--server", path.join(repoRoot, "server.json")),
  );
  const packagePath = path.resolve(
    argument("--package", path.join(repoRoot, "package.json")),
  );
  const mcpUrl = argument("--mcp-url", process.env.SIGNAL_API_MCP_URL);

  const pkg = readJson(packagePath);
  const server = readJson(serverPath);
  const version = checkVersions(pkg, server);

  const tools = await listTools(mcpUrl);
  const section = renderToolsSection(tools);
  const readme = fs.readFileSync(readmePath, "utf8");
  const nextReadme = updateCountMentions(
    replaceToolsSection(readme, section),
    tools.length,
  );
  const description = buildServerDescription(tools.length);

  if (description.length > MAX_DESCRIPTION) {
    throw new Error(
      `server.json description is ${description.length} chars (max ${MAX_DESCRIPTION})`,
    );
  }

  if (check) {
    if (readme !== nextReadme) {
      throw new Error(
        "README.md tools section is out of date; run npm run docs",
      );
    }
    if (server.description !== description) {
      throw new Error(
        "server.json description is out of date; run npm run docs",
      );
    }
    console.log(
      `docs:check OK: ${tools.length} tools, version ${version}, description ${description.length} chars`,
    );
    return;
  }

  const changed = [];
  if (readme !== nextReadme) {
    fs.writeFileSync(readmePath, nextReadme, "utf8");
    changed.push("README.md");
  }
  if (server.description !== description) {
    writeJson(serverPath, { ...server, description });
    changed.push("server.json");
  }

  console.log(
    `docs: ${tools.length} tools, version ${version}; ${
      changed.length > 0 ? `updated ${changed.join(", ")}` : "already up to date"
    }`,
  );
}

main().catch((error) => {
  console.error(`gen-docs: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});

