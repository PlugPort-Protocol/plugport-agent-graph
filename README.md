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
| `packages/mcp`: MCP server | Phase 4 |
| `packages/web`: viewer | Phase 5 |

## Setup

```bash
cp .env.example .env      # fill in PLUGPORT_URL and PLUGPORT_API_KEY (a pp_ key) at least
pnpm install
pnpm --filter @pag/core test        # unit tests
pnpm --filter @pag/core test:live   # against PlugPort + Monad from .env (spends testnet gas)
pnpm --filter @pag/core build
pnpm --filter @pag/contracts run deploy:testnet   # deploy MemoryAnchor, saves ANCHOR_CONTRACT
```

On this machine, use the standalone Windows pnpm (see docs/NOTES.md §6b).

## Demo

```bash
pnpm build
pnpm demo                                   # Gemma 4 + PlugPort testnet + Monad anchoring (needs GEMINI_API_KEY)
pnpm demo --offline                         # same, with an in-memory store and chain (fast rehearsal)
pnpm demo --scripted                        # no model: the same story through the same tools
pnpm agent chat                             # talk to the agent yourself
```

Session 1 tells the agent "never more than 1% slippage, never touch SCAM", then asks for a swap at
the best quote: pool MON/USDC-A quotes best but slips 3.2%, so the swap fails and the agent remembers
that. Session 2 is a new agent with an empty chat history: it recalls the rule and the failure from
PlugPort, swaps on MON/USDC-B instead, and refuses to buy SCAM. The demo then checks that behavior and
verifies a memory against its Monad anchor. Swaps are mock (no DEX calls); memory and anchoring are real.

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
