// All 7 MCP tool definitions with zod schemas and handlers.
// Every tool returns { content: [{ type: 'text', text: '...' }] } as required
// by the MCP spec, plus a JSON block so the host model can parse structured data.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Anchorer, Memory } from '@pag/core';
import type { GraphStore } from '@pag/core';
import {
    formatMemories, formatContext, formatRelations,
    formatAnchor, formatVerify,
} from './format.js';

export interface ToolDeps {
    memory: Memory;
    /** Null when MONAD_RPC_URL / ANCHOR_CONTRACT are not configured. */
    anchor: Anchorer | null;
    graph: GraphStore;
}

/** Wrap a result as MCP text content + embedded JSON for structured access */
function textJson(summary: string, data: unknown) {
    return {
        content: [
            { type: 'text' as const, text: summary },
            { type: 'text' as const, text: '```json\n' + JSON.stringify(data, null, 2) + '\n```' },
        ],
    };
}

function anchorRequired(anchor: Anchorer | null) {
    if (!anchor) throw new Error(
        'Anchoring is not configured. Set MONAD_RPC_URL and ANCHOR_CONTRACT in your environment.',
    );
    return anchor;
}

export function registerTools(server: McpServer, deps: ToolDeps): void {
    const { memory, anchor, graph } = deps;

    // ── 1. remember ──────────────────────────────────────────────────────────
    server.tool(
        'remember',
        'Store a new memory with optional entities and relations. Returns the memory id.',
        {
            text: z.string().min(1).max(4000).describe('The fact or event to remember (plain text).'),
            entities: z.array(z.object({
                label: z.string().describe('Node label, e.g. "Person", "Token", "Pool".'),
                name: z.string().describe('Display name of the entity.'),
            })).optional().describe('Entities mentioned in the memory.'),
            relations: z.array(z.object({
                from: z.string().describe('Name of the source entity (must exist in entities or graph).'),
                type: z.string().describe('Relation type, e.g. "AVOIDS", "TRADES_ON".'),
                to: z.string().describe('Name of the target entity.'),
            })).optional().describe('Directed relationships to record alongside the memory.'),
            tags: z.array(z.string()).optional().describe('Free-form tags, e.g. ["failure", "preference"].'),
        },
        async (args) => {
            const result = await memory.remember({
                text: args.text,
                entities: args.entities,
                relations: args.relations,
                tags: args.tags,
            });
            const text = result.memory.text ?? '';
            const summary = `Remembered: "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}" (id: ${result.memory._id})`;
            return textJson(summary, {
                id: result.memory._id,
                hash: result.memory.hash,
                entities: result.entities.map((e) => ({ id: e._id, label: e.label, name: e.name })),
                edges: result.edges.map((e) => ({ from: e.from, type: e.type, to: e.to })),
            });
        },
    );

    // ── 2. recall ─────────────────────────────────────────────────────────────
    server.tool(
        'recall',
        'Search long-term memory by keywords and/or entity name. Returns ranked memories and their context graph.',
        {
            query: z.string().optional().describe('Keywords to search for (space-separated).'),
            entity: z.string().optional().describe('Entity name to anchor the search on (e.g. "USDC", "me").'),
            hops: z.number().int().min(0).max(3).optional().default(1)
                .describe('Graph hops to expand around matched nodes (0 = memories only, default 1).'),
            limit: z.number().int().min(1).max(50).optional().default(10)
                .describe('Max memories to return (default 10, max 50).'),
        },
        async (args) => {
            const result = await memory.recall({
                query: args.query,
                entity: args.entity,
                hops: args.hops ?? 1,
                limit: args.limit ?? 10,
            });
            const memText = formatMemories(result.memories);
            const ctxText = formatContext(result.context.nodes, result.context.edges, result.contextTruncated);
            const summary = [
                `Recalled ${result.memories.length} memor${result.memories.length === 1 ? 'y' : 'ies'}:`,
                memText,
                '',
                'Context graph:',
                ctxText,
            ].join('\n');
            return textJson(summary, {
                memories: result.memories.map((m) => ({
                    id: m.memory._id,
                    text: m.memory.text,
                    score: m.score,
                    distance: m.distance,
                    anchorId: m.memory.anchorId ?? null,
                    tags: m.memory.props?.tags ?? [],
                })),
                relations: formatRelations(result.context.edges),
                contextTruncated: result.contextTruncated,
            });
        },
    );

    // ── 3. link ───────────────────────────────────────────────────────────────
    server.tool(
        'link',
        'Create a typed relationship between two entities (upserts both if they do not exist).',
        {
            from: z.object({
                label: z.string().describe('Label of the source entity.'),
                name: z.string().describe('Name of the source entity.'),
            }).describe('Source entity.'),
            type: z.string().describe('Relation type in UPPER_SNAKE_CASE, e.g. "TRADES_ON".'),
            to: z.object({
                label: z.string().describe('Label of the target entity.'),
                name: z.string().describe('Name of the target entity.'),
            }).describe('Target entity.'),
            props: z.record(z.unknown()).optional().describe('Optional properties for the edge.'),
        },
        async (args) => {
            const result = await memory.link(args.from, args.type, args.to, args.props);
            const summary = `Linked: ${args.from.name} -[${args.type}]→ ${args.to.name} (edge ${result.edge._id})`;
            return textJson(summary, {
                edge: { id: result.edge._id, from: result.edge.from, type: result.edge.type, to: result.edge.to },
                nodes: result.nodes.map((n) => ({ id: n._id, label: n.label, name: n.name })),
            });
        },
    );

    // ── 4. explore ────────────────────────────────────────────────────────────
    server.tool(
        'explore',
        'Breadth-first traversal from one or more node ids. Returns the subgraph within the given hops.',
        {
            start: z.union([z.string(), z.array(z.string())]).describe('Node id(s) to start from.'),
            maxDepth: z.number().int().min(0).max(3).optional().default(2)
                .describe('Max hops from start nodes (default 2, max 3).'),
            direction: z.enum(['out', 'in', 'both']).optional().default('both')
                .describe('Edge direction to follow (default "both").'),
            types: z.array(z.string()).optional()
                .describe('Only follow these relation types. Omit for all types.'),
            limit: z.number().int().min(1).max(300).optional().default(100)
                .describe('Max nodes to return (default 100, max 300).'),
        },
        async (args) => {
            const result = await graph.traverse(args.start, {
                maxDepth: args.maxDepth ?? 2,
                direction: (args.direction ?? 'both') as 'out' | 'in' | 'both',
                types: args.types,
                limit: args.limit ?? 100,
            });
            const ctxText = formatContext(result.nodes, result.edges, result.truncated);
            const summary = `Explored from ${Array.isArray(args.start) ? args.start.length + ' nodes' : args.start}:\n${ctxText}`;
            return textJson(summary, {
                nodes: result.nodes.map((n) => ({
                    id: n._id,
                    label: n.label,
                    name: n.name ?? null,
                    text: n.label === 'Memory' ? n.text : undefined,
                    depth: result.depth[n._id] ?? 0,
                    anchorId: n.anchorId ?? null,
                })),
                edges: result.edges.map((e) => ({ id: e._id, from: e.from, type: e.type, to: e.to })),
                truncated: result.truncated,
            });
        },
    );

    // ── 5. forget ─────────────────────────────────────────────────────────────
    server.tool(
        'forget',
        'Delete a memory and all its edges. The memory must be a Memory node (not an entity).',
        {
            id: z.string().describe('The _id of the memory node to delete.'),
        },
        async (args) => {
            const deleted = await memory.forget(args.id);
            const summary = deleted
                ? `Deleted memory ${args.id}.`
                : `Memory ${args.id} not found — nothing deleted.`;
            return textJson(summary, { id: args.id, deleted });
        },
    );

    // ── 6. anchor_now ─────────────────────────────────────────────────────────
    server.tool(
        'anchor_now',
        'Anchor all pending (un-anchored) memories on-chain as a Merkle batch. Requires MONAD_RPC_URL and ANCHOR_CONTRACT.',
        {},
        async () => {
            const a = anchorRequired(anchor);
            const result = await a.anchorPending();
            if (!result.batch) {
                return textJson('No pending memories to anchor — all memories are already anchored.', { anchored: 0 });
            }
            const summary = [
                `Anchored ${result.batch.count} memories.`,
                `Root: ${result.batch.root}`,
                result.batch.txHash ? `Tx: ${result.batch.txHash}` : 'Tx: recovered (already on chain)',
            ].join('\n');
            return textJson(summary, {
                root: result.batch.root,
                count: result.batch.count,
                txHash: result.batch.txHash,
                anchoredAt: result.batch.anchoredAt,
                recovered: result.batch.recovered,
                explorerUrl: result.batch.explorerUrl,
            });
        },
    );

    // ── 7. verify_memory ──────────────────────────────────────────────────────
    server.tool(
        'verify_memory',
        'Verify a memory\'s integrity against its on-chain Merkle anchor. Checks hash, Merkle proof, and on-chain root.',
        {
            id: z.string().describe('The _id of the memory node to verify.'),
        },
        async (args) => {
            const a = anchorRequired(anchor);
            const v = await a.verify(args.id);
            if (!v) {
                return textJson(`Memory ${args.id} not found or not yet anchored.`, { id: args.id, found: false });
            }
            const summary = formatVerify(v);
            return textJson(summary, {
                id: args.id,
                verified: v.verified,
                hashValid: v.hashValid,
                anchored: v.anchored,
                proofValid: v.proofValid,
                onChain: v.onChain,
                root: v.root,
                anchoredAt: v.anchoredAt,
                anchoredBy: v.anchoredBy,
                txHash: v.txHash,
                explorerUrl: v.explorerUrl,
                computedHash: v.computedHash,
                problem: v.problem ?? null,
            });
        },
    );
}
