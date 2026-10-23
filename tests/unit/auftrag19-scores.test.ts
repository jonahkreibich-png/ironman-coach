/* Auftrag 19: Scores als laufende Fitness-Schätzung (wie ein Kalman-Filter) mit Bereich, Formverlust in Pausen und „Warum?“ je Einheit. */
import { describe, expect, test } from 'vitest';
import { sportScores } from '../../shared/scores';
import { runFilter, decayPerDay } from '../../shared/scorefilter';
import { defaultProfile } from '../../shared/profile';
import { addDays } from '../../shared/core';
import type { Activity } from '../../shared/activity/analyze';

const today = '2026-10-20';
const profile = { ...defaultProfile(), birthYear: 1990, sports: ['run', 'bike', 'swim'] as any, weightKg: 75,
  thresholds: { ...defaultProfile().thresholds, lthrRun: 170, lthrBike: 165, thresholdPaceRunSec: 300, thresholdSpeedBikeKmh: 30 } };
const base = { today, profile, goal: null, illness: [] as any[], trend: [] };
let k = 0;
function act(sport: 'run' | 'bike' | 'swim', daysAgo: number, extra: Partial<Activity> = {}): Activity {
  const d = addDays(today, -daysAgo);
  const def: any = sport === 'run' ? { min: 45, avgHr: 145, speedKmh: 10.5, km: 7.9 }
    : sport === 'bike' ? { min: 90, avgHr: 135, speedKmh: 27, km: 40 }
    : { min: 45, km: 1.8, swim: { pace100: 120, longestContinuousM: 400, poolLengthM: 25 } };
  return { id: sport + (k++), sport, date: d, source: 'healthfit', sources: ['healthfit'], laps: [], indoor: false, ...def, ...extra } as Activity;
}
const sc = (sport: 'run' | 'bike' | 'swim', activities: Activity[], o: any = {}) => sportScores({ ...base, ...o, activities }, [sport])[0];
const weekly = (sport: 'run' | 'bike' | 'swim', from: number, to: number, every: number, extra: (d: number) => Partial<Activity> = () => ({})) => {
  const out: Activity[] = []; for (let d = from; d >= to; d -= every) out.push(act(sport, d, extra(d))); return out;
};

