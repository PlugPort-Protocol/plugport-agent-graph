// In-memory stand-in for PlugPort's collections API, reproducing the PlugPort
// query semantics the graph layer depends on (from PlugPort's
// storage/query-planner.ts and storage/document-store.ts):
// - filters compare whole field values ($in on an array field never matches
//   one of its elements)
// - unique _id: a duplicate fails with code 11000 and the whole batch is
//   rejected (nothing in it is stored)
// - find() defaults to 1000 results, max 5000
// - $regex patterns over 500 chars match nothing; $in over 2000 values throws

import { PlugPortError } from '../src/errors.js';
import type { DocStore, Filter, FindOptions, Update, UpdateResult } from '../src/types.js';

type Doc = Record<string, unknown> & { _id: string };

export class FakeStore implements DocStore {
    readonly collections = new Map<string, Map<string, Doc>>();
    /** Write requests made (each one counts against PlugPort's write rate limit). */
    writes = 0;
    reads = 0;

    private coll(name: string): Map<string, Doc> {
        let c = this.collections.get(name);
        if (!c) this.collections.set(name, (c = new Map()));
        return c;
    }

    all(name: string): Doc[] {
        return [...this.coll(name).values()].map(clone);
    }

    /** Overwrite a stored document directly (to simulate tampering). */
    tamper(name: string, id: string, patch: Record<string, unknown>): void {
        const doc = this.coll(name).get(id);
        if (!doc) throw new Error(`no ${id} in ${name}`);
        Object.assign(doc, patch);
    }

    async insertMany(collection: string, documents: Record<string, unknown>[]): Promise<number> {
        this.writes++;
        const c = this.coll(collection);
        const docs = documents.map((d) => {
            const doc = clone(d) as Doc;
            if (!doc._id) doc._id = `oid_${Math.random().toString(16).slice(2)}`;
            return doc;
        });
        for (const doc of docs) {
            if (c.has(doc._id)) throw new PlugPortError(409, 11000, `Duplicate key error: _id "${doc._id}"`);
        }
        for (const doc of docs) c.set(doc._id, doc);
        return docs.length;
    }

    async find<T = Record<string, unknown>>(collection: string, filter: Filter, options: FindOptions = {}): Promise<T[]> {
        this.reads++;
        let docs = [...this.coll(collection).values()].filter((d) => matchesFilter(d, filter));
        if (options.sort) docs = applySorting(docs, options.sort);
        const limit = Math.min(options.limit && options.limit > 0 ? options.limit : 1000, 5000);
        docs = docs.slice(options.skip ?? 0).slice(0, limit);
        return docs.map(clone) as T[];
    }

    async updateOne(collection: string, filter: Filter, update: Update, options: { upsert?: boolean } = {}): Promise<UpdateResult> {
        this.writes++;
        const doc = [...this.coll(collection).values()].find((d) => matchesFilter(d, filter));
        if (!doc) {
            if (options.upsert) throw new Error('FakeStore: upsert not implemented');
            return { matchedCount: 0, modifiedCount: 0, upsertedId: null };
        }
        applyUpdate(doc, update);
        return { matchedCount: 1, modifiedCount: 1, upsertedId: null };
    }

    async updateMany(collection: string, filter: Filter, update: Update): Promise<UpdateResult> {
        this.writes++;
        const docs = [...this.coll(collection).values()].filter((d) => matchesFilter(d, filter));
        for (const d of docs) applyUpdate(d, update);
        return { matchedCount: docs.length, modifiedCount: docs.length, upsertedId: null };
    }

    async deleteMany(collection: string, filter: Filter): Promise<number> {
        this.writes++;
        const c = this.coll(collection);
        let n = 0;
        for (const [id, d] of c) if (matchesFilter(d, filter)) { c.delete(id); n++; }
        return n;
    }

    async count(collection: string, filter: Filter): Promise<number> {
        this.reads++;
        return [...this.coll(collection).values()].filter((d) => matchesFilter(d, filter)).length;
    }
}

function clone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v)) as T;
}

function applyUpdate(doc: Doc, update: Update): void {
    for (const [k, v] of Object.entries(update.$set ?? {})) doc[k] = clone(v);
    for (const [k, v] of Object.entries(update.$inc ?? {})) doc[k] = (typeof doc[k] === 'number' ? (doc[k] as number) : 0) + v;
    for (const k of Object.keys(update.$unset ?? {})) delete doc[k];
}

// ---- matcher (mirrors PlugPort's query-planner.ts) ----

function matchesFilter(doc: Record<string, unknown>, filter: Filter): boolean {
    for (const [field, condition] of Object.entries(filter ?? {})) {
        if (field === '$and') {
            if (Array.isArray(condition) && !condition.every((f) => matchesFilter(doc, f as Filter))) return false;
            continue;
        }
        if (field === '$or') {
            if (Array.isArray(condition) && condition.length > 0 && !condition.some((f) => matchesFilter(doc, f as Filter))) return false;
            continue;
        }
        const value = getNested(doc, field);
        if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
            if (!matchesOps(value, condition as Record<string, unknown>)) return false;
        } else if (!deepEquals(value, condition)) {
            return false;
        }
    }
    return true;
}

function matchesOps(value: unknown, ops: Record<string, unknown>): boolean {
    for (const [op, target] of Object.entries(ops)) {
        switch (op) {
            case '$eq': if (!deepEquals(value, target)) return false; break;
            case '$ne': if (deepEquals(value, target)) return false; break;
            case '$in':
                if (Array.isArray(target)) {
                    if (target.length > 2000) throw new Error('Query exceeds maximum $in array limit of 2000');
                    if (!target.some((t) => deepEquals(value, t))) return false;
                }
                break;
            case '$nin':
                if (Array.isArray(target) && target.some((t) => deepEquals(value, t))) return false;
                break;
            case '$exists': if (Boolean(target) !== (value !== undefined)) return false; break;
            case '$gt': if (value == null || !(Number(value) > Number(target))) return false; break;
            case '$gte': if (value == null || !(Number(value) >= Number(target))) return false; break;
            case '$lt': if (value == null || !(Number(value) < Number(target))) return false; break;
            case '$lte': if (value == null || !(Number(value) <= Number(target))) return false; break;
            case '$regex': {
                if (value === undefined || value === null || typeof target !== 'string' || target.length > 500) return false;
                let re: RegExp;
                try {
                    re = new RegExp(target, typeof ops.$options === 'string' ? ops.$options : undefined);
                } catch {
                    return false;
                }
                if (!re.test(String(value))) return false;
                break;
            }
        }
    }
    return true;
}

function getNested(doc: Record<string, unknown>, path: string): unknown {
    let cur: unknown = doc;
    for (const part of path.split('.')) {
        if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
        cur = (cur as Record<string, unknown>)[part];
    }
    return cur;
}

function deepEquals(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b) && typeof a === typeof b;
}

function applySorting(docs: Doc[], sort: Record<string, 1 | -1>): Doc[] {
    return [...docs].sort((a, b) => {
        for (const [field, dir] of Object.entries(sort)) {
            const av = getNested(a, field);
            const bv = getNested(b, field);
            let cmp = 0;
            if (av === bv) cmp = 0;
            else if (av == null) cmp = -1;
            else if (bv == null) cmp = 1;
            else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
            else cmp = String(av).localeCompare(String(bv));
            if (cmp !== 0) return cmp * dir;
        }
        return 0;
    });
}
