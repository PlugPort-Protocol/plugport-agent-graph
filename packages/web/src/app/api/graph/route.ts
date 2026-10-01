import { openGraph, graphParam, errorResponse } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** The graph's nodes (newest 300) and edges between them, plus its anchor batches. */
export async function GET(request: Request) {
    try {
        const { graph, anchor } = openGraph(graphParam(request));
        const [snapshot, anchors] = await Promise.all([graph.snapshot(300), anchor ? anchor.listAnchors(50) : graph.listAnchors(50)]);
        return Response.json({
            nodes: snapshot.nodes.map(({ keywords: _keywords, ...n }) => n),
            edges: snapshot.edges,
            anchors: anchors.map(({ hashes: _hashes, ...a }) => a),
        });
    } catch (err) {
        return errorResponse(err);
    }
}
