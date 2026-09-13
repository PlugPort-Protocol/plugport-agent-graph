// Anchoring: commit batches of memories on-chain as a Merkle root over their
// content hashes (MemoryAnchor contract), and verify a memory against it.
// Only the root goes on-chain, never memory content.

import { Contract, JsonRpcProvider, Wallet } from 'ethers';
import type { AnchorRecord, GraphNode } from './types.js';
import { GraphError } from './errors.js';
import { GraphStore, MEMORY_LABEL, clamp } from './graph.js';
import { hashMemory } from './hash.js';
import { merkleProof, merkleRoot, verifyMerkleProof } from './merkle.js';

/** MemoryAnchor's interface (contracts/MemoryAnchor.sol). */
export const MEMORY_ANCHOR_ABI = [
    'event Anchored(address indexed owner, bytes32 indexed root, uint256 count, string graph, uint256 at)',
    'error EmptyRoot()',
    'error EmptyBatch()',
    'error AlreadyAnchored(bytes32 root)',
    'function anchor(bytes32 root, uint256 count, string graph)',
    'function anchoredAt(bytes32 root) view returns (uint256)',
    'function anchoredBy(bytes32 root) view returns (address)',
] as const;

export interface OnChainAnchor {
    /** Chain time of the anchor, in ms. */
    at: number;
    by: string;
}

export interface AnchorReceipt {
    txHash: string;
    blockNumber: number | null;
}

/** The chain side of anchoring. EthersAnchorChain is the real one; tests use a fake. */
export interface AnchorChain {
    readonly contractAddress: string;
    /** Address that signs anchor transactions; null when read-only (no key). */
    readonly signerAddress: string | null;
    chainId(): Promise<number>;
    anchor(root: string, count: number, graph: string): Promise<AnchorReceipt>;
    /** The root's on-chain record, or null if it was never anchored. */
    lookup(root: string): Promise<OnChainAnchor | null>;
}

export interface EthersAnchorChainOptions {
    rpcUrl: string;
    contract: string;
    /** Omit for a read-only chain (verify works, anchoring doesn't). */
    privateKey?: string;
}

export class EthersAnchorChain implements AnchorChain {
    readonly contractAddress: string;
    readonly signerAddress: string | null;
    private readonly provider: JsonRpcProvider;
    private readonly contract: Contract;
    private chainIdPromise: Promise<number> | null = null;

    constructor(options: EthersAnchorChainOptions) {
        // One request per HTTP call: some Monad RPCs reject JSON-RPC batches.
        this.provider = new JsonRpcProvider(options.rpcUrl, undefined, { batchMaxCount: 1 });
        const signer = options.privateKey ? new Wallet(options.privateKey, this.provider) : null;
        this.signerAddress = signer?.address ?? null;
        this.contract = new Contract(options.contract, MEMORY_ANCHOR_ABI, signer ?? this.provider);
        this.contractAddress = options.contract;
    }

    chainId(): Promise<number> {
        this.chainIdPromise ??= this.provider.getNetwork().then((n) => Number(n.chainId));
        return this.chainIdPromise;
    }

    async anchor(root: string, count: number, graph: string): Promise<AnchorReceipt> {
        if (!this.signerAddress) throw new Error('Anchoring needs ANCHOR_PRIVATE_KEY (this chain client is read-only)');
        const tx = await this.contract.getFunction('anchor')(root, count, graph);
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) throw new Error(`Anchor transaction ${tx.hash} failed`);
        return { txHash: tx.hash, blockNumber: receipt.blockNumber ?? null };
    }

    async lookup(root: string): Promise<OnChainAnchor | null> {
        const at = (await this.contract.getFunction('anchoredAt')(root)) as bigint;
        if (at === 0n) return null;
        const by = (await this.contract.getFunction('anchoredBy')(root)) as string;
        return { at: Number(at) * 1000, by };
    }
}

/**
 * A chain kept in memory: anchors land instantly with a fake tx hash. For
 * tests and offline rehearsals, never for real verification.
 */
export class InMemoryAnchorChain implements AnchorChain {
    readonly contractAddress = '0x0000000000000000000000000000000000000000';
    private readonly roots = new Map<string, OnChainAnchor>();
    private txCount = 0;

    constructor(readonly signerAddress: string | null = '0x00000000000000000000000000000000000a11ce') {}

