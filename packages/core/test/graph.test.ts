import { describe, it, expect, beforeEach } from 'vitest';
import { graphsFromCollections, GraphStore } from '../src/graph.js';
import { GraphError, PlugPortError } from '../src/errors.js';
import { edgeId } from '../src/ids.js';
import { FakeStore } from './fake-store.js';

let store: FakeStore;
let g: GraphStore;

beforeEach(() => {
    store = new FakeStore();
    g = new GraphStore(store);
});

async function chain(ids: string[]) {
    await g.upsertNodes(ids.map((id) => ({ id, label: 'Thing', name: id })));
    await g.upsertEdges(ids.slice(1).map((id, i) => ({ from: ids[i]!, type: 'NEXT', to: id })));
}

describe('collections', () => {
    it('uses mem_* in the caller namespace, or a qualified name for another wallet', () => {
        expect(g.nodesCollection).toBe('mem_nodes');
        expect(g.edgesCollection).toBe('mem_edges');
        expect(g.anchorsCollection).toBe('mem_anchors');
        const other = new GraphStore(store, { graph: 'demo', owner: '0xA11CE00000000000000000000000000000000001' });
        expect(other.nodesCollection).toBe('0xa11ce00000000000000000000000000000000001.mem_demo_nodes');
        expect(() => new GraphStore(store, { owner: 'alice' })).toThrow(GraphError);
        expect(() => new GraphStore(store, { graph: 'Bad Name' })).toThrow(GraphError);
    });
});

describe('nodes', () => {
    it('creates new nodes in one insert and is idempotent', async () => {
        await g.upsertNodes([
            { id: 'person_alice', label: 'Person', name: 'Alice' },
            { id: 'project_atlas', label: 'Project', name: 'Atlas' },
        ]);
        expect(store.writes).toBe(1);
        const again = await g.upsertNodes([{ id: 'person_alice', label: 'Person', name: 'Alice' }]);
        expect(store.writes).toBe(1); // nothing new, nothing written
        expect(again[0]!._id).toBe('person_alice');
        expect(store.all('mem_nodes')).toHaveLength(2);
        expect(store.all('mem_nodes').find((n) => n._id === 'person_alice')!.keywords).toBe(' alice ');
    });

    it('merges props into existing nodes', async () => {
        await g.upsertNodes([{ id: 'person_alice', label: 'Person', name: 'Alice', props: { role: 'lead' } }]);
        const [updated] = await g.upsertNodes([{ id: 'person_alice', label: 'Person', props: { team: 'core' } }]);
        expect(updated!.props).toEqual({ role: 'lead', team: 'core' });
        expect(updated!.name).toBe('Alice');
        expect((await g.getNode('person_alice'))!.props).toEqual({ role: 'lead', team: 'core' });
    });

    it('merges duplicate ids within one call', async () => {
        const res = await g.upsertNodes([
            { id: 'x', label: 'Thing', props: { a: 1 } },
            { id: 'x', label: 'Thing', props: { b: 2 } },
        ]);
        expect(res).toHaveLength(1);
        expect(res[0]!.props).toEqual({ a: 1, b: 2 });
    });

    it('refuses to modify a memory', async () => {
        await g.upsertNodes([{ id: 'mem_1', label: 'Memory', text: 'hi', props: {} }]);
        await expect(g.upsertNodes([{ id: 'mem_1', label: 'Memory', props: { x: 1 } }])).rejects.toThrow(/immutable/);
    });

    it('validates input', async () => {
        await expect(g.upsertNodes([{ id: 'Bad:Id', label: 'Thing' }])).rejects.toThrow(GraphError);
        await expect(g.upsertNodes([{ id: 'ok', label: '1bad' }])).rejects.toThrow(GraphError);
        await expect(g.upsertNodes([{ id: 'ok', label: 'Thing', props: [] as unknown as Record<string, unknown> }])).rejects.toThrow(GraphError);
        expect(store.writes).toBe(0);
    });

    it('recovers when another writer inserted the same id first', async () => {
        await g.upsertNodes([{ id: 'b', label: 'Thing' }]);
        const realGet = g.getNodes.bind(g);
        let first = true;
        // First lookup misses 'b' (as if it was written concurrently), so the insert hits a duplicate key.
        g.getNodes = async (ids) => {
            if (first) { first = false; return []; }
            return realGet(ids);
        };
        const res = await g.upsertNodes([{ id: 'a', label: 'Thing' }, { id: 'b', label: 'Thing' }]);
        expect(res.map((n) => n._id)).toEqual(['a', 'b']);
        expect(store.all('mem_nodes').map((n) => n._id).sort()).toEqual(['a', 'b']);
    });

    it('surfaces other PlugPort errors', async () => {
        store.insertMany = async () => { throw new PlugPortError(403, undefined, 'Access denied'); };
        await expect(g.upsertNodes([{ id: 'a', label: 'Thing' }])).rejects.toMatchObject({ status: 403 });
    });

    it('deleteNode removes the node and every edge touching it', async () => {
        await chain(['a', 'b', 'c']);
        expect(await g.deleteNode('b')).toEqual({ deleted: true, edgesDeleted: 2 });
        expect(store.all('mem_edges')).toHaveLength(0);
        expect(await g.getNode('b')).toBeNull();
        expect(await g.deleteNode('b')).toEqual({ deleted: false, edgesDeleted: 0 });
    });
});

