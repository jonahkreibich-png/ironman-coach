/* Scores (Auftrag 12): feste Leistungsskala, drei Marken, „Warum?“, kein Abschneiden bei 100 */
import { test, expect, describe } from 'vitest';
import { sportScores, formScore, legacyActivities, scale, SCALES, ageSexFactor, levelLabel } from '../../shared/scores';
import { defaultProfile } from '../../shared/profile';
import { addDays } from '../../shared/core';
import { vdotFromThreshold } from '../../shared/vdot';
import type { Activity } from '../../shared/activity/analyze';

const today = '2026-10-14';
const profile = { ...defaultProfile(), birthYear: 2000, weightKg: 70, thresholds: { ...defaultProfile().thresholds, lthrRun: 170, lthrBike: 162, thresholdPaceRunSec: 300, thresholdSpeedBikeKmh: 30 } };
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
const base = { today, trend: [], illness: [], profile, goal };

describe('Feste Skala', () => {
  test('Anker: 20 Einsteiger, 50 solider Hobbysportler, 70 stark, 85 Spitzenamateur, 100 Elite', () => {
    expect(scale(SCALES.runVdot, 27)).toBe(20); expect(scale(SCALES.runVdot, 42)).toBe(50); expect(scale(SCALES.runVdot, 52)).toBe(70); expect(scale(SCALES.runVdot, 63)).toBe(85); expect(scale(SCALES.runVdot, 75)).toBe(100);
    expect(scale(SCALES.bikeWkg, 3)).toBe(50); expect(scale(SCALES.swimCss, 110)).toBe(50); expect(scale(SCALES.swimCss, 82)).toBe(85);
    expect(levelLabel(20)).toBe('Einsteiger'); expect(levelLabel(52)).toBe('solider Hobbysportler'); expect(levelLabel(72)).toBe('stark'); expect(levelLabel(88)).toBe('Spitzenamateur');
  });
  test('kein Abschneiden: über 100 geht weiter, besser bleibt besser', () => {
    expect(scale(SCALES.runVdot, 80)).toBeGreaterThan(100);
    expect(scale(SCALES.swimCss, 60)).toBeGreaterThan(100);
  });
  test('alters- und geschlechtsbereinigt: gleiche Pace zählt bei einer 50-jährigen Frau mehr', () => {
    expect(ageSexFactor({ birthYear: 1976, sex: 'f' }, today, 'run')).toBeGreaterThan(1.2);
    const p50 = { ...profile, birthYear: 1976, sex: 'f' as const };
    const a = sportScores({ ...base, activities: [] }, ['run'])[0], b = sportScores({ ...base, profile: p50, activities: [] }, ['run'])[0];
    expect(b.score).toBeGreaterThan(a.score + 10);
  });
});

