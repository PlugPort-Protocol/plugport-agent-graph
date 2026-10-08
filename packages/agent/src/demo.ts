// The two-session demo. Session 1 teaches the agent a rule and lets it fail
// a swap; session 2 is a new agent with an empty chat history that has to get
// it right from long-term memory alone. Then one memory is verified against
// its on-chain anchor.

import { Agent, type AgentReply } from './agent.js';
import type { ChatModel } from './model.js';
import { heading, printEvent, printUser, style } from './print.js';
import { runTool, type ToolContext } from './tools.js';
import { setupSharedContext } from './setup.js';

export const SESSION_1 = [
    'Remember my rules: I never accept more than 1% slippage on any swap, and I never want to touch the SCAM token.',
    'Swap 10 MON to USDC at the best quoted price.',
    'Anchor your memories on-chain now.',
];

export const SESSION_2 = [
    'Swap 10 MON to USDC.',
    'Also buy 5 MON worth of SCAM.',
];

export interface DemoCheck {
    label: string;
    ok: boolean;
}

/** What session 2 must show: it recalled first, kept the 1% rule, avoided pool A and SCAM. */
export function checkSession2(replies: AgentReply[]): DemoCheck[] {
    const calls = replies.flatMap((r) => r.toolCalls);
    const firstRecall = calls.findIndex((c) => c.name === 'recall');
    const firstSwap = calls.findIndex((c) => c.name === 'execute_swap');
    const swaps = calls.filter((c) => c.name === 'execute_swap');
    const filled = swaps.filter((c) => 'output' in c.result && (c.result.output as { status?: string }).status === 'filled');
    const str = (v: unknown) => String(v ?? '').toUpperCase();
    return [
        { label: 'recalled memory before trading', ok: firstRecall >= 0 && (firstSwap < 0 || firstRecall < firstSwap) },
        { label: 'kept max slippage at or below 1%', ok: swaps.every((c) => Number(c.args.max_slippage_pct) <= 1) },
        { label: 'did not trade on the pool that failed (MON/USDC-A)', ok: swaps.every((c) => str(c.args.pool) !== 'MON/USDC-A') },
        { label: 'swapped MON to USDC successfully', ok: filled.some((c) => str(c.args.token_out) === 'USDC') },
        { label: 'refused to buy SCAM', ok: swaps.every((c) => str(c.args.token_out) !== 'SCAM') },
    ];
}

function printChecks(checks: DemoCheck[]): boolean {
    for (const c of checks) console.log(c.ok ? style.green(`  ✓ ${c.label}`) : style.red(`  ✗ ${c.label}`));
    return checks.every((c) => c.ok);
}

async function runSession(title: string, agent: Agent, messages: string[]): Promise<AgentReply[]> {
    heading(title);
    const replies: AgentReply[] = [];
    for (const m of messages) {
        printUser(m);
        replies.push(await agent.send(m));
    }
    return replies;
}

/** The demo with the model. Returns true when every session-2 check passed. */
export async function runDemo(model: ChatModel, ctx: ToolContext): Promise<boolean> {
    const s1 = new Agent(model, ctx, { onEvent: printEvent });
    await runSession('Session 1: a new user', s1, SESSION_1);

    const s2 = new Agent(model, ctx, { onEvent: printEvent });
    console.log(style.dim(`(Session 2 is a new agent: chat history is empty, ${s2.history.length} messages. Only PlugPort memory carries over.)`));
    const replies = await runSession('Session 2: the next day', s2, SESSION_2);

    heading('Did session 2 use its memory?');
    const ok = printChecks(checkSession2(replies));
    await verifySection(ctx);
    return ok;
}

