const EMPTY_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

function assetSchema(description) {
  return {
    type: "object",
    properties: {
      asset: {
        type: "string",
        description,
      },
    },
    required: ["asset"],
    additionalProperties: false,
  };
}

function productIdFromAsset(prefix, asset) {
  const value = asset.trim().toLowerCase();
  return value.startsWith(`${prefix}-`) ? value : `${prefix}-${value}`;
}

export const API_KEY_TOOL_DEFINITIONS = Object.freeze([
  {
    name: "get_signal",
    description:
      "Get the combined BTC + ETH daily trend signal with exposure, SMA50, volatility and close. Uses prepaid credits via X-API-Key (1 credit).",
    inputSchema: EMPTY_SCHEMA,
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "get_market_scan",
    description:
      "One call to see what is strong/weak now: every catalog asset with trend, regime, RSI14, 7d/30d returns and distance to the 30d high/low, plus top-5 most bullish/bearish, RSI overbought/oversold and regime counts. Uses prepaid credits via X-API-Key (10 credits).",
    inputSchema: EMPTY_SCHEMA,
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "get_trend",
    description:
      "Get the daily trend signal for one crypto asset: LONG/FLAT, exposure, SMA50, 30d volatility and close. Uses prepaid credits via X-API-Key (1 credit). Discover assets with list_assets.",
    inputSchema: assetSchema(
      "Asset id or symbol, e.g. BTC, ETH, SOL, or trend-btc.",
    ),
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "get_regime",
    description:
      "Get the market regime for one crypto asset: bullish/bearish/lateral trend, low/medium/high volatility, SMA50 slope and close. Uses prepaid credits via X-API-Key (1 credit). Discover assets with list_assets.",
    inputSchema: assetSchema(
      "Asset id or symbol, e.g. BTC, ETH, SOL, or regime-btc.",
    ),
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "get_indicators",
    description:
      "Get calculated daily indicators for one crypto asset: RSI14, MACD(12,26,9), ATR14, Bollinger %B, returns 7d/30d, 30d/90d ranges and distance to each level. Uses prepaid credits via X-API-Key (1 credit). Discover assets with list_assets.",
    inputSchema: assetSchema(
      "Asset id or symbol, e.g. BTC, ETH, SOL, or indicators-btc.",
    ),
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "get_regime_stats",
    description:
      "Get historical regime statistics for one crypto asset: episode counts, mean/median 7/14/30-day returns, hit rate, drawdown and episode-bootstrap confidence intervals. Historical statistics, not a prediction. Uses prepaid credits via X-API-Key (4 credits). Discover assets with list_assets.",
    inputSchema: assetSchema(
      "Asset id or symbol, e.g. BTC, ETH, SOL, or regime-stats-btc.",
    ),
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "get_derivatives",
    description:
      "Get Hyperliquid perpetual derivatives data for one crypto asset: hourly funding (8h equivalent and annualized), open interest, mark and oracle price, and basis. Uses prepaid credits via X-API-Key (1 credit). Discover assets with list_assets.",
    inputSchema: assetSchema(
      "Asset id or symbol, e.g. BTC, ETH, SOL, or derivatives-btc.",
    ),
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "get_derivatives_scan",
    description:
      "Get the Hyperliquid perpetual derivatives scan: funding and open interest rankings across all assets with fresh derivatives data. Uses prepaid credits via X-API-Key (10 credits).",
    inputSchema: EMPTY_SCHEMA,
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "get_x402_radar",
    description:
      "Get the daily public x402 market radar: top services by on-chain buyers, USDC revenue, repeat buyers, categories and listed prices. Uses prepaid credits via X-API-Key (1 credit).",
    inputSchema: EMPTY_SCHEMA,
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "get_x402_trust",
    description:
      "Technical check for one measured x402 resource: responds, valid 402, payment header size, price coherence, availability and on-chain sales. Mide solo si responde y cobra como anuncia; no evalúa si es honesto ni seguro. Uses prepaid credits via X-API-Key (1 credit).",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Exact x402 resource URL measured in the daily technical check.",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "get_x402_trust_top",
    description:
      "Technical check ranking of the top measured x402 services: availability, valid 402, payable header, price coherence, on-chain sales, score and verdict. Uses prepaid credits via X-API-Key (2 credits).",
    inputSchema: EMPTY_SCHEMA,
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "get_sample",
    description:
      "Get a free 1-day-delayed trend and regime sample for BTC or ETH. Today's live data and the other assets are paid. Free, limited to 60 calls/hour per IP.",
    inputSchema: assetSchema(
      "Asset symbol. Only BTC and ETH are available for free samples.",
    ),
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "get_credit_balance",
    description:
      "Get the remaining prepaid credits for the configured SIGNAL_API_KEY, including pack, payer and update timestamps. Free.",
    inputSchema: EMPTY_SCHEMA,
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
]);

const API_KEY_TOOL_NAMES = new Set(
  API_KEY_TOOL_DEFINITIONS.map((tool) => tool.name),
);

export function isApiKeyTool(name) {
  return API_KEY_TOOL_NAMES.has(name);
}

function assetFromArgs(args) {
  return String(args?.asset ?? "").trim();
}

export function resolveApiPath(name, args = {}) {
  if (!isApiKeyTool(name)) {
    return null;
  }

  switch (name) {
    case "get_signal":
      return { path: "/v1/signal" };
    case "get_market_scan":
      return { path: "/v1/market-scan" };
    case "get_credit_balance":
      return { path: "/credits/balance" };
    case "get_trend":
    case "get_regime":
    case "get_indicators": {
      const asset = assetFromArgs(args);
      if (!asset) {
        return { error: `Missing required argument "asset" for ${name}.` };
      }
      const type = name.slice("get_".length);
      return { path: `/v1/${type}/${encodeURIComponent(asset)}` };
    }
    case "get_regime_stats":
    case "get_derivatives": {
      const asset = assetFromArgs(args);
      if (!asset) {
        return { error: `Missing required argument "asset" for ${name}.` };
      }
      const prefix =
        name === "get_regime_stats" ? "regime-stats" : "derivatives";
      return {
        path: `/p/${encodeURIComponent(productIdFromAsset(prefix, asset))}`,
      };
    }
    case "get_derivatives_scan":
      return { path: "/p/derivatives-scan" };
    case "get_x402_radar":
      return { path: "/v1/x402-radar" };
    case "get_x402_trust_top":
      return { path: "/p/x402-trust-top" };
    case "get_x402_trust": {
      const raw = String(args?.url ?? "").trim();
      if (!raw) {
        return { error: 'Missing required argument "url" for get_x402_trust.' };
      }
      try {
        const url = new URL(raw);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
          return { error: "url must use http or https." };
        }
        return {
          path: `/p/x402-trust?url=${encodeURIComponent(url.toString())}`,
        };
      } catch {
        return { error: "url must be a valid absolute URL." };
      }
    }
    case "get_sample": {
      const asset = assetFromArgs(args);
      if (!asset) {
        return { error: `Missing required argument "asset" for ${name}.` };
      }
      return { path: `/free/${encodeURIComponent(asset)}` };
    }
    default:
      return null;
  }
}

