import { test, expect } from 'vitest';
import * as C from '../../shared/core';

test('Pulszonen aus der Schwelle', () => {
  const s = { sport: 'run', zone: 'Zone 2' };
  expect(C.zoneBpm(s, { lthrRun: 170 }, null)).toBe('138-151 bpm');
  expect(C.zoneBpm({ sport: 'bike', zone: 'Zone 3-4' }, { lthrBike: 160 }, null)).toBe('144-163 bpm');
  expect(C.zoneBpm({ sport: 'swim', zone: 'Zone 2' }, {}, null)).toBeNull();
  expect(C.zoneBpm({ sport: 'run', zone: 'Zone 5' }, { lthrRun: 170 }, null)).toBe('173-203 bpm');
});

test('Uhrzeit einer Einheit, aber keine Pace', () => {
  expect(C.sessionTime({ title: 'Lauf 6:15 vor der Schule' }, null)).toBe('06:15');
  expect(C.sessionTime({ title: 'Tempo 5:39/km' }, null)).toBeNull();
  expect(C.sessionTime({ title: 'Rad', time: '17:30' }, null)).toBe('17:30');
  expect(C.sessionTime({ title: 'Rad' }, { time: '7:05' })).toBe('07:05');
  expect(C.isEarly({ title: 'Lauf vor der Schule' }, null)).toBe(true);
});

test('Kalorienziel steigt mit dem Training', () => {
  const weeks = [{ weekNumber: 1, days: [
    { date: '2026-10-14', sessions: [{ id: 'a', sport: 'run', title: 'Lauf', plannedMinutes: 60, zone: 'Zone 2' }] },
    { date: '2026-10-15', sessions: [{ id: 'b', sport: 'rest', title: 'Ruhetag' }] }
  ] }];
  const st = { sessions: {}, nutrition: {}, customWorkouts: {}, illnessPeriods: [] };
  const prof = { age: 30, heightCm: 180, weightKg: 70, pal: 1.4 };
  const rest = C.nutritionKcalLow(st, weeks, '2026-10-15', prof);
  const run = C.nutritionKcalLow(st, weeks, '2026-10-14', prof);
  expect(rest).toBe(Math.round((10 * 70 + 6.25 * 180 - 5 * 30 + 5) * 1.4 / 50) * 50);
  expect(run - rest).toBeGreaterThan(450);
  // Krank: Training zählt nicht
  const sick = C.nutritionKcalLow({ ...st, illnessPeriods: [{ start: '2026-10-14', end: '2026-10-14' }] }, weeks, '2026-10-14', prof);
  expect(sick).toBe(rest);
});

test('Belastung: Puls, RPE, Fußball ohne Daten', () => {
  expect(C.sessionLoad({ sport: 'run', plannedMinutes: 60 }, { metrics: { min: '60', hr: '170' } }, { lthrRun: 170 })).toBe(100);
  expect(C.sessionLoad({ sport: 'swim', plannedMinutes: 45 }, { rpe: '9' })).toBe(75);
  expect(C.sessionLoad({ sport: 'football', title: 'Spiel' }, {})).toBe(Math.round(1 * (7 / 9) ** 2 * 100));
  expect(C.sessionLoad({ sport: 'bike' }, { icuLoad: 77 })).toBe(77);
});
