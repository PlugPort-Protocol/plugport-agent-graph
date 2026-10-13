---
sidebar_position: 2
title: Merkle Proof Verification
description: How the web viewer verifies memories against MemoryAnchor.sol on Monad.
---

# Merkle Proof Verification in the Viewer

Every memory that has been anchored on Monad can be verified directly in the web viewer. Click any node with the `⛓ anchored` badge to open its detail panel, then click **Verify**.

## What Happens When You Click Verify

1. The viewer calls `GET /api/verify?id=<memoryId>`.
2. The API route calls `anchor.verify(id)` in `@pag/core`.
3. `verify()` performs four independent checks:

| Check | What it verifies |
|-------|-----------------|
| **hashValid** | The memory text + props hasn't changed since it was stored (recomputed keccak256 matches stored `hash`) |
| **anchored** | The memory's hash appears in an `AnchorRecord` in PlugPort |
| **proofValid** | The Merkle proof path from the memory's leaf to the batch root is valid (recomputed root matches `AnchorRecord._id`) |
| **onChain** | The batch root is recorded in `MemoryAnchor.sol` on Monad (live RPC call) |

4. If all four checks pass, `verified: true` is shown with a green checkmark.

## Interpreting Results

```
✓ Verified                              All four checks passed.
✗ hashValid: false                      Memory was tampered with after storage.
✗ anchored: false                       Memory hasn't been anchored yet (run anchor_now).
✗ proofValid: false                     AnchorRecord is corrupted (shouldn't happen in practice).
✗ onChain: false                        Monad RPC is down, or ANCHOR_CONTRACT is wrong.
```

## Offline Verification

You don't need the web viewer to verify. Use the CLI:

```bash
pnpm agent run "verify memory mem_abc123"
```

Or call the `verify_memory` MCP tool. Or call `@pag/core` directly:

```typescript
import { agentGraphFromEnv } from '@pag/core';
const { anchor } = agentGraphFromEnv();
const v = await anchor!.verify('mem_abc123');
console.log(v);
```
