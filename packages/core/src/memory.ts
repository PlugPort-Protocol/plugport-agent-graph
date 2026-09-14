// Agent memory on top of the graph. A memory is an immutable Memory node
// (text + content hash) linked by MENTIONS edges to the entities it is about;
// recall finds seed nodes by keyword or entity and expands through the graph.

import { GraphError } from './errors.js';
import { GraphStore, MEMORY_LABEL, clamp, plainProps, type Direction, type NodeInput } from './graph.js';
import { hashMemory, memoryHashValid } from './hash.js';
import { assertLabel, assertNodeId, entityId, memoryId, normalizeEdgeType } from './ids.js';
import { escapeRegex, keywordHits, keywordPattern, tokenize } from './text.js';
import type { GraphEdge, GraphNode, Props, Subgraph } from './types.js';

export const MENTIONS = 'MENTIONS';

export interface EntityInput {
    label: string;
    name: string;
    props?: Props;
}

export interface RelationInput {
    /** An entity's name from this call's `entities`, or an existing node id. */
    from: string;
    type: string;
    to: string;
    props?: Props;
}

export interface RememberInput {
    text: string;
    entities?: EntityInput[];
    relations?: RelationInput[];
    tags?: string[];
    props?: Props;
}

export interface RememberResult {
    memory: GraphNode;
    entities: GraphNode[];
    edges: GraphEdge[];
}

export interface RecallInput {
    /** Free text; matched against memory text and entity names by keyword. */
    query?: string;
    /** An entity id, or an entity name (case-insensitive). */
    entity?: string;
    /** Hops to expand from the matches. Default 1, max 3. */
    hops?: number;
    /** Max memories returned. Default 10, max 50. */
    limit?: number;
}

export interface RecalledMemory {
    memory: GraphNode;
    /** Higher is more relevant. */
    score: number;
    /** Query keywords found in the memory. */
    hits: number;
    /** Hops from the nearest match (0 = matched directly). */
    distance: number;
}

export interface RecallResult {
    memories: RecalledMemory[];
    /** The nodes and edges around the matches, for display or for the agent. */
    context: Subgraph;
}

export interface VerifyHashResult {
    id: string;
    hashValid: boolean;
    storedHash: string | null;
    computedHash: string;
}

const MAX_TAGS = 20;
const SEED_LIMIT = 200;
const CONTEXT_LIMIT = 300;

export class Memory {
    constructor(readonly graph: GraphStore) { }

    async remember(input: RememberInput): Promise<RememberResult> {
        const text = typeof input?.text === 'string' ? input.text.trim() : '';
        if (!text) throw new GraphError('INVALID_INPUT', 'text is required');

        if (input.entities !== undefined && !Array.isArray(input.entities)) throw new GraphError('INVALID_INPUT', 'entities must be an array');
        if (input.relations !== undefined && !Array.isArray(input.relations)) throw new GraphError('INVALID_INPUT', 'relations must be an array');
        const entities = (input.entities ?? []).map(entityNode);

        const byName = new Map<string, string>();
        for (const e of entities) byName.set(e.name.toLowerCase(), e.id);
        const resolve = (ref: unknown): string => {
            if (typeof ref !== 'string' || !ref.trim()) throw new GraphError('INVALID_INPUT', 'Relation endpoints must be non-empty strings');
            return byName.get(ref.trim().toLowerCase()) ?? ref.trim();
        };

        // Validate everything, and check that relations to nodes outside this
        // call exist, before the first write, so a bad input never leaves a
        // half-written memory behind.
        const relations = (input.relations ?? []).map((r) => {
            if (!r || typeof r !== 'object') throw new GraphError('INVALID_INPUT', 'Each relation must be an object with from, type and to');
            const from = resolve(r.from);
            const to = resolve(r.to);
            assertNodeId(from);
            assertNodeId(to);
            return {
                from,
                type: normalizeEdgeType(r.type),
                to,
                ...(r.props !== undefined ? { props: plainProps(r.props, `relation ${from} -> ${to}`) } : {}),
            };
        });
        const tags = normalizeTags(input.tags);
        const props = plainProps({ ...(input.props ?? {}), ...(tags.length ? { tags } : {}) }, 'memory');
        const local = new Set(entities.map((e) => e.id));
        const external = [...new Set(relations.flatMap((r) => [r.from, r.to]))].filter((ref) => !local.has(ref));
        if (external.length) {
            const found = new Set((await this.graph.getNodes(external)).map((n) => n._id));
            const missing = external.filter((ref) => !found.has(ref));
            if (missing.length) {
                throw new GraphError('NODE_NOT_FOUND', `Unknown node(s) in relations: ${missing.join(', ')}. Add them to entities or use an existing node id.`);
            }
        }

        const id = memoryId();
        const createdAt = Date.now();
        const hash = hashMemory({ _id: id, label: MEMORY_LABEL, text, props, createdAt });

        const nodes = await this.graph.upsertNodes([
            ...entities,
            { id, label: MEMORY_LABEL, props, text, hash, createdAt },
        ]);
        const memory = nodes.find((n) => n._id === id)!;
        const entityNodes = nodes.filter((n) => n._id !== id);

        let edges: GraphEdge[];
        try {
            edges = await this.graph.upsertEdges([
                ...entityNodes.map((n) => ({ from: id, type: MENTIONS, to: n._id })),
                ...relations,
            ]);
        } catch (err) {
            // Don't leave a memory without its links behind (a retry would
            // duplicate it). Entities stay: they're shared and idempotent.
            await this.graph.deleteNode(id).catch(() => undefined);
            throw err;
        }

        return { memory, entities: entityNodes, edges };
    }

