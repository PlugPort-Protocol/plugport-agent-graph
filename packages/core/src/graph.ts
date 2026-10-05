// The graph layer: nodes and edges stored as ordinary documents in three
// PlugPort collections in the caller's wallet namespace (mem_nodes,
// mem_edges, mem_anchors for the default graph).
//
// PlugPort query behavior this relies on (checked against the PlugPort
// source):
// - `_id` is unique; inserting an existing `_id` fails with code 11000 and
//   the whole insertMany batch is rejected (every PlugPort storage adapter
//   writes a batch at once). Writes therefore look up existing ids first and
//   insert only the new ones. PlugPort releases include a fix (insert
//   rollback) without which a rejected batch left its other _ids
//   un-insertable; see docs/NOTES.md.
// - find() returns at most 1000 documents unless a limit is passed (max 5000).
// - `{field: {$in: [...]}}` compares the whole field value, so it is only used
//   on scalar fields (_id, from, to, type).
// - An indexed equality condition combined with a top-level $or/$and makes
//   the planner skip the $or/$and. No secondary indexes are created, so every
//   filter here is evaluated in full. Don't add indexes on from/to/type/label
//   without revisiting the filters below.

import type { AnchorRecord, DocStore, Filter, GraphEdge, GraphNode, Props, Subgraph, Traversal } from './types.js';
import { GraphError, PlugPortError } from './errors.js';
import { assertGraphName, assertLabel, assertNodeId, edgeId, normalizeEdgeType, normalizeWallet } from './ids.js';
import { keywordString, tokenize } from './text.js';
import { canonicalJson } from './hash.js';

export const MEMORY_LABEL = 'Memory';

export type Direction = 'out' | 'in' | 'both';

export interface NodeInput {
    id: string;
    label: string;
    name?: string;
    props?: Props;
    /** Memory nodes only; ignored when the node already exists. */
    text?: string;
    hash?: string;
    createdAt?: number;
}

export interface EdgeInput {
    from: string;
    type: string;
    to: string;
    props?: Props;
}

export interface TraverseOptions {
    /** Hops from the start nodes. Default 2, max 3. */
    maxDepth?: number;
    /** Max nodes returned, start nodes included. Default 100, max 300. */
    limit?: number;
    /** Only follow these relation types. */
    types?: string[];
    direction?: Direction;
}


export interface GraphStoreOptions {
    /** Graph name. Default "default" (collections mem_nodes/mem_edges/mem_anchors). */
    graph?: string;
    /** Read another wallet's graph that it made public or shared with you. */
    owner?: string;
}

const IN_CHUNK = 1000;          // PlugPort rejects $in arrays over 2000
const EDGE_SCAN_LIMIT = 2000;   // edges fetched per BFS level (per id chunk)
const MAX_DEPTH = 3;
const MAX_TRAVERSE_NODES = 300;
const MAX_NAME = 200;
const MAX_TEXT = 4000;

export class GraphStore {
    readonly graph: string;
    readonly nodesCollection: string;
    readonly edgesCollection: string;
    readonly anchorsCollection: string;

    constructor(private readonly store: DocStore, options: GraphStoreOptions = {}) {
        const graph = options.graph ?? 'default';
        assertGraphName(graph);
        this.graph = graph;
        const prefix = options.owner ? `${normalizeWallet(options.owner)}.` : '';
        const base = graph === 'default' ? 'mem' : `mem_${graph}`;
        this.nodesCollection = `${prefix}${base}_nodes`;
        this.edgesCollection = `${prefix}${base}_edges`;
        this.anchorsCollection = `${prefix}${base}_anchors`;
    }

    // ---- nodes ----

    async getNode(id: string): Promise<GraphNode | null> {
        return (await this.getNodes([id]))[0] ?? null;
    }

    /** Nodes with these ids (missing ids are skipped), in no particular order. */
    async getNodes(ids: string[]): Promise<GraphNode[]> {
        return this.byIds<GraphNode>(this.nodesCollection, ids);
    }

