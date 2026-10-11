// @ts-nocheck – aus den alten JS-Testskripten übernommen
import { test, expect } from 'vitest';
import * as C from '../../shared/core';
function ok(cond: any, msg: string) { expect(!!cond, msg).toBe(true); }
test('Belastung und Anpassungen (Phase 4)', () => {
// Tests für Phase 4 (Belastung, tägliche und wöchentliche Anpassungen) mit erfundenen Daten.
const A = C.addDays;

// Woche 1: Mo 05.10. – So 11.10., Woche 2: Mo 12.10. – So 18.10. (2026)
function plan(opts) {
  opts = opts || {};
  const mk = (mon, wn, rec) => ({ weekNumber: wn, label: 'Woche ' + wn, startDate: mon, endDate: A(mon, 6), isRecoveryWeek: !!rec, days: [
    { date: mon, sessions: [{ id: `w${wn}-mo`, sport: 'rest', title: 'Ruhetag' }] },
    { date: A(mon, 1), sessions: [{ id: `w${wn}-di`, sport: 'bike', title: 'Sweet-Spot 3×8', zone: 'Zone 3-4', plannedMinutes: 60 }] },
    { date: A(mon, 2), sessions: [{ id: `w${wn}-mi`, sport: 'run', title: 'Lockerer Lauf', zone: 'Zone 2', plannedMinutes: 40, plannedKm: 6 }] },
    { date: A(mon, 3), sessions: [{ id: `w${wn}-do`, sport: 'swim', title: 'Technik', plannedMinutes: 45 }] },
    { date: A(mon, 4), sessions: [{ id: `w${wn}-fr`, sport: 'run', title: opts.runIntervals ? 'Intervalle 5×3 min' : 'Locker', zone: opts.runIntervals ? 'Zone 4' : 'Zone 2', plannedMinutes: 45 }] },
    { date: A(mon, 5), sessions: [{ id: `w${wn}-sa`, sport: 'football', title: opts.gameSa ? 'Spiel' : 'Fußballtraining' }] },
    { date: A(mon, 6), sessions: [{ id: `w${wn}-so`, sport: 'bike', title: 'Lange Ausfahrt', zone: 'Zone 2', plannedMinutes: 150 }] }
  ] });
  return [mk('2026-10-05', 1), mk('2026-10-12', 2, opts.recovery)];
}
function trend(upto, today) {
  const out = [];
  for (let i = 28; i >= 1; i--) out.push({ date: A(upto, -i), hrv: 70 + ((i % 5) - 2) * 6, restingHR: 50, sleepHours: 8.6, sleepQuality: 8, ctl: 40, atl: 42 });
  if (today) out.push(Object.assign({ date: upto, ctl: 40, atl: 42 }, today));
  return out;
}
const GREEN = { hrv: 70, restingHR: 50, sleepHours: 8.7, sleepQuality: 8 };

console.log('Belastung');
ok(C.sessionLoad({ sport: 'bike' }, { metrics: { min: 60, hr: 140 } }, { lthrBike: 162 }) === 75, 'hrTSS Rad: 1 h, Ø 140 bei LTHR 162 → 75');
ok(C.sessionLoad({ sport: 'football', title: 'Fußballtraining' }, { completed: true }) === 67, 'Fußball ohne Uhr und RPE: 90 min, RPE 6 → 67');
ok(C.sessionLoad({ sport: 'football', title: 'Spiel' }, {}) === 60, 'Spiel ohne RPE: 60 min, RPE 7 → 60');
ok(C.sessionLoad({ sport: 'bike' }, { icuLoad: 88, metrics: { min: 60, hr: 140 } }) === 88, 'Trainingslast von intervals.icu hat Vorrang');
ok(C.sessionLoad({ sport: 'swim', plannedMinutes: 45 }, { rpe: '6', metrics: { hr: 150 } }) === 33, 'Schwimmen über RPE, nicht über Puls');
ok(C.sessionLoad({ sport: 'run' }, { rpe: 10, metrics: { min: 60 } }) === 110, 'IF höchstens 1,05');
const st1 = { sessions: { 'w1-di': { completed: true, metrics: { min: 60, hr: 145 } }, 'w1-so': { completed: true, rpe: 5 } }, customWorkouts: {}, trend: [], profile: { thresholds: { lthrRun: 170, lthrBike: 162 } } };
const ser = C.ownLoadSeries(st1, plan(), '2026-10-11');
ok(ser.length === 6 && ser[0].load === 80 && ser[5].ctl > 0 && ser[5].atl > ser[5].ctl, 'Eigene CTL/ATL: 42/7 Tage, ATL reagiert schneller');

console.log('Täglich');
let s = { sessions: {}, customWorkouts: {}, illnessPeriods: [], adjustments: {}, settings: {}, trend: trend('2026-10-13', { hrv: 48, restingHR: 56, sleepHours: 6, bodyTemp: 0.6 }) };
let adj = C.dailyAdjustments(s, plan(), '2026-10-13', { now: 1 });
ok(adj.length === 1 && adj[0].set.plannedMinutes === 25 && adj[0].set.zone === 'Zone 1' && /^Locker statt/.test(adj[0].set.title), 'Rot: Sweet Spot → 20-30 min ganz locker');
s.trend = trend('2026-10-13', { hrv: 70, restingHR: 53, sleepHours: 8.7 });
adj = C.dailyAdjustments(s, plan(), '2026-10-13', { now: 1 });
ok(adj.length === 1 && adj[0].set.plannedMinutes === 50 && adj[0].set.zone === 'Zone 2', 'Gelb: Intervalle → Zone 2, 60 → 50 min (−20 %, auf 5 gerundet)');
s.trend = trend('2026-10-17', { hrv: 48, restingHR: 56 });
adj = C.dailyAdjustments(Object.assign({}, s), plan({ gameSa: true }), '2026-10-17', { now: 1 });
ok(!adj.some(a => a.sessionId === 'w2-sa'), 'Fußballspiel wird nie angepasst');
s.trend = trend('2026-10-13', { hrv: 48, restingHR: 56 });
adj = C.dailyAdjustments(Object.assign({}, s, { illnessPeriods: [{ start: '2026-10-12', end: null }] }), plan(), '2026-10-13', { now: 1 });
ok(adj.length === 0, 'Krankheit hat Vorrang: keine Anpassung');
adj = C.dailyAdjustments(Object.assign({}, s, { illnessPeriods: [{ start: '2026-10-08', end: '2026-10-10' }] }), plan(), '2026-10-13', { now: 1 });
ok(adj.length === 0, 'Wiedereinstieg hat Vorrang: keine Anpassung');
s.trend = trend('2026-10-13', { hrv: 48, restingHR: 56 });
const twice = C.dailyAdjustments(Object.assign({}, s, { adjustments: Object.fromEntries(C.dailyAdjustments(s, plan(), '2026-10-13', { now: 1 }).map(a => [a.id, a])) }), plan(), '2026-10-13', { now: 2 });
ok(twice.length === 0, 'Zweiter Lauf am selben Tag ändert nichts mehr');

console.log('Lauf-Intervalle und Leiste');
s.trend = trend('2026-10-16', GREEN);
adj = C.dailyAdjustments(s, plan({ runIntervals: true }), '2026-10-16', { now: 1 });
ok(adj.length === 1 && adj[0].id === 'guard-w2-fr' && adj[0].set.zone === 'Zone 2', 'Ohne Freigabe: Lauf-Intervalle → Zone 2');
adj = C.dailyAdjustments(s, plan({ runIntervals: true }), '2026-10-16', { now: 1, planMeta: { runIntervalsAllowed: true } });
ok(adj.length === 0, 'Mit Freigabe des Coachs bleiben Lauf-Intervalle');
const groinState = Object.assign({}, s, { sessions: { 'w2-mi': { completed: true, notes: 'Leiste zieht, Schmerz 3/10' } } });
adj = C.dailyAdjustments(groinState, plan({ runIntervals: true }), '2026-10-16', { now: 1, planMeta: { runIntervalsAllowed: true } });
ok(adj.length === 1 && /Schmerz \(Leiste\)/.test(adj[0].reason), 'Leistenschmerz 3/10 → keine Lauf-Intensität, auch mit Freigabe');
ok(!C.groinFlag({ sessions: { x: { notes: 'Leiste 2/10' } } }, [{ days: [{ date: '2026-10-15', sessions: [{ id: 'x' }] }] }], '2026-10-16'), 'Leiste 2/10 ist noch okay');

console.log('Verpasste Schlüsseleinheit');
s = { sessions: {}, customWorkouts: {}, illnessPeriods: [], adjustments: {}, settings: {}, trend: trend('2026-10-14', GREEN) };
adj = C.dailyAdjustments(s, plan(), '2026-10-14', { now: 1 });
let mv = adj.find(a => a.type === 'move');
ok(mv && mv.sessionId === 'w2-di' && mv.to === '2026-10-14', 'Sweet Spot vom Di verpasst → auf Mi verschoben (frei, Nachbartage locker)');
ok(adj.some(a => a.type === 'cancel' && a.sessionId === 'w2-mi') === false, 'Anderer Sport am Zieltag bleibt bestehen');
const eff = C.applyAdjustments(plan(), Object.fromEntries(adj.map(a => [a.id, a])));
const di = eff[1].days[1], mi = eff[1].days[2];
ok(di.sessions.length === 0 && di.moved[0].to === '2026-10-14' && mi.sessions.some(x => x.id === 'w2-di' && x.movedFrom === '2026-10-13'), 'Effektiver Plan: Einheit wandert, alter Tag zeigt „verschoben“');
s.trend = trend('2026-10-14', { hrv: 70, restingHR: 53 });
adj = C.dailyAdjustments(s, plan(), '2026-10-14', { now: 1 });
mv = adj.find(a => a.type === 'move');
ok(mv && mv.to === '2026-10-15', 'Ampel heute gelb → nicht heute, sondern Do');
s.trend = trend('2026-10-15', GREEN);
s.sessions = { 'w2-di': {} };
const p2 = plan(); p2[1].days[4].sessions[0] = { id: 'w2-fr', sport: 'football', title: 'Spiel' };
adj = C.dailyAdjustments(s, p2, '2026-10-15', { now: 1 });
ok(!adj.some(a => a.type === 'move'), 'Nie direkt vor einem Spiel (Do vor Spiel am Fr) → nicht verschoben');
s.trend = trend('2026-10-14', GREEN);
adj = C.dailyAdjustments(Object.assign({}, s, { adjustments: { 'move-w2-di': { id: 'move-w2-di', type: 'move', sessionId: 'w2-di', undone: true } } }), plan(), '2026-10-14', { now: 1 });
ok(!adj.some(a => a.type === 'move'), 'Rückgängig gemachte Verschiebung wird nicht neu angelegt');
const p3 = plan(); p3[1].days[3].sessions.push({ id: 'w2-do-int', sport: 'run', title: 'Intervalle', zone: 'Zone 4', plannedMinutes: 40 });
adj = C.dailyAdjustments(Object.assign({}, s, { sessions: {} }), p3, '2026-10-14', { now: 1, planMeta: { runIntervalsAllowed: true } });
ok(!adj.some(a => a.type === 'move'), 'Nie zwei harte Tage hintereinander (Do ist hart) → Mi nicht möglich');

console.log('Wöchentlich');
const doneAll = { 'w1-di': { completed: true, rpe: '6', quality: 'good', metrics: { min: 60, hr: 150 } }, 'w1-mi': { completed: true }, 'w1-do': { completed: true }, 'w1-fr': { completed: true }, 'w1-sa': { completed: true }, 'w1-so': { completed: true } };
s = { sessions: doneAll, customWorkouts: {}, illnessPeriods: [], adjustments: {}, settings: {}, trend: trend('2026-10-11', GREEN) };
let W = C.weeklyAdjustments(s, plan(), '2026-10-11', { now: 1 });
ok(W.summary.ratio >= 0.9 && W.summary.green >= 4, 'Gute Woche erkannt (' + Math.round(W.summary.ratio * 100) + ' %, ' + W.summary.green + ' grün)');
const vol = W.adjustments.filter(a => a.id.includes('-vol-'));
ok(vol.length === 5 && !vol.some(a => a.sessionId === 'w2-sa') && vol.find(a => a.sessionId === 'w2-so').set.plannedMinutes === 165, 'Umfang höchstens +10 % (150 → 165 min), Fußball/Kraft unverändert ' + JSON.stringify(vol.map(a => [a.sessionId, a.set.plannedMinutes])) + ' ' + JSON.stringify(W.adjustments.find(a => a.type === 'note').stats));
const lad = W.adjustments.find(a => a.id.includes('ladder'));
ok(lad && lad.set.title === 'Sweet-Spot 3×10', 'Intervall-Leiter: RPE 6 und „Gut“ → 3×8 wird 3×10');
ok(W.adjustments.some(a => a.type === 'note' && a.id === 'week-2-summary'), 'Zusammenfassung der Woche wird gespeichert');
W = C.weeklyAdjustments(s, plan({ recovery: true }), '2026-10-11', { now: 1 });
ok(!W.adjustments.some(a => a.id.includes('-vol-')), 'Erholungswoche bleibt bestehen');
W = C.weeklyAdjustments(Object.assign({}, s, { sessions: { 'w1-di': doneAll['w1-di'] } }), plan(), '2026-10-11', { now: 1 });
ok(W.adjustments.find(a => a.id.includes('-vol-') && a.sessionId === 'w2-so').set.plannedMinutes === 120, 'Unter 50 % umgesetzt → −20 % (150 → 120 min)');
W = C.weeklyAdjustments(Object.assign({}, s, { sessions: Object.assign({}, doneAll, { 'w1-di': { completed: true, rpe: '9', quality: 'ok' } }) }), plan(), '2026-10-11', { now: 1 });
ok(!W.adjustments.some(a => a.id.includes('ladder')), 'RPE 9 → Stufe wiederholen (keine Änderung)');
const groinW = Object.assign({}, s, { sessions: Object.assign({}, doneAll, { 'w1-fr': { completed: true, notes: 'Leiste 4/10' } }) });
W = C.weeklyAdjustments(groinW, plan(), '2026-10-11', { now: 1 });
ok(!W.adjustments.some(a => a.id.includes('-vol-')) && /Schmerz \(Leiste\)/.test(W.adjustments.find(a => a.type === 'note').reason), 'Leistenschmerz → eine Woche keine Steigerung');
W = C.weeklyAdjustments(Object.assign({}, s, { illnessPeriods: [{ start: '2026-10-07', end: '2026-10-08' }] }), plan(), '2026-10-11', { now: 1 });
ok(W.adjustments.find(a => a.sessionId === 'w2-so' && a.id.includes('-vol-')).set.plannedMinutes === 120, 'Krankheit in der Woche → −20 %');
W = C.weeklyAdjustments(Object.assign({}, s, { adjustments: { 'week-2-summary': { id: 'week-2-summary', type: 'note' } } }), plan(), '2026-10-11', { now: 1 });
ok(W.adjustments.length === 0, 'Nur einmal pro Woche');

});
