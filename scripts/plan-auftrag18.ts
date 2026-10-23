/* Auftrag 18: Jonahs Plan nach den festen Trainingsregeln (shared/trainingrules.ts, docs/TRAININGSREGELN.md) ab heute neu berechnen.
   - Profil: das in Auftrag 17 eingespielte (data-export/plan17-prod.json), weil das Handy es kurz danach mit einem älteren Stand überschrieben hat.
     Dazu die seitdem gemessene Schwimm-Geschwindigkeit (swimMPerMin) aus dem aktuellen Profil.
   - Der Generator setzt die Regeln um: Ruhetag, nach langem Tag kein langer/harter Lauf, höchstens 2 Sportarten pro Tag, Lauf-Qualität vor
     dem Halbmarathon, Wettkampfwoche ohne Kraft und leichter (Spiel am Freitag davor), danach locker.
   - Server-Sperre: user_meta min_client_version = 3.5.0 für plan/profile, damit ein Gerät mit alter App den neuen Plan nicht überschreibt.
   Liest eine lokale Kopie der Datenbank (nur lesen), prüft, dass Vergangenes und Erledigtes bleibt, schreibt SQL (neue Zeitstempel) und
   eine Übersicht vorher/nachher. Das Skript selbst ändert keine Datenbank.
   Aufruf: npx vite-node scripts/plan-auftrag18.ts -- <kopie.sqlite> <nutzer> <ausgabe.sql> <heute JJJJ-MM-TT> <stunde> <profil17.json> */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { replanPlan, replanStart } from '../shared/replan';
import { sanitizeProfile } from '../shared/sanity';
import * as C from '../shared/core';
import { checkPlanRules, dayUnits } from '../shared/planrules';
import { checkIntensity, isHardSession } from '../shared/intensity';
import { checkPlan } from '../shared/plancheck';
import { checkTrainingRules, TRULE_LABEL } from '../shared/trainingrules';

const args = process.argv.slice(2).filter(a => a !== '--');
const [dbFile, uidS, outFile, today, hourS, prof17] = args; const uid = +uidS; const hour = +hourS;
if (!dbFile || !uid || !outFile || !today || isNaN(hour) || !prof17) { console.error('Aufruf: <kopie.sqlite> <nutzer> <ausgabe.sql> <heute> <stunde> <profil17.json>'); process.exit(1); }
const db = new DatabaseSync(dbFile, { readOnly: true });
const recs = (db.prepare('SELECT kind, key, data FROM records WHERE user_id = ? AND deleted = 0').all(uid) as any[]).map(r => ({ kind: r.kind, key: r.key, data: JSON.parse(r.data) }));
const one = (kind: string) => (recs.find(r => r.kind === kind) || {} as any).data;
const dict = (kind: string) => Object.fromEntries(recs.filter(r => r.kind === kind).map(r => [r.key, r.data]));
const plan0 = one('plan');
if (!plan0) { console.error('Kein Plan'); process.exit(1); }
const customWorkouts: any = {};
recs.filter(r => r.kind === 'custom').forEach(r => { const w = r.data; if (w && w.date) (customWorkouts[w.date] = customWorkouts[w.date] || []).push(w); });
const settingsRec = one('settings') || {};
const state: any = {
  sessions: dict('session'), customWorkouts, adjustments: dict('adjust'), activities: dict('activity'),
  trend: recs.filter(r => r.kind === 'trend').map(r => r.data).sort((a, b) => a.date.localeCompare(b.date)),
  illnessPeriods: recs.filter(r => r.kind === 'illness').map(r => r.data), settings: settingsRec.settings || {}, coachMsgs: dict('coachMsg')
};
const cur = one('profile') || {};
const p17 = (JSON.parse(fs.readFileSync(prof17, 'utf8')) as any[]).find(r => r.kind === 'profile').data;
const base = { ...p17, skills: { ...(p17.skills || {}), ...(cur.skills && cur.skills.swimMPerMin ? { swimMPerMin: cur.skills.swimMPerMin } : {}) } };
const fx = sanitizeProfile(base, today);
const profile: any = JSON.parse(JSON.stringify(fx.profile));
state.profile = profile;

const goals = recs.filter(r => r.kind === 'goal').map(r => r.data);
const from = replanStart(today, hour);
const r = replanPlan(plan0, profile, goals, today, { state, adjustments: state.adjustments, from, recentHours: null });
if (!r) { console.error('Kein Plan berechnet'); process.exit(1); }
const plan = r.plan;

