// Sicherer Veröffentlichungsablauf für die bereits eingerichteten Cloudflare-Projekte.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
export const TARGETS = Object.freeze({
  test: { db: 'stamio-test', url: 'https://stamio-test.pages.dev', env: 'test' },
  production: { db: 'coach-db-efc7', url: 'https://coach-app-efc7.pages.dev', env: 'production' }
});
const digest = value => createHash('sha256').update(value).digest('hex');

export function releaseEnvironment(base = process.env) {
  const env = { ...base, NODE_USE_SYSTEM_CA: '1', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: path.join(ROOT, 'scratch', 'wrangler-logs') };
  const cert = 'C:\\ProgramData\\Norton\\Antivirus\\wscert.pem';
  if (fs.existsSync(cert)) env.NODE_EXTRA_CA_CERTS = cert;
  return env;
}
function runNode(args, cwd = ROOT, extra = {}) {
  const r = spawnSync(process.execPath, args, { cwd, env: { ...releaseEnvironment(), ...extra }, stdio: 'inherit' });
  if (r.error || r.status !== 0) throw new Error('Schritt fehlgeschlagen. Veröffentlichung angehalten.');
}
function execute(step) {
  if (step.kind === 'checks') {
    const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (!fs.existsSync(npm)) throw new Error('npm-cli.js wurde nicht gefunden. Node.js-Installation prüfen.');
    // Auftrag 22: vor großen Releases (STAMIO_LONG=1) die lange Langzeit-Simulation (52 Wochen) und 5.000 Zufallsfälle
    runNode([npm, 'run', 'test:all'], ROOT, { VITE_APP_ENV: 'test', ...(process.env.STAMIO_LONG === '1' ? { LT_LONG: '1', FUZZ_N: '5000' } : {}) });
  } else if (step.kind === 'backup') {
    fs.mkdirSync(path.dirname(step.file), { recursive: true });
    const args = [path.join(ROOT, 'server', 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'd1', 'export', TARGETS[step.target].db, '--remote', '--output', step.file, '--skip-confirmation'];
    if (step.target === 'test') args.push('--env', 'test');
    runNode(args, path.join(ROOT, 'server'));
  } else if (step.kind === 'realdata') {
    // Auftrag 22: Umstellung und Laden aller Nutzer an einer Kopie der echten Daten (die Sicherung von eben)
    runNode([path.join(ROOT, 'node_modules', 'vite-node', 'vite-node.mjs'), path.join(ROOT, 'scripts', 'release-check-cli.ts'), step.file]);
  } else if (step.kind === 'bookmark') {
    // Auftrag 22: Rückweg – Zeitpunkt der Datenbank vor dem Release (D1 Time Travel, kostenlos 7 Tage) festhalten
    const r = spawnSync(process.execPath, [path.join(ROOT, 'server', 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'd1', 'time-travel', 'info', TARGETS[step.target].db], { cwd: path.join(ROOT, 'server'), env: releaseEnvironment(), encoding: 'utf8' });
    fs.writeFileSync(step.file, `Rückweg ${TARGETS[step.target].db}, Version ${VERSION}
Zurück: wrangler d1 time-travel restore ${TARGETS[step.target].db} --bookmark=<bookmark unten>
Code: wrangler rollback (Worker), Pages: vorherige Bereitstellung im Cloudflare-Dashboard

${r.stdout || ''}${r.stderr || ''}`);
    if (r.status !== 0) throw new Error('Rückweg-Zeitpunkt nicht lesbar (Sicherung liegt trotzdem in data-export).');
  } else if (step.kind === 'deploy') runNode([path.join(ROOT, 'scripts', 'deploy.mjs'), step.target]);
  else throw new Error('Unbekannter Veröffentlichungsschritt.');
}
export function verifyBackup(file) {
  const sql = fs.readFileSync(file);
  if (sql.length < 100) throw new Error('Die Sicherung ist leer oder unvollständig.');
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  try {
    db.exec(sql.toString('utf8'));
    const tables = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('users','records')").get();
    const integrity = db.prepare('PRAGMA integrity_check').get();
    if (tables.n !== 2 || integrity.integrity_check !== 'ok') throw new Error('schema');
  } catch {
    throw new Error('Die Sicherung ist nicht als vollständige App-Datenbank lesbar. Veröffentlichung angehalten.');
  } finally { db.close(); }
  return { bytes: sql.length, sha256: digest(sql) };
}
export async function verifyDeployment(target, { fetchImpl = fetch, dist = path.join(ROOT, 'dist'), attempts = 6, wait = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const t = TARGETS[target];
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const asset = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(m => m[1]).find(s => /(?:^|\/)assets\/[^/]+\.js$/.test(s));
  if (!asset) throw new Error('Lokaler Produktionsbuild fehlt.');
  const expected = new URL(asset, t.url + '/');
  if (expected.origin !== t.url) throw new Error('Unerwartete Asset-Adresse im Build.');
  const localJs = fs.readFileSync(path.join(dist, expected.pathname.slice(1)));
  const localSw = fs.readFileSync(path.join(dist, 'sw.js'));
  const get = async url => {
    const u = new URL(url); u.searchParams.set('release_check', String(Date.now()));
    const response = await fetchImpl(u.href, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('HTTP ' + response.status + ' bei der Veröffentlichungsprüfung.');
    return response;
  };
  let last;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const health = await (await get(t.url + '/api/health')).json();
      if (!health.ok || health.env !== t.env || health.app !== 'Stamio') throw new Error('Server meldet nicht die erwartete App-Umgebung.');
      const liveHtml = await (await get(t.url + '/')).text();
      if (!liveHtml.includes(expected.pathname.slice(1))) throw new Error('Die App liefert noch nicht den erwarteten Build.');
      const liveJs = Buffer.from(await (await get(expected.href)).arrayBuffer());
      const liveSw = Buffer.from(await (await get(t.url + '/sw.js')).arrayBuffer());
      if (digest(liveJs) !== digest(localJs) || digest(liveSw) !== digest(localSw)) throw new Error('App oder Service Worker stimmen nicht mit dem lokalen Build überein.');
      console.log('Geprüft: ' + t.url);
      return;
    } catch (e) { last = e; if (attempt + 1 < attempts) await wait(2000); }
  }
  throw last;
}
export async function publishRelease({ run = execute, checkBackup = verifyBackup, verify = verifyDeployment, now = new Date() } = {}) {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  await run({ kind: 'checks' });
  for (const target of ['test', 'production']) {
    const file = path.join(ROOT, 'data-export', `${target}-vor-${VERSION}-${stamp}.sql`);
    await run({ kind: 'backup', target, file });
    const backup = await checkBackup(file);
    console.log('Sicherung geprüft: ' + file + ' (' + backup.bytes + ' Bytes)');
    if (target === 'production') {
      await run({ kind: 'realdata', target, file });
      try { await run({ kind: 'bookmark', target, file: file.replace(/\.sql$/, '-rueckweg.txt') }); } catch (e) { console.log('Hinweis: ' + e.message); }
    }
    await run({ kind: 'deploy', target });
    await verify(target);
  }
  console.log('Veröffentlicht und geprüft: ' + TARGETS.production.url + ' — Version ' + VERSION);
  // Auftrag 21: nur die 5 neuesten Sicherungen je Umgebung unverändert behalten, ältere komprimieren
  try { const { prune } = await import('./prune-backups.mjs'); const p = await prune(); console.log(`Sicherungen aufgeräumt: ${p.keep.length} behalten, ${p.compress.length} komprimiert`); } catch (e) { console.log('Aufräumen der Sicherungen übersprungen: ' + e.message); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SELF)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && !['--plan', '--help'].includes(args[0]))) {
    console.error('Aufruf: node scripts/veroeffentlichen.mjs [--plan|--help]');
    process.exitCode = 1;
  } else if (args[0] === '--help') {
    console.log('Aufruf: node scripts/veroeffentlichen.mjs — Tests, Sicherungen, Testumgebung und echte App.');
    console.log('--plan zeigt den Ablauf ohne Netzwerkaufrufe.');
  } else if (args[0] === '--plan') {
    console.log('Version ' + VERSION + ': alle Tests → Testsicherung prüfen → Testdeploy prüfen → Produktionssicherung prüfen → Produktionsdeploy prüfen.');
    console.log('Plananzeige: keine Netzwerkaufrufe und keine Veröffentlichung.');
  } else if (process.env.STAMIO_RELEASE_READY !== '1') {
    // CA-Konfiguration muss bereits beim Start des Prozesses gesetzt sein.
    const r = spawnSync(process.execPath, [SELF], { cwd: ROOT, env: { ...releaseEnvironment(), STAMIO_RELEASE_READY: '1' }, stdio: 'inherit' });
    process.exitCode = r.error ? 1 : (r.status ?? 1);
  } else {
    publishRelease().catch(e => { console.error(e.message); process.exitCode = 1; });
  }
}
