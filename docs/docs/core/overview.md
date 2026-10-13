---
sidebar_position: 1
title: Overview
description: "@pag/core — PlugPort client, graph store, memory, hashing, and on-chain anchoring."
---

# @pag/core

The core library that every other package in Agent Graph depends on. It provides:

- **`PlugPortClient`** — thin HTTP client for the PlugPort document-store API
- **`GraphStore`** — typed node/edge CRUD and BFS traversal on top of PlugPort
- **`Memory`** — high-level `remember()` / `recall()` / `forget()` / `link()` API
- **`Anchorer`** — Merkle-batch anchoring to `MemoryAnchor.sol` on Monad
- **`agentGraphFromEnv()`** — one-call setup from environment variables

## Installation

`@pag/core` is a workspace package — build it before any dependent package:

```bash
pnpm --filter @pag/core build
```

To use it in your own project outside the monorepo:

```bash
npm install @pag/core    # once published to npm
```

## Quick Example

```typescript
import { agentGraphFromEnv } from '@pag/core';

const { memory, anchor } = agentGraphFromEnv();

// Store a memory with entities and relations
const { memory: m } = await memory.remember({
    text: 'Swap of 10 MON to USDC failed: slippage 3.2% on MON/USDC-A.',
    entities: [
        { label: 'Pool', name: 'MON/USDC-A' },
        { label: 'Token', name: 'USDC' },
    ],
    relations: [{ from: 'MON/USDC-A', type: 'FAILED_ON', to: 'USDC' }],
    tags: ['failure'],
});
console.log(m._id, m.hash);  // mem_abc123…  0xdeadbeef…

// Recall with cross-session persistence
const { memories, context, contextTruncated } = await memory.recall({
    query: 'slippage failure',
    entity: 'USDC',
    hops: 1,
});

// Anchor to Monad
const { batch } = await anchor!.anchorPending();
console.log(batch?.txHash);   // 0x...

// Verify integrity
const v = await anchor!.verify(m._id);
console.log(v?.verified, v?.onChain);  // true, true
```

## Exports

| Export | Description |
|--------|-------------|
| `agentGraphFromEnv()` | Build `{ memory, anchor, graph, client }` from env vars |
| `createAgentGraph(options)` | Programmatic setup with explicit options |
| `Memory` | High-level memory API |
| `GraphStore` | Low-level node/edge/traversal store |
| `Anchorer` | On-chain Merkle anchoring |
| `PlugPortClient` | Raw PlugPort HTTP client |
| `InMemoryDocStore` | In-memory store for offline/testing |
| `InMemoryAnchorChain` | In-memory anchor chain for offline/testing |
| Types: `GraphNode`, `GraphEdge`, `AnchorRecord`, `Traversal`, `RecallResult`, … | All public types |

## See Also

- [Memory API](./memory)
- [Graph Store & Traversal](./graph)
- [Hashing](./hashing)
- [Anchoring](./anchor)
