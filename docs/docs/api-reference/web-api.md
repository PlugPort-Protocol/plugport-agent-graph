---
sidebar_position: 1
title: Web API Reference
description: HTTP routes exposed by @pag/web for the graph viewer.
---

# Web API Reference

`@pag/web` exposes three HTTP routes, consumed by the Viewer component and available for external use (e.g. in automated tests or custom dashboards).

All routes return JSON. All errors follow `{ error: { code, message } }`.

---

## `GET /api/graph`

Returns the snapshot graph for a given wallet graph namespace.

**Query parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `graph` | — | Graph name (default: `default`) |

**Response:**

```typescript
{
    nodes: Array<Omit<GraphNode, 'keywords'>>,   // newest 300 nodes
    edges: GraphEdge[],
    anchors: Array<Omit<AnchorRecord, 'hashes'>>,
}
```

The `nodes` array is the result of `GraphStore.snapshot(300)` — the 300 most recently created nodes. `keywords` is stripped from each node to reduce payload size.

---

## `GET /api/recall`

Run a recall search and return the matched node/edge ids for highlighting in the viewer.

**Query parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `graph` | — | Graph name |
| `q` | — | Keyword query |
| `entity` | — | Entity name to anchor search |
| `hops` | — | BFS depth (default: `1`) |

**Response:**

```typescript
{
    memories: Array<{ id: string, text: string, score: number, distance: number }>,
    nodeIds: string[],    // all nodes in the context graph (for highlighting)
    edgeIds: string[],    // all edges in the context graph (for highlighting)
    contextTruncated: boolean,   // true if BFS hit 300-node cap
}
```

---

## `GET /api/verify`

Verify a memory's Merkle proof against the on-chain anchor.

**Query parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `id` | ✅ | Memory node id (`mem_...`) |
| `graph` | — | Graph name |

**Response:**

```typescript
{
    verified: boolean,
    hashValid: boolean,
    anchored: boolean,
    proofValid: boolean,
    onChain: boolean,
    root: string | null,
    txHash: string | null,
    anchoredAt: number | null,
    anchoredBy: string | null,
    explorerUrl: string | null,
    computedHash: string,
    problem: string | null,
}
```

Returns `{ verified: false, problem: 'not found' }` when `id` doesn't exist.

---

## Error Response Format

```typescript
{
    error: {
        code: string,    // e.g. "NODE_NOT_FOUND", "INVALID_INPUT"
        message: string, // human-readable description
    }
}
```

HTTP status codes follow standard conventions: 400 for invalid input, 404 for not found, 500 for unexpected errors.
