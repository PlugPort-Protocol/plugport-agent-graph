import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
    docsSidebar: [
        { type: 'doc', id: 'getting-started', label: 'Getting Started' },
        { type: 'doc', id: 'architecture', label: 'Architecture' },
        { type: 'doc', id: 'notes', label: 'Development Notes' },
        {
            type: 'category',
            label: '@pag/core',
            collapsed: false,
            link: {
                type: 'generated-index',
                title: '@pag/core',
                description: 'PlugPort client, knowledge graph, memory, hashing, and on-chain anchoring.',
                slug: 'category/core',
            },
            items: ['core/overview', 'core/memory', 'core/graph', 'core/hashing', 'core/anchor'],
        },
        {
            type: 'category',
            label: 'MCP Server',
            collapsed: false,
            link: {
                type: 'generated-index',
                title: 'MCP Server (@pag/mcp)',
                description: 'Give any MCP-compatible AI host persistent, verifiable memory via PlugPort.',
                slug: 'category/mcp-server',
            },
            items: ['mcp/overview', 'mcp/tools', 'mcp/configuration'],
        },
        {
            type: 'category',
            label: 'DeFi Demo Agent',
            collapsed: true,
            link: {
                type: 'generated-index',
                title: 'DeFi Demo Agent (@pag/agent)',
                description: 'Gemma 4 DeFi agent that demonstrates two-session memory recall and Monad anchoring.',
                slug: 'category/agent',
            },
            items: ['agent/overview', 'agent/demo', 'agent/tools'],
        },
        {
            type: 'category',
            label: 'Web Viewer',
            collapsed: true,
            link: {
                type: 'generated-index',
                title: 'Web Viewer (@pag/web)',
                description: 'Next.js graph viewer with live Merkle proof verification against Monad.',
                slug: 'category/web',
            },
            items: ['web/overview', 'web/verify'],
        },
        {
            type: 'category',
            label: 'Smart Contracts',
            collapsed: true,
            link: {
                type: 'generated-index',
                title: 'Smart Contracts',
                description: 'On-chain components deployed on Monad testnet.',
                slug: 'category/contracts',
            },
            items: ['contracts/memory-anchor'],
        },
        {
            type: 'category',
            label: 'API Reference',
            collapsed: true,
            link: {
                type: 'generated-index',
                title: 'API Reference',
                description: 'HTTP API routes exposed by the web viewer.',
                slug: 'category/api-reference',
            },
            items: ['api-reference/web-api'],
        },
        { type: 'doc', id: 'faq', label: 'FAQ' },
    ],
};

export default sidebars;
