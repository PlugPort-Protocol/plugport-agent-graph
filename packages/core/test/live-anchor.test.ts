// Anchoring end to end: real PlugPort + the deployed MemoryAnchor contract.
// Skipped unless PLUGPORT_URL, PLUGPORT_API_KEY, MONAD_RPC_URL,
// ANCHOR_CONTRACT and ANCHOR_PRIVATE_KEY are set. Sends one transaction.

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
const env = process.env;
const configured = Boolean(env.PLUGPORT_URL && env.PLUGPORT_API_KEY && env.MONAD_RPC_URL && env.ANCHOR_CONTRACT && env.ANCHOR_PRIVATE_KEY);

describe.skipIf(!configured)('live anchoring', () => {
    const { client, graph, memory, anchor } = configured
        ? createAgentGraph({
            url: env.PLUGPORT_URL!,
            apiKey: env.PLUGPORT_API_KEY!,
            graph: `anc-${Date.now().toString(36)}`,
            anchor: {
                rpcUrl: env.MONAD_RPC_URL!,
                contract: env.ANCHOR_CONTRACT!,
                privateKey: env.ANCHOR_PRIVATE_KEY!,
                ...(env.EXPLORER_TX_URL ? { explorerTxUrl: env.EXPLORER_TX_URL } : {}),
            },
        })
        : ({} as ReturnType<typeof createAgentGraph>);

    afterAll(async () => {
        for (const c of [graph.edgesCollection, graph.nodesCollection, graph.anchorsCollection]) {
            await client.deleteMany(c, {}).catch(() => undefined);
        }
    }, LIVE_TIMEOUT_MS);

    it('anchors a batch on Monad and verifies it, then detects tampering', async () => {
        const a = (await memory.remember({ text: 'Live anchor test: user caps slippage at 1%.' })).memory;
        const b = (await memory.remember({ text: 'Live anchor test: pool MON/USDC-A failed a swap.' })).memory;

        const { batch, skipped } = await anchor!.anchorPending();
        expect(skipped).toEqual([]);
        expect(batch).toMatchObject({ count: 2, recovered: false });
        expect(batch!.txHash).toMatch(/^0x[0-9a-f]{64}$/);
        console.log(`anchored ${batch!.root} in ${batch!.explorerUrl ?? batch!.txHash}`);

        const v = (await anchor!.verify(a._id))!;
        expect(v).toMatchObject({ hashValid: true, anchored: true, proofValid: true, onChain: true, verified: true });
        expect(v.anchoredBy!.toLowerCase()).toBe(anchor!.chain.signerAddress!.toLowerCase());
        expect(Math.abs(v.anchoredAt! - Date.now())).toBeLessThan(10 * 60_000);

        await client.updateOne(graph.nodesCollection, { _id: a._id }, { $set: { text: 'Swap succeeded.' } });
        expect(await anchor!.verify(a._id)).toMatchObject({ proofValid: false, verified: false });
        expect((await anchor!.verify(b._id))!.verified).toBe(true);
    }, LIVE_TIMEOUT_MS);
});
