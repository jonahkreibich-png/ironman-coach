/* Auftrag 17: Jonahs Plan nach den neuen Regeln (Belastung in Balance, Soll/Ist, Schwimmen nach Nachweis) ab heute neu berechnen.
   - Schwimm-Stufe auf 50 m Kraul am Stück (eigene Angabe), alle kommenden Schwimmeinheiten passend.
   - Fester Wochenaufbau: Di Schwimmen + Kraft Unterkörper, Mi Rad-Qualität, Do lockerer Lauf (mit Steigerungen), Fr Kraft Oberkörper + Spiel,
     Sa Schwimmen + lange Ausfahrt (Koppel nur im Aufbau jede 2.-3. Woche), So langer Lauf locker. Erholung alle 4 Wochen.
   - Wochenvorgaben eigenes Training: Grundlage 7-9 h, Aufbau/spezifisch 8-9,5 h – der Generator deckelt sie mit +10 % auf das wirklich Erledigte.
   Liest eine lokale Kopie der Datenbank (nur lesen), prüft, dass Vergangenes und Erledigtes bleibt, schreibt SQL (neue Zeitstempel) und
   eine Übersicht vorher/nachher. Das Skript selbst ändert keine Datenbank.
   Aufruf: npx vite-node scripts/plan-auftrag17.ts -- <kopie.sqlite> <nutzer> <ausgabe.sql> <heute JJJJ-MM-TT> <stunde> */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { replanPlan, replanStart } from '../shared/replan';
import { mergeProfile, profileFromLegacy } from '../shared/profile';
import { sanitizeProfile } from '../shared/sanity';
import * as C from '../shared/core';
import { checkPlanRules, dayUnits } from '../shared/planrules';
import { checkIntensity, isHardSession } from '../shared/intensity';
import { checkPlan } from '../shared/plancheck';

const args = process.argv.slice(2).filter(a => a !== '--');
const [dbFile, uidS, outFile, today, hourS] = args; const uid = +uidS; const hour = +hourS;
if (!dbFile || !uid || !outFile || !today || isNaN(hour)) { console.error('Aufruf: <kopie.sqlite> <nutzer> <ausgabe.sql> <heute> <stunde>'); process.exit(1); }
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
const fx = sanitizeProfile(mergeProfile(cur, profileFromLegacy({ ...state, planWeeks: plan0.weeks }, today), today), today);
const profile: any = JSON.parse(JSON.stringify(fx.profile));

// 1) Schwimmen: 50 m Kraul am Stück als eigene Angabe (Jonah), Pull Buoy wie eingetragen (bestätigt 50 m), Herkunft vermerkt
const oldCrawl = profile.skills?.swimCrawlM;
profile.skills = { ...(profile.skills || {}), swimCrawl: 'some', swimCrawlM: 50, swimEvidence: { ...(profile.skills?.swimEvidence || {}), crawl: { value: 50, baseline: 50, manual: true }, mode: { value: 'some', baseline: 'some', manual: true } } };

