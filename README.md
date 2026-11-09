# Crypto Regime MCP

A **stdio MCP bridge** for [signal-api](https://signal-api.shicoars.workers.dev).
It connects Claude Desktop, Claude Code, Cursor or any stdio MCP client to the
remote Streamable HTTP MCP endpoint and pays x402-protected tools automatically
with a local EVM wallet.

> **Not Signal Messenger.** `signal-api` is a crypto market-signal service. This
> package has no relationship with Signal Messenger or its messaging app.

## What it does

- Speaks MCP over stdio to your client.
- Connects to `https://signal-api.shicoars.workers.dev/mcp` using Streamable HTTP.
- Exposes the remote tools locally, including their input schemas.
- Detects x402 `PaymentRequired` responses and signs USDC payments on Base
  automatically.
- Enforces a per-session spending limit with `MAX_SPEND_USDC`.

The bridge is useful for clients that only support stdio MCP and do not have
native x402 payment support. Clients with native x402 support can connect
directly to the remote URL.

## Tools and prices

| Tool | Price | Description |
|---|---:|---|
| `list_assets` | Free | List supported assets, product ids and prices. Call this first. |
| `get_catalog` | Free | Full product catalog with parameters, prices and descriptions. |
| `get_signal` | 0.01 USDC | Combined BTC + ETH daily trend signal. |
| `get_trend` | 0.005 USDC | Daily LONG/FLAT trend signal and exposure for one asset. |
| `get_regime` | 0.005 USDC | Bullish/bearish/lateral regime and volatility for one asset. |
| `get_indicators` | 0.005 USDC | RSI14, MACD, ATR14, Bollinger %B, 7d/30d returns and 30d/90d ranges. No raw candles. |

Network: **Base mainnet** (`eip155:8453`), paid in **USDC**.

## Requirements

- Node.js **20 or newer**
- An EVM wallet private key with a small USDC balance on Base
- An MCP client that supports stdio servers (Claude Desktop, Claude Code, Cursor,
  or another MCP-compatible client)

## Installation

The package is **not published on npm yet**. Install it from source:

```bash
git clone https://github.com/Shicodiez/crypto-regime-mcp.git
cd crypto-regime-mcp
npm install
```

Run the bridge:

```bash
EVM_PRIVATE_KEY=0x... MAX_SPEND_USDC=1 node src/index.js
```

On Windows PowerShell:

```powershell
$env:EVM_PRIVATE_KEY = "0x..."
$env:MAX_SPEND_USDC = "1"
node src/index.js
```

The process communicates over stdio. Diagnostics are written to stderr.

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `EVM_PRIVATE_KEY` | Yes | — | 32-byte hex private key (`0x...`) of the dedicated payment wallet. |
| `MAX_SPEND_USDC` | No | `1` | Maximum USDC the bridge may authorize per session. Set `0` to block paid tools. |
| `SIGNAL_API_MCP_URL` | No | `https://signal-api.shicoars.workers.dev/mcp` | Remote MCP endpoint. |
| `NETWORK` | No | `eip155:8453` | x402 network. Base mainnet is the default. |

## Claude Desktop

Edit the Claude Desktop configuration file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add the server:

```json
{
  "mcpServers": {
    "crypto-regime": {
      "command": "node",
      "args": ["/absolute/path/to/crypto-regime-mcp/src/index.js"],
      "env": {
        "EVM_PRIVATE_KEY": "0x...",
        "MAX_SPEND_USDC": "1"
      }
    }
  }
}
```

Restart Claude Desktop after saving the file.

## Claude Code

Add the local stdio bridge:

```bash
claude mcp add crypto-regime \
  --env EVM_PRIVATE_KEY=0x... \
  --env MAX_SPEND_USDC=1 \
  -- node /absolute/path/to/crypto-regime-mcp/src/index.js
```

If your Claude Code version supports remote MCP with x402 payments, you can add
the hosted endpoint directly instead:

```bash
claude mcp add --transport http crypto-regime \
  https://signal-api.shicoars.workers.dev/mcp
```

For automatic x402 payments, use the stdio bridge above.

## Cursor

Add the server to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` in your
project:

```json
{
  "mcpServers": {
    "crypto-regime": {
      "command": "node",
      "args": ["/absolute/path/to/crypto-regime-mcp/src/index.js"],
      "env": {
        "EVM_PRIVATE_KEY": "0x...",
        "MAX_SPEND_USDC": "1"
      }
    }
  }
}
```

Reload Cursor after saving the file.

## Remote URL

The hosted MCP server is:

```text
https://signal-api.shicoars.workers.dev/mcp
```

Transport: **Streamable HTTP**.

- Free tools work without authentication or payment.
- Paid tools return an x402 `PaymentRequired` result.
- An x402-capable client can pay directly.
- Clients without native x402 support should use this stdio bridge, which signs
  payments locally.

## Security

- **Use a dedicated wallet.** Do not use a wallet that holds savings or other
  assets. Fund it with only the amount you are willing to spend.
- **Set `MAX_SPEND_USDC`.** The default is `1` USDC per session. The bridge
  refuses payments that would exceed the limit. Set `0` to block paid tools.
- **The private key is stored in plain text** in your MCP client configuration.
  Protect that file and never commit it to a repository.
- **Never commit `.env` files or private keys.** The included `.gitignore`
  excludes common local secret files.
- **Review payments.** The bridge logs authorized amounts and recipients to
  stderr. Check the wallet balance and transaction history regularly.
- The bridge only sends your private key to the local signing library; it is
  never sent to signal-api.

## Development

Run the tests:

```bash
npm test
```

The test suite covers the session spending tracker and USDC amount conversion.

## License

MIT. See [LICENSE](LICENSE).