describe('Auftrag 19: laufende Schätzung', () => {
  test('Filter: genaue Messung bewegt mehr als ungenaue; Unsicherheit sinkt mit Messungen', () => {
    const o = (sd: number) => runFilter({ obs: [{ id: 'a', date: '2026-10-01', z: 0, sd: 0.05, kind: 'hr', title: '', value: '' }, { id: 'b', date: '2026-10-02', z: 0.1, sd, kind: sd < 0.04 ? 'test' : 'rpe', title: '', value: '' }], trained: ['2026-10-01', '2026-10-02'], cross: [], illness: [], end: '2026-10-02', prior: null })!;
    expect(o(0.025).z).toBeGreaterThan(o(0.09).z);
    expect(o(0.025).sd).toBeLessThan(0.05);
  });
  test('Formverlust: die ersten 10 Tage nichts, dann langsam; mit anderem Training halb so viel', () => {
    expect(decayPerDay(8, false)).toBe(0);
    expect(decayPerDay(20, false)).toBeGreaterThan(0);
    expect(decayPerDay(20, true)).toBeCloseTo(decayPerDay(20, false) / 2);
    expect(decayPerDay(60, false)).toBeLessThan(decayPerDay(20, false));
  });
  test('ohne Puls (nur Tempo und Gefühl): Wert ja, Bereich breiter als mit Puls', () => {
    const withHr = sc('run', weekly('run', 40, 1, 3));
    const rpe = sc('run', weekly('run', 40, 1, 3, () => ({ avgHr: null, rpe: 4 })));
    expect(rpe.measured).not.toBeNull();
    expect(rpe.range).toBeGreaterThanOrEqual(withHr.range);
    expect(rpe.why.join(' ')).toMatch(/nach Gefühl/);
  });
  test('ohne Watt: Rad-Score aus Tempo und Puls; mit Watt aus FTP', () => {
    const noW = sc('bike', weekly('bike', 40, 1, 4));
    expect(noW.parts[0].label).toBe('Schwellen-Tempo');
    expect(noW.measured).not.toBeNull();
    const withW = sc('bike', weekly('bike', 40, 1, 4, () => ({ avgPower: 170 })));
    expect(withW.parts[0].label).toBe('FTP');
  });
  test('nur von Hand eingetragen: zählt, aber unsicherer als von der Uhr', () => {
    const watch = sc('run', weekly('run', 30, 1, 3));
    const manual = sc('run', weekly('run', 30, 1, 3, () => ({ source: 'manual', sources: ['manual'] } as any)));
    expect(Math.abs(manual.score - watch.score)).toBeLessThanOrEqual(2);
    expect(manual.range).toBeGreaterThanOrEqual(watch.range);
    expect(manual.why.join(' ')).toMatch(/von Hand/);
  });
  test('nur Uhr, viele Einheiten: Bereich klein', () => {
    const s = sc('run', weekly('run', 60, 1, 2));
    expect(s.range).toBeLessThanOrEqual(4);
    expect(s.rangeText).toMatch(/^± \d/);
  });
  test('3 Wochen Pause: Wert sinkt leicht (nicht abrupt), Warum nennt die Pause', () => {
    const acts = weekly('run', 70, 22, 3);
    const before = sc('run', acts, { today: addDays(today, -21) });
    const after = sc('run', acts);
    expect(after.score).toBeLessThanOrEqual(before.score);
    expect(before.score - after.score).toBeLessThanOrEqual(3);
  });
  test('Krankheit: schwache Läufe während der Erkältung ziehen kaum runter', () => {
    const good = weekly('run', 50, 12, 3);
    const sick = [act('run', 9, { speedKmh: 8.5 }), act('run', 7, { speedKmh: 8.5 }), act('run', 5, { speedKmh: 8.5 })];
    const illness = [{ start: addDays(today, -10), end: addDays(today, -4) }];
    const healthy = sc('run', [...good, ...sick]);
    const ill = sc('run', [...good, ...sick], { illness });
    expect(ill.score).toBeGreaterThan(healthy.score);
    expect(ill.why.join(' ')).toMatch(/krank/);
  });
  test('schnelle Verbesserung: der Wert folgt innerhalb weniger Wochen', () => {
    const acts = [...weekly('run', 60, 31, 3), ...weekly('run', 30, 1, 3, d => ({ speedKmh: 11.8 }))];
    const s = sc('run', acts);
    const old = sc('run', weekly('run', 60, 31, 3), { today: addDays(today, -30) });
    expect(s.score).toBeGreaterThan(old.score + 4);
    expect(s.why.some(w => /^\+\d/.test(w))).toBe(true);
  });
  test('Plateau: gleiche Werte → Score bleibt stehen, Bereich wird kleiner', () => {
    const acts = weekly('run', 80, 1, 3);
    const mid = sc('run', acts.filter(a => a.date <= addDays(today, -40)), { today: addDays(today, -40) });
    const end = sc('run', acts);
    expect(Math.abs(end.score - mid.score)).toBeLessThanOrEqual(1);
    expect(end.range).toBeLessThanOrEqual(mid.range);
  });
  test('fehlende Felder sind unbekannt: Einheiten ohne Puls und Tempo senken den Score nicht', () => {
    const acts = weekly('run', 40, 5, 3);
    const extra = [1, 2, 3, 4].map(d => act('run', d, { avgHr: null, speedKmh: null, efficiency: null, km: null, rpe: null }));
    expect(sc('run', [...acts, ...extra]).score).toBeGreaterThanOrEqual(sc('run', acts).score);
  });
  test('Test zählt stark: ein Lauftest verschiebt mehr als ein lockerer Lauf', () => {
    const acts = weekly('run', 40, 3, 3);
    const t = sc('run', [...acts, act('run', 1, { name: 'Lauftest 30 min', min: 30, avgHr: 172, speedKmh: 13.5 })]);
    const e = sc('run', [...acts, act('run', 1, { avgHr: 145, speedKmh: 11.5 })]);
    expect(t.score).toBeGreaterThan(e.score);
    expect(t.why.join(' ')).toMatch(/Test, zählt stark/);
  });
  test('Schwimmen: lange Serien zählen, Bereich vorhanden; feste Skala und drei Marken bleiben', () => {
    const s = sc('swim', weekly('swim', 40, 1, 4));
    expect(s.measured).not.toBeNull();
    expect(s.range).toBeGreaterThan(0);
    expect(s.parts[0].key).toBe('css');
  });
  test('Verlauf ohne Sprung: der Trend der letzten 6 Wochen ist mit der neuen Rechnung berechnet (kein Bruch zum heutigen Wert)', () => {
    const s = sc('run', weekly('run', 80, 1, 2));
    const t = s.trend.map(x => x.score);
    for (let i = 1; i < t.length; i++) expect(Math.abs(t[i] - t[i - 1])).toBeLessThanOrEqual(3);
  });
});
