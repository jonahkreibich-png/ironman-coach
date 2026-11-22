import { defineConfig, devices } from '@playwright/test';
import { generateKeyPairSync } from 'node:crypto';

/* Auftrag 36: die ~40 wichtigsten echten Abläufe für den großen Test (scripts/grosser-test.mjs), WebKit (iPhone) und Chromium.
   Parallel als mehrere Teile (Shards), jeder mit eigenem Test-Server und eigener Datenbank im Speicher (PW_PORT) – so stören sich
   Tests, die den Server nutzen, nicht gegenseitig. Die App wird vorher genau einmal gebaut. */
const PORT = Number(process.env.PW_PORT || 4181);
const TEST_VAPID = JSON.stringify(generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' }));
export const GROSS_FLOWS = [
  // Auftrag 39: Zeitfelder (jedes Feld), Rundgang 19 Nutzer, jeder Knopf; dazu Felder, Überlauf, Layout, Fragebogen, 60 Nutzer
  'auftrag40', 'plan-dashboard27', 'auftrag39-zeit', 'auftrag39-rundgang', 'auftrag39-knoepfe', 'auftrag29-felder', 'auftrag29-ueberlauf', 'layout', 'auftrag4', 'auftrag25-gesamt', 'auftrag15-many',
  // Auftrag 38: ganze Einheit, Gemachtes überall, Satz-Fenster, Umwandeln-Vorschau; Auftrag 37: Ablauf, Fenster, Rückgängig, Nachtragen
  'auftrag38', 'auftrag37', 'auftrag22', 'dashboard-extra27', 'auftrag36-intervalle', 'auftrag36-ablaeufe', 'auftrag35-umwandeln', 'auftrag35-km', 'auftrag35-abschnitte', 'auftrag31-coach', 'auftrag30-plan', 'app', 'strength-templates'
];
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: GROSS_FLOWS.map(f => `**/${f}.spec.ts`),
  timeout: 90000,
  fullyParallel: true,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: `test-results/gross-pw-${PORT}.json` }]],
  outputDir: `test-results/gross-pw-${PORT}`,
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true, locale: 'de-DE', timezoneId: 'Europe/Berlin', serviceWorkers: 'block' },
  projects: [
    { name: 'chromium-iphone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'webkit-iphone', use: { ...devices['Desktop Safari'], viewport: { width: 390, height: 844 }, hasTouch: true } }
  ],
  webServer: { command: `node scripts/test-server.mjs ${PORT}`, port: PORT, reuseExistingServer: false, timeout: 30000, env: { DB_FILE: ':memory:', WORKER_ENV: JSON.stringify({ OURA_CLIENT_ID: 'test-id', OURA_CLIENT_SECRET: 'test-secret', DROPBOX_APP_KEY: 'test-dk', DROPBOX_APP_SECRET: 'test-ds', SIGNUP_PER_IP: '100000', SIGNUP_PER_HOUR: '100000', VAPID_PRIVATE_JWK: TEST_VAPID }) } }
});
