/* Auftrag 25: Der Service Worker war seit dem 11.10. ungültig (fehlende Zeile), deshalb gingen weder Mitteilungen noch Offline-Start.
   Dieser Test erzeugt sw.js wie der Build und prüft: gültiges JavaScript, alle Ereignisse da, Server-Anfragen (/api/) nie aus dem Speicher. */
import { test, expect } from 'vitest';
import fs from 'node:fs';

function build() {
  return fs.readFileSync('web/sw-template.js', 'utf8').replace('__VERSION__', 'v1').replace('__CACHE_PREFIX__', 'stamio-').replace('__ASSETS__', JSON.stringify(['./', './index.html'])).replace('__APP_NAME__', 'Stamio');
}
function load() {
  const handlers: Record<string, (e: any) => void> = {};
  const self: any = { addEventListener: (k: string, fn: any) => { handlers[k] = fn; }, location: { origin: 'https://app.example' }, registration: { scope: 'https://app.example/' } };
  const caches = { open: () => Promise.resolve({ match: () => Promise.resolve(undefined), put: () => Promise.resolve() }), keys: () => Promise.resolve([]) };
  new Function('self', 'caches', 'fetch', build())(self, caches, () => Promise.reject(new Error('offline')));
  return handlers;
}
test('sw.js ist gültiges JavaScript und hat alle Ereignisse', () => {
  expect(() => new Function('self', build())).not.toThrow();
  expect(Object.keys(load()).sort()).toEqual(['activate', 'fetch', 'install', 'message', 'notificationclick', 'push', 'pushsubscriptionchange']);
});
test('Server-Anfragen und OAuth-Rückkehr gehen nie über den Speicher, App-Seiten schon', () => {
  const h = load();
  const ask = (url: string, mode = 'cors') => { let used = false; h.fetch({ request: { method: 'GET', url, mode }, respondWith: (p: any) => { used = true; Promise.resolve(p).catch(() => {}); } }); return used; };
  expect(ask('https://app.example/api/me')).toBe(false);
  expect(ask('https://app.example/api/connect/oura/callback?code=1', 'navigate')).toBe(false);
  expect(ask('https://app.example/assets/index.js')).toBe(true);
  expect(ask('https://app.example/?go=heute', 'navigate')).toBe(true);
  expect(ask('https://andere.example/x.js')).toBe(false);
});

/* Auftrag 31: Anmeldung vom Browser erneuert → mit demselben Schlüssel neu anmelden und offene Fenster bitten, sie dem Server zu melden */
test('pushsubscriptionchange: neu anmelden, Fenster benachrichtigen', async () => {
  const handlers: Record<string, (e: any) => void> = {}; const posted: any[] = []; const subs: any[] = [];
  const self: any = { addEventListener: (k: string, fn: any) => { handlers[k] = fn; }, location: { origin: 'https://app.example' },
    registration: { scope: 'https://app.example/', pushManager: { subscribe: async (o: any) => { subs.push(o); return {}; } } },
    clients: { matchAll: async () => [{ postMessage: (m: any) => posted.push(m) }] } };
  new Function('self', 'caches', 'fetch', build())(self, {}, () => Promise.reject(new Error('offline')));
  let wait: any; handlers.pushsubscriptionchange({ oldSubscription: { options: { applicationServerKey: new Uint8Array([4, 1]) } }, waitUntil: (p: any) => { wait = p; } });
  await wait;
  expect(subs[0].userVisibleOnly).toBe(true);
  expect(posted).toEqual([{ type: 'push-renew' }]);
});

/* Auftrag 33: nach dem Anzeigen meldet der Service Worker „angekommen“ (Empfangs-Schlüssel, ohne Geräte-Schlüssel) und informiert offene
   Fenster (Test-Knopf wartet darauf). Scheitert die Meldung (kein Netz), wird die Mitteilung trotzdem angezeigt. */
function pushWorker(fetchFn: (u: string, o: any) => Promise<any>, show: () => Promise<void> = async () => {}) {
  const handlers: Record<string, (e: any) => void> = {}; const posted: any[] = []; const shown: any[] = [];
  const self: any = { addEventListener: (k: string, fn: any) => { handlers[k] = fn; }, location: { origin: 'https://app.example' },
    registration: { scope: 'https://app.example/', showNotification: async (title: string, o: any) => { shown.push({ title, ...o }); await show(); } },
    clients: { matchAll: async () => [{ postMessage: (m: any) => posted.push(m) }] } };
  new Function('self', 'caches', 'fetch', build())(self, {}, fetchFn);
  const push = async (d: any) => { let wait: any; handlers.push({ data: { json: () => d }, waitUntil: (p: any) => { wait = p; } }); await wait; };
  return { push, posted, shown };
}
test('push: zeigt an, meldet „angekommen“ mit Empfangs-Schlüssel und sagt offenen Fenstern Bescheid', async () => {
  const calls: any[] = [];
  const w = pushWorker(async (u, o) => { calls.push({ u, o }); return { ok: true }; });
  await w.push({ title: 'Guten Morgen', body: 'x', tag: 'morning', mid: '2099-01-05|morning', rt: 'abcdefghijklmnopqrstuvwx' });
  expect(w.shown[0].title).toBe('Guten Morgen');
  expect(calls.length).toBe(1);
  expect(calls[0].u).toBe('https://app.example/api/push/receipt');
  expect(calls[0].o.method).toBe('POST');
  expect(JSON.parse(calls[0].o.body).t).toBe('abcdefghijklmnopqrstuvwx');
  expect(calls[0].o.headers.Authorization).toBeUndefined();
  expect(w.posted).toEqual([{ type: 'push-received', mid: '2099-01-05|morning' }]);
});
test('push: ohne Netz wird trotzdem angezeigt; alte Mitteilung ohne Schlüssel: keine Meldung', async () => {
  const calls: any[] = [];
  const w = pushWorker(async (u) => { calls.push(u); throw new Error('offline'); });
  await w.push({ title: 'A', rt: 'abcdefghijklmnopqrstuvwx', mid: 'm1' });
  await w.push({ title: 'B' });
  expect(w.shown.map(x => x.title)).toEqual(['A', 'B']);
  expect(calls.length).toBe(1);
});
