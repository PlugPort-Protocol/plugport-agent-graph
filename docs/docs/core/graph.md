---
sidebar_position: 3
title: Graph Store & Traversal
description: Low-level node/edge CRUD and BFS traversal via GraphStore.
---

# Graph Store & Traversal

`GraphStore` is the low-level layer beneath `Memory`. It maps typed nodes and edges to PlugPort collections and implements BFS traversal.

## Collections

Each graph uses three PlugPort collections, namespaced by wallet and graph name:

| Collection | Contains | Default name |
|-----------|---------|-------------|
| Nodes | `Memory` and Entity nodes | `mem_nodes` |
| Edges | Typed directed edges | `mem_edges` |
| Anchors | `AnchorRecord` batches | `mem_anchors` |

The collection prefix changes when `PAG_GRAPH` is not `default`:
- `PAG_GRAPH=defi` → `defi_nodes`, `defi_edges`, `defi_anchors`

## Reading Another Wallet's Graph

Use the `owner` option to read a graph that another wallet has shared with you:

```typescript
import { createAgentGraph } from '@pag/core';

const { memory } = createAgentGraph({
    url: process.env.PLUGPORT_URL!,
    apiKey: process.env.PLUGPORT_API_KEY_2!,   // your key (wallet-2)
    owner: '0xWallet1Address',                  // whose namespace to read
    graph: 'default',
});

const { memories } = await memory.recall({ query: 'slippage' });
```

The server enforces that wallet-2 has been granted read access by wallet-1 (`grantRole`). Without the grant, PlugPort returns a 403.

## `traverse(start, options)`

Breadth-first expansion from one or more node ids.

```typescript
const result = await graph.traverse('mem_abc123', {
    maxDepth: 2,           // hops from start (default 2, max 3)
    direction: 'both',     // 'out' | 'in' | 'both' (default 'both')
    types: ['AVOIDS', 'MENTIONS'],  // only follow these edge types
    limit: 100,            // max nodes (default 100, max 300)
});

console.log(result.nodes.length, result.edges.length);
console.log(result.depth['mem_abc123']);   // 0 (start node)
console.log(result.truncated);             // true if node cap was hit
```

### `Traversal` type

```typescript
interface Traversal {
    nodes: GraphNode[];
    edges: GraphEdge[];
    /** Hop distance of each returned node from the nearest start node. */
    depth: Record<string, number>;
    /**
     * True when the 300-node cap was hit and some reachable nodes
     * were not returned. Surface this as a warning to the user.
     */
    truncated: boolean;
}
```

### BFS implementation details

- Nodes are fetched in chunks of 1000 ids (`$in` on `_id`) per BFS level.
- Up to 2000 edges are fetched per BFS level per chunk (`EDGE_SCAN_LIMIT`).
- The cap (`MAX_TRAVERSE_NODES = 300`) is enforced during expansion: once `depth.size >= limit`, new candidates are skipped.
- `truncated` is `true` when the cap is hit **and** there were still nodes in the frontier to expand.

## `snapshot(limit?)`

Return the newest N nodes plus all edges among them. Used by the web viewer's main graph load.

```typescript
const { nodes, edges } = await graph.snapshot(300);
```

This is intentionally **not** a traversal — it fetches the most recent nodes by `createdAt` and then filters edges to only those connecting returned nodes. No `truncated` flag is needed here because "newest 300" is a deliberate design choice, not a lossy BFS.

## Other Methods

| Method | Description |
|--------|-------------|
| `upsertNodes(inputs)` | Insert nodes that don't exist; return all (existing + new) |
| `upsertEdges(inputs)` | Insert edges that don't exist (deduped by from+type+to) |
| `getNode(id)` | Fetch a single node by id |
| `getNodes(ids)` | Fetch multiple nodes by id (chunked `$in`) |
| `findNodes(filter, options?)` | Find nodes matching a PlugPort filter |
| `deleteNode(id)` | Delete a node and all its edges |
| `listAnchors(limit?)` | List anchor records newest-first |
