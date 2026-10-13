# `@pag/mcp` — PlugPort Agent Graph MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives any MCP-compatible AI host persistent, verifiable memory via PlugPort Agent Graph.

Memories are stored as content-hashed nodes in a knowledge graph on [PlugPort](../../plugport), and batches of memory hashes are anchored on **Monad** via the `MemoryAnchor` contract — so every recalled fact carries a cryptographic chain-of-custody proof.

---

## Tools

| Tool | Description |
|------|-------------|
| `remember` | Store a new memory with optional entities and relations |
| `recall` | Search memory by keywords and/or entity name (BFS context graph) |
| `link` | Create a typed relationship between two entities |
| `explore` | Breadth-first traversal from one or more node ids |
| `forget` | Delete a memory and all its edges |
| `anchor_now` | Anchor all pending memories on-chain as a Merkle batch |
| `verify_memory` | Verify a memory's hash + Merkle proof against the on-chain root |

---

## Environment Variables

Copy `.env.example` from the repo root and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `PLUGPORT_URL` | ✅ | Base URL of the PlugPort HTTP API (no trailing slash) |
| `PLUGPORT_API_KEY` | ✅ | Wallet API key (`pp_...`) from the PlugPort dashboard |
| `PAG_GRAPH` | — | Graph name (default: `default`) |
| `MONAD_RPC_URL` | for anchoring | Monad RPC endpoint |
| `ANCHOR_CONTRACT` | for anchoring | Deployed `MemoryAnchor` contract address |
| `ANCHOR_PRIVATE_KEY` | for anchoring | Signs anchor transactions (keep secret) |
| `EXPLORER_TX_URL` | — | Block explorer base URL for tx links |

> **Note:** `anchor_now` and `verify_memory` require `MONAD_RPC_URL` and `ANCHOR_CONTRACT`.
> Without them, the tools return a descriptive error instead of crashing.

---

## Setup

```bash
# From the repo root
pnpm install
pnpm --filter @pag/core build   # @pag/mcp depends on @pag/core
pnpm --filter @pag/mcp build    # compiles packages/mcp/src → packages/mcp/dist

# Run directly
node packages/mcp/dist/index.js

# Or via the root script
pnpm mcp
```

---

## MCP Host Configuration

The server uses **stdio transport** — any MCP host that supports stdio servers works.

Add the following to your MCP host's server configuration (exact field names vary by host):

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
      "EXPLORER_TX_URL": "https://testnet.monadscan.com/tx/"
    }
  }
}
```

Alternatively, create a `.env` file at the repo root and omit `env` from the config — the server loads `.env` automatically on startup.

---

## Manual Smoke Test

After building and configuring the server in your MCP host:

1. **remember**: ask the assistant to remember a fact, e.g. *"Remember that the MON/USDC-A pool has high slippage."*
   - Expect: `remember` tool call returns a memory id and hash.

2. **recall**: in a **new session** (empty chat history), ask *"What do you know about slippage?"*
   - Expect: `recall` tool call returns the memory from step 1, proving cross-session persistence.

3. **anchor_now**: ask *"Anchor your memories on-chain."*
   - Expect: `anchor_now` returns a Merkle root and Monad tx hash.

4. **verify_memory**: ask *"Verify the memory you just anchored."*
   - Expect: `verify_memory` returns `verified: true`, `proofValid: true`, `onChain: true`.

5. Open the **web viewer** (`pnpm --filter @pag/web start`) to see the graph and anchor badges.

---

## Architecture

```
MCP Host (stdio)
     │
     ▼
packages/mcp/src/index.ts   — McpServer + StdioServerTransport
packages/mcp/src/tools.ts   — 7 tool definitions (zod schemas + handlers)
packages/mcp/src/format.ts  — compact text serialisation for tool results
     │
     ▼
@pag/core                   — Memory, GraphStore, Anchorer, agentGraphFromEnv()
     │
     ▼
PlugPort HTTP API            — document store (nodes, edges, anchors)
     │
     ▼
MemoryAnchor.sol on Monad   — Merkle root → on-chain proof
```
