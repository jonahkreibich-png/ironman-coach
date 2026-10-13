// Spielt eine Sicherung der echten Datenbank (alter Aufbau, Stand 0001) lokal ein, wendet die Migrationen 0002 ff. an
// und vergleicht die Zahlen. Die echte Datenbank wird dabei nicht berührt.
// Aufruf: node scripts/migrate-copy.mjs data-export/prod-JJJJ-MM-TT.sql [ausgabe.sqlite]
// Ergebnis: eine lokale SQLite-Datei mit dem neuen Aufbau und eine Übersicht (Datensätze je Art) zum Vergleichen.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { upgradeCopy } from './lib/upgrade-copy.mjs';

const [dump, out = 'data-export/kopie-migriert.sqlite'] = process.argv.slice(2);
if (!dump) { console.error('Aufruf: node scripts/migrate-copy.mjs <sicherung.sql> [ausgabe.sqlite]'); process.exit(1); }
if (fs.existsSync(out)) fs.unlinkSync(out);
const db = new DatabaseSync(out);
const sql = fs.readFileSync(dump, 'utf8');
db.exec(sql);
const count = (q) => db.prepare(q).get().n;
const before = {
  records: count('SELECT COUNT(*) AS n FROM records'),
  live: count('SELECT COUNT(*) AS n FROM records WHERE deleted = 0'),
  devices: count('SELECT COUNT(*) AS n FROM devices'),
  byKind: Object.fromEntries(db.prepare('SELECT kind, COUNT(*) AS n FROM records WHERE deleted = 0 GROUP BY kind ORDER BY kind').all().map(r => [r.kind, r.n]))
};
for (const m of upgradeCopy(db, 'server/migrations')) console.log('angewendet: ' + m);
const after = {
  records: count('SELECT COUNT(*) AS n FROM records'),
  live: count('SELECT COUNT(*) AS n FROM records WHERE deleted = 0 AND user_id = 1'),
  devices: count('SELECT COUNT(*) AS n FROM devices'),
  users: db.prepare('SELECT id, name, role FROM users').all().map(r => ({ ...r })),
  byKind: Object.fromEntries(db.prepare('SELECT kind, COUNT(*) AS n FROM records WHERE deleted = 0 GROUP BY kind ORDER BY kind').all().map(r => [r.kind, r.n]))
};
console.log(JSON.stringify({ before, after }, null, 1));
const same = before.records === after.records && before.live === after.live && JSON.stringify(before.byKind) === JSON.stringify(after.byKind);
console.log(same ? 'OK: gleiche Zahl an Datensätzen vor und nach der Umstellung.' : 'ACHTUNG: Zahlen weichen ab.');
db.close();
process.exit(same ? 0 : 1);
