#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";

import { DEFAULT_API_URL, isPaidTool } from "../src/config.js";
import { TOOL_PRICING } from "../src/pricing.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const START = "<!-- TOOLS:START -->";
const END = "<!-- TOOLS:END -->";
const MAX_DESCRIPTION = 99;
const SHORT_DESCRIPTION = 140;
const PLACEHOLDER_KEY = "sk_placeholder_docs";
const CREDIT_ONLY_SUFFIX = "(solo con clave de créditos)";

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

function priceFor(tool, catalogById) {
  if (!isPaidTool(tool.name)) {
    return { x402: "free", credits: "free" };
  }

  const pricing = TOOL_PRICING[tool.name];
  if (!pricing) {
    throw new Error(`missing pricing metadata for paid tool ${tool.name}`);
  }

  const product = catalogById.get(pricing.catalogId);
  if (!product || typeof product.price !== "string" || !product.price.trim()) {
    throw new Error(
      `missing x402 price for paid tool ${tool.name} (catalog id ${pricing.catalogId})`,
    );
  }
  if (!Number.isInteger(pricing.credits) || pricing.credits <= 0) {
    throw new Error(`missing credits price for paid tool ${tool.name}`);
  }

  return { x402: product.price.trim(), credits: String(pricing.credits) };
}

function renderToolsSection(tools, products) {
  const count = tools.length;
  const catalogById = new Map(products.map((product) => [product.id, product]));
  const lines = [
    `**${count} tools** exposed across no-key and credit modes.`,
    "",
    "| Tool | Description | x402 price | Credits |",
    "|---|---|---|---|",
  ];

  for (const tool of tools) {
    const name = `\`${tool.name}\``;
    let description = shortDescription(tool.description);
    if (tool.creditOnly) {
      description = `${description} ${CREDIT_ONLY_SUFFIX}`.trim();
    }
    const price = priceFor(tool, catalogById);
    lines.push(
      `| ${name} | ${description} | ${price.x402} | ${price.credits} |`,
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

async function listTools(mcpUrl, apiKey = null) {
  const env = { ...getDefaultEnvironment() };
  if (mcpUrl) {
    env.SIGNAL_API_MCP_URL = mcpUrl;
  }
  delete env.SIGNAL_API_KEY;
  delete env.EVM_PRIVATE_KEY;
  if (apiKey) {
    env.SIGNAL_API_KEY = apiKey;
  }

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

async function collectTools(mcpUrl) {
  const [noKeyTools, creditTools] = await Promise.all([
    listTools(mcpUrl),
    listTools(mcpUrl, PLACEHOLDER_KEY),
  ]);

  const tools = new Map();
  for (const tool of noKeyTools) {
    tools.set(tool.name, { ...tool, creditOnly: false });
  }
  for (const tool of creditTools) {
    tools.set(tool.name, {
      ...tool,
      creditOnly: !noKeyTools.some((other) => other.name === tool.name),
    });
  }

  return [...tools.values()];
}

async function fetchCatalog(apiUrl) {
  const base = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  const url = new URL("catalog", base);
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`GET ${url.href} failed: HTTP ${response.status}`);
  }

  const payload = await response.json().catch(() => null);
  if (!Array.isArray(payload?.products)) {
    throw new Error(`GET ${url.href} did not return a products array`);
  }
  return payload.products;
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
  const apiUrl = argument(
    "--api-url",
    process.env.SIGNAL_API_URL ?? DEFAULT_API_URL,
  );

  const pkg = readJson(packagePath);
  const server = readJson(serverPath);
  const version = checkVersions(pkg, server);

  const [tools, products] = await Promise.all([
    collectTools(mcpUrl),
    fetchCatalog(apiUrl),
  ]);
  const section = renderToolsSection(tools, products);
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

