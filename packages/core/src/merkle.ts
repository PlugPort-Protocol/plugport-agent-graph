// Merkle tree over memory hashes, for anchoring batches on-chain.
//
// leaf  = keccak256(0x00 ‖ memoryHash)
// node  = keccak256(0x01 ‖ min(a, b) ‖ max(a, b))   (sorted pair)
// An odd node at the end of a level moves up unchanged. The 0x00/0x01
// prefixes keep a leaf from being passed off as an inner node. Sorted pairs
// mean a proof is just the list of sibling hashes, with no left/right flags.

import { concat, keccak256 } from 'ethers';

const HASH_RE = /^0x[0-9a-f]{64}$/;

export function merkleLeaf(memoryHash: string): string {
    if (!HASH_RE.test(memoryHash)) throw new Error(`Not a 32-byte lowercase hex hash: ${memoryHash}`);
    return keccak256(concat(['0x00', memoryHash]));
}

function pair(a: string, b: string): string {
    return keccak256(concat(['0x01', a < b ? a : b, a < b ? b : a]));
}

function nextLevel(level: string[]): string[] {
    const up: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
        up.push(i + 1 < level.length ? pair(level[i]!, level[i + 1]!) : level[i]!);
    }
    return up;
}

/** Root over memory hashes, in the given order. */
export function merkleRoot(memoryHashes: string[]): string {
    if (memoryHashes.length === 0) throw new Error('Cannot build a Merkle root over zero hashes');
    let level = memoryHashes.map(merkleLeaf);
    while (level.length > 1) level = nextLevel(level);
    return level[0]!;
}

/** Sibling hashes from the leaf at `index` up to the root. */
export function merkleProof(memoryHashes: string[], index: number): string[] {
    if (!Number.isInteger(index) || index < 0 || index >= memoryHashes.length) {
        throw new Error(`Leaf index ${index} is out of range (0-${memoryHashes.length - 1})`);
    }
    const proof: string[] = [];
    let level = memoryHashes.map(merkleLeaf);
    let i = index;
    while (level.length > 1) {
        const sibling = i % 2 === 0 ? i + 1 : i - 1;
        if (sibling < level.length) proof.push(level[sibling]!);
        level = nextLevel(level);
        i = Math.floor(i / 2);
    }
    return proof;
}

export function verifyMerkleProof(memoryHash: string, proof: string[], root: string): boolean {
    if (!HASH_RE.test(memoryHash) || !HASH_RE.test(root) || !proof.every((p) => HASH_RE.test(p))) return false;
    return proof.reduce(pair, merkleLeaf(memoryHash)) === root;
}
