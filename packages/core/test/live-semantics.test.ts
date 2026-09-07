// Checks, against a real PlugPort, the query behaviors the graph layer and
// test/fake-store.ts assume. Skipped unless PLUGPORT_URL and PLUGPORT_API_KEY
// are set. Stays under PlugPort's 20 writes / 10 seconds limit.

import { describe, it, expect, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { createAgentGraph, PlugPortError } from '../src/index.js';

try {
    process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
    // no .env file: rely on the environment
}

// On testnet every write waits for an on-chain confirmation (about 15s each).
const LIVE_TIMEOUT_MS = 300_000;
const url = process.env.PLUGPORT_URL;
const apiKey = process.env.PLUGPORT_API_KEY;
const graphName = `sem-${Date.now().toString(36)}`;

describe.skipIf(!url || !apiKey)('PlugPort semantics the graph relies on', () => {
    const { client, graph, memory } = url && apiKey
        ? createAgentGraph({ url, apiKey, graph: graphName })
        : ({} as ReturnType<typeof createAgentGraph>);

    afterAll(async () => {
        await client.deleteMany(graph.edgesCollection, {}).catch(() => undefined);
        await client.deleteMany(graph.nodesCollection, {}).catch(() => undefined);
        await client.deleteMany(`${graph.nodesCollection.replace(/_nodes$/, '')}_probe`, {}).catch(() => undefined);
    }, LIVE_TIMEOUT_MS);

    it('raw query behavior', async () => {
        const probe = `${graph.nodesCollection.replace(/_nodes$/, '')}_probe`;
        await client.insertMany(probe, [
            { _id: 'a', tags: ['x', 'y'], kw: ' alpha beta ', n: 1, name: 'Pool a.b' },
            { _id: 'b', tags: ['y'], kw: ' gamma ', n: 3, name: 'other' },
            { _id: 'c', tags: [], kw: ' beta ', n: 2, name: 'third' },
        ]);

        // duplicate _id -> 409 / code 11000, and the whole batch is rejected
        const dup = await client.insertMany(probe, [{ _id: 'd' }, { _id: 'a' }]).catch((e) => e);
        expect(dup).toBeInstanceOf(PlugPortError);
        expect(dup.isDuplicateKey).toBe(true);
        expect((await client.find(probe, { _id: 'd' })).length).toBe(0);
        // ...and leaves 'd' insertable (needs PlugPort's insert-rollback fix)
        expect(await client.insertMany(probe, [{ _id: 'd' }])).toBe(1);

        // $in compares whole values: never matches inside an array field
        expect(await client.find(probe, { tags: { $in: ['x'] } })).toEqual([]);
        // $in on a scalar field works, including _id
        expect((await client.find(probe, { _id: { $in: ['a', 'c', 'zz'] } })).map((d) => d._id).sort()).toEqual(['a', 'c']);
        // $or of $in branches
        expect((await client.find(probe, { $or: [{ _id: { $in: ['a'] } }, { n: 3 }] })).map((d) => d._id).sort()).toEqual(['a', 'b']);
        // $regex on a space-padded keyword string, and case-insensitive anchored names
        expect((await client.find(probe, { kw: { $regex: ' (?:beta|zeta) ' } })).map((d) => d._id).sort()).toEqual(['a', 'c']);
        expect((await client.find(probe, { name: { $regex: '^pool a\\.b$', $options: 'i' } })).map((d) => d._id)).toEqual(['a']);
        // sort descending + limit
        expect((await client.find(probe, { n: { $gte: 1 } }, { sort: { n: -1 }, limit: 2 })).map((d) => d._id)).toEqual(['b', 'c']);
        // $ne on a missing field matches
        expect((await client.find(probe, { label: { $ne: 'Memory' }, _id: 'b' })).length).toBe(1);
        // deleteMany with $or
        expect(await client.deleteMany(probe, { $or: [{ _id: 'd' }, { n: 2 }] })).toBe(2);
    }, LIVE_TIMEOUT_MS);

    it('graph traversal and tamper detection end to end', async () => {
        const { memory: m } = await memory.remember({
            text: 'Agent swap failed on pool X because of slippage.',
            entities: [{ label: 'Agent', name: 'Trader' }, { label: 'Pool', name: 'X' }, { label: 'Token', name: 'USDC' }],
            relations: [{ from: 'X', type: 'TRADES', to: 'USDC' }, { from: 'Trader', type: 'FAILED_ON', to: 'X' }],
        });
        const t = await graph.traverse('token_usdc', { maxDepth: 2 });
        expect(t.depth).toMatchObject({ token_usdc: 0, pool_x: 1 });
        expect(t.depth[m._id]).toBe(1); // memory MENTIONS usdc directly
        expect(t.depth['agent_trader']).toBe(2);

        const out = await graph.traverse('agent_trader', { maxDepth: 3, direction: 'out' });
        expect(Object.keys(out.depth).sort()).toEqual(['agent_trader', 'pool_x', 'token_usdc']);

        expect((await memory.verifyHash(m._id))!.hashValid).toBe(true);
        await client.updateOne(graph.nodesCollection, { _id: m._id }, { $set: { text: 'Swap succeeded.' } });
        expect((await memory.verifyHash(m._id))!.hashValid).toBe(false);
    }, LIVE_TIMEOUT_MS);
});
