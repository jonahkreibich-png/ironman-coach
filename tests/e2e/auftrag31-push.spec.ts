/* Auftrag 31, Teil 2: Mitteilungen kamen bei Nutzer 1 seit dem 31.10. nicht an, obwohl die App „erlaubt“ zeigte.
   Ursache: Das iPhone bekam eine neue Geräte-Kennung, die Anmeldung beim Server hing an der alten; die App hat das nie bemerkt.
   Dieser Test spielt das mit einem nachgemachten Browser-Push (Erlaubnis, Anmeldung) und dem nachgemachten Push-Dienst des Testservers
   (/__push) durch: Erlauben → Test kommt an → neue Geräte-Kennung (wie nach Neu-Verbinden/Neuinstallation) → App meldet sich beim nächsten
   Start selbst neu an → abgelaufene Anmeldung (410) wird erkannt, ehrlich angezeigt und mit „Erneut erlauben“ ersetzt.
   Dazu: Ruhezeit in der Schule (neue Felder) eintippen, neu laden, gleicher Wert; ungültige Uhrzeit wird abgelehnt. */
import { test, expect, type Page } from '@playwright/test';
import { seed, open, stored } from './helpers';
import { BASE, account, pairNew, api, pushLog, fakePush, connect } from './push-helpers';

const state = (page: Page) => page.locator('[data-push-state]').first();

test('Erlauben → Test kommt an → neue Geräte-Kennung: App meldet sich selbst neu an → abgelaufen: ehrlich anzeigen und ersetzen', async ({ page, request }) => {
  test.setTimeout(90000);
  const acc = await account(request);
  await seed(page);
  await fakePush(page, 'iphone-1');
  await connect(page, acc);
  await open(page, '/?go=mitteilungen');
  await expect(state(page)).toHaveAttribute('data-push-state', 'ask');
  await page.locator('[data-act="push-on"]').first().click();
  await expect(state(page)).toHaveAttribute('data-push-state', 'on', { timeout: 15000 });
  await expect(page.locator('[data-push-state="on"]')).toHaveText('Auf diesem Gerät aktiv');
  let st = await api(request, acc.token, 'get', '/api/push/status');
  expect(st.thisDevice).toBe(true);

  // Test-Mitteilung: kommt beim Push-Dienst an (mit VAPID, verschlüsselt), Anzeige „zuletzt zugestellt“
  // Auftrag 33: der Test-Knopf wartet auf die Bestätigung des Geräts; hier bestätigt niemand → ehrlich „angenommen, nicht bestätigt“
  await page.evaluate(() => { (window as any).__pushTestWait = 1500; });
  await page.locator('[data-act="push-test"]').click();
  await expect(page.locator('[data-push-test]')).toContainText('nicht bestätigt', { timeout: 15000 });
  let log = await pushLog(request);
  expect(log.some((x: any) => x.id === 'iphone-1' && x.vapid && x.enc === 'aes128gcm' && x.bytes > 100)).toBe(true);
  await expect(page.locator('[data-push-last]')).toContainText('zugestellt');

  // Neue Geräte-Kennung (wie am 31.10. bei Nutzer 1: neu verbunden), gleiche Browser-Anmeldung, nichts angetippt
  const acc2 = await pairNew(request, acc.token);
  await page.evaluate(a => { localStorage.setItem('ec_sync_auth', JSON.stringify({ token: a.token, deviceId: a.deviceId, userId: a.userId, connectedAt: Date.now() })); }, acc2);
  await connect(page, acc2);
  await open(page, '/?go=heute');
  await expect.poll(async () => (await api(request, acc2.token, 'get', '/api/push/status')).thisDevice, { timeout: 15000 }).toBe(true);
  // Nach einem Update (neuer Service Worker) bleibt sie aktiv: gleiche Anmeldung, nichts ersetzt
  st = await api(request, acc2.token, 'get', '/api/push/status');
  expect(st.endTail).toBe(`${BASE.replace('localhost', '127.0.0.1')}/__push/iphone-1`.slice(-24));

  // Push-Dienst meldet „abgelaufen“ (410): Anmeldung wird entfernt, App zeigt „nicht aktiv – erneut erlauben“, meldet die tote nicht erneut
  await page.evaluate(() => { const d = JSON.parse(sessionStorage.getItem('__fakeSub')!); d.endpoint = d.endpoint.replace(/__push\/.*/, '__push/gone-1'); sessionStorage.setItem('__fakeSub', JSON.stringify(d)); localStorage.removeItem('ec_push_check'); });
  await open(page, '/?go=mitteilungen');
  await expect.poll(async () => (await api(request, acc2.token, 'get', '/api/push/status')).endTail, { timeout: 15000 }).toContain('gone-1');
  const r = await api(request, acc2.token, 'post', '/api/push/test');
  expect(r.results.find((x: any) => x.thisDevice).gone).toBe(true);
  // wie iOS: ohne Antippen keine neue Anmeldung möglich → erst dann wirklich „erneut erlauben“ (Auftrag 33)
  await page.evaluate(() => { sessionStorage.setItem('__nextId', 'iphone-2'); sessionStorage.setItem('__noSilentSubscribe', '1'); });
  await open(page, '/?go=mitteilungen');
  await expect(state(page)).toHaveAttribute('data-push-state', 'inactive', { timeout: 15000 });
  await expect(page.locator('[data-push-state="inactive"]')).toHaveText('Auf diesem Gerät nicht aktiv');
  expect((await api(request, acc2.token, 'get', '/api/push/status')).thisDevice).toBe(false);
  // „Erneut erlauben“: alte Anmeldung wird ersetzt, neue Adresse, wieder aktiv, Test kommt an
  await page.evaluate(() => { (window as any).__userTap = true; });
  await page.locator('[data-act="push-on"]').first().click();
  await expect(state(page)).toHaveAttribute('data-push-state', 'on', { timeout: 15000 });
  st = await api(request, acc2.token, 'get', '/api/push/status');
  expect(st.thisDevice && st.endTail.endsWith('iphone-2')).toBe(true);
  expect(await page.evaluate(() => (window as any).__unsubscribed || 0)).toBeGreaterThanOrEqual(1);
  await page.locator('[data-act="push-test"]').click();
  await expect.poll(async () => (await pushLog(request)).some((x: any) => x.id === 'iphone-2')).toBe(true);
});

