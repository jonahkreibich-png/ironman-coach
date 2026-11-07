// Auftrag 28: Start-Test vor jedem Release – mit Kopien ALLER echten Nutzer, im Browser wie auf dem iPhone (WebKit, Homescreen-Modus,
// Service Worker an). Auslöser: 3.15.0 startete bei Nutzer 1 nicht mehr; die bisherige Prüfung (release-check-cli.ts) rechnete nur
// in Node und hätte das nie gesehen.
// Je Nutzer zwei Starts:
//   A „Update“: Gerät mit dem lokalen Stand der Vorversion (Vorversion öffnen und synchronisieren), dann kommt die neue Version
//     über den Service Worker – genau wie bei den Nutzern nach dem Release. Muss in höchstens 3 Öffnungen mit der neuen Version starten.
//   B „neues Gerät“: frisch verbunden, nur die neue Version.
// Geprüft: App startet (data-app-state=ready), kein Bereich „konnte nicht geladen werden“, keine Seitenfehler, Abgleich fertig.
//
// Aufruf: node scripts/startcheck.mjs <sicherung.sql|kopie.sqlite> [--prev <ordner>|--prev-url <adresse>] [--dist dist] [--browser webkit|chromium] [--user 1]
//   Ohne --prev/--prev-url wird nur B geprüft. veroeffentlichen.mjs lädt die Vorversion vorher von der echten App (scripts/lib/livebuild.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { webkit, chromium } from '@playwright/test';
import { downloadLiveBuild } from './lib/livebuild.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };

/* Kopie der Datenbank mit bekanntem Geräteschlüssel je echtem Nutzer (nur lokal, im Temp-Ordner) */
export function prepareCopy(src, work) {
  const db = path.join(work, 'kopie.sqlite');
  if (src.endsWith('.sqlite')) fs.copyFileSync(src, db);
  else { const d = new DatabaseSync(db); d.exec(fs.readFileSync(src, 'utf8')); d.close(); }
  const d = new DatabaseSync(db);
  const users = d.prepare('SELECT id, name FROM users WHERE COALESCE(test, 0) = 0 ORDER BY id').all().map(u => ({ id: u.id, name: u.name || 'Nutzer ' + u.id }));
  for (const u of users) {
    u.token = 'startcheck-' + u.id + '-' + createHash('sha256').update(String(Math.random())).digest('hex').slice(0, 24);
    d.prepare('INSERT OR REPLACE INTO devices (id, name, token_hash, created_at, last_seen, user_id) VALUES (?, ?, ?, ?, ?, ?)').run('dev-startcheck-' + u.id, 'Start-Test', createHash('sha256').update(u.token).digest('hex'), Date.now(), Date.now(), u.id);
  }
  // Mitteilungs-Abos und verschlüsselte Dienst-Anmeldungen passen nicht zur lokalen Kopie
  for (const t of ['push_subs', 'connections', 'ingest_keys']) { try { d.prepare('DELETE FROM ' + t).run(); } catch (_) { /* Tabelle fehlt */ } }
  d.close();
  return { db, users };
}