/** The same story without a model: the tools called in a fixed order (fallback if the Gemini API is down). */
export async function runScriptedDemo(ctx: ToolContext): Promise<boolean> {
    const call = async (name: string, args: Record<string, unknown>) => {
        printEvent({ type: 'tool_call', name, args });
        const started = Date.now();
        const result = await runTool(name, args, ctx);
        printEvent({ type: 'tool_result', name, result, ms: Date.now() - started });
        if ('error' in result) throw new Error(`${name} failed: ${result.error}`);
        return result.output as Record<string, unknown>;
    };

    heading('Session 1 (scripted, no model)');
    printUser(SESSION_1[0]!);
    await call('remember', {
        text: 'The user never accepts more than 1% slippage on any swap and never wants to touch the SCAM token.',
        entities: [{ label: 'User', name: 'me' }, { label: 'Token', name: 'SCAM' }],
        relations: [{ from: 'me', type: 'AVOIDS', to: 'SCAM' }],
        tags: ['preference'],
    });
    printUser(SESSION_1[1]!);
    const q1 = await call('get_quote', { token_in: 'MON', token_out: 'USDC', amount: 10 });
    const best = (q1.quotes as { pool: string }[])[0]!.pool;
    const r1 = await call('execute_swap', { pool: best, token_in: 'MON', token_out: 'USDC', amount: 10, max_slippage_pct: 1 });
    await call('remember', {
        text: `Swapping 10 MON to USDC on pool ${best} failed: ${String(r1.reason ?? r1.status)}`,
        entities: [{ label: 'User', name: 'me' }, { label: 'Pool', name: best }, { label: 'Token', name: 'USDC' }],
        relations: [{ from: 'me', type: 'FAILED_ON', to: best }],
        tags: ['failure'],
    });
    printUser(SESSION_1[2]!);
    if (ctx.anchor) await call('anchor_now', {});

    heading('Session 2 (scripted, no model)');
    printUser(SESSION_2[0]!);
    const recalled = await call('recall', { query: 'slippage preference avoid failure swap', entity: 'me' });
    const texts = (recalled.memories as { text: string }[]).map((m) => m.text).join('\n');
    const maxSlippage = Number(/(\d+(?:\.\d+)?)% slippage/.exec(texts)?.[1] ?? 0.5);
    const failedPools = new Set((recalled.relations as string[]).filter((r) => r.includes(' FAILED_ON ')).map((r) => r.split(' FAILED_ON ')[1]));
    const q2 = await call('get_quote', { token_in: 'MON', token_out: 'USDC', amount: 10 });
    const pick = (q2.quotes as { pool: string }[]).find((q) => !failedPools.has(q.pool))!.pool;
    const r2 = await call('execute_swap', { pool: pick, token_in: 'MON', token_out: 'USDC', amount: 10, max_slippage_pct: maxSlippage });
    await call('remember', {
        text: `Swapped 10 MON to USDC on pool ${pick} with ${String(r2.slippagePct)}% slippage.`,
        entities: [{ label: 'Pool', name: pick }, { label: 'Token', name: 'USDC' }],
        tags: ['success'],
    });
    printUser(SESSION_2[1]!);
    const avoids = (recalled.relations as string[]).some((r) => /AVOIDS SCAM$/i.test(r));
    printEvent({ type: 'answer', text: avoids ? 'Not buying SCAM: your saved rule says never to touch the SCAM token.' : 'No rule against SCAM found.' });

    await verifySection(ctx);
    return avoids && r2.status === 'filled';
}

async function verifySection(ctx: ToolContext): Promise<void> {
    if (!ctx.anchor) return;
    heading('Verify a memory against its anchor');
    const anchored = (await ctx.memory.recent(50)).filter((m) => m.anchorId);
    const target = anchored[anchored.length - 1];
    if (!target) {
        console.log(style.dim('No anchored memory yet.'));
        return;
    }
    const v = await ctx.anchor.verify(target._id);
    console.log(`  "${target.text}"`);
    console.log(`  ${v?.verified ? style.green('✓ verified') : style.red(`✗ ${v?.problem}`)}: proof into root ${v?.root}`);
    if (v?.explorerUrl) console.log(`  anchor tx: ${v.explorerUrl}`);
}

/**
 * PLAN.md step 6 — Share the graph with a second wallet and recall from it.
 *
 * Wallet-2 (PLUGPORT_API_KEY_2) reads wallet-1's namespace via the `owner`
 * option in createAgentGraph(). This proves that a PlugPort Agent Graph can
 * be shared across wallets: the recipient can recall the same verifiable
 * memories without ever holding wallet-1's private key.
 *
 * Prerequisites:
 *   - PLUGPORT_API_KEY_2 set in .env
 *   - Wallet-1's graph shared with wallet-2 via PlugPort's grantRole ACL
 *     (use the PlugPort dashboard or the admin API)
 *
 * @param ctx      The wallet-1 ToolContext from the main demo run.
 * @param ownerAddress  Wallet-1's address (the graph owner).
 */
export async function runShareDemo(ctx: ToolContext, ownerAddress: string): Promise<void> {
    heading('Step 6: Cross-wallet graph sharing (wallet-2 reads wallet-1\'s graph)');

    let shared: ReturnType<typeof setupSharedContext>;
    try {
        shared = setupSharedContext(ownerAddress);
    } catch (err) {
        console.log(style.dim(`  Skipped: ${(err as Error).message}`));
        return;
    }

    console.log(style.dim(`  ${shared.where}`));

    const result = await shared.ctx.memory.recall({
        query: 'slippage preference avoid failure swap',
        hops: 1,
        limit: 10,
    });

    heading('Wallet-2 recalled from wallet-1\'s graph:');
    if (result.memories.length === 0) {
        console.log(style.red('  ✗ No memories found. Is the graph shared? Check PlugPort ACL (grantRole).'));
        return;
    }
    for (const r of result.memories) {
        console.log(`  • ${r.memory.text}`);
    }
    if (result.contextTruncated) {
        console.log(style.dim('  (context graph truncated at 300 nodes)'));
    }
    console.log(style.green(`  ✓ Cross-wallet memory sharing works — ${result.memories.length} memories recalled as wallet-2`));
}
