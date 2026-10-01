import { MEMORY_LABEL } from '@pag/core';
import { config, openGraph, errorResponse } from '@/lib/server';

export const dynamic = 'force-dynamic';

const MARK = ' [edited after anchoring]';

/**
 * Demo only (VIEWER_ALLOW_TAMPER=true): edit a memory's text directly in
 * PlugPort, bypassing the agent, so verify can be shown failing; or put the
 * original text back. The original is kept in `_tamperedFrom`, which is not
 * part of the memory's hash.
 */
export async function POST(request: Request) {
    try {
        if (!config().tamperEnabled) return Response.json({ error: 'Tampering is disabled (set VIEWER_ALLOW_TAMPER=true).' }, { status: 403 });
        const { graph: name, id, restore } = (await request.json()) as { graph?: string; id?: string; restore?: boolean };
        const { client, graph } = openGraph(name || config().defaultGraph);
        const node = await graph.getNode(String(id ?? ''));
        if (!node || node.label !== MEMORY_LABEL) return Response.json({ error: `No memory ${id}` }, { status: 404 });
        const original = (node as { _tamperedFrom?: string })._tamperedFrom;

        if (restore) {
            if (original === undefined) return Response.json({ ok: true, text: node.text });
            await client.updateOne(graph.nodesCollection, { _id: node._id }, { $set: { text: original }, $unset: { _tamperedFrom: '' } });
            return Response.json({ ok: true, text: original });
        }
        if (original !== undefined) return Response.json({ ok: true, text: node.text });
        const text = `${node.text ?? ''}${MARK}`;
        await client.updateOne(graph.nodesCollection, { _id: node._id }, { $set: { text, _tamperedFrom: node.text ?? '' } });
        return Response.json({ ok: true, text });
    } catch (err) {
        return errorResponse(err);
    }
}
