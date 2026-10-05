'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { AnchorRecord, GraphEdge, GraphInfo, GraphNode, VerifyResult } from '@pag/core';
import { labelColor } from './colors';

const GraphCanvas = dynamic(() => import('./GraphCanvas').then((m) => m.GraphCanvas), {
    ssr: false,
    loading: () => <div className="overlay">Loading graph…</div>,
});

type Anchor = Omit<AnchorRecord, 'hashes'>;
type Node = Omit<GraphNode, 'keywords'> & { _tamperedFrom?: string };
interface Meta { graphs: GraphInfo[]; defaultGraph: string; anchoring: boolean; contract: string | null; tamperEnabled: boolean }
interface RecallHit { id: string; text?: string; score: number; distance: number }
type Tab = 'node' | 'memories' | 'anchors';

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    return body as T;
}

const short = (s: string | null | undefined, n = 10) => (s ? (s.length > 2 * n + 1 ? `${s.slice(0, n + 2)}…${s.slice(-n)}` : s) : '—');
const when = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString() : '—');

export function Viewer() {
    const [meta, setMeta] = useState<Meta | null>(null);
    const [graph, setGraph] = useState<string>('');
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<GraphEdge[]>([]);
    const [anchors, setAnchors] = useState<Anchor[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>('memories');
    const [query, setQuery] = useState('');
    const [entity, setEntity] = useState('');
    const [recall, setRecall] = useState<{ hits: RecallHit[]; nodes: Set<string>; edges: Set<string> } | null>(null);
    const [recalling, setRecalling] = useState(false);
    const [graphTruncated, setGraphTruncated] = useState(false);
    /** Node to open once the graph has loaded (?select=<id>). */
    const pendingSelect = useRef<string | null>(null);

    useEffect(() => {
        getJson<Meta>('/api/graphs')
            .then((m) => {
                setMeta(m);
                const params = new URLSearchParams(window.location.search);
                const fromUrl = params.get('graph');
                const preselect = params.get('select');
                if (preselect) pendingSelect.current = preselect;
                const names = m.graphs.map((g) => g.graph);
                setGraph(fromUrl ?? (names.includes(m.defaultGraph) ? m.defaultGraph : names[0] ?? m.defaultGraph));
            })
            .catch((e: Error) => setError(e.message));
    }, []);

    const load = useCallback(async (name: string) => {
        if (!name) return;
        setLoading(true);
        setError(null);
        try {
            const data = await getJson<{ nodes: Node[]; edges: GraphEdge[]; anchors: Anchor[] }>(`/api/graph?graph=${encodeURIComponent(name)}`);
            setNodes(data.nodes);
            setEdges(data.edges);
            setAnchors(data.anchors);
            const wanted = pendingSelect.current;
            pendingSelect.current = null;
            if (wanted && data.nodes.some((n) => n._id === wanted)) {
                setSelectedId(wanted);
                setTab('node');
            }
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!graph) return;
        setSelectedId(null);
        setRecall(null);
        setGraphTruncated(false);
        const url = new URL(window.location.href);
        url.searchParams.set('graph', graph);
        window.history.replaceState(null, '', url);
        void load(graph);
    }, [graph, load]);

    const byId = useMemo(() => new Map(nodes.map((n) => [n._id, n])), [nodes]);
    const memories = useMemo(() => nodes.filter((n) => n.label === 'Memory').sort((a, b) => b.createdAt - a.createdAt), [nodes]);
    const labels = useMemo(() => [...new Set(nodes.map((n) => n.label))].sort(), [nodes]);
    const selected = selectedId ? byId.get(selectedId) ?? null : null;

    const select = (id: string | null) => {
        setSelectedId(id);
        if (id) setTab('node');
    };

    const runRecall = async () => {
        if (!query.trim() && !entity.trim()) return;
        setRecalling(true);
        setError(null);
        try {
            const params = new URLSearchParams({ graph, q: query, entity, hops: '1' });
            const r = await getJson<{ memories: RecallHit[]; nodeIds: string[]; edgeIds: string[]; contextTruncated: boolean }>(`/api/recall?${params}`);
            setRecall({ hits: r.memories, nodes: new Set(r.nodeIds), edges: new Set(r.edgeIds) });
            setGraphTruncated(r.contextTruncated ?? false);
            setTab('memories');
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setRecalling(false);
        }
    };

    return (
        <div className="app">
            <header className="top">
                <div className="brand">PlugPort <span>Agent Graph</span></div>
                <select value={graph} onChange={(e) => setGraph(e.target.value)} aria-label="Graph">
                    {meta?.graphs.map((g) => <option key={g.graph} value={g.graph}>{g.graph} ({g.nodes} nodes)</option>)}
                    {meta && !meta.graphs.some((g) => g.graph === graph) && graph && <option value={graph}>{graph}</option>}
                </select>
                <button className="btn" onClick={() => void load(graph)} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
                <div className="stats">
                    {memories.length} memories · {nodes.length - memories.length} entities · {edges.length} edges · {anchors.length} anchors
                    {graphTruncated && (
                        <span className="badge warn" title="Recall context exceeded 300 nodes — some connected nodes are not highlighted">⚠ graph truncated</span>
                    )}
                </div>
                <div className="spacer" />
                {meta?.contract && <div className="stats">MemoryAnchor <code>{short(meta.contract, 6)}</code></div>}
            </header>

            {error && <div className="error">{error}</div>}

            <div className="main">
                <section className="canvas-wrap">
                    <div className="recall">
                        <input className="q" placeholder="Recall: keywords, e.g. slippage failure" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void runRecall()} />
                        <input className="e" placeholder="entity, e.g. USDC" value={entity} onChange={(e) => setEntity(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void runRecall()} />
                        <button className="btn primary" onClick={() => void runRecall()} disabled={recalling || (!query.trim() && !entity.trim())}>{recalling ? 'Recalling…' : 'Recall'}</button>
                        {recall && <button className="btn" onClick={() => setRecall(null)}>Clear</button>}
                    </div>
                    <div style={{ position: 'relative', minHeight: 0 }}>
                        {nodes.length > 0 && (
                            <GraphCanvas nodes={nodes} edges={edges} selectedId={selectedId} highlight={recall ? { nodes: recall.nodes, edges: recall.edges } : null} onSelect={select} />
                        )}
                        {!loading && nodes.length === 0 && <div className="overlay">{graph ? 'This graph is empty.' : 'No graphs yet.'}</div>}
                        {loading && nodes.length === 0 && <div className="overlay">Loading from PlugPort…</div>}
                        {labels.length > 0 && (
                            <div className="legend">
                                {labels.map((l) => <span key={l}><i style={{ background: labelColor(l), borderRadius: l === 'Memory' ? 2 : '50%' }} />{l}</span>)}
                                <span><i style={{ background: 'transparent', border: '1.5px solid #34d399', borderRadius: 2 }} />anchored</span>
                            </div>
                        )}
                    </div>
                </section>

                <aside className="side">
                    <nav className="tabs">
                        <button className={tab === 'node' ? 'on' : ''} onClick={() => setTab('node')}>Selected</button>
                        <button className={tab === 'memories' ? 'on' : ''} onClick={() => setTab('memories')}>Memories{recall ? ` (${recall.hits.length})` : ''}</button>
                        <button className={tab === 'anchors' ? 'on' : ''} onClick={() => setTab('anchors')}>Anchors</button>
                    </nav>
                    <div className="pane">
                        {tab === 'node' && (selected
                            ? <NodePanel key={selected._id} node={selected} graph={graph} edges={edges} byId={byId} meta={meta} onSelect={select} onChanged={() => void load(graph)} />
                            : <p className="muted">Click a node in the graph, or a memory in the list.</p>)}
                        {tab === 'memories' && (
                            <MemoryList memories={recall ? recall.hits.map((h) => byId.get(h.id)).filter((n): n is Node => Boolean(n)) : memories} scores={recall ? new Map(recall.hits.map((h) => [h.id, h.score])) : null} selectedId={selectedId} onSelect={select} />
                        )}
                        {tab === 'anchors' && <AnchorList anchors={anchors} />}
                    </div>
                </aside>
            </div>
        </div>
    );
}

function MemoryList({ memories, scores, selectedId, onSelect }: { memories: Node[]; scores: Map<string, number> | null; selectedId: string | null; onSelect: (id: string) => void }) {
    if (memories.length === 0) return <p className="muted">{scores ? 'Recall found nothing.' : 'No memories in this graph.'}</p>;
    return (
        <>
            {scores && <p className="muted small">Recall results, most relevant first. Matching nodes are highlighted in the graph.</p>}
            <ul className="list">
                {memories.map((m) => (
                    <li key={m._id} className={m._id === selectedId ? 'sel' : ''} onClick={() => onSelect(m._id)}>
                        <div>{m.text}</div>
                        <div className="small muted" style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <span>{when(m.createdAt)}</span>
                            {Array.isArray(m.props?.tags) && (m.props.tags as string[]).map((t) => <span key={t} className="badge">{t}</span>)}
                            {m.anchorId ? <span className="badge anch">anchored</span> : <span className="badge">not anchored</span>}
                            {scores && <span className="badge">score {scores.get(m._id)}</span>}
                        </div>
                    </li>
                ))}
            </ul>
        </>
    );
}

function AnchorList({ anchors }: { anchors: Anchor[] }) {
    if (anchors.length === 0) return <p className="muted">No anchor batches yet. The agent anchors when asked (anchor_now).</p>;
    return (
        <ul className="list">
            {anchors.map((a) => (
                <li key={a._id} style={{ cursor: 'default' }}>
                    <div className="mono">{short(a._id, 12)}</div>
                    <dl className="kv">
                        <dt>Memories</dt><dd>{a.count}</dd>
                        <dt>Anchored</dt><dd>{when(a.anchoredAt)}</dd>
                        <dt>By</dt><dd className="mono">{short(a.anchoredBy, 6)}</dd>
                        <dt>Tx</dt><dd>{a.txHash ? <TxLink hash={a.txHash} /> : <span className="muted">recovered (no tx hash)</span>}</dd>
                    </dl>
                </li>
            ))}
        </ul>
    );
}

function TxLink({ hash, url }: { hash: string; url?: string | null }) {
    const href = url ?? `https://testnet.monadscan.com/tx/${hash}`;
    return <a href={href} target="_blank" rel="noreferrer" className="mono">{short(hash, 8)} ↗</a>;
}

function NodePanel({ node, graph, edges, byId, meta, onSelect, onChanged }: {
    node: Node; graph: string; edges: GraphEdge[]; byId: Map<string, Node>; meta: Meta | null;
    onSelect: (id: string) => void; onChanged: () => void;
}) {
    const [verify, setVerify] = useState<VerifyResult | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const related = edges
        .filter((e) => e.from === node._id || e.to === node._id)
        .map((e) => ({ edge: e, other: byId.get(e.from === node._id ? e.to : e.from), out: e.from === node._id }))
        .filter((r) => r.other);

    const run = async (what: string, fn: () => Promise<void>) => {
        setBusy(what);
        setError(null);
        try {
            await fn();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    };

    const doVerify = () => run('verify', async () => {
        setVerify(await getJson<VerifyResult>(`/api/verify?graph=${encodeURIComponent(graph)}&id=${encodeURIComponent(node._id)}`));
    });
    const doTamper = (restore: boolean) => run(restore ? 'restore' : 'tamper', async () => {
        await getJson('/api/tamper', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ graph, id: node._id, restore }) });
        setVerify(null);
        onChanged();
    });

    const isMemory = node.label === 'Memory';
    return (
        <div>
            <span className="label-chip" style={{ background: labelColor(node.label) }}>{node.label}</span>
            {isMemory ? <p className="memtext">{node.text}</p> : <h2 style={{ margin: '10px 0' }}>{node.name ?? node._id}</h2>}
            <dl className="kv">
                <dt>Id</dt><dd className="mono">{node._id}</dd>
                <dt>Created</dt><dd>{when(node.createdAt)}</dd>
                {isMemory && <><dt>Hash</dt><dd className="mono">{short(node.hash, 10)}</dd></>}
                {isMemory && <><dt>Anchor</dt><dd className="mono">{node.anchorId ? short(node.anchorId, 10) : <span className="muted">not anchored yet</span>}</dd></>}
                {Object.keys(node.props ?? {}).length > 0 && <><dt>Props</dt><dd className="mono">{JSON.stringify(node.props)}</dd></>}
            </dl>

            {isMemory && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn primary" onClick={() => void doVerify()} disabled={busy !== null}>{busy === 'verify' ? 'Verifying on Monad…' : 'Verify'}</button>
                    {meta?.tamperEnabled && (node._tamperedFrom === undefined
                        ? <button className="btn danger" onClick={() => void doTamper(false)} disabled={busy !== null}>{busy === 'tamper' ? 'Editing…' : 'Simulate tampering'}</button>
                        : <button className="btn" onClick={() => void doTamper(true)} disabled={busy !== null}>{busy === 'restore' ? 'Restoring…' : 'Restore original text'}</button>)}
                </div>
            )}
            {error && <p className="bad small">{error}</p>}
            {verify && <VerifyView v={verify} />}

            {related.length > 0 && (
                <>
                    <h3 className="small muted" style={{ marginTop: 20 }}>CONNECTED</h3>
                    <ul className="list">
                        {related.map(({ edge, other, out }) => (
                            <li key={edge._id} onClick={() => onSelect(other!._id)}>
                                <span className="small muted">{out ? `${edge.type} →` : `← ${edge.type}`}</span>{' '}
                                <span className="label-chip" style={{ background: labelColor(other!.label) }}>{other!.label}</span>{' '}
                                {other!.label === 'Memory' ? other!.text : other!.name}
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
}

function VerifyView({ v }: { v: VerifyResult }) {
    const mark = (ok: boolean) => <span className={ok ? 'ok' : 'bad'}>{ok ? '✓' : '✗'}</span>;
    return (
        <div>
            <div className={`verdict ${v.verified ? 'ok' : 'bad'}`}>
                {v.verified ? '✓ Verified: unchanged since it was anchored on Monad' : `✗ Not verified: ${v.problem ?? 'unknown problem'}`}
            </div>
            <ul className="checks small">
                <li>{mark(v.hashValid)} Stored hash matches the stored content</li>
                <li>{mark(v.anchored)} Belongs to an anchor batch</li>
                <li>{mark(v.proofValid)} Current content proves into the anchored Merkle root{v.proof.length ? ` (${v.proof.length}-step proof)` : ''}</li>
                <li>{mark(v.onChain)} Root recorded on Monad by the trusted anchor wallet</li>
            </ul>
            <dl className="kv">
                <dt>Root</dt><dd className="mono">{short(v.root, 12)}</dd>
                <dt>Anchored</dt><dd>{when(v.anchoredAt)}</dd>
                <dt>By</dt><dd className="mono">{short(v.anchoredBy, 6)}</dd>
                <dt>Tx</dt><dd>{v.txHash ? <TxLink hash={v.txHash} url={v.explorerUrl} /> : '—'}</dd>
                <dt>Content hash</dt><dd className="mono">{short(v.computedHash, 10)}</dd>
            </dl>
        </div>
    );
}