describe('Laufen', () => {
  test('ohne Messdaten: Wert aus der Schwelle im Profil, Sicherheit niedrig, Text sagt es', () => {
    const [s] = sportScores({ ...base, activities: [] }, ['run']);
    expect(s.score).toBe(Math.round(scale(SCALES.runVdot, vdotFromThreshold(1000 / 300))));
    expect(s.confidence).toBeLessThan(0.2);
    expect(s.confText).toMatch(/niedrig/);
  });
  test('besser werdende Effizienz hebt den Score, Warum nennt weniger Puls bei gleicher Pace', () => {
    const acts = [
      ...[40, 37, 34, 31, 28, 25].map(d => run(d, { avgHr: 150 })),
      ...[20, 16, 12, 8, 5, 2].map(d => run(d, { avgHr: 143 })),
      run(10, { min: 95, avgHr: 145, decouplingPct: 3 })
    ];
    const [s] = sportScores({ ...base, goal: { ...goal, targetTimeSec: 2 * 3600 + 5 * 60 }, activities: acts }, ['run']);
    expect(s.measured).not.toBeNull();
    expect(s.trend[s.trend.length - 1].score).toBeGreaterThanOrEqual(s.trend[0].score);
    expect(s.why.join(' ')).toMatch(/Schläge weniger Puls bei gleicher Pace/);
    expect(s.parts.find(p => p.key === 'long')!.value).toBe('95 min');
    expect(s.counted.length).toBeGreaterThan(5);
  });
  test('drei Marken statt „Ziel“: Für dein Ziel nötig (mit ✓ wenn schon schneller), Nächstes Etappenziel, Wunschzeit', () => {
    const [s] = sportScores({ ...base, goal: { ...goal, type: 'tri_long', targetTimeSec: 11 * 3600 }, activities: [] }, ['run']);
    const thr = s.parts.find(p => p.key === 'thr')!;
    const kinds = thr.marks.map(m => m.kind);
    expect(kinds).toEqual(['need', 'next', 'wish']);
    expect(thr.marks[0].text).toMatch(/^Für dein Ziel nötig: 5:57\/km, du bist schon 57 s schneller ✓$/);
    expect(thr.marks[1].text).toMatch(/^Nächstes Etappenziel: 4:5\d\/km$/);
    expect(thr.marks.some(m => /^Ziel/.test(m.text))).toBe(false);
    expect(thr.target).toContain(' · ');
  });
  test('Etappenziel bleibt gespeichert und wird gemeldet, wenn es erreicht ist', () => {
    const stages = { 'run.thr': { target: 305, from: 315, set: addDays(today, -20) } };
    const [s] = sportScores({ ...base, activities: [], stages }, ['run']);
    expect(s.reached[0].text).toMatch(/Etappenziel erreicht, Schwellen-Pace 5:00\/km \(Ziel war 5:05\/km\)/);
    expect(s.stages['run.thr'].target).toBeLessThan(300);
    const [s2] = sportScores({ ...base, activities: [], stages: { 'run.thr': { target: 290, from: 300, set: addDays(today, -5) } } }, ['run']);
    expect(s2.reached).toEqual([]); expect(s2.stages['run.thr'].target).toBe(290);
  });
  test('Hitze wird herausgerechnet: gleicher Lauf bei 30 °C zählt nicht schlechter', () => {
    const cool = sportScores({ ...base, activities: [1, 3, 5, 7, 9, 11].map(d => run(d, { avgHr: 145, tempC: 15 })) }, ['run'])[0];
    const hot = sportScores({ ...base, activities: [1, 3, 5, 7, 9, 11].map(d => run(d, { avgHr: 150, tempC: 30, efficiency: Math.round(10 / 3.6 * 60 / 150 * 100) / 100 })) }, ['run'])[0];
    expect(Math.abs(hot.score - cool.score)).toBeLessThanOrEqual(3);
  });
  test('Werte unter Krankheit zählen weniger', () => {
    const acts = [1, 2, 3, 4, 5, 6].map(d => run(d, { avgHr: 160, speedKmh: 8 })).concat([10, 12, 14].map(d => run(d, { avgHr: 140 })));
    const sick = sportScores({ ...base, activities: acts, illness: [{ start: addDays(today, -7), end: today }] }, ['run'])[0];
    const well = sportScores({ ...base, activities: acts }, ['run'])[0];
    expect(sick.score).toBeGreaterThanOrEqual(well.score);
  });
  test('manuelle Korrektur aus den Einstellungen wirkt', () => {
    const a = sportScores({ ...base, activities: [] }, ['run'])[0], b = sportScores({ ...base, activities: [], manualAdjust: { run: 5 } }, ['run'])[0];
    expect(b.score - a.score).toBe(5);
  });
});

