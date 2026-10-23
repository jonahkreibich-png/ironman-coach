// @ts-nocheck – aus den alten JS-Testskripten übernommen
import { test, expect } from 'vitest';
import * as C from '../../shared/core';
function ok(cond: any, msg: string) { expect(!!cond, msg).toBe(true); }
test('Tagesampel (Phase 3)', () => {
// Tests der gemeinsamen Coach-Logik (core.js) mit erfundenen Werten.
const T = '2026-10-10';
const FB = { rhrMax: 56, hrvMin: 65, tempMax: 0.5, sleepNeed: [8.5, 9] };
// 28 ruhige Tage: HFV um 70 (leicht schwankend), Ruhepuls 50, 8,5 h Schlaf
function base(days, extra) {
  const out = [];
  for (let i = days; i >= 1; i--) {
    const d = C.addDays(T, -i);
    out.push(Object.assign({ date: d, hrv: 70 + ((i % 5) - 2) * 6, restingHR: 50 + (i % 3) - 1, sleepHours: 8.6, sleepQuality: 8 }, extra && extra(d, i)));
  }
  return out;
}
const withToday = (arr, p) => arr.concat([Object.assign({ date: T }, p)]);

console.log('Rückfall');
let r = C.readinessFor(withToday(base(5), {}), [], T, FB);
r = C.readinessFor(withToday(base(5), { hrv: 60, restingHR: 52, sleepHours: 8.6 }), [], T, FB);
ok(!r.personal && r.level === 1, 'Unter 7 Tagen: feste Grenzwerte (HFV 60 < 65 → Gelb)');

console.log('Persönlicher Normalbereich');
r = C.readinessFor(withToday(base(28), { hrv: 71, restingHR: 50, sleepHours: 8.7, sleepQuality: 8 }), [], T, FB);
ok(r.personal && r.level === 0 && r.score >= 90, 'Normaler Tag → Grün, Score ' + r.score);
let tr = base(28); tr[tr.length - 1].hrv = 55; tr[tr.length - 2].hrv = 56;
r = C.readinessFor(withToday(tr, { hrv: 54, restingHR: 50, sleepHours: 8.7 }), [], T, FB);
ok(r.level === 2 && r.reasons[0].includes('HFV deutlich'), 'HFV 3 Tage klar unter normal → Rot');
tr = base(28);
r = C.readinessFor(withToday(tr, { hrv: 55, restingHR: 50, sleepHours: 8.7 }), [], T, FB);
ok(r.level === 0, 'Einzelner Ausreißer wird durch den 3-Tage-Schnitt gedämpft (Stufe ' + r.level + ')');
r = C.readinessFor(withToday(base(28), { hrv: 70, restingHR: 53, sleepHours: 8.7 }), [], T, FB);
ok(r.level === 1 && r.reasons.some(x => x.includes('Ruhepuls 3')), 'Ruhepuls +3 → Gelb');
r = C.readinessFor(withToday(base(28), { hrv: 70, restingHR: 55, sleepHours: 8.7 }), [], T, FB);
ok(r.level === 2, 'Ruhepuls +5 → Rot');
r = C.readinessFor(withToday(base(28), { hrv: 70, restingHR: 50, bodyTemp: 0.35, sleepHours: 8.7 }), [], T, FB);
ok(r.level === 1, 'Temperatur +0,35 → Gelb');
r = C.readinessFor(withToday(base(28), { hrv: 70, restingHR: 50, bodyTemp: 0.5, sleepHours: 8.7 }), [], T, FB);
ok(r.level === 2 && r.reasons[0].includes('Wirst du krank'), 'Temperatur +0,5 → Rot mit „Wirst du krank?“');
r = C.readinessFor(withToday(base(28), { hrv: 70, restingHR: 50, sleepHours: 6.5, sleepQuality: 7 }), [], T, FB);
ok(r.level === 1 && r.reasons[0].includes('8,5-9 h'), 'Unter 7 h Schlaf → Gelb mit Hinweis auf Bedarf');
r = C.readinessFor(withToday(base(28), { hrv: 70, restingHR: 50, sleepHours: 8, sleepQuality: 4 }), [], T, FB);
ok(r.level === 1, 'Schlafqualität unter 5 → Gelb');
r = C.readinessFor(withToday(base(28), { hrv: 70, restingHR: 50, sleepHours: 8.7, ctl: 40, atl: 62 }), [], T, FB);
ok(r.level === 1 && r.reasons.some(x => x.includes('mehr als gewohnt')), 'ATL/CTL 1,55 → Gelb');
r = C.readinessFor(withToday(base(28), { hrv: 54, restingHR: 56, bodyTemp: 0.6, sleepHours: 6 }), [], T, FB);
ok(r.reasons.length === 3 && r.score <= 40, 'Höchstens 3 Gründe, Rot hat Score ≤ 40 (' + r.score + ')');

console.log('Krankheit');
const ill = [{ start: C.addDays(T, -10), end: C.addDays(T, -5) }];
tr = base(28, (d) => (d >= ill[0].start && d <= ill[0].end) ? { hrv: 35, restingHR: 62 } : {});
const b = C.baselineOf(tr, ill, T, 'restingHR');
ok(Math.abs(b.mean - 50) < 1 && b.n === 22, 'Krankheitstage zählen nicht zum Normalbereich (n ' + b.n + ', Ø ' + b.mean.toFixed(1) + ')');

console.log('Verlauf');
const h = C.readinessHistory(withToday(base(28), { hrv: 70, restingHR: 50 }), [], T, 14, FB);
ok(h.length === 14 && h[13].date === T && h.every(x => x.level != null), '14 Tage Verlauf');

});
