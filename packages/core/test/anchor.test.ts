import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Interface } from 'ethers';
import { GraphStore } from '../src/graph.js';
import { Memory } from '../src/memory.js';
import { Anchorer, MEMORY_ANCHOR_ABI, type AnchorChain, type AnchorReceipt, type OnChainAnchor } from '../src/anchor.js';
import { hashMemory } from '../src/hash.js';
import { verifyMerkleProof } from '../src/merkle.js';
import { GraphError } from '../src/errors.js';
import type { AnchorRecord } from '../src/types.js';
import { FakeStore } from './fake-store.js';

const SIGNER = '0x27bb12A76BD3eA34aC584F2031DfA48f6885B3CF';
const OTHER = '0x1111111111111111111111111111111111111111';

class FakeChain implements AnchorChain {
    readonly contractAddress = '0x12a49Ee0c56dA65Eb519cC612Ee4D3A4A089c1f4';
    readonly roots = new Map<string, OnChainAnchor & { count: number; graph: string }>();
    txs = 0;
    /** Record the anchor but throw, like a receipt wait that times out. */
    failAfterSend = false;
    constructor(readonly signerAddress: string | null = SIGNER) {}
    async chainId() { return 10143; }
    async anchor(root: string, count: number, graph: string): Promise<AnchorReceipt> {
        this.txs++;
        if (this.roots.has(root)) throw new Error(`AlreadyAnchored(${root})`);
        this.roots.set(root, { at: 1_700_000_000_000, by: this.signerAddress ?? OTHER, count, graph });
        if (this.failAfterSend) { this.failAfterSend = false; throw new Error('timeout waiting for receipt'); }
        return { txHash: `0x${this.txs.toString(16).padStart(64, '0')}`, blockNumber: 100 + this.txs };
    }
    async lookup(root: string): Promise<OnChainAnchor | null> {
        const r = this.roots.get(root);
        return r ? { at: r.at, by: r.by } : null;
    }
}

let store: FakeStore;
let graph: GraphStore;
let memory: Memory;
let chain: FakeChain;
let anchorer: Anchorer;

const tick = () => new Promise((r) => setTimeout(r, 5));

async function seed(n: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
        ids.push((await memory.remember({ text: `Observation number ${i} about pool MON/USDC.` })).memory._id);
        await tick();
    }
    return ids;
}

beforeEach(() => {
    store = new FakeStore();
    graph = new GraphStore(store);
    memory = new Memory(graph);
    chain = new FakeChain();
    anchorer = new Anchorer(graph, chain, { explorerTxUrl: 'https://testnet.monadscan.com/tx/' });
});