    async findNodes(filter: Filter, options: { limit?: number; sort?: Record<string, 1 | -1> } = {}): Promise<GraphNode[]> {
        return this.store.find<GraphNode>(this.nodesCollection, filter, options);
    }

    /**
     * Create nodes that don't exist; for existing ones merge `props` and update
     * `label`/`name`. Memory nodes are immutable once written. Returns the
     * resulting nodes in input order (one per distinct id).
     */
    async upsertNodes(inputs: NodeInput[]): Promise<GraphNode[]> {
        const merged = mergeNodeInputs(inputs.map(validateNodeInput));
        if (merged.length === 0) return [];
        try {
            return await this.writeNodes(merged);
        } catch (err) {
            // Another writer inserted one of these ids between our lookup and
            // insert, so PlugPort rejected the batch. A second pass sees that
            // id as existing and inserts the rest.
            if (err instanceof PlugPortError && err.isDuplicateKey) return this.writeNodes(merged);
            throw err;
        }
    }

    private async writeNodes(inputs: NodeInput[]): Promise<GraphNode[]> {
        const existing = new Map((await this.getNodes(inputs.map((n) => n.id))).map((n) => [n._id, n]));
        const now = Date.now();
        const toInsert: GraphNode[] = [];
        const updates: GraphNode[] = [];
        const result: GraphNode[] = [];

        for (const input of inputs) {
            const current = existing.get(input.id);
            if (!current) {
                const node: GraphNode = {
                    _id: input.id,
                    label: input.label,
                    ...(input.name !== undefined ? { name: input.name } : {}),
                    props: input.props ?? {},
                    ...(input.text !== undefined ? { text: input.text } : {}),
                    keywords: keywordString(tokenize(`${input.name ?? ''} ${input.text ?? ''}`)),
                    ...(input.hash !== undefined ? { hash: input.hash } : {}),
                    createdAt: input.createdAt ?? now,
                    updatedAt: now,
                };
                toInsert.push(node);
                result.push(node);
                continue;
            }
            const props = { ...current.props, ...(input.props ?? {}) };
            const name = input.name ?? current.name;
            const changed = input.label !== current.label
                || name !== current.name
                || canonicalJson(props) !== canonicalJson(current.props);
            if (!changed) {
                result.push(current);
                continue;
            }
            if (current.label === MEMORY_LABEL) {
                throw new GraphError('INVALID_INPUT', `Memory ${current._id} is immutable; forget it and remember a new one instead`);
            }
            const updated: GraphNode = {
                ...current,
                label: input.label,
                ...(name !== undefined ? { name } : {}),
                props,
                keywords: keywordString(tokenize(`${name ?? ''} ${current.text ?? ''}`)),
                updatedAt: now,
            };
            updates.push(updated);
            result.push(updated);
        }

        if (toInsert.length) await this.store.insertMany(this.nodesCollection, toInsert as unknown as Record<string, unknown>[]);
        for (const node of updates) {
            await this.store.updateOne(this.nodesCollection, { _id: node._id }, {
                $set: {
                    label: node.label,
                    ...(node.name !== undefined ? { name: node.name } : {}),
                    props: node.props,
                    keywords: node.keywords,
                    updatedAt: node.updatedAt,
                },
            });
        }
        return result;
    }

    /** Delete a node and every edge touching it. */
    async deleteNode(id: string): Promise<{ deleted: boolean; edgesDeleted: number }> {
        assertNodeId(id);
        const edgesDeleted = await this.store.deleteMany(this.edgesCollection, { $or: [{ from: id }, { to: id }] });
        const deleted = await this.store.deleteMany(this.nodesCollection, { _id: id });
        return { deleted: deleted > 0, edgesDeleted };
    }

    // ---- edges ----

    async getEdges(ids: string[]): Promise<GraphEdge[]> {
        return this.byIds<GraphEdge>(this.edgesCollection, ids);
    }

