import { PlugPortClient, graphsFromCollections } from '@pag/core';
import { config, errorResponse } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const c = config();
        const client = new PlugPortClient({ url: c.url, apiKey: c.apiKey });
        const graphs = graphsFromCollections(await client.listCollections());
        return Response.json({
            graphs,
            defaultGraph: c.defaultGraph,
            anchoring: Boolean(c.rpcUrl && c.contract),
            contract: c.contract || null,
            tamperEnabled: c.tamperEnabled,
        });
    } catch (err) {
        return errorResponse(err);
    }
}
