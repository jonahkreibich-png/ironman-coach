/* Auftrag 7: Plan fortsetzen statt Neustart, Score-Kalibrierung, Verlauf und echte Schwellen aus dem nächtlichen Backup zurückholen.
   Liest eine lokale Kopie der Datenbank (nur lesen) und die persönlichen Angaben (scripts/restore/<name>.local.json, nicht im Repository)
   und schreibt eine SQL-Datei für D1. Gleiche Logik wie putRecords auf dem Server: neuer Zeitstempel und neue Revision, die Geräte
   holen die Änderung beim nächsten Abgleich. Das Skript selbst ändert nichts.
   Aufruf: npx vite-node scripts/restore-auftrag7.ts -- <kopie.sqlite> <angaben.local.json> <ausgabe.sql> [nutzer] */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { replanPlan } from '../shared/replan';
import { mergeProfile, profileFromLegacy } from '../shared/profile';
import * as C from '../shared/core';

const args = process.argv.slice(2).filter(a => a !== '--');
const [dbFile, cfgFile, outFile] = args; const uid = +(args[3] || 1);
if (!dbFile || !cfgFile || !outFile) { console.error('Aufruf: <kopie.sqlite> <angaben.local.json> <ausgabe.sql> [nutzer]'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
const db = new DatabaseSync(dbFile, { readOnly: true });
const recs = (db.prepare('SELECT kind, key, data, updated_at FROM records WHERE user_id = ? AND deleted = 0').all(uid) as any[]).map(r => ({ kind: r.kind, key: r.key, data: JSON.parse(r.data), updatedAt: r.updated_at }));
const bk = db.prepare('SELECT data FROM backups WHERE user_id = ? AND day = ?').get(uid, cfg.backupDay) as any;
if (!bk) { console.error('Kein Backup für ' + cfg.backupDay); process.exit(1); }
const backup = JSON.parse(bk.data) as any[];
const one = (list: any[], kind: string) => (list.find(r => r.kind === cfg_key(kind) || r.kind === kind) || {}).data;
function cfg_key(k: string) { return k; }
const dict = (kind: string) => Object.fromEntries(recs.filter(r => r.kind === kind).map(r => [r.key, r.data]));

// Alter Plan aus dem Backup (vor dem Fragebogen): Wochen 1-5, Score-Kalibrierung, Verlauf
const oldPlan = one(backup, 'plan');
const curPlan = one(recs, 'plan');
const customWorkouts: any = {};
recs.filter(r => r.kind === 'custom').forEach(r => { const w = r.data; if (w && w.date) (customWorkouts[w.date] = customWorkouts[w.date] || []).push(w); });
const settingsRec = one(recs, 'settings') || {};
const state: any = {
  sessions: dict('session'), customWorkouts, adjustments: dict('adjust'), activities: dict('activity'), weekNotes: dict('weekNote'),
  trend: recs.filter(r => r.kind === 'trend').map(r => r.data).sort((a, b) => a.date.localeCompare(b.date)),
  illnessPeriods: recs.filter(r => r.kind === 'illness').map(r => r.data),
  settings: { ...(settingsRec.settings || {}), ...cfg.settings }
};
const curProfile = one(recs, 'profile') || {};
const profile = mergeProfile({ ...curProfile, ...cfg.profile, thresholds: { ...(curProfile.thresholds || {}), ...cfg.profile.thresholds }, answers: curProfile.answers, updatedAt: Date.now() }, profileFromLegacy({ ...state, planWeeks: oldPlan.weeks }, cfg.today), cfg.today);
state.profile = profile;
const goals = cfg.goals;

const r = replanPlan(oldPlan, profile, goals, cfg.today, { state, adjustments: state.adjustments, needTests: cfg.needTests, stages: cfg.stages });
if (!r) { console.error('Kein Plan berechnet'); process.exit(1); }
const plan = r.plan;

// Prüfungen: nichts geht verloren
const ids = new Set(C.planDays(plan.weeks).flatMap((d: any) => d.sessions.map((s: any) => s.id)));
const doneLost = Object.entries(state.sessions).filter(([id, s]: any) => s && s.completed && !ids.has(id) && C.planDays(oldPlan.weeks).some((d: any) => d.sessions.some((x: any) => x.id === id)));
if (doneLost.length) { console.error('Erledigte Einheiten fehlen im neuen Plan: ' + doneLost.map(x => x[0]).join(', ')); process.exit(1); }
if (!plan.meta.scoreCalibration) { console.error('Score-Kalibrierung fehlt'); process.exit(1); }

const now = Date.now();
const out: { kind: string; key: string; data: any }[] = [
  { kind: 'plan', key: 'main', data: plan },
  { kind: 'profile', key: 'main', data: { ...profile, updatedAt: now } },
  ...goals.map((g: any) => ({ kind: 'goal', key: g.id, data: { ...g, createdAt: g.createdAt || now } })),
  { kind: 'settings', key: 'main', data: { settings: state.settings, nutritionProfile: cfg.nutritionProfile, scoreAdjust: settingsRec.scoreAdjust || { swim: 0, bike: 0, run: 0, strength: 0 }, scoreCalibVersion: (oldPlan.meta.scoreCalibration || {}).version ?? settingsRec.scoreCalibVersion ?? null } },
  { kind: 'coachMsg', key: 'msg-restore-' + cfg.today, data: { id: 'msg-restore-' + cfg.today, at: now, date: cfg.today, kind: 'adjust', from: 'coach', title: 'Plan geht weiter', unread: true, important: true,
    text: `Dein Plan beginnt nicht neu. Block 1 endet mit Woche ${C.planDays(oldPlan.weeks).length ? oldPlan.weeks[oldPlan.weeks.length - 1].weekNumber : 5} (Erholungswoche bis ${oldPlan.weeks[oldPlan.weeks.length - 1].endDate.split('-').reverse().slice(0, 2).join('.')}.), ab ${plan.weeks.find((w: any) => w.startDate > cfg.today).startDate.split('-').reverse().slice(0, 2).join('.')}. geht es mit Block 2 weiter: Woche 1 mit Schwellentest am Ende der Woche, locker eingestiegen nach deiner Erkältung, Umfang passend zu deiner Belastung. Scores, Verlauf und erledigte Einheiten sind wieder da, deine Schwellen (LTHR 170) auch.` } }
];
// Große Datensätze in Stücken (D1: höchstens 100 KB pro Anweisung), zusammengesetzt in einer Hilfstabelle
const q = (s: string) => "'" + s.replace(/'/g, "''") + "'";
const sql: string[] = ['CREATE TABLE IF NOT EXISTS tmp_restore (k TEXT NOT NULL, i INTEGER NOT NULL, part TEXT NOT NULL);', 'DELETE FROM tmp_restore;'];
out.forEach((rec, n) => {
  const json = JSON.stringify(rec.data); const k = rec.kind + '|' + rec.key;
  for (let i = 0, p = 0; i < json.length; i += 60000, p++) sql.push(`INSERT INTO tmp_restore (k, i, part) VALUES (${q(k)}, ${p}, ${q(json.slice(i, i + 60000))});`);
  sql.push("UPDATE meta SET v = CAST(v AS INTEGER) + 1 WHERE k = 'rev';");
  sql.push(`INSERT INTO records (user_id, kind, key, data, updated_at, deleted, rev) VALUES (${uid}, ${q(rec.kind)}, ${q(rec.key)}, (SELECT group_concat(part, '') FROM (SELECT part FROM tmp_restore WHERE k = ${q(k)} ORDER BY i)), ${now + n}, 0, (SELECT CAST(v AS INTEGER) FROM meta WHERE k = 'rev')) ON CONFLICT (user_id, kind, key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted = 0, rev = excluded.rev WHERE excluded.updated_at > records.updated_at;`);
});
sql.push('DROP TABLE tmp_restore;');
fs.writeFileSync(outFile, sql.join('\n') + '\n');
fs.writeFileSync(outFile.replace(/\.sql$/, '.json'), JSON.stringify(out, null, 1));

// Übersicht
const hh = (m: number) => (Math.round(m / 6) / 10).toString().replace('.', ',');
console.log('Plan:', plan.weeks.length, 'Wochen, Block-Name', plan.meta.blockName, '| Kalibrierung', JSON.stringify(plan.meta.scoreCalibration.scores), '| seedMetrics', (plan.seedMetrics || []).length);
for (const w of plan.weeks.slice(4, 14)) {
  const own = w.days.reduce((a: number, d: any) => a + d.sessions.filter((s: any) => s.sport !== 'rest' && s.sport !== 'football').reduce((b: number, s: any) => b + (s.plannedMinutes || 0), 0), 0);
  console.log(`\n${w.headline || w.label} ${w.isRecoveryWeek ? '(Erholung)' : ''} · eigenes Training ${hh(own)} h`);
  for (const d of w.days) console.log('  ', d.date, d.sessions.filter((s: any) => s.sport !== 'rest').map((s: any) => `${s.slot === 'am' ? '☀ ' : ''}${s.title}${s.plannedMinutes && !/\d+ min/.test(s.title) ? ` (${s.plannedMinutes} min)` : ''}${s.hard ? ' !' : ''}`).join(' | ') || 'Ruhetag');
}
console.log('\nErklärung:\n- ' + plan.meta.explain.join('\n- '));
console.log('\nVerworfen:', r.gen.dropped.slice(0, 10));
console.log('Prüfung:', r.gen.violations.map((v: any) => v.msg));
console.log('\nSQL:', outFile, sql.length, 'Anweisungen');
