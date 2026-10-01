import { openGraph, graphParam, errorResponse } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Run recall and return the ids to highlight: ranked memories and the context subgraph. */
export async function GET(request: Request) {
    try {
        const params = new URL(request.url).searchParams;
        const { memory } = openGraph(graphParam(request));
        const query = params.get('q')?.trim();
        const entity = params.get('entity')?.trim();
        const hops = Number(params.get('hops') ?? 1);
        const result = await memory.recall({
            ...(query ? { query } : {}),
            ...(entity ? { entity } : {}),
            hops: Number.isFinite(hops) ? hops : 1,
            limit: 20,
        });
        return Response.json({
            memories: result.memories.map((m) => ({ id: m.memory._id, text: m.memory.text, score: Number(m.score.toFixed(3)), distance: m.distance })),
            nodeIds: result.context.nodes.map((n) => n._id),
            edgeIds: result.context.edges.map((e) => e._id),
        });
    } catch (err) {
        return errorResponse(err);
    }
}
