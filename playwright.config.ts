import { defineConfig, devices } from '@playwright/test';

/* E2E auf iPhone-Breite (390 px). Die App wird vorher gebaut (npm run build). */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  fullyParallel: true,
  // Ein Worker: mehrere Tests nutzen denselben lokalen Server mit Datenbank (Nutzer anlegen, zurücksetzen)
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4180',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: true,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    serviceWorkers: 'block'
  },
  projects: [
    { name: 'chromium-iphone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'webkit-iphone', use: { ...devices['Desktop Safari'], viewport: { width: 390, height: 844 }, hasTouch: true } }
  ],
  // Simulierte App-Schlüssel für Oura, damit „Verbinden“ im Test bis zum Erlaubnis-Bildschirm führt (der Anbieter selbst wird abgefangen)
  webServer: { command: 'node scripts/test-server.mjs 4180', port: 4180, reuseExistingServer: false, timeout: 30000, env: { DB_FILE: ':memory:', WORKER_ENV: JSON.stringify({ OURA_CLIENT_ID: 'test-id', OURA_CLIENT_SECRET: 'test-secret', DROPBOX_APP_KEY: 'test-dk', DROPBOX_APP_SECRET: 'test-ds', SIGNUP_PER_IP: '100000', SIGNUP_PER_HOUR: '100000' }) } }
});