test('Ruhezeit in der Schule: eintippen, neu laden, gleicher Wert; ungültige Uhrzeit wird abgelehnt', async ({ page, request }) => {
  const acc = await account(request);
  await seed(page);
  await fakePush(page, 'x');
  await connect(page, acc);
  await open(page, '/?go=mitteilungen');
  await page.locator('label:has(#np-school), [for="np-school"]').first().click();
  await expect.poll(async () => (await stored(page)).settings?.notify?.schoolQuiet).toBe(true);
  const start = page.locator('input[data-p="schoolStart"]');
  await start.fill('08:05'); await start.blur();
  await expect.poll(async () => (await stored(page)).settings?.notify?.schoolStart).toBe('08:05');
  const end = page.locator('input[data-p="schoolEnd"]');
  await end.fill('13:40'); await end.blur();
  await expect.poll(async () => (await stored(page)).settings?.notify?.schoolEnd).toBe('13:40');
  await page.reload();
  await expect(page.locator('input[data-p="schoolStart"]')).toHaveValue('08:05');
  await expect(page.locator('input[data-p="schoolEnd"]')).toHaveValue('13:40');
  await expect(page.locator('#np-school')).toBeChecked();
  // leere Uhrzeit: Meldung, alter Wert bleibt
  await page.evaluate(() => { const w = window as any; w.__toasts = []; new MutationObserver(() => w.__toasts.push(document.getElementById('toast')!.textContent)).observe(document.getElementById('toast')!, { childList: true, characterData: true, subtree: true }); });
  await page.locator('input[data-p="schoolEnd"]').evaluate((el: HTMLInputElement) => { el.value = ''; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await expect.poll(() => page.evaluate(() => ((window as any).__toasts || []).join(' | '))).toContain('Uhrzeit');
  expect((await stored(page)).settings.notify.schoolEnd).toBe('13:40');
  await expect(page.locator('input[data-p="schoolEnd"]')).toHaveValue('13:40');
  // iPhone-Hinweis (Homescreen, Fokus) erscheint nur auf dem iPhone – hier: kein Überlauf der Karte
  const overflow = await page.locator('[data-notify]').evaluate(el => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
