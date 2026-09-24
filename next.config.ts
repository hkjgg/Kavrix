import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The certificate route reads its fonts from disk at request time; a path
  // built from `process.cwd()` is invisible to file tracing, so name them.
  outputFileTracingIncludes: {
    '/api/certificate': ['./assets/fonts/*.woff'],
    '/api/connector': ['./connector/KavrixConnector.mq5'],
  },
};

export default nextConfig;
