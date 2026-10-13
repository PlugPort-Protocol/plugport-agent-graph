---
sidebar_position: 1
title: Overview
description: "@pag/web — Next.js graph viewer with live Merkle proof verification."
---

# Web Viewer (@pag/web)

`@pag/web` is a **Next.js application** that visualises the agent's knowledge graph in real-time and lets you verify memories against their Monad anchors directly in the browser.

## Features

- **Graph visualisation** — force-directed graph of Memory and Entity nodes, coloured by label, with edge labels on hover.
- **Live recall** — type a query and see which nodes are highlighted by `Memory.recall()` in real-time.
- **Anchor badges** — nodes with an `anchorId` show a teal `⛓ anchored` badge. Click a node to see the full anchor batch.
- **Merkle proof verification** — click any anchored memory to see `hashValid`, `proofValid`, and `onChain` status fetched live from Monad.
- **Multi-graph** — switch between graphs by adding `?graph=<name>` to the URL.
- **Truncation warning** — when a recall context is capped at 300 nodes, a `⚠ graph truncated` badge appears in the stats bar.

## Running Locally

```bash
pnpm build                       # build @pag/core first
pnpm --filter @pag/web start     # http://localhost:3100
```

Or from the repo root after a full build:

```bash
pnpm demo --offline              # populate the in-memory store
# (web viewer only works with PlugPort, not in-memory, in production)
```

## URL Parameters

| Parameter | Description |
|-----------|-------------|
| `?graph=<name>` | Switch to a different graph namespace |
| `?select=<id>` | Open a specific node's detail panel on load |

## API Routes

The viewer exposes three API routes consumed by its own React components. See [Web API Reference](../api-reference/web-api).
