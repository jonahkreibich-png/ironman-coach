/* Auftrag 20: Jonahs Plan mit den kleinen Plan-Korrekturen neu berechnen (gleiches Wochenraster wie Auftrag 19):
   Schwimm-Dauer aus dem eigenen Tempo (1.200 m etwa 45-55 min statt 75-84), Donnerstagslauf in der Grundlage im Wechsel mit Steigerungen
   und Hügelsprints, Koppellauf 10-15 min ab dem Aufbau etwa jede 3. Woche, Fußball zählt bei der Lauf-Häufigkeit halb.
   Profil: Rolle = einfache Rolle (Kuipers, ohne Watt), eigenes Schwimm-Tempo ohne Pausen.
   Liest eine lokale Kopie der Datenbank (nur lesen), prüft, dass Vergangenes und Erledigtes bleibt, rechnet die Verlängerungen durch,
   schreibt SQL und eine Übersicht vorher/nachher. Das Skript ändert keine Datenbank.
   Aufruf: npx vite-node scripts/plan-auftrag20.ts -- <kopie.sqlite> <nutzer> <ausgabe.sql> <heute JJJJ-MM-TT> <stunde> */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { replanPlan, replanStart, extendPlan } from '../shared/replan';
import * as C from '../shared/core';
import { dayUnits } from '../shared/planrules';
import { checkIntensity, isHardSession } from '../shared/intensity';
import { checkTrainingRules, TRULE_LABEL } from '../shared/trainingrules';
import { validateWeeks } from '../shared/rules';
import * as W from '../shared/workouts';

const args = process.argv.slice(2).filter(a => a !== '--');
const [dbFile, uidS, outFile, today, hourS] = args; const uid = +uidS; const hour = +hourS;
if (!dbFile || !uid || !outFile || !today || isNaN(hour)) { console.error('Aufruf: <kopie.sqlite> <nutzer> <ausgabe.sql> <heute> <stunde>'); process.exit(1); }
const db = new DatabaseSync(dbFile, { readOnly: true });
const recs = (db.prepare('SELECT kind, key, data FROM records WHERE user_id = ? AND deleted = 0').all(uid) as any[]).map(r => ({ kind: r.kind, key: r.key, data: JSON.parse(r.data) }));
const one = (kind: string) => (recs.find(r => r.kind === kind) || {} as any).data;
const dict = (kind: string) => Object.fromEntries(recs.filter(r => r.kind === kind).map(r => [r.key, r.data]));
const plan0 = one('plan'); if (!plan0) { console.error('Kein Plan'); process.exit(1); }
const customWorkouts: any = {};
recs.filter(r => r.kind === 'custom').forEach(r => { const w = r.data; if (w && w.date) (customWorkouts[w.date] = customWorkouts[w.date] || []).push(w); });
const settingsRec = one('settings') || {};
const cur = one('profile') || {};
function pattern19(): any {
  return {
    slots: [
      { dow: 2, sport: 'swim', role: 'swim' },
      { dow: 2, sport: 'strength', role: 'full', min: [30, 30] },
      { dow: 3, sport: 'bike', role: 'key', min: [60, 90], restEvery: 2, qualityTo: 6, pin: true },
      { dow: 4, sport: 'run', role: 'easy', min: [40, 50], stridesFrom: '2026-10-19', qualityFrom: '2027-02-01', pin: true },
      { dow: 5, sport: 'bike', role: 'easy', min: [30, 40], am: true },
      { dow: 6, sport: 'swim', role: 'swim' },
      { dow: 6, sport: 'bike', role: 'long' },
      { dow: 6, sport: 'run', role: 'brick', min: [10, 15], every: 3, pin: true },
      { dow: 0, sport: 'run', role: 'long', tempoFrom: '2027-02-01', tempoEvery: 2, pin: true }
    ],
    targets: [], hoursByPhase: { base: [6.5, 8], build: [8, 9], specific: [8, 9] }, recoveryRest: [3, 0], longRunStep: 10, testEveryWeeks: 8, lastTest: '2026-10-12'
  };
}
// Profil: aktuelles Profil, neues Wochenraster; Kraft nur noch Di (Ganzkörper), Rad Fr morgens erlaubt (Rad-Regel des Rasters: nie Mo/Di/Do)
void pattern19;
const profile: any = { ...cur, trainerType: 'basic' };
const state: any = { sessions: dict('session'), customWorkouts, adjustments: dict('adjust'), activities: dict('activity'),
  trend: recs.filter(r => r.kind === 'trend').map(r => r.data).sort((a, b) => a.date.localeCompare(b.date)),
  illnessPeriods: recs.filter(r => r.kind === 'illness').map(r => r.data), settings: settingsRec.settings || {}, coachMsgs: dict('coachMsg'), profile };
