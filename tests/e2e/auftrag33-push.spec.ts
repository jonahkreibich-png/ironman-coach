/* Auftrag 33: Mitteilungen – Anzeige richtig und Empfang bestätigt.
   Vorher: Der Mehr-Tab zeigte immer „Aus auf diesem Gerät“ (er las einen Stand, der erst auf der Seite „Mitteilungen“ geladen wurde), und
   jeder Fehler der Prüfung (kein Netz, Zeitüberschreitung) führte zu „nicht aktiv – erneut erlauben“. Der Test-Knopf meldete „unterwegs“,
   ohne zu wissen, ob die Mitteilung auf dem Gerät ankommt. */
import { test, expect, type Page } from '@playwright/test';
import { seed, open } from './helpers';
import { account, api, pushLog, fakePush, connect, decrypt } from './push-helpers';

const state = (page: Page) => page.locator('[data-push-state]').first();
const mehrRow = (page: Page) => page.locator('[data-act="go-sub"][data-sub="mitteilungen"]').first();

async function subscribed(page: Page, request: any) {
  const acc = await account(request);
  await seed(page);
  await fakePush(page, 'iphone-a', { perm: 'granted' });
  await connect(page, acc);
  return acc;
}

test('Mehr-Tab: beim Start geladen – „An auf diesem Gerät“, solange geprüft wird „Wird geprüft“, nie fälschlich „Aus“', async ({ page, request }) => {
  const acc = await subscribed(page, request);
  // Prüfung künstlich verzögern: in der Zeit darf nie „Aus“ stehen
  let release: () => void = () => {};
  const gate = new Promise<void>(r => { release = r; });
  await page.route('**/api/push/status', async route => { await gate; await route.continue(); });
  await open(page, '/?go=mehr');
  await expect(mehrRow(page)).toContainText('Wird geprüft');
  await expect(mehrRow(page)).not.toContainText('Aus');
  release();
  await expect(mehrRow(page)).toContainText('An auf diesem Gerät', { timeout: 15000 });
  expect((await api(request, acc.token, 'get', '/api/push/status')).thisDevice).toBe(true);
  // nach dem Neustart sofort richtig (letzter sicherer Stand), auch bevor die Prüfung fertig ist
  await page.unroute('**/api/push/status');
  await page.route('**/api/push/**', route => route.abort());
  await page.reload();
  await expect(mehrRow(page)).toContainText('An auf diesem Gerät');
});

test('kein Netz bzw. Zeitüberschreitung bei der Prüfung: bleibt „aktiv“, kein „Erneut erlauben“', async ({ page, request }) => {
  await subscribed(page, request);
  await open(page, '/?go=mitteilungen');
  await expect(state(page)).toHaveAttribute('data-push-state', 'on', { timeout: 15000 });
  // Server nicht erreichbar (wie nach dem Aufwecken des iPhones): neu öffnen
  await page.route('**/api/push/**', route => route.abort());
  await page.reload();
  await expect(state(page)).toHaveAttribute('data-push-state', 'on', { timeout: 15000 });
  await expect(page.locator('[data-push-state="inactive"]')).toHaveCount(0);
  await expect(page.locator('[data-push-last]')).toContainText('nicht abrufbar');
  await expect(page.locator('[data-act="push-on"]')).toHaveCount(0);
});

test('Test-Knopf wartet auf die Bestätigung des Geräts: angekommen; Protokoll zeigt angenommen/angekommen', async ({ page, request }) => {
  test.setTimeout(60000);
  const acc = await subscribed(page, request);
  await open(page, '/?go=mitteilungen');
  await expect(state(page)).toHaveAttribute('data-push-state', 'on', { timeout: 15000 });
  const before = (await pushLog(request)).length;
  await page.locator('[data-act="push-test"]').click();
  await expect(page.locator('[data-push-test]')).toContainText('warte', { timeout: 5000 });
  // Der Push-Dienst hat die Nachricht – entschlüsseln wie das iPhone und „angekommen“ melden wie der Service Worker
  await expect.poll(async () => (await pushLog(request)).length, { timeout: 10000 }).toBeGreaterThan(before);
  const msg = (await pushLog(request)).slice(before).find((x: any) => x.id === 'iphone-a');
  expect(msg.urgency).toBe('high');
  const d = decrypt(msg.body);
  expect(d.mid).toMatch(/^test-/);
  const r = await request.post('/api/push/receipt', { data: { t: d.rt, at: Date.now() } });
  expect((await r.json()).ok).toBe(true);
  await expect(page.locator('[data-push-test]')).toContainText('Angekommen', { timeout: 15000 });
  const st = await api(request, acc.token, 'get', '/api/push/receipt?mid=' + encodeURIComponent(d.mid));
  expect(st.devices.find((x: any) => x.thisDevice).receivedAt).toBeGreaterThan(0);
  // Protokoll auf der Seite: neu laden, aufklappen
  await page.reload();
  await page.locator('details.more summary').filter({ hasText: 'Letzte Mitteilungen' }).first().click();
  await expect(page.locator('[data-push-log]').first()).toContainText('angekommen');
  // kein Überlauf
  const overflow = await page.locator('[data-notify]').evaluate(el => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('ohne Bestätigung: ehrlich „angenommen, aber nicht bestätigt“', async ({ page, request }) => {
  await subscribed(page, request);
  await open(page, '/?go=mitteilungen');
  await expect(state(page)).toHaveAttribute('data-push-state', 'on', { timeout: 15000 });
  await page.evaluate(() => { (window as any).__pushTestWait = 1500; });
  await page.locator('[data-act="push-test"]').click();
  await expect(page.locator('[data-push-test]')).toContainText('nicht bestätigt', { timeout: 15000 });
});
