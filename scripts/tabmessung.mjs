/* Auftrag 31: Tab-Wechsel messen (WebKit wie Safari/iPhone, wahlweise Chromium mit 4-fach gebremster CPU).
   Mit einer Kopie der echten Daten eines Nutzers; optional zusätzliche Coach-Nachrichten (z. B. 1.000) für einen großen Verlauf.
   Je Tab: Zeit vom Antippen bis zum ersten Bild (Klick → Zeichnen → nächstes Bild) und reine Rechenzeit des Zeichnens.

   Aufruf: node scripts/tabmessung.mjs <sicherung.sql|kopie.sqlite> [--user 1] [--extra-msgs 1000] [--browser webkit|chromium] [--runs 5] [--dist dist] [--out datei.json] */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { webkit, chromium } from '@playwright/test';
import { prepareCopy, startServer } from './startcheck.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };

/* Zusätzliche Coach-Nachrichten (Frage und Antwort im Wechsel, über die letzten Wochen verteilt) direkt in die lokale Kopie */
export function addMessages(db, uid, n) {
  const d = new DatabaseSync(db);
  const now = Date.now();
  const cur = Math.max(d.prepare('SELECT COALESCE(MAX(rev), 0) AS s FROM records').get().s, +((d.prepare("SELECT v FROM meta WHERE k = 'rev'").get() || {}).v || 0));
  const ins = d.prepare('INSERT OR REPLACE INTO records (user_id, kind, key, data, updated_at, deleted, rev) VALUES (?, ?, ?, ?, ?, 0, ?)');
  for (let i = 0; i < n; i++) {
    const at = now - (n - i) * 25 * 60000; const user = i % 2 === 0;
    const id = `msg-mess-${i}`;
    const date = new Date(at).toISOString().slice(0, 10);
    const m = user ? { id, at, date, kind: 'user', from: 'user', text: `Frage ${i}: Wie soll ich die Einheit morgen angehen?` }
      : { id, at, date, kind: 'answer', from: 'coach', chat: true, intent: 'smalltalk', text: `Antwort ${i}: Locker anfangen, auf den Puls achten und nach 20 Minuten entscheiden, ob es sich gut anfühlt. Trink genug.`, suggestions: [] };
    ins.run(uid, 'coachMsg', id, JSON.stringify(m), at, cur + i + 1);
  }
  d.prepare("UPDATE meta SET v = ? WHERE k = 'rev'").run(String(cur + n));
  d.close();
}

