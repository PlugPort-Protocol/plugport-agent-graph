#!/usr/bin/env node
// @pag/mcp — stdio MCP server for PlugPort Agent Graph.
//
// Run directly:
//   node dist/index.js
//
// Or via the workspace root:
//   pnpm mcp
//
// Environment variables (read from .env at repo root if present):
//   PLUGPORT_URL           Required. Base URL of the PlugPort HTTP API.
//   PLUGPORT_API_KEY       Required. Wallet API key (pp_... from the dashboard).
//   PAG_GRAPH              Optional. Graph name (default: "default").
//   MONAD_RPC_URL          Optional. Enables on-chain anchoring (anchor_now, verify_memory).
//   ANCHOR_CONTRACT        Optional. MemoryAnchor contract address.
//   ANCHOR_PRIVATE_KEY     Optional. Signs anchor transactions.
//   EXPLORER_TX_URL        Optional. Block explorer base URL for tx links.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { agentGraphFromEnv } from '@pag/core';
import { registerTools } from './tools.js';

// Load .env from the repo root (three levels up from packages/mcp/dist/index.js)
const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const { memory, anchor, graph } = agentGraphFromEnv();

const server = new McpServer({
    name: 'pag-mcp',
    version: '0.1.0',
});

registerTools(server, { memory, anchor, graph });

const transport = new StdioServerTransport();
await server.connect(transport);
