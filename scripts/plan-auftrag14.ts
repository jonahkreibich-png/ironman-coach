/* Auftrag 14: Plan eines Nutzers nach den neuen Regeln (Intensität, Schwimmen) neu berechnen, nicht zurücksetzen. Für Papa und Jonah.
   Liest eine lokale Kopie der Datenbank (nur lesen), plant ab heute (ab 18 Uhr ab morgen) neu, prüft, dass Vergangenes und Erledigtes bleibt,
   und schreibt eine SQL-Datei für D1 (neue Zeitstempel und Revisionen). Das Skript selbst ändert nichts.
   Aufruf: npx vite-node scripts/plan-auftrag14.ts -- <kopie.sqlite> <nutzer> <ausgabe.sql> <heute JJJJ-MM-TT> <stunde> */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { replanPlan, replanStart } from '../shared/replan';
import { mergeProfile, profileFromLegacy } from '../shared/profile';
import { sanitizeProfile } from '../shared/sanity';
import { ownWeekMinutes } from '../shared/rules';
import * as C from '../shared/core';
import { checkIntensity, isHardSession } from '../shared/intensity';

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
  illnessPeriods: recs.filter(r => r.kind === 'illness').map(r => r.data), settings: settingsRec.settings || {}
};
const cur = one('profile') || {};
const fx = sanitizeProfile(mergeProfile(cur, profileFromLegacy({ ...state, planWeeks: plan0.weeks }, today), today), today);
const profile = fx.profile;
state.profile = profile;
const goals = recs.filter(r => r.kind === 'goal').map(r => r.data);
const from = replanStart(today, hour);
const a = profile.answers || {};
const needTests = a.wantTests ? { run: profile.sports.includes('run'), bike: profile.sports.includes('bike'), swim: profile.sports.includes('swim') } : undefined;
const r = replanPlan(plan0, profile, goals, today, { state, adjustments: state.adjustments, needTests, from, recentHours: a.weeklyHoursNow != null && a.weeklyHoursNow !== 'unknown' ? +a.weeklyHoursNow : null });
if (!r) { console.error('Kein Plan berechnet'); process.exit(1); }
const plan = r.plan;

// Prüfungen: Vergangenes und Erledigtes bleibt
const done = Object.entries(state.sessions).filter(([, s]: any) => s && s.completed).map(([id]) => id);
const ids = new Set(C.planDays(plan.weeks).flatMap((d: any) => d.sessions.map((s: any) => s.id)));
const lost = done.filter(id => C.planDays(plan0.weeks).some((d: any) => d.sessions.some((s: any) => s.id === id)) && !ids.has(id));
if (lost.length) { console.error('Erledigte Einheiten fehlen: ' + lost.join(', ')); process.exit(1); }
// verglichen wird, was die Person sieht (mit Anpassungen): verschobene Einheiten liegen nach dem Neuplanen an ihrem echten Tag
const seen = (weeks: any[]) => C.planDays(C.applyAdjustments(weeks, state.adjustments || {}));
const sig = (l: any[]) => JSON.stringify((l || []).map((s: any) => [s.id, s.sport, s.title, s.plannedMinutes, !!s.cancelled]).sort());
for (const d of seen(plan0.weeks).filter((x: any) => x.date < from)) {
  const nd = seen(plan.weeks).find((x: any) => x.date === d.date);
  if (nd && sig(nd.sessions) !== sig(d.sessions)) { console.error('Vergangener Tag geändert: ' + d.date + '\n alt: ' + sig(d.sessions) + '\n neu: ' + sig(nd.sessions)); process.exit(1); }
}

