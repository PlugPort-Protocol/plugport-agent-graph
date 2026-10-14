'use client';

import { useState } from 'react';
import Nav from '@/components/Nav';
import InstallGuide from '@/components/InstallGuide';
import Playground from '@/components/Playground';
import { TOOLS } from '@/data/tools';

export default function Home() {
    const [tab, setTab] = useState<'install' | 'playground'>('install');

    return (
        <>
            <Nav />

            {/* ── Hero ─────────────────────────────────────────────────────── */}
            <section className="hero">
                <div className="hero-eyebrow">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                        <circle cx="5" cy="5" r="5" />
                    </svg>
                    Model Context Protocol · stdio transport
                </div>
                <h1 className="hero-title">
                    Verifiable Memory for<br />Any AI Agent or IDE
                </h1>
                <p className="hero-subtitle">
                    A seven-tool MCP server that gives Claude Desktop, Cursor, Windsurf, and custom
                    agent runtimes persistent, content-hashed memory anchored on Monad.
                </p>
                <div className="hero-cta">
                    <button
                        className="btn btn-primary"
                        onClick={() => { setTab('install'); document.getElementById('tabs')?.scrollIntoView({ behavior: 'smooth' }); }}
                    >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm3.5 7.5h-2.29l.88-2.63a.5.5 0 0 0-.95-.32l-1 3H5.5a.5.5 0 0 0 0 1h2.29l-.88 2.63a.5.5 0 0 0 .95.32l1-3H10.5a.5.5 0 0 0 0-1z"/></svg>
                        Install Guide
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={() => { setTab('playground'); document.getElementById('tabs')?.scrollIntoView({ behavior: 'smooth' }); }}
                    >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2l10 6-10 6V2z"/></svg>
                        Try Live Playground
                    </button>
                    <a
                        className="btn btn-secondary"
                        href="https://wiki-agent-graph.plugport.wtf"
                        target="_blank"
                        rel="noopener"
                    >
                        Full Docs ↗
                    </a>
                </div>
            </section>

            {/* ── Live product showcase ──────────────────────────────────────── */}
            <div style={{
                background: 'linear-gradient(135deg, #1a1530 0%, #0f1420 100%)',
                borderTop: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
                padding: '32px 24px',
            }}>
                <div className="container" style={{ maxWidth: 800, textAlign: 'center' }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: '0.72rem',
                        fontFamily: 'var(--mono)',
                        color: 'var(--green)',
                        background: 'var(--green-dim)',
                        border: '1px solid var(--green)',
                        borderRadius: '20px',
                        padding: '3px 12px',
                        marginBottom: '16px',
                        fontWeight: 600,
                        letterSpacing: '0.05em',
                    }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulse 2s infinite' }} />
                        Live on Monad Testnet
                    </div>
                    <h2 style={{
                        fontSize: 'clamp(1.2rem, 3vw, 1.7rem)',
                        fontWeight: 700,
                        color: 'var(--text)',
                        marginBottom: 10,
                        letterSpacing: '-0.01em',
                    }}>
                        See the Agent Graph in action
                    </h2>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-2)', marginBottom: 20, lineHeight: 1.65 }}>
                        The Agent Graph Viewer visualises the live knowledge graph, entity relationships, and on-chain Merkle anchors for the DeFi demo agent running on Monad testnet.
                    </p>
                    <a
                        href="https://test-agent-graph.plugport.wtf/"
                        target="_blank"
                        rel="noopener"
                        className="btn btn-primary"
                        style={{ fontSize: '0.95rem', padding: '12px 28px', display: 'inline-flex' }}
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
                            <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm0 1a6 6 0 1 0 0 12A6 6 0 0 0 8 2zm.5 2.5v3.25l2.25 1.3-.5.87L7.5 8.25V4.5h1z"/>
                        </svg>
                        Open Testnet Agent Graph Viewer ↗
                    </a>
                    <div style={{ marginTop: 16, fontSize: '0.75rem', color: 'var(--text-3)' }}>
                        Connect via the MCP server below to write memories that appear here in real time.
                    </div>
                </div>
            </div>

            {/* ── Stats bar ─────────────────────────────────────────────────── */}
            <div className="stats">
                <div className="stat">
                    <div className="stat-value">7</div>
                    <div className="stat-label">MCP Tools</div>
                </div>
                <div className="stat">
                    <div className="stat-value">stdio</div>
                    <div className="stat-label">Transport</div>
                </div>
                <div className="stat">
                    <div className="stat-value">5</div>
                    <div className="stat-label">Supported Clients</div>
                </div>
                <div className="stat">
                    <div className="stat-value">Monad</div>
                    <div className="stat-label">Anchor Chain</div>
                </div>
                <div className="stat">
                    <div className="stat-value">MIT</div>
                    <div className="stat-label">License</div>
                </div>
            </div>

            {/* ── Architecture strip ────────────────────────────────────────── */}
            <div style={{ background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', padding: '20px 24px' }}>
                <div className="container">
                    <pre style={{
                        fontFamily: 'var(--mono)',
                        fontSize: '0.75rem',
                        color: 'var(--text-3)',
                        textAlign: 'center',
                        lineHeight: 1.7,
                        overflowX: 'auto',
                    }}>{`Claude Desktop / Cursor / Windsurf / Claude Code / Custom Agent
                        │  stdio (JSON-RPC)
                        ▼
              @pag/mcp  ─── 7 tools ──▶  @pag/core
                                              │         │
                                    PlugPort HTTP    MemoryAnchor.sol
                                      (MonadDb)     (Monad testnet)`}</pre>
                </div>
            </div>

            {/* ── Tool quick reference ──────────────────────────────────────── */}
            <div style={{ maxWidth: 1100, margin: '48px auto 0', padding: '0 24px' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>
                    7 Tools
                </h2>
                <div className="tool-ref-grid">
                    {TOOLS.map((t) => (
                        <div key={t.name} className="ref-card">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <div className="ref-card-name">{t.name}</div>
                                {t.badge && (
                                    <span className={`tool-badge ${t.badge}`}>
                                        {t.badge === 'anchoring' ? '⛓ on-chain' : '🕸 graph'}
                                    </span>
                                )}
                            </div>
                            <div className="ref-card-desc">{t.description}</div>
                            {t.params.length > 0 && (
                                <div className="ref-params">
                                    {t.params.map((p) => (
                                        <div key={p.name} className="ref-param">
                                            <span className="ref-param-name">{p.name}</span>
                                            <span style={{ color: 'var(--text-3)', fontSize: '0.72rem' }}> · {p.type}{p.required ? ' · required' : ''}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {t.params.length === 0 && (
                                <div className="ref-param" style={{ color: 'var(--text-3)' }}>No parameters</div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Main tabs ─────────────────────────────────────────────────── */}
            <div className="tabs-wrapper" id="tabs">
                <div className="tabs-bar">
                    <button
                        className={`tab-btn${tab === 'install' ? ' active' : ''}`}
                        onClick={() => setTab('install')}
                    >
                        <span className="tab-icon">📦</span>
                        Install Guide
                    </button>
                    <button
                        className={`tab-btn${tab === 'playground' ? ' active' : ''}`}
                        onClick={() => setTab('playground')}
                    >
                        <span className="tab-icon">⚡</span>
                        Live Playground
                    </button>
                </div>

                {tab === 'install'     && <InstallGuide />}
                {tab === 'playground'  && <Playground />}
            </div>

            {/* ── Footer ─────────────────────────────────────────────────────── */}
            <footer className="footer">
                <div className="container">
                    <p style={{ marginBottom: 8 }}>
                        <strong style={{ color: 'var(--text-2)' }}>PlugPort Agent Graph</strong> · MCP Server
                    </p>
                    <p>
                        <a href="https://github.com/PlugPort-Protocol/plugport-agent-graph" target="_blank" rel="noopener">GitHub</a>
                        {' · '}
                        <a href="https://wiki-agent-graph.plugport.wtf" target="_blank" rel="noopener">Docs</a>
                        {' · '}
                        <a href="https://testnet.plugport.wtf" target="_blank" rel="noopener">PlugPort Testnet</a>
                        {' · '}
                        <a href="https://plugport.wtf" target="_blank" rel="noopener">plugport.wtf</a>
                    </p>
                    <p style={{ marginTop: 12, color: 'var(--text-3)' }}>
                        MemoryAnchor.sol deployed on Monad testnet at{' '}
                        <a
                            href="https://testnet.monadscan.com/address/0x12a49Ee0c56dA65Eb519cC612Ee4D3A4A089c1f4"
                            target="_blank" rel="noopener"
                            style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem' }}
                        >
                            0x12a49Ee0c56dA65Eb519cC612Ee4D3A4A089c1f4
                        </a>
                    </p>
                </div>
            </footer>
        </>
    );
}