// eigenes Schwimm-Tempo ohne Pausen (wie die App es nach dem Update selbst einträgt)
const pace100 = C.swimPace100(state, plan0.weeks, today); if (pace100) profile.skills = { ...(profile.skills || {}), swimPace100: pace100 };
const goals = recs.filter(r => r.kind === 'goal').map(r => r.data);
const from = replanStart(today, hour);
const r = replanPlan(plan0, profile, goals, today, { state, adjustments: state.adjustments, from, recentHours: null });
if (!r) { console.error('Kein Plan berechnet'); process.exit(1); }
const plan = r.plan;

// Vergangenes und Erledigtes bleibt
const done = Object.entries(state.sessions).filter(([, s]: any) => s && s.completed).map(([id]) => id);
const ids = new Set(C.planDays(plan.weeks).flatMap((d: any) => d.sessions.map((s: any) => s.id)));
const lost = done.filter(id => C.planDays(plan0.weeks).some((d: any) => d.sessions.some((s: any) => s.id === id)) && !ids.has(id));
if (lost.length) { console.error('Erledigte Einheiten fehlen: ' + lost.join(', ')); process.exit(1); }
const seen = (weeks: any[]) => C.planDays(C.applyAdjustments(weeks, state.adjustments));
const sig = (l: any[]) => JSON.stringify((l || []).map((s: any) => [s.id, s.sport, s.title, s.plannedMinutes, !!s.cancelled]).sort());
for (const d of seen(plan0.weeks).filter((x: any) => x.date < from)) {
  const nd = seen(plan.weeks).find((x: any) => x.date === d.date);
  if (nd && sig(nd.sessions) !== sig(d.sessions)) { console.error('Vergangener Tag geändert: ' + d.date); process.exit(1); }
}
// Server-Verlängerungen bis zum Ende durchrechnen (sonntags, wie der Server)
const extend = (p0: any, prof: any) => { let p = p0; let d = today; for (let k = 0; k < 160; k++) { d = C.addDays(d, 7); const nx = extendPlan(p, prof, goals, d); if (nx) p = nx; } return p; };
const planBeforeExt = extend(plan0, cur), planAfterExt = extend(plan, profile);

