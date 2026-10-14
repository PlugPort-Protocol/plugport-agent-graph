import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'PlugPort Agent Graph MCP Server · mcp.plugport.wtf',
    description:
        'Model Context Protocol server giving any MCP-compatible AI host persistent, verifiable memory. Install guide, tool reference, and live playground.',
    openGraph: {
        title: 'PlugPort Agent Graph MCP Server',
        description: 'Persistent, verifiable AI agent memory via MCP — built on PlugPort + Monad.',
        url: 'https://mcp.plugport.wtf',
        siteName: 'PlugPort Agent Graph',
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'PlugPort Agent Graph MCP Server',
        description: 'Persistent, verifiable AI agent memory via MCP — built on PlugPort + Monad.',
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