function errorResult(message) {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

function creditMeta(response) {
  const charged = response.headers.get("x-credits-charged");
  const balance = response.headers.get("x-credits-balance");
  if (charged === null && balance === null) {
    return undefined;
  }
  const credits = {};
  if (charged !== null) {
    credits.charged = Number(charged);
  }
  if (balance !== null) {
    credits.balance = Number(balance);
  }
  return { "signal-api/credits": credits };
}

export function createSignalApiClient({
  baseUrl,
  apiKey,
  fetchImpl = globalThis.fetch,
}) {
  if (!baseUrl) {
    throw new Error("SIGNAL_API_URL is required in credit mode");
  }
  if (!apiKey) {
    throw new Error("SIGNAL_API_KEY is required in credit mode");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required in credit mode");
  }

  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  async function request(path) {
    const url = new URL(path.replace(/^\/+/, ""), normalizedBase);
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
      },
    });

    const text = await response.text();
    let payload = text;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    } else {
      payload = response.ok ? null : { error: `HTTP ${response.status}` };
    }

    return {
      content: [
        {
          type: "text",
          text: typeof payload === "string" ? payload : JSON.stringify(payload),
        },
      ],
      isError: response.ok ? undefined : true,
      _meta: creditMeta(response),
    };
  }

  return {
    async callTool(name, args = {}) {
      const resolved = resolveApiPath(name, args);
      if (!resolved) {
        throw new Error(`Tool ${name} is not available in credit mode`);
      }
      if (resolved.error) {
        return errorResult(resolved.error);
      }
      return request(resolved.path);
    },
  };
}
