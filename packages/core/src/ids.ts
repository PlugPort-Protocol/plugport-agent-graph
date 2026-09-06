// Identifiers. Node ids are restricted to [a-z0-9_-] so they are safe inside
// PlugPort's storage keys (`doc:<collection>:<id>`) and index keys, which use
// ':' as a separator.

import { randomUUID } from 'node:crypto';
import { keccak256, toUtf8Bytes } from 'ethers';
import { GraphError } from './errors.js';

const NODE_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/;
const EDGE_TYPE = /^[A-Z][A-Z0-9_]{0,63}$/;
const LABEL = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const GRAPH_NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;
const WALLET = /^0x[0-9a-f]{40}$/;

/** Lowercase, collapse anything outside [a-z0-9] to '-', trim, cap length. */
export function slug(value: string, max = 60): string {
    return value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, max)
        .replace(/-+$/g, '');
}

/** Stable id for an entity, so the same (label, name) always maps to the same node. */
export function entityId(label: string, name: string): string {
    const l = slug(label, 32);
    const n = slug(name, 90);
    if (!l || !n) {
        throw new GraphError('INVALID_INPUT', `Cannot derive an id from label "${label}" and name "${name}"`);
    }
    return `${l}_${n}`;
}

export function memoryId(): string {
    return `mem_${randomUUID().replace(/-/g, '')}`;
}

/** Deterministic edge id, so writing the same (from, type, to) twice is idempotent. */
export function edgeId(from: string, type: string, to: string): string {
    return `e_${keccak256(toUtf8Bytes(`${from}\n${type}\n${to}`)).slice(2, 34)}`;
}

export function assertNodeId(id: unknown): asserts id is string {
    if (typeof id !== 'string' || !NODE_ID.test(id)) {
        throw new GraphError('INVALID_INPUT', `Invalid node id ${JSON.stringify(id)}: use 1-128 chars of [a-z0-9_-], starting with a letter or digit`);
    }
}

export function assertLabel(label: unknown): asserts label is string {
    if (typeof label !== 'string' || !LABEL.test(label)) {
        throw new GraphError('INVALID_INPUT', `Invalid label ${JSON.stringify(label)}: use 1-64 chars of [A-Za-z0-9_], starting with a letter`);
    }
}

/** "works on" / "works-on" / "WORKS_ON" -> "WORKS_ON". */
export function normalizeEdgeType(type: unknown): string {
    if (typeof type !== 'string') {
        throw new GraphError('INVALID_INPUT', `Invalid relation type ${JSON.stringify(type)}`);
    }
    const t = type.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!EDGE_TYPE.test(t)) {
        throw new GraphError('INVALID_INPUT', `Invalid relation type ${JSON.stringify(type)}: it must start with a letter`);
    }
    return t;
}

export function assertGraphName(graph: unknown): asserts graph is string {
    if (typeof graph !== 'string' || !GRAPH_NAME.test(graph)) {
        throw new GraphError('INVALID_INPUT', `Invalid graph name ${JSON.stringify(graph)}: use 1-32 chars of [a-z0-9-]`);
    }
}

export function normalizeWallet(address: string): string {
    const a = address.toLowerCase();
    if (!WALLET.test(a)) throw new GraphError('INVALID_INPUT', `Invalid wallet address ${JSON.stringify(address)}`);
    return a;
}
