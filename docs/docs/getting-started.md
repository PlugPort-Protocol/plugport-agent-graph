---
id: getting-started
sidebar_position: 1
title: Getting Started
description: Set up PlugPort Agent Graph — verifiable AI memory on Monad.
---

# Getting Started

**PlugPort Agent Graph** gives AI agents persistent, verifiable long-term memory. Facts are stored as a content-hashed knowledge graph on [PlugPort](https://testnet.plugport.wtf), and batches of memory hashes are anchored on **Monad** — so every recalled fact carries a cryptographic chain-of-custody proof.

```
Agent  ──remember()──►  PlugPort  ──Merkle batch──►  MemoryAnchor.sol (Monad)
  ▲                       │
  └──────recall()─────────┘
```

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node.js ≥ 20 | Required |
| pnpm ≥ 10 | `npm i -g pnpm` |
| PlugPort account | [testnet.plugport.wtf](https://testnet.plugport.wtf) — get a `pp_...` API key |
| Monad testnet wallet | Funded with MON for gas (anchor transactions) |
| Google AI Studio key | For the Gemma demo agent only |

## Installation

```bash
git clone https://github.com/PlugPort-Protocol/plugport-agent-graph.git
cd plugport-agent-graph

cp .env.example .env   # fill in at minimum PLUGPORT_URL and PLUGPORT_API_KEY
pnpm install
```

## Quick Start

### 1. Run the unit tests

```bash
pnpm --filter @pag/core test
```

### 2. Run against the live testnet

```bash
pnpm --filter @pag/core test:live   # requires .env with PLUGPORT_URL + PLUGPORT_API_KEY
```

### 3. Run the two-session demo

```bash
pnpm build
pnpm demo --offline       # fast rehearsal: in-memory store and chain
pnpm demo --scripted      # same story, no model needed
pnpm demo                 # full run: Gemma 4 + PlugPort testnet + Monad anchoring
```

### 4. Open the web viewer

```bash
pnpm --filter @pag/web start    # http://localhost:3100
```

### 5. Use the MCP server

```bash
pnpm --filter @pag/mcp build
node packages/mcp/dist/index.js   # stdio MCP server
```

## Minimal Code Example

```typescript
import { agentGraphFromEnv } from '@pag/core';

const { memory, anchor } = agentGraphFromEnv(); // reads .env

await memory.remember({
    text: 'Swap of 10 MON to USDC failed on pool MON/USDC-A: slippage was 3.2%.',
    entities: [{ label: 'Pool', name: 'MON/USDC-A' }, { label: 'Token', name: 'USDC' }],
    relations: [{ from: 'MON/USDC-A', type: 'trades', to: 'USDC' }],
    tags: ['failure'],
});

const { memories } = await memory.recall({ query: 'slippage', entity: 'USDC', hops: 1 });

const { batch } = await anchor!.anchorPending();   // Merkle root → Monad tx
const check = await anchor!.verify(memories[0]!.memory._id);
// { verified: true, proofValid: true, onChain: true, explorerUrl: '...' }
```

## Environment Variables

See [`.env.example`](https://github.com/PlugPort-Protocol/plugport-agent-graph/blob/main/.env.example) for the full list. The minimum to get started:

```bash
PLUGPORT_URL=https://testnet.plugport.wtf
PLUGPORT_API_KEY=pp_your_key_here
PAG_GRAPH=default
```

Add these for on-chain anchoring:

```bash
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
ANCHOR_PRIVATE_KEY=0x...
ANCHOR_CONTRACT=0x12a49Ee0c56dA65Eb519cC612Ee4D3A4A089c1f4
EXPLORER_TX_URL=https://testnet.monadscan.com/tx/
```
