'use client';

export default function Nav() {
    return (
        <nav className="nav">
            <div className="nav-logo">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                    <circle cx="11" cy="11" r="10" stroke="#7c5cfc" strokeWidth="1.5" />
                    <circle cx="11" cy="11" r="4" fill="#7c5cfc" opacity="0.7" />
                    <line x1="11" y1="1" x2="11" y2="6" stroke="#7c5cfc" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="11" y1="16" x2="11" y2="21" stroke="#7c5cfc" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="1" y1="11" x2="6" y2="11" stroke="#7c5cfc" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="16" y1="11" x2="21" y2="11" stroke="#7c5cfc" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                PlugPort Agent Graph
                <span className="nav-pill">MCP</span>
            </div>
            <div className="nav-links">
                <a className="nav-link" href="https://wiki-agent-graph.plugport.wtf" target="_blank" rel="noopener">Docs</a>
                <a className="nav-link" href="https://testnet.plugport.wtf" target="_blank" rel="noopener">PlugPort</a>
            </div>
            <a
                className="btn-github"
                href="https://github.com/PlugPort-Protocol/plugport-agent-graph"
                target="_blank"
                rel="noopener"
            >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
                </svg>
                GitHub
            </a>
        </nav>
    );
}
