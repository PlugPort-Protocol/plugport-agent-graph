// The tools the agent can call: memory (backed by @pag/core on PlugPort),
// anchoring on Monad, and the mock DEX. Each tool has a JSON-schema
// declaration for the model and a handler that returns plain JSON.

import type { FunctionDeclaration } from '@google/genai';
import type { Anchorer, Memory, RecallResult } from '@pag/core';
import type { MockDex } from './dex.js';

export interface ToolContext {
    memory: Memory;
    anchor: Anchorer | null;
    dex: MockDex;
}

type Args = Record<string, unknown>;
type Handler = (args: Args, ctx: ToolContext) => Promise<unknown>;

export interface Tool {
    declaration: FunctionDeclaration;
    handler: Handler;
}

const entitySchema = {
    type: 'object',
    properties: {
        label: { type: 'string', description: 'Entity type, e.g. User, Token, Pool, Protocol.' },
        name: { type: 'string', description: 'Entity name, e.g. USDC or MON/USDC-A.' },
    },
    required: ['label', 'name'],
};

const relationSchema = {
    type: 'object',
    properties: {
        from: { type: 'string', description: 'Entity name (from this call or an existing one).' },
        type: { type: 'string', description: 'Relation, e.g. AVOIDS, PREFERS, FAILED_ON, TRADES.' },
        to: { type: 'string', description: 'Entity name (from this call or an existing one).' },
    },
    required: ['from', 'type', 'to'],
};

export const TOOLS: Record<string, Tool> = {
    recall: {
        declaration: {
            name: 'recall',
            description: 'Search long-term memory (persists across sessions). Use before acting: find the user\'s preferences, rules and past outcomes. Pass a keyword query, an entity name, or both.',
            parametersJsonSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Keywords, e.g. "slippage preference swap failure".' },
                    entity: { type: 'string', description: 'An entity name, e.g. "USDC" or "MON/USDC-A".' },
                    hops: { type: 'integer', description: 'How far to follow relations from the matches (1-3). Default 1.' },
                },
            },
        },
        handler: async (args, { memory }) => {
            const result = await memory.recall({
                ...(typeof args.query === 'string' && args.query.trim() ? { query: args.query } : {}),
                ...(typeof args.entity === 'string' && args.entity.trim() ? { entity: args.entity } : {}),
                ...(typeof args.hops === 'number' ? { hops: args.hops } : {}),
                limit: 10,
            });
            return summarizeRecall(result);
        },
    },

    remember: {
        declaration: {
            name: 'remember',
            description: 'Save a durable fact to long-term memory: a user preference or rule, or the outcome of an action. Write one self-contained sentence, and name the entities it is about.',
            parametersJsonSchema: {
                type: 'object',
                properties: {
                    text: { type: 'string', description: 'The fact, as one self-contained sentence.' },
                    entities: { type: 'array', items: entitySchema, description: 'Entities the fact mentions.' },
                    relations: { type: 'array', items: relationSchema, description: 'Relations between those entities.' },
                    tags: { type: 'array', items: { type: 'string' }, description: 'e.g. preference, failure, success.' },
                },
                required: ['text'],
            },
        },
        handler: async (args, { memory }) => {
            const { memory: m, entities } = await memory.remember({
                text: String(args.text ?? ''),
                ...(Array.isArray(args.entities) ? { entities: args.entities as never } : {}),
                ...(Array.isArray(args.relations) ? { relations: args.relations as never } : {}),
                ...(Array.isArray(args.tags) ? { tags: args.tags as never } : {}),
            });
            return { saved: true, id: m._id, hash: m.hash, entities: entities.map((e) => e.name ?? e._id) };
        },
    },

    link: {
        declaration: {
            name: 'link',
            description: 'Record a relation between two entities (created if new), e.g. User me AVOIDS Token SCAM.',
            parametersJsonSchema: {
                type: 'object',
                properties: {
                    from: entitySchema,
                    type: { type: 'string', description: 'Relation, e.g. AVOIDS, PREFERS, FAILED_ON.' },
                    to: entitySchema,
                },
                required: ['from', 'type', 'to'],
            },
        },
        handler: async (args, { memory }) => {
            const { nodes, edge } = await memory.link(args.from as never, String(args.type ?? ''), args.to as never);
            const name = (id: string) => nodes.find((n) => n._id === id)?.name ?? id;
            return { linked: true, from: name(edge.from), type: edge.type, to: name(edge.to) };
        },
    },

    anchor_now: {
        declaration: {
            name: 'anchor_now',
            description: 'Commit all not-yet-anchored memories to the Monad blockchain as one Merkle root, so they can be verified as untampered later.',
            parametersJsonSchema: { type: 'object', properties: {} },
        },
        handler: async (_args, { anchor }) => {
            if (!anchor) throw new Error('Anchoring is not configured (MONAD_RPC_URL / ANCHOR_CONTRACT).');
            const { batch, skipped } = await anchor.anchorPending();
            if (!batch) return { anchored: 0, message: 'Nothing new to anchor.', skipped };
            return { anchored: batch.count, root: batch.root, txHash: batch.txHash, explorerUrl: batch.explorerUrl, skipped };
        },
    },

    verify_memory: {
        declaration: {
            name: 'verify_memory',
            description: 'Check that a memory is unchanged since it was anchored on Monad.',
            parametersJsonSchema: { type: 'object', properties: { id: { type: 'string', description: 'Memory id (mem_...).' } }, required: ['id'] },
        },
        handler: async (args, { anchor }) => {
            if (!anchor) throw new Error('Anchoring is not configured (MONAD_RPC_URL / ANCHOR_CONTRACT).');
            const v = await anchor.verify(String(args.id ?? ''));
            if (!v) throw new Error(`No memory ${String(args.id)}`);
            return { id: v.id, verified: v.verified, problem: v.problem, root: v.root, explorerUrl: v.explorerUrl };
        },
    },

    get_quote: {
        declaration: {
            name: 'get_quote',
            description: 'Get swap quotes from every pool that trades the pair, best expected output first. Estimated slippage is the pool\'s own claim.',
            parametersJsonSchema: {
                type: 'object',
                properties: {
                    token_in: { type: 'string', description: 'Token to sell, e.g. MON.' },
                    token_out: { type: 'string', description: 'Token to buy, e.g. USDC.' },
                    amount: { type: 'number', description: 'Amount of token_in.' },
                },
                required: ['token_in', 'token_out', 'amount'],
            },
        },
        handler: async (args, { dex }) => {
            const quotes = dex.quote(String(args.token_in ?? ''), String(args.token_out ?? ''), Number(args.amount));
            return quotes.length ? { quotes } : { quotes, message: 'No pool trades this pair.' };
        },
    },

    execute_swap: {
        declaration: {
            name: 'execute_swap',
            description: 'Execute a swap on one pool. It reverts if the execution slippage exceeds max_slippage_pct.',
            parametersJsonSchema: {
                type: 'object',
                properties: {
                    pool: { type: 'string', description: 'Pool id from get_quote, e.g. MON/USDC-B.' },
                    token_in: { type: 'string' },
                    token_out: { type: 'string' },
                    amount: { type: 'number' },
                    max_slippage_pct: { type: 'number', description: 'Max slippage the user accepts, in percent.' },
                },
                required: ['pool', 'token_in', 'token_out', 'amount', 'max_slippage_pct'],
            },
        },
        handler: async (args, { dex }) =>
            dex.swap(String(args.pool ?? ''), String(args.token_in ?? ''), String(args.token_out ?? ''), Number(args.amount), Number(args.max_slippage_pct)),
    },
};

