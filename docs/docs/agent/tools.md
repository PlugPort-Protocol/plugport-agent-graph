---
sidebar_position: 3
title: Agent Tool Reference
description: All tools available to the @pag/agent DeFi demo agent (same as MCP tools plus swap).
---

# Agent Tool Reference

The DeFi demo agent has the same 6 memory tools as the MCP server, plus one additional tool specific to the demo.

## Memory Tools

See the [MCP Tool Reference](../mcp/tools) for `remember`, `recall`, `link`, `forget`, `anchor_now`, and `verify_memory` — these are identical between the agent and MCP server.

---

## `swap` (agent-only)

A **mock DEX swap** for demo purposes. Does not submit any real transaction.

**Input:**

```typescript
{
    from_token: string,     // e.g. "MON"
    to_token: string,       // e.g. "USDC"
    amount: number,         // amount of from_token to swap
    pool: string,           // pool identifier, e.g. "MON/USDC-A"
    max_slippage?: number,  // max acceptable slippage (default 0.01 = 1%)
}
```

**Output:**

The mock DEX (`MockDex`) uses deterministic pool-specific slippage values defined in `packages/agent/src/dex.ts`. The demo is scripted so the first pool (`MON/USDC-A`) returns high slippage (3.2%), and subsequent pools return acceptable slippage — demonstrating that the agent adapts based on recalled memory.

```typescript
// Success
{ success: true, received: 9.93, slippage: 0.007, pool: 'MON/USDC-B' }

// Failure
{ success: false, error: 'Slippage 3.2% exceeded max 1%', slippage: 0.032, pool: 'MON/USDC-A' }
```

The agent is expected to:
1. Try the swap.
2. If it fails, call `remember()` with the failure and the pool name.
3. On next recall, avoid that pool.
