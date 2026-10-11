import { test, expect, describe } from 'vitest';
import { sportScores, formScore, legacyActivities } from '../../shared/scores';
import { defaultProfile } from '../../shared/profile';
import { addDays } from '../../shared/core';
import type { Activity } from '../../shared/activity/analyze';

const today = '2026-10-14';
const profile = { ...defaultProfile(), birthYear: 2000, weightKg: 70, thresholds: { ...defaultProfile().thresholds, lthrRun: 170, lthrBike: 162 } };
const goal = { id: 'g', type: 'tri_olympic' as const, name: 'Olympische Distanz', date: '2027-06-01', priority: 'A' as const };
let n = 0;
function run(daysAgo: number, o: Partial<Activity> = {}): Activity {
  const date = addDays(today, -daysAgo);
  const speed = o.speedKmh ?? 10;
  const hr = o.avgHr ?? 140;
  return { id: 'r' + (n++), source: 'healthfit', sources: ['healthfit'], sport: 'run', date, startMs: Date.parse(date + 'T07:00:00Z'), indoor: false, min: 50, elapsedMin: 50, km: 8,
    avgHr: hr, maxHr: hr + 15, avgPower: null, speedKmh: speed, paceSecKm: Math.round(3600 / speed), ascentM: 30, kcal: 500, tempC: 15, hrZones: null,
    decouplingPct: 4, efficiency: Math.round(speed / 3.6 * 60 / hr * 100) / 100, laps: [], intervals: null, swim: null, ...o } as Activity;
}
const base = { today, trend: [], illness: [], profile, goal, calibration: { date: '2026-08-01', scores: { run: 40, bike: 40, swim: 30, strength: 30 } } };

describe('Laufen', () => {
  test('ohne Messdaten gilt der Startwert aus der Kalibrierung', () => {
    const [s] = sportScores({ ...base, activities: [] }, ['run']);
    expect(s.score).toBe(40); expect(s.confidence).toBe(0);
  });
  test('besser werdende Effizienz hebt den Score, Warum nennt weniger Puls bei gleicher Pace', () => {
    const acts = [
      ...[40, 37, 34, 31, 28, 25].map(d => run(d, { avgHr: 150 })),
      ...[20, 16, 12, 8, 5, 2].map(d => run(d, { avgHr: 143 })),
      run(10, { min: 95, avgHr: 145, decouplingPct: 3 })
    ];
    const [s] = sportScores({ ...base, goal: { ...goal, targetTimeSec: 2 * 3600 + 5 * 60 }, activities: acts }, ['run']);
    expect(s.measured).not.toBeNull();
    expect(s.basis).toMatch(/Zielzeit/);
    expect(s.trend[s.trend.length - 1].score).toBeGreaterThan(s.trend[0].score);
    expect(s.why.join(' ')).toMatch(/Schläge weniger Puls bei gleicher Pace/);
    expect(s.parts.find(p => p.key === 'long')!.value).toBe('95 min');
  });
  test('Hitze wird herausgerechnet: gleicher Lauf bei 30 °C zählt nicht schlechter', () => {
    const cool = sportScores({ ...base, activities: [1, 3, 5, 7, 9, 11].map(d => run(d, { avgHr: 145, tempC: 15 })) }, ['run'])[0];
    const hot = sportScores({ ...base, activities: [1, 3, 5, 7, 9, 11].map(d => run(d, { avgHr: 150, tempC: 30, efficiency: Math.round(10 / 3.6 * 60 / 150 * 100) / 100 })) }, ['run'])[0];
    expect(Math.abs(hot.score - cool.score)).toBeLessThanOrEqual(3);
  });
  test('Werte unter Krankheit zählen weniger', () => {
    const acts = [1, 2, 3, 4, 5, 6].map(d => run(d, { avgHr: 160, efficiency: 1.0 })).concat([10, 12, 14].map(d => run(d, { avgHr: 140 })));
    const sick = sportScores({ ...base, activities: acts, illness: [{ start: addDays(today, -7), end: today }] }, ['run'])[0];
    const well = sportScores({ ...base, activities: acts }, ['run'])[0];
    expect(sick.score).toBeGreaterThanOrEqual(well.score);
  });
  test('manuelle Korrektur aus den Einstellungen wirkt', () => {
    const a = sportScores({ ...base, activities: [], manualAdjust: { run: 5 } }, ['run'])[0];
    expect(a.score).toBe(45);
  });
});

describe('Rad, Schwimmen, Kraft, Form', () => {
  test('Rad mit Leistungsmessung nutzt FTP in W/kg', () => {
    const rides = [3, 6, 9, 12, 15, 18].map(d => ({ ...run(d), sport: 'bike', speedKmh: 30, avgHr: 152, avgPower: 220, min: 40, efficiency: 2 } as Activity));
    const [s] = sportScores({ ...base, activities: rides }, ['bike']);
    expect(s.parts[0].label).toBe('FTP');
    expect(s.parts[0].value).toMatch(/W\/kg/);
  });
  test('Schwimmen: CSS aus langen Serien, Meter pro Zug', () => {
    const swims = [2, 5, 8, 11, 14, 17].map(d => ({ ...run(d), sport: 'swim', km: 1.6, speedKmh: null, avgHr: null, efficiency: null,
      swim: { poolLengthM: 25, lengths: 64, activeLengths: 64, strokesPerLength: 18, metersPerStroke: 1.39, pace100: 125, byStroke: {}, longestContinuousM: 600, strokeRate: 30 } } as unknown as Activity));
    const [s] = sportScores({ ...base, activities: swims }, ['swim']);
    expect(s.parts.find(p => p.key === 'css')!.value).toBe('2:08/100 m');
    expect(s.parts.find(p => p.key === 'tech')!.value).toMatch(/1,39 m/);
  });
  test('Kraft: nur Regelmäßigkeit, wenn keine Gewichte eingetragen sind', () => {
    const k = [2, 9, 16, 23, 30, 37, 5, 12, 19].map(d => ({ ...run(d), sport: 'strength' } as Activity));
    const [s] = sportScores({ ...base, activities: k }, ['strength']);
    expect(s.parts).toHaveLength(1);
    expect(s.parts[0].sub).toBe(100);
  });
  test('Gesamt-Form: CTL im Verhältnis zum Ziel', () => {
    const loads: Record<string, number> = {};
    for (let i = 0; i < 120; i++) loads[addDays(today, -i)] = 60;
    const f = formScore({ ...base, activities: [], loadsBySport: { run: loads } });
    expect(f.ctl).toBeGreaterThan(50);
    expect(f.target).toBe(55);
    expect(f.score).toBeGreaterThan(90);
  });
  test('Alte Einträge ohne Aufzeichnung zählen mit', () => {
    const weeks = [{ days: [{ date: '2026-10-10', sessions: [{ id: 's1', sport: 'run', title: 'Lauf' }, { id: 's2', sport: 'swim', title: 'Schwimmen' }] }] }];
    const acts = legacyActivities({ sessions: { s1: { completed: true, metrics: { km: '8', min: '48', hr: '145' } }, s2: { completed: true, metrics: { meters: '1500', min: '35', spl: '19' } } }, customWorkouts: {} }, weeks, profile);
    expect(acts).toHaveLength(2);
    expect(acts[0].paceSecKm).toBe(360);
    expect(acts[1].swim!.pace100).toBe(140);
  });
});
