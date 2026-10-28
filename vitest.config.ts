import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'server/test/**/*.test.ts'],
    // Bound CPU-heavy simulations so workers can report progress without RPC starvation.
    maxWorkers: 2,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 60000
  }
});
