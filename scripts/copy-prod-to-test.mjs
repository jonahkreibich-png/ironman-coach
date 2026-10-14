// Kopiert deine Daten aus der echten App in die Test-App und testet dabei die Datenbank-Umstellung an der Kopie.
// Die echte Datenbank wird nur gelesen (Export), nie verändert.
// Aufruf (im Projektordner): node scripts/copy-prod-to-test.mjs <echte-db>     z. B. ironman (alt) oder coach-db-efc7 (neu, schon umgestellt)
// Ablauf:
//  1) echte Datenbank exportieren (Sicherung in data-export/, nicht im Repo), Test-Datenbank ebenfalls sichern
//  2) Kopie lokal auf den neuen Aufbau bringen (scripts/lib/upgrade-copy.mjs) und Zahlen vergleichen
//  3) in der Test-Datenbank nur die Daten von Nutzer 1 (Betreiber) ersetzen: alte als gelöscht markieren, die kopierten mit neuen
//     Revisionsnummern eintragen, Geräte von Nutzer 1 laden beim nächsten Öffnen alles neu. Test-Nutzer (z. B. Papa) bleiben unberührt.
//  4) Zahlen je Art in der Test-Datenbank mit der Kopie vergleichen
import { execSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { upgradeCopy } from './lib/upgrade-copy.mjs';

const SOURCE = process.argv[2] || 'ironman';
const env = { ...process.env, NODE_USE_SYSTEM_CA: '1' };
if (fs.existsSync('C:\\ProgramData\\Norton\\Antivirus\\wscert.pem')) env.NODE_EXTRA_CA_CERTS = 'C:\\ProgramData\\Norton\\Antivirus\\wscert.pem';
const wr = 'node node_modules/wrangler/bin/wrangler.js';
const run = cmd => { console.log('> ' + cmd.slice(0, 160)); return execSync(cmd, { cwd: 'server', env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 50e6 }); };
const q = sql => JSON.parse(run(`${wr} d1 execute stamio-test --env test --remote --json --command "${sql}"`))[0].results;
const day = new Date().toISOString().slice(0, 10);
fs.mkdirSync('data-export', { recursive: true });

// 1) Sicherungen
const dump = `data-export/prod-${day}.sql`;
run(`${wr} d1 export ${SOURCE} --remote --output=../${dump}`);
run(`${wr} d1 export stamio-test --env test --remote --output=../data-export/test-vor-kopie-${day}-${Date.now()}.sql`);

// 2) lokal umstellen
const local = `data-export/prod-${day}-migriert.sqlite`;
if (fs.existsSync(local)) fs.unlinkSync(local);
const db = new DatabaseSync(local);
db.exec(fs.readFileSync(dump, 'utf8'));
const liveBefore = db.prepare('SELECT COUNT(*) AS n FROM records WHERE deleted = 0').get().n;
upgradeCopy(db, 'server/migrations');
const rows = db.prepare('SELECT kind, key, data, updated_at, deleted, src FROM records WHERE user_id = 1 ORDER BY rev').all();
const want = Object.fromEntries(db.prepare('SELECT kind, COUNT(*) AS n FROM records WHERE user_id = 1 AND deleted = 0 GROUP BY kind').all().map(r => [r.kind, r.n]));
if (rows.filter(r => !r.deleted).length !== liveBefore) { console.error('ACHTUNG: Umstellung verliert Datensätze. Abbruch, nichts kopiert.'); process.exit(1); }
console.log(`Kopie umgestellt: ${liveBefore} Datensätze, je Art: ${JSON.stringify(want)}`);

// 3) in der Test-Datenbank nur Nutzer 1 ersetzen
const s = v => v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const now = Date.now();
const base = +q("SELECT v FROM meta WHERE k = 'rev'")[0].v;
const keys = new Set(rows.map(r => r.kind + '\u0000' + r.key));
const old = q('SELECT kind, key FROM records WHERE user_id = 1 AND deleted = 0').filter(r => !keys.has(r.kind + '\u0000' + r.key));
let rev = base; const out = [];
for (const r of old) out.push(`UPDATE records SET deleted = 1, data = NULL, updated_at = ${now}, rev = ${++rev} WHERE user_id = 1 AND kind = ${s(r.kind)} AND key = ${s(r.key)};`);
// große Datensätze (z. B. ein langer Plan) in Stücken, D1 erlaubt höchstens 100 KB pro Anweisung
out.push('CREATE TABLE IF NOT EXISTS tmp_copy (k INTEGER NOT NULL, i INTEGER NOT NULL, part TEXT NOT NULL);', 'DELETE FROM tmp_copy;');
rows.forEach((r, n) => {
  const data = r.data == null ? null : String(r.data);
  if (data == null || data.length < 40000) { out.push(`INSERT OR REPLACE INTO records (user_id, kind, key, data, updated_at, deleted, rev, src) VALUES (1, ${s(r.kind)}, ${s(r.key)}, ${s(data)}, ${s(r.updated_at)}, ${r.deleted ? 1 : 0}, ${++rev}, ${s(r.src)});`); return; }
  for (let i = 0, k = 0; i < data.length; i += 40000, k++) out.push(`INSERT INTO tmp_copy (k, i, part) VALUES (${n}, ${k}, ${s(data.slice(i, i + 40000))});`);
  out.push(`INSERT OR REPLACE INTO records (user_id, kind, key, data, updated_at, deleted, rev, src) VALUES (1, ${s(r.kind)}, ${s(r.key)}, (SELECT group_concat(part, '') FROM (SELECT part FROM tmp_copy WHERE k = ${n} ORDER BY i)), ${s(r.updated_at)}, ${r.deleted ? 1 : 0}, ${++rev}, ${s(r.src)});`);
});
out.push('DROP TABLE tmp_copy;');
out.push(`UPDATE meta SET v = '${rev}' WHERE k = 'rev';`);
out.push(`INSERT INTO user_meta (user_id, k, v) VALUES (1, 'reset_at', '${now}') ON CONFLICT (user_id, k) DO UPDATE SET v = excluded.v;`);
fs.writeFileSync('data-export/kopie-in-test.sql', out.join('\n') + '\n');
run(`${wr} d1 execute stamio-test --env test --remote --file=../data-export/kopie-in-test.sql --yes`);

// 4) vergleichen
const got = Object.fromEntries(q('SELECT kind, COUNT(*) AS n FROM records WHERE user_id = 1 AND deleted = 0 GROUP BY kind').map(r => [r.kind, r.n]));
const ok = JSON.stringify(Object.entries(got).sort()) === JSON.stringify(Object.entries(want).sort());
console.log(`In der Test-App (Nutzer 1) je Art: ${JSON.stringify(got)}`);
console.log(ok ? 'OK: alle Datensätze sind in der Test-App angekommen.' : 'ACHTUNG: Anzahl stimmt nicht. Bitte nicht freigeben und Claude die Ausgabe zeigen.');
process.exit(ok ? 0 : 1);
