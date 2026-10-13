---
sidebar_position: 2
title: Tool Reference
description: All 7 MCP tools — schemas, inputs, outputs, and examples.
---

# MCP Tool Reference

All 7 tools exposed by `@pag/mcp`, with their zod schemas, inputs, and expected outputs.

---

## `remember`

Store a new memory with optional entities and relations.

**Input schema:**

```typescript
{
    text: string,           // min 1, max 4000 — the fact to remember
    entities?: Array<{
        label: string,      // Node label, e.g. "Person", "Token", "Pool"
        name: string,       // Display name of the entity
    }>,
    relations?: Array<{
        from: string,       // Source entity name (must be in entities or existing graph)
        type: string,       // Relation type, e.g. "AVOIDS", "TRADES_ON"
        to: string,         // Target entity name
    }>,
    tags?: string[],        // Free-form tags
}
```

**Output (text):**
```
Remembered: "Swap of 10 MON to USDC failed on pool MON/USDC-A…" (id: mem_abc123)
```

**Output (JSON):**
```json
{
    "id": "mem_abc123",
    "hash": "0xdeadbeef...",
    "entities": [{ "id": "Pool:MON/USDC-A", "label": "Pool", "name": "MON/USDC-A" }],
    "edges": [{ "from": "mem_abc123", "type": "MENTIONS", "to": "Pool:MON/USDC-A" }]
}
```

---

## `recall`

Search long-term memory by keywords and/or entity name.

**Input schema:**

```typescript
{
    query?: string,         // space-separated keywords
    entity?: string,        // entity name to anchor search
    hops?: number,          // 0–3, default 1
    limit?: number,         // 1–50, default 10
}
```

**Output (text):**
```
Recalled 3 memories:
1. Swap of 10 MON failed: slippage 3.2%  (score 2.50, hop 0)
2. USDC liquidity was low on MON/USDC-A pool  (score 1.50, hop 1)
3. User prefers USDC over USDT  (score 1.00, hop 1)

Context graph:
8 nodes (5 entities), 12 edges
edges: Pool:MON/USDC-A -[MENTIONS]→ Token:USDC … +7 more
```

**Output (JSON):**
```json
{
    "memories": [{ "id": "mem_abc123", "text": "...", "score": 2.5, "distance": 0, "anchorId": "0x...", "tags": ["failure"] }],
    "relations": ["Pool:MON/USDC-A MENTIONS mem_abc123"],
    "contextTruncated": false
}
```

:::note `contextTruncated`
If `contextTruncated: true`, the context graph was capped at 300 nodes during BFS expansion. Some connected nodes were omitted. Increase `hops` to get more coverage, or use `explore` to navigate specific paths.
:::

---

## `link`

Create a typed relationship between two entities.

**Input schema:**

```typescript
{
    from: { label: string, name: string },
    type: string,           // UPPER_SNAKE_CASE, e.g. "TRADES_ON"
    to:   { label: string, name: string },
    props?: Record<string, unknown>,
}
```

**Output (text):**
```
Linked: MON/USDC-A -[TRADES_ON]→ USDC (edge edge_xyz789)
```

---

## `explore`

Breadth-first traversal from one or more node ids.

**Input schema:**

```typescript
{
    start: string | string[],   // node id(s) to start from
    maxDepth?: number,          // 0–3, default 2
    direction?: 'out' | 'in' | 'both',   // default 'both'
    types?: string[],           // filter by edge types
    limit?: number,             // 1–300, default 100
}
```

**Output (JSON):**
```json
{
    "nodes": [{ "id": "mem_abc123", "label": "Memory", "text": "...", "depth": 0 }],
    "edges": [{ "id": "edge_xyz", "from": "mem_abc123", "type": "MENTIONS", "to": "Pool:MON/USDC-A" }],
    "truncated": false
}
```

Use `explore` when you need the raw graph structure rather than scored memories.

---

## `forget`

Delete a memory and all its edges.

**Input schema:**

```typescript
{ id: string }   // _id of the Memory node
```

**Output (text):**
```
Deleted memory mem_abc123.
```

:::caution
`forget` deletes the memory node and edges from PlugPort, but **does not revoke the on-chain anchor**. If the memory was anchored, the Merkle root remains on Monad. `verify_memory` will still report `hashValid: false` after deletion (since the node is gone), correctly failing verification.
:::

---

## `anchor_now`

Anchor all pending (un-anchored) memories on-chain as a Merkle batch.

**Requires:** `MONAD_RPC_URL` and `ANCHOR_CONTRACT` in environment.

**No input fields.**

**Output (text):**
```
Anchored 12 memories.
Root: 0xabcdef1234...
Tx: 0xdeadbeef...
```

**Output (JSON):**
```json
{
    "root": "0xabcdef...",
    "count": 12,
    "txHash": "0xdeadbeef...",
    "blockNumber": 12345678,
    "anchoredAt": 1718000000000,
    "explorerUrl": "https://testnet.monadscan.com/tx/0xdeadbeef..."
}
```

---

## `verify_memory`

Verify a memory's hash and Merkle proof against the on-chain root.

**Requires:** `MONAD_RPC_URL` and `ANCHOR_CONTRACT` in environment.

**Input schema:**

```typescript
{ id: string }   // _id of the Memory node
```

**Output (text):**
```
✓ Verified: memory is unchanged since it was anchored on Monad.
  ✓ stored hash matches content
  ✓ belongs to an anchor batch
  ✓ Merkle proof valid (4-step)
  ✓ root recorded on Monad
  tx: https://testnet.monadscan.com/tx/0xdeadbeef...
```

**Output (JSON):**
```json
{
    "id": "mem_abc123",
    "verified": true,
    "hashValid": true,
    "anchored": true,
    "proofValid": true,
    "onChain": true,
    "root": "0xabcdef...",
    "txHash": "0xdeadbeef...",
    "explorerUrl": "https://testnet.monadscan.com/tx/...",
    "problem": null
}
```