    /**
     * Create edges that don't exist (both endpoints must exist); for existing
     * ones merge `props`. Returns the resulting edges in input order.
     */
    async upsertEdges(inputs: EdgeInput[]): Promise<GraphEdge[]> {
        const merged = mergeEdgeInputs(inputs.map(validateEdgeInput));
        if (merged.length === 0) return [];

        const endpoints = [...new Set(merged.flatMap((e) => [e.from, e.to]))];
        const found = new Set((await this.getNodes(endpoints)).map((n) => n._id));
        const missing = endpoints.filter((id) => !found.has(id));
        if (missing.length) {
            throw new GraphError('NODE_NOT_FOUND', `Unknown node(s): ${missing.join(', ')}`);
        }

        try {
            return await this.writeEdges(merged);
        } catch (err) {
            if (err instanceof PlugPortError && err.isDuplicateKey) return this.writeEdges(merged);
            throw err;
        }
    }

    private async writeEdges(inputs: EdgeInput[]): Promise<GraphEdge[]> {
        const ids = inputs.map((e) => edgeId(e.from, e.type, e.to));
        const existing = new Map((await this.getEdges(ids)).map((e) => [e._id, e]));
        const now = Date.now();
        const toInsert: GraphEdge[] = [];
        const updates: GraphEdge[] = [];
        const result: GraphEdge[] = [];

        inputs.forEach((input, i) => {
            const id = ids[i]!;
            const current = existing.get(id);
            if (!current) {
                const edge: GraphEdge = { _id: id, from: input.from, to: input.to, type: input.type, props: input.props ?? {}, createdAt: now };
                toInsert.push(edge);
                result.push(edge);
                return;
            }
            const props = { ...current.props, ...(input.props ?? {}) };
            if (canonicalJson(props) === canonicalJson(current.props)) {
                result.push(current);
                return;
            }
            const updated = { ...current, props };
            updates.push(updated);
            result.push(updated);
        });

        if (toInsert.length) await this.store.insertMany(this.edgesCollection, toInsert as unknown as Record<string, unknown>[]);
        for (const edge of updates) {
            await this.store.updateOne(this.edgesCollection, { _id: edge._id }, { $set: { props: edge.props } });
        }
        return result;
    }

    async deleteEdge(id: string): Promise<boolean> {
        return (await this.store.deleteMany(this.edgesCollection, { _id: id })) > 0;
    }

    // ---- traversal ----

    /** Edges touching `id` and the nodes at their other ends. */
    async neighbors(id: string, options: { direction?: Direction; types?: string[]; limit?: number } = {}): Promise<Subgraph> {
        assertNodeId(id);
        const limit = clamp(options.limit ?? 100, 1, 1000);
        const types = options.types?.map(normalizeEdgeType);
        const edges = await this.store.find<GraphEdge>(
            this.edgesCollection,
            edgeFilter([id], options.direction ?? 'both', types),
            { limit },
        );
        const nodes = await this.getNodes([id, ...edges.flatMap((e) => [e.from, e.to])]);
        const present = new Set(nodes.map((n) => n._id));
        return { nodes, edges: edges.filter((e) => present.has(e.from) && present.has(e.to)) };
    }

