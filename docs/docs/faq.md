---
id: faq
sidebar_position: 10
title: FAQ
description: Frequently asked questions about PlugPort Agent Graph.
---

# FAQ

## General

### What is PlugPort Agent Graph?

A production-quality open-source example showing how to give AI agents **persistent, verifiable long-term memory** using [PlugPort](https://testnet.plugport.wtf) as the storage backend and [Monad](https://monad.xyz) for on-chain integrity proofs. It ships as both a CLI demo, an MCP server, and a web viewer.

### Is this production-ready?

The `@pag/core` library, MCP server, and web viewer are production-quality. The DeFi demo agent uses a mock DEX — the mock swap tool is for demonstration only. The PlugPort and Monad integrations are real and work against the testnet.

### Do I need a blockchain wallet to use this?

- **For basic memory** (remember + recall): No. You only need a PlugPort account.
- **For anchoring** (anchor_now, verify_memory): Yes — you need a Monad wallet with MON for gas.

---

## Memory

### How many memories can I store?

PlugPort's document store has no per-document limit. The web viewer shows the newest 300 nodes. `recall()` returns up to 50 memories per search. `traverse()` returns up to 300 nodes per BFS call.

### Are memories encrypted?

No. Memories are stored in plain text in PlugPort, protected only by your API key. Do not store secrets or private keys as memories.

### What happens if I call `forget()` on an anchored memory?

The memory is deleted from PlugPort, but the Merkle root remains on Monad. `verify_memory` will return `found: false` for a deleted memory. The anchor record in PlugPort still exists (it covers a batch of hashes, not individual memories).

### What does `contextTruncated: true` mean?

During `recall()`, the BFS context expansion is capped at 300 nodes. If your graph is large and the cap was hit, some connected nodes were not included in the context. Use `explore()` with a specific start node to navigate the truncated subgraph, or decrease the `hops` parameter to reduce BFS depth.

---

## MCP Server

### Which MCP hosts work with `@pag/mcp`?

Any host that supports **stdio transport** MCP servers. This includes Claude Code, Cursor, and any custom implementation of the MCP spec.

### Can I run multiple MCP instances pointing at different graphs?

Yes. Set different `PAG_GRAPH` values in each instance's environment. They'll use separate PlugPort collections but the same account.

### Why does `anchor_now` say "no pending memories"?

All memories have already been anchored. Call `remember()` first to add new memories.

---

## PlugPort

### What PlugPort plan do I need?

The testnet is open and free. For production use, check [plugport.wtf](https://plugport.wtf) for pricing.

### Can I use PlugPort Agent Graph with my own PlugPort self-hosted instance?

Yes — set `PLUGPORT_URL` to your instance's base URL.

### What's the `$in` workaround mentioned in §6a.2?

An older PlugPort version had a bug where `{ field: { $in: ['a', 'b'] } }` compared the entire field against the array. `@pag/core` works around this by only using `$in` on scalar string fields (`_id`, `from`, `to`, `type`). Array-valued fields use `$regex` on a space-padded keyword string instead. See [Development Notes §6a](./notes#6a--plugport-storage-semantics-fixed-in-current-release).

---

## Monad

### Why Monad?

Monad has 1-second block times with EVM compatibility, making on-chain anchoring fast and cheap enough to use in real agent workflows. The `recordRoot()` transaction confirms in ~1 second on testnet.

### What if I don't want to anchor on Monad?

Just don't set `MONAD_RPC_URL` and `ANCHOR_CONTRACT`. The `anchor` value from `agentGraphFromEnv()` will be `null`, and the anchoring tools will return a descriptive error instead of crashing. Everything else works fine.