describe('anchorPending', () => {
    it('anchors unanchored memories as one root, in two writes', async () => {
        const ids = await seed(3);
        const writes = store.writes;
        const { batch, skipped } = await anchorer.anchorPending();
        expect(store.writes - writes).toBe(2); // anchor record + updateMany
        expect(skipped).toEqual([]);
        expect(batch).toMatchObject({ count: 3, recovered: false, memoryIds: [...ids].sort() });
        expect(batch!.explorerUrl).toBe(`https://testnet.monadscan.com/tx/${batch!.txHash}`);
        expect(chain.txs).toBe(1);
        expect(chain.roots.get(batch!.root)).toMatchObject({ count: 3, graph: 'default' });

        const record = store.all(graph.anchorsCollection)[0] as unknown as AnchorRecord;
        expect(record).toMatchObject({ _id: batch!.root, count: 3, chainId: 10143, anchoredBy: SIGNER, txHash: batch!.txHash });
        const nodes = await graph.getNodes(record.memoryIds);
        expect(record.hashes).toEqual(record.memoryIds.map((id) => nodes.find((n) => n._id === id)!.hash));
        expect(nodes.every((n) => n.anchorId === batch!.root)).toBe(true);
        // entity nodes are never anchored
        expect(store.all(graph.nodesCollection).filter((n) => n.label !== 'Memory').every((n) => !n.anchorId)).toBe(true);
    });

    it('does nothing when everything is anchored', async () => {
        await seed(2);
        await anchorer.anchorPending();
        const writes = store.writes;
        expect(await anchorer.anchorPending()).toEqual({ batch: null, skipped: [] });
        expect(chain.txs).toBe(1);
        expect(store.writes).toBe(writes);
    });

    it('anchors new memories in a new batch', async () => {
        const [a] = await seed(1);
        const first = (await anchorer.anchorPending()).batch!;
        const [b] = await seed(1);
        const second = (await anchorer.anchorPending()).batch!;
        expect(first.memoryIds).toEqual([a]);
        expect(second.memoryIds).toEqual([b]);
        expect(second.root).not.toBe(first.root);
    });

    it('takes the oldest memories first, batchMax at a time', async () => {
        const ids = await seed(3);
        const small = new Anchorer(graph, chain, { batchMax: 2 });
        expect((await small.anchorPending()).batch!.memoryIds).toEqual(ids.slice(0, 2).sort());
        expect((await small.anchorPending()).batch!.memoryIds).toEqual([ids[2]]);
    });

    it('skips memories whose content no longer matches their hash', async () => {
        const [good, bad] = await seed(2);
        store.tamper(graph.nodesCollection, bad!, { text: 'rewritten' });
        const { batch, skipped } = await anchorer.anchorPending();
        expect(batch!.memoryIds).toEqual([good]);
        expect(skipped).toEqual([{ id: bad, reason: 'stored hash does not match content' }]);
        expect((await graph.getNode(bad!))!.anchorId).toBeUndefined();
    });

    it('recovers when the transaction landed but the run failed before saving', async () => {
        await seed(2);
        chain.failAfterSend = true;
        const { batch } = await anchorer.anchorPending();
        expect(batch).toMatchObject({ recovered: true, txHash: null, explorerUrl: null });
        expect(chain.txs).toBe(1);
        expect((await anchorer.verify(batch!.memoryIds[0]!))!.verified).toBe(true);
    });

    it('recovers when the root was anchored before an interrupted run', async () => {
        await seed(2);
        const original = store.updateMany.bind(store);
        store.updateMany = async () => { throw new Error('PlugPort unreachable'); };
        await expect(anchorer.anchorPending()).rejects.toThrow('unreachable');
        store.updateMany = original;

        const { batch } = await anchorer.anchorPending();
        expect(chain.txs).toBe(1); // no second transaction
        expect(batch!.recovered).toBe(false); // the saved record (with its tx hash) was reused
        expect(batch!.txHash).not.toBeNull();
        expect((await graph.getNode(batch!.memoryIds[0]!))!.anchorId).toBe(batch!.root);
    });

    it('needs a signer to anchor', async () => {
        await seed(1);
        const readOnly = new Anchorer(graph, { ...chain, signerAddress: null, anchor: async () => { throw new Error('read-only'); }, lookup: chain.lookup.bind(chain), chainId: chain.chainId });
        await expect(readOnly.anchorPending()).rejects.toThrow('read-only');
    });
});