    /** Breadth-first expansion from `start`, one edge query per level. */
    async traverse(start: string | string[], options: TraverseOptions = {}): Promise<Traversal> {
        const maxDepth = clamp(options.maxDepth ?? 2, 0, MAX_DEPTH);
        const limit = clamp(options.limit ?? 100, 1, MAX_TRAVERSE_NODES);
        const direction = options.direction ?? 'both';
        const types = options.types?.map(normalizeEdgeType);

        const startIds = [...new Set(Array.isArray(start) ? start : [start])];
        startIds.forEach(assertNodeId);
        const startNodes = await this.getNodes(startIds);
        const startPresent = new Set(startNodes.map((n) => n._id));

        const depth = new Map<string, number>();
        for (const id of startIds) {
            if (depth.size >= limit) break;
            if (startPresent.has(id)) depth.set(id, 0);
        }
        const edges = new Map<string, GraphEdge>();
        let frontier = [...depth.keys()];

        for (let d = 1; d <= maxDepth && frontier.length && depth.size < limit; d++) {
            const next: string[] = [];
            for (const chunk of chunks(frontier, IN_CHUNK)) {
                const found = await this.store.find<GraphEdge>(
                    this.edgesCollection,
                    edgeFilter(chunk, direction, types),
                    { limit: EDGE_SCAN_LIMIT },
                );
                for (const e of found) {
                    edges.set(e._id, e);
                    // Frontier nodes are already in `depth`, so for 'both'
                    // only the far end of each edge is new.
                    const candidates = direction === 'out' ? [e.to] : direction === 'in' ? [e.from] : [e.from, e.to];
                    for (const c of candidates) {
                        if (depth.has(c) || depth.size >= limit) continue;
                        depth.set(c, d);
                        next.push(c);
                    }
                }
            }
            frontier = next;
        }

        const reached = await this.getNodes([...depth.keys()].filter((id) => !startPresent.has(id)));
        const nodes = [...startNodes.filter((n) => depth.has(n._id)), ...reached];
        const present = new Set(nodes.map((n) => n._id));
        const depthRecord: Record<string, number> = {};
        for (const n of nodes) depthRecord[n._id] = depth.get(n._id)!;
        // truncated when the cap was hit but there were still frontier nodes to expand
        const truncated = depth.size >= limit && frontier.length > 0;
        return {
            nodes,
            edges: [...edges.values()].filter((e) => present.has(e.from) && present.has(e.to)),
            depth: depthRecord,
            truncated,
        };
    }

    /** Most recent nodes plus the edges among them, for display. */
    async snapshot(limit = 300): Promise<Subgraph> {
        const nodes = await this.store.find<GraphNode>(this.nodesCollection, {}, { limit: clamp(limit, 1, 2000), sort: { createdAt: -1 } });
        const present = new Set(nodes.map((n) => n._id));
        const edges = await this.store.find<GraphEdge>(this.edgesCollection, {}, { limit: 5000 });
        return { nodes, edges: edges.filter((e) => present.has(e.from) && present.has(e.to)) };
    }

    // ---- helpers ----

    // ---- anchor records ----

    async getAnchor(root: string): Promise<AnchorRecord | null> {
        return (await this.byIds<AnchorRecord>(this.anchorsCollection, [root]))[0] ?? null;
    }

    /** Most recent anchor records first. */
    async listAnchors(limit = 50): Promise<AnchorRecord[]> {
        return this.store.find<AnchorRecord>(this.anchorsCollection, {}, { sort: { anchoredAt: -1 }, limit: clamp(limit, 1, 1000) });
    }

    /** Store an anchor record. False when one for this root already exists. */
    async saveAnchor(record: AnchorRecord): Promise<boolean> {
        try {
            await this.store.insertMany(this.anchorsCollection, [{ ...record }]);
            return true;
        } catch (err) {
            if (err instanceof PlugPortError && err.isDuplicateKey) return false;
            throw err;
        }
    }

    /** Point memories at the anchor batch (Merkle root) they were committed in. */
    async markAnchored(ids: string[], root: string): Promise<number> {
        let matched = 0;
        for (const chunk of chunks([...new Set(ids)], IN_CHUNK)) {
            matched += (await this.store.updateMany(this.nodesCollection, { _id: { $in: chunk } }, { $set: { anchorId: root } })).matchedCount;
        }
        return matched;
    }

    private async byIds<T>(collection: string, ids: string[]): Promise<T[]> {
        const unique = [...new Set(ids)];
        const out: T[] = [];
        for (const chunk of chunks(unique, IN_CHUNK)) {
            out.push(...await this.store.find<T>(collection, { _id: { $in: chunk } }, { limit: chunk.length }));
        }
        return out;
    }
}

// ---- input validation ----

function validateNodeInput(input: NodeInput): NodeInput {
    if (!input || typeof input !== 'object') throw new GraphError('INVALID_INPUT', 'Node must be an object');
    assertNodeId(input.id);
    assertLabel(input.label);
    if (input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim() || input.name.length > MAX_NAME)) {
        throw new GraphError('INVALID_INPUT', `Node ${input.id}: name must be a non-empty string of at most ${MAX_NAME} chars`);
    }
    if (input.text !== undefined && (typeof input.text !== 'string' || input.text.length > MAX_TEXT)) {
        throw new GraphError('INVALID_INPUT', `Node ${input.id}: text must be a string of at most ${MAX_TEXT} chars`);
    }
    return { ...input, ...(input.props !== undefined ? { props: plainProps(input.props, `Node ${input.id}`) } : {}) };
}

