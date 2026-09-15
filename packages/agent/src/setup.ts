// Builds the agent's dependencies from the environment (repo-root .env):
// PlugPort + Monad anchoring, or everything in memory with --offline.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    Anchorer, GraphStore, InMemoryAnchorChain, InMemoryDocStore, Memory, agentGraphFromEnv,
} from '@pag/core';
import { MockDex } from './dex.js';
import { GeminiModel, type ChatModel } from './model.js';
import type { ToolContext } from './tools.js';

export function loadEnv(): void {
    const path = fileURLToPath(new URL('../../../.env', import.meta.url));
    if (existsSync(path)) process.loadEnvFile(path);
}

export interface Setup {
    ctx: ToolContext;
    /** Where memories go, for display. */
    where: string;
}

export function setupContext(options: { offline?: boolean; graph?: string } = {}): Setup {
    const dex = new MockDex();
    if (options.offline) {
        const graph = new GraphStore(new InMemoryDocStore(), options.graph ? { graph: options.graph } : {});
        return {
            ctx: { memory: new Memory(graph), anchor: new Anchorer(graph, new InMemoryAnchorChain()), dex },
            where: `in-memory store (offline), graph "${graph.graph}"`,
        };
    }
    const { memory, anchor, graph } = agentGraphFromEnv({ ...process.env, ...(options.graph ? { PAG_GRAPH: options.graph } : {}) });
    return {
        ctx: { memory, anchor, dex },
        where: `PlugPort ${process.env.PLUGPORT_URL}, collection ${graph.nodesCollection}${anchor ? `, anchoring to ${anchor.chain.contractAddress}` : ', no anchoring'}`,
    };
}

export function modelFromEnv(): ChatModel {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set (get one at https://aistudio.google.com/apikey).');
    return new GeminiModel({ apiKey, ...(process.env.GEMMA_MODEL ? { model: process.env.GEMMA_MODEL } : {}) });
}
