import { describe, it, expect } from 'vitest';
import { keccak256, toUtf8Bytes } from 'ethers';
import { merkleLeaf, merkleProof, merkleRoot, verifyMerkleProof } from '../src/merkle.js';

const h = (s: string) => keccak256(toUtf8Bytes(s));
const hashes = (n: number) => Array.from({ length: n }, (_, i) => h(`memory-${i}`));

describe('merkle', () => {
    it('every leaf proves into the root, for batch sizes 1 to 17', () => {
        for (let n = 1; n <= 17; n++) {
            const hs = hashes(n);
            const root = merkleRoot(hs);
            for (let i = 0; i < n; i++) {
                expect(verifyMerkleProof(hs[i]!, merkleProof(hs, i), root)).toBe(true);
            }
        }
    });

    it('a single-memory root is that memory\'s leaf', () => {
        const [a] = hashes(1);
        expect(merkleRoot([a!])).toBe(merkleLeaf(a!));
        expect(merkleProof([a!], 0)).toEqual([]);
    });

    it('rejects a changed hash, a wrong proof or a wrong root', () => {
        const hs = hashes(5);
        const root = merkleRoot(hs);
        expect(verifyMerkleProof(h('tampered'), merkleProof(hs, 2), root)).toBe(false);
        expect(verifyMerkleProof(hs[2]!, merkleProof(hs, 3), root)).toBe(false);
        expect(verifyMerkleProof(hs[2]!, merkleProof(hs, 2), merkleRoot(hashes(4)))).toBe(false);
        expect(verifyMerkleProof(hs[2]!, ['0x1234'], root)).toBe(false);
    });

    it('depends on leaf order and content', () => {
        const hs = hashes(4);
        // pairs are sorted, so only an order that changes which leaves pair up changes the root
        expect(merkleRoot(hs)).not.toBe(merkleRoot([hs[0]!, hs[2]!, hs[1]!, hs[3]!]));
        expect(merkleRoot(hs)).not.toBe(merkleRoot(hashes(3)));
    });

    it('keeps leaves and inner nodes apart', () => {
        const [a, b] = hashes(2);
        const root = merkleRoot([a!, b!]);
        // the two-leaf root is not the leaf of anything we fed in
        expect(root).not.toBe(merkleLeaf(a!));
        expect(merkleRoot([root])).not.toBe(root);
    });

    it('validates input', () => {
        expect(() => merkleRoot([])).toThrow(/zero/);
        expect(() => merkleLeaf('0xABC')).toThrow();
        expect(() => merkleLeaf(h('x').toUpperCase())).toThrow();
        expect(() => merkleProof(hashes(3), 3)).toThrow(/out of range/);
    });

    it('is stable (changing the scheme invalidates every anchored root)', () => {
        expect(merkleRoot(hashes(3))).toMatchInlineSnapshot(`"0x97b2c1878c0da527fd1f2323ae477a38d036803aaba3d05ef63978a481805835"`);
    });
});
