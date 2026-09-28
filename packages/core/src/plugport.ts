// Minimal client for PlugPort's HTTP collections API
// (POST {url}/api/v1/collections/:name/<op>, wallet API key in x-api-key).
// Mirrors @plugport/sdk, which can't be installed outside the PlugPort repo.

import { PlugPortError } from './errors.js';
import type { DocStore, Filter, FindOptions, Update, UpdateResult } from './types.js';

export interface PlugPortClientOptions {
    /** Base URL of the PlugPort HTTP API, e.g. http://localhost:8080 */
    url: string;
    /** Wallet API key from the PlugPort dashboard. */
    apiKey?: string;
    /** Per-request timeout. Default 30s. */
    timeoutMs?: number;
    /** Retries on 429 (rate limit), retryable 503 and timeouts. Default 3. */
    retries?: number;
    /** First retry delay; doubles each attempt. Default 1000ms. */
    retryDelayMs?: number;
    /** Injectable for tests. */
    fetch?: typeof fetch;
}

export interface CollectionInfo {
    name: string;
    documentCount?: number;
    createdAt?: number;
    ownerAddress?: string;
    mode?: string;
}

export class PlugPortClient implements DocStore {
    private readonly url: string;
    private readonly fetchImpl: typeof fetch;

    constructor(private readonly options: PlugPortClientOptions) {
        if (!options.url) throw new Error('PlugPortClient: url is required');
        this.url = options.url.replace(/\/+$/, '');
        this.fetchImpl = options.fetch ?? globalThis.fetch;
    }

    async insertMany(collection: string, documents: Record<string, unknown>[]): Promise<number> {
        if (documents.length === 0) return 0;
        const res = await this.op<{ insertedCount: number }>(collection, 'insertMany', { documents });
        return res.insertedCount;
    }

    async find<T = Record<string, unknown>>(collection: string, filter: Filter, options: FindOptions = {}): Promise<T[]> {
        const res = await this.op<{ cursor: { firstBatch: T[] } }>(collection, 'find', { filter, ...options });
        return res.cursor.firstBatch;
    }

    async updateOne(collection: string, filter: Filter, update: Update, options: { upsert?: boolean } = {}): Promise<UpdateResult> {
        const res = await this.op<UpdateResult>(collection, 'updateOne', { filter, update, ...options });
        return { matchedCount: res.matchedCount, modifiedCount: res.modifiedCount, upsertedId: res.upsertedId ?? null };
    }

    async updateMany(collection: string, filter: Filter, update: Update): Promise<UpdateResult> {
        const res = await this.op<UpdateResult>(collection, 'updateMany', { filter, update });
        return { matchedCount: res.matchedCount, modifiedCount: res.modifiedCount, upsertedId: res.upsertedId ?? null };
    }

    async deleteMany(collection: string, filter: Filter): Promise<number> {
        const res = await this.op<{ deletedCount: number }>(collection, 'deleteMany', { filter });
        return res.deletedCount;
    }

    async count(collection: string, filter: Filter): Promise<number> {
        const res = await this.op<{ count: number }>(collection, 'count', { filter });
        return res.count;
    }

    private op<T>(collection: string, op: string, body: unknown): Promise<T> {
        return this.request<T>(`/api/v1/collections/${encodeURIComponent(collection)}/${op}`, body);
    }

    /** Collections the caller can see: its own, plus others' public or shared ones (dotted names). */
    async listCollections(): Promise<CollectionInfo[]> {
        return (await this.request<{ collections?: CollectionInfo[] }>('/api/v1/collections')).collections ?? [];
    }

    /** POST with a JSON body, or GET when body is undefined. */
    private async request<T>(path: string, body?: unknown): Promise<T> {
        const retries = this.options.retries ?? 3;
        const baseDelay = this.options.retryDelayMs ?? 1000;
        const timeoutMs = this.options.timeoutMs ?? 30_000;
        const headers: Record<string, string> = body === undefined ? {} : { 'content-type': 'application/json' };
        if (this.options.apiKey) headers['x-api-key'] = this.options.apiKey;

        for (let attempt = 0; ; attempt++) {
            const canRetry = attempt < retries;
            const delay = baseDelay * 2 ** attempt;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            let response: Response;
            try {
                response = await this.fetchImpl(`${this.url}${path}`, {
                    method: body === undefined ? 'GET' : 'POST',
                    headers,
                    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                    signal: controller.signal,
                });
            } catch (err) {
                clearTimeout(timer);
                const timedOut = (err as Error)?.name === 'AbortError';
                if (timedOut && canRetry) {
                    await sleep(delay);
                    continue;
                }
                throw new PlugPortError(0, undefined, timedOut
                    ? `PlugPort request timed out after ${timeoutMs}ms`
                    : `PlugPort unreachable at ${this.url}: ${(err as Error)?.message ?? err}`);
            }
            clearTimeout(timer);

            const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
            if (response.ok && payload && payload.ok !== 0) return payload as T;

            const retryable = response.status === 429 || (response.status === 503 && payload?.retryable === true);
            if (retryable && canRetry) {
                await sleep(delay);
                continue;
            }
            const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
            const message = text(payload?.errmsg) ?? text(payload?.error) ?? text(payload?.message)
                ?? `PlugPort returned HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
            throw new PlugPortError(response.status, typeof payload?.code === 'number' ? payload.code : undefined, message);
        }
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
