// Server-only helpers for the API routes: configuration from the environment
// (the repo-root .env locally, project settings when deployed) and a
// read-mostly PlugPort Agent Graph per request.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { GraphError, PlugPortError, assertGraphName, createAgentGraph, type AgentGraph } from '@pag/core';

let envLoaded = false;

function loadEnv(): void {
    if (envLoaded) return;
    envLoaded = true;
    if (process.env.PLUGPORT_URL) return;
    for (const path of [join(process.cwd(), '.env.local'), join(process.cwd(), '..', '..', '.env')]) {
        if (existsSync(path)) {
            process.loadEnvFile(path);
            return;
        }
    }
}

export function config() {
    loadEnv();
    const env = process.env;
    return {
        url: env.PLUGPORT_URL ?? '',
        apiKey: env.PLUGPORT_API_KEY ?? '',
        defaultGraph: env.PAG_GRAPH || 'default',
        rpcUrl: env.MONAD_RPC_URL ?? '',
        contract: env.ANCHOR_CONTRACT ?? '',
        /** The anchor wallet whose roots verify trusts (public address; the key never goes here). */
        anchorAddress: env.ANCHOR_ADDRESS ?? '',
        explorerTxUrl: env.EXPLORER_TX_URL ?? '',
        tamperEnabled: env.VIEWER_ALLOW_TAMPER === 'true',
    };
}

export function openGraph(graph: string): AgentGraph {
    const c = config();
    if (!c.url || !c.apiKey) throw new Error('PLUGPORT_URL and PLUGPORT_API_KEY must be set for the viewer.');
    assertGraphName(graph);
    return createAgentGraph({
        url: c.url,
        apiKey: c.apiKey,
        graph,
        ...(c.rpcUrl && c.contract
            ? {
                anchor: {
                    rpcUrl: c.rpcUrl,
                    contract: c.contract,
                    ...(c.anchorAddress ? { trustedAnchorer: c.anchorAddress } : {}),
                    ...(c.explorerTxUrl ? { explorerTxUrl: c.explorerTxUrl } : {}),
                },
            }
            : {}),
    });
}

export function graphParam(request: Request): string {
    return new URL(request.url).searchParams.get('graph') || config().defaultGraph;
}

/** JSON error response: 400 for caller mistakes, 502 for PlugPort failures, 500 otherwise. */
export function errorResponse(err: unknown): Response {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof GraphError ? 400 : err instanceof PlugPortError ? 502 : 500;
    return Response.json({ error: message.length > 400 ? `${message.slice(0, 400)}…` : message }, { status });
}
