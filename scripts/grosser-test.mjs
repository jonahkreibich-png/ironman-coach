/* Auftrag 36, Punkt 5: genau EIN großer Test am Ende (Ziel unter 45 min, höchstens 60 min), parallel.
   1. Build genau einmal (die Browser-Tests nutzen dist/).
   2. Gleichzeitig: Typprüfung · Unit-Tests · große Simulation (36 erfundene Nutzer, 12–24 Monate, viele Worker) ·
      Browser: die ~40 wichtigsten Abläufe (WebKit iPhone + Chromium) in mehreren Teilen mit je eigenem Test-Server.
   3. Coach: Der große Test ruft keine KI. Die Simulation nutzt die eingebaute Coach-Engine (gleiche Wege wie die App ohne KI), die
      Coach-Prüfer laufen mit den gespeicherten Antworten aus den Tests. Ein voller KI-Lauf (scripts/ki-vergleich25.ts) nur, wenn sich am
      Coach etwas geändert hat UND ein Schlüssel da ist (KI_LAUF=1 erzwingt ihn).
   Ergebnis: Dauer jedes Teils, simulierte Nutzer/Tage/Aktionen, langsamste Tests → test-results/grosser-test.json, Exit 1 bei Rot.
   Aufruf: node scripts/grosser-test.mjs   (Optionen: SIM_WORKERS=8 PW_SHARDS=3 UNIT_WORKERS=3) */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

const CPU = os.cpus().length;
const SIM_WORKERS = Number(process.env.SIM_WORKERS || Math.max(4, Math.min(8, CPU - 8)));
const PW_SHARDS = Number(process.env.PW_SHARDS || 3);
const UNIT_WORKERS = Number(process.env.UNIT_WORKERS || 3);
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const t00 = Date.now();
const parts = {};
fs.mkdirSync('test-results', { recursive: true });

function run(name, cmd, args, env = {}) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const out = fs.createWriteStream(`test-results/gross-${name}.log`);
    const p = spawn(cmd, args, { env: { ...process.env, ...env, FORCE_COLOR: '0' }, shell: process.platform === 'win32' });
    p.stdout.pipe(out); p.stderr.pipe(out);
    p.on('close', code => { const sec = Math.round((Date.now() - t0) / 1000); parts[name] = { ok: code === 0, sec }; console.log(`${code === 0 ? 'OK ' : 'ROT'} ${name}: ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} min`); resolve(code === 0); });
  });
}
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

console.log(`Großer Test: ${CPU} Kerne · Simulation ${SIM_WORKERS} Worker · Browser ${PW_SHARDS} Teile · Unit ${UNIT_WORKERS} Worker`);
const okBuild = await run('build', npx, ['vite', 'build']);
if (!okBuild) { console.log('Build rot – Abbruch.'); process.exit(1); }
fs.rmSync('test-results/sim36', { recursive: true, force: true });
const jobs = [
  run('typecheck', npx, ['tsc', '--noEmit', '-p', 'tsconfig.json']),
  run('unit', npx, ['vitest', 'run', `--maxWorkers=${UNIT_WORKERS}`, '--reporter=default', '--reporter=json', '--outputFile=test-results/gross-unit.json']),
  run('simulation', npx, ['vitest', 'run', '--config', 'vitest.sim.config.ts', '--reporter=default', '--reporter=json', '--outputFile=test-results/gross-sim.json'], { SIM_WORKERS: String(SIM_WORKERS) }),
  ...Array.from({ length: PW_SHARDS }, (_, i) => run(`browser-${i + 1}`, npx, ['playwright', 'test', '--config', 'playwright.gross.config.ts', `--shard=${i + 1}/${PW_SHARDS}`], { PW_PORT: String(4181 + i) }))
];
// KI nur bei Coach-Änderung und vorhandenem Schlüssel
let ki = 'übersprungen';
try {
  const changed = execSync('git diff --name-only main -- shared/coach', { encoding: 'utf8' }).trim();
  if (process.env.KI_LAUF === '1' || (changed && process.env.ANTHROPIC_API_KEY)) jobs.push(run('ki', npx, ['vite-node', 'scripts/ki-vergleich25.ts']).then(ok => { ki = ok ? 'gelaufen' : 'rot'; return ok; }));
  else ki = changed ? 'übersprungen (Coach geändert, aber kein KI-Schlüssel lokal – gespeicherte Antworten geprüft)' : 'übersprungen (Coach unverändert)';
} catch { ki = 'übersprungen (kein git-Vergleich)'; }
const results = await Promise.all(jobs);

