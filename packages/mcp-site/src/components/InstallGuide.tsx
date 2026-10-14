'use client';

import { useState } from 'react';
import { ENV_VARS } from '@/data/tools';

type CopyState = Record<string, boolean>;

const CLIENTS = [
    { id: 'claude-desktop', icon: '🤖', label: 'Claude Desktop' },
    { id: 'cursor',         icon: '⚡', label: 'Cursor' },
    { id: 'windsurf',       icon: '🏄', label: 'Windsurf' },
    { id: 'claude-code',    icon: '💻', label: 'Claude Code' },
    { id: 'custom',         icon: '🛠️', label: 'Custom Agent' },
];

const REPO_PATH = '/path/to/plugport-agent-graph';
const BIN_PATH  = `${REPO_PATH}/packages/mcp/dist/index.js`;
const ENV_BLOCK = {
    PLUGPORT_URL:       'https://testnet.plugport.wtf',
    PLUGPORT_API_KEY:   'pp_your_key_here',
    PAG_GRAPH:          'default',
    MONAD_RPC_URL:      'https://testnet-rpc.monad.xyz',
    ANCHOR_CONTRACT:    '0x12a49Ee0c56dA65Eb519cC612Ee4D3A4A089c1f4',
    ANCHOR_PRIVATE_KEY: '0x...',
    EXPLORER_TX_URL:    'https://testnet.monadscan.com/tx/',
};

function Code({ lang, code, id, copies, setCopies }: {
    lang: string; code: string; id: string;
    copies: CopyState; setCopies: (s: CopyState) => void;
}) {
    const copy = () => {
        navigator.clipboard.writeText(code).then(() => {
            setCopies({ ...copies, [id]: true });
            setTimeout(() => setCopies({ ...copies, [id]: false }), 1500);
        });
    };
    return (
        <div className="code-block">
            <div className="code-header">
                <span className="code-label">{lang}</span>
                <button className={`copy-btn${copies[id] ? ' copied' : ''}`} onClick={copy}>
                    {copies[id] ? '✓ Copied' : 'Copy'}
                </button>
            </div>
            <pre className="code-pre"><code>{code}</code></pre>
        </div>
    );
}