const now = Date.now();
const settingsNew = { ...settingsRec, settings: { ...(settingsRec.settings || {}), lthrRun: profile.thresholds.lthrRun, lthrBike: profile.thresholds.lthrBike, thresholdPaceRunSec: profile.thresholds.thresholdPaceRunSec, thresholdSpeedBikeKmh: profile.thresholds.thresholdSpeedBikeKmh } };
if (settingsNew.nutritionProfile && (settingsNew.nutritionProfile.age > 110 || settingsNew.nutritionProfile.age < 5)) { settingsNew.nutritionProfile = { ...settingsNew.nutritionProfile }; delete settingsNew.nutritionProfile.age; }
const sk = profile.skills || {};
const next = C.planDays(plan.weeks).filter((d: any) => d.date >= from && d.date <= C.addDays(from, 55)).flatMap((d: any) => d.sessions);
const nHard = (sp: string) => next.filter((x: any) => x.sport === sp && isHardSession(x) && !x.race && !x.fixed && !/test/i.test(x.title || '')).length;
const issues = checkIntensity(plan.weeks, profile, today, { from, baseOffset: 8, ...(plan.meta.intensityOpts || {}) });
console.log('Intensität: ' + (issues.length ? issues.map(i => i.msg).join(' | ') : 'keine Fehler'));
console.log('Harte Einheiten in 8 Wochen: Laufen ' + nHard('run') + ', Rad ' + nHard('bike') + ', Schwimmen ' + nHard('swim'));
const what = [nHard('run') ? nHard('run') + ' Tempo- bzw. Schwellenläufe' : '', nHard('bike') ? nHard('bike') + ' harte Radeinheiten' : '', nHard('swim') ? nHard('swim') + ' Schwimm-Intervalle' : ''].filter(Boolean).join(', ') || 'vor allem Grundlage';
const lines = [
  `Ich habe deinen Plan nach den neuen Regeln neu berechnet. Er gilt ab ${from === today ? 'heute' : 'morgen'}, Vergangenes und Erledigtes bleibt.`,
  `Harte Einheiten kommen jetzt nach festen Regeln: passend zu Ziel, Phase und Erfahrung, nie zwei harte Tage hintereinander, die Intervalle werden von Woche zu Woche länger. In den nächsten 8 Wochen: ${what}.`,
  profile.sports.includes('swim') && sk.swimCrawl === 'yes' ? `Schwimmen: Du kannst kraulen, deshalb kein „Kraul lernen“ mehr, sondern normales Schwimmtraining mit Technik. Die Kraul-Stücke sind so lang, wie du am Stück kraulst (${sk.swimCrawlM || 100} m). Meter und Dauer sind jetzt ehrlich gerechnet, mit Pausen.` : '',
  profile.sports.includes('swim') && sk.swimGear == null ? 'Trag unter Mehr → Berücksichtigungen ein, welche Schwimm-Hilfsmittel du hast (Kickbrett, Pull Buoy …), dann plane ich sie ein.' : ''
].filter(Boolean);
const out: { kind: string; key: string; data: any }[] = [
  { kind: 'plan', key: 'main', data: plan },
  { kind: 'profile', key: 'main', data: { ...profile, updatedAt: now } },
  { kind: 'settings', key: 'main', data: settingsNew },
  { kind: 'coachMsg', key: 'msg-plan14-' + today, data: { id: 'msg-plan14-' + today, at: now, date: today, kind: 'adjust', from: 'coach', title: 'Plan korrigiert', unread: true, important: true, text: lines.join(' ') } }
];
// Test-Umgebung: COPY_ALL=1 kopiert zusätzlich alle übrigen Datensätze (Ziele, Nachrichten …), damit die Kopie vollständig ist
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

const hh = (m: number) => (Math.round(m / 6) / 10).toString().replace('.', ',');
console.log('Repariert:', fx.fixed.join(', ') || '–', '| ab', from);
for (const w of plan.weeks.slice(0, 3)) {
  console.log(`\n${w.headline} · eigenes Training ${hh(ownWeekMinutes(w))} h`);
  for (const d of w.days) console.log('  ', d.date, d.sessions.map((s: any) => `${s.title}${s.plannedMinutes && !/\d+ min/.test(s.title) ? ` (${s.plannedMinutes} min)` : ''}${s.hard ? ' !' : ''}`).join(' | '));
}
console.log('\nNachricht:', lines.join(' '));
console.log('Prüfung:', r.gen.violations.map((v: any) => v.msg));
console.log('SQL:', outFile, sql.length, 'Anweisungen');
