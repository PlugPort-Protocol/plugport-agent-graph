---
sidebar_position: 1
title: MemoryAnchor.sol
description: The on-chain contract that records Merkle roots of memory batches on Monad.
---

# MemoryAnchor.sol

`MemoryAnchor.sol` is a minimal Solidity contract (`pragma ^0.8.20`) deployed on Monad testnet. It records Merkle roots of memory batches, creating an immutable on-chain audit trail.

## Contract Address

| Network | Address |
|---------|---------|
| Monad Testnet | `0x12a49Ee0c56dA65Eb519cC612Ee4D3A4A089c1f4` |
| Deploy Tx | `0x0db2f16dfbc5ffff60a6396dd25ef722b7ae9f7e628da4b55ce48f7de7dfd55c` |
| Block | 70723522 |

## Interface

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MemoryAnchor {
    event Anchored(
        address indexed owner,
        bytes32 indexed root,
        uint256 count,
        string  graph,
        uint256 at
    );

    error EmptyRoot();
    error EmptyBatch();
    error AlreadyAnchored(bytes32 root);

    /// Block timestamp at which each root was anchored (0 = never).
    mapping(bytes32 => uint256) public anchoredAt;

    /// Address that anchored each root.
    mapping(bytes32 => address) public anchoredBy;

    /**
     * @notice Record a Merkle root of a memory batch.
     * @param root   keccak256 Merkle root of the memory hashes.
     * @param count  Number of memories in the batch.
     * @param graph  Graph namespace (e.g. "default").
     *
     * Reverts with AlreadyAnchored if the root was already recorded.
     * To recover idempotently from a crash between send and receipt,
     * catch the revert in the @pag/core Anchorer — it reads anchoredAt()
     * after a revert to check whether the root was already on-chain.
     */
    function anchor(bytes32 root, uint256 count, string calldata graph) external;
}
```

## Deployment

```bash
# From the plugport-agent-graph root
pnpm --filter @pag/contracts run deploy:testnet

# The script writes ANCHOR_CONTRACT to .env automatically
```

## Key Design Decisions

### Open Write — No Owner
Anyone can call `anchor()` — there is no owner or access control. This allows any wallet to anchor its own memories. The `anchoredBy` mapping records who sent each transaction. `@pag/core`'s `verify()` checks `anchoredBy` against a configurable `trustedAnchorer` (default: the `ANCHOR_PRIVATE_KEY` address), so only roots from your own wallet are considered verified.

### Reverts on Duplicate (No Idempotency)
Unlike a "silent no-op" approach, the contract **reverts** if a root is submitted twice (`AlreadyAnchored`). `@pag/core`'s `Anchorer.anchorPending()` handles recovery: if a transaction fails with `AlreadyAnchored`, it reads `anchoredAt[root]` and `anchoredBy[root]` directly to reconstruct the anchor record — so a crash between send and receipt is fully recovered on the next call.

### Batch Size
`anchor()` costs approximately **45,000 gas** per call on Monad testnet regardless of batch size. This is the fixed cost of two SSTORE writes (`anchoredAt` + `anchoredBy`). Anchor frequently in large batches (default cap: 64 memories per batch).

### Event

```
Anchored(address indexed owner, bytes32 indexed root, uint256 count, string graph, uint256 at)
```

The `Anchored` event can be used to build an off-chain index of all anchors without querying PlugPort. Both `owner` and `root` are indexed for efficient filtering.

## Merkle Tree Construction

Leaves and internal nodes use the OpenZeppelin standard:

```
leaf_hash = keccak256(0x00 ‖ memoryHash)    // 0x00 prefix distinguishes leaves
node_hash = keccak256(0x01 ‖ sort(left, right))  // sort makes the tree order-independent
```

An odd-length level promotes the unpaired node unchanged. Source: [`packages/core/src/merkle.ts`](https://github.com/PlugPort-Protocol/plugport-agent-graph/blob/main/packages/core/src/merkle.ts).
