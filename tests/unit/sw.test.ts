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
