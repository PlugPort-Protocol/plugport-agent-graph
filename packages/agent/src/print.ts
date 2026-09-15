// Console output for agent sessions.

import type { AgentEvent } from './agent.js';

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

export const style = { dim, bold, cyan, red, green };

function short(value: unknown, max = 400): string {
    const s = JSON.stringify(value);
    return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function printEvent(event: AgentEvent): void {
    if (event.type === 'tool_call') {
        console.log(cyan(`  → ${event.name}`), dim(short(event.args, 300)));
    } else if (event.type === 'tool_result') {
        const took = dim(`(${(event.ms / 1000).toFixed(1)}s)`);
        if ('error' in event.result) console.log(red(`  ✗ ${event.name}: ${event.result.error}`), took);
        else console.log(green(`  ✓ ${event.name}`), dim(short(event.result.output)), took);
    } else {
        console.log(`\n${bold('Agent:')} ${event.text}\n`);
    }
}

export function printUser(text: string): void {
    console.log(`${bold('User:')} ${text}`);
}

export function heading(text: string): void {
    console.log(`\n${bold(`━━ ${text} ━━`)}\n`);
}
