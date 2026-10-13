import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
    title: 'PlugPort Agent Graph',
    tagline: 'Verifiable memory graph for AI agents — built on PlugPort + Monad',
    favicon: 'img/favicon.ico',

    // GitHub Pages deployment
    url: 'https://wiki-agent-graph.plugport.wtf',
    baseUrl: '/',
    organizationName: 'PlugPort-Protocol',
    projectName: 'plugport-agent-graph',
    trailingSlash: false,

    onBrokenLinks: 'throw',
    markdown: {
        hooks: {
            onBrokenMarkdownLinks: 'warn',
        },
    },

    i18n: {
        defaultLocale: 'en',
        locales: ['en'],
    },

    presets: [
        [
            'classic',
            {
                docs: {
                    sidebarPath: './sidebars.ts',
                    editUrl: 'https://github.com/PlugPort-Protocol/plugport-agent-graph/tree/main/docs/',
                    routeBasePath: '/',
                },
                blog: false,
                theme: {
                    customCss: './src/css/custom.css',
                },
            } satisfies Preset.Options,
        ],
    ],

    themeConfig: {
        image: 'img/plugport-social.png',
        navbar: {
            title: 'PlugPort Agent Graph',
            logo: {
                alt: 'PlugPort Logo',
                src: 'img/logo.png',
            },
            items: [
                {
                    type: 'docSidebar',
                    sidebarId: 'docsSidebar',
                    position: 'left',
                    label: 'Docs',
                },
                {
                    to: 'category/mcp-server',
                    label: 'MCP',
                    position: 'left',
                },
                {
                    to: 'category/api-reference',
                    label: 'API',
                    position: 'left',
                },
                {
                    href: 'https://wiki.plugport.wtf',
                    label: 'PlugPort Docs',
                    position: 'left',
                },
                {
                    href: 'https://test-agent-graph.plugport.wtf/',
                    label: 'Agent Graph Viewer',
                    position: 'right',
                },
                {
                    href: 'https://github.com/PlugPort-Protocol/plugport-agent-graph',
                    label: 'GitHub',
                    position: 'right',
                },
            ],
        },
        footer: {
            style: 'dark',
            links: [
                {
                    title: 'Documentation',
                    items: [
                        { label: 'Getting Started', to: 'getting-started' },
                        { label: 'Architecture', to: 'architecture' },
                        { label: 'Development Notes', to: 'notes' },
                    ],
                },
                {
                    title: 'Packages',
                    items: [
                        { label: '@pag/core', to: 'core/overview' },
                        { label: 'MCP Server', to: 'mcp/overview' },
                        { label: 'DeFi Demo Agent', to: 'agent/overview' },
                        { label: 'Web Viewer', to: 'web/overview' },
                    ],
                },
                {
                    title: 'Community',
                    items: [
                        { label: 'GitHub', href: 'https://github.com/PlugPort-Protocol/plugport-agent-graph' },
                        { label: 'X (Twitter)', href: 'https://x.com/gPlugPort' },
                        { label: 'PlugPort', href: 'https://plugport.wtf' },
                        { label: 'Monad', href: 'https://monad.xyz' },
                    ],
                },
            ],
            copyright: `Copyright ${new Date().getFullYear()} PlugPort. Built on Monad with ❤️.`,
        },
        prism: {
            theme: prismThemes.github,
            darkTheme: prismThemes.dracula,
            additionalLanguages: ['bash', 'typescript', 'json', 'yaml', 'diff', 'solidity'],
        },
        colorMode: {
            defaultMode: 'dark',
            disableSwitch: false,
            respectPrefersColorScheme: true,
        },
    } satisfies Preset.ThemeConfig,

    themes: [
        [
            '@easyops-cn/docusaurus-search-local',
            {
                hashed: true,
                indexDocs: true,
                indexPages: false,
                language: ['en'],
            },
        ],
    ],
};

export default config;
