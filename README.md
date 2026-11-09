# Crypto Regime MCP

A **stdio MCP bridge** for [signal-api](https://signal-api.shicoars.workers.dev).
It connects Claude Desktop, Claude Code, Cursor or any stdio MCP client to the
remote Streamable HTTP MCP endpoint and pays for tools in one of two ways:

- **x402**: signs USDC payments on Base with a local EVM wallet.
- **Prepaid credits**: sends an `X-API-Key` to the REST `/v1/*` routes.

> **Not Signal Messenger.** `signal-api` is a crypto market-signal service. This
> package has no relationship with Signal Messenger or its messaging app.

## What it does

- Speaks MCP over stdio to your client.
- Connects to `https://signal-api.shicoars.workers.dev/mcp` using Streamable HTTP.
- Exposes the remote tools locally, including their input schemas.
- With `SIGNAL_API_KEY`, serves paid tools through `/v1/*` using prepaid credits
  and adds `get_credit_balance`.
- Without `SIGNAL_API_KEY`, detects x402 `PaymentRequired` responses and signs
  USDC payments on Base automatically.
- Enforces a per-session spending limit with `MAX_SPEND_USDC` in x402 mode.

The bridge is useful for clients that only support stdio MCP and do not have
native x402 payment support. Clients with native x402 support can connect
directly to the remote URL.

## Payment methods

### 1. Prepaid credits (`SIGNAL_API_KEY`)

Set `SIGNAL_API_KEY` to a credit key (`sk_...`) bought from signal-api. The
bridge then:

- Calls `/v1/signal`, `/v1/market-scan`, `/v1/trend/{asset}`,
  `/v1/regime/{asset}` and `/v1/indicators/{asset}` with the `X-API-Key` header.
- Does **not** sign x402 payments and does not need `EVM_PRIVATE_KEY`.
- Uses the free `/free/{asset}` route for `get_sample`.
- Exposes `get_credit_balance`, which reads `GET /credits/balance`.
- Reports the credits charged and remaining balance in `_meta` under
  `signal-api/credits` when the API returns those headers.

`SIGNAL_API_KEY` takes precedence when both variables are set.

### 2. x402 (`EVM_PRIVATE_KEY`)

Without `SIGNAL_API_KEY`, the bridge works as before: it connects to the remote
MCP endpoint, receives x402 `PaymentRequired` results, signs USDC payments on
Base with `EVM_PRIVATE_KEY`, and retries the call. `MAX_SPEND_USDC` caps the
amount the bridge may authorize per session.

## Tools and prices

| Tool | x402 price | Credits | Description |
|---|---:|---:|---|
| `list_assets` | Free | Free | List supported assets, product ids and prices. Call this first. |
| `get_catalog` | Free | Free | Full product catalog with parameters, prices and descriptions. |
| `get_sample` | Free | Free | 1-day-delayed BTC/ETH trend and regime sample. 60 calls/hour per IP. |
| `get_credit_balance` | n/a | Free | Remaining credits for the configured `SIGNAL_API_KEY`. Credit mode only. |
| `get_signal` | 0.01 USDC | 1 | Combined BTC + ETH daily trend signal. |
| `get_market_scan` | 0.05 USDC | 10 | All catalog assets plus bullish/bearish, RSI and regime rankings. |
| `get_trend` | 0.005 USDC | 1 | Daily LONG/FLAT trend signal and exposure for one asset. |
| `get_regime` | 0.005 USDC | 1 | Bullish/bearish/lateral regime and volatility for one asset. |
| `get_indicators` | 0.005 USDC | 1 | RSI14, MACD, ATR14, Bollinger %B, returns and 30d/90d ranges. |

Network for x402: **Base mainnet** (`eip155:8453`), paid in **USDC**.

Credits are charged per request: `get_market_scan` costs 10 credits and the other
paid tools cost 1 credit. Insufficient credits return HTTP 402 with the current
balance; an invalid key returns HTTP 401.

## Requirements

- Node.js **20 or newer**
- Either a credit key from signal-api, or an EVM wallet private key with a small
  USDC balance on Base
- An MCP client that supports stdio servers (Claude Desktop, Claude Code, Cursor,
  or another MCP-compatible client)

## Installation

Run the published package with `npx`:

```bash
npx -y @shicodiez/crypto-regime-mcp
```

Or install it globally:

```bash
npm install -g @shicodiez/crypto-regime-mcp
```

From source:

```bash
git clone https://github.com/Shicodiez/crypto-regime-mcp.git
cd crypto-regime-mcp
npm install
```

Run the bridge in credit mode:

```bash
SIGNAL_API_KEY=sk_... node src/index.js
```

Or in x402 mode:

```bash
EVM_PRIVATE_KEY=0x... MAX_SPEND_USDC=1 node src/index.js
```

On Windows PowerShell:

```powershell
$env:SIGNAL_API_KEY = "sk_..."
node src/index.js
```

```powershell
$env:EVM_PRIVATE_KEY = "0x..."
$env:MAX_SPEND_USDC = "1"
node src/index.js
```

The process communicates over stdio. Diagnostics are written to stderr.

## Buying a credit pack

Buy a pack with x402. The starter pack costs **5 USDC and returns 2,000
credits**; the pro pack costs **20 USDC and returns 10,000 credits**.

```http
POST https://signal-api.shicoars.workers.dev/credits/buy/starter
```

The first request without payment returns HTTP 402 with the x402 requirements in
the `PAYMENT-REQUIRED` header. Sign the USDC payment on Base with any x402-capable
client and retry the same request with the signed payload:

```bash
curl -i -X POST https://signal-api.shicoars.workers.dev/credits/buy/starter \
  -H "PAYMENT-SIGNATURE: <signed x402 payment payload>"
```

A successful response looks like:

```json
{
  "key": "sk_...",
  "key_type": "api_key",
  "pack": "starter",
  "credits": 2000,
  "balance": 2000,
  "payer": "0x...",
  "transaction": "0x...",
  "note": "Store this key now. It is not stored and cannot be recovered."
}
```

Store the `key` immediately: signal-api stores only its SHA-256 hash and cannot
show it again. Then set `SIGNAL_API_KEY=sk_...` in your MCP client and check the
balance at any time:

```bash
curl https://signal-api.shicoars.workers.dev/credits/balance \
  -H "X-API-Key: sk_..."
```

The same header also works directly on `/signal`, `/p/{id}` and `/v1/*`.

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `SIGNAL_API_KEY` | One of these two | - | Prepaid credit key (`sk_...`). Enables credit mode and `get_credit_balance`. |
| `EVM_PRIVATE_KEY` | One of these two | - | 32-byte hex private key (`0x...`) used to sign x402 payments. Ignored when `SIGNAL_API_KEY` is set. |
| `MAX_SPEND_USDC` | No | `1` | Maximum USDC the bridge may authorize per session in x402 mode. Set `0` to block paid tools. |
| `SIGNAL_API_MCP_URL` | No | `https://signal-api.shicoars.workers.dev/mcp` | Remote MCP endpoint. |
| `SIGNAL_API_URL` | No | origin of the MCP URL | REST base URL used in credit mode. |
| `NETWORK` | No | `eip155:8453` | x402 network. Base mainnet is the default. |

## Claude Desktop

Edit the Claude Desktop configuration file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Credit mode:

```json
{
  "mcpServers": {
    "crypto-regime": {
      "command": "npx",
      "args": ["-y", "@shicodiez/crypto-regime-mcp"],
      "env": {
        "SIGNAL_API_KEY": "sk_..."
      }
    }
  }
}
```

x402 mode: replace `SIGNAL_API_KEY` with `EVM_PRIVATE_KEY` and optionally
`MAX_SPEND_USDC`.

Restart Claude Desktop after saving the file.

## Claude Code

Credit mode:

```bash
claude mcp add crypto-regime \
  --env SIGNAL_API_KEY=sk_... \
  -- npx -y @shicodiez/crypto-regime-mcp
```

x402 mode:

```bash
claude mcp add crypto-regime \
  --env EVM_PRIVATE_KEY=0x... \
  --env MAX_SPEND_USDC=1 \
  -- npx -y @shicodiez/crypto-regime-mcp
```

If your Claude Code version supports remote MCP with x402 payments, you can add
the hosted endpoint directly instead:

```bash
claude mcp add --transport http crypto-regime \
  https://signal-api.shicoars.workers.dev/mcp
```

For credit mode or automatic x402 payments, use the stdio bridge above.

## Cursor

Add the server to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` in your
project. Credit mode:

```json
{
  "mcpServers": {
    "crypto-regime": {
      "command": "npx",
      "args": ["-y", "@shicodiez/crypto-regime-mcp"],
      "env": {
        "SIGNAL_API_KEY": "sk_..."
      }
    }
  }
}
```

x402 mode: replace `SIGNAL_API_KEY` with `EVM_PRIVATE_KEY` and optionally
`MAX_SPEND_USDC`.

Reload Cursor after saving the file.

## Remote URL

The hosted MCP server is:

```text
https://signal-api.shicoars.workers.dev/mcp
```

Transport: **Streamable HTTP**.

- Free tools work without authentication or payment.
- Paid MCP tools return an x402 `PaymentRequired` result.
- An x402-capable client can pay directly.
- Clients without native x402 support can use this stdio bridge in x402 mode.
- Credit keys can also call the REST routes directly with `X-API-Key`.

## Security

- **Use a dedicated wallet** in x402 mode. Do not use a wallet that holds
  savings or other assets. Fund it with only the amount you are willing to
  spend.
- **Set `MAX_SPEND_USDC`** in x402 mode. The default is `1` USDC per session.
  The bridge refuses payments that would exceed the limit.
- **Protect `SIGNAL_API_KEY`**. Treat it like cash: anyone with the key can spend
  its credits. Do not commit it to a repository.
- **The private key and credit key are stored in plain text** in your MCP client
  configuration. Protect that file and never commit it.
- **Never commit `.env` files or keys.** The included `.gitignore` excludes
  common local secret files.
- **Review payments.** In x402 mode the bridge logs authorized amounts and
  recipients to stderr. Check the wallet balance and transaction history
  regularly.
- The bridge only sends `EVM_PRIVATE_KEY` to the local signing library; it is
  never sent to signal-api. `SIGNAL_API_KEY` is sent only to signal-api.

## Development

Run the tests:

```bash
npm test
```

Build (syntax-check the published sources):

```bash
npm run build
```

The test suite covers the session spending tracker, USDC amount conversion,
credit-mode route mapping, credit error handling and configuration precedence.

## License

MIT. See [LICENSE](LICENSE).