describe('edges', () => {
    it('requires both endpoints to exist', async () => {
        await g.upsertNodes([{ id: 'a', label: 'Thing' }]);
        await expect(g.upsertEdges([{ from: 'a', type: 'LINKS', to: 'nope' }])).rejects.toMatchObject({ code: 'NODE_NOT_FOUND' });
    });

    it('is idempotent, normalizes the type and merges props', async () => {
        await g.upsertNodes([{ id: 'a', label: 'Thing' }, { id: 'b', label: 'Thing' }]);
        const [e1] = await g.upsertEdges([{ from: 'a', type: 'works on', to: 'b', props: { since: 2024 } }]);
        expect(e1!.type).toBe('WORKS_ON');
        expect(e1!._id).toBe(edgeId('a', 'WORKS_ON', 'b'));
        const [e2] = await g.upsertEdges([{ from: 'a', type: 'WORKS_ON', to: 'b', props: { role: 'lead' } }]);
        expect(e2!.props).toEqual({ since: 2024, role: 'lead' });
        expect(store.all('mem_edges')).toHaveLength(1);
    });
});

describe('traversal', () => {
    it('neighbors respects direction', async () => {
        await chain(['a', 'b', 'c']);
        expect((await g.neighbors('b', { direction: 'out' })).edges.map((e) => e.to)).toEqual(['c']);
        expect((await g.neighbors('b', { direction: 'in' })).edges.map((e) => e.from)).toEqual(['a']);
        const both = await g.neighbors('b');
        expect(both.nodes.map((n) => n._id).sort()).toEqual(['a', 'b', 'c']);
    });

    it('expands breadth-first up to maxDepth, recording distances', async () => {
        await chain(['a', 'b', 'c', 'd', 'e']);
        const t = await g.traverse('a', { maxDepth: 2 });
        expect(t.depth).toEqual({ a: 0, b: 1, c: 2 });
        expect(t.edges).toHaveLength(2);
        const reads = store.reads;
        await g.traverse('a', { maxDepth: 2 });
        // start lookup + one edge query per level + final node lookup
        expect(store.reads - reads).toBe(4);
    });

    it('caps depth at 3 and the node count at the limit', async () => {
        await chain(['a', 'b', 'c', 'd', 'e', 'f']);
        expect(Object.keys((await g.traverse('a', { maxDepth: 10 })).depth)).toHaveLength(4);
        expect((await g.traverse('a', { maxDepth: 3, limit: 2 })).nodes).toHaveLength(2);
    });

    it('terminates on cycles', async () => {
        await chain(['a', 'b', 'c']);
        await g.upsertEdges([{ from: 'c', type: 'NEXT', to: 'a' }]);
        const t = await g.traverse('a', { maxDepth: 3 });
        expect(Object.keys(t.depth).sort()).toEqual(['a', 'b', 'c']);
        expect(t.edges).toHaveLength(3);
    });

    it('follows only the requested direction and types', async () => {
        await chain(['a', 'b', 'c']);
        await g.upsertNodes([{ id: 'x', label: 'Thing' }]);
        await g.upsertEdges([{ from: 'x', type: 'OTHER', to: 'b' }]);
        expect(Object.keys((await g.traverse('b', { maxDepth: 1, direction: 'out' })).depth).sort()).toEqual(['b', 'c']);
        expect(Object.keys((await g.traverse('b', { maxDepth: 1, direction: 'in' })).depth).sort()).toEqual(['a', 'b', 'x']);
        expect(Object.keys((await g.traverse('b', { maxDepth: 1, types: ['next'] })).depth).sort()).toEqual(['a', 'b', 'c']);
    });

    it('ignores unknown start nodes and drops edges to deleted nodes', async () => {
        expect(await g.traverse('missing')).toEqual({ nodes: [], edges: [], depth: {} });
        await chain(['a', 'b']);
        store.collections.get('mem_nodes')!.delete('b'); // dangling edge a -> b
        const t = await g.traverse('a');
        expect(t.nodes.map((n) => n._id)).toEqual(['a']);
        expect(t.edges).toEqual([]);
    });

    it('snapshot returns recent nodes and the edges among them', async () => {
        await chain(['a', 'b', 'c']);
        const s = await g.snapshot(10);
        expect(s.nodes).toHaveLength(3);
        expect(s.edges).toHaveLength(2);
    });
});

describe('graphsFromCollections', () => {
    it('finds the caller\'s graphs, newest first, skipping empty and foreign ones', () => {
        expect(graphsFromCollections([
            { name: 'mem_nodes', documentCount: 5, createdAt: 1 },
            { name: 'mem_edges', documentCount: 7, createdAt: 1 },
            { name: 'mem_demo-1_nodes', documentCount: 3, createdAt: 9 },
            { name: 'mem_demo-1_anchors', documentCount: 1, createdAt: 10 },
            { name: 'mem_old_nodes', documentCount: 0, createdAt: 20 },
            { name: '0xabc.mem_nodes', documentCount: 4, createdAt: 30 },
            { name: 'users', documentCount: 2, createdAt: 40 },
            { name: 'mem_x_probe', documentCount: 2, createdAt: 50 },
        ])).toEqual([
            { graph: 'demo-1', nodes: 3, edges: 0, anchors: 1, createdAt: 10 },
            { graph: 'default', nodes: 5, edges: 7, anchors: 0, createdAt: 1 },
        ]);
    });
});
