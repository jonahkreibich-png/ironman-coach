# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auftrag13.spec.ts >> mit Server >> Dropbox im Fehlerzustand: „Fehler“ statt „nicht verbunden“, Grund, Hilfe, letzte Datei, Jetzt abrufen
- Location: tests\e2e\auftrag13.spec.ts:11:3

# Error details

```
Error: apiResponse.json: Response has been disposed
```

# Test source

```ts
  1  | /* Auftrag 13 (Punkt 1 und 3): Verbindungen zeigen Fehler mit Grund, letzte Datei, letzten Abruf und „Jetzt abrufen“; Trends im Fortschritt. */
  2  | import { test, expect } from '@playwright/test';
  3  | import { seed, open } from './helpers';
  4  | 
  5  | const DBX_ERROR = { id: 'dropbox', label: 'Dropbox (HealthFit)', kind: 'oauth', availability: 'ready', configured: true, status: 'error', lastSyncAt: Date.parse('2026-10-14T05:15:00Z'), lastOkAt: Date.parse('2026-10-13T18:00:00Z'),
  6  |   error: 'Der HealthFit-Ordner ist in deiner Dropbox nicht zu finden. Entweder hat HealthFit noch nichts exportiert (in HealthFit: Automatischer Export → Dropbox einschalten), oder die Dropbox-App des Servers hat nur Zugriff auf ihren eigenen Ordner („App folder“) statt auf die ganze Dropbox.',
  7  |   stats: { errorCode: 'folder', lastFile: { name: '2026-10-13-171500-Laufen-Apple Watch von Jonah.fit', at: '2026-10-13T17:15:00Z' }, folder: null }, secrets: [] };
  8  | 
  9  | test.describe('mit Server', () => {
  10 |   test.skip(({ browserName }) => browserName === 'webkit', 'Server-Abläufe einmal reichen (Chromium)');
  11 |   test('Dropbox im Fehlerzustand: „Fehler“ statt „nicht verbunden“, Grund, Hilfe, letzte Datei, Jetzt abrufen', async ({ page, request }) => {
  12 |     await request.post('/__reset');
  13 |     await seed(page);
  14 |     await open(page, '/?go=daten');
  15 |     await page.locator('summary', { hasText: 'Ich habe schon ein Konto' }).click(); await page.locator('summary', { hasText: 'Einrichtungscode' }).click();
  16 |     await page.locator('[data-act="sync-setup"]').click();
  17 |     await expect(page.locator('[data-sync-status]').first()).toBeVisible();
  18 |     let syncCalls = 0;
> 19 |     await page.route('**/api/connections', async r => { const real = await (await r.fetch()).json(); real.connections = real.connections.map((c: any) => c.id === 'dropbox' ? DBX_ERROR : c); await r.fulfill({ json: real }); });
     |                                                                                              ^ Error: apiResponse.json: Response has been disposed
  20 |     await page.route('**/api/connect/dropbox/sync', r => { syncCalls++; return r.fulfill({ status: 404, json: { error: DBX_ERROR.error } }); });
  21 |     await open(page, '/?go=mehr&open=verbindungen');
  22 |     const row = page.locator('[data-act="conn-open"][data-id="dropbox"]');
  23 |     await expect(row).toHaveAttribute('data-state', 'error');
  24 |     await expect(row).toContainText('Fehler');
  25 |     await expect(row).not.toContainText('nicht verbunden');
  26 |     await row.click();
  27 |     await expect(page.locator('[data-conn-state]')).toContainText('Fehler');
  28 |     await expect(page.locator('[data-conn-check]')).toContainText('fehlgeschlagen');
  29 |     await expect(page.locator('[data-conn-file]')).toContainText('Laufen-Apple Watch');
  30 |     await expect(page.locator('[data-conn-error="folder"]')).toContainText('HealthFit-Ordner');
  31 |     await expect(page.locator('#sheetPanel')).toContainText('Automatischer Export');
  32 |     await expect(page.locator('#sheetPanel')).toContainText('Full Dropbox'); // Betreiber sieht, was an der Dropbox-App zu ändern ist
  33 |     await expect(page.locator('#sheetPanel summary', { hasText: 'HealthFit → intervals.icu' })).toBeVisible();
  34 |     await page.locator('#sheetPanel [data-act="conn-sync"]').click();
  35 |     await expect.poll(() => syncCalls).toBe(1);
  36 |     // „Neu verbinden“ (nach neuer Dropbox-App nötig), aber kein „Verbinden“, das so tut, als wäre nichts verbunden
  37 |     await expect(page.locator('#sheetPanel [data-act="conn-start"]')).toHaveText('Neu verbinden');
  38 |   });
  39 | });
  40 | 
  41 | test('Trends: Zeitraum umschalten, Karte antippen zeigt Verlauf, zu wenig Daten → „ab X verfügbar“', async ({ page }) => {
  42 |   await seed(page);
  43 |   await open(page, '/?go=fortschritt');
  44 |   const per = page.locator('[data-trend-period]');
  45 |   await expect(per.locator('button.on')).toHaveText('4 Wochen');
  46 |   for (const g of ['recovery', 'fitness', 'efficiency', 'intensity', 'bests', 'long', 'relations']) await expect(page.locator(`[data-tgroup="${g}"]`)).toBeVisible();
  47 |   await expect(page.locator('.tcard.locked').first()).toContainText(/ab \d+ .* verfügbar/);
  48 |   await per.locator('button', { hasText: '3 Monate' }).click();
  49 |   await expect(page.locator('[data-trend-period] button.on')).toHaveText('3 Monate');
  50 |   expect(await page.evaluate(() => localStorage.getItem('trendPeriod'))).toBe('3m');
  51 |   await page.locator('[data-act="trend-open"][data-id="hrv"]').click();
  52 |   await expect(page.locator('[data-trend-sheet="hrv"] .chart svg')).toBeVisible();
  53 |   await expect(page.locator('[data-trend-sheet="hrv"]')).toContainText('60-Tage-Basis');
  54 | });
  55 | 
```