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
