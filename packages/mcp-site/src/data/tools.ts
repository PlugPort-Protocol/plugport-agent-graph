// Tool metadata for the MCP playground and reference UI

export interface ToolParam {
    name: string;
    type: string;
    required: boolean;
    description: string;
    default?: string;
}

export interface MCPTool {
    name: string;
    description: string;
    badge?: 'anchoring' | 'graph';
    requiresAnchor?: boolean;
    params: ToolParam[];
    exampleArgs: Record<string, unknown>;
    exampleResponse: string;
}

export const TOOLS: MCPTool[] = [
    {
        name: 'remember',
        description: 'Store a new memory with optional entities and relations. Returns the memory id and content hash.',
        params: [
            { name: 'text', type: 'string', required: true, description: 'The fact or event to remember (plain text, max 4000 chars).' },
            { name: 'entities', type: 'array', required: false, description: 'Entities mentioned: [{label, name}]. E.g. [{label:"Token",name:"USDC"}].' },
            { name: 'relations', type: 'array', required: false, description: 'Directed relationships: [{from, type, to}]. E.g. [{from:"Agent",type:"AVOIDS",to:"SCAM"}].' },
            { name: 'tags', type: 'array', required: false, description: 'Free-form tags, e.g. ["failure","preference"].' },
        ],
        exampleArgs: {
            text: 'The MON/USDC-A pool slipped 3.2% on our last trade. Avoid it for large orders.',
            entities: [{ label: 'Pool', name: 'MON/USDC-A' }],
            tags: ['failure', 'slippage'],
        },
        exampleResponse: `Remembered: "The MON/USDC-A pool slipped 3.2% on our last trade. Avoid it…" (id: mem_a1b2c3d4)

\`\`\`json
{
  "id": "mem_a1b2c3d4",
  "hash": "0xabc123...",
  "entities": [{"id":"pool_mon_usdc_a","label":"Pool","name":"MON/USDC-A"}],
  "edges": []
}
\`\`\``,
    },
    {
        name: 'recall',
        description: 'Search long-term memory by keywords and/or entity name. Returns ranked memories and a BFS context subgraph.',
        params: [
            { name: 'query', type: 'string', required: false, description: 'Keywords to search for (space-separated).' },
            { name: 'entity', type: 'string', required: false, description: 'Entity name to anchor the search on (e.g. "USDC", "me").' },
            { name: 'hops', type: 'integer', required: false, description: 'Graph hops to expand around matched nodes (0–3, default 1).', default: '1' },
            { name: 'limit', type: 'integer', required: false, description: 'Max memories to return (1–50, default 10).', default: '10' },
        ],
        exampleArgs: {
            query: 'slippage pool',
            hops: 1,
            limit: 5,
        },
        exampleResponse: `Recalled 1 memory:
• mem_a1b2c3d4 [score 2.00] "The MON/USDC-A pool slipped 3.2% on our last trade…"

Context graph:
  mem_a1b2c3d4 -[MENTIONS]→ pool_mon_usdc_a

\`\`\`json
{
  "memories": [{"id":"mem_a1b2c3d4","text":"The MON/USDC-A pool…","score":2,"distance":0,"anchorId":null,"tags":["failure","slippage"]}],
  "relations": ["mem_a1b2c3d4 -[MENTIONS]→ pool_mon_usdc_a"],
  "contextTruncated": false
}
\`\`\``,
    },
    {
        name: 'link',
        description: 'Create a typed relationship between two entities (upserts both if they do not exist yet).',
        badge: 'graph',
        params: [
            { name: 'from', type: 'object', required: true, description: 'Source entity: {label, name}.' },
            { name: 'type', type: 'string', required: true, description: 'Relation type in UPPER_SNAKE_CASE, e.g. "TRADES_ON".' },
            { name: 'to', type: 'object', required: true, description: 'Target entity: {label, name}.' },
            { name: 'props', type: 'object', required: false, description: 'Optional properties for the edge.' },
        ],
        exampleArgs: {
            from: { label: 'Agent', name: 'DeFi Bot' },
            type: 'AVOIDS',
            to: { label: 'Token', name: 'SCAM' },
        },
        exampleResponse: `Linked: DeFi Bot -[AVOIDS]→ SCAM (edge e_deadbeef)

\`\`\`json
{
  "edge": {"id":"e_deadbeef","from":"agent_defi_bot","type":"AVOIDS","to":"token_scam"},
  "nodes": [{"id":"agent_defi_bot","label":"Agent","name":"DeFi Bot"},{"id":"token_scam","label":"Token","name":"SCAM"}]
}
\`\`\``,
    },
    {
        name: 'explore',
        description: 'Breadth-first traversal from one or more node ids. Returns the full subgraph within the given hop count.',
        badge: 'graph',
        params: [
            { name: 'start', type: 'string | string[]', required: true, description: 'Node id(s) to start from.' },
            { name: 'maxDepth', type: 'integer', required: false, description: 'Max hops (0–3, default 2).', default: '2' },
            { name: 'direction', type: '"out"|"in"|"both"', required: false, description: 'Edge direction to follow.', default: 'both' },
            { name: 'types', type: 'string[]', required: false, description: 'Only follow these relation types. Omit for all.' },
            { name: 'limit', type: 'integer', required: false, description: 'Max nodes to return (1–300, default 100).', default: '100' },
        ],
        exampleArgs: {
            start: 'pool_mon_usdc_a',
            maxDepth: 2,
            direction: 'both',
        },
        exampleResponse: `Explored from pool_mon_usdc_a:
  pool_mon_usdc_a (depth 0)
  mem_a1b2c3d4 -[MENTIONS]→ pool_mon_usdc_a (depth 1)

\`\`\`json
{
  "nodes": [{"id":"pool_mon_usdc_a","label":"Pool","name":"MON/USDC-A","depth":0}],
  "edges": [{"id":"e_abc","from":"mem_a1b2c3d4","type":"MENTIONS","to":"pool_mon_usdc_a"}],
  "truncated": false
}
\`\`\``,
    },
    {
        name: 'forget',
        description: 'Delete a memory and all its edges. Only Memory nodes can be deleted (not entity nodes).',
        params: [
            { name: 'id', type: 'string', required: true, description: 'The _id of the memory node to delete (e.g. "mem_a1b2c3d4").' },
        ],
        exampleArgs: {
            id: 'mem_a1b2c3d4',
        },
        exampleResponse: `Deleted memory mem_a1b2c3d4.

\`\`\`json
{
  "id": "mem_a1b2c3d4",
  "deleted": true
}
\`\`\``,
    },
    {
        name: 'anchor_now',
        description: 'Anchor all pending (un-anchored) memories on-chain as a Merkle batch. Requires MONAD_RPC_URL and ANCHOR_CONTRACT.',
        badge: 'anchoring',
        requiresAnchor: true,
        params: [],
        exampleArgs: {},
        exampleResponse: `Anchored 5 memories.
Root: 0xdeadbeef...
Tx: 0x0db2f16d...

\`\`\`json
{
  "root": "0xdeadbeef...",
  "count": 5,
  "txHash": "0x0db2f16d...",
  "anchoredAt": "2026-10-14T03:02:00.000Z",
  "recovered": false,
  "explorerUrl": "https://testnet.monadscan.com/tx/0x0db2f16d..."
}
\`\`\``,
    },
    {
        name: 'verify_memory',
        description: "Verify a memory's integrity against its on-chain Merkle anchor. Checks hash validity, Merkle proof, and on-chain root.",
        badge: 'anchoring',
        requiresAnchor: true,
        params: [
            { name: 'id', type: 'string', required: true, description: 'The _id of the memory node to verify.' },
        ],
        exampleArgs: {
            id: 'mem_a1b2c3d4',
        },
        exampleResponse: `✅ Verified — hash ✓ · proof ✓ · on-chain ✓
Anchored by: 0x27bb12A7... at 2026-10-14T03:03:00Z
Root: 0xdeadbeef...
Explorer: https://testnet.monadscan.com/tx/0x0db2f16d...

\`\`\`json
{
  "id": "mem_a1b2c3d4",
  "verified": true,
  "hashValid": true,
  "anchored": true,
  "proofValid": true,
  "onChain": true,
  "root": "0xdeadbeef...",
  "anchoredAt": "2026-10-14T03:03:00.000Z",
  "anchoredBy": "0x27bb12A76BD3eA34aC584F2031DfA48f6885B3CF",
  "txHash": "0x0db2f16d..."
}
\`\`\``,
    },
];

export const ENV_VARS = [
    { name: 'PLUGPORT_URL', required: true, description: 'Base URL of the PlugPort HTTP API. No trailing slash.', example: 'https://testnet.plugport.wtf' },
    { name: 'PLUGPORT_API_KEY', required: true, description: 'Wallet API key (pp_...) from the PlugPort dashboard.', example: 'pp_your_key_here' },
    { name: 'PAG_GRAPH', required: false, description: 'Graph namespace (default: "default").', example: 'default' },
    { name: 'MONAD_RPC_URL', required: false, description: 'Monad RPC endpoint. Required for anchor_now and verify_memory.', example: 'https://testnet-rpc.monad.xyz' },
    { name: 'ANCHOR_CONTRACT', required: false, description: 'MemoryAnchor.sol contract address on Monad.', example: '0x12a49Ee0c56dA65Eb519cC612Ee4D3A4A089c1f4' },
    { name: 'ANCHOR_PRIVATE_KEY', required: false, description: 'Private key that signs anchor transactions. Keep secret — never put in the web viewer.', example: '0x...' },
    { name: 'EXPLORER_TX_URL', required: false, description: 'Block explorer base URL for transaction links.', example: 'https://testnet.monadscan.com/tx/' },
];
