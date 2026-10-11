import { test, expect } from 'vitest';
import * as C from '../../shared/core';

const A = C.addDays;
const mk = (mon: string, wn: number) => ({ weekNumber: wn, label: 'Woche ' + wn, startDate: mon, endDate: A(mon, 6), days: [
  { date: A(mon, 1), sessions: [{ id: `w${wn}-di`, sport: 'bike', title: 'Sweet-Spot 3×8', zone: 'Zone 3-4', plannedMinutes: 60 }] },
  { date: A(mon, 3), sessions: [{ id: `w${wn}-do`, sport: 'run', title: 'Locker', zone: 'Zone 2', plannedMinutes: 40 }] }
] });
const weeks = [mk('2026-10-05', 1), mk('2026-10-12', 2)];
const trend = Array.from({ length: 28 }, (_, i) => ({ date: A('2026-10-11', -i), hrv: 70, restingHR: 50, sleepHours: 8.5, ctl: 40, atl: 42 }));
const iv = (o: any) => ({ count: 3, workSec: 1440, avgHrWork: 150, hrDriftPct: 2, dropPct: 1, recoveryHrDrop: 25, lapsHr: [148, 150, 152], ...o });
function run(act: any, st: any = {}) {
  const state = { sessions: { 'w1-di': { completed: true, activityId: 'a1', ...st }, 'w1-do': { completed: true } }, customWorkouts: {}, trend, illnessPeriods: [], adjustments: {}, settings: { lthrBike: 165 }, activities: act ? { a1: { id: 'a1', intervals: act } } : {} };
  const W = C.weeklyAdjustments(state, weeks, '2026-10-11', { now: 1 });
  return { lad: W.adjustments.find((a: any) => a.id.includes('ladder')), note: W.adjustments.find((a: any) => a.type === 'note') };
}
test('Messdaten gut: alle Intervalle, Puls im Ziel, kaum Abfall → eine Stufe weiter', () => {
  const r = run(iv({}));
  expect(r.lad.set.title).toBe('Sweet-Spot 3×10');
  expect(r.lad.reason).toMatch(/Messdaten/);
});
test('Nur 2 von 3 Intervallen → wiederholen', () => {
  const r = run(iv({ count: 2 }));
  expect(r.lad).toBeUndefined();
  expect(r.note.reason).toMatch(/nur 2 von 3/);
});
test('Puls driftet 6 % → wiederholen, Erholung zu schwach → wiederholen', () => {
  expect(run(iv({ hrDriftPct: 6 })).lad).toBeUndefined();
  expect(run(iv({ recoveryHrDrop: 8 })).note.reason).toMatch(/Pausen nur um 8/);
});
test('Ohne Rundendaten zählt die RPE, ohne RPE bleibt die Stufe', () => {
  expect(run(null, { rpe: '6' }).lad.set.title).toBe('Sweet-Spot 3×10');
  expect(run(null, {}).note.reason).toMatch(/keine Messdaten/);
});
test('Gut/Okay/Schlecht spielt keine Rolle mehr', () => {
  expect(run(iv({}), { quality: 'bad' }).lad.set.title).toBe('Sweet-Spot 3×10');
});
