import { describe, it, expect } from 'vitest';
import { PlugPortClient } from '../src/plugport.js';
import { PlugPortError } from '../src/errors.js';

interface Call { url: string; init: RequestInit }

function mockFetch(responses: Array<{ status: number; body: unknown }>) {
    const calls: Call[] = [];
    const fn = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        const r = responses.shift();
        if (!r) throw new Error('no more responses');
        return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    return { fn, calls };
}

describe('PlugPortClient', () => {
    it('posts to the collection route with the API key and unwraps results', async () => {
        const { fn, calls } = mockFetch([
            { status: 200, body: { cursor: { firstBatch: [{ _id: 'a' }], id: 0 }, ok: 1 } },
            { status: 200, body: { acknowledged: true, insertedCount: 2, ok: 1 } },
            { status: 200, body: { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedId: null, ok: 1 } },
            { status: 200, body: { acknowledged: true, deletedCount: 3, ok: 1 } },
            { status: 200, body: { count: 7, ok: 1 } },
        ]);
        const client = new PlugPortClient({ url: 'http://pp.test/', apiKey: 'pp_key', fetch: fn });

        expect(await client.find('mem_nodes', { _id: 'a' }, { limit: 1 })).toEqual([{ _id: 'a' }]);
        expect(await client.insertMany('mem_nodes', [{ _id: 'b' }, { _id: 'c' }])).toBe(2);
        expect(await client.updateMany('mem_nodes', { label: 'Memory' }, { $set: { x: 1 } })).toEqual({ matchedCount: 1, modifiedCount: 1, upsertedId: null });
        expect(await client.deleteMany('mem_edges', { from: 'a' })).toBe(3);
        expect(await client.count('mem_nodes', {})).toBe(7);

        expect(calls[0]!.url).toBe('http://pp.test/api/v1/collections/mem_nodes/find');
        expect(calls[0]!.init.method).toBe('POST');
        expect((calls[0]!.init.headers as Record<string, string>)['x-api-key']).toBe('pp_key');
        expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ filter: { _id: 'a' }, limit: 1 });
        expect(JSON.parse(calls[1]!.init.body as string)).toEqual({ documents: [{ _id: 'b' }, { _id: 'c' }] });
        expect(calls[3]!.url).toBe('http://pp.test/api/v1/collections/mem_edges/deleteMany');
    });

    it('does not call PlugPort for an empty insert', async () => {
        const { fn, calls } = mockFetch([]);
        expect(await new PlugPortClient({ url: 'http://pp.test', fetch: fn }).insertMany('c', [])).toBe(0);
        expect(calls).toHaveLength(0);
    });

    it('encodes qualified collection names', async () => {
        const { fn, calls } = mockFetch([{ status: 200, body: { cursor: { firstBatch: [] }, ok: 1 } }]);
        await new PlugPortClient({ url: 'http://pp.test', fetch: fn }).find('0xabc.mem_nodes', {});
        expect(calls[0]!.url).toBe('http://pp.test/api/v1/collections/0xabc.mem_nodes/find');
    });

    it('retries on 429 and retryable 503, then succeeds', async () => {
        const { fn, calls } = mockFetch([
            { status: 429, body: { statusCode: 429, error: 'Too Many Requests', message: 'Rate limit exceeded' } },
            { status: 503, body: { ok: 0, retryable: true, errmsg: 'busy' } },
            { status: 200, body: { count: 1, ok: 1 } },
        ]);
        const client = new PlugPortClient({ url: 'http://pp.test', fetch: fn, retryDelayMs: 1 });
        expect(await client.count('c', {})).toBe(1);
        expect(calls).toHaveLength(3);
    });

    it('gives up after the retry budget with the server message', async () => {
        const { fn } = mockFetch([
            { status: 429, body: { message: 'Rate limit exceeded' } },
            { status: 429, body: { message: 'Rate limit exceeded' } },
        ]);
        const client = new PlugPortClient({ url: 'http://pp.test', fetch: fn, retries: 1, retryDelayMs: 1 });
        await expect(client.count('c', {})).rejects.toMatchObject({ status: 429, message: 'Rate limit exceeded' });
    });

    it('maps PlugPort errors, including duplicate keys', async () => {
        const { fn } = mockFetch([
            { status: 409, body: { ok: 0, code: 11000, errmsg: 'Duplicate key', codeName: 'DuplicateKey' } },
            { status: 403, body: { ok: 0, errmsg: 'Access denied' } },
        ]);
        const client = new PlugPortClient({ url: 'http://pp.test', fetch: fn });
        const dup = await client.insertMany('c', [{ _id: 'x' }]).catch((e) => e);
        expect(dup).toBeInstanceOf(PlugPortError);
        expect(dup.isDuplicateKey).toBe(true);
        expect(dup.code).toBe(11000);
        const denied = await client.find('c', {}).catch((e) => e);
        expect(denied).toMatchObject({ status: 403, message: 'Access denied' });
        expect(denied.isDuplicateKey).toBe(false);
    });

    it('reports an unreachable server', async () => {
        const fn = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
        await expect(new PlugPortClient({ url: 'http://down.test', fetch: fn }).count('c', {}))
            .rejects.toMatchObject({ status: 0, message: expect.stringContaining('unreachable') });
    });
});
