// Compact, human-readable text serialisation for MCP tool results.
// MCP hosts display tool output as plain text in the conversation context, so
// we produce a short summary line followed by structured JSON for programmatic
// use by the host model.

import type { AnchorRecord, GraphEdge, GraphNode, VerifyResult } from '@pag/core';

/** Shorten a hex string for display: 0x1234…abcd */
export function shortHex(s: string | null | undefined, n = 8): string {
    if (!s) return '—';
    return s.length > 2 * n + 3 ? `${s.slice(0, n + 2)}…${s.slice(-n)}` : s;
}

/** ISO timestamp → readable relative string */
export function relativeTime(ms: number | null | undefined): string {
    if (!ms) return '—';
    const diff = Date.now() - ms;
    const mins = Math.round(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
}

/** Format a list of memories as a numbered plain-text block */
export function formatMemories(
    memories: Array<{ memory: GraphNode; score: number; distance: number }>,
): string {
    if (memories.length === 0) return '(no memories found)';
    return memories
        .map((m, i) => {
            const tags = (m.memory.props?.tags as string[] | undefined)?.join(', ');
            const anchor = m.memory.anchorId ? ` [anchored: ${shortHex(m.memory.anchorId)}]` : '';
            return `${i + 1}. ${m.memory.text}${anchor}${tags ? `  [${tags}]` : ''}  (score ${m.score.toFixed(2)}, hop ${m.distance})`;
        })
        .join('\n');
}

/** Format a context subgraph summary */
export function formatContext(nodes: GraphNode[], edges: GraphEdge[], truncated: boolean): string {
    const entities = nodes.filter((n) => n.label !== 'Memory');
    const parts: string[] = [`${nodes.length} nodes (${entities.length} entities), ${edges.length} edges`];
    if (truncated) parts.push('⚠ context graph truncated at 300 nodes');
    if (edges.length > 0) {
        const sample = edges.slice(0, 5).map((e) => `${e.from.slice(0, 8)} -[${e.type}]→ ${e.to.slice(0, 8)}`);
        parts.push('edges: ' + sample.join(', ') + (edges.length > 5 ? ` … +${edges.length - 5} more` : ''));
    }
    return parts.join('\n');
}

/** Format a relation list from a recalled traversal */
export function formatRelations(edges: GraphEdge[]): string[] {
    return edges.map((e) => `${e.from} ${e.type} ${e.to}`);
}

/** Format an anchor record for display */
export function formatAnchor(a: Omit<AnchorRecord, 'hashes'>): string {
    return [
        `Root: ${shortHex(a._id, 10)}`,
        `Memories: ${a.count}`,
        `Anchored: ${relativeTime(a.anchoredAt)} by ${shortHex(a.anchoredBy)}`,
        a.txHash ? `Tx: ${shortHex(a.txHash, 10)}` : 'Tx: recovered (no hash)',
    ].join('  ·  ');
}

/** Format a verify result */
export function formatVerify(v: VerifyResult): string {
    const tick = (b: boolean) => (b ? '✓' : '✗');
    const lines = [
        v.verified ? '✓ Verified: memory is unchanged since it was anchored on Monad.' : `✗ Not verified: ${v.problem ?? 'unknown problem'}`,
        `  ${tick(v.hashValid)} stored hash matches content`,
        `  ${tick(v.anchored)} belongs to an anchor batch`,
        `  ${tick(v.proofValid)} Merkle proof valid (${v.proof.length}-step)`,
        `  ${tick(v.onChain)} root recorded on Monad`,
    ];
    if (v.explorerUrl) lines.push(`  tx: ${v.explorerUrl}`);
    return lines.join('\n');
}
