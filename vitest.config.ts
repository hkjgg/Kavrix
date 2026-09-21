import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Project root, so `@/…` imports resolve in tests exactly as they do in Next. */
const root = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');

export default defineConfig({
  resolve: {
    alias: { '@': root },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx'],
  },
});
