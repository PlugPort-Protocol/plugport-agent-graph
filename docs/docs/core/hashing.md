---
sidebar_position: 4
title: Content Hashing
description: How memories are content-addressed with keccak256 and canonicalised for tamper detection.
---

# Content Hashing

Every memory stored by `remember()` is **content-addressed** — its `hash` field is a deterministic `keccak256` hash of the memory's canonical JSON representation. This hash is what gets included in the Merkle tree when memories are anchored on-chain.

## Canonical JSON

The hash is computed over a **canonicalised** subset of the memory document, not the raw stored document. This ensures:
- Field order doesn't affect the hash.
- Only semantically meaningful fields are included.
- Future additions to `props` that don't change the memory's meaning don't invalidate existing anchors.

```typescript
// From packages/core/src/hash.ts
export function hashMemory(node: Pick<GraphNode, '_id' | 'label' | 'text' | 'props' | 'createdAt'>): string {
    const canonical = canonicalJson({ _id: node._id, label: node.label, text: node.text, props: node.props, createdAt: node.createdAt });
    return '0x' + keccak256(canonical);
}
```

`canonicalJson` sorts object keys alphabetically at every nesting level before serializing — this is the standard approach used in Ethereum signing (EIP-712).

## Tamper Detection

The web viewer's **Verify** button recomputes the hash from the memory's current stored content and compares it to `memory.hash`:

```
Stored text: "Swap failed at 3.2% slippage"   →  recompute hash  →  0xabcd
Stored hash: 0xabcd                            →  match ✓

Tampered text: "Swap succeeded at 0% slippage" →  recompute hash  →  0x1234
Stored hash:   0xabcd                          →  mismatch ✗ (hashValid: false)
```

Even if an attacker modifies the stored `hash` field to match the tampered text, `verify()` checks the Merkle proof against the **on-chain root** — which only matches the original hash.

## Merkle Tree

When `anchorPending()` is called, all un-anchored memories are collected and their hashes become the **leaves** of a Merkle tree:

```
        root (anchored on Monad)
       /    \
    h(0,1)  h(2,3)
    /  \    /  \
  h0   h1  h2   h3    ← keccak256 of each memory's canonical JSON
```

The Merkle tree implementation uses `keccak256(keccak256(leaf))` for leaves (following OpenZeppelin's standard) and `keccak256(sort(left, right))` for internal nodes to make the tree order-independent.

`verify(id)` reconstructs the proof path and recomputes the root, checking it against what `MemoryAnchor.sol` has recorded.

## Hash Stability

The hash of a memory is **frozen at creation time** and stored alongside the memory. The `hashes` array in `AnchorRecord` stores the hashes as they were at anchor time — so if a memory is tampered with *after* anchoring, the proof still uses the original hash (which won't match the tampered content, correctly failing verification).

This is why `AnchorRecord.hashes` is kept even though `GraphNode.hash` also stores the hash: the anchor record is the authoritative snapshot; the node's `hash` field is for fast local tamper detection without hitting the chain.