    async chainId(): Promise<number> {
        return 0;
    }

    async anchor(root: string): Promise<AnchorReceipt> {
        if (!this.signerAddress) throw new Error('Anchoring needs a signer (this chain is read-only)');
        if (this.roots.has(root)) throw new Error(`AlreadyAnchored(${root})`);
        this.roots.set(root, { at: Date.now(), by: this.signerAddress });
        this.txCount++;
        return { txHash: `0x${this.txCount.toString(16).padStart(64, '0')}`, blockNumber: this.txCount };
    }

    async lookup(root: string): Promise<OnChainAnchor | null> {
        return this.roots.get(root) ?? null;
    }
}

export interface AnchorerOptions {
    /** Block explorer tx URL prefix, e.g. https://testnet.monadscan.com/tx/ */
    explorerTxUrl?: string;
    /**
     * Address whose anchors verify() trusts. Default: the chain's signer.
     * Without either, any anchoring address is accepted (and reported).
     */
    trustedAnchorer?: string;
    /** Max memories per anchor batch. Default 64, max 500. */
    batchMax?: number;
}

export interface AnchorBatchResult {
    root: string;
    count: number;
    memoryIds: string[];
    txHash: string | null;
    explorerUrl: string | null;
    anchoredAt: number;
    /** True when the root was already on-chain (a retry after an interrupted run). */
    recovered: boolean;
}

export interface AnchorPendingResult {
    /** Null when there was nothing (valid) to anchor. */
    batch: AnchorBatchResult | null;
    /** Pending memories left out because their stored hash no longer matches their content. */
    skipped: { id: string; reason: string }[];
}

export interface VerifyResult {
    id: string;
    /** The stored `hash` field matches the stored content. */
    hashValid: boolean;
    storedHash: string | null;
    computedHash: string;
    /** The memory belongs to an anchor batch with a stored record. */
    anchored: boolean;
    root: string | null;
    txHash: string | null;
    explorerUrl: string | null;
    leafIndex: number | null;
    proof: string[];
    /** The memory's current content hashes into the anchored root. */
    proofValid: boolean;
    /** The root is recorded on-chain (by the trusted anchorer, when one is known). */
    onChain: boolean;
    anchoredAt: number | null;
    anchoredBy: string | null;
    /** Content unchanged since it was anchored on-chain: proofValid && onChain. */
    verified: boolean;
    /** Why verification failed, when it did. */
    problem: string | null;
}

const DEFAULT_BATCH = 64;
const MAX_BATCH = 500;

export class Anchorer {
    private readonly explorerTxUrl: string | null;
    private readonly trustedAnchorer: string | null;
    private readonly batchMax: number;

    constructor(
        private readonly graph: GraphStore,
        readonly chain: AnchorChain,
        options: AnchorerOptions = {},
    ) {
        this.explorerTxUrl = options.explorerTxUrl || null;
        const trusted = options.trustedAnchorer ?? chain.signerAddress;
        this.trustedAnchorer = trusted ? trusted.toLowerCase() : null;
        this.batchMax = clamp(options.batchMax ?? DEFAULT_BATCH, 1, MAX_BATCH);
    }

    /** Memories not anchored yet, oldest first. */
    async pending(limit = this.batchMax): Promise<GraphNode[]> {
        return this.graph.findNodes(
            { label: MEMORY_LABEL, anchorId: { $exists: false } },
            { sort: { createdAt: 1 }, limit: clamp(limit, 1, MAX_BATCH) },
        );
    }

