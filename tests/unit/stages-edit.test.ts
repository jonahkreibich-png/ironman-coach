/* Auftrag 4 C1 und C5: Lernstufen steigen nur nach Erfolg laut Daten; vom Nutzer feste Einheiten bleiben unangetastet;
   hinzugefügte Einheiten erscheinen im effektiven Plan. */
import { test, expect } from 'vitest';
import * as C from '../../shared/core';
import * as W from '../../shared/workouts';

const ctx = { runThrSec: 420 };
function weeksWith(learn: any) {
  const mk = (id: string, date: string, n: number) => ({ id, ...W.build(learn === 'swim' ? W.swimLearn(ctx, { ladder: 'swim', n }) : W.runWalk(ctx, n)) });
  return [
    { weekNumber: 1, startDate: '2026-10-12', endDate: '2026-10-18', days: [{ date: '2026-10-13', sessions: [mk('w1-a', '2026-10-13', 2)] }, { date: '2026-10-17', sessions: [mk('w1-b', '2026-10-17', 2)] }] },
    { weekNumber: 2, startDate: '2026-10-19', endDate: '2026-10-25', days: [{ date: '2026-10-20', sessions: [mk('w2-a', '2026-10-20', 2)] }, { date: '2026-10-24', sessions: [mk('w2-b', '2026-10-24', 2)] }] }
  ];
}
const state = (sessions: any) => ({ sessions, trend: [], illnessPeriods: [], customWorkouts: {}, adjustments: {}, settings: {}, activities: {} });

test('Lauf-Geh-Wechsel: geschafft (Dauer laut Uhr) → nächste Woche eine Stufe weiter', () => {
  const w = weeksWith('run');
  const planned = w[0].days[1].sessions[0].plannedMinutes;
  const r = C.weeklyAdjustments(state({ 'w1-b': { completed: true, metrics: { min: planned } } }), w, '2026-10-18', {});
  const up = r.adjustments.filter((a: any) => /stage/.test(a.id));
  expect(up.length).toBe(2);
  expect(up[0].set.stage.n).toBe(3);
  expect(up[0].set.title).toMatch(/Lauf-Geh-Wechsel 5× \(5 \+ 1 min\)/);
  expect(up[0].reason).toMatch(/geklappt/);
});
test('Lauf-Geh-Wechsel: zu hart (RPE 9) oder ohne Daten → Stufe bleibt', () => {
  const w = weeksWith('run');
  for (const st of [{ completed: true, rpe: 9 }, { completed: true }]) {
    const r = C.weeklyAdjustments(state({ 'w1-b': st }), w, '2026-10-18', {});
    expect(r.adjustments.filter((a: any) => /stage/.test(a.id))).toEqual([]);
    expect(r.adjustments.find((a: any) => a.type === 'note').reason).toMatch(/Stufe bleibt/);
  }
});
test('Kraul lernen: Uhr misst 50 m am Stück → nächste Stufe mit 50-m-Stücken', () => {
  const w = weeksWith('swim');
  const r = C.weeklyAdjustments({ ...state({ 'w1-b': { completed: true, activityId: 'a1' } }), activities: { a1: { swim: { longestContinuousM: 50 } } } }, w, '2026-10-18', {});
  const up = r.adjustments.find((a: any) => /stage/.test(a.id));
  expect(up.set.stage.n).toBe(3);
  expect(up.set.description).toMatch(/\d×50 m Kraul/);
  expect(up.set.plannedMinutes).toBe(W.totals(up.set.spec).min);
});
test('Feste Einheit: Engine ändert sie nicht (Ampel, Umfang, Stufe)', () => {
  const w = weeksWith('run');
  const planned = w[0].days[1].sessions[0].plannedMinutes;
  const adjustments = { 'user-1': { id: 'user-1', type: 'modify', sessionId: 'w2-a', set: { locked: true }, createdAt: 1 } };
  const r = C.weeklyAdjustments({ ...state({ 'w1-b': { completed: true, metrics: { min: planned } } }), adjustments }, w, '2026-10-18', {});
  expect(r.adjustments.some((a: any) => a.sessionId === 'w2-a')).toBe(false);
  expect(r.adjustments.some((a: any) => a.sessionId === 'w2-b')).toBe(true);
  expect(C.isLocked(C.applyAdjustments(w, adjustments), 'w2-a')).toBe(true);
});
test('Einheit hinzufügen: erscheint am Tag, Ruhetag verschwindet, Rückgängig entfernt sie', () => {
  const w = [{ weekNumber: 1, startDate: '2026-10-12', endDate: '2026-10-18', days: [{ date: '2026-10-14', sessions: [{ id: 'r', sport: 'rest', title: 'Ruhetag' }] }] }];
  const add = { id: 'user-add-1', type: 'add', to: '2026-10-14', session: { id: 'u1', sport: 'run', title: 'Lockerer Lauf 30 min', plannedMinutes: 30 }, createdAt: 1 };
  const eff = C.applyAdjustments(w, { [add.id]: add });
  expect(eff[0].days[0].sessions.map((s: any) => s.id)).toEqual(['u1']);
  expect(C.applyAdjustments(w, { [add.id]: { ...add, undone: true } })[0].days[0].sessions.map((s: any) => s.id)).toEqual(['r']);
});
