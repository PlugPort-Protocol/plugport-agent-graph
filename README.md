# PlugPort Agent Graph

Verifiable memory graph for AI agents on Monad, built on [PlugPort](../plugport).

Agents `remember` facts as immutable, content-hashed memories linked to the entities they mention,
and `recall` them by keyword or entity through the graph. Everything is stored in PlugPort under the
agent wallet's own namespace (private by default), and batches of memory hashes get anchored on Monad.


## Status

| Part | State |
|---|---|
| `packages/core` (`@pag/core`): PlugPort client, graph, memory, hashing | ✅ done |
| `contracts` (MemoryAnchor) + anchoring/verify in core | ✅ done, deployed on Monad testnet at `0x12a49Ee0c56dA65Eb519cC612Ee4D3A4A089c1f4` |
| `packages/agent`: DeFi demo agent on Gemma 4 | ✅ done |
| `packages/mcp`: MCP server (7 tools, zod schemas, stdio transport) | ✅ done |
| `packages/web`: graph viewer with on-chain verify | ✅ done |
| `docs/`: Docusaurus site → [wiki-agent-graph.plugport.wtf](https://wiki-agent-graph.plugport.wtf) | ✅ done |

## Setup

```bash
cp .env.example .env      # fill in PLUGPORT_URL and PLUGPORT_API_KEY (a pp_ key) at least
pnpm install
pnpm --filter @pag/core test        # unit tests
pnpm --filter @pag/core test:live   # against PlugPort + Monad from .env (spends testnet gas)
pnpm --filter @pag/core build
pnpm --filter @pag/contracts run deploy:testnet   # deploy MemoryAnchor, saves ANCHOR_CONTRACT
```

On this machine, use the standalone Windows pnpm (see the [Development Notes](https://wiki-agent-graph.plugport.wtf/notes) §6b).

## Demo

> [!WARNING]
> Run `pnpm install && pnpm build` once before the first `pnpm demo` or `pnpm agent`.
> After that, `predemo` / `preagent` hooks rebuild automatically on each run.

```bash
pnpm build
pnpm demo                                   # Gemma 4 + PlugPort testnet + Monad anchoring (needs GEMINI_API_KEY)
pnpm demo --offline                         # same, with an in-memory store and chain (fast rehearsal)
pnpm demo --scripted                        # no model: the same story through the same tools
pnpm demo --share                           # after the demo: wallet-2 reads wallet-1's graph (needs PLUGPORT_API_KEY_2)
pnpm agent chat                             # talk to the agent yourself
```

Session 1 tells the agent "never more than 1% slippage, never touch SCAM", then asks for a swap at
the best quote: pool MON/USDC-A quotes best but slips 3.2%, so the swap fails and the agent remembers
that. Session 2 is a new agent with an empty chat history: it recalls the rule and the failure from
PlugPort, swaps on MON/USDC-B instead, and refuses to buy SCAM. The demo then checks that behavior and
verifies a memory against its Monad anchor. Swaps are mock (no DEX calls); memory and anchoring are real.

## Viewer

```bash
pnpm build
pnpm --filter @pag/web start      # http://localhost:3100 (reads the repo-root .env)
```

Pick a graph, click a memory, press **Verify**: it recomputes the memory's hash, checks its Merkle
proof against the anchored root, and reads the root from the MemoryAnchor contract on Monad. With
`VIEWER_ALLOW_TAMPER=true`, **Simulate tampering** edits the memory in PlugPort so you can watch
verification fail, and **Restore** puts it back. The recall bar runs the same recall the agent uses
and highlights what it found.

Deploy on Vercel: import the repo, set Root Directory to `packages/web`, and add the env vars
`PLUGPORT_URL`, `PLUGPORT_API_KEY`, `PAG_GRAPH`, `MONAD_RPC_URL`, `ANCHOR_CONTRACT`, `ANCHOR_ADDRESS`,
`EXPLORER_TX_URL`, and `VIEWER_PASSWORD` (it shows the wallet's private memories). Never add
`ANCHOR_PRIVATE_KEY` there.

## MCP Server

`packages/mcp` is a **stdio MCP server** that exposes all 7 memory tools to any MCP-compatible AI host.

```bash
pnpm --filter @pag/mcp build
node packages/mcp/dist/index.js   # stdio transport

# Or via the root script (builds first automatically):
pnpm mcp
```

Add to your MCP host's config:

```json
{
  "pag-mcp": {
    "command": "node",
    "args": ["/path/to/plugport-agent-graph/packages/mcp/dist/index.js"]
  }
}
```

See [`packages/mcp/README.md`](packages/mcp/README.md) and the [full docs](https://wiki-agent-graph.plugport.wtf/mcp/overview) for all tools, schemas, and env vars.

## Documentation

Full documentation is at **[wiki-agent-graph.plugport.wtf](https://wiki-agent-graph.plugport.wtf)**.

To build docs locally:

```bash
cd docs && pnpm install && pnpm start
```

## Usage

```ts
import { agentGraphFromEnv } from '@pag/core';

const { memory, anchor } = agentGraphFromEnv(); // reads .env-style variables

await memory.remember({
    text: 'Swap of 10 MON to USDC failed on pool MON/USDC-A: slippage was 3.2%.',
    entities: [{ label: 'Pool', name: 'MON/USDC-A' }, { label: 'Token', name: 'USDC' }],
    relations: [{ from: 'MON/USDC-A', type: 'trades', to: 'USDC' }],
    tags: ['failure'],
});

const { memories, context } = await memory.recall({ query: 'slippage', entity: 'USDC', hops: 1 });

const { batch } = await anchor!.anchorPending();   // Merkle root of new memories → Monad tx
const check = await anchor!.verify(memories[0]!.memory._id);
// { verified: true, proofValid: true, onChain: true, explorerUrl: 'https://testnet.monadscan.com/tx/…', … }
```
