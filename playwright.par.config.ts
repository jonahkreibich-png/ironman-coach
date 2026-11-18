/* Auftrag 37: alle E2E-Tests in mehreren Teilen parallel (z. B. 4 × --shard=i/4), je Teil eigener Test-Server mit eigener Datenbank im
   Speicher (PW_PORT) – sonst wie playwright.config.ts. Mit einem Arbeiter dauern die ~940 Tests rund 3 Stunden, in 4 Teilen deutlich kürzer.
   Aufruf: PW_PORT=4186 npx playwright test --config playwright.par.config.ts --shard=1/4  (je Teil ein anderer Port) */
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const PORT = Number(process.env.PW_PORT || 4185);
const ws: any = base.webServer;
export default defineConfig({
  ...base,
  testIgnore: ['**/zz-*.spec.ts'],
  outputDir: `test-results/par-${PORT}`,
  reporter: [['list'], ['json', { outputFile: `test-results/par-${PORT}.json` }]],
  use: { ...base.use, baseURL: `http://localhost:${PORT}` },
  webServer: { ...ws, command: `node scripts/test-server.mjs ${PORT}`, port: PORT }
});