const mon0 = C.addDays(from, -((new Date(from + 'T12:00:00Z').getUTCDay() + 6) % 7));
const brick = (s: any) => /^(Koppellauf|Wechsel-Lauf)/.test(s.title || '');
function overview(weeks: any[]) {
  const days = seen(weeks);
  return weeks.filter((w: any) => w.startDate >= mon0).map((w: any) => {
    const ds = days.filter((d: any) => d.date >= w.startDate && d.date <= C.addDays(w.startDate, 6));
    const live = (d: any) => d.sessions.filter((s: any) => s && s.sport !== 'rest' && !s.cancelled);
    const all = ds.flatMap(live);
    const own = all.filter((s: any) => s.sport !== 'football' && !s.race).reduce((a: number, s: any) => a + (s.plannedMinutes || 0), 0);
    const runs = all.filter((s: any) => s.sport === 'run' && !s.race);
    return { week: w.weekNumber, from: w.startDate, phase: w.phase + (w.isRecoveryWeek ? ' (Erh.)' : ''), ownH: Math.round(own / 6) / 10,
      runs: runs.filter((s: any) => !brick(s)).length + runs.filter(brick).length * 0.5,
      hardOwn: all.filter((s: any) => isHardSession(s) && s.sport !== 'football' && !s.race).length, hardFix: all.filter((s: any) => isHardSession(s) && (s.sport === 'football' || s.race)).length,
      rest: ds.filter((d: any) => !live(d).length).length, triple: ds.filter((d: any) => dayUnits(d).length >= 3).length,
      longRun: Math.max(0, ...runs.filter((s: any) => !brick(s)).map((s: any) => s.plannedMinutes || 0)), longBike: Math.max(0, ...all.filter((s: any) => s.sport === 'bike').map((s: any) => s.plannedMinutes || 0)),
      longQ: runs.some((s: any) => s.spec && s.spec.kind === 'longq'), quality: all.filter((s: any) => isHardSession(s) && s.sport !== 'football' && !s.race).map((s: any) => s.title) };
  });
}
const before = overview(planBeforeExt.weeks), after = overview(planAfterExt.weeks);
const ruleCount = (weeks: any[], prof: any) => { const by: Record<string, number> = {}; checkTrainingRules(C.applyAdjustments(weeks, state.adjustments), prof, { from, goals, today, goalType: 'tri_long' }).forEach(i => { by[i.rule] = (by[i.rule] || 0) + 1; }); return by; };
const rulesBefore = ruleCount(planBeforeExt.weeks, cur), rulesAfter = ruleCount(planAfterExt.weeks, profile);