describe('Rad, Schwimmen, Kraft, Form', () => {
  test('Rad mit Leistungsmessung nutzt FTP in W/kg', () => {
    const rides = [3, 6, 9, 12, 15, 18].map(d => ({ ...run(d), sport: 'bike', speedKmh: 30, avgHr: 152, avgPower: 220, min: 40, efficiency: 2 } as Activity));
    const [s] = sportScores({ ...base, profile: { ...base.profile, powerMeter: true }, activities: rides }, ['bike']);
    expect(s.parts[0].label).toBe('FTP');
    expect(s.parts[0].value).toMatch(/W\/kg/);
  });
  test('Rad ohne Watt: Schwellen-Tempo des Hauptrads, Gravel wird umgerechnet', () => {
    const road = sportScores({ ...base, profile: { ...profile, bikes: ['road'] }, activities: [] }, ['bike'])[0];
    const grav = sportScores({ ...base, profile: { ...profile, bikes: ['gravel'] }, activities: [] }, ['bike'])[0];
    expect(road.parts[0].value).toMatch(/30,0 km\/h \(Rennrad, flach\)/);
    expect(grav.parts[0].value).toMatch(/30,0 km\/h \(Gravel, flach\)/);
    expect(grav.score).toBeGreaterThan(road.score); // 30 km/h auf dem Gravelbike ist mehr Leistung
  });
  test('Schwimmen: CSS aus langen Serien, Meter pro Zug aus den Zügen pro Bahn', () => {
    const swims = [2, 5, 8, 11, 14, 17].map(d => ({ ...run(d), sport: 'swim', km: 1.6, speedKmh: null, avgHr: null, efficiency: null,
      swim: { poolLengthM: 25, lengths: 64, activeLengths: 64, strokesPerLength: 18, metersPerStroke: 1.39, pace100: 125, byStroke: { freestyle: 1600 }, longestContinuousM: 600, longestCrawlM: 600, strokeRate: 30 } } as unknown as Activity));
    const [s] = sportScores({ ...base, activities: swims }, ['swim']);
    // Auftrag 20: der vorsichtige Startwert zieht anfangs noch eine Sekunde mit
    expect(s.parts.find(p => p.key === 'css')!.value).toMatch(/^2:0[89]\/100 m$/);
    expect(s.parts.find(p => p.key === 'tech')!.value).toMatch(/1,11 m \(18 Züge\/Bahn\)/);
    expect(s.parts.find(p => p.key === 'cont')!.value).toBe('600 m');
  });
  test('Schwimmen vor dem CSS-Test: Kraul am Stück zählt, Etappenziel „100 m“ mit Zuwachs', () => {
    const p = { ...profile, sports: ['swim'] as any, skills: { swimCrawl: 'some' as const, swimCrawlM: 50 }, thresholds: { ...profile.thresholds, cssSec: 160, estimated: ['cssSec' as const] } };
    const [s] = sportScores({ ...base, profile: p, activities: [] }, ['swim']);
    expect(s.parts.find(x => x.key === 'cont')!.marks.find(m => m.kind === 'next')!.text).toBe('Nächstes Etappenziel: 100 m');
    expect(s.gains.map(g => g.text).join(' ')).toMatch(/Kraul am Stück auf 100 m → \+\d/);
  });
  test('Nichtkrauler: Brust-Tempo statt CSS', () => {
    const p = { ...profile, skills: { swimCrawl: 'no' as const }, thresholds: { ...profile.thresholds, cssSec: null, breast100Sec: 170 } };
    const [s] = sportScores({ ...base, profile: p, activities: [] }, ['swim']);
    expect(s.parts[0].label).toBe('Brust-Tempo'); expect(s.parts[0].value).toMatch(/Brust$/);
  });
  test('Kraft: Regelmäßigkeit auf fester Skala (1,5 pro Woche = 55)', () => {
    const k = [2, 9, 16, 23, 30, 37, 5, 12, 19].map(d => ({ ...run(d), sport: 'strength' } as Activity));
    const [s] = sportScores({ ...base, activities: k }, ['strength']);
    expect(s.parts).toHaveLength(1);
    // Auftrag 21: gleitend gewichtet (neuere Einheiten zählen etwas mehr) statt harter 6 Wochen: etwa 1,5 pro Woche ≈ 55
    expect(s.parts[0].sub).toBeGreaterThanOrEqual(52); expect(s.parts[0].sub).toBeLessThanOrEqual(60);
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
  test('Technik-Einheit mit Pausen: Pace aus der Gesamtzeit zählt nicht (600 m in 38 min)', () => {
    const weeks = [{ days: [{ date: '2026-10-10', sessions: [{ id: 's2', sport: 'swim', title: 'Kraultechnik', plannedMinutes: 40 }] }] }];
    const acts = legacyActivities({ sessions: { s2: { completed: true, metrics: { meters: '600', min: '38' } } }, customWorkouts: {} }, weeks, profile);
    expect(acts[0].swim!.pace100).toBeNull();
  });
});
