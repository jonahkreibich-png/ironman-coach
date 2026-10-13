// Kopie der echten Datenbank (alter Aufbau) auf den neuen Stand bringen.
// Die echte Datenbank wurde mit einer früheren Fassung von 0001 angelegt (ohne Tabelle error_log). 0001 besteht nur aus
// „CREATE … IF NOT EXISTS“ und „INSERT OR IGNORE“; erneut ausgeführt ergänzt es genau das Fehlende und ändert nichts Vorhandenes.
// Danach werden 0001 als angewendet markiert und alle weiteren Migrationen der Reihe nach ausgeführt.
// db: node:sqlite DatabaseSync (lokal). Für die echte D1-Datenbank macht scripts/release.md dieselben Schritte mit wrangler.
import fs from 'node:fs';
import path from 'node:path';

export function upgradeCopy(db, migDir) {
  db.exec(fs.readFileSync(path.join(migDir, '0001_initial.sql'), 'utf8'));
  db.exec('CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);');
  db.exec("INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0001_initial.sql');");
  const done = new Set(db.prepare('SELECT name FROM d1_migrations').all().map(r => r.name));
  const applied = [];
  for (const f of fs.readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    db.exec(fs.readFileSync(path.join(migDir, f), 'utf8'));
    db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(f);
    applied.push(f);
  }
  return applied;
}
