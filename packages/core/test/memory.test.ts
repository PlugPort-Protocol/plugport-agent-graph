import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../src/graph.js';
import { Memory, MENTIONS } from '../src/memory.js';
import { GraphError } from '../src/errors.js';
import { FakeStore } from './fake-store.js';

let store: FakeStore;
let memory: Memory;

beforeEach(() => {
    store = new FakeStore();
    memory = new Memory(new GraphStore(store));
});

/** Distinct createdAt values, so "most recent" is well defined. */
const tick = () => new Promise((r) => setTimeout(r, 5));

async function seedDefi() {
    const prefs = await memory.remember({
        text: 'User never accepts more than 1% slippage and wants to avoid the SCAM token.',
        entities: [{ label: 'User', name: 'Alice' }, { label: 'Token', name: 'SCAM' }],
        relations: [{ from: 'Alice', type: 'avoids', to: 'SCAM' }],
        tags: ['preference'],
    });
    await tick();
    const failure = await memory.remember({
        text: 'Swap of 10 MON to USDC failed on pool MON/USDC-A because slippage was 3.2%.',
        entities: [{ label: 'Pool', name: 'MON/USDC-A' }, { label: 'Token', name: 'USDC' }],
        relations: [{ from: 'MON/USDC-A', type: 'trades', to: 'USDC' }],
        tags: ['failure'],
    });
    await tick();
    const unrelated = await memory.remember({ text: 'The weekly team call moved to Thursday.' });
    return { prefs, failure, unrelated };
}

describe('remember', () => {
    it('removes the memory again when its edges fail to save, so a retry does not duplicate it', async () => {
        const graph = new GraphStore(store);
        const insert = store.insertMany.bind(store);
        store.insertMany = async (collection, docs) => {
            if (collection === graph.edgesCollection) throw new Error('PlugPort returned HTTP 500');
            return insert(collection, docs);
        };
        const input = { text: 'User caps slippage at 1%.', entities: [{ label: 'User', name: 'me' }] };
        await expect(memory.remember(input)).rejects.toThrow('HTTP 500');
        expect(store.all(graph.nodesCollection).filter((n) => n.label === 'Memory')).toEqual([]);
        expect(store.all(graph.nodesCollection).map((n) => n._id)).toEqual(['user_me']);

        store.insertMany = insert;
        await memory.remember(input);
        expect(store.all(graph.nodesCollection).filter((n) => n.label === 'Memory').length).toBe(1);
    });

    it('writes the memory, entities and edges in two write requests', async () => {
        const { memory: m, entities, edges } = await memory.remember({
            text: 'Alice leads Project Atlas, which launches on Nov 1.',
            entities: [{ label: 'Person', name: 'Alice' }, { label: 'Project', name: 'Atlas', props: { launch: '2026-11-01' } }],
            relations: [{ from: 'alice', type: 'leads', to: 'Atlas' }],
            tags: ['Planning', 'planning'],
        });
        expect(store.writes).toBe(2);
        expect(m._id).toMatch(/^mem_/);
        expect(m.label).toBe('Memory');
        expect(m.props).toEqual({ tags: ['planning'] });
        expect(m.hash).toMatch(/^0x[0-9a-f]{64}$/);
        expect(m.keywords).toContain(' atlas ');
        expect(entities.map((e) => e._id).sort()).toEqual(['person_alice', 'project_atlas']);
        expect(edges.map((e) => `${e.from} ${e.type} ${e.to}`).sort()).toEqual([
            `${m._id} ${MENTIONS} person_alice`,
            `${m._id} ${MENTIONS} project_atlas`,
            'person_alice LEADS project_atlas',
        ].sort());
    });

    it('reuses existing entities across memories', async () => {
        await memory.remember({ text: 'Alice joined.', entities: [{ label: 'Person', name: 'Alice' }] });
        await memory.remember({ text: 'Alice left.', entities: [{ label: 'Person', name: 'alice' }] });
        expect(store.all('mem_nodes').filter((n) => n.label === 'Person')).toHaveLength(1);
        expect(store.all('mem_edges')).toHaveLength(2);
    });

    it('links relations to existing node ids', async () => {
        await memory.remember({ text: 'Bob exists.', entities: [{ label: 'Person', name: 'Bob' }] });
        const { edges } = await memory.remember({
            text: 'Carol reports to Bob.',
            entities: [{ label: 'Person', name: 'Carol' }],
            relations: [{ from: 'Carol', type: 'REPORTS_TO', to: 'person_bob' }],
        });
        expect(edges.some((e) => e.from === 'person_carol' && e.to === 'person_bob')).toBe(true);
    });

    it('rejects bad input before writing anything', async () => {
        await expect(memory.remember({ text: '  ' })).rejects.toThrow(GraphError);
        await expect(memory.remember({ text: 'x', entities: [{ label: 'Memory', name: 'y' }] })).rejects.toThrow(/reserved/);
        await expect(memory.remember({ text: 'x', entities: [{ label: 'Person', name: '' }] })).rejects.toThrow(GraphError);
        await expect(memory.remember({ text: 'x', tags: 'nope' as unknown as string[] })).rejects.toThrow(GraphError);
        await expect(memory.remember({ text: 'x', relations: [{ from: 'a', type: '!!', to: 'b' }] })).rejects.toThrow(GraphError);
        await expect(memory.remember({ text: 'x', entities: [{ label: 'Person', name: 'Dan' }], relations: [{ from: 'Dan', type: '!!', to: 'Dan' }] })).rejects.toThrow(GraphError);
        await expect(memory.remember({ text: 'x', relations: [{ from: 'Not An Id', type: 'KNOWS', to: 'b' }] })).rejects.toThrow(GraphError);
        await expect(memory.link({ label: 'A', name: 'a' }, '!!', { label: 'B', name: 'b' })).rejects.toThrow(GraphError);
        expect(store.writes).toBe(0);
    });

    it('fails on a relation to an unknown node', async () => {
        await expect(memory.remember({ text: 'x', entities: [{ label: 'Person', name: 'Dan' }], relations: [{ from: 'Dan', type: 'KNOWS', to: 'nobody' }] }))
            .rejects.toMatchObject({ code: 'NODE_NOT_FOUND' });
        expect(store.writes).toBe(0);
    });
});

