// End-to-end check against a real PlugPort. Skipped unless PLUGPORT_URL and
// PLUGPORT_API_KEY are set (in the environment or the repo-root .env).
// Writes go to a throwaway graph and are deleted afterwards. It makes about
// 8 write requests, within PlugPort's 20-per-10-seconds limit.

import { describe, it, expect, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { createAgentGraph } from '../src/index.js';

try {
    process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
    // no .env file: rely on the environment
}

// On testnet every write waits for an on-chain confirmation (about 15s each).
const LIVE_TIMEOUT_MS = 300_000;
const url = process.env.PLUGPORT_URL;
const apiKey = process.env.PLUGPORT_API_KEY;
const graphName = `live-${Date.now().toString(36)}`;

describe.skipIf(!url || !apiKey)('live PlugPort', () => {
    // Collected even when skipped, so only build the client when configured.
    const { client, graph, memory } = url && apiKey
        ? createAgentGraph({ url, apiKey, graph: graphName })
        : ({} as ReturnType<typeof createAgentGraph>);

    afterAll(async () => {
        await client.deleteMany(graph.edgesCollection, {}).catch(() => undefined);
        await client.deleteMany(graph.nodesCollection, {}).catch(() => undefined);
    }, LIVE_TIMEOUT_MS);

    it('remembers, recalls, verifies and forgets', async () => {
        const { memory: m } = await memory.remember({
            text: 'Live test: the user prefers the MON/USDC pool with at most 1% slippage.',
            entities: [{ label: 'Pool', name: 'MON/USDC' }],
            tags: ['live-test'],
        });

        const byKeyword = await memory.recall({ query: 'slippage pool' });
        expect(byKeyword.memories.map((r) => r.memory._id)).toContain(m._id);

        const byEntity = await memory.recall({ entity: 'MON/USDC' });
        expect(byEntity.memories.map((r) => r.memory._id)).toContain(m._id);

        expect((await memory.verifyHash(m._id))!.hashValid).toBe(true);
        expect(await memory.forget(m._id)).toBe(true);
        expect((await memory.recall({ query: 'slippage' })).memories).toEqual([]);
    }, LIVE_TIMEOUT_MS);
});
