---
id: architecture
sidebar_position: 2
title: Architecture
description: How PlugPort Agent Graph layers graph memory on PlugPort and anchors it on Monad.
---

# Architecture

PlugPort Agent Graph is a pnpm monorepo built as a **showcase use-case** for [PlugPort](https://testnet.plugport.wtf) — demonstrating that Web3 verifiable storage can back production AI agent memory without any blockchain knowledge from the developer.

## High-Level Overview

```
┌─────────────────────────────────────────────────────────┐
│                    AI Agent / MCP Host                   │
│  (Gemma 4 demo, Claude Code, Cursor, custom agent)      │
└────────────────┬────────────────────────────────────────┘
                 │  remember() / recall() / anchor_now()
                 ▼
┌─────────────────────────────────────────────────────────┐
│                      @pag/core                          │
│  Memory ──► GraphStore ──► PlugPortClient (HTTP)        │
│  Anchorer ──► EthersAnchorChain ──► MemoryAnchor.sol   │
└──────────┬─────────────────────┬───────────────────────┘
           │                     │
           ▼                     ▼
   PlugPort HTTP API       Monad Testnet
   (nodes + edges +        (MemoryAnchor.sol
    anchors stored as       records Merkle roots
    wallet-namespaced       on-chain per batch)
    collections)
```

## Packages

| Package | Role |
|---------|------|
| [`@pag/core`](./core/overview) | PlugPort client, graph store, memory layer, Merkle hashing, on-chain anchoring |
| [`@pag/mcp`](./mcp/overview) | stdio MCP server exposing 7 tools to any MCP-compatible AI host |
| [`@pag/agent`](./agent/overview) | Gemma 4 DeFi demo agent — two-session memory recall showcase |
| [`@pag/web`](./web/overview) | Next.js graph viewer with live Merkle proof verification |
| `contracts/` | `MemoryAnchor.sol` — records Merkle roots on Monad |

## Data Model

Every piece of agent knowledge is stored as a **node** in PlugPort:

```
Memory node
  _id:       mem_<nanoid>       content-addressed unique id
  label:     "Memory"
  text:      "..."              the fact (plain text)
  hash:      "0x..."            keccak256 of canonical JSON
  anchorId:  "0x..."            Merkle root of the anchor batch (set after anchoring)
  keywords:  " swap slippage "  space-padded, used for $regex search
  props:     { tags: [...] }
  createdAt: 1718000000000

Entity node
  _id:       "Pool:MON/USDC-A"  deterministic from label + name
  label:     "Pool"
  name:      "MON/USDC-A"

Edge
  from → MENTIONS → Memory      (every memory mentions its entities)
  from → FAILED_ON → Pool       (agent-defined semantic relations)
```

## Memory Anchoring Flow

```
1. remember()        → stores Memory node in PlugPort (hash computed locally)
2. anchor_now()      → queries all un-anchored memories
                     → builds Merkle tree of their hashes (keccak256 leaves)
                     → sends recordRoot(root, count) tx to MemoryAnchor.sol
                     → stores AnchorRecord in PlugPort with txHash + blockNumber
                     → updates each memory's anchorId field
3. verify(id)        → recomputes memory hash from stored content
                     → rebuilds Merkle proof for the memory's leaf position
                     → reads root from MemoryAnchor.sol on Monad
                     → returns { verified, hashValid, proofValid, onChain, explorerUrl }
```

## PlugPort as the Storage Backend

PlugPort provides a **wallet-namespaced document store** reachable over HTTP — the same protocol your existing MongoDB/PostgreSQL/Redis data uses, now with Web3 ownership semantics. Agent Graph uses three collections per graph:

| Collection | Contains |
|-----------|---------|
| `mem_nodes` | Memory and Entity nodes |
| `mem_edges` | Typed directed edges |
| `mem_anchors` | AnchorRecord documents (Merkle batches) |

The `x-api-key` header authenticates writes; reads from another wallet's namespace require `grantRole` ACL from that wallet. This is how the `--share` demo works: wallet-2 reads wallet-1's graph without ever holding wallet-1's key.

## Traversal and Recall

`recall(query, entity, hops)` is a two-phase operation:

1. **Seed phase** — find Memory and Entity nodes matching the query keywords (`$regex` on `keywords`) and/or entity name.
2. **Expand phase** — BFS from seed nodes up to `hops` edges deep (max 300 nodes, `CONTEXT_LIMIT`). When the cap is hit, `contextTruncated: true` is returned.

The result is scored by `hits × 2 + 1/(1 + distance)` and sorted descending, so direct keyword matches at hop 0 rank above distant context nodes.
