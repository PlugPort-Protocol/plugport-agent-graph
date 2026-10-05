// Shapes of the documents PlugPort Agent Graph keeps in PlugPort, and of the
// minimal document-store interface the graph needs from PlugPort.

export type Props = Record<string, unknown>;

/** A node in the graph: an entity (Person, Token, Pool, ...) or a Memory. */
export interface GraphNode {
    _id: string;
    label: string;
    /** Display name for entities; absent on memories. */
    name?: string;
    props: Props;
    /** Memory content (Memory nodes only). */
    text?: string;
    /**
     * Space-padded keyword string, e.g. " alice atlas launch ". Kept as a
     * string because PlugPort's filters compare whole field values (an array
     * field never matches $in on one of its elements), while $regex on a
     * string works.
     */
    keywords: string;
    /** keccak256 of the memory's canonical content (Memory nodes only). */
    hash?: string;
    /** Merkle root of the anchor batch this memory was committed in. */
    anchorId?: string;
    createdAt: number;
    updatedAt: number;
}

/** A directed, typed relationship between two nodes. */
export interface GraphEdge {
    _id: string;
    from: string;
    to: string;
    type: string;
    props: Props;
    createdAt: number;
}

export interface Subgraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

/**
 * Result of a breadth-first graph traversal.
 * Extends Subgraph with per-node depth and a truncation flag.
 */
export interface Traversal extends Subgraph {
    /** Hop distance of each returned node from the nearest start node. */
    depth: Record<string, number>;
    /**
     * True when the node-count cap (300) was reached before all reachable
     * nodes were visited. Some nodes in the graph are not included.
     */
    truncated: boolean;
}

// ---- document store (the subset of PlugPort's HTTP API we use) ----

export type Filter = Record<string, unknown>;
export type SortSpec = Record<string, 1 | -1>;

export interface FindOptions {
    sort?: SortSpec;
    limit?: number;
    skip?: number;
    projection?: Record<string, 0 | 1>;
}

export interface Update {
    $set?: Record<string, unknown>;
    $unset?: Record<string, unknown>;
    $inc?: Record<string, number>;
}

export interface UpdateResult {
    matchedCount: number;
    modifiedCount: number;
    upsertedId: string | null;
}

export interface DocStore {
    /** Insert documents; resolves to the number inserted. */
    insertMany(collection: string, documents: Record<string, unknown>[]): Promise<number>;
    find<T = Record<string, unknown>>(collection: string, filter: Filter, options?: FindOptions): Promise<T[]>;
    updateOne(collection: string, filter: Filter, update: Update, options?: { upsert?: boolean }): Promise<UpdateResult>;
    updateMany(collection: string, filter: Filter, update: Update): Promise<UpdateResult>;
    /** Delete matching documents; resolves to the number deleted. */
    deleteMany(collection: string, filter: Filter): Promise<number>;
    count(collection: string, filter: Filter): Promise<number>;
}

/**
 * A batch of memories whose Merkle root was anchored on-chain. Stored in
 * mem_anchors with the root as _id. `hashes` keeps the memory hashes as they
 * were anchored, so one tampered memory doesn't break the proofs of the others.
 */
export interface AnchorRecord {
    /** Merkle root (0x + 64 hex). */
    _id: string;
    graph: string;
    count: number;
    /** Memory ids in leaf order. */
    memoryIds: string[];
    /** Memory hashes as anchored, aligned with memoryIds. */
    hashes: string[];
    contract: string;
    chainId: number;
    /** Null when the root was found already anchored (a retry after a crash). */
    txHash: string | null;
    blockNumber: number | null;
    anchoredBy: string;
    /** Chain time of the anchor, in ms. */
    anchoredAt: number;
    createdAt: number;
}
