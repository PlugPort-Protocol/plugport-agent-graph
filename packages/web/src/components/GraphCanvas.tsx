'use client';

// Force-directed view of the memory graph. Memories are small squares,
// entities are circles colored by label; recall results are highlighted and
// everything else is dimmed.

import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d';
import type { GraphEdge, GraphNode } from '@pag/core';
import { labelColor } from './colors';

// Uses canvas and window: load this module with next/dynamic and ssr: false.

type VNode = { id: string; label: string; title: string; anchored: boolean };
type VLink = { id: string; source: string; target: string; type: string };

export interface GraphCanvasProps {
    nodes: Omit<GraphNode, 'keywords'>[];
    edges: GraphEdge[];
    selectedId: string | null;
    /** When set, only these nodes and edges are drawn at full strength. */
    highlight: { nodes: Set<string>; edges: Set<string> } | null;
    onSelect: (id: string | null) => void;
}

export function GraphCanvas({ nodes, edges, selectedId, highlight, onSelect }: GraphCanvasProps) {
    const box = useRef<HTMLDivElement>(null);
    const fg = useRef<ForceGraphMethods<NodeObject<VNode>, LinkObject<VNode, VLink>> | undefined>(undefined);
    const [size, setSize] = useState({ width: 800, height: 600 });

    useEffect(() => {
        const el = box.current;
        if (!el) return;
        const observer = new ResizeObserver(([entry]) => {
            if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // The library mutates link endpoints into node objects, so build fresh data per graph.
    const data = useMemo(() => ({
        nodes: nodes.map((n): VNode => ({
            id: n._id,
            label: n.label,
            title: n.label === 'Memory' ? (n.text ?? '') : (n.name ?? n._id),
            anchored: Boolean(n.anchorId),
        })),
        links: edges.map((e): VLink => ({ id: e._id, source: e.from, target: e.to, type: e.type })),
    }), [nodes, edges]);

    // Fit once per graph after the layout settles (timer as a fallback), centered,
    // without blowing a small graph up to giant nodes.
    const fitted = useRef(false);
    const fit = () => {
        const g = fg.current;
        if (!g || fitted.current) return;
        fitted.current = true;
        g.zoomToFit(0, 80);
        g.zoom(Math.min(g.zoom(), 4), 0);
        const pts = (data.nodes as NodeObject<VNode>[]).filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
        if (pts.length) {
            const xs = pts.map((n) => n.x!);
            const ys = pts.map((n) => n.y!);
            g.centerAt((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, 0);
        }
    };
    useEffect(() => {
        // Spread small graphs out a bit more than the defaults.
        fg.current?.d3Force('charge')?.strength(-160);
        fg.current?.d3Force('link')?.distance(45);
        fitted.current = false;
        const t = setTimeout(fit, 2500);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    const dimNode = (id: string) => highlight !== null && !highlight.nodes.has(id);
    const dimLink = (id: string) => highlight !== null && !highlight.edges.has(id);

    return (
        <div ref={box} className="canvas">
            <ForceGraph2D<VNode, VLink>
                ref={fg}
                width={size.width}
                height={size.height}
                graphData={data}
                backgroundColor="#0b0d12"
                cooldownTicks={120}
                onEngineStop={fit}
                nodeRelSize={5}
                nodeLabel={(n) => `${n.label}: ${n.title}`}
                linkLabel={(l) => l.type}
                linkColor={(l) => (dimLink(l.id) ? 'rgba(120,128,150,0.08)' : l.type === 'MENTIONS' ? 'rgba(139,124,246,0.35)' : 'rgba(230,232,238,0.55)')}
                linkWidth={(l) => (l.type === 'MENTIONS' ? 1 : 1.6)}
                linkDirectionalArrowLength={(l) => (l.type === 'MENTIONS' ? 0 : 4)}
                linkDirectionalArrowRelPos={0.9}
                onNodeClick={(n) => onSelect(String(n.id))}
                onBackgroundClick={() => onSelect(null)}
                nodeCanvasObject={(n, ctx, scale) => {
                    const x = n.x ?? 0;
                    const y = n.y ?? 0;
                    const dim = dimNode(n.id);
                    const color = labelColor(n.label);
                    ctx.globalAlpha = dim ? 0.15 : 1;
                    if (n.label === 'Memory') {
                        const s = 7;
                        ctx.fillStyle = color;
                        ctx.fillRect(x - s / 2, y - s / 2, s, s);
                        if (n.anchored) {
                            ctx.strokeStyle = '#34d399';
                            ctx.lineWidth = 1.2;
                            ctx.strokeRect(x - s / 2 - 1.5, y - s / 2 - 1.5, s + 3, s + 3);
                        }
                    } else {
                        ctx.beginPath();
                        ctx.arc(x, y, 6, 0, 2 * Math.PI);
                        ctx.fillStyle = color;
                        ctx.fill();
                        const fontSize = Math.max(10 / scale, 2.5);
                        ctx.font = `${fontSize}px system-ui, sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'top';
                        ctx.fillStyle = '#e6e8ee';
                        ctx.fillText(n.title.length > 24 ? `${n.title.slice(0, 23)}…` : n.title, x, y + 8);
                    }
                    if (n.id === selectedId) {
                        ctx.beginPath();
                        ctx.arc(x, y, 11, 0, 2 * Math.PI);
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                    }
                    ctx.globalAlpha = 1;
                }}
                nodePointerAreaPaint={(n, color, ctx) => {
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(n.x ?? 0, n.y ?? 0, 8, 0, 2 * Math.PI);
                    ctx.fill();
                }}
            />
        </div>
    );
}
