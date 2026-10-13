---
id: notes
sidebar_position: 3
title: Development Notes
description: Known issues, platform quirks, and implementation decisions — §6a PlugPort fixes, §6b Windows pnpm, §6c wallet-derived keys.
---

# Development Notes

Detailed notes on gotchas, platform quirks, and implementation decisions discovered during development. Cross-referenced from source code comments as `docs/NOTES.md §6a`, `§6b`, `§6c`.

---

## §6a — PlugPort Storage Semantics (Fixed in Current Release)

During development, two PlugPort behaviors required workarounds. Both are **fixed in the current PlugPort release** and are documented here for reference and for regression testing.

### §6a.1 — `insertMany` rollback on duplicate `_id`

**Symptom:** When a batch insert via `insertMany` was rejected because one document had a duplicate `_id` (unique constraint), the other documents in the batch were left in the collection — the batch was not rolled back atomically.

**Impact:** A memory written with `remember()` could end up with its node stored but its edges missing if an edge insert failed mid-batch. On retry, the memory node's `_id` would be rejected as a duplicate, leaving it permanently orphaned.

**Fix (PlugPort side):** PlugPort now rolls back the entire batch on any constraint violation. The fix is tested in `packages/core/test/live-semantics.test.ts`.

**Workaround still in @pag/core (for older PlugPort):** `Memory.remember()` checks existing ids before inserting, and on edge-insert failure calls `graph.deleteNode(id)` to clean up the orphaned memory:

```typescript
try {
    edges = await this.graph.upsertEdges([...]);
} catch (err) {
    await this.graph.deleteNode(id).catch(() => undefined); // cleanup
    throw err;
}
```

### §6a.2 — `$in` filter on array fields

**Symptom:** The PlugPort query `{ field: { $in: ['a', 'b'] } }` was comparing the **entire field value** against the array, not checking whether the field value is *contained in* the array. This means it only matched documents where `field === ['a', 'b']` (exact array equality), not documents where `field === 'a'`.

**Impact:** Any filter using `$in` on a field that could contain an array value returned incorrect results.

**Workaround in @pag/core:** `$in` is used **only on scalar fields** (`_id`, `from`, `to`, `type`) where the stored value is always a string, not an array. Array-valued fields (like `tags`) are stored as a space-padded keyword string and searched via `$regex` instead:

```typescript
// Correct: scalar field, $in works
{ _id: { $in: ['abc', 'def'] } }

// Workaround: array-valued field — use $regex on keyword string instead
{ keywords: { $regex: ' slippage ' } }
```

---

## §6b — Windows pnpm Setup

On Windows, **use the standalone pnpm binary** rather than installing via `npm install -g pnpm` or Corepack. There is a known friction between Corepack and pnpm 10 on Windows that can cause `pnpm install` to fail silently or use the wrong pnpm version.

### Recommended: standalone pnpm on Windows

```powershell
# Download and install the standalone pnpm binary
iwr https://get.pnpm.io/install.ps1 -useb | iex
```

This installs pnpm to `%LOCALAPPDATA%\pnpm` and adds it to your `PATH` without relying on Corepack or npm.

### Verify

```powershell
pnpm --version   # should print 10.x.x
```

### Why not Corepack?

Corepack's `pnpm` shim on Windows reads `packageManager` from `package.json` and downloads the declared version. With pnpm 10 there is a regression where the shim can silently fall back to an older version when the download fails behind a corporate proxy or firewall. The standalone binary avoids this entirely.

### Alternative: use npm as the package manager

If you cannot use the standalone binary, you can install pnpm via npm:

```powershell
npm install -g pnpm@10
```

Then verify with `pnpm --version`.

---

## §6c — Wallet-derived Keys vs. PlugPort API Keys

**Do not use a wallet's private key or a hex-encoded address as the `PLUGPORT_API_KEY`.**

PlugPort uses two distinct key types for two different purposes:

| Key type | Format | Used for |
|----------|--------|----------|
| **PlugPort API key** | `pp_...` | HTTP `x-api-key` header — authenticates REST API writes |
| **Wallet private key** | `0x...` (64 hex) | Signs on-chain transactions (Monad anchoring only) |

### The common mistake

When setting up `.env`, developers sometimes copy the Monad wallet's private key (`0x...`) into `PLUGPORT_API_KEY`. This will **not work** — the PlugPort API does not accept hex keys, only `pp_...` format keys generated in the [PlugPort dashboard](https://testnet.plugport.wtf).

### How to get a PlugPort API key

1. Go to [testnet.plugport.wtf](https://testnet.plugport.wtf) and connect your wallet.
2. Open **Settings → API Keys → Generate New Key**.
3. Copy the `pp_...` key into `.env` as `PLUGPORT_API_KEY`.

### How to get a second key for graph sharing

For `pnpm demo --share`, you need a **second wallet** with its own PlugPort API key:

1. Connect a second wallet in the PlugPort dashboard.
2. Generate a new `pp_...` key for wallet-2.
3. In the dashboard, grant wallet-2 read access to wallet-1's graph via **Shared Graphs → Grant Access**.
4. Add the key to `.env` as `PLUGPORT_API_KEY_2`.

### Env reference

```bash
PLUGPORT_API_KEY=pp_abc123...      # ✅ correct: PlugPort dashboard key
PLUGPORT_API_KEY=0xdeadbeef...     # ❌ wrong: wallet private key
ANCHOR_PRIVATE_KEY=0xdeadbeef...   # ✅ correct location for the private key
```
