import { describe, it, expect } from 'vitest';
import type { Content, FunctionDeclaration } from '@google/genai';
import { Anchorer, GraphStore, InMemoryAnchorChain, InMemoryDocStore, Memory } from '@pag/core';
import { Agent } from '../src/agent.js';
import { MockDex } from '../src/dex.js';
import { readTurn, retryDelay, type ChatModel, type ModelTurn } from '../src/model.js';
import { checkSession2, runScriptedDemo } from '../src/demo.js';
import { runTool, TOOLS, type ToolContext } from '../src/tools.js';

function context(): ToolContext {
    const graph = new GraphStore(new InMemoryDocStore());
    return { memory: new Memory(graph), anchor: new Anchorer(graph, new InMemoryAnchorChain()), dex: new MockDex() };
}

/** Replays fixed model messages and records what it was sent. */
class ScriptedModel implements ChatModel {
    readonly name = 'scripted';
    readonly seen: { history: Content[]; tools: FunctionDeclaration[] }[] = [];
    constructor(private readonly turns: Content[]) {}
    async generate(history: Content[], { tools }: { system: string; tools: FunctionDeclaration[] }): Promise<ModelTurn> {
        this.seen.push({ history: structuredClone(history), tools });
        const content = this.turns.shift() ?? { role: 'model', parts: [{ text: 'done' }] };
        return { content, ...readTurn(content) };
    }
}

const call = (name: string, args: Record<string, unknown>, id?: string): Content => ({
    role: 'model',
    parts: [{ text: 'thinking about it', thought: true }, { functionCall: { name, args, ...(id ? { id } : {}) }, thoughtSignature: 'sig-123' }],
});

describe('Agent loop', () => {
    it('runs tool calls and sends results back until the model answers', async () => {
        const ctx = context();
        const model = new ScriptedModel([
            call('remember', { text: 'User caps slippage at 1%.', tags: ['preference'] }, 'call_1'),
            { role: 'model', parts: [{ text: 'Saved.' }] },
        ]);
        const reply = await new Agent(model, ctx).send('Remember: max 1% slippage.');
        expect(reply.text).toBe('Saved.');
        expect(reply.steps).toBe(2);
        expect(reply.toolCalls[0]).toMatchObject({ name: 'remember', result: { output: { saved: true } } });
        expect((await ctx.memory.recent()).map((m) => m.text)).toEqual(['User caps slippage at 1%.']);

        // second call: the model's message is kept unchanged (thought + signature), then the matching response
        const history = model.seen[1]!.history;
        expect(history[1]).toEqual(call('remember', { text: 'User caps slippage at 1%.', tags: ['preference'] }, 'call_1'));
        expect(history[2]!.parts![0]!.functionResponse).toMatchObject({ id: 'call_1', name: 'remember', response: { output: { saved: true } } });
        expect(model.seen[0]!.tools.map((t) => t.name).sort()).toEqual(Object.keys(TOOLS).sort());
    });

    it('returns tool errors to the model instead of throwing', async () => {
        const model = new ScriptedModel([call('execute_swap', { pool: 'NOPE', token_in: 'MON', token_out: 'USDC', amount: 1, max_slippage_pct: 1 }), call('teleport', {})]);
        const reply = await new Agent(model, context()).send('go');
        expect(reply.toolCalls.map((c) => c.result)).toEqual([
            { error: expect.stringContaining('Unknown pool NOPE') },
            { error: expect.stringContaining('Unknown tool teleport') },
        ]);
        expect(reply.text).toBe('done');
    });

    it('stops after maxSteps', async () => {
        const loop = Array.from({ length: 5 }, () => call('get_quote', { token_in: 'MON', token_out: 'USDC', amount: 1 }));
        const reply = await new Agent(new ScriptedModel(loop), context(), { maxSteps: 3 }).send('loop');
        expect(reply).toMatchObject({ steps: 3, text: expect.stringContaining('Stopped after 3 steps') });
    });

    it('keeps chat history per agent; memory is shared through the store', async () => {
        const ctx = context();
        const a = new Agent(new ScriptedModel([call('remember', { text: 'Pool MON/USDC-A failed a swap.' })]), ctx);
        await a.send('first');
        const b = new Agent(new ScriptedModel([call('recall', { query: 'pool failed' })]), ctx);
        expect(b.history).toEqual([]);
        const reply = await b.send('second');
        const out = reply.toolCalls[0]!.result as { output: { memories: { text: string }[] } };
        expect(out.output.memories.map((m) => m.text)).toEqual(['Pool MON/USDC-A failed a swap.']);
    });
});

describe('readTurn', () => {
    it('separates function calls and visible text, without thoughts', () => {
        expect(readTurn({ role: 'model', parts: [{ text: 'secret plan', thought: true }, { text: 'Hello ' }, { text: 'there' }] }))
            .toEqual({ functionCalls: [], text: 'Hello there' });
        expect(readTurn(call('recall', { query: 'x' }, 'c1')).functionCalls).toEqual([{ name: 'recall', args: { query: 'x' }, id: 'c1' }]);
    });
});