    /**
     * Anchor the oldest unanchored memories (up to batchMax) as one Merkle root.
     * Safe to re-run after a failure at any step: an existing record or an
     * already-anchored root is picked up instead of anchoring again.
     */
    async anchorPending(): Promise<AnchorPendingResult> {
        const pending = await this.pending();
        const skipped: { id: string; reason: string }[] = [];
        const batch: GraphNode[] = [];
        for (const node of pending) {
            if (typeof node.hash === 'string' && node.hash === hashMemory(node)) batch.push(node);
            else skipped.push({ id: node._id, reason: 'stored hash does not match content' });
        }
        if (batch.length === 0) return { batch: null, skipped };

        batch.sort((a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));
        const memoryIds = batch.map((n) => n._id);
        const hashes = batch.map((n) => n.hash!);
        const root = merkleRoot(hashes);

        let record = await this.graph.getAnchor(root);
        let recovered = false;
        if (!record) {
            let receipt: AnchorReceipt | null = null;
            let onChain = await this.chain.lookup(root);
            if (!onChain) {
                try {
                    receipt = await this.chain.anchor(root, batch.length, this.graph.graph);
                } catch (err) {
                    // A concurrent run may have anchored the same root first.
                    if (!(await this.chain.lookup(root))) throw err;
                }
                onChain = await this.chain.lookup(root);
                if (!onChain) throw new Error(`Root ${root} is not on-chain after anchoring`);
            }
            recovered = receipt === null;
            record = {
                _id: root,
                graph: this.graph.graph,
                count: batch.length,
                memoryIds,
                hashes,
                contract: this.chain.contractAddress,
                chainId: await this.chain.chainId(),
                txHash: receipt?.txHash ?? null,
                blockNumber: receipt?.blockNumber ?? null,
                anchoredBy: onChain.by,
                anchoredAt: onChain.at,
                createdAt: Date.now(),
            };
            if (!(await this.graph.saveAnchor(record))) {
                record = (await this.graph.getAnchor(root)) ?? record;
            }
        }
        await this.graph.markAnchored(record.memoryIds, root);

        return {
            batch: {
                root,
                count: record.count,
                memoryIds: record.memoryIds,
                txHash: record.txHash,
                explorerUrl: this.explorerUrl(record.txHash),
                anchoredAt: record.anchoredAt,
                recovered,
            },
            skipped,
        };
    }

    /** Check a memory against its anchored batch and the chain. Null if the memory doesn't exist. */
    async verify(id: string): Promise<VerifyResult | null> {
        const node = await this.graph.getNode(id);
        if (!node) return null;
        if (node.label !== MEMORY_LABEL) throw new GraphError('NOT_A_MEMORY', `${id} is a ${node.label}, not a memory`);

        const computedHash = hashMemory(node);
        const result: VerifyResult = {
            id,
            hashValid: node.hash === computedHash,
            storedHash: node.hash ?? null,
            computedHash,
            anchored: false,
            root: node.anchorId ?? null,
            txHash: null,
            explorerUrl: null,
            leafIndex: null,
            proof: [],
            proofValid: false,
            onChain: false,
            anchoredAt: null,
            anchoredBy: null,
            verified: false,
            problem: null,
        };
        if (!node.anchorId) return { ...result, problem: 'not anchored yet' };

        const record = await this.graph.getAnchor(node.anchorId);
        if (!record) return { ...result, problem: `anchor record ${node.anchorId} is missing` };
        result.anchored = true;
        result.txHash = record.txHash;
        result.explorerUrl = this.explorerUrl(record.txHash);

        const index = record.memoryIds.indexOf(id);
        const hashes = Array.isArray(record.hashes) ? record.hashes : [];
        let rootMatches = false;
        try {
            rootMatches = hashes.length === record.memoryIds.length && merkleRoot(hashes) === record._id;
        } catch {
            rootMatches = false;
        }
        if (index < 0) return { ...result, problem: 'memory is not in its anchor batch' };
        if (!rootMatches) return { ...result, problem: 'anchor record does not hash to its root' };
        result.leafIndex = index;
        result.proof = merkleProof(hashes, index);
        result.proofValid = verifyMerkleProof(computedHash, result.proof, record._id);

        const onChain = await this.chain.lookup(record._id);
        if (onChain) {
            result.anchoredAt = onChain.at;
            result.anchoredBy = onChain.by;
            result.onChain = this.trustedAnchorer === null || onChain.by.toLowerCase() === this.trustedAnchorer;
        }
        result.verified = result.proofValid && result.onChain;
        result.problem = result.verified ? null
            : !result.proofValid ? 'content changed since it was anchored'
            : !onChain ? 'root is not on-chain'
            : `root was anchored by ${onChain.by}, not the trusted anchorer`;
        return result;
    }

    async listAnchors(limit?: number): Promise<AnchorRecord[]> {
        return this.graph.listAnchors(limit);
    }

    private explorerUrl(txHash: string | null): string | null {
        return txHash && this.explorerTxUrl ? `${this.explorerTxUrl}${txHash}` : null;
    }
}
