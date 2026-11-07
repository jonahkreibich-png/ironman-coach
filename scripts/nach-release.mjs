// Auftrag 28: Nach dem Release kurz prüfen – und bei Startfehlern automatisch zurück auf die Vorversion.
// 1. Echte App im Browser (WebKit) öffnen: Startbildschirm muss erscheinen (fängt einen kaputten Build sofort ab).
// 2. Fehlerprotokoll der echten Datenbank lesen (nur lesen): Startfehler („start:…“) der NEUEN Version von echten Nutzern?
//    Seit Auftrag 28 meldet die App Startfehler sofort (vorher wurden sie verschluckt) und die Version bleibt lesbar.
// 3. Startet die neue Version bei jemandem nicht: Vorversion sofort wieder veröffentlichen (Pages), danach prüfen.
//    Der Server (Worker) bleibt: seine Änderungen sind abwärtsverträglich, die Vorversion läuft damit.
// Aufruf: node scripts/nach-release.mjs test|production --prev <ordner der vorversion> [--minuten 10] [--seit <ms>]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { webkit } from '@playwright/test';
import { TARGETS, releaseEnvironment } from './veroeffentlichen.mjs';
import { swVersion } from './lib/livebuild.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PAGES = { test: { project: 'stamio-test', toml: 'pages/wrangler.test.toml' }, production: { project: 'coach-app-efc7', toml: 'pages/wrangler.prod.toml' } };
const wrangler = (args, cwd = path.join(ROOT, 'server')) => spawnSync(process.execPath, [path.join(ROOT, 'server', 'node_modules', 'wrangler', 'bin', 'wrangler.js'), ...args], { cwd, env: releaseEnvironment(), encoding: 'utf8' });

export async function liveSmoke(url) {
  const browser = await webkit.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'de-DE' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(url + '/?nach_release=' + Date.now());
    let state = null; const t0 = Date.now();
    while (Date.now() - t0 < 20000) { state = await page.locator('#app').getAttribute('data-app-state').catch(() => null); if (state === 'ready' || state === 'error') break; await page.waitForTimeout(300); }
    return { ok: state === 'ready' && !errors.length, state, errors };
  } finally { await browser.close(); }
}
export function startErrors(target, since, version) {
  const t = TARGETS[target];
  const sql = `SELECT e.user_id, e.msg, e.place, e.version, e.at FROM error_log e LEFT JOIN users u ON u.id = e.user_id WHERE e.at >= ${Math.floor(since)} AND e.place LIKE 'start:%' AND COALESCE(u.test, 0) = 0 ORDER BY e.id DESC LIMIT 50`;
  const r = wrangler(['d1', 'execute', t.db, '--remote', '--json', '--command', sql, ...(target === 'test' ? ['--env', 'test'] : [])]);
  if (r.status !== 0) throw new Error('Fehlerprotokoll nicht lesbar: ' + (r.stderr || r.stdout).slice(-300));
  const rows = (JSON.parse(r.stdout)[0] || {}).results || [];
  return rows.filter(x => !version || x.version === version);
}
export function rollback(target, prevDir) {
  const p = PAGES[target];
  fs.copyFileSync(path.join(ROOT, p.toml), path.join(ROOT, 'pages', 'wrangler.toml'));
  const r = wrangler(['pages', 'deploy', path.resolve(prevDir), '--project-name', p.project, '--branch', 'main', '--commit-dirty=true'], path.join(ROOT, 'pages'));
  if (r.status !== 0) throw new Error('Zurückrollen fehlgeschlagen: ' + (r.stderr || r.stdout).slice(-400));
}
async function liveVersion(url) { const r = await fetch(url + '/sw.js?v=' + Date.now(), { cache: 'no-store' }); return swVersion(await r.text()); }

export async function watchRelease(target, { prevDir, minutes = 10, since = Date.now(), log = console.log, wait = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const t = TARGETS[target];
  const version = await liveVersion(t.url);
  const prevVersion = prevDir ? swVersion(fs.readFileSync(path.join(prevDir, 'sw.js'), 'utf8')) : null;
  log(`Nach dem Release: ${t.url} Version ${version}${prevVersion ? ', Rückweg ' + prevVersion : ''}`);
  const back = async why => {
    log('STARTFEHLER: ' + why);
    if (!prevDir || prevVersion === version) { log('Kein Rückweg vorhanden – bitte sofort von Hand prüfen.'); return { ok: false, rolledBack: false, why }; }
    rollback(target, prevDir);
    for (let i = 0; i < 10 && (await liveVersion(t.url)) !== prevVersion; i++) await wait(3000);
    const now = await liveVersion(t.url);
    log(now === prevVersion ? `Zurückgerollt auf ${prevVersion}.` : `Zurückrollen angestoßen, live ist noch ${now}.`);
    return { ok: false, rolledBack: now === prevVersion, why };
  };
  const smoke = await liveSmoke(t.url);
  if (!smoke.ok) return back(`Startbildschirm erscheint nicht (${smoke.state}; ${smoke.errors.join(' | ')})`);
  log('Startbildschirm im Browser: ok');
  const end = Date.now() + minutes * 60000;
  for (;;) {
    const rows = startErrors(target, since, version);
    if (rows.length) return back(`${rows.length} Startfehler der neuen Version (Nutzer ${[...new Set(rows.map(r => r.user_id))].join(', ')}): ${rows[0].msg}`);
    if (Date.now() >= end) break;
    await wait(60000);
  }
  log(`Keine Startfehler der neuen Version in ${minutes} Minuten.`);
  return { ok: true, rolledBack: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const target = process.argv[2];
  if (!TARGETS[target]) { console.error('Aufruf: node scripts/nach-release.mjs test|production --prev <ordner> [--minuten 10] [--seit <ms>]'); process.exit(2); }
  const r = await watchRelease(target, { prevDir: arg('prev', null), minutes: +arg('minuten', '10'), since: +arg('seit', String(Date.now())) });
  process.exit(r.ok ? 0 : 1);
}
