// Content hashing for memories. A memory's hash covers everything that makes
// up the memory (id, label, text, props, creation time), serialized as JSON
// with sorted keys so the same content always hashes the same.

import { keccak256, toUtf8Bytes } from 'ethers';
import type { GraphNode } from './types.js';

/** JSON with object keys sorted recursively; arrays keep their order. */
export function canonicalJson(value: unknown): string {
    return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            const v = (value as Record<string, unknown>)[key];
            if (v !== undefined) out[key] = sortKeys(v);
        }
        return out;
    }
    return value;
}

export type HashedFields = Pick<GraphNode, '_id' | 'label' | 'props' | 'createdAt'> & { text?: string };

export function hashMemory(node: HashedFields): string {
    return keccak256(toUtf8Bytes(canonicalJson({
        id: node._id,
        label: node.label,
        text: node.text ?? '',
        props: node.props ?? {},
        createdAt: node.createdAt,
    })));
}

/** True when the stored hash still matches the stored content. */
export function memoryHashValid(node: GraphNode): boolean {
    return typeof node.hash === 'string' && node.hash === hashMemory(node);
}
