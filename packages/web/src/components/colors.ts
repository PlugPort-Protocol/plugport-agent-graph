const PALETTE = ['#34d399', '#f87171', '#a3e635', '#fb923c', '#e879f9', '#2dd4bf'];
export const MEMORY_COLOR = '#8b7cf6';

/** Stable color per node label; memories are always violet. */
const FIXED: Record<string, string> = { User: '#fbbf24', Token: '#60a5fa', Pool: '#f472b6', Protocol: '#22d3ee' };

export function labelColor(label: string): string {
    if (label === 'Memory') return MEMORY_COLOR;
    if (FIXED[label]) return FIXED[label];
    let h = 0;
    for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTE[h % PALETTE.length]!;
}
