---
sidebar_position: 3
title: Configuration
description: Environment variables, MCP host setup, and the stdio transport config.
---

# MCP Server Configuration

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PLUGPORT_URL` | ✅ | PlugPort API base URL (no trailing slash) |
| `PLUGPORT_API_KEY` | ✅ | `pp_...` key from the PlugPort dashboard |
| `PAG_GRAPH` | — | Graph name (default: `default`) |
| `MONAD_RPC_URL` | for anchoring | Enables `anchor_now` and `verify_memory` |
| `ANCHOR_CONTRACT` | for anchoring | `MemoryAnchor.sol` address on Monad |
| `ANCHOR_PRIVATE_KEY` | for anchoring | Signs anchor transactions |
| `ANCHOR_ADDRESS` | — | Wallet address (used for graph sharing) |
| `EXPLORER_TX_URL` | — | Block explorer base URL for tx links |

The server loads `.env` from the **repo root** (`plugport-agent-graph/.env`) at startup if the file exists.

## Generic MCP Host Config (stdio)

Add the following to your MCP host's server configuration. The exact config file location and format varies by host — consult your host's documentation.

```json
{
  "pag-mcp": {
    "command": "node",
    "args": ["/absolute/path/to/plugport-agent-graph/packages/mcp/dist/index.js"],
    "env": {
      "PLUGPORT_URL": "https://testnet.plugport.wtf",
      "PLUGPORT_API_KEY": "pp_your_key_here",
      "PAG_GRAPH": "default",
      "MONAD_RPC_URL": "https://testnet-rpc.monad.xyz",
      "ANCHOR_CONTRACT": "0x12a49Ee0c56dA65Eb519cC612Ee4D3A4A089c1f4",
      "ANCHOR_PRIVATE_KEY": "0x...",
      "ANCHOR_ADDRESS": "0x...",
      "EXPLORER_TX_URL": "https://testnet.monadscan.com/tx/"
    }
  }
}
```

> **Tip:** If you create a `.env` file at the repo root, you can omit all `env` fields from the host config — the server reads `.env` automatically.

## Using `pnpm mcp` as the Command

Alternatively, use the workspace script so the server always runs from the latest build:

```json
{
  "pag-mcp": {
    "command": "pnpm",
    "args": ["mcp"],
    "cwd": "/absolute/path/to/plugport-agent-graph"
  }
}
```

> **Note:** The `pnpm mcp` script runs `pnpm --filter @pag/mcp build && node packages/mcp/dist/index.js`, so it always builds before starting.

## Multiple Graph Isolation

You can run separate MCP server instances for different agents or tasks by pointing each at a different `PAG_GRAPH`:

```json
{
  "pag-mcp-trading": {
    "command": "node",
    "args": ["packages/mcp/dist/index.js"],
    "cwd": "/path/to/plugport-agent-graph",
    "env": { "PLUGPORT_API_KEY": "pp_...", "PAG_GRAPH": "trading" }
  },
  "pag-mcp-research": {
    "command": "node",
    "args": ["packages/mcp/dist/index.js"],
    "cwd": "/path/to/plugport-agent-graph",
    "env": { "PLUGPORT_API_KEY": "pp_...", "PAG_GRAPH": "research" }
  }
}
```

Each graph has its own collections (`trading_nodes`, `research_nodes`, etc.) but shares the same PlugPort account.
