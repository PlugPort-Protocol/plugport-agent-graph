/** An error response from PlugPort's HTTP API (or a transport failure). */
export class PlugPortError extends Error {
    constructor(
        /** HTTP status, or 0 for a network/timeout failure. */
        readonly status: number,
        /** PlugPort's error code (e.g. 11000 for a duplicate key), when it sent one. */
        readonly code: number | undefined,
        message: string,
    ) {
        super(message);
        this.name = 'PlugPortError';
    }

    get isDuplicateKey(): boolean {
        return this.code === 11000 || this.status === 409;
    }
}

export type GraphErrorCode = 'INVALID_INPUT' | 'NODE_NOT_FOUND' | 'NOT_A_MEMORY';

/** A caller mistake detected by the graph layer before reaching PlugPort. */
export class GraphError extends Error {
    constructor(readonly code: GraphErrorCode, message: string) {
        super(message);
        this.name = 'GraphError';
    }
}
