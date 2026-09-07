export * from './types.js';
export * from './errors.js';
export * from './ids.js';
export * from './text.js';
export * from './hash.js';
export * from './plugport.js';
export * from './graph.js';
export * from './memory.js';
export * from './merkle.js';
export * from './anchor.js';

import { PlugPortClient, type PlugPortClientOptions } from './plugport.js';
import { GraphStore } from './graph.js';
import { Memory } from './memory.js';
import { Anchorer, EthersAnchorChain, type AnchorerOptions, type EthersAnchorChainOptions } from './anchor.js';

export interface AgentGraphOptions extends PlugPortClientOptions {
    graph?: string;
    /** Open another wallet's graph (public or shared with you). */
    owner?: string;
    /** On-chain anchoring (MemoryAnchor). Omit to run without it. */
    anchor?: EthersAnchorChainOptions & AnchorerOptions;
}

export interface AgentGraph {
    client: PlugPortClient;
    graph: GraphStore;
    memory: Memory;
    /** Null when no anchor contract is configured. */
    anchor: Anchorer | null;
}

export function createAgentGraph(options: AgentGraphOptions): AgentGraph {
    const client = new PlugPortClient(options);
    const graph = new GraphStore(client, {
        ...(options.graph !== undefined ? { graph: options.graph } : {}),
        ...(options.owner !== undefined ? { owner: options.owner } : {}),
    });
    const { anchor: anchorOptions } = options;
    const anchor = anchorOptions
        ? new Anchorer(graph, new EthersAnchorChain(anchorOptions), anchorOptions)
        : null;
    return { client, graph, memory: new Memory(graph), anchor };
}

/**
 * Build from PLUGPORT_URL, PLUGPORT_API_KEY and PAG_GRAPH, plus anchoring when
 * MONAD_RPC_URL and ANCHOR_CONTRACT are set (ANCHOR_PRIVATE_KEY to anchor,
 * EXPLORER_TX_URL for links).
 */
export function agentGraphFromEnv(env: Record<string, string | undefined> = process.env): AgentGraph {
    const url = env.PLUGPORT_URL;
    if (!url) throw new Error('PLUGPORT_URL is not set');
    return createAgentGraph({
        url,
        ...(env.PLUGPORT_API_KEY ? { apiKey: env.PLUGPORT_API_KEY } : {}),
        ...(env.PAG_GRAPH ? { graph: env.PAG_GRAPH } : {}),
        ...(env.MONAD_RPC_URL && env.ANCHOR_CONTRACT
            ? {
                anchor: {
                    rpcUrl: env.MONAD_RPC_URL,
                    contract: env.ANCHOR_CONTRACT,
                    ...(env.ANCHOR_PRIVATE_KEY ? { privateKey: env.ANCHOR_PRIVATE_KEY } : {}),
                    ...(env.EXPLORER_TX_URL ? { explorerTxUrl: env.EXPLORER_TX_URL } : {}),
                },
            }
            : {}),
    });
}