function validateEdgeInput(input: EdgeInput): EdgeInput {
    if (!input || typeof input !== 'object') throw new GraphError('INVALID_INPUT', 'Edge must be an object');
    assertNodeId(input.from);
    assertNodeId(input.to);
    const type = normalizeEdgeType(input.type);
    return { from: input.from, to: input.to, type, ...(input.props !== undefined ? { props: plainProps(input.props, `Edge ${input.from}-${type}->${input.to}`) } : {}) };
}

/** Props as JSON would store them (so hashes computed now match what's read back). */
export function plainProps(props: unknown, what = 'props'): Props {
    if (props === null || typeof props !== 'object' || Array.isArray(props)) {
        throw new GraphError('INVALID_INPUT', `${what}: props must be a plain object`);
    }
    let json: string;
    try {
        json = JSON.stringify(props);
    } catch {
        throw new GraphError('INVALID_INPUT', `${what}: props must be JSON-serializable`);
    }
    if (json.length > 16_000) throw new GraphError('INVALID_INPUT', `${what}: props exceed 16000 chars of JSON`);
    return JSON.parse(json) as Props;
}

function mergeNodeInputs(inputs: NodeInput[]): NodeInput[] {
    const byId = new Map<string, NodeInput>();
    for (const n of inputs) {
        const prev = byId.get(n.id);
        byId.set(n.id, prev ? { ...prev, ...n, props: { ...(prev.props ?? {}), ...(n.props ?? {}) } } : n);
    }
    return [...byId.values()];
}

function mergeEdgeInputs(inputs: EdgeInput[]): EdgeInput[] {
    const byId = new Map<string, EdgeInput>();
    for (const e of inputs) {
        const id = edgeId(e.from, e.type, e.to);
        const prev = byId.get(id);
        byId.set(id, prev ? { ...prev, props: { ...(prev.props ?? {}), ...(e.props ?? {}) } } : e);
    }
    return [...byId.values()];
}

function edgeFilter(ids: string[], direction: Direction, types?: string[]): Filter {
    const typeCond = types?.length ? { type: { $in: types } } : {};
    if (direction === 'out') return { from: { $in: ids }, ...typeCond };
    if (direction === 'in') return { to: { $in: ids }, ...typeCond };
    return { $or: [{ from: { $in: ids } }, { to: { $in: ids } }], ...typeCond };
}

function chunks<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

export function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, Math.floor(value)));
}

export interface GraphInfo {
    graph: string;
    nodes: number;
    edges: number;
    anchors: number;
    createdAt: number;
}

const GRAPH_COLLECTION = /^mem_(?:([a-z0-9][a-z0-9-]{0,31})_)?(nodes|edges|anchors)$/;

/**
 * The caller's own graphs, from a PlugPort collection listing (mem_nodes is
 * the "default" graph, mem_<graph>_nodes the others). Newest first; graphs
 * whose nodes collection is empty or gone are left out.
 */
export function graphsFromCollections(collections: { name: string; documentCount?: number; createdAt?: number }[]): GraphInfo[] {
    const graphs = new Map<string, GraphInfo>();
    for (const c of collections) {
        const match = GRAPH_COLLECTION.exec(c.name);
        if (!match) continue;
        const name = match[1] ?? 'default';
        const info = graphs.get(name) ?? { graph: name, nodes: 0, edges: 0, anchors: 0, createdAt: 0 };
        info[match[2] as 'nodes' | 'edges' | 'anchors'] = c.documentCount ?? 0;
        info.createdAt = Math.max(info.createdAt, c.createdAt ?? 0);
        graphs.set(name, info);
    }
    return [...graphs.values()].filter((g) => g.nodes > 0).sort((a, b) => b.createdAt - a.createdAt);
}
