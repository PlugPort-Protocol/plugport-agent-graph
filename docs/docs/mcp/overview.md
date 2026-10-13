---
sidebar_position: 1
title: Overview
description: "@pag/mcp — stdio MCP server exposing 7 verifiable-memory tools to any AI host."
---

# MCP Server (@pag/mcp)

`@pag/mcp` is a **stdio Model Context Protocol server** that gives any MCP-compatible AI host (Claude Code, Cursor, custom integrations) persistent, verifiable long-term memory via PlugPort Agent Graph.

## Why This Matters

Without persistent memory, every AI conversation starts from zero — the agent has no knowledge of past interactions, user preferences, or prior failures. `@pag/mcp` solves this by:

1. **Storing** every important fact as a content-hashed node in a knowledge graph on PlugPort.
2. **Recalling** the most relevant facts at the start of each session, ranked by semantic proximity.
3. **Anchoring** batches of memory hashes on Monad — creating an immutable, verifiable audit trail.
4. **Verifying** that a recalled memory has not been tampered with since it was anchored.

## Architecture

```
AI Host (Claude Code, Cursor, etc.)
        │  stdio (JSON-RPC)
        ▼
@pag/mcp (MCP server)
  ├── remember        → GraphStore.upsertNodes + upsertEdges
  ├── recall          → Memory.recall() (BFS + keyword scoring)
  ├── link            → Memory.link() (entity relation)
  ├── explore         → GraphStore.traverse() (raw BFS)
  ├── forget          → Memory.forget()
  ├── anchor_now      → Anchorer.anchorPending() → Monad tx
  └── verify_memory   → Anchorer.verify() → Merkle proof check
        │
        ▼
PlugPort HTTP API + MemoryAnchor.sol (Monad)
```

## Quick Start

```bash
# Build
pnpm --filter @pag/core build
pnpm --filter @pag/mcp build

# Run
node packages/mcp/dist/index.js   # reads .env from repo root
```

## See Also

- [All 7 tools](./tools)
- [Configuration](./configuration)
- [Architecture](../architecture)
