// A mock DEX with deterministic pools, for the demo. Nothing here touches a
// chain: swaps return a mock fill id, labelled as such.
//
// The demo's story lives in the pool data: MON/USDC-A quotes the best price
// and a low slippage estimate, but its thin liquidity slips 3.2% when a swap
// actually executes. Only an agent that remembers that failure picks pool B
// next time.

import { randomUUID } from 'node:crypto';

export interface Pool {
    id: string;
    base: string;
    quote: string;
    /** Quote tokens per base token. */
    rate: number;
    /** Slippage the pool advertises in quotes, in %. */
    quotedSlippagePct: number;
    /** Slippage a swap actually gets, in %. */
    executionSlippagePct: number;
}

export const DEMO_POOLS: Pool[] = [
    { id: 'MON/USDC-A', base: 'MON', quote: 'USDC', rate: 3.12, quotedSlippagePct: 0.3, executionSlippagePct: 3.2 },
    { id: 'MON/USDC-B', base: 'MON', quote: 'USDC', rate: 3.08, quotedSlippagePct: 0.4, executionSlippagePct: 0.4 },
    { id: 'MON/SCAM-X', base: 'MON', quote: 'SCAM', rate: 1250, quotedSlippagePct: 0.2, executionSlippagePct: 0.2 },
];

export interface Quote {
    pool: string;
    amountIn: number;
    tokenIn: string;
    tokenOut: string;
    expectedOut: number;
    estimatedSlippagePct: number;
}

export type SwapResult =
    | { status: 'filled'; pool: string; tokenIn: string; tokenOut: string; amountIn: number; amountOut: number; slippagePct: number; mockFillId: string; note: string }
    | { status: 'failed'; pool: string; reason: string; slippagePct: number };

const round = (n: number, digits = 4) => Number(n.toFixed(digits));

export class MockDex {
    constructor(readonly pools: Pool[] = DEMO_POOLS) {}

    private direction(pool: Pool, tokenIn: string, tokenOut: string): number | null {
        if (pool.base === tokenIn && pool.quote === tokenOut) return pool.rate;
        if (pool.quote === tokenIn && pool.base === tokenOut) return 1 / pool.rate;
        return null;
    }

    /** Quotes from every pool that trades the pair, best expected output first. */
    quote(tokenIn: string, tokenOut: string, amount: number): Quote[] {
        const a = tokenIn.trim().toUpperCase();
        const b = tokenOut.trim().toUpperCase();
        assertAmount(amount);
        const quotes: Quote[] = [];
        for (const pool of this.pools) {
            const rate = this.direction(pool, a, b);
            if (rate === null) continue;
            quotes.push({ pool: pool.id, amountIn: amount, tokenIn: a, tokenOut: b, expectedOut: round(amount * rate), estimatedSlippagePct: pool.quotedSlippagePct });
        }
        return quotes.sort((x, y) => y.expectedOut - x.expectedOut);
    }

    /** Swap on one pool. Fails when the execution slippage exceeds maxSlippagePct. */
    swap(poolId: string, tokenIn: string, tokenOut: string, amount: number, maxSlippagePct: number): SwapResult {
        const pool = this.pools.find((p) => p.id.toLowerCase() === poolId.trim().toLowerCase());
        if (!pool) throw new Error(`Unknown pool ${poolId}. Pools: ${this.pools.map((p) => p.id).join(', ')}`);
        const a = tokenIn.trim().toUpperCase();
        const b = tokenOut.trim().toUpperCase();
        assertAmount(amount);
        if (!Number.isFinite(maxSlippagePct) || maxSlippagePct < 0) throw new Error('max_slippage_pct must be a number >= 0');
        const rate = this.direction(pool, a, b);
        if (rate === null) throw new Error(`Pool ${pool.id} does not trade ${a} to ${b}`);

        const slippage = pool.executionSlippagePct;
        if (slippage > maxSlippagePct) {
            return { status: 'failed', pool: pool.id, slippagePct: slippage, reason: `Execution slippage ${slippage}% exceeded the max of ${maxSlippagePct}%; the swap was reverted.` };
        }
        return {
            status: 'filled',
            pool: pool.id,
            tokenIn: a,
            tokenOut: b,
            amountIn: amount,
            amountOut: round(amount * rate * (1 - slippage / 100)),
            slippagePct: slippage,
            mockFillId: `mock-${randomUUID().slice(0, 8)}`,
            note: 'Mock DEX: no on-chain swap was made.',
        };
    }
}

function assertAmount(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be a positive number');
}
