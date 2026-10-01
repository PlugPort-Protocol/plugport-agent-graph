import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // pnpm monorepo: trace server files from the repo root (packages/core is a workspace dependency)
    outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
};

export default nextConfig;