async function startServer(port, db, dist) {
  const p = spawn(process.execPath, [path.join(ROOT, 'scripts', 'test-server.mjs'), String(port)], { cwd: ROOT, env: { ...process.env, DB_FILE: db, DIST_DIR: dist }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; p.stdout.on('data', b => { log += b; }); p.stderr.on('data', b => { log += b; });
  for (let i = 0; i < 100; i++) { if (/Testserver auf/.test(log)) return p; if (p.exitCode != null) break; await new Promise(r => setTimeout(r, 200)); }
  p.kill(); throw new Error('Testserver startet nicht: ' + log.slice(-500));
}
const useDist = (base, dir) => fetch(base + '/__dist', { method: 'POST', body: JSON.stringify({ dir }) }).then(r => { if (!r.ok) throw new Error('Build nicht gefunden: ' + dir); });
const indexAsset = dir => (/src="[^"]*(assets\/index-[^"]+\.js)"/.exec(fs.readFileSync(path.join(dir, 'index.html'), 'utf8')) || [])[1];

/* Eine Öffnung der App: bereit? welcher Build? Fehler? */
async function openOnce(ctx, base, wantAsset, waitMs) {
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/');
  const t0 = Date.now(); let r = null;
  while (Date.now() - t0 < waitMs) {
    await page.waitForTimeout(500);
    r = await page.evaluate(() => {
      const app = document.getElementById('app'); let sync = null;
      try { const m = JSON.parse(localStorage.getItem('ec_sync') || '{}'); sync = { last: m.lastSyncAt || null, pending: Object.keys(m.pending || {}).length }; } catch (_) { /* egal */ }
      return { state: app.dataset.appState, error: app.dataset.appError || null, failed: [...document.querySelectorAll('[data-failed]')].map(e => e.getAttribute('data-failed')),
        asset: ([...document.scripts].map(s => s.src).find(s => /assets\/index-/.test(s)) || '').replace(/^.*?(assets\/)/, '$1'), sync, text: app.innerText.slice(0, 120) };
    }).catch(() => null);
    if (r && r.state === 'error') break;
    if (r && r.state === 'ready' && r.asset === wantAsset && r.sync && r.sync.last && !r.sync.pending && Date.now() - t0 > 3000) break;
  }
  await page.close();
  return { ...r, errors };
}

export async function startCheck(src, { prev = null, dist = path.join(ROOT, 'dist'), browser = 'webkit', onlyUser = null, log = console.log } = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'startcheck-'));
  const { db, users } = prepareCopy(src, work);
  const port = 4300 + Math.floor(Math.random() * 500), base = 'http://localhost:' + port;
  const server = await startServer(port, db, prev || dist);
  const engine = browser === 'chromium' ? chromium : webkit;
  const newAsset = indexAsset(dist), prevAsset = prev ? indexAsset(prev) : null;
  const results = [];
  try {
    for (const u of users.filter(x => !onlyUser || x.id === onlyUser)) {
      const res = { user: u.id, name: u.name, prev: null, update: null, fresh: null, problems: [] };
      const ctxFor = async () => {
        const dir = fs.mkdtempSync(path.join(work, 'browser-'));
        const ctx = await engine.launchPersistentContext(dir, { viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'de-DE', timezoneId: 'Europe/Berlin', serviceWorkers: 'allow' });
        await ctx.addInitScript(() => { try { Object.defineProperty(navigator, 'standalone', { get: () => true }); } catch (_) { /* egal */ } });
        await ctx.addInitScript(a => {
          if (localStorage.getItem('ec_sync_auth')) return;
          localStorage.setItem('ec_sync_auth', JSON.stringify({ token: a.token, deviceId: 'dev-startcheck-' + a.id, userId: a.id, connectedAt: Date.now() }));
          localStorage.setItem('ec_owner', JSON.stringify(a.id));
          localStorage.setItem('ec_ui', JSON.stringify({ seenRelease: '9.9.9', tab: 'heute' }));
        }, u);
        return ctx;
      };
      // A: Vorversion → Update
      if (prev) {
        await useDist(base, prev);
        const ctx = await ctxFor();
        // erstes Öffnen lädt den Plan und lädt neu; zweites Öffnen ist der normale Alltag mit der Vorversion
        await openOnce(ctx, base, prevAsset, 20000);
        res.prev = await openOnce(ctx, base, prevAsset, 15000);
        await useDist(base, dist);
        for (let i = 0; i < 3; i++) { res.update = await openOnce(ctx, base, newAsset, 20000); res.update.opens = i + 1; if (res.update.asset === newAsset && res.update.state === 'ready') break; }
        await ctx.close();
      }
      // B: neues Gerät, nur die neue Version
      await useDist(base, dist);
      { const ctx = await ctxFor(); await openOnce(ctx, base, newAsset, 20000); res.fresh = await openOnce(ctx, base, newAsset, 15000); await ctx.close(); }
      for (const [k, r] of [['Update', res.update], ['neues Gerät', res.fresh]]) {
        if (!r) continue;
        if (r.state !== 'ready') res.problems.push(`${k}: startet nicht (${r.error || r.state}: ${r.text || ''})`);
        else if (r.asset !== newAsset) res.problems.push(`${k}: neue Version kam nicht an (${r.asset})`);
        if (r.failed && r.failed.length) res.problems.push(`${k}: Bereich nicht geladen: ${r.failed.join(', ')}`);
        if (r.errors && r.errors.length) res.problems.push(`${k}: Seitenfehler: ${r.errors.slice(0, 3).join(' | ')}`);
        if (r.sync && r.sync.pending) res.problems.push(`${k}: ${r.sync.pending} Änderungen nicht abgeglichen`);
      }
      const p = res.prev ? ` · Vorversion: ${res.prev.state === 'ready' ? 'startet' : 'STARTET NICHT (' + (res.prev.error || res.prev.state) + ')'}` : '';
      log(`Nutzer ${u.id} (${u.name}): ${res.problems.length ? 'FEHLER ' + res.problems.join(' | ') : 'startet fehlerfrei'}${p}${res.update ? ` · Update nach ${res.update.opens} Öffnung(en)` : ''}`);
      results.push(res);
    }
  } finally { server.kill(); try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) { /* Browser hält evtl. noch Dateien */ } }
  return { ok: results.length > 0 && results.every(r => !r.problems.length), results };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const src = process.argv[2];
  if (!src || src.startsWith('--')) { console.error('Aufruf: node scripts/startcheck.mjs <sicherung.sql|kopie.sqlite> [--prev <ordner>|--prev-url <adresse>] [--dist dist] [--browser webkit|chromium] [--user N]'); process.exit(2); }
  let prev = arg('prev', null);
  if (!prev && arg('prev-url')) { prev = path.join(ROOT, 'scratch', 'vorversion'); const b = await downloadLiveBuild(arg('prev-url'), prev); console.log(`Vorversion ${b.version} geladen (${b.files} Dateien)`); }
  const r = await startCheck(src, { prev, dist: path.resolve(arg('dist', 'dist')), browser: arg('browser', 'webkit'), onlyUser: arg('user') ? +arg('user') : null });
  console.log(r.ok ? 'OK: alle Nutzer starten.' : 'ACHTUNG: Release anhalten.');
  process.exit(r.ok ? 0 : 1);
}
