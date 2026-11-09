export const DEFAULT_MCP_URL = "https://signal-api.shicoars.workers.dev/mcp";
export const DEFAULT_API_URL = "https://signal-api.shicoars.workers.dev";
export const DEFAULT_NETWORK = "eip155:8453";
export const DEFAULT_MAX_SPEND_USDC = 1;

export function parseMaxSpend(raw = process.env.MAX_SPEND_USDC) {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_MAX_SPEND_USDC;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("MAX_SPEND_USDC must be a non-negative number");
  }
  return value;
}

export function resolveSignalApiKey(env = process.env) {
  const raw = env.SIGNAL_API_KEY?.trim();
  return raw ? raw : null;
}

export function resolveApiBaseUrl(env = process.env, mcpUrl = DEFAULT_MCP_URL) {
  const raw = env.SIGNAL_API_URL?.trim();
  if (raw) {
    return raw;
  }
  try {
    return new URL(mcpUrl).origin;
  } catch {
    return DEFAULT_API_URL;
  }
}

export function getPrivateKey(env = process.env) {
  const raw = env.EVM_PRIVATE_KEY?.trim();
  if (!raw || !/^0x[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      "EVM_PRIVATE_KEY must be a 32-byte hex private key (0x...). Set SIGNAL_API_KEY to use prepaid credits instead.",
    );
  }
  return raw;
}