const now = Date.now();
const hm = goals.find((g: any) => g.type === 'run_half');
const swimOf = (weeks: any[]) => seen(weeks).filter((d: any) => d.date >= from && d.date <= C.addDays(from, 27)).flatMap((d: any) => d.sessions.filter((x: any) => x.sport === 'swim' && x.spec && !x.cancelled).map((x: any) => ({ date: d.date, m: W.swimSums(x.spec).meters, min: x.plannedMinutes })));
const sw0 = swimOf(plan0.weeks), sw1 = swimOf(plan.weeks);
const thu = seen(plan.weeks).filter((d: any) => d.date >= from && d.date <= C.addDays(from, 41) && new Date(d.date + 'T12:00:00Z').getUTCDay() === 4).map((d: any) => (d.sessions.find((x: any) => x.sport === 'run') || {}).title).filter(Boolean);
const mmss = (s: number) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
const lines = [
  `Kleine Korrekturen an deinem Plan (ab ${from === today ? 'heute' : 'morgen'}, Vergangenes und Erledigtes bleibt):`,
  `Schwimmen: Die Dauer rechnet jetzt mit deinem eigenen Tempo (etwa ${pace100 ? mmss(pace100) : '–'} min pro 100 m laut Uhr) plus Pausen und Technik. 1.200 m stehen deshalb mit etwa 45-55 min im Plan statt mit 75-84 min.`,
  `Donnerstag in der Grundlage: im Wechsel Lauf mit Steigerungen und Lauf mit Hügelsprints (ohne steilen Hügel: Steigerungen in der Ebene), z. B. ${thu.slice(0, 2).join(' · ')}.`,
  'Koppellauf: ab dem Aufbau etwa jede 3. Woche 10-15 min direkt nach der langen Ausfahrt; der Sonntag danach ist dann locker und kürzer. Vor dem Halbmarathon gibt es keinen.',
  'Fußball zählt bei der Lauf-Häufigkeit halb mit (2 Termine = 1 Lauf). Mehr dazu im Lexikon unter „Mindest-Häufigkeit“.'
].filter(Boolean);
const out: { kind: string; key: string; data: any }[] = [
  { kind: 'plan', key: 'main', data: plan },
  { kind: 'profile', key: 'main', data: { ...profile, updatedAt: now } },
  { kind: 'coachMsg', key: 'msg-plan20-' + today, data: { id: 'msg-plan20-' + today, at: now, date: today, kind: 'adjust', from: 'coach', title: 'Plan angepasst', unread: true, important: true, text: lines.join('\n\n') } }
];
if (process.env.COPY_ALL) recs.filter(x => !out.some(o => o.kind === x.kind && o.key === x.key)).forEach(x => out.unshift({ kind: x.kind, key: x.key, data: x.data }));
const q = (s: string) => "'" + s.replace(/'/g, "''") + "'";
const sql: string[] = ['CREATE TABLE IF NOT EXISTS tmp_restore (k TEXT NOT NULL, i INTEGER NOT NULL, part TEXT NOT NULL);', 'DELETE FROM tmp_restore;'];
out.forEach((rec, n) => {
  const json = JSON.stringify(rec.data); const k = rec.kind + '|' + rec.key;
  for (let i = 0, p = 0; i < json.length; i += 40000, p++) sql.push(`INSERT INTO tmp_restore (k, i, part) VALUES (${q(k)}, ${p}, ${q(json.slice(i, i + 40000))});`);
  sql.push("UPDATE meta SET v = CAST(v AS INTEGER) + 1 WHERE k = 'rev';");
  sql.push(`INSERT INTO records (user_id, kind, key, data, updated_at, deleted, rev) VALUES (${uid}, ${q(rec.kind)}, ${q(rec.key)}, (SELECT group_concat(part, '') FROM (SELECT part FROM tmp_restore WHERE k = ${q(k)} ORDER BY i)), ${now + n}, 0, (SELECT CAST(v AS INTEGER) FROM meta WHERE k = 'rev')) ON CONFLICT (user_id, kind, key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted = 0, rev = excluded.rev WHERE excluded.updated_at > records.updated_at;`);
});
sql.push('DROP TABLE tmp_restore;');
// Sperre: Plan und Profil nur von Geräten mit App 3.7.0 oder neuer annehmen (ältere würden die Schwimm-Dauer zurückrechnen)
sql.push(`INSERT INTO user_meta (user_id, k, v) VALUES (${uid}, 'min_client_version', ${q(JSON.stringify({ version: '3.7.0', kinds: ['plan', 'profile'] }))}) ON CONFLICT (user_id, k) DO UPDATE SET v = excluded.v;`);
fs.writeFileSync(outFile, sql.join('\n') + '\n');
fs.writeFileSync(outFile.replace(/\.sql$/, '.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(outFile.replace(/\.sql$/, '-uebersicht.json'), JSON.stringify({ before, after, rulesBefore, rulesAfter, labels: TRULE_LABEL }, null, 1));

const issues = checkIntensity(planAfterExt.weeks, profile, today, { from, ...(planAfterExt.meta.intensityOpts || {}) });
const vol = validateWeeks(planAfterExt.weeks.filter((w: any) => w.startDate >= mon0), { maxIncPct: 10 }, planAfterExt.weeks.filter((w: any) => w.startDate < mon0).slice(-2));
console.log('Ab', from, '| Wochen nach Verlängerung vorher', planBeforeExt.weeks.length, 'nachher', planAfterExt.weeks.length);
console.log('Trainingsregeln vorher:', JSON.stringify(rulesBefore), '| nachher:', JSON.stringify(rulesAfter));
console.log('Intensität:', issues.map(i => i.msg).join(' | ') || 'keine Fehler');
console.log('Umfang:', vol.map(i => i.msg).join(' | ') || 'keine Fehler');
const row = (x: any) => `${x.week}\t${x.from}\t${x.phase}\t${x.ownH}\tL${x.runs}\tR${x.rest}\tH${x.hardOwn}+${x.hardFix}\tT${x.triple}\tLL${x.longRun}\tLR${x.longBike}${x.longQ ? '\tLQ' : ''}`;
console.log('\nVORHER'); before.slice(0, +(process.env.N || 26)).forEach(x => console.log(row(x)));
console.log('\nNACHHER'); after.slice(0, +(process.env.N || 26)).forEach(x => console.log(row(x)));
console.log('\nSchwimmen vorher:', sw0.map(x => `${x.date.slice(5)} ${x.m} m ${x.min} min`).join(' | '));
console.log('Schwimmen nachher:', sw1.map(x => `${x.date.slice(5)} ${x.m} m ${x.min} min`).join(' | '));
console.log('Donnerstag:', thu.join(' | '));
console.log('\nNachricht:\n' + lines.join('\n'));
console.log('SQL:', outFile, sql.length, 'Anweisungen');
