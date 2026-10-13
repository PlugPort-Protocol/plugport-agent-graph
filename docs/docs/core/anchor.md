---
sidebar_position: 5
title: On-Chain Anchoring
description: Merkle-batch anchoring of memory hashes to MemoryAnchor.sol on Monad testnet.
---

# On-Chain Anchoring

`Anchorer` batches memory hashes into a Merkle tree and records the root on **Monad** via `MemoryAnchor.sol`. This creates an immutable, on-chain audit trail for every memory batch.

## How It Works

```
1. remember()   →  Memory stored in PlugPort (hash computed, anchorId=null)
2. anchorPending()
      → find all memories with anchorId=null
      → build Merkle tree from their hashes
      → send recordRoot(root, count) to MemoryAnchor.sol on Monad
      → store AnchorRecord in PlugPort (root, txHash, blockNumber, count, hashes[])
      → update each memory: set anchorId = root
3. verify(id)
      → recompute memory hash from stored content
      → find AnchorRecord containing this memory's hash
      → rebuild Merkle proof for this memory's leaf
      → call getRootByAnchor(root) on Monad
      → return { verified, hashValid, proofValid, onChain, explorerUrl }
```

## Configuration

```bash
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
ANCHOR_CONTRACT=0x12a49Ee0c56dA65Eb519cC612Ee4D3A4A089c1f4
ANCHOR_PRIVATE_KEY=0x...   # signs the anchor() transaction
EXPLORER_TX_URL=https://testnet.monadscan.com/tx/
```

Without these variables, `anchor` in `agentGraphFromEnv()` is `null`. All functionality except `anchor_now` and `verify_memory` works without anchoring configured.

## `anchorPending()`

```typescript
const { batch } = await anchor.anchorPending();
if (!batch) {
    console.log('No pending memories — all already anchored');
} else {
    console.log(batch.count, 'memories anchored');
    console.log('root:', batch._id);
    console.log('tx:', batch.txHash);
    console.log('explorer:', `${process.env.EXPLORER_TX_URL}${batch.txHash}`);
}
```

`batch` is `null` when there are no un-anchored memories.

## `verify(id)`

```typescript
const v = await anchor.verify('mem_abc123');
if (!v) {
    console.log('Memory not found or not yet anchored');
} else {
    console.log(v.verified);       // true if all checks pass
    console.log(v.hashValid);      // stored hash matches current content
    console.log(v.anchored);       // memory belongs to an anchor record
    console.log(v.proofValid);     // Merkle proof reconstructs the root
    console.log(v.onChain);        // root recorded on MemoryAnchor.sol
    console.log(v.explorerUrl);    // Monad explorer link
    console.log(v.problem);        // first failure reason, or null if verified
}
```

### `VerifyResult` fields

| Field | Type | Description |
|-------|------|-------------|
| `verified` | `boolean` | `true` iff all four checks below pass |
| `hashValid` | `boolean` | Recomputed hash matches `memory.hash` |
| `anchored` | `boolean` | Memory is in an `AnchorRecord` |
| `proofValid` | `boolean` | Merkle proof reconstructs the batch root |
| `onChain` | `boolean` | Root recorded on `MemoryAnchor.sol` |
| `root` | `string` | The Merkle root |
| `anchoredAt` | `number` | Block timestamp of the anchor tx |
| `anchoredBy` | `string` | Address that sent the anchor tx |
| `txHash` | `string \| null` | Anchor transaction hash |
| `explorerUrl` | `string \| null` | Block explorer link for the tx |
| `computedHash` | `string` | The hash that was recomputed |
| `proof` | `string[]` | The Merkle proof path |
| `problem` | `string \| null` | First failure reason, or `null` |

## MemoryAnchor Contract

`MemoryAnchor.sol` is a minimal Solidity contract that maps Merkle roots to metadata:

```solidity
function recordRoot(bytes32 root, uint256 count) external onlyOwner
function getRootByAnchor(bytes32 root) external view returns (uint256 timestamp, address anchoredBy, uint256 count, bool exists)
```

Source: [`contracts/MemoryAnchor.sol`](/contracts/memory-anchor).

## Gas Costs

Each `recordRoot()` call on Monad testnet costs approximately 45,000 gas regardless of how many memories are in the batch. This means anchoring 1 or 300 memories costs the same — **anchor frequently in large batches**.

## Idempotency & Crash Recovery

The contract **reverts** if `anchor()` is called with a root already recorded (`AlreadyAnchored` error). `Anchorer.anchorPending()` handles crash recovery: if the anchor tx was sent but the process crashed before the receipt was saved, the next `anchorPending()` call catches the `AlreadyAnchored` revert, reads `anchoredAt[root]` and `anchoredBy[root]` directly, and reconstructs the record — without sending a second transaction.