// Auswertung: Simulation
const sim = { users: 0, days: 0, actions: 0, byAction: {}, failures: 0, dcNight: {}, slowest: [] };
for (const f of fs.existsSync('test-results/sim36') ? fs.readdirSync('test-results/sim36') : []) {
  const r = JSON.parse(fs.readFileSync(`test-results/sim36/${f}`, 'utf8'));
  sim.users++; sim.days += r.days; sim.failures += r.failures.length;
  for (const [k, v] of Object.entries(r.actions)) { sim.byAction[k] = (sim.byAction[k] || 0) + v; sim.actions += v; }
  for (const [k, v] of Object.entries(r.dcNight)) sim.dcNight[k] = (sim.dcNight[k] || 0) + v;
  sim.slowest.push({ id: r.id, sec: Math.round(r.wallMs / 1000), weeks: r.weeks });
}
sim.slowest = sim.slowest.sort((a, b) => b.sec - a.sec).slice(0, 5);
// langsamste Tests
const slowUnit = (() => { try { const j = JSON.parse(fs.readFileSync('test-results/gross-unit.json', 'utf8')); return j.testResults.flatMap(f => f.assertionResults.map(a => ({ t: `${f.name.replace(/.*tests[\\/]/, '')} › ${a.title}`, ms: a.duration || 0 }))).sort((a, b) => b.ms - a.ms).slice(0, 8); } catch { return []; } })();
const browser = { tests: 0, failed: 0, slowest: [] };
for (let i = 0; i < PW_SHARDS; i++) { try { const j = JSON.parse(fs.readFileSync(`test-results/gross-pw-${4181 + i}.json`, 'utf8')); const walk = s => [...(s.specs || []).flatMap(sp => sp.tests.map(t => ({ t: `${sp.file} › ${sp.title} [${t.projectName}]`, ms: (t.results[0] || {}).duration || 0, ok: t.status === 'expected' || t.status === 'skipped', skip: t.status === 'skipped' }))), ...(s.suites || []).flatMap(walk)]; const list = j.suites.flatMap(walk); browser.tests += list.filter(x => !x.skip).length; browser.skipped = (browser.skipped || 0) + list.filter(x => x.skip).length; browser.failed += list.filter(x => !x.ok).length; browser.slowest.push(...list); } catch { /* Teil ohne Bericht */ } }
browser.slowest = browser.slowest.sort((a, b) => b.ms - a.ms).slice(0, 6).map(x => ({ t: x.t, sec: Math.round(x.ms / 1000) }));
const total = Math.round((Date.now() - t00) / 1000);
const ok = results.every(Boolean);
const report = { at: new Date().toISOString(), ok, totalSec: total, parts, ki, sim, browser, slowUnit: slowUnit.map(x => ({ t: x.t, sec: Math.round(x.ms / 1000) })) };
fs.writeFileSync('test-results/grosser-test.json', JSON.stringify(report, null, 1));
console.log(`\nGesamt: ${mmss(total)} min ${ok ? 'GRÜN' : 'ROT'}`);
console.log(`Simulation: ${sim.users} Nutzer, ${sim.days} Tage, ${sim.actions} Aktionen, ${sim.failures} Fehler, Daten-Check nachts: ${JSON.stringify(sim.dcNight)}`);
console.log(`Browser: ${browser.tests} Abläufe (beide Browser), ${browser.failed} rot, ${browser.skipped || 0} übersprungen (nur für einen Browser)`);
console.log(`KI: ${ki}`);
console.log('Langsamste Simulation:', sim.slowest.map(x => `${x.id} ${x.sec}s`).join(', '));
console.log('Langsamste Unit-Tests:', report.slowUnit.slice(0, 5).map(x => `${x.t} ${x.sec}s`).join(' | '));
console.log('Langsamste Browser-Tests:', browser.slowest.map(x => `${x.t} ${x.sec}s`).join(' | '));
process.exit(ok ? 0 : 1);