function ClaudeDesktopGuide({ copies, setCopies }: { copies: CopyState; setCopies: (s: CopyState) => void }) {
    const configPath = '~/Library/Application Support/Claude/claude_desktop_config.json';
    const envJson = JSON.stringify(ENV_BLOCK, null, 6).split('\n').map((l, i) => i === 0 ? l : '    ' + l).join('\n');
    const config = `{
  "mcpServers": {
    "plugport-agent-graph": {
      "command": "node",
      "args": ["${BIN_PATH}"],
      "env": ${envJson}
    }
  }
}`;
    return (
        <div className="install-steps">
            <div className="step-card">
                <div className="step-header"><span className="step-num">1</span><span className="step-title">Build the MCP package</span></div>
                <div className="step-body">
                    <p className="step-desc">Clone the repo and build once. Subsequent runs rebuild automatically.</p>
                    <Code lang="bash" id="cd-build" copies={copies} setCopies={setCopies} code={`git clone https://github.com/PlugPort-Protocol/plugport-agent-graph.git
cd plugport-agent-graph
pnpm install
pnpm --filter @pag/core build
pnpm --filter @pag/mcp build`} />
                </div>
            </div>
            <div className="step-card">
                <div className="step-header"><span className="step-num">2</span><span className="step-title">Edit Claude Desktop config</span></div>
                <div className="step-body">
                    <p className="step-desc">Open <code>{configPath}</code> (create it if it doesn't exist) and merge in the following. Replace the <code>args</code> path with the absolute path on your machine.</p>
                    <Code lang="json" id="cd-config" copies={copies} setCopies={setCopies} code={config} />
                </div>
            </div>
            <div className="step-card">
                <div className="step-header"><span className="step-num">3</span><span className="step-title">Restart Claude Desktop</span></div>
                <div className="step-body">
                    <p className="step-desc">Fully quit and reopen Claude Desktop. You should see <strong>plugport-agent-graph</strong> listed under connected MCP servers in the settings panel. Try: <em>"Remember that our API runs on port 8080."</em></p>
                </div>
            </div>
        </div>
    );
}

function CursorGuide({ copies, setCopies }: { copies: CopyState; setCopies: (s: CopyState) => void }) {
    const config = `{
  "mcpServers": {
    "plugport-agent-graph": {
      "command": "node",
      "args": ["${BIN_PATH}"]
    }
  }
}`;
    return (
        <div className="install-steps">
            <div className="step-card">
                <div className="step-header"><span className="step-num">1</span><span className="step-title">Build the MCP package</span></div>
                <div className="step-body">
                    <Code lang="bash" id="cur-build" copies={copies} setCopies={setCopies} code={`git clone https://github.com/PlugPort-Protocol/plugport-agent-graph.git
cd plugport-agent-graph
cp .env.example .env   # fill in PLUGPORT_URL and PLUGPORT_API_KEY
pnpm install && pnpm --filter @pag/core build && pnpm --filter @pag/mcp build`} />
                </div>
            </div>
            <div className="step-card">
                <div className="step-header"><span className="step-num">2</span><span className="step-title">Add MCP server in Cursor</span></div>
                <div className="step-body">
                    <p className="step-desc">Go to <strong>Cursor Settings → Features → MCP → + Add New MCP Server</strong>. Or edit <code>~/.cursor/mcp.json</code> directly:</p>
                    <Code lang="json" id="cur-config" copies={copies} setCopies={setCopies} code={config} />
                    <p className="step-desc" style={{ marginTop: '12px' }}>Cursor reads <code>.env</code> from the repo root automatically, so no need to duplicate env vars here.</p>
                </div>
            </div>
            <div className="step-card">
                <div className="step-header"><span className="step-num">3</span><span className="step-title">Reload and verify</span></div>
                <div className="step-body">
                    <p className="step-desc">Reload Cursor (Cmd+Shift+P → <em>Reload Window</em>). In a chat, type: <em>"Use the remember tool to save that our DB is PostgreSQL 17."</em></p>
                </div>
            </div>
        </div>
    );
}

function WindsurfGuide({ copies, setCopies }: { copies: CopyState; setCopies: (s: CopyState) => void }) {
    const config = `{
  "mcpServers": {
    "plugport-agent-graph": {
      "command": "node",
      "args": ["${BIN_PATH}"],
      "env": {
        "PLUGPORT_URL": "https://testnet.plugport.wtf",
        "PLUGPORT_API_KEY": "pp_your_key_here"
      }
    }
  }
}`;
    return (
        <div className="install-steps">
            <div className="step-card">
                <div className="step-header"><span className="step-num">1</span><span className="step-title">Build the MCP package</span></div>
                <div className="step-body">
                    <Code lang="bash" id="ws-build" copies={copies} setCopies={setCopies} code={`git clone https://github.com/PlugPort-Protocol/plugport-agent-graph.git
cd plugport-agent-graph && pnpm install
pnpm --filter @pag/core build && pnpm --filter @pag/mcp build`} />
                </div>
            </div>
            <div className="step-card">
                <div className="step-header"><span className="step-num">2</span><span className="step-title">Edit Windsurf MCP config</span></div>
                <div className="step-body">
                    <p className="step-desc">Open <strong>Windsurf Settings → Cascade → MCP Servers</strong> and add:</p>
                    <Code lang="json" id="ws-config" copies={copies} setCopies={setCopies} code={config} />
                </div>
            </div>
            <div className="step-card">
                <div className="step-header"><span className="step-num">3</span><span className="step-title">Restart Cascade</span></div>
                <div className="step-body">
                    <p className="step-desc">Restart the Cascade AI panel. The <strong>plugport-agent-graph</strong> server will appear in the MCP tools list. Test with: <em>"Remember that we use Windsurf for AI-assisted coding."</em></p>
                </div>
            </div>
        </div>
    );
}

function ClaudeCodeGuide({ copies, setCopies }: { copies: CopyState; setCopies: (s: CopyState) => void }) {
    return (
        <div className="install-steps">
            <div className="step-card">
                <div className="step-header"><span className="step-num">1</span><span className="step-title">Build the package</span></div>
                <div className="step-body">
                    <Code lang="bash" id="cc-build" copies={copies} setCopies={setCopies} code={`git clone https://github.com/PlugPort-Protocol/plugport-agent-graph.git
cd plugport-agent-graph && pnpm install
pnpm --filter @pag/core build && pnpm --filter @pag/mcp build`} />
                </div>
            </div>
            <div className="step-card">
                <div className="step-header"><span className="step-num">2</span><span className="step-title">Register with Claude Code CLI</span></div>
                <div className="step-body">
                    <p className="step-desc">Use the <code>claude mcp add</code> command to register the server globally:</p>
                    <Code lang="bash" id="cc-add" copies={copies} setCopies={setCopies} code={`claude mcp add plugport-agent-graph \\
  node ${BIN_PATH} \\
  --env PLUGPORT_URL=https://testnet.plugport.wtf \\
  --env PLUGPORT_API_KEY=pp_your_key_here`} />
                </div>
            </div>
            <div className="step-card">
                <div className="step-header"><span className="step-num">3</span><span className="step-title">Verify</span></div>
                <div className="step-body">
                    <Code lang="bash" id="cc-verify" copies={copies} setCopies={setCopies} code={`claude mcp list
# plugport-agent-graph   node ${BIN_PATH}`} />
                    <p className="step-desc" style={{ marginTop: '10px' }}>Then in any Claude Code session: <em>"recall my last three memories about this project."</em></p>
                </div>
            </div>
        </div>
    );
}

function CustomGuide({ copies, setCopies }: { copies: CopyState; setCopies: (s: CopyState) => void }) {
    return (
        <div className="install-steps">
            <div className="step-card">
                <div className="step-header"><span className="step-num">1</span><span className="step-title">Build and run directly</span></div>
                <div className="step-body">
                    <Code lang="bash" id="custom-run" copies={copies} setCopies={setCopies} code={`# Build once
pnpm install && pnpm --filter @pag/core build && pnpm --filter @pag/mcp build

# Run (reads .env from repo root automatically)
node packages/mcp/dist/index.js

# Or via workspace script
pnpm mcp`} />
                </div>
            </div>
            <div className="step-card">
                <div className="step-header"><span className="step-num">2</span><span className="step-title">Connect via stdio transport</span></div>
                <div className="step-body">
                    <p className="step-desc">The server speaks the MCP protocol over <strong>stdin/stdout</strong>. Spawn it as a child process from your agent runtime and pipe JSON-RPC messages. Example using the MCP TypeScript SDK:</p>
                    <Code lang="typescript" id="custom-sdk" copies={copies} setCopies={setCopies} code={`import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['/path/to/plugport-agent-graph/packages/mcp/dist/index.js'],
  env: {
    PLUGPORT_URL: 'https://testnet.plugport.wtf',
    PLUGPORT_API_KEY: 'pp_your_key',
  },
});

const client = new Client({ name: 'my-agent', version: '1.0.0' }, {});
await client.connect(transport);

const result = await client.callTool('remember', {
  text: 'User prefers dark mode.',
});`} />
                </div>
            </div>
            <div className="step-card">
                <div className="step-header"><span className="step-num">3</span><span className="step-title">Environment variables</span></div>
                <div className="step-body">
                    <p className="step-desc">Set these in the process environment or in a <code>.env</code> file at the repo root:</p>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="env-table">
                            <thead>
                                <tr>
                                    <th>Variable</th>
                                    <th>Required</th>
                                    <th>Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ENV_VARS.map((v) => (
                                    <tr key={v.name}>
                                        <td><span className="env-name">{v.name}</span><br /><span className="env-example">{v.example}</span></td>
                                        <td><span className={`env-req ${v.required ? 'yes' : 'no'}`}>{v.required ? 'Required' : 'Optional'}</span></td>
                                        <td><span className="env-desc">{v.description}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function InstallGuide() {
    const [activeClient, setActiveClient] = useState('claude-desktop');
    const [copies, setCopies] = useState<CopyState>({});

    const guide = (id: string) => {
        const props = { copies, setCopies };
        if (id === 'claude-desktop') return <ClaudeDesktopGuide {...props} />;
        if (id === 'cursor')         return <CursorGuide {...props} />;
        if (id === 'windsurf')       return <WindsurfGuide {...props} />;
        if (id === 'claude-code')    return <ClaudeCodeGuide {...props} />;
        return <CustomGuide {...props} />;
    };

    return (
        <div className="install-layout">
            <div className="client-sidebar">
                <div className="client-sidebar-title">MCP Client</div>
                {CLIENTS.map((c) => (
                    <button
                        key={c.id}
                        className={`client-btn${activeClient === c.id ? ' active' : ''}`}
                        onClick={() => setActiveClient(c.id)}
                    >
                        <span className="client-icon">{c.icon}</span>
                        {c.label}
                    </button>
                ))}
            </div>
            <div>{guide(activeClient)}</div>
        </div>
    );
}
