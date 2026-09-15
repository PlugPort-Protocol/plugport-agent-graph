// The language model behind the agent. GeminiModel calls Gemma 4 (or any
// model id) through Google AI Studio's Gemini API; tests use a scripted model.

import { ApiError, GoogleGenAI, type Content, type FunctionCall, type FunctionDeclaration } from '@google/genai';

export interface ModelTurn {
    /** The model's message, appended to the history unchanged (it carries thought signatures). */
    content: Content;
    functionCalls: FunctionCall[];
    /** The visible answer text (thought parts excluded). */
    text: string;
}

export interface ChatModel {
    readonly name: string;
    generate(history: Content[], options: { system: string; tools: FunctionDeclaration[] }): Promise<ModelTurn>;
}

export interface GeminiModelOptions {
    apiKey: string;
    /** Default gemma-4-31b-it. */
    model?: string;
    /** Retries on 429 / 5xx. Default 6. */
    retries?: number;
    retryDelayMs?: number;
}

export const DEFAULT_MODEL = 'gemma-4-31b-it';

export class GeminiModel implements ChatModel {
    readonly name: string;
    private readonly ai: GoogleGenAI;
    private readonly retries: number;
    private readonly retryDelayMs: number;

    constructor(options: GeminiModelOptions) {
        this.ai = new GoogleGenAI({ apiKey: options.apiKey });
        this.name = options.model || DEFAULT_MODEL;
        this.retries = options.retries ?? 6;
        this.retryDelayMs = options.retryDelayMs ?? 2000;
    }

    async generate(history: Content[], { system, tools }: { system: string; tools: FunctionDeclaration[] }): Promise<ModelTurn> {
        for (let attempt = 0; ; attempt++) {
            try {
                const response = await this.ai.models.generateContent({
                    model: this.name,
                    contents: history,
                    config: {
                        systemInstruction: system,
                        tools: [{ functionDeclarations: tools }],
                        temperature: 0.2,
                    },
                });
                const content: Content = response.candidates?.[0]?.content ?? { role: 'model', parts: [] };
                return { content: { ...content, role: 'model' }, ...readTurn(content) };
            } catch (err) {
                const status = err instanceof ApiError ? err.status : 0;
                const retryable = status === 429 || status >= 500 || status === 0;
                if (!retryable || attempt >= this.retries) throw err;
                await new Promise((r) => setTimeout(r, retryDelay(err, this.retryDelayMs * 2 ** attempt)));
            }
        }
    }
}

/** Function calls and visible text of a model message. */
export function readTurn(content: Content): { functionCalls: FunctionCall[]; text: string } {
    const parts = content.parts ?? [];
    return {
        functionCalls: parts.flatMap((p) => (p.functionCall ? [p.functionCall] : [])),
        text: parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('').trim(),
    };
}

const MAX_WAIT_MS = 65_000;

/**
 * How long to wait before retrying: the delay Google asks for in a 429
 * (RetryInfo "retryDelay": "37s", per-minute quotas) plus a second, else the
 * fallback; never more than 65s.
 */
export function retryDelay(err: unknown, fallbackMs: number): number {
    const match = /retryDelay\\?"?\s*:\s*\\?"(\d+(?:\.\d+)?)s/.exec(err instanceof Error ? err.message : String(err));
    const ms = match ? Number(match[1]) * 1000 + 1000 : fallbackMs;
    return Math.min(ms, MAX_WAIT_MS);
}
