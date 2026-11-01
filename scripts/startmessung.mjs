/* Auftrag 26: Kaltstart der App messen (WebKit wie Safari/iPhone, wahlweise Chromium mit gebremster CPU).
   Ablauf: einmal verbinden und synchronisieren (wie ein Gerät, das die App schon benutzt), dann die App mehrmals neu öffnen
   und je Start messen: erstes Bild, weißer Blitz, Neuaufbauten, Layout-Verschiebung, lange Bilder, Server-Aufrufe, Schriften.
   Optional legt ein zweites Gerät vor jedem Start eine Änderung auf den Server (wie neue Uhr-Werte über Nacht).

   Aufruf (lokaler Server mit Datenkopie, siehe ERGEBNIS.md):
     node scripts/startmessung.mjs --url http://localhost:4280 --token <geräteschlüssel> --device <id> --user 1
       [--mode safari|homescreen] [--browser webkit|chromium] [--runs 3] [--remote-token <schlüssel2>] [--out datei.json] [--theme dark|light|system] */
import { webkit, chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { instrument, waitQuiet, collect } from './lib/startmess.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://localhost:4280');
const token = arg('token'), device = arg('device', 'dev-messung'), user = +arg('user', '1');
const mode = arg('mode', 'safari'), browserName = arg('browser', 'webkit'), runs = +arg('runs', '3');
const remoteToken = arg('remote-token'), out = arg('out'), theme = arg('theme', 'system');
if (!token) { console.error('--token fehlt'); process.exit(2); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'startmessung-'));
const engine = browserName === 'chromium' ? chromium : webkit;
const ctx = await engine.launchPersistentContext(dir, {
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, colorScheme: 'dark', locale: 'de-DE', timezoneId: 'Europe/Berlin',
  serviceWorkers: mode === 'homescreen' ? 'allow' : 'block'
});
// Homescreen-Modus: navigator.standalone wie auf dem iPhone
if (mode === 'homescreen') await ctx.addInitScript(() => { try { Object.defineProperty(navigator, 'standalone', { get: () => true }); } catch (e) {} });

// 1) Gerät verbinden und einmal vollständig synchronisieren
const prime = await ctx.newPage();
await prime.addInitScript(([t, d, u, th]) => {
  if (localStorage.getItem('ec_sync_auth')) return;
  localStorage.setItem('ec_sync_auth', JSON.stringify({ token: t, deviceId: d, userId: u, connectedAt: Date.now() }));
  localStorage.setItem('ec_owner', JSON.stringify(u));
  localStorage.setItem('ec_ui', JSON.stringify({ seenRelease: '9.9.9', tab: 'heute' }));
  if (th !== 'system') localStorage.setItem('theme_pref', th);
}, [token, device, user, theme]);
await prime.goto(url + '/');
const t0 = Date.now();
while (Date.now() - t0 < 60000) {
  const done = await prime.evaluate(() => { try { return !!JSON.parse(localStorage.getItem('ec_sync') || '{}').lastSyncAt; } catch (e) { return false; } }).catch(() => false);
  if (done) break; await prime.waitForTimeout(500);
}
await prime.waitForTimeout(4000);
if (mode === 'homescreen') { await prime.reload(); await prime.waitForTimeout(4000); } // Service Worker übernimmt
await prime.close();

async function remoteChange(i) {
  if (!remoteToken) return;
  const day = new Date().toISOString().slice(0, 10);
  const res = await fetch(url + '/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + remoteToken },
    body: JSON.stringify({ since: 1e15, changes: [{ kind: 'trend', key: day, data: { date: day, hrv: 60 + i, restingHR: 50, sleepHours: 7.5 + i / 10 }, updatedAt: Date.now(), deleted: false }] }) });
  if (!res.ok) console.error('Änderung vom zweiten Gerät fehlgeschlagen', res.status, await res.text());
}

// 2) Kaltstarts
const results = [];
for (let i = 0; i < runs; i++) {
  await remoteChange(i);
  const page = await ctx.newPage();
  await page.addInitScript(instrument);
  await page.goto(url + '/');
  await waitQuiet(page);
  const r = await collect(page);
  results.push(r);
  console.log(`Start ${i + 1}: erstes Bild ${r.firstView} ms, FCP ${r.fcp} ms, Neuaufbauten ${r.rebuilds} (${r.rebuildTimes.join(', ')}), CLS ${r.cls}, weißer Blitz ${r.whiteFlash ? 'JA' : 'nein'}, ` +
    `Neuladen ${r.navs > 1 ? 'JA' : 'nein'}, längstes Bild ${r.longestFrame} ms, API ${JSON.stringify(r.api)}`);
  await page.close();
}
await ctx.close();
fs.rmSync(dir, { recursive: true, force: true });
const median = k => { const v = results.map(r => r[k]).filter(x => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
const summary = { url, mode, browser: browserName, runs, firstView: median('firstView'), fcp: median('fcp'), rebuilds: median('rebuilds'), cls: median('cls'),
  longestFrame: median('longestFrame'), whiteFlash: results.some(r => r.whiteFlash), reload: results.some(r => r.navs > 1) };
console.log('Zusammenfassung', JSON.stringify(summary));
if (out) fs.writeFileSync(out, JSON.stringify({ summary, results }, null, 1));