describe('recall', () => {
    it('finds memories by keyword and ranks direct hits first', async () => {
        const { prefs, failure } = await seedDefi();
        const r = await memory.recall({ query: 'what slippage does the user accept?' });
        const ids = r.memories.map((m) => m.memory._id);
        expect(ids[0]).toBe(prefs.memory._id); // "user" + "slippage"
        expect(ids).toContain(failure.memory._id); // "slippage"
        expect(r.memories[0]!.hits).toBeGreaterThanOrEqual(2);
        expect(r.memories[0]!.distance).toBe(0);
    });

    it('finds memories through an entity, by name or id', async () => {
        const { failure, unrelated } = await seedDefi();
        for (const entity of ['usdc', 'USDC', 'token_usdc']) {
            const r = await memory.recall({ entity });
            const ids = r.memories.map((m) => m.memory._id);
            expect(ids).toContain(failure.memory._id);
            expect(ids).not.toContain(unrelated.memory._id);
        }
    });

    it('reaches further with more hops', async () => {
        const { prefs } = await seedDefi();
        // SCAM -> (MENTIONS from prefs memory) at 1 hop
        expect((await memory.recall({ entity: 'SCAM', hops: 1 })).memories.map((m) => m.memory._id)).toEqual([prefs.memory._id]);
        // with 0 hops only the entity itself matches, no memories
        expect((await memory.recall({ entity: 'SCAM', hops: 0 })).memories).toEqual([]);
    });

    it('returns the surrounding context subgraph', async () => {
        await seedDefi();
        const r = await memory.recall({ entity: 'Alice' });
        const ids = r.context.nodes.map((n) => n._id);
        expect(ids).toContain('user_alice');
        expect(ids).toContain('token_scam');
        expect(r.context.edges.length).toBeGreaterThan(0);
    });

    it('returns recent memories when given nothing to search for', async () => {
        const { unrelated } = await seedDefi();
        const r = await memory.recall({ limit: 2 });
        expect(r.memories).toHaveLength(2);
        expect(r.memories[0]!.memory._id).toBe(unrelated.memory._id);
    });

    it('returns nothing for unknown terms', async () => {
        await seedDefi();
        expect(await memory.recall({ query: 'zebra' })).toEqual({ memories: [], context: { nodes: [], edges: [] } });
        expect((await memory.recall({ entity: 'Nobody' })).memories).toEqual([]);
    });

    it('treats regex characters in entity names literally', async () => {
        await memory.remember({ text: 'Pool a.b exists.', entities: [{ label: 'Pool', name: 'a.b' }] });
        expect((await memory.findEntities('a.b')).map((n) => n.name)).toEqual(['a.b']);
        expect(await memory.findEntities('axb')).toEqual([]);
    });
});

describe('forget and verify', () => {
    it('forgets a memory and its edges, but not entities', async () => {
        const { prefs } = await seedDefi();
        expect(await memory.forget(prefs.memory._id)).toBe(true);
        expect(await memory.forget(prefs.memory._id)).toBe(false);
        expect(store.all('mem_edges').some((e) => e.from === prefs.memory._id)).toBe(false);
        await expect(memory.forget('user_alice')).rejects.toMatchObject({ code: 'NOT_A_MEMORY' });
    });

    it('detects tampering with stored memory content', async () => {
        const { failure } = await seedDefi();
        expect(await memory.verifyHash(failure.memory._id)).toMatchObject({ hashValid: true });
        store.tamper('mem_nodes', failure.memory._id, { text: 'Swap succeeded.' });
        const v = await memory.verifyHash(failure.memory._id);
        expect(v!.hashValid).toBe(false);
        expect(v!.storedHash).toBe(failure.memory.hash);
        expect(v!.computedHash).not.toBe(failure.memory.hash);
        expect(await memory.verifyHash('mem_missing')).toBeNull();
    });

    it('keeps hashes valid after a JSON round trip of odd props', async () => {
        const { memory: m } = await memory.remember({ text: 'Odd props.', props: { when: new Date(0), n: 1.5, nested: { b: 1, a: [1, 'x'] } } });
        expect(m.props.when).toBe('1970-01-01T00:00:00.000Z');
        expect((await memory.verifyHash(m._id))!.hashValid).toBe(true);
    });
});

describe('link', () => {
    it('creates both entities and the edge', async () => {
        const { nodes, edge } = await memory.link({ label: 'Agent', name: 'Trader' }, 'executed on', { label: 'Contract', name: 'Router' });
        expect(nodes.map((n) => n._id)).toEqual(['agent_trader', 'contract_router']);
        expect(edge).toMatchObject({ from: 'agent_trader', type: 'EXECUTED_ON', to: 'contract_router' });
    });
});
