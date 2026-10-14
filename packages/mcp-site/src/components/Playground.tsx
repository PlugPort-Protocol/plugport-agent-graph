'use client';

import { useState, useCallback } from 'react';
import { TOOLS } from '@/data/tools';

const PLUGPORT_URL = 'https://testnet.plugport.wtf';

// ── JSON5-ish flexible parser ────────────────────────────────────────
function parseArgs(raw: string): Record<string, unknown> {
    if (!raw.trim()) return {};
    try { return JSON.parse(raw); } catch { /* fall through */ }
    // Try wrapping bare key:value as JSON
    try { return JSON.parse(`{${raw}}`); } catch { /* fall through */ }
    throw new Error('Invalid JSON. Use standard JSON format.');
}

// ── Execute a real PlugPort memory API call from the browser ─────────
async function callPlugPort(
    apiKey: string,
    tool: string,
    args: Record<string, unknown>,
): Promise<{ ok: boolean; result: unknown }> {
    // Map MCP tool calls to direct PlugPort API calls
    // (since this is a browser playground, we call PlugPort directly, not the MCP stdio server)

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
    };

    if (tool === 'remember') {
        // Insert a memory document into the memories collection
        const { text, entities = [], relations = [], tags = [] } = args as Record<string, unknown>;
        const id = `mem_${Math.random().toString(36).slice(2, 10)}`;
        const now = new Date().toISOString();
        const doc = { _id: id, label: 'Memory', text, tags, createdAt: now, props: { entities, relations } };
        const resp = await fetch(`${PLUGPORT_URL}/api/v1/collections/pag_memories/insertMany`, {
            method: 'POST', headers,
            body: JSON.stringify({ documents: [doc] }),
        });
        const data = await resp.json();
        return {
            ok: resp.ok,
            result: resp.ok
                ? { id, message: `Memory stored: "${String(text).slice(0, 60)}${String(text).length > 60 ? '…' : ''}"`, raw: data }
                : data,
        };
    }

    if (tool === 'recall') {
        const { query = '', limit = 10 } = args as Record<string, unknown>;
        const pattern = String(query).trim().split(/\s+/).filter(Boolean).join('|');
        const body = {
            filter: pattern ? { text: { $regex: pattern, $options: 'i' } } : {},
            limit,
        };
        const resp = await fetch(`${PLUGPORT_URL}/api/v1/collections/pag_memories/find`, {
            method: 'POST', headers,
            body: JSON.stringify(body),
        });
        const data = await resp.json();
        return { ok: resp.ok, result: data };
    }

    if (tool === 'forget') {
        const { id } = args as { id: string };
        const resp = await fetch(`${PLUGPORT_URL}/api/v1/collections/pag_memories/deleteMany`, {
            method: 'POST', headers,
            body: JSON.stringify({ filter: { _id: id } }),
        });
        const data = await resp.json();
        return { ok: resp.ok, result: data };
    }

    if (tool === 'link') {
        const { from, type, to } = args as { from: Record<string,string>; type: string; to: Record<string,string> };
        const edgeId = `e_${Math.random().toString(36).slice(2, 10)}`;
        const doc = {
            _id: edgeId, label: 'Edge',
            from: `${from.label?.toLowerCase()}_${from.name?.toLowerCase().replace(/\s+/g, '_')}`,
            type, to: `${to.label?.toLowerCase()}_${to.name?.toLowerCase().replace(/\s+/g, '_')}`,
            createdAt: new Date().toISOString(),
        };
        const resp = await fetch(`${PLUGPORT_URL}/api/v1/collections/pag_edges/insertMany`, {
            method: 'POST', headers,
            body: JSON.stringify({ documents: [doc] }),
        });
        const data = await resp.json();
        return { ok: resp.ok, result: resp.ok ? { edge: doc, raw: data } : data };
    }

    if (tool === 'explore') {
        const { start, limit = 100 } = args as { start: string | string[]; limit: number };
        const startIds = Array.isArray(start) ? start : [start];
        const resp = await fetch(`${PLUGPORT_URL}/api/v1/collections/pag_edges/find`, {
            method: 'POST', headers,
            body: JSON.stringify({
                filter: { $or: [{ from: { $in: startIds } }, { to: { $in: startIds } }] },
                limit,
            }),
        });
        const data = await resp.json();
        return { ok: resp.ok, result: data };
    }

    // anchor_now and verify_memory require the MCP server locally — show a helpful message
    if (tool === 'anchor_now' || tool === 'verify_memory') {
        return {
            ok: false,
            result: {
                error: 'This tool requires local MCP server access with MONAD_RPC_URL and ANCHOR_CONTRACT configured.',
                hint: 'Install the MCP server locally and run it from your AI host (Claude Desktop, Cursor, etc.) to use on-chain anchoring and verification.',
                docs: 'https://wiki-agent-graph.plugport.wtf',
            },
        };
    }

    return { ok: false, result: { error: `Unknown tool: ${tool}` } };
}

