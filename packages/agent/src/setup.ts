// Builds the agent's dependencies from the environment (repo-root .env):
// PlugPort + Monad anchoring, or everything in memory with --offline.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    Anchorer, GraphStore, InMemoryAnchorChain, InMemoryDocStore, Memory,
    agentGraphFromEnv, createAgentGraph,
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

/**
 * Build a read-only AgentGraph for wallet-2 that reads wallet-1's shared graph.
 * Requires PLUGPORT_API_KEY_2 in the environment and the graph to have been
 * shared with wallet-2 via PlugPort's ACL (grantRole on the server side).
 *
 * @param ownerAddress - wallet address of wallet-1 whose graph we're reading
 */
export function setupSharedContext(ownerAddress: string): Setup {
    const url = process.env.PLUGPORT_URL;
    if (!url) throw new Error('PLUGPORT_URL is not set');
    const apiKey2 = process.env.PLUGPORT_API_KEY_2;
    if (!apiKey2) throw new Error(
        'PLUGPORT_API_KEY_2 is not set.\n' +
        'Add a second wallet\'s API key to .env and share wallet-1\'s graph with it via the PlugPort dashboard.',
    );
    if (!ownerAddress) throw new Error('ownerAddress is required to read a shared graph');

    const { memory, graph } = createAgentGraph({
        url,
        apiKey: apiKey2,
        // owner scopes all reads to wallet-1's namespace in PlugPort
        owner: ownerAddress,
        ...(process.env.PAG_GRAPH ? { graph: process.env.PAG_GRAPH } : {}),
    });

    return {
        ctx: { memory, anchor: null, dex: new MockDex() },
        where: `PlugPort ${url} (wallet-2 reading ${ownerAddress.slice(0, 8)}…'s graph, collection ${graph.nodesCollection})`,
    };
}

export function modelFromEnv(): ChatModel {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set (get one at https://aistudio.google.com/apikey).');
    return new GeminiModel({ apiKey, ...(process.env.GEMMA_MODEL ? { model: process.env.GEMMA_MODEL } : {}) });
}