    /** Relate two entities, creating them if needed. */
    async link(from: EntityInput, type: string, to: EntityInput, props?: Props): Promise<{ nodes: GraphNode[]; edge: GraphEdge }> {
        const a = entityNode(from);
        const b = entityNode(to);
        const relType = normalizeEdgeType(type);
        const relProps = props !== undefined ? plainProps(props, 'relation') : undefined;
        const nodes = await this.graph.upsertNodes([a, b]);
        const [edge] = await this.graph.upsertEdges([{ from: a.id, type: relType, to: b.id, ...(relProps !== undefined ? { props: relProps } : {}) }]);
        return { nodes, edge: edge! };
    }

    async recall(input: RecallInput = {}): Promise<RecallResult> {
        const hops = clamp(input.hops ?? 1, 0, 3);
        const limit = clamp(input.limit ?? 10, 1, 50);
        const tokens = input.query ? tokenize(input.query) : [];
        const entityRef = typeof input.entity === 'string' ? input.entity.trim() : '';

        if (!tokens.length && !entityRef) {
            // Nothing to search for: the most recent memories.
            const recent = await this.recent(limit);
            const context = recent.length
                ? await this.graph.traverse(recent.map((m) => m._id), { maxDepth: hops, limit: CONTEXT_LIMIT })
                : { nodes: [], edges: [] };
            return {
                memories: recent.map((memory) => ({ memory, score: 0, hits: 0, distance: 0 })),
                context: { nodes: context.nodes, edges: context.edges },
            };
        }

        const seeds = new Set<string>();
        if (entityRef) for (const n of await this.findEntities(entityRef)) seeds.add(n._id);
        const pattern = keywordPattern(tokens);
        if (pattern) {
            const matches = await this.graph.findNodes({ keywords: { $regex: pattern } }, { limit: SEED_LIMIT });
            for (const n of matches) seeds.add(n._id);
        }
        if (!seeds.size) return { memories: [], context: { nodes: [], edges: [] } };

        const t = await this.graph.traverse([...seeds], { maxDepth: hops, limit: CONTEXT_LIMIT });
        const memories = t.nodes
            .filter((n) => n.label === MEMORY_LABEL)
            .map((memory) => {
                const hits = keywordHits(memory.keywords ?? '', tokens);
                const distance = t.depth[memory._id] ?? hops;
                return { memory, hits, distance, score: round(hits * 2 + 1 / (1 + distance)) };
            })
            .sort((a, b) => b.score - a.score || b.memory.createdAt - a.memory.createdAt)
            .slice(0, limit);

        return { memories, context: { nodes: t.nodes, edges: t.edges } };
    }

    async recent(limit = 10): Promise<GraphNode[]> {
        return this.graph.findNodes({ label: MEMORY_LABEL }, { sort: { createdAt: -1 }, limit: clamp(limit, 1, 200) });
    }

    /** Delete a memory and its edges. False when it doesn't exist. */
    async forget(id: string): Promise<boolean> {
        const node = await this.graph.getNode(id);
        if (!node) return false;
        if (node.label !== MEMORY_LABEL) throw new GraphError('NOT_A_MEMORY', `${id} is a ${node.label}, not a memory`);
        return (await this.graph.deleteNode(id)).deleted;
    }

    /** Recompute a memory's hash from its stored content and compare. */
    async verifyHash(id: string): Promise<VerifyHashResult | null> {
        const node = await this.graph.getNode(id);
        if (!node) return null;
        if (node.label !== MEMORY_LABEL) throw new GraphError('NOT_A_MEMORY', `${id} is a ${node.label}, not a memory`);
        return {
            id,
            hashValid: memoryHashValid(node),
            storedHash: node.hash ?? null,
            computedHash: hashMemory(node),
        };
    }

    /** Entities by id, or by exact name (case-insensitive). */
    async findEntities(ref: string): Promise<GraphNode[]> {
        const byId = /^[a-z0-9][a-z0-9_-]{0,127}$/.test(ref) ? await this.graph.getNode(ref) : null;
        if (byId && byId.label !== MEMORY_LABEL) return [byId];
        return this.graph.findNodes(
            { name: { $regex: `^${escapeRegex(ref)}$`, $options: 'i' }, label: { $ne: MEMORY_LABEL } },
            { limit: 20 },
        );
    }

    /** Edges of one node, e.g. to show what a memory mentions. */
    async around(id: string, direction: Direction = 'both'): Promise<Subgraph> {
        return this.graph.neighbors(id, { direction });
    }
}

/** Validate an entity and give it its stable id. */
function entityNode(e: EntityInput): NodeInput & { name: string } {
    if (!e || typeof e !== 'object') throw new GraphError('INVALID_INPUT', 'Each entity must be an object with label and name');
    assertLabel(e.label);
    if (e.label === MEMORY_LABEL) throw new GraphError('INVALID_INPUT', `"${MEMORY_LABEL}" is reserved for memories`);
    if (typeof e.name !== 'string' || !e.name.trim()) throw new GraphError('INVALID_INPUT', 'Each entity needs a non-empty name');
    const name = e.name.trim();
    return { id: entityId(e.label, name), label: e.label, name, ...(e.props !== undefined ? { props: e.props } : {}) };
}

function normalizeTags(tags: unknown): string[] {
    if (tags === undefined) return [];
    if (!Array.isArray(tags)) throw new GraphError('INVALID_INPUT', 'tags must be an array of strings');
    const out = new Set<string>();
    for (const t of tags) {
        if (typeof t !== 'string') throw new GraphError('INVALID_INPUT', 'tags must be an array of strings');
        const tag = t.trim().toLowerCase().slice(0, 64);
        if (tag) out.add(tag);
        if (out.size >= MAX_TAGS) break;
    }
    return [...out];
}

function round(n: number): number {
    return Math.round(n * 1000) / 1000;
}