// Prüfungen: Vergangenes und Erledigtes bleibt
const done = Object.entries(state.sessions).filter(([, s]: any) => s && s.completed).map(([id]) => id);
const ids = new Set(C.planDays(plan.weeks).flatMap((d: any) => d.sessions.map((s: any) => s.id)));
const lost = done.filter(id => C.planDays(plan0.weeks).some((d: any) => d.sessions.some((s: any) => s.id === id)) && !ids.has(id));
if (lost.length) { console.error('Erledigte Einheiten fehlen: ' + lost.join(', ')); process.exit(1); }
const seen = (weeks: any[], adj: any) => C.planDays(C.applyAdjustments(weeks, adj || {}));
const sig = (l: any[]) => JSON.stringify((l || []).map((s: any) => [s.id, s.sport, s.title, s.plannedMinutes, !!s.cancelled]).sort());
for (const d of seen(plan0.weeks, state.adjustments).filter((x: any) => x.date < from)) {
  const nd = seen(plan.weeks, state.adjustments).find((x: any) => x.date === d.date);
  if (nd && sig(nd.sessions) !== sig(d.sessions)) { console.error('Vergangener Tag geändert: ' + d.date + '\n alt: ' + sig(d.sessions) + '\n neu: ' + sig(nd.sessions)); process.exit(1); }
}

// Übersicht je Woche (was die Person sieht): Stunden eigenes Training, Einheiten, Minuten je Sportart, harte Einheiten, Ruhetage, Doppel-Tage
const mon0 = C.addDays(from, -((new Date(from + 'T12:00:00Z').getUTCDay() + 6) % 7));
function overview(weeks: any[], adj: any) {
  const days = seen(weeks, adj);
  return weeks.filter((w: any) => w.startDate >= mon0).map((w: any) => {
    const ds = days.filter((d: any) => d.date >= w.startDate && d.date <= C.addDays(w.startDate, 6));
    const live = (d: any) => d.sessions.filter((s: any) => s && s.sport !== 'rest' && !s.cancelled);
    const all = ds.flatMap(live);
    const by = (sp: string) => all.filter((s: any) => s.sport === sp && !s.race).reduce((a: number, s: any) => a + (s.plannedMinutes || 0), 0);
    const own = all.filter((s: any) => s.sport !== 'football' && !s.race).reduce((a: number, s: any) => a + (s.plannedMinutes || 0), 0);
    return { week: w.weekNumber, from: w.startDate, phase: w.phase + (w.isRecoveryWeek ? ' (Erholung)' : ''), ownH: Math.round(own / 6) / 10, totalH: Math.round((own + by('football')) / 6) / 10,
      sessions: all.filter((s: any) => s.sport !== 'football').length, swim: by('swim'), bike: by('bike'), run: by('run'), strength: by('strength'), football: by('football'),
      hard: ds.filter((d: any) => live(d).some((s: any) => isHardSession(s))).length, hardOwn: all.filter((s: any) => isHardSession(s) && s.sport !== 'football' && !s.race).length,
      rest: ds.filter((d: any) => !live(d).length).length, double: ds.filter((d: any) => dayUnits(d).length === 2).length, triple: ds.filter((d: any) => dayUnits(d).length >= 3).length,
      longRun: Math.max(0, ...all.filter((s: any) => s.sport === 'run' && !s.race).map((s: any) => s.plannedMinutes || 0)), longBike: Math.max(0, ...all.filter((s: any) => s.sport === 'bike').map((s: any) => s.plannedMinutes || 0)) };
  });
}
const before = overview(plan0.weeks, state.adjustments), after = overview(plan.weeks, state.adjustments);

