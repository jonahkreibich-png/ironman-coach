/* Auftrag 29, Punkt 1: „Abgleich fehlgeschlagen“ stand dauerhaft gelb oben.
   Ursachen im Code: (a) ein Fehler beim Neuzeichnen nach dem Abgleich (3.15.0: Startfehler) galt als Abgleich-Fehler, obwohl alles
   hochgeladen war; (b) jeder Aussetzer zeigte sofort die Meldung; (c) ein vom Server abgelehnter Datensatz blockierte für immer alles.
   Jetzt: kurze Aussetzer still nachholen, abgelehnte Einträge bleiben auf dem Gerät und blockieren den Rest nicht, Meldung nur bei echten
   Problemen, verständlich und mit „Erneut versuchen“. Keine lokalen Einträge gehen verloren. */
import { test, expect, type Page } from '@playwright/test';
import { seed, TODAY } from './helpers';

async function account(request: any) {
  await request.post('/__reset');
  return await (await request.post('/api/setup', { data: { name: 'Sync29' } })).json();
}
async function withAccount(page: Page, acc: any) {
  await page.addInitScript(a => { if (!localStorage.getItem('ec_sync_auth')) { localStorage.setItem('ec_sync_auth', JSON.stringify({ token: a.token, deviceId: a.deviceId, userId: a.userId, connectedAt: Date.now() })); localStorage.setItem('ec_owner', JSON.stringify(a.userId)); } }, acc);
}
const meta = (page: Page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('ec_sync') || '{}'); } catch (e) { return {}; } });
async function synced(page: Page) { await expect.poll(async () => { const m = await meta(page); return !!m.lastSyncAt && !Object.keys(m.pending || {}).length; }, { timeout: 30000 }).toBe(true); }
async function addHrv(page: Page, v: string, nav = true) {
  if (nav) await page.goto('/?go=werte'); await page.locator(`[data-act="checkin-open"][data-date="${TODAY}"]`).last().click();
  await page.fill('#ck-hrv', v); await page.locator('#ck-hrv').blur(); await page.keyboard.press('Escape');
}

test('Kurze Server-Aussetzer: keine Meldung, Einträge werden still nachgeholt', async ({ page, request }) => {
  test.setTimeout(90000);
  const acc = await account(request); await seed(page); await withAccount(page, acc);
  await page.goto('/'); await synced(page);
  let fail = 2;
  await page.route('**/api/sync', async route => { if (fail-- > 0) await route.fulfill({ status: 503, body: '{"error":"Server überlastet"}', contentType: 'application/json' }); else await route.continue(); });
  await addHrv(page, '61');
  // innerhalb der ersten Minute keine gelbe Meldung, danach ist alles oben
  await page.waitForTimeout(2500);
  await expect(page.locator('#global-sync-status')).toBeHidden();
  await synced(page);
  await expect(page.locator('#global-sync-status')).toBeHidden();
  const rows = await (await request.get('/__records?user=' + acc.userId)).json().catch(() => null);
  if (rows && Array.isArray(rows)) expect(rows.some((r: any) => r.kind === 'trend' && JSON.stringify(r.data).includes('61'))).toBe(true);
});

test('Server lehnt einen Datensatz ab: der Rest geht hoch, der Eintrag bleibt auf dem Gerät, Meldung mit „Erneut versuchen“', async ({ page, request }) => {
  test.setTimeout(90000);
  const acc = await account(request); await seed(page); await withAccount(page, acc);
  await page.goto('/'); await synced(page);
  let reject = true;
  await page.route('**/api/sync', async route => {
    const body = route.request().postDataJSON() || {};
    const bad = (body.changes || []).find((c: any) => c.kind === 'trend');
    if (reject && bad) await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Ungültiger Datensatz: trend/' + bad.key }) });
    else await route.continue();
  });
  await addHrv(page, '62');
  await page.goto('/?go=heute');
  // abgelehnter Eintrag liegt zurückgehalten auf dem Gerät, die Warteschlange blockiert nicht
  await expect.poll(async () => Object.keys((await meta(page)).held || {}).length, { timeout: 20000 }).toBe(1);
  await expect.poll(async () => Object.keys((await meta(page)).pending || {}).length, { timeout: 20000 }).toBe(0);
  const banner = page.locator('#global-sync-status');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('1 Eintrag konnte nicht gesichert werden');
  // lokal ist der Wert da
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('ec_state_v2') || '{}'));
  expect(st.trend.find((p: any) => p.date === '2026-10-14' || p.hrv === 62)?.hrv).toBe(62);
  // „Erneut versuchen“, Server nimmt es jetzt an
  reject = false;
  await banner.locator('[data-act="sync-retry"]').click();
  await synced(page);
  await expect.poll(async () => Object.keys((await meta(page)).held || {}).length).toBe(0);
  await expect(banner).toBeHidden();
});

test('Offline über 2 Minuten: verständliche Meldung mit Anzahl, nach dem Verbinden still weg', async ({ page, context, request }) => {
  test.setTimeout(90000);
  const acc = await account(request); await seed(page); await withAccount(page, acc);
  await page.clock.install({ time: new Date(TODAY + 'T07:30:00+02:00') });
  await page.goto('/'); await synced(page);
  await page.goto('/?go=werte');
  await context.setOffline(true);
  await addHrv(page, '63', false);
  await page.clock.fastForward(30000);
  await expect(page.locator('#global-sync-status')).toBeHidden();
  await page.clock.fastForward(150000);
  await expect(page.locator('#global-sync-status')).toContainText(/Dein letzter Eintrag ist noch nicht gesichert|Deine letzten \d+ Einträge sind noch nicht gesichert/);
  await expect(page.locator('#global-sync-status [data-act="sync-retry"]')).toBeVisible();
  await context.setOffline(false);
  await page.clock.fastForward(310000);
  await synced(page);
  await expect(page.locator('#global-sync-status')).toBeHidden();
});
