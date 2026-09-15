#!/usr/bin/env node
// pag-agent: the DeFi demo agent.
//
//   node dist/cli.js run "Swap 10 MON to USDC"   one message, new session
//   node dist/cli.js chat                        interactive session
//   node dist/cli.js demo                        two-session demo (fresh graph)
//
// Flags: --offline (in-memory store and chain), --graph <name>, --scripted
// (demo without the model).

import { createInterface } from 'node:readline/promises';
import { Agent } from './agent.js';
import { runDemo, runScriptedDemo } from './demo.js';
import { printEvent, style } from './print.js';
import { loadEnv, modelFromEnv, setupContext } from './setup.js';

function parse(argv: string[]) {
    const flags = new Set<string>();
    const values: Record<string, string> = {};
    const rest: string[] = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]!;
        if (a === '--graph') values.graph = argv[++i] ?? '';
        else if (a.startsWith('--')) flags.add(a.slice(2));
        else rest.push(a);
    }
    return { command: rest[0] ?? 'help', args: rest.slice(1), flags, values };
}

async function main(): Promise<number> {
    loadEnv();
    const { command, args, flags, values } = parse(process.argv.slice(2));
    const offline = flags.has('offline');

    if (command === 'demo') {
        const graph = values.graph || `demo-${Date.now().toString(36)}`;
        const { ctx, where } = setupContext({ offline, graph });
        console.log(style.dim(`Memory: ${where}`));
        if (flags.has('scripted')) return (await runScriptedDemo(ctx)) ? 0 : 1;
        const model = modelFromEnv();
        console.log(style.dim(`Model: ${model.name}`));
        return (await runDemo(model, ctx)) ? 0 : 1;
    }

    if (command === 'run' || command === 'chat') {
        const { ctx, where } = setupContext({ offline, ...(values.graph ? { graph: values.graph } : {}) });
        const model = modelFromEnv();
        console.log(style.dim(`Model: ${model.name}. Memory: ${where}`));
        const agent = new Agent(model, ctx, { onEvent: printEvent });
        if (command === 'run') {
            const message = args.join(' ').trim();
            if (!message) throw new Error('Usage: run "<message>"');
            await agent.send(message);
            return 0;
        }
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try {
            for (;;) {
                const line = (await rl.question('You: ')).trim();
                if (!line || line === 'exit' || line === 'quit') return 0;
                await agent.send(line);
            }
        } finally {
            rl.close();
        }
    }

    console.log(`Usage:
  pag-agent run "<message>"   one message in a new session
  pag-agent chat              interactive session
  pag-agent demo              the two-session demo, in a fresh graph
Flags: --offline  --graph <name>  --scripted (demo without the model)`);
    return command === 'help' ? 0 : 1;
}

main().then((code) => process.exit(code), (err) => {
    console.error(style.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
});