export async function measureTabs(src, { user = 1, extra = 0, browser = 'webkit', runs = 5, dist = path.join(ROOT, 'dist'), log = console.log } = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tabmessung-'));
  const { db, users } = prepareCopy(src, work);
  const u = users.find(x => x.id === user); if (!u) throw new Error('Nutzer ' + user + ' nicht in der Kopie');
  if (extra) addMessages(db, user, extra);
  const port = 4800 + Math.floor(Math.random() * 300), base = 'http://localhost:' + port;
  const server = await startServer(port, db, dist);
  const engine = browser === 'chromium' ? chromium : webkit;
  const dir = fs.mkdtempSync(path.join(work, 'browser-'));
  const ctx = await engine.launchPersistentContext(dir, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, locale: 'de-DE', timezoneId: 'Europe/Berlin', serviceWorkers: 'block' });
  try {
    await ctx.addInitScript(a => {
      try { Object.defineProperty(navigator, 'standalone', { get: () => true }); } catch (_) { /* egal */ }
      if (localStorage.getItem('ec_sync_auth')) return;
      localStorage.setItem('ec_sync_auth', JSON.stringify({ token: a.token, deviceId: 'dev-startcheck-' + a.id, userId: a.id, connectedAt: Date.now() }));
      localStorage.setItem('ec_owner', JSON.stringify(a.id));
      localStorage.setItem('ec_ui', JSON.stringify({ seenRelease: '9.9.9', tab: 'heute' }));
    }, u);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/');
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      const done = await page.evaluate(() => { try { return !!JSON.parse(localStorage.getItem('ec_sync') || '{}').lastSyncAt; } catch (e) { return false; } }).catch(() => false);
      if (done) break; await page.waitForTimeout(500);
    }
    // nach dem ersten Abgleich lädt die App ggf. neu: einmal frisch öffnen und zur Ruhe kommen lassen
    await page.reload(); await page.waitForSelector('#app [data-view]', { timeout: 30000 }); await page.waitForTimeout(4000);
    if (browser === 'chromium') { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); }
    const msgs = await page.evaluate(() => document.querySelectorAll('#tabs .tab').length);
    if (msgs < 5) throw new Error('Tab-Leiste fehlt');
    const order = ['plan', 'coach', 'fortschritt', 'mehr', 'heute'];
    const res = Object.fromEntries(order.map(k => [k, { paint: [], js: [], nodes: 0 }]));
    for (let r = 0; r < runs; r++) {
      for (const tab of order) {
        const m = await page.evaluate(async tab => {
          const btn = document.querySelector(`#tabs [data-tab="${tab}"]`);
          const t0 = performance.now();
          btn.click();
          const tJs = performance.now();
          await new Promise(res => requestAnimationFrame(() => setTimeout(res, 0)));
          const tPaint = performance.now();
          return { js: Math.round(tJs - t0), paint: Math.round(tPaint - t0), nodes: document.querySelectorAll('#app *').length, msgs: document.querySelectorAll('#app [data-msg]').length };
        }, tab);
        res[tab].paint.push(m.paint); res[tab].js.push(m.js); res[tab].nodes = m.nodes; if (tab === 'coach') res[tab].msgs = m.msgs;
        await page.waitForTimeout(700);
      }
    }
    // Hochscrollen im Coach lädt ältere Nachrichten nach (Messung nur, wenn es den Knopf/Bereich gibt)
    await page.evaluate(() => document.querySelector('#tabs [data-tab="coach"]').click());
    await page.waitForTimeout(800);
    const older = await page.evaluate(async () => {
      const before = document.querySelectorAll('#app [data-msg]').length;
      const more = document.querySelector('[data-feed-more]');
      if (!more) return { before, after: before, ms: null };
      const t0 = performance.now(); more.click(); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
      return { before, after: document.querySelectorAll('#app [data-msg]').length, ms: Math.round(performance.now() - t0) };
    });
    const med = a => { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
    const summary = Object.fromEntries(order.map(k => [k, { paintMedian: med(res[k].paint), paintMax: Math.max(...res[k].paint), jsMedian: med(res[k].js), nodes: res[k].nodes, ...(res[k].msgs != null ? { msgs: res[k].msgs } : {}) }]));
    for (const k of order) log(`${k.padEnd(12)} erstes Bild ${String(summary[k].paintMedian).padStart(4)} ms (max ${summary[k].paintMax}), Rechnen ${summary[k].jsMedian} ms, Elemente ${summary[k].nodes}${summary[k].msgs != null ? ', Nachrichten gezeichnet ' + summary[k].msgs : ''}`);
    log(`Ältere Nachrichten nachladen: ${older.ms == null ? '–' : older.ms + ' ms (' + older.before + ' → ' + older.after + ')'}`);
    if (errors.length) log('Seitenfehler: ' + errors.slice(0, 3).join(' | '));
    return { browser, user, extra, runs, summary, raw: res, older, errors };
  } finally { await ctx.close().catch(() => {}); server.kill(); try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) { /* Browser hält evtl. noch Dateien */ } }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const src = process.argv[2];
  if (!src || src.startsWith('--')) { console.error('Aufruf: node scripts/tabmessung.mjs <sicherung.sql|kopie.sqlite> [--user 1] [--extra-msgs 1000] [--browser webkit|chromium] [--runs 5]'); process.exit(2); }
  const r = await measureTabs(src, { user: +arg('user', '1'), extra: +arg('extra-msgs', '0'), browser: arg('browser', 'webkit'), runs: +arg('runs', '5'), dist: path.resolve(arg('dist', 'dist')) });
  if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify(r, null, 1));
}