describe('verify', () => {
    it('verifies an anchored memory', async () => {
        const [id] = await seed(3);
        const { batch } = await anchorer.anchorPending();
        const v = (await anchorer.verify(id!))!;
        expect(v).toMatchObject({
            id, hashValid: true, anchored: true, root: batch!.root, txHash: batch!.txHash,
            explorerUrl: batch!.explorerUrl, proofValid: true, onChain: true, anchoredBy: SIGNER,
            verified: true, problem: null,
        });
        // 3 leaves: 2 proof steps, or 1 for the leaf that sorts last (it moves up unpaired)
        expect(v.proof.length).toBe(v.leafIndex === 2 ? 1 : 2);
        expect(verifyMerkleProof(v.computedHash, v.proof, v.root!)).toBe(true);
    });

    it('reports an unanchored memory', async () => {
        const [id] = await seed(1);
        expect(await anchorer.verify(id!)).toMatchObject({ hashValid: true, anchored: false, verified: false, problem: 'not anchored yet' });
    });

    it('catches edited content, and only for the edited memory', async () => {
        const [a, b] = await seed(2);
        await anchorer.anchorPending();
        store.tamper(graph.nodesCollection, a!, { text: 'Swap succeeded.' });
        expect(await anchorer.verify(a!)).toMatchObject({ hashValid: false, proofValid: false, verified: false, problem: 'content changed since it was anchored' });
        expect((await anchorer.verify(b!))!.verified).toBe(true);
    });

    it('catches edited content even when the stored hash is recomputed to match', async () => {
        const [a] = await seed(2);
        await anchorer.anchorPending();
        const node = (await graph.getNode(a!))!;
        const forged = { ...node, text: 'Swap succeeded.' };
        store.tamper(graph.nodesCollection, a!, { text: forged.text, hash: hashMemory(forged) });
        expect(await anchorer.verify(a!)).toMatchObject({ hashValid: true, proofValid: false, verified: false });
    });

    it('catches a tampered anchor record', async () => {
        const [a, b] = await seed(2);
        const { batch } = await anchorer.anchorPending();
        const forged = (await graph.getNode(a!))!;
        const record = store.all(graph.anchorsCollection)[0] as unknown as AnchorRecord;
        const i = record.memoryIds.indexOf(a!);
        const hashes = [...record.hashes];
        hashes[i] = hashMemory({ ...forged, text: 'Swap succeeded.' });
        store.tamper(graph.anchorsCollection, batch!.root, { hashes });
        store.tamper(graph.nodesCollection, a!, { text: 'Swap succeeded.' });
        expect(await anchorer.verify(a!)).toMatchObject({ proofValid: false, verified: false, problem: 'anchor record does not hash to its root' });
        expect((await anchorer.verify(b!))!.verified).toBe(false);
    });

    it('rejects a root anchored by someone other than the trusted anchorer', async () => {
        const [a] = await seed(1);
        const { batch } = await anchorer.anchorPending();
        chain.roots.set(batch!.root, { ...chain.roots.get(batch!.root)!, by: OTHER });
        expect(await anchorer.verify(a!)).toMatchObject({ proofValid: true, onChain: false, verified: false, anchoredBy: OTHER });
        expect((await anchorer.verify(a!))!.problem).toMatch(/not the trusted anchorer/);
        // an explicitly trusted address is accepted
        const trusting = new Anchorer(graph, chain, { trustedAnchorer: OTHER.toUpperCase().replace('0X', '0x') });
        expect((await trusting.verify(a!))!.verified).toBe(true);
    });

    it('reports a root missing on-chain', async () => {
        const [a] = await seed(1);
        const { batch } = await anchorer.anchorPending();
        chain.roots.delete(batch!.root);
        expect(await anchorer.verify(a!)).toMatchObject({ proofValid: true, onChain: false, verified: false, problem: 'root is not on-chain' });
    });

    it('returns null for a missing memory and rejects entities', async () => {
        await memory.remember({ text: 'Alice likes MON.', entities: [{ label: 'User', name: 'Alice' }] });
        expect(await anchorer.verify('mem_nope')).toBeNull();
        await expect(anchorer.verify('user_alice')).rejects.toBeInstanceOf(GraphError);
    });

    it('lists anchor records, newest first', async () => {
        await seed(1);
        await anchorer.anchorPending();
        expect((await anchorer.listAnchors()).length).toBe(1);
    });
});

describe('MemoryAnchor ABI', () => {
    it('matches the compiled contract', () => {
        const artifact = JSON.parse(readFileSync(fileURLToPath(new URL('../../../contracts/artifacts/MemoryAnchor.json', import.meta.url)), 'utf8'));
        // names of getter parameters differ (solc drops them), so compare types only
        const sigs = (abi: unknown) => new Interface(abi as never).fragments
            .map((f) => `${f.type} ${f.format('sighash')} ${'outputs' in f ? (f.outputs as { type: string }[]).map((o) => o.type).join(',') : ''}`)
            .sort();
        expect(sigs(MEMORY_ANCHOR_ABI)).toEqual(sigs(artifact.abi));
    });
});
