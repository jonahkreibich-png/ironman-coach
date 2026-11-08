/* Auftrag 31, Teil 2: Mitteilungen kamen bei Nutzer 1 seit dem 31.10. nicht an, obwohl die App „erlaubt“ zeigte.
   Ursache: Das iPhone bekam eine neue Geräte-Kennung, die Anmeldung beim Server hing an der alten; die App hat das nie bemerkt.
   Dieser Test spielt das mit einem nachgemachten Browser-Push (Erlaubnis, Anmeldung) und dem nachgemachten Push-Dienst des Testservers
   (/__push) durch: Erlauben → Test kommt an → neue Geräte-Kennung (wie nach Neu-Verbinden/Neuinstallation) → App meldet sich beim nächsten
   Start selbst neu an → abgelaufene Anmeldung (410) wird erkannt, ehrlich angezeigt und mit „Erneut erlauben“ ersetzt.
   Dazu: Ruhezeit in der Schule (neue Felder) eintippen, neu laden, gleicher Wert; ungültige Uhrzeit wird abgelehnt. */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import crypto from 'node:crypto';
import { seed, open, stored } from './helpers';

const BASE = 'http://localhost:4180';
const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
const KEYS = { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') };

async function account(request: APIRequestContext) {
  await request.post('/__reset');
  return await (await request.post('/api/setup', { data: { name: 'iPhone' } })).json();
}
async function pairNew(request: APIRequestContext, token: string) {
  const c = (await (await request.post('/api/pair/create', { headers: { Authorization: 'Bearer ' + token } })).json()).code;
  return await (await request.post('/api/pair/redeem', { data: { code: c, name: 'iPhone' } })).json();
}
const api = async (request: APIRequestContext, token: string, method: 'get' | 'post', path: string) => (await request[method](path, { headers: { Authorization: 'Bearer ' + token } })).json();
const pushLog = async (request: APIRequestContext) => (await request.get('/__push-log')).json();

/* Browser-Push nachmachen: Erlaubnis, Service Worker bereit, Anmeldung mit Adresse beim Push-Dienst des Testservers.
   Die Anmeldung bleibt im sessionStorage (wie im Browser über Neuladen hinweg); `__nextId` bestimmt die Adresse der nächsten. */
async function fakePush(page: Page, firstId: string) {
  await page.addInitScript(([base, keys, firstId]) => {
    const w = window as any;
    const load = () => { try { return JSON.parse(sessionStorage.getItem('__fakeSub') || 'null'); } catch (e) { return null; } };
    const save = (s: any) => sessionStorage.setItem('__fakeSub', JSON.stringify(s));
    let perm = sessionStorage.getItem('__perm') || 'default';
    class FakeNotification { static get permission() { return perm; } static async requestPermission() { perm = 'granted'; sessionStorage.setItem('__perm', perm); return perm; } }
    Object.defineProperty(w, 'Notification', { value: FakeNotification, configurable: true });
    if (!('PushManager' in w)) Object.defineProperty(w, 'PushManager', { value: function PushManager() {}, configurable: true });
    const makeSub = (d: any) => d && ({ endpoint: d.endpoint, options: { applicationServerKey: new Uint8Array(d.key).buffer },
      toJSON: () => ({ endpoint: d.endpoint, keys }), unsubscribe: async () => { save(null); w.__unsubscribed = (w.__unsubscribed || 0) + 1; return true; } });
    const pushManager = {
      getSubscription: async () => makeSub(load()),
      subscribe: async (o: any) => {
        const id = sessionStorage.getItem('__nextId') || firstId;
        const d = { endpoint: `${base.replace('localhost', '127.0.0.1')}/__push/${id}`, key: Array.from(new Uint8Array(o.applicationServerKey)) };
        save(d); return makeSub(d);
      }
    };
    Object.defineProperty(ServiceWorkerContainer.prototype, 'ready', { get: () => Promise.resolve({ pushManager }), configurable: true });
  }, [BASE, KEYS, firstId] as const);
}
async function connect(page: Page, acc: any) {
  await page.addInitScript(a => {
    const cur = JSON.parse(localStorage.getItem('ec_sync_auth') || 'null');
    if (!cur || cur.deviceId !== a.deviceId) { localStorage.setItem('ec_sync_auth', JSON.stringify({ token: a.token, deviceId: a.deviceId, userId: a.userId, connectedAt: Date.now() })); localStorage.setItem('ec_owner', JSON.stringify(a.userId)); }
  }, acc);
}
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
  await page.locator('[data-act="push-test"]').click();
  await expect(page.locator('#toast, .toast').first()).toContainText('unterwegs', { timeout: 10000 });
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
  await page.evaluate(() => sessionStorage.setItem('__nextId', 'iphone-2'));
  await open(page, '/?go=mitteilungen');
  await expect(state(page)).toHaveAttribute('data-push-state', 'inactive', { timeout: 15000 });
  await expect(page.locator('[data-push-state="inactive"]')).toHaveText('Auf diesem Gerät nicht aktiv');
  expect((await api(request, acc2.token, 'get', '/api/push/status')).thisDevice).toBe(false);
  // „Erneut erlauben“: alte Anmeldung wird ersetzt, neue Adresse, wieder aktiv, Test kommt an
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