const now = Date.now();
const sk = profile.skills || {};
const settingsNew = { ...settingsRec, settings: { ...(settingsRec.settings || {}), lthrRun: profile.thresholds.lthrRun, lthrBike: profile.thresholds.lthrBike, thresholdPaceRunSec: profile.thresholds.thresholdPaceRunSec, thresholdSpeedBikeKmh: profile.thresholds.thresholdSpeedBikeKmh } };
// Regeln vorher/nachher (gleiche Prüfung wie im Plan-Tab)
const ruleCount = (weeks: any[]) => { const by: Record<string, number> = {}; checkTrainingRules(C.applyAdjustments(weeks, state.adjustments), profile, { from, goals, today, goalType: 'tri_long' }).forEach(i => { by[i.rule] = (by[i.rule] || 0) + 1; }); return by; };
const rulesBefore = ruleCount(plan0.weeks), rulesAfter = ruleCount(plan.weeks);
const hm = goals.find((g: any) => g.type === 'run_half');
const lines = [
  `Ich habe deinen Plan nach festen Trainingsregeln neu berechnet. Er gilt ab ${from === today ? 'heute' : 'morgen'}, Vergangenes und Erledigtes bleibt.`,
  'Neu: Donnerstag ist Ruhetag (zwischen Rad-Qualität am Mittwoch und dem Spiel am Freitag). Nach einem langen Samstag (lange Ausfahrt mit Koppellauf) ist der Sonntag kurz und locker, ohne Tempo. Höchstens zwei Sportarten an einem Tag.',
  hm ? `Vor dem Halbmarathon (${hm.date.slice(8, 10)}.${hm.date.slice(5, 7)}.): in den letzten 7 Wochen jede normale Woche ein Lauf im Wettkampftempo, in diesen Wochen kein Koppellauf. Wettkampfwoche ohne Kraft und leichter, weil am Freitag davor das Spiel ist – dort am besten nur kurz spielen. Danach eine Woche locker und kurz, keine lange Ausfahrt.` : '',
  'Frag den Coach „Warum habe ich heute frei?“, dann sagt er dir den Grund. Die Regeln stehen im Lexikon unter „Training verstehen“.'
].filter(Boolean);
const out: { kind: string; key: string; data: any }[] = [
  { kind: 'plan', key: 'main', data: plan },
  { kind: 'profile', key: 'main', data: { ...profile, updatedAt: now } },
  { kind: 'settings', key: 'main', data: settingsNew },
  { kind: 'coachMsg', key: 'msg-plan18-' + today, data: { id: 'msg-plan18-' + today, at: now, date: today, kind: 'adjust', from: 'coach', title: 'Plan angepasst', unread: true, important: true, text: lines.join('\n\n') } }
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
// Sperre: Plan und Profil nur noch von Geräten mit App 3.5.0 oder neuer annehmen (ältere bekommen den Stand vom Server)
sql.push(`INSERT INTO user_meta (user_id, k, v) VALUES (${uid}, 'min_client_version', ${q(JSON.stringify({ version: '3.5.0', kinds: ['plan', 'profile'] }))}) ON CONFLICT (user_id, k) DO UPDATE SET v = excluded.v;`);
fs.writeFileSync(outFile, sql.join('\n') + '\n');
fs.writeFileSync(outFile.replace(/\.sql$/, '.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(outFile.replace(/\.sql$/, '-uebersicht.json'), JSON.stringify({ before, after }, null, 1));

const issues = checkIntensity(plan.weeks, profile, today, { from, ...(plan.meta.intensityOpts || {}) });
const pr = checkPlanRules(plan.weeks, profile, { from });
const cp = checkPlan(plan.weeks.filter((w: any) => w.startDate >= mon0).slice(0, 16), profile, goals, today, { fromDate: from });
console.log('Ab', from, '| Profil repariert:', fx.fixed.join(', ') || '–');
console.log('Trainingsregeln vorher:', JSON.stringify(rulesBefore), '| nachher:', JSON.stringify(rulesAfter));
fs.writeFileSync(outFile.replace(/\.sql$/, '-regeln.json'), JSON.stringify({ before: rulesBefore, after: rulesAfter, labels: TRULE_LABEL }, null, 1));
console.log('Regeln (Sportarten, Abstand, Dreifach-Tage):', pr.map(i => i.msg).join(' | ') || 'keine Fehler');
console.log('Intensität:', issues.map(i => i.msg).join(' | ') || 'keine Fehler');
console.log('Plan-Check:', cp.map(i => i.rule + ': ' + i.msg).join(' | ') || 'keine Fehler');
console.log('Prüfung:', r.gen.violations.map((v: any) => v.msg).join(' | ') || 'keine Verletzung');
const row = (x: any) => `${x.week}\t${x.from}\t${x.phase}\t${x.ownH}\t${x.totalH}\t${x.sessions}\t${x.swim}/${x.bike}/${x.run}/${x.strength}/${x.football}\t${x.hardOwn}+${x.hard - x.hardOwn}\t${x.rest}\t${x.double}\t${x.triple}\t${x.longRun}\t${x.longBike}`;
console.log('\nVORHER\nWo\tab\tPhase\teigen h\tgesamt h\tEinh.\tSchw/Rad/Lauf/Kraft/Fußb\thart(eig+fest)\tRuhe\tDoppel\tDreifach\tLL\tLR');
before.slice(0, 26).forEach(x => console.log(row(x)));
console.log('\nNACHHER'); after.slice(0, 26).forEach(x => console.log(row(x)));
for (const w of plan.weeks.filter((w: any) => w.startDate >= mon0).slice(0, +(process.env.SHOW || 3))) {
  console.log(`\n${w.headline}`);
  for (const d of w.days) console.log('  ', d.date, d.sessions.map((s: any) => `${s.title}${s.plannedMinutes && !/\d+ min/.test(s.title) ? ` (${s.plannedMinutes} min)` : ''}${isHardSession(s) ? ' !' : ''}`).join(' | '));
}
console.log('\nNachricht:\n' + lines.join('\n'));
console.log('SQL:', outFile, sql.length, 'Anweisungen');