// 2) Fester Wochenaufbau und Wochenvorgaben (eigenes Training ohne Fußball). Lange Einheiten wachsen nach den Regeln (langer Lauf +10 min/Woche,
//    höchstens 105 min vor dem Halbmarathon), deshalb keine festen Längen in den Vorgaben.
const wp = profile.weekPattern || {};
const slot = (dow: number, sport: string, role: string, extra: any = {}) => ({ dow, sport, role, ...extra });
const keyFrom = (wp.slots || []).find((x: any) => x.role === 'key')?.keyFrom || '2026-11-02';
profile.weekPattern = {
  ...wp,
  slots: [slot(2, 'swim', 'swim'), slot(2, 'strength', 'lower', { min: [30, 35] }), slot(3, 'bike', 'key', { min: [50, 75], keyFrom }),
    slot(4, 'run', 'easy', { min: [40, 50], stridesFrom: '2026-11-02' }), slot(5, 'strength', 'upper', { min: [25, 30] }),
    slot(6, 'swim', 'swim'), slot(6, 'bike', 'long'), slot(6, 'run', 'brick', { min: [10, 15], from: '2026-12-28' }), slot(0, 'run', 'long')],
  targets: [
    { start: '2026-10-19', hours: 6, entry: true },
    { start: '2026-10-26', hours: 7, tests: ['swim', 'bike'] },
    { start: '2026-11-02', hours: 7.5 },
    { start: '2026-11-09', hours: 5.5, recovery: true },
    { start: '2026-11-16', hours: 8 }, { start: '2026-11-23', hours: 8.5 }, { start: '2026-11-30', hours: 9 },
    { start: '2026-12-07', hours: 6, recovery: true, tests: ['swim', 'bike', 'run'] },
    { start: '2026-12-14', hours: 9 }, { start: '2026-12-21', hours: 8.5 }, { start: '2026-12-28', hours: 8.5 },
    { start: '2027-01-04', hours: 6.5, recovery: true },
    { start: '2027-01-11', hours: 9 }, { start: '2027-01-18', hours: 9.5 }, { start: '2027-01-25', hours: 9.5 },
    { start: '2027-02-01', hours: 6.5, recovery: true, tests: ['swim', 'bike', 'run'] },
    { start: '2027-02-08', hours: 9 }, { start: '2027-02-15', hours: 9.5 }, { start: '2027-02-22', hours: 9.5 },
    { start: '2027-03-01', hours: 6.5, recovery: true },
    { start: '2027-03-08', hours: 9.5 }, { start: '2027-03-15', hours: 9 }
  ],
  longRunStep: 10, testEveryWeeks: 8
};
delete profile.weekPattern.longRunMax;
// gewünschte Häufigkeit passend zum Wochenaufbau (Rad Mi + Sa, Schwimmen Di + Sa, Laufen Do + So, Kraft Di + Fr)
profile.freq = { ...(profile.freq || {}), bike: [2, 2], swim: [2, 2], run: [2, 3], strength: [2, 2] };
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
const lines = [
  `Ich habe deinen Plan nach den neuen Regeln neu berechnet. Er gilt ab ${from === today ? 'heute' : 'morgen'}, Vergangenes und Erledigtes bleibt.`,
  `Korrigiert: Kraul am Stück jetzt 50 m (vorher ${oldCrawl || '?'} m). Die 100 m kamen aus der Uhr, die Brust und Kraul zusammenzählt; eingetragen hattest du 50 m. Alle kommenden Schwimmeinheiten sind wieder 50-m-Stücke, mit Kickbrett und Pull Buoy im Wechsel. Die nächste Stufe kommt, wenn du 100 m in 2 Einheiten schaffst.`,
  'Belastung: höchstens 2 harte Einheiten pro Woche plus das Spiel, nie zwei harte Tage hintereinander. Mittwoch Rad-Qualität, Donnerstag locker mit Steigerungen (er liegt zwischen Mittwoch und dem Spiel), Sonntag langer Lauf locker. Tempo im langen Lauf erst in den letzten 8 Wochen vor dem Halbmarathon und nur jede 2. Woche.',
  'Samstag Schwimmen und lange Ausfahrt, ein kurzer Koppellauf nur im Aufbau jede 2.-3. Woche. Kraft im Aufbau 2 × 25-30 min. Erholung alle 4 Wochen.',
  `Umfang: deine Vorgaben (Grundlage 7-9 h, Aufbau 8-9,5 h eigenes Training) steigen höchstens 10 % pro Woche auf das, was du wirklich gemacht hast. Zuletzt waren das etwa ${Math.round((C.recentOwnMinutes(state, plan0.weeks, from) || 0) / 6) / 10} h, deshalb startet der Plan darunter und erreicht die Vorgaben Schritt für Schritt.`
];
const out: { kind: string; key: string; data: any }[] = [
  { kind: 'plan', key: 'main', data: plan },
  { kind: 'profile', key: 'main', data: { ...profile, updatedAt: now } },
  { kind: 'settings', key: 'main', data: settingsNew },
  { kind: 'coachMsg', key: 'msg-plan17-' + today, data: { id: 'msg-plan17-' + today, at: now, date: today, kind: 'adjust', from: 'coach', title: 'Plan angepasst', unread: true, important: true, text: lines.join('\n\n') } }
];
// alte Schwimm-Stufen-Anpassungen (100-m-Stücke) für kommende Tage zurücknehmen: der neue Plan hat neue Einheiten, alte Anpassungen gelten nicht mehr
for (const [k, a] of Object.entries(state.adjustments) as any[]) if (/^swimstage-/.test(k) && a && !a.undone) out.push({ kind: 'adjust', key: k, data: { ...a, undone: true, undoneAt: now } });
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
fs.writeFileSync(outFile, sql.join('\n') + '\n');
fs.writeFileSync(outFile.replace(/\.sql$/, '.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(outFile.replace(/\.sql$/, '-uebersicht.json'), JSON.stringify({ before, after }, null, 1));

const issues = checkIntensity(plan.weeks, profile, today, { from, ...(plan.meta.intensityOpts || {}) });
const pr = checkPlanRules(plan.weeks, profile, { from });
const cp = checkPlan(plan.weeks.filter((w: any) => w.startDate >= mon0).slice(0, 16), profile, goals, today, { fromDate: from });
console.log('Ab', from, '| Profil repariert:', fx.fixed.join(', ') || '–', '| Kraul vorher', oldCrawl, '→ 50 m');
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
