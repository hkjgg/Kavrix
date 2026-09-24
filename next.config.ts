import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `next dev` would otherwise append its agent-rules block to CLAUDE.md,
  // which is the project's curated spec, not a generated file.
  agentRules: false,
  // The certificate route reads its fonts from disk at request time; a path
  // built from `process.cwd()` is invisible to file tracing, so name them.
  outputFileTracingIncludes: {
    '/api/certificate': ['./assets/fonts/*.woff'],
    '/api/connector': ['./connector/KavrixConnector.mq5'],
  },
};

export default nextConfig;
