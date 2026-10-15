/* Test-Person mit festem Wochenaufbau (Auftrag 8/9), wie im Auftrag beschrieben: 17, Fußball Mo/Fr, Schwimmbad nur Di und Wochenende,
   Kraul-Anfänger, Block 1 mit Erkältung in Woche 4. Keine echten Daten. Genutzt von Unit- und Layout-Tests. */
import { replanPlan } from '../shared/replan';
import { defaultProfile, withEstimates } from '../shared/profile';
import * as C from '../shared/core';

const add = C.addDays;
export const today = '2026-10-14';
const S = (id: string, sport: string, title: string, min: number, extra: any = {}) => ({ id, sport, title, plannedMinutes: min, ...extra });
/* Block 1 (Woche 1-5) wie bei der Test-Person: Woche 4 mit ca. 8,3 h eigenem Training, Woche 5 Erholung */
export function oldPlan() {
  const week = (i: number, f: number) => {
    const mon = add('2026-09-14', i * 7); const p = `w${i + 1}`;
    const days = [
      [S(`${p}-mon`, 'football', 'Fußballtraining', 90, { fixed: true })],
      [S(`${p}-tue-swim`, 'swim', 'Kraultechnik', Math.round(55 * f)), S(`${p}-tue-str`, 'strength', 'Kraft Oberkörper', Math.round(40 * f))],
      [S(`${p}-wed-bike`, 'bike', 'Sweet Spot 3×8', Math.round(53 * f))],
      [S(`${p}-thu-run`, 'run', 'Lockerer Lauf', Math.round(41 * f))],
      [S(`${p}-fri-bike`, 'bike', 'Lockeres Rad', Math.round(41 * f)), S(`${p}-fri-str`, 'strength', 'Kraft Unterkörper', Math.round(35 * f)), S(`${p}-fri-game`, 'football', 'Fußballspiel', 90, { fixed: true })],
      [S(`${p}-sat-swim`, 'swim', 'Kraultechnik', Math.round(50 * f)), S(`${p}-sat-bike`, 'bike', 'Lange Grundlagenfahrt', Math.round(95 * f))],
      [S(`${p}-sun-run`, 'run', 'Langer Lauf', Math.round(88 * f))]
    ];
    return { weekNumber: i + 1, label: 'Woche ' + (i + 1), startDate: mon, endDate: add(mon, 6), isRecoveryWeek: i === 4, days: days.map((ss, k) => ({ date: add(mon, k), sessions: ss })) };
  };
  return { meta: { event: 'Ironman', eventDate: '2029-09-15', blockName: 'Block 1 · Grundlage', scoreCalibration: { version: 2, date: '2026-10-03', scores: { swim: 30, bike: 48, run: 64, strength: 52 } } },
    weeks: [week(0, 0.9), week(1, 0.85), week(2, 0.95), week(3, 1), week(4, 0.5)], zonePercents: [], keyDates: [] };
}
export const targets = [
  { start: '2026-10-19', hours: 6, longBike: [75, 90], swim: [45, 45], entry: true, tests: ['run'] },
  { start: '2026-10-26', hours: 7.5, longRun: [65, 65], longBike: [90, 105], swim: [45, 50], entry: true, tests: ['swim', 'bike'] },
  { start: '2026-11-02', hours: 8.3, longRun: [75, 75], longBike: [105, 120], swim: [50, 50] },
  { start: '2026-11-09', hours: 5.5, longRun: [50, 50], longBike: [75, 75], swim: [40, 40], recovery: true },
  { start: '2026-11-16', hours: 9, longRun: [85, 85], longBike: [120, 135], swim: [50, 50] },
  { start: '2026-11-23', hours: 9.5, longRun: [90, 90], longBike: [135, 150], swim: [50, 55] },
  { start: '2026-11-30', hours: 10, longRun: [90, 95], longBike: [150, 150], swim: [55, 55] },
  { start: '2026-12-07', hours: 6, longBike: [90, 90], swim: [40, 40], recovery: true, tests: ['swim', 'bike', 'run'] }
];
export const profile = withEstimates({ ...defaultProfile(), name: 'Test', birthYear: 2009, sex: 'm', weeklyHours: 15, budgetInclTeam: true, maxDayHours: 5,
  sports: ['swim', 'bike', 'run', 'strength', 'football'], dayLoad: { 0: 3, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 3 },
  teamSport: { name: 'Fußball', trainingDays: [1], trainingMinutes: 90, gameDays: [5], gameMinutes: 90 }, progression: { buildWeeks: 3, incPct: 10 },
  skills: { swimCrawl: 'some', swimCrawlM: 25, swimBreast: true, runContinuousMin: 60, bikeLongestMin: 95 }, bikes: ['gravel', 'trainer'],
  strengthPlan: { lower: [2], upper: [5] }, morning: { days: [1, 2, 3, 4, 5], maxMin: 40, noPool: true, label: 'vor der Schule' },
  rules: [
    { id: 'r1', kind: 'neverDays', strength: 'hard', sport: 'swim', days: [1, 3, 4, 5], source: 'grid' },
    { id: 'r2', kind: 'neverDays', strength: 'hard', sport: 'bike', days: [1, 2, 4], source: 'grid' },
    { id: 'r3', kind: 'neverDays', strength: 'hard', sport: 'run', days: [1, 2, 3, 5], source: 'grid' },
    { id: 'r4', kind: 'neverDays', strength: 'hard', sport: 'strength', days: [3], source: 'grid' }],
  thresholds: { lthrRun: 170, lthrBike: 169, thresholdPaceRunSec: 339, thresholdSpeedBikeKmh: 28, aetHr: [150, 155], estimated: [] },
  weekPattern: {
    slots: [
      { dow: 2, sport: 'swim', role: 'swim' }, { dow: 2, sport: 'strength', role: 'lower', min: [35, 40] },
      { dow: 3, sport: 'bike', role: 'key', min: [50, 75], keyFrom: '2026-11-02' },
      { dow: 4, sport: 'run', role: 'easy', min: [40, 50], stridesFrom: '2026-11-02' },
      { dow: 5, sport: 'strength', role: 'upper', min: [30, 30] },
      { dow: 6, sport: 'swim', role: 'swim' }, { dow: 6, sport: 'bike', role: 'long' }, { dow: 6, sport: 'run', role: 'brick', min: [10, 15], from: '2026-11-16' },
      { dow: 0, sport: 'run', role: 'long' }],
    targets, longRunMax: 100, longRunStep: 10, testEveryWeeks: 8
  } } as any, today);
