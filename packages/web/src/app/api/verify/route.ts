import { openGraph, graphParam, errorResponse } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Verify one memory against its anchor batch and the MemoryAnchor contract. */
export async function GET(request: Request) {
    try {
        const id = new URL(request.url).searchParams.get('id') ?? '';
        const { anchor, memory } = openGraph(graphParam(request));
        if (!anchor) {
            const hash = await memory.verifyHash(id);
            if (!hash) return Response.json({ error: `No memory ${id}` }, { status: 404 });
            return Response.json({ ...hash, anchored: false, verified: false, problem: 'anchoring is not configured for this viewer' });
        }
        const result = await anchor.verify(id);
        if (!result) return Response.json({ error: `No memory ${id}` }, { status: 404 });
        return Response.json(result);
    } catch (err) {
        return errorResponse(err);
    }
}
