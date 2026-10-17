/* Auftrag 13 (Punkt 1 und 3): Verbindungen zeigen Fehler mit Grund, letzte Datei, letzten Abruf und „Jetzt abrufen“; Trends im Fortschritt. */
import { test, expect } from '@playwright/test';
import { seed, open } from './helpers';

const DBX_ERROR = { id: 'dropbox', label: 'Dropbox (HealthFit)', kind: 'oauth', availability: 'ready', configured: true, status: 'error', lastSyncAt: Date.parse('2026-10-14T05:15:00Z'), lastOkAt: Date.parse('2026-10-13T18:00:00Z'),
  error: 'Der HealthFit-Ordner ist in deiner Dropbox nicht zu finden. Entweder hat HealthFit noch nichts exportiert (in HealthFit: Automatischer Export → Dropbox einschalten), oder die Dropbox-App des Servers hat nur Zugriff auf ihren eigenen Ordner („App folder“) statt auf die ganze Dropbox.',
  stats: { errorCode: 'folder', lastFile: { name: '2026-10-13-171500-Laufen-Apple Watch von Jonah.fit', at: '2026-10-13T17:15:00Z' }, folder: null }, secrets: [] };

test.describe('mit Server', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'Server-Abläufe einmal reichen (Chromium)');
  test('Dropbox im Fehlerzustand: „Fehler“ statt „nicht verbunden“, Grund, Hilfe, letzte Datei, Jetzt abrufen', async ({ page, request }) => {
    await request.post('/__reset');
    await seed(page);
    await open(page, '/?go=daten');
    await page.locator('summary', { hasText: 'Ich habe schon ein Konto' }).click(); await page.locator('summary', { hasText: 'Einrichtungscode' }).click();
    await page.locator('[data-act="sync-setup"]').click();
    await expect(page.locator('[data-sync-status]').first()).toBeVisible();
    let syncCalls = 0;
    await page.route('**/api/connections', async r => { const real = await (await r.fetch()).json(); real.connections = real.connections.map((c: any) => c.id === 'dropbox' ? DBX_ERROR : c); await r.fulfill({ json: real }); });
    await page.route('**/api/connect/dropbox/sync', r => { syncCalls++; return r.fulfill({ status: 404, json: { error: DBX_ERROR.error } }); });
    await open(page, '/?go=mehr&open=verbindungen');
    const row = page.locator('[data-act="conn-open"][data-id="dropbox"]');
    await expect(row).toHaveAttribute('data-state', 'error');
    await expect(row).toContainText('Fehler');
    await expect(row).not.toContainText('nicht verbunden');
    await row.click();
    await expect(page.locator('[data-conn-state]')).toContainText('Fehler');
    await expect(page.locator('[data-conn-check]')).toContainText('fehlgeschlagen');
    await expect(page.locator('[data-conn-file]')).toContainText('Laufen-Apple Watch');
    await expect(page.locator('[data-conn-error="folder"]')).toContainText('HealthFit-Ordner');
    await expect(page.locator('#sheetPanel')).toContainText('Automatischer Export');
    await expect(page.locator('#sheetPanel')).toContainText('Full Dropbox'); // Betreiber sieht, was an der Dropbox-App zu ändern ist
    await expect(page.locator('#sheetPanel summary', { hasText: 'HealthFit → intervals.icu' })).toBeVisible();
    await page.locator('#sheetPanel [data-act="conn-sync"]').click();
    await expect.poll(() => syncCalls).toBe(1);
    // „Neu verbinden“ (nach neuer Dropbox-App nötig), aber kein „Verbinden“, das so tut, als wäre nichts verbunden
    await expect(page.locator('#sheetPanel [data-act="conn-start"]')).toHaveText('Neu verbinden');
  });
});

test('Trends: Zeitraum umschalten, Karte antippen zeigt Verlauf, zu wenig Daten → „ab X verfügbar“', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=fortschritt');
  const per = page.locator('[data-trend-period]');
  await expect(per.locator('button.on')).toHaveText('4 Wochen');
  for (const g of ['recovery', 'fitness', 'efficiency', 'intensity', 'bests', 'long', 'relations']) await expect(page.locator(`[data-tgroup="${g}"]`)).toBeVisible();
  await expect(page.locator('.tcard.locked').first()).toContainText(/ab \d+ .* verfügbar/);
  await per.locator('button', { hasText: '3 Monate' }).click();
  await expect(page.locator('[data-trend-period] button.on')).toHaveText('3 Monate');
  expect(await page.evaluate(() => localStorage.getItem('trendPeriod'))).toBe('3m');
  await page.locator('[data-act="trend-open"][data-id="hrv"]').click();
  await expect(page.locator('[data-trend-sheet="hrv"] .chart svg')).toBeVisible();
  await expect(page.locator('[data-trend-sheet="hrv"]')).toContainText('60-Tage-Basis');
});
