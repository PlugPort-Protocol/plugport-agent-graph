---
sidebar_position: 2
title: Demo Walkthrough
description: Step-by-step breakdown of what the two-session demo does and what to expect.
---

# Demo Walkthrough

This page walks through exactly what `pnpm demo` does, what the agent says, and how memory flows across sessions.

## Session 1 — Teaching Preferences

The agent receives a series of user messages in `SESSION_1`:

```
"Remember my rules: I never accept more than 1% slippage on any swap,
and I never want to touch the SCAM token."

"Try swapping 5 MON for USDC on pool MON/USDC-A."

"The swap failed — got 3.2% slippage. Remember this."

"What are my trading rules?"
```

After this session, the graph contains:
- 2-4 Memory nodes (preferences + failure)
- Entity nodes: `User:me`, `Token:USDC`, `Pool:MON/USDC-A`, `Token:SCAM`
- Edges: `MENTIONS`, `AVOIDS`, `FAILED_ON`

## Session 2 — Recall and Adapt

A **fresh agent** (empty conversation history) receives `SESSION_2`:

```
"What do you remember about my trading preferences?"

"I want to swap 10 MON for USDC. Which pool should I use?"

"Anchor all my memories on Monad."
```

The agent:
1. Calls `recall(query: "trading preferences slippage swap", hops: 1)`
2. Gets back session-1 memories — cross-session recall proven ✓
3. Plans to use a different pool (avoids the failed `MON/USDC-A`)
4. Calls `anchor_now()` → Monad tx recorded

## Step 6 — Cross-Wallet Sharing (`--share`)

With `--share`, a third phase runs after session 2:

```
Wallet-2 (PLUGPORT_API_KEY_2) reads wallet-1's graph
```

1. `setupSharedContext(ownerAddress)` creates a new `Memory` instance using wallet-2's API key with `owner=wallet-1-address`.
2. `memory.recall(query: "slippage preference avoid failure swap")` queries wallet-1's namespace as wallet-2.
3. If the graph was shared (`grantRole` in PlugPort dashboard), wallet-2 sees the same memories as wallet-1.

**Expected output:**
```
Step 6: Cross-wallet graph sharing (wallet-2 reads wallet-1's graph)
  PlugPort https://testnet.plugport.wtf (wallet-2 reading 0xABCD1234…'s graph)

Wallet-2 recalled from wallet-1's graph:
  • I never accept more than 1% slippage on any swap.
  • Swap of 5 MON for USDC failed on MON/USDC-A: slippage was 3.2%.
  • I never want to touch the SCAM token.

  ✓ Cross-wallet memory sharing works — 3 memories recalled as wallet-2
```

## Scripted Mode

`pnpm demo --scripted` runs the same scenario without a language model. Each user message is fed to `runTool` directly in a hardcoded sequence, so you can see the full tool chain without a GEMINI_API_KEY. The expected output and tool calls are identical to the full demo.

## What "Verified" Means at the End

After `anchor_now`, `verify_memory` checks:

```
✓ stored hash matches content       (hashValid)
✓ belongs to an anchor batch        (anchored)
✓ Merkle proof valid (4-step)       (proofValid)
✓ root recorded on Monad            (onChain)
```

All four checks passing means: the exact text the agent stored is provably unchanged since it was anchored on the Monad blockchain.
