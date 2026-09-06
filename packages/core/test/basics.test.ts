import { describe, it, expect } from 'vitest';
import { edgeId, entityId, memoryId, normalizeEdgeType, slug, assertNodeId, assertGraphName } from '../src/ids.js';
import { keywordHits, keywordPattern, keywordString, tokenize } from '../src/text.js';
import { canonicalJson, hashMemory, memoryHashValid } from '../src/hash.js';
import { GraphError } from '../src/errors.js';
import type { GraphNode } from '../src/types.js';

describe('ids', () => {
    it('derives stable, storage-safe entity ids', () => {
        expect(entityId('Person', 'Alice Smith')).toBe('person_alice-smith');
        expect(entityId('Token', 'USDC')).toBe(entityId('token', 'usdc'));
        expect(entityId('Pool', 'MON/USDC: 0.3%')).toBe('pool_mon-usdc-0-3');
        expect(() => entityId('Person', '!!!')).toThrow(GraphError);
        expect(() => assertNodeId(entityId('Person', 'x'.repeat(500)))).not.toThrow();
    });

    it('makes edge ids deterministic and free of separators', () => {
        const a = edgeId('person_alice', 'WORKS_ON', 'project_atlas');
        expect(a).toBe(edgeId('person_alice', 'WORKS_ON', 'project_atlas'));
        expect(a).not.toBe(edgeId('project_atlas', 'WORKS_ON', 'person_alice'));
        expect(a).toMatch(/^e_[0-9a-f]{32}$/);
    });

    it('makes unique memory ids', () => {
        expect(memoryId()).toMatch(/^mem_[0-9a-f]{32}$/);
        expect(memoryId()).not.toBe(memoryId());
    });

    it('normalizes relation types', () => {
        expect(normalizeEdgeType('works on')).toBe('WORKS_ON');
        expect(normalizeEdgeType('failed-on')).toBe('FAILED_ON');
        expect(() => normalizeEdgeType('123')).toThrow(GraphError);
        expect(() => normalizeEdgeType('')).toThrow(GraphError);
    });

    it('validates node ids and graph names', () => {
        expect(() => assertNodeId('ok_id-1')).not.toThrow();
        expect(() => assertNodeId('has:colon')).toThrow(GraphError);
        expect(() => assertNodeId('Upper')).toThrow(GraphError);
        expect(() => assertGraphName('demo-1')).not.toThrow();
        expect(() => assertGraphName('bad_name')).toThrow(GraphError);
        expect(slug('  Héllo  World ')).toBe('hello-world');
    });
});

describe('text', () => {
    it('tokenizes to distinct keywords without stopwords', () => {
        expect(tokenize('The user never wants more than 1% slippage on the MON/USDC pool')).toEqual(
            ['user', 'never', 'wants', 'slippage', 'mon', 'usdc', 'pool'],
        );
        expect(tokenize('a an to')).toEqual([]);
    });

    it('builds a pattern that matches whole keywords only', () => {
        const stored = keywordString(['alice', 'atlas', 'launch']);
        const re = new RegExp(keywordPattern(['atlas'])!);
        expect(re.test(stored)).toBe(true);
        expect(new RegExp(keywordPattern(['atla'])!).test(stored)).toBe(false);
        expect(new RegExp(keywordPattern(['launch'])!).test(stored)).toBe(true);
        expect(keywordPattern([])).toBeNull();
        expect(keywordHits(stored, ['atlas', 'launch', 'bob'])).toBe(2);
    });

    it('keeps the pattern under PlugPort\'s 500-char $regex cap', () => {
        const tokens = Array.from({ length: 64 }, (_, i) => `keyword${i}longer`);
        expect(keywordPattern(tokens)!.length).toBeLessThanOrEqual(480);
    });
});

describe('hash', () => {
    it('canonical JSON ignores key order and undefined', () => {
        expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 2 }] }, z: undefined }))
            .toBe('{"a":{"c":[3,{"e":2,"f":1}],"d":2},"b":1}');
    });

    it('detects any change to a memory', () => {
        const node: GraphNode = { _id: 'mem_1', label: 'Memory', props: { tags: ['x'] }, text: 'hello', keywords: ' hello ', createdAt: 1, updatedAt: 1 };
        node.hash = hashMemory(node);
        expect(memoryHashValid(node)).toBe(true);
        expect(memoryHashValid({ ...node, text: 'hellO' })).toBe(false);
        expect(memoryHashValid({ ...node, props: { tags: ['y'] } })).toBe(false);
        expect(memoryHashValid({ ...node, createdAt: 2 })).toBe(false);
        // stored keyword/updatedAt fields are not part of the content
        expect(memoryHashValid({ ...node, keywords: ' other ', updatedAt: 9 })).toBe(true);
        const { hash: _omit, ...unhashed } = node;
        expect(memoryHashValid(unhashed)).toBe(false);
    });
});
