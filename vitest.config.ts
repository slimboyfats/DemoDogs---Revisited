import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*'],
    coverage: {
      // The simulation kernel keeps at least 80% line coverage.
      provider: 'v8',
      include: ['packages/sim/src/**/*.ts'],
      exclude: ['**/*.test.ts'],
      reporter: ['text-summary'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
  },
});
