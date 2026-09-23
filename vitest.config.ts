import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Project root, so `@/…` imports resolve in tests exactly as they do in Next. */
const root = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');

const include = [
  'lib/**/*.test.ts',
  'lib/**/*.test.tsx',
  'components/**/*.test.ts',
  'components/**/*.test.tsx',
  'app/**/*.test.tsx',
];

/** The engine's stopwatch (§16). It measures wall-clock time, so it runs alone. */
const benchmark = 'lib/engine/performance.test.ts';

export default defineConfig({
  resolve: {
    alias: { '@': root },
  },
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: { name: 'unit', include, exclude: [benchmark], sequence: { groupOrder: 0 } },
      },
      {
        // Started only once every other file has finished: timed next to
        // thirty workers building the demo, the benchmark measures the
        // container, not the engine.
        extends: true,
        test: { name: 'benchmark', include: [benchmark], sequence: { groupOrder: 1 } },
      },
    ],
  },
});