/** What recall returns to the model: memory text and ids, plus the entities around them. */
export function summarizeRecall(result: RecallResult) {
    const names = new Map(result.context.nodes.map((n) => [n._id, n.name ?? n._id]));
    const name = (id: string) => names.get(id) ?? id;
    return {
        memories: result.memories.map(({ memory: m }) => ({
            id: m._id,
            text: m.text,
            tags: Array.isArray(m.props?.tags) ? m.props.tags : [],
            savedAt: new Date(m.createdAt).toISOString(),
            anchored: Boolean(m.anchorId),
        })),
        relatedEntities: result.context.nodes.filter((n) => n.label !== 'Memory').map((n) => `${n.label}:${n.name ?? n._id}`),
        relations: result.context.edges
            .filter((e) => e.type !== 'MENTIONS')
            .map((e) => `${name(e.from)} ${e.type} ${name(e.to)}`),
    };
}

const MAX_ERROR = 300;

export async function runTool(name: string, args: Args, ctx: ToolContext): Promise<{ output: unknown } | { error: string }> {
    const tool = TOOLS[name];
    if (!tool) return { error: `Unknown tool ${name}. Tools: ${Object.keys(TOOLS).join(', ')}` };
    try {
        return { output: await tool.handler(args ?? {}, ctx) };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Chain errors can embed whole raw transactions; the model needs the gist only.
        return { error: message.length > MAX_ERROR ? `${message.slice(0, MAX_ERROR)}…` : message || 'Unknown error' };
    }
}