describe('MockDex', () => {
    const dex = new MockDex();
    it('quotes every pool for the pair, best output first', () => {
        expect(dex.quote('mon', 'usdc', 10).map((q) => [q.pool, q.expectedOut])).toEqual([['MON/USDC-A', 31.2], ['MON/USDC-B', 30.8]]);
        expect(dex.quote('USDC', 'MON', 31.2)[0]).toMatchObject({ pool: 'MON/USDC-B' });
        expect(dex.quote('MON', 'DOGE', 1)).toEqual([]);
    });
    it('fails a swap whose execution slippage is over the max, fills otherwise', () => {
        expect(dex.swap('MON/USDC-A', 'MON', 'USDC', 10, 1)).toMatchObject({ status: 'failed', slippagePct: 3.2 });
        expect(dex.swap('MON/USDC-A', 'MON', 'USDC', 10, 5)).toMatchObject({ status: 'filled' });
        expect(dex.swap('mon/usdc-b', 'MON', 'USDC', 10, 1)).toMatchObject({ status: 'filled', amountOut: 30.6768 });
    });
    it('rejects bad input', () => {
        expect(() => dex.swap('MON/USDC-B', 'MON', 'SCAM', 1, 1)).toThrow(/does not trade/);
        expect(() => dex.swap('MON/USDC-B', 'MON', 'USDC', -1, 1)).toThrow(/positive/);
        expect(() => dex.swap('MON/USDC-B', 'MON', 'USDC', 1, Number.NaN)).toThrow(/max_slippage_pct/);
    });
});

describe('tools', () => {
    it('link, anchor_now and verify_memory work end to end', async () => {
        const ctx = context();
        expect(await runTool('link', { from: { label: 'User', name: 'me' }, type: 'avoids', to: { label: 'Token', name: 'SCAM' } }, ctx))
            .toEqual({ output: { linked: true, from: 'me', type: 'AVOIDS', to: 'SCAM' } });
        expect(await runTool('anchor_now', {}, ctx)).toEqual({ output: { anchored: 0, message: 'Nothing new to anchor.', skipped: [] } });
        const saved = (await runTool('remember', { text: 'User avoids SCAM.' }, ctx)) as { output: { id: string } };
        expect(await runTool('anchor_now', {}, ctx)).toMatchObject({ output: { anchored: 1 } });
        expect(await runTool('verify_memory', { id: saved.output.id }, ctx)).toMatchObject({ output: { verified: true, problem: null } });
    });
    it('reports anchoring as unavailable without a chain', async () => {
        expect(await runTool('anchor_now', {}, { ...context(), anchor: null })).toEqual({ error: expect.stringContaining('not configured') });
    });
});

describe('demo', () => {
    it('the scripted demo runs the whole story offline', async () => {
        const log = console.log;
        console.log = () => {};
        try {
            expect(await runScriptedDemo(context())).toBe(true);
        } finally {
            console.log = log;
        }
    });

    it('checkSession2 flags a model that ignored its memory', () => {
        const swap = (pool: string, out: string, max: number, status: string) => ({ name: 'execute_swap', args: { pool, token_out: out, max_slippage_pct: max }, result: { output: { status } } });
        const bad = checkSession2([{ text: '', steps: 1, toolCalls: [swap('MON/USDC-A', 'USDC', 3, 'filled'), swap('MON/SCAM-X', 'SCAM', 1, 'filled')] }]);
        expect(bad.filter((c) => !c.ok).map((c) => c.label)).toEqual([
            'recalled memory before trading', 'kept max slippage at or below 1%', 'did not trade on the pool that failed (MON/USDC-A)', 'refused to buy SCAM',
        ]);
    });
});

describe('retryDelay', () => {
    it('uses the delay Google asks for, plus a second, capped at 65s', () => {
        expect(retryDelay(new Error('{"error":{"details":[{"retryDelay": "37s"}]}}'), 2000)).toBe(38_000);
        expect(retryDelay(new Error('got {\\"retryDelay\\":\\"12.5s\\"}'), 2000)).toBe(13_500);
        expect(retryDelay(new Error('"retryDelay": "300s"'), 2000)).toBe(65_000);
        expect(retryDelay(new Error('quota exceeded'), 4000)).toBe(4000);
    });
});

describe('runTool errors', () => {
    it('shortens long error messages', async () => {
        const ctx = context();
        const long = 'x'.repeat(5000);
        const result = await runTool('execute_swap', { pool: long, token_in: 'MON', token_out: 'USDC', amount: 1, max_slippage_pct: 1 }, ctx);
        expect('error' in result && result.error.length).toBe(301);
    });
});
