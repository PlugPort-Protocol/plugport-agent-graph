// The agent loop: send the history to the model, run the function calls it
// makes, send the results back, until it answers in text. A session's chat
// history lives only in this object; anything that should outlive the
// session goes through the memory tools.

import type { Content, Part } from '@google/genai';
import type { ChatModel } from './model.js';
import { SYSTEM_PROMPT } from './prompt.js';
import { TOOLS, runTool, type ToolContext } from './tools.js';

export type AgentEvent =
    | { type: 'tool_call'; name: string; args: Record<string, unknown> }
    | { type: 'tool_result'; name: string; result: { output: unknown } | { error: string }; ms: number }
    | { type: 'answer'; text: string };

export interface AgentOptions {
    /** Max model calls per user message. Default 12. */
    maxSteps?: number;
    onEvent?: (event: AgentEvent) => void;
    system?: string;
}

export interface AgentReply {
    text: string;
    steps: number;
    toolCalls: { name: string; args: Record<string, unknown>; result: { output: unknown } | { error: string } }[];
}

export class Agent {
    readonly history: Content[] = [];
    private readonly maxSteps: number;

    constructor(
        private readonly model: ChatModel,
        private readonly ctx: ToolContext,
        private readonly options: AgentOptions = {},
    ) {
        this.maxSteps = options.maxSteps ?? 12;
    }

    async send(message: string): Promise<AgentReply> {
        this.history.push({ role: 'user', parts: [{ text: message }] });
        const toolCalls: AgentReply['toolCalls'] = [];
        const tools = Object.values(TOOLS).map((t) => t.declaration);

        for (let step = 1; step <= this.maxSteps; step++) {
            const turn = await this.model.generate(this.history, { system: this.options.system ?? SYSTEM_PROMPT, tools });
            this.history.push(turn.content);
            if (turn.functionCalls.length === 0) {
                const text = turn.text || '(no answer)';
                this.options.onEvent?.({ type: 'answer', text });
                return { text, steps: step, toolCalls };
            }

            const parts: Part[] = [];
            for (const call of turn.functionCalls) {
                const name = call.name ?? '';
                const args = call.args ?? {};
                this.options.onEvent?.({ type: 'tool_call', name, args });
                const started = Date.now();
                const result = await runTool(name, args, this.ctx);
                this.options.onEvent?.({ type: 'tool_result', name, result, ms: Date.now() - started });
                toolCalls.push({ name, args, result });
                parts.push({ functionResponse: { ...(call.id ? { id: call.id } : {}), name, response: result } });
            }
            this.history.push({ role: 'user', parts });
        }

        const text = `Stopped after ${this.maxSteps} steps without a final answer.`;
        this.options.onEvent?.({ type: 'answer', text });
        return { text, steps: this.maxSteps, toolCalls };
    }
}
