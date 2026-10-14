/* Auftrag 8: Plan ab dem nächsten Montag mit festem Wochenaufbau und Wochenvorgaben fortsetzen (Profil-Änderung + Neuplanung).
   Liest eine lokale Kopie der Datenbank (nur lesen) und die persönlichen Vorgaben (scripts/restore/<name>.local.json, nicht im Repository)
   und schreibt eine SQL-Datei für D1 (neuer Zeitstempel und neue Revision, die Geräte holen die Änderung beim nächsten Abgleich).
   Vergangene Wochen, erledigte Einheiten, Score-Kalibrierung und Verlauf bleiben. Das Skript selbst ändert nichts.
   Aufruf: npx vite-node scripts/plan-auftrag8.ts -- <kopie.sqlite> <vorgaben.local.json> <ausgabe.sql> [nutzer] */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { replanPlan } from '../shared/replan';
import { mergeProfile, profileFromLegacy } from '../shared/profile';
import { ownWeekMinutes } from '../shared/rules';
import * as C from '../shared/core';

const args = process.argv.slice(2).filter(a => a !== '--');
const [dbFile, cfgFile, outFile] = args; const uid = +(args[3] || 1);
if (!dbFile || !cfgFile || !outFile) { console.error('Aufruf: <kopie.sqlite> <vorgaben.local.json> <ausgabe.sql> [nutzer]'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
const db = new DatabaseSync(dbFile, { readOnly: true });
const recs = (db.prepare('SELECT kind, key, data FROM records WHERE user_id = ? AND deleted = 0').all(uid) as any[]).map(r => ({ kind: r.kind, key: r.key, data: JSON.parse(r.data) }));
const one = (kind: string) => (recs.find(r => r.kind === kind) || {} as any).data;
const dict = (kind: string) => Object.fromEntries(recs.filter(r => r.kind === kind).map(r => [r.key, r.data]));
const plan0 = one('plan');
const customWorkouts: any = {};
recs.filter(r => r.kind === 'custom').forEach(r => { const w = r.data; if (w && w.date) (customWorkouts[w.date] = customWorkouts[w.date] || []).push(w); });
const settingsRec = one('settings') || {};
const state: any = {
  sessions: dict('session'), customWorkouts, adjustments: dict('adjust'), activities: dict('activity'),
  trend: recs.filter(r => r.kind === 'trend').map(r => r.data).sort((a, b) => a.date.localeCompare(b.date)),
  illnessPeriods: recs.filter(r => r.kind === 'illness').map(r => r.data), settings: settingsRec.settings || {}
};
const cur = one('profile') || {};
const profile = mergeProfile({ ...cur, ...cfg.profilePatch, updatedAt: Date.now() }, profileFromLegacy({ ...state, planWeeks: plan0.weeks }, cfg.today), cfg.today);
state.profile = profile;
const goals = recs.filter(r => r.kind === 'goal').map(r => r.data);
const r = replanPlan(plan0, profile, goals, cfg.today, { state, adjustments: state.adjustments, stages: cfg.stages });
if (!r) { console.error('Kein Plan berechnet'); process.exit(1); }
const plan = r.plan;

// Prüfungen: nichts geht verloren, vergangene Wochen unverändert
const next = plan.weeks.find((w: any) => w.startDate > cfg.today).startDate;
const oldKept = plan0.weeks.filter((w: any) => w.startDate < next);
if (JSON.stringify(plan.weeks.slice(0, oldKept.length)) !== JSON.stringify(oldKept)) { console.error('Vergangene Wochen haben sich geändert'); process.exit(1); }
const ids = new Set(C.planDays(plan.weeks).flatMap((d: any) => d.sessions.map((s: any) => s.id)));
const doneLost = Object.entries(state.sessions).filter(([id, s]: any) => s && s.completed && !ids.has(id) && C.planDays(oldKept).some((d: any) => d.sessions.some((x: any) => x.id === id)));
if (doneLost.length) { console.error('Erledigte Einheiten fehlen: ' + doneLost.map(x => x[0]).join(', ')); process.exit(1); }
if (JSON.stringify(plan.meta.scoreCalibration) !== JSON.stringify(plan0.meta.scoreCalibration)) { console.error('Score-Kalibrierung geändert'); process.exit(1); }

const now = Date.now();
const out: { kind: string; key: string; data: any }[] = [
  { kind: 'plan', key: 'main', data: plan },
  { kind: 'profile', key: 'main', data: { ...profile, updatedAt: now } },
  { kind: 'coachMsg', key: 'msg-plan8-' + cfg.today, data: { id: 'msg-plan8-' + cfg.today, at: now, date: cfg.today, kind: 'adjust', from: 'coach', title: 'Plan ab ' + next.split('-').reverse().slice(0, 2).join('.') + '. angepasst', unread: true, important: true, text: cfg.message } }
];
const q = (s: string) => "'" + s.replace(/'/g, "''") + "'";
const sql: string[] = ['CREATE TABLE IF NOT EXISTS tmp_restore (k TEXT NOT NULL, i INTEGER NOT NULL, part TEXT NOT NULL);', 'DELETE FROM tmp_restore;'];
out.forEach((rec, n) => {
  const json = JSON.stringify(rec.data); const k = rec.kind + '|' + rec.key;
  for (let i = 0, p = 0; i < json.length; i += 40000, p++) sql.push(`INSERT INTO tmp_restore (k, i, part) VALUES (${q(k)}, ${p}, ${q(json.slice(i, i + 40000))});`);
  sql.push("UPDATE meta SET v = CAST(v AS INTEGER) + 1 WHERE k = 'rev';");
  sql.push(`INSERT INTO records (user_id, kind, key, data, updated_at, deleted, rev) VALUES (${uid}, ${q(rec.kind)}, ${q(rec.key)}, (SELECT group_concat(part, '') FROM (SELECT part FROM tmp_restore WHERE k = ${q(k)} ORDER BY i)), ${now + n}, 0, (SELECT CAST(v AS INTEGER) FROM meta WHERE k = 'rev')) ON CONFLICT (user_id, kind, key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted = 0, rev = excluded.rev WHERE excluded.updated_at > records.updated_at;`);
});
sql.push('DROP TABLE tmp_restore;');
fs.writeFileSync(outFile, sql.join('\n') + '\n');
fs.writeFileSync(outFile.replace(/\.sql$/, '.json'), JSON.stringify(out, null, 1));

// Übersicht
const hh = (m: number) => (Math.round(m / 6) / 10).toString().replace('.', ',');
for (const w of plan.weeks.filter((x: any) => x.startDate >= next).slice(0, +(cfg.show || 10))) {
  console.log(`\n${w.headline} ${w.isRecoveryWeek ? '(Erholung)' : ''}${w.entry ? '(Einstieg)' : ''} · eigenes Training ${hh(ownWeekMinutes(w))} h`);
  for (const d of w.days) console.log('  ', d.date, d.sessions.filter((s: any) => s.sport !== 'rest').map((s: any) => `${s.title}${s.plannedMinutes && !/\d+ min/.test(s.title) ? ` (${s.plannedMinutes} min)` : ''}${s.hard ? ' !' : ''}`).join(' | ') || 'Ruhetag');
  if (w.important) console.log('   →', w.important);
}
console.log('\nErklärung:\n- ' + plan.meta.explain.join('\n- '));
console.log('\nVerworfen:', r.gen.dropped.slice(0, 10));
console.log('Prüfung:', r.gen.violations.map((v: any) => v.msg));
console.log('\nSQL:', outFile, sql.length, 'Anweisungen');
