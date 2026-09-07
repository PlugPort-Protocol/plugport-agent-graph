// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MemoryAnchor
/// @notice Records Merkle roots of agent memory batches. Only the 32-byte root
/// goes on-chain, never memory content. Anyone can anchor; verifiers check
/// who anchored a root (`anchoredBy`) against the agent wallet they trust.
contract MemoryAnchor {
    event Anchored(address indexed owner, bytes32 indexed root, uint256 count, string graph, uint256 at);

    error EmptyRoot();
    error EmptyBatch();
    error AlreadyAnchored(bytes32 root);

    /// @notice Block timestamp at which each root was anchored (0 = never).
    mapping(bytes32 => uint256) public anchoredAt;
    /// @notice Address that anchored each root.
    mapping(bytes32 => address) public anchoredBy;

    /// @param root Merkle root over the batch's memory hashes.
    /// @param count Number of memories in the batch.
    /// @param graph Graph name the batch belongs to (e.g. "default").
    function anchor(bytes32 root, uint256 count, string calldata graph) external {
        if (root == bytes32(0)) revert EmptyRoot();
        if (count == 0) revert EmptyBatch();
        if (anchoredAt[root] != 0) revert AlreadyAnchored(root);
        anchoredAt[root] = block.timestamp;
        anchoredBy[root] = msg.sender;
        emit Anchored(msg.sender, root, count, graph, block.timestamp);
    }
}
