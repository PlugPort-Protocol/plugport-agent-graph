---
sidebar_position: 1
title: Overview
description: "@pag/agent — Gemma 4 DeFi demo agent showing two-session memory recall and Monad anchoring."
---

# DeFi Demo Agent (@pag/agent)

`@pag/agent` is a **Gemma 4 powered DeFi agent** that demonstrates how PlugPort Agent Graph enables cross-session memory recall. It is the primary showcase of the project.

## The Story

The demo runs the same DeFi agent across **two separate sessions** — proving that memories persist across conversation boundaries:

| Session | What happens |
|---------|-------------|
| **1** | User teaches the agent preferences: max 1% slippage, avoid SCAM token. Agent swaps MON→USDC, fails (3.2% slippage). Remembers the failure. |
| **2** | Fresh context. Agent recalls session-1 memories. Plans a swap to a DIFFERENT pool, avoiding the failed one. Anchors memories on Monad. |
| **3 (--share)** | Wallet-2 reads wallet-1's graph via PlugPort ACL. Recalls the same memories without holding wallet-1's key. |

## Running the Demo

```bash
# Build first (predemo hook does this automatically after the first time)
pnpm build

# Full demo: Gemma 4 + PlugPort testnet + Monad anchoring
pnpm demo

# No model (scripted): same story, same tools, no GEMINI_API_KEY needed
pnpm demo --scripted

# Fast rehearsal: in-memory store and chain
pnpm demo --offline

# Cross-wallet sharing (needs PLUGPORT_API_KEY_2 + ANCHOR_ADDRESS)
pnpm demo --share

# Use a specific graph name (keeps demos isolated)
pnpm demo --graph my-demo-run
```

## Interactive Mode

```bash
pnpm agent chat        # talk to the agent yourself
pnpm agent run "what do you know about slippage?"   # one-shot
```

## Tools Available to the Agent

The agent uses the same tool set as the MCP server:

| Tool | Description |
|------|-------------|
| `remember` | Store a fact |
| `recall` | Search memory by keywords and/or entity |
| `link` | Create a typed entity relation |
| `forget` | Delete a memory |
| `anchor_now` | Anchor memories on Monad |
| `verify_memory` | Verify a memory against its anchor |
| `swap` | Mock DEX swap (for demo; not a real swap) |

See [Tool Reference](./tools) for input/output details.
