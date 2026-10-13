---
sidebar_position: 2
title: Memory API
description: remember(), recall(), link(), forget() — the high-level agent memory interface.
---

# Memory API

`Memory` is the primary interface agents interact with. It wraps `GraphStore` with domain-specific semantics: memories are immutable, content-hashed facts linked to entities via typed edges.

## `remember(input)`

Store a new memory. The memory text is normalized, keccak256-hashed, and stored as a `Memory` node alongside any entities and relations.

```typescript
const { memory, entities, edges } = await memory.remember({
    text: 'The user never accepts more than 1% slippage on any swap.',
    entities: [
        { label: 'User', name: 'me' },
        { label: 'Token', name: 'SCAM' },
    ],
    relations: [
        { from: 'me', type: 'AVOIDS', to: 'SCAM' },
    ],
    tags: ['preference'],
    props: { source: 'user-instruction' },  // optional extra metadata
});

console.log(memory._id);    // mem_abc123…
console.log(memory.hash);   // 0xdeadbeef…  (keccak256 of canonical JSON)
```

### Input fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | `string` | ✅ | The fact (1 – 4000 chars) |
| `entities` | `Array<{label, name}>` | — | Entities mentioned in the memory |
| `relations` | `Array<{from, type, to, props?}>` | — | Typed directed edges (endpoints must be entity names or existing node ids) |
| `tags` | `string[]` | — | Free-form tags (max 20) |
| `props` | `Record<string, unknown>` | — | Extra metadata merged into the memory's `props` |

### Atomicity guarantee

If the edge-insert fails after the memory node is created, the memory node is automatically deleted to avoid orphans. See [§6a](../notes#6a--plugport-storage-semantics-fixed-in-current-release) for details.

## `recall(input)`

Search memory by keywords and/or entity name. Returns ranked memories and their context graph.

```typescript
const { memories, context, contextTruncated } = await memory.recall({
    query: 'slippage failure swap',
    entity: 'USDC',
    hops: 1,      // expand 1 hop around matched nodes
    limit: 10,    // max memories returned (default 10, max 50)
});

for (const { memory: m, score, distance } of memories) {
    console.log(score.toFixed(2), m.text);
}

if (contextTruncated) {
    console.warn('Context graph was capped at 300 nodes');
}
```

### How recall works

1. **Seed phase** — find nodes matching `query` keywords (via `$regex` on `keywords` field) and/or `entity` name (by normalized name lookup).
2. **Expand phase** — BFS from seed nodes up to `hops` edges deep (max 300 nodes). Sets `contextTruncated: true` if the cap is hit.
3. **Score** — `hits × 2 + 1 / (1 + distance)`. Higher keyword hits and shorter distance = higher score.

### Input fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | `string` | — | Space-separated keywords |
| `entity` | `string` | — | Entity name to anchor search |
| `hops` | `0–3` | `1` | BFS depth around matched nodes |
| `limit` | `1–50` | `10` | Max memories in result |

## `link(from, type, to, props?)`

Create a typed relationship between two entities. Both endpoints are upserted if they don't exist.

```typescript
const { nodes, edge } = await memory.link(
    { label: 'Pool', name: 'MON/USDC-A' },
    'TRADES_ON',
    { label: 'Token', name: 'USDC' },
);
```

## `forget(id)`

Delete a memory and all its edges. Returns `false` if the memory doesn't exist, throws if `id` is not a `Memory` node.

```typescript
const deleted = await memory.forget('mem_abc123');
```

## `recent(limit?)`

Return the most recently created memories (default 10, max 200). Useful for seeding the context when no query is given.

```typescript
const latest = await memory.recent(5);
```

## `verifyHash(id)`

Recompute a memory's hash from its stored content and compare it to the stored `hash` field. Returns `null` if the memory doesn't exist.

```typescript
const result = await memory.verifyHash('mem_abc123');
// { id, hashValid: true, storedHash: '0x...', computedHash: '0x...' }
```
