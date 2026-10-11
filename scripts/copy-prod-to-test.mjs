// Kopiert die Daten der echten App in die Testumgebung und testet dabei die Datenbank-Umstellung (Migration 0002) an der Kopie.
// Die echte Datenbank wird nur gelesen (Export), nie verändert.
// Aufruf (im Projektordner): node scripts/copy-prod-to-test.mjs
// Ergebnis: data-export/prod-JJJJ-MM-TT.sql (Sicherung, nicht im Repo) und eine Test-Datenbank mit deinen echten Daten.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const env = { ...process.env, NODE_USE_SYSTEM_CA: '1' };
if (fs.existsSync('C:\\ProgramData\\Norton\\Antivirus\\wscert.pem')) env.NODE_EXTRA_CA_CERTS = 'C:\\ProgramData\\Norton\\Antivirus\\wscert.pem';
const wr = process.platform === 'win32' ? 'npx.cmd wrangler' : 'npx wrangler';
const run = cmd => { console.log('> ' + cmd); return execSync(cmd, { cwd: 'server', env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }); };
const day = new Date().toISOString().slice(0, 10);
fs.mkdirSync('data-export', { recursive: true });
const dump = `../data-export/prod-${day}.sql`;

// 1) Echte Datenbank exportieren (nur lesen)
run(`${wr} d1 export ironman --remote --output=${dump}`);
console.log('Sicherung der echten Daten: data-export/prod-' + day + '.sql');

// 2) Test-Datenbank leeren (nur stamio-test!)
const tables = JSON.parse(run(`${wr} d1 execute stamio-test --env test --remote --json --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"`))[0].results.map(r => r.name);
if (tables.length) {
  fs.writeFileSync('data-export/drop.sql', 'PRAGMA foreign_keys=OFF;\n' + tables.map(t => `DROP TABLE IF EXISTS "${t}";`).join('\n') + '\n');
  run(`${wr} d1 execute stamio-test --env test --remote --file=../data-export/drop.sql --yes`);
}

// 3) Kopie einspielen (alter Aufbau) und als „0001 angewendet“ markieren
run(`${wr} d1 execute stamio-test --env test --remote --file=${dump} --yes`);
fs.writeFileSync('data-export/mark.sql', `CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0001_initial.sql');
-- Keine Mitteilungen aus der Testumgebung an deine echten Geräte
DELETE FROM push_subs;\n`);
run(`${wr} d1 execute stamio-test --env test --remote --file=../data-export/mark.sql --yes`);

// 4) Umstellung auf mehrere Nutzer an der Kopie ausführen
run(`${wr} d1 migrations apply stamio-test --env test --remote`);

// 5) Prüfen: gleiche Anzahl Datensätze wie in der Sicherung
const count = q => JSON.parse(run(`${wr} d1 execute stamio-test --env test --remote --json --command "${q}"`))[0].results[0].n;
const recs = count('SELECT COUNT(*) AS n FROM records'), devs = count('SELECT COUNT(*) AS n FROM devices');
const inDump = (fs.readFileSync(dump.replace('../', ''), 'utf8').match(/INSERT INTO "?records"? /g) || []).length;
console.log(`Datensätze in der Sicherung: ${inDump}, in der Test-Datenbank nach der Umstellung: ${recs}, Geräte: ${devs}`);
if (inDump && recs !== inDump) { console.error('ACHTUNG: Anzahl stimmt nicht. Bitte nicht freigeben und Claude die Ausgabe zeigen.'); process.exit(1); }
console.log('Fertig. Öffne https://stamio-test.pages.dev und verbinde das iPhone mit dem Einrichtungscode.');
