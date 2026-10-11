import { defineConfig, devices } from '@playwright/test';

/* E2E auf iPhone-Breite (390 px). Die App wird vorher gebaut (npm run build). */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  fullyParallel: true,
  workers: 2,
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
  webServer: { command: 'node scripts/test-server.mjs 4180', port: 4180, reuseExistingServer: !process.env.CI, timeout: 30000 }
});