export default function Playground() {
    const [apiKey, setApiKey] = useState('');
    const [activeTool, setActiveTool] = useState(TOOLS[0].name);
    const [args, setArgs] = useState<Record<string, string>>({});
    const [running, setRunning] = useState(false);
    const [response, setResponse] = useState<{ ok: boolean; result: unknown } | null>(null);

    const tool = TOOLS.find((t) => t.name === activeTool)!;

    const run = useCallback(async () => {
        if (!apiKey.trim()) {
            setResponse({ ok: false, result: { error: 'Please enter your PlugPort API key above.' } });
            return;
        }
        setRunning(true);
        setResponse(null);
        try {
            const parsedArgs: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(args)) {
                if (!v.trim()) continue;
                try { parsedArgs[k] = JSON.parse(v); }
                catch { parsedArgs[k] = v; }
            }
            const result = await callPlugPort(apiKey, activeTool, parsedArgs);
            setResponse(result);
        } catch (e) {
            setResponse({ ok: false, result: { error: String(e) } });
        } finally {
            setRunning(false);
        }
    }, [apiKey, activeTool, args]);

    const selectTool = (name: string) => {
        setActiveTool(name);
        setArgs({});
        setResponse(null);
    };

    const status = response === null ? 'idle' : response.ok ? 'ok' : 'err';
    const statusText = { idle: 'Waiting', ok: '200 OK', err: 'Error' }[status];

    return (
        <div>
            {/* API Key bar */}
            <div className="api-key-bar">
                <label htmlFor="api-key">API Key</label>
                <input
                    id="api-key"
                    className="api-key-input"
                    type="password"
                    placeholder="pp_your_key_here"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                />
                <span className="api-key-hint">
                    Get a key at{' '}
                    <a href="https://testnet.plugport.wtf" target="_blank" rel="noopener">
                        testnet.plugport.wtf
                    </a>{' '}
                    → API Keys → Legacy Keys
                </span>
            </div>

            <div className="playground-layout">
                {/* Tool sidebar */}
                <div className="tool-sidebar">
                    <div className="tool-sidebar-title">Tools</div>
                    {TOOLS.map((t) => (
                        <button
                            key={t.name}
                            className={`tool-btn${activeTool === t.name ? ' active' : ''}`}
                            onClick={() => selectTool(t.name)}
                        >
                            {t.name}
                            {t.badge && (
                                <span className={`tool-badge ${t.badge}`}>
                                    {t.badge === 'anchoring' ? '⛓' : '🕸'}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Tool panel */}
                <div className="tool-panel">
                    {/* Tool card */}
                    <div className="tool-card">
                        <div className="tool-card-header">
                            <div>
                                <div className="tool-card-name">{tool.name}</div>
                                <div className="tool-card-desc">{tool.description}</div>
                            </div>
                            {tool.badge && (
                                <span className={`tool-badge ${tool.badge}`} style={{ marginLeft: 'auto', flexShrink: 0 }}>
                                    {tool.badge === 'anchoring' ? '⛓ Anchoring' : '🕸 Graph'}
                                </span>
                            )}
                        </div>

                        <div className="tool-card-body">
                            {tool.requiresAnchor && (
                                <div style={{
                                    background: 'var(--yellow-dim)',
                                    border: '1px solid var(--yellow)',
                                    borderRadius: 'var(--radius)',
                                    padding: '10px 14px',
                                    fontSize: '0.8rem',
                                    color: 'var(--yellow)',
                                    lineHeight: 1.55,
                                }}>
                                    ⚠️ This tool requires a locally running MCP server with{' '}
                                    <code>MONAD_RPC_URL</code> and <code>ANCHOR_CONTRACT</code> configured.
                                    The browser playground will show a descriptive error instead.
                                </div>
                            )}

                            {tool.params.length === 0 && (
                                <div style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>
                                    No parameters — click Run to execute.
                                </div>
                            )}

                            {tool.params.map((p) => (
                                <div key={p.name} className="field-row">
                                    <div className="field-label">
                                        <span className="field-name">{p.name}</span>
                                        <span className="field-type">{p.type}</span>
                                        {p.required && <span className="field-req">required</span>}
                                    </div>
                                    <div className="field-desc">{p.description}</div>
                                    {p.type === 'string' && !p.name.includes('entities') && !p.name.includes('relations') && !p.name.includes('tags') ? (
                                        <input
                                            className="field-input"
                                            placeholder={p.default ?? `Enter ${p.name}…`}
                                            value={args[p.name] ?? ''}
                                            onChange={(e) => setArgs({ ...args, [p.name]: e.target.value })}
                                            spellCheck={false}
                                        />
                                    ) : (
                                        <textarea
                                            className="field-input"
                                            rows={p.type.includes('array') || p.type.includes('object') ? 3 : 1}
                                            placeholder={p.default ?? (p.type.includes('array') ? `[…]` : p.type.includes('object') ? `{…}` : p.default ?? '')}
                                            value={args[p.name] ?? ''}
                                            onChange={(e) => setArgs({ ...args, [p.name]: e.target.value })}
                                            spellCheck={false}
                                        />
                                    )}
                                    {p.default && (
                                        <div className="field-hint">Default: {p.default}</div>
                                    )}
                                </div>
                            ))}

                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                <button className="run-btn" onClick={run} disabled={running}>
                                    {running ? (
                                        <>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                                            </svg>
                                            Running…
                                        </>
                                    ) : (
                                        <>
                                            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                                <path d="M3 2l10 6-10 6V2z"/>
                                            </svg>
                                            Run
                                        </>
                                    )}
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.8rem', padding: '8px 14px' }}
                                    onClick={() => {
                                        const eg = tool.exampleArgs;
                                        const next: Record<string, string> = {};
                                        for (const [k, v] of Object.entries(eg)) {
                                            next[k] = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
                                        }
                                        setArgs(next);
                                        setResponse(null);
                                    }}
                                >
                                    Load example
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Response panel */}
                    <div className="response-panel">
                        <div className="response-header">
                            <span className="response-title">Response</span>
                            <span className={`response-status ${status}`}>{statusText}</span>
                        </div>
                        <div className={`response-body${response === null ? ' example' : ''}`}>
                            {response === null
                                ? 'Run a tool to see the live response here.\n\nExample response:\n\n' + tool.exampleResponse
                                : JSON.stringify(response.result, null, 2)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