export const goals = [{ id: 'goal-main', type: 'tri_long' as const, name: 'Ironman', date: '2029-09-15', priority: 'A' as const }];
export function state() {
  const trend: any[] = [];
  for (let d = '2026-09-14'; d <= today; d = add(d, 1)) trend.push({ date: d, ctl: 30, atl: d < '2026-10-07' ? 34 : 10, restingHR: 50, hrv: 70, sleepHours: 8 });
  // Woche 4 wegen der Erkältung ausgelassen
  const sessions: any = {}; C.planDays([oldPlan().weeks[3]]).forEach((d: any) => d.sessions.forEach((s: any) => { sessions[s.id] = s.id.includes('tue-swim') ? { completed: true, metrics: { min: '45' } } : { skipped: true }; }));
  return { sessions, trend, illnessPeriods: [{ id: 'ill', start: '2026-10-07', end: '2026-10-10' }], customWorkouts: {}, adjustments: {}, activities: {}, settings: {} };
}

/* Plan ab dem 19.10. mit allen Zusätzen: Einstieg, Tests, Erholung, Platzhalter-Ziele, Zeitleiste */
export function patternPlan(withPath = false): any {
  const gl: any[] = withPath ? [...goals, { id: 'g-sprint', type: 'tri_sprint', name: 'Sprint-Triathlon', date: null, priority: 'C' }, { id: 'g-oly', type: 'tri_olympic', name: 'Olympische Distanz', date: null, priority: 'B' }, { id: 'g-mid', type: 'tri_middle', name: 'Halb-Ironman', date: null, priority: 'B' }] : goals;
  return replanPlan(oldPlan(), profile, gl, today, { state: state(), adjustments: {}, stages: { swim: { ladder: 'swim', n: 2 } }, from: '2026-10-19' })!;
}
