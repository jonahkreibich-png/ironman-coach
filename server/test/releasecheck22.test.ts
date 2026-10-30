/* Auftrag 22: Release-Prüfung mit einer Kopie der Daten – Umstellung, alle Nutzer laden fehlerfrei, sonst Release anhalten. */
import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { releaseDataCheck } from '../../scripts/release-datacheck';
import { applyOnboarding } from '../../shared/onboarding';
import { PERSONAS, PERSONA_TODAY } from '../../fixtures/personas';

test('Kopie mit zwei Nutzern: Umstellung ohne Verlust, beide laden fehlerfrei; kaputter Plan hält an', async () => {
  const dir = fs.mkdtempSync(path.join(process.cwd(), 'scratch', 'releasecheck-'));
  const file = path.join(dir, 'kopie.sqlite');
  const db = new DatabaseSync(file);
  db.exec(fs.readFileSync('server/migrations/0001_initial.sql', 'utf8'));
  db.exec('CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);');
  db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run('0001_initial.sql');
  // die letzte Migration bleibt offen: die Prüfung wendet sie an der Kopie an
  const migs = fs.readdirSync('server/migrations').filter(f => f.endsWith('.sql') && f !== '0001_initial.sql').sort();
  for (const f of migs.slice(0, -1)) { db.exec(fs.readFileSync('server/migrations/' + f, 'utf8')); db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(f); }
  const r = applyOnboarding(PERSONAS[0].answers, PERSONA_TODAY);
  let rev = 1;
  const put = (uid: number, kind: string, key: string, data: any) => db.prepare('INSERT INTO records (user_id, kind, key, data, updated_at, deleted, rev) VALUES (?, ?, ?, ?, 1, 0, ?)').run(uid, kind, key, JSON.stringify(data), rev++);
  for (const uid of [1, 2]) { put(uid, 'plan', 'main', r.gen!.plan); put(uid, 'profile', 'main', r.profile); }
  db.close();
  const ok = await releaseDataCheck(file, PERSONA_TODAY);
  expect(ok.migrated.length).toBe(1);
  expect(ok.ok).toBe(true); expect(ok.users.map(u => u.uid)).toEqual([1, 2]); expect(ok.counts.before).toBe(ok.counts.after);
  const db2 = new DatabaseSync(file); db2.prepare("UPDATE records SET data = '{\"weeks\": 7}' WHERE user_id = 2 AND kind = 'plan'").run(); db2.close();
  const bad = await releaseDataCheck(file, PERSONA_TODAY);
  expect(bad.ok).toBe(false); expect(bad.users.find(u => u.uid === 2)!.errors.length).toBeGreaterThan(0);
  fs.rmSync(dir, { recursive: true, force: true });
}, 120_000);
