/* Auftrag 8: fester Wochenaufbau mit Wochenvorgaben. Test-Person wie im Auftrag beschrieben (17, Fußball Mo Training / Fr Spiel,
   Schwimmbad nur Di und Wochenende, morgens höchstens 40 min, Kraul-Anfänger mit Brust). Block 1 endet mit Woche 5 (Erholung),
   Erkältung in Woche 4. Ab Woche 6 gilt der Plan aus den Vorgaben, danach im gleichen Muster weiter. */
import { test, expect, describe } from 'vitest';
import { replanPlan } from '../../shared/replan';
import { defaultProfile, withEstimates } from '../../shared/profile';
import { validateWeeks, ownWeekMinutes, weekVolume } from '../../shared/rules';
import { evaluate } from '../../shared/constraints';
import * as C from '../../shared/core';

const today = '2026-10-14';
const add = C.addDays;
const S = (id: string, sport: string, title: string, min: number, extra: any = {}) => ({ id, sport, title, plannedMinutes: min, ...extra });
/* Block 1 (Woche 1-5) wie bei der Test-Person: Woche 4 mit ca. 8,3 h eigenem Training, Woche 5 Erholung */
function oldPlan() {
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
const targets = [
  { start: '2026-10-19', hours: 6, longBike: [75, 90], swim: [45, 45], entry: true, tests: ['run'] },
  { start: '2026-10-26', hours: 7.5, longRun: [65, 65], longBike: [90, 105], swim: [45, 50], entry: true, tests: ['swim', 'bike'] },
  { start: '2026-11-02', hours: 8.3, longRun: [75, 75], longBike: [105, 120], swim: [50, 50] },
  { start: '2026-11-09', hours: 5.5, longRun: [50, 50], longBike: [75, 75], swim: [40, 40], recovery: true },
  { start: '2026-11-16', hours: 9, longRun: [85, 85], longBike: [120, 135], swim: [50, 50] },
  { start: '2026-11-23', hours: 9.5, longRun: [90, 90], longBike: [135, 150], swim: [50, 55] },
  { start: '2026-11-30', hours: 10, longRun: [90, 95], longBike: [150, 150], swim: [55, 55] },
  { start: '2026-12-07', hours: 6, longBike: [90, 90], swim: [40, 40], recovery: true, tests: ['swim', 'bike', 'run'] }
];
const profile = withEstimates({ ...defaultProfile(), name: 'Test', birthYear: 2009, sex: 'm', weeklyHours: 15, budgetInclTeam: true, maxDayHours: 5,
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
const goals = [{ id: 'goal-main', type: 'tri_long' as const, name: 'Ironman', date: '2029-09-15', priority: 'A' as const }];
function state() {
  const trend: any[] = [];
  for (let d = '2026-09-14'; d <= today; d = add(d, 1)) trend.push({ date: d, ctl: 30, atl: d < '2026-10-07' ? 34 : 10, restingHR: 50, hrv: 70, sleepHours: 8 });
  // Woche 4 wegen der Erkältung ausgelassen
  const sessions: any = {}; C.planDays([oldPlan().weeks[3]]).forEach((d: any) => d.sessions.forEach((s: any) => { sessions[s.id] = s.id.includes('tue-swim') ? { completed: true, metrics: { min: '45' } } : { skipped: true }; }));
  return { sessions, trend, illnessPeriods: [{ id: 'ill', start: '2026-10-07', end: '2026-10-10' }], customWorkouts: {}, adjustments: {}, activities: {}, settings: {} };
}
const r = replanPlan(oldPlan(), profile, goals, today, { state: state(), adjustments: {}, stages: { swim: { ladder: 'swim', n: 2 } } })!;
const plan = r.plan;
const W = (mon: string) => plan.weeks.find((w: any) => w.startDate === mon);
const day = (w: any, dow: number) => w.days.find((d: any) => new Date(d.date + 'T12:00:00Z').getUTCDay() === dow);
const own = (w: any) => ownWeekMinutes(w) / 60;
const titles = (w: any, dow: number) => day(w, dow).sessions.filter((s: any) => s.sport !== 'rest').map((s: any) => s.title);
const longRun = (w: any) => day(w, 0).sessions.find((s: any) => s.sport === 'run');
const longBike = (w: any) => day(w, 6).sessions.find((s: any) => s.sport === 'bike');
const swims = (w: any) => w.days.flatMap((d: any) => d.sessions.filter((s: any) => s.sport === 'swim'));
const future = plan.weeks.filter((w: any) => w.startDate >= '2026-10-19');

describe('Woche 5 bleibt, ab 19.10. der neue Plan', () => {
  test('Wochen 1-5 unverändert, Woche 6 = Block 2, Woche 1', () => {
    expect(plan.weeks.slice(0, 5)).toEqual(oldPlan().weeks);
    expect(W('2026-10-19').headline).toMatch(/^Woche 6 · Block 2, Woche 1/);
    expect(W('2026-11-16').headline).toMatch(/^Woche 10 · Block 3, Woche 1/);
    expect(plan.meta.pattern).toBe(true);
  });
  test('keine Regel verletzt (Umfang, Laufumfang, harte Tage)', () => {
    expect(r.gen.violations).toEqual([]);
    expect(r.gen.dropped).toEqual([]);
    expect(validateWeeks(plan.weeks.slice(3), { minor: true, maxIncPct: 10 })).toEqual([]);
  });
});

describe('Umfang nach den Vorgaben', () => {
  test('Gesamt je Woche (eigenes Training ohne Fußball) nah an der Vorgabe', () => {
    for (const t of targets) expect(Math.abs(own(W(t.start)) - t.hours)).toBeLessThanOrEqual(0.6);
  });
  test('langer Lauf So, lange Ausfahrt Sa und Schwimmen Di + Sa wie vorgegeben', () => {
    expect(longRun(W('2026-10-19')).title).toBe('Lauftest 30 min');
    expect(longRun(W('2026-10-19')).plannedMinutes).toBe(55);
    expect(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'].map(m => longRun(W(m)).plannedMinutes)).toEqual([65, 75, 50, 85, 90]);
    expect([90, 95]).toContain(longRun(W('2026-11-30')).plannedMinutes);
    expect(longRun(W('2026-12-07')).title).toBe('Lauftest 30 min');
    for (const t of targets) {
      const lb = longBike(W(t.start)).plannedMinutes;
      expect(lb).toBeGreaterThanOrEqual(t.longBike![0]); expect(lb).toBeLessThanOrEqual(t.longBike![1]);
      const sw = swims(W(t.start)).filter((s: any) => !/test/i.test(s.title));
      expect(sw.length).toBeGreaterThanOrEqual(1);
      sw.forEach((s: any) => expect(Math.abs(s.plannedMinutes - (t.swim![0] + t.swim![1]) / 2)).toBeLessThanOrEqual(6));
    }
  });
  test('danach im gleichen Muster: langer Lauf höchstens +10 min pro Woche und nicht über 100 min, Aufbau höchstens +10 %', () => {
    const later = future.filter((w: any) => w.startDate > '2026-12-07');
    expect(later.length).toBeGreaterThan(8);
    let prev = 95;
    for (const w of later) {
      const lr = longRun(w);
      if (!lr || /test/i.test(lr.title)) continue;
      expect(lr.plannedMinutes).toBeLessThanOrEqual(100);
      if (!w.isRecoveryWeek) { expect(lr.plannedMinutes - prev).toBeLessThanOrEqual(10); prev = lr.plannedMinutes; }
      expect(own(w)).toBeLessThanOrEqual(12.05); // Wochenlimit 15 h inklusive 3 h Fußball
    }
    expect(own(later[0])).toBeGreaterThan(own(W('2026-11-30')));
    // Erholung alle 4 Wochen
    expect(later.filter((w: any) => w.isRecoveryWeek).map((w: any) => w.startDate).slice(0, 2)).toEqual(['2027-01-04', '2027-02-01']);
  });
  test('Anzeige: Umfang und Steigerung zur letzten Aufbauwoche', () => {
    const i8 = plan.weeks.indexOf(W('2026-11-02')), i10 = plan.weeks.indexOf(W('2026-11-16')), i9 = plan.weeks.indexOf(W('2026-11-09'));
    const v10 = weekVolume(plan.weeks, i10);
    expect(v10.refWeek).toBe(8);
    expect(v10.pct).toBe(Math.round((own(W('2026-11-16')) / own(W('2026-11-02')) - 1) * 100));
    expect(v10.pct!).toBeGreaterThan(0);
    expect(weekVolume(plan.weeks, i9).pct!).toBeLessThan(-20);
    expect(weekVolume(plan.weeks, i8).refWeek).toBe(7);
    expect(weekVolume(plan.weeks, 0).pct).toBe(null);
  });
});

describe('Aufbau einer normalen Woche', () => {
  test('Mo nur Fußball, Di Schwimmen + Kraft Unterkörper, Fr Kraft Oberkörper + Spiel, Sa Schwimmen + lange Ausfahrt, So langer Lauf', () => {
    for (const w of future.slice(0, 16)) {
      expect(titles(w, 1).every((t: string) => /Fußball/.test(t))).toBe(true);
      expect(day(w, 2).sessions.some((s: any) => s.sport === 'swim')).toBe(true);
      expect(day(w, 2).sessions.some((s: any) => s.sport === 'strength' && s.area === 'lower')).toBe(true);
      expect(day(w, 5).sessions.some((s: any) => s.sport === 'strength' && s.area === 'upper')).toBe(true);
      expect(day(w, 5).sessions.some((s: any) => /Spiel/.test(s.title))).toBe(true);
      expect(day(w, 6).sessions.some((s: any) => s.sport === 'swim')).toBe(true);
    }
  });
  test('Mi Rad: Sweet Spot ab Woche 8 (3×8 → 3×12 → 2×20), vorher locker, Woche 7 der Radtest', () => {
    expect(titles(W('2026-10-19'), 3)[0]).toMatch(/^Lockere Ausfahrt/);
    expect(titles(W('2026-10-26'), 3)[0]).toBe('Radtest 20 min');
    expect(titles(W('2026-11-02'), 3)[0]).toMatch(/^Sweet Spot 3×8/);
    expect(titles(W('2026-11-09'), 3)[0]).toMatch(/^Lockere Ausfahrt/);
    expect(titles(W('2026-11-16'), 3)[0]).toMatch(/^Sweet Spot 3×12/);
    expect(titles(W('2026-11-23'), 3)[0]).toMatch(/^Sweet Spot 2×20/);
    for (const w of future.slice(0, 12)) expect(day(w, 3).sessions.find((s: any) => s.sport === 'bike').plannedMinutes).toBeLessThanOrEqual(90);
  });
  test('Do Lauf 40-50 min Zone 2, ab Woche 8 mit 4-6 Steigerungsläufen', () => {
    for (const w of future.slice(0, 12)) {
      const run = day(w, 4).sessions.find((s: any) => s.sport === 'run');
      expect(run.zone).toBe('Zone 2');
      if (!w.isRecoveryWeek) { expect(run.plannedMinutes).toBeGreaterThanOrEqual(40); expect(run.plannedMinutes).toBeLessThanOrEqual(50); }
    }
    expect(day(W('2026-10-19'), 4).sessions[0].description).not.toMatch(/Steigerungsläufe/);
    expect(day(W('2026-11-02'), 4).sessions[0].description).toMatch(/4 Steigerungsläufe/);
    expect(day(W('2026-11-16'), 4).sessions[0].description).toMatch(/6 Steigerungsläufe/);
  });
  test('Sa Koppellauf 10-15 min ab Woche 10, nur wenn gut erholt, nicht in Erholungswochen', () => {
    const brick = (w: any) => day(w, 6).sessions.find((s: any) => /Koppellauf/.test(s.title));
    expect(brick(W('2026-11-02'))).toBeUndefined();
    expect(brick(W('2026-11-16')).plannedMinutes).toBe(10);
    expect(brick(W('2026-11-23')).plannedMinutes).toBe(15);
    expect(brick(W('2026-11-16')).description).toMatch(/gut erholt/);
    expect(brick(W('2026-12-07'))).toBeUndefined();
  });
  test('Morgens optional Mobility oder lockeres Rad nur bei grüner Ampel (Hinweis), keine Einheit morgens über 40 min', () => {
    expect(W('2026-11-02').important).toMatch(/optional 30-40 min Mobility oder lockeres Rad.*grüner Ampel/);
    C.planDays(future).forEach((d: any) => d.sessions.filter((s: any) => s.slot === 'am').forEach((s: any) => expect(s.plannedMinutes).toBeLessThanOrEqual(40)));
  });
});

describe('Harte Regeln', () => {
  test('Schwimmbad nur Di und Wochenende, keine Beine am Spieltag oder am Tag davor, keine Regel aus dem Raster verletzt', () => {
    for (const d of C.planDays(future)) {
      const dow = new Date(d.date + 'T12:00:00Z').getUTCDay();
      for (const s of d.sessions) {
        if (s.sport === 'swim') expect([0, 2, 6]).toContain(dow);
        if (s.sport === 'strength' && s.area === 'lower') expect([4, 5]).not.toContain(dow);
        if (!s.fixed) expect(evaluate(profile.rules!, s, d.date).hard).toEqual([]);
      }
    }
  });
});

describe('Tests', () => {
  const at = (date: string) => C.planDays(plan.weeks).find((d: any) => d.date === date)!.sessions;
  test('Lauftest So 25.10. (55 min) statt des langen Laufs, mit flacher Strecke ohne Ampeln', () => {
    const t = at('2026-10-25').find((s: any) => s.sport === 'run');
    expect(t.title).toBe('Lauftest 30 min'); expect(t.plannedMinutes).toBe(55);
    expect(t.description).toMatch(/15 min.*einlaufen/); expect(t.description).toMatch(/30 min/); expect(t.description).toMatch(/10 min.*auslaufen/);
    expect(t.description).toMatch(/flache Strecke ohne Ampeln/);
  });
  test('Schwimmtest Di 27.10.: Kraul-Check (200 m Brust, längste Strecke Kraul, 4×25 m, 200 m Brust auf Zeit), danach Technik', () => {
    const t = at('2026-10-27').find((s: any) => s.sport === 'swim');
    expect(t.title).toBe('Schwimmtest: Kraul-Check');
    expect(t.description).toMatch(/200 m Brust.*einschwimmen/);
    expect(t.description).toMatch(/so weit wie möglich am Stück/);
    expect(t.description).toMatch(/4×25 m Kraul.*30 s Pause/);
    expect(t.description).toMatch(/200 m Brust.*auf Zeit/);
    expect(t.description).toMatch(/danach Technik/);
    // Kraft Unterkörper am Tag davor nur leicht: 2 Sätze, nichts Explosives
    const k = at('2026-10-27').find((s: any) => s.sport === 'strength');
    expect(k.area).toBe('lower');
    expect(k.spec.exercises.every((e: any) => e.sets <= 2 && !/Nordic/.test(e.name))).toBe(true);
  });
  test('Radtest Mi 28.10.: drinnen oder draußen, Ablauf wie vorgegeben, statt Intervallen', () => {
    const t = at('2026-10-28').find((s: any) => s.sport === 'bike');
    expect(t.title).toBe('Radtest 20 min'); expect(t.plannedMinutes).toBe(70);
    expect(t.description).toMatch(/20 min.*3×1 min zügig/); expect(t.description).toMatch(/5 min.*hart/); expect(t.description).toMatch(/20 min.*maximal gleichmäßig/);
    expect(t.description).toMatch(/Drinnen oder draußen/); expect(t.description).toMatch(/FTP = 95 %/);
  });
  test('Wiederholung in Woche 13 (Di 8.12., Mi 9.12., So 13.12.), danach alle 8 Wochen in der Erholungswoche', () => {
    expect(at('2026-12-08').some((s: any) => /Kraul-Check/.test(s.title))).toBe(true);
    expect(at('2026-12-09').some((s: any) => s.title === 'Radtest 20 min')).toBe(true);
    expect(at('2026-12-13').some((s: any) => s.title === 'Lauftest 30 min')).toBe(true);
    const testWeeks = future.filter((w: any) => C.planDays([w]).some((d: any) => d.sessions.some((s: any) => /test/i.test(s.title)))).map((w: any) => w.startDate);
    expect(testWeeks.slice(0, 4)).toEqual(['2026-10-19', '2026-10-26', '2026-12-07', '2027-02-01']);
    expect(W('2027-02-01').isRecoveryWeek).toBe(true);
  });
  test('nie zwei harte Tests an aufeinanderfolgenden Tagen, nie am Tag nach einem Spiel', () => {
    const days = C.planDays(future);
    days.forEach((d: any, i: number) => {
      const hardTest = d.sessions.some((s: any) => /test/i.test(s.title) && s.hard);
      if (!hardTest) return;
      const prev = days[i - 1];
      expect(prev.sessions.some((s: any) => /test/i.test(s.title) && s.hard)).toBe(false);
      expect(prev.sessions.some((s: any) => /Spiel/.test(s.title))).toBe(false);
    });
  });
});
