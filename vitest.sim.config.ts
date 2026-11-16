import { defineConfig } from 'vitest/config';
/* Auftrag 36: große Simulation – eigene Konfiguration mit vielen Workern (jeder Nutzer ist unabhängig, kein Server, keine Datenbank) */
export default defineConfig({
  test: {
    include: ['tests/sim/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    pool: 'forks',
    maxWorkers: Number(process.env.SIM_WORKERS || 12),
    minWorkers: 1,
    fileParallelism: true,
    testTimeout: 1_800_000
  }
});
