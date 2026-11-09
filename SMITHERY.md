# Smithery listing copy

## Name

Crypto Regime MCP

## Description (English)

Crypto trend, regime and indicator MCP tools with automatic x402 payments on
Base. Discover supported assets, fetch daily trend signals, classify market
regime and volatility, and read calculated RSI/MACD/ATR/Bollinger values without
raw candles.

## Recommended publication path

Publish the **hosted remote server** (URL), not the local stdio package:

- URL: `https://signal-api.shicoars.workers.dev/mcp`
- Transport: Streamable HTTP
- Auth: none (paid tools use x402 per tool)

The URL is already public, so Smithery can scan it without running code. Paid
tools return an x402 `PaymentRequired` result; an x402-capable client or the
`@shicodiez/crypto-regime-mcp` stdio bridge can pay it.

## Tools and prices

| Tool | Price | When to use |
|---|---:|---|
| `list_assets` | Free | List supported assets, product ids and prices. Call first. |
| `get_catalog` | Free | Full product catalog with params, prices and descriptions. |
| `get_signal` | 0.01 USDC | Combined BTC + ETH daily trend signal. |
| `get_trend` | 0.005 USDC | Daily LONG/FLAT trend signal for one asset (BTC, ETH, SOL, ...). |
| `get_regime` | 0.005 USDC | Bullish/bearish/lateral regime and volatility for one asset. |
| `get_indicators` | 0.005 USDC | RSI14, MACD, ATR14, Bollinger %B, 7d/30d returns and 30d/90d ranges; no raw candles. |

Network: Base mainnet (`eip155:8453`), USDC.

## Local stdio package (alternative)

`@shicodiez/crypto-regime-mcp` is the stdio bridge for Claude Desktop/Code and
Cursor. It requires:

- `EVM_PRIVATE_KEY` (secret): dedicated low-balance wallet used to sign x402.
- `MAX_SPEND_USDC` (optional, default `1`): per-session spend cap.

Smithery's current local path uses an MCPB bundle. If you publish the local
package through Smithery, build an MCPB bundle and provide `EVM_PRIVATE_KEY` as a
secret config value. Prefer the hosted URL: it does not require sharing a key
with Smithery.
