/* Auftrag 8: Tests auswerten (Rad, Schwimmen, Lauf über Testfelder) und Wochen-Engine beim festen Wochenaufbau */
import { test, expect, describe } from 'vitest';
import { runTestUpdate, applyTestUpdate, SPORT_FIELDS } from '../../shared/fields';
import * as W from '../../shared/workouts';
import * as C from '../../shared/core';

const prof = { thresholds: { lthrRun: 170, lthrBike: 169, thresholdPaceRunSec: 339, thresholdSpeedBikeKmh: 28, aetHr: [150, 155], ftp: null, estimated: ['ftp'] }, skills: { swimCrawl: 'some', swimCrawlM: 25 }, appliedTests: [] };
const weekWith = (date: string, s: any) => [{ weekNumber: 7, startDate: '2026-10-26', endDate: '2026-11-01', days: [{ date, sessions: [s] }] }];

describe('Radtest', () => {
  const s = { id: 'bt', sport: 'bike', title: 'Radtest 20 min', plannedMinutes: 70 };
  test('Werte von Hand (Testfelder): Schwellenpuls Rad = Ø-Puls der 20 min, FTP = 95 % der Ø-Watt', () => {
    const st = { sessions: { bt: { completed: true, metrics: { hr: '150', testHr: '175', testPower: '240' } } } };
    // Auftrag 20: Watt zählen nur mit Wattmesser; ohne (z. B. einfache Rolle) nur der Puls
    const noPm = runTestUpdate(st, weekWith('2026-10-28', s), prof, '2026-10-29')!;
    expect(noPm.thresholds.ftp).toBeUndefined();
    const pm = { ...prof, powerMeter: true };
    const u = runTestUpdate(st, weekWith('2026-10-28', s), pm, '2026-10-29')!;
    expect(u).toMatchObject({ sport: 'bike', title: 'Rad-Zonen aktualisiert', thresholds: { lthrBike: 175, ftp: 228 }, settings: { lthrBike: 175 } });
    const p = applyTestUpdate(pm, u);
    expect(p.thresholds).toMatchObject({ lthrBike: 175, ftp: 228, lthrRun: 170 });
    expect(p.thresholds.estimated).not.toContain('ftp');
    expect(p.appliedTests).toEqual(['bt']);
    expect(runTestUpdate(st, weekWith('2026-10-28', s), p, '2026-10-29')).toBe(null);
  });
  test('von der Uhr (20-min-Runde), ohne Watt nur der Puls', () => {
    const st = { sessions: { bt: { completed: true, activityId: 'a1' } }, activities: { a1: { laps: [{ sec: 600, avgHr: 140, kind: 'warmup' }, { sec: 1200, avgHr: 172, power: null, kind: 'work' }, { sec: 600, avgHr: 130, kind: 'cooldown' }] } } };
    const u = runTestUpdate(st, weekWith('2026-10-28', s), prof, '2026-10-29')!;
    expect(u.thresholds).toEqual({ lthrBike: 172 });
    expect(u.text).toMatch(/ohne Wattmessung: Rad-Zonen über den Puls/);
  });
  test('unplausibel (Puls weit weg) wird nicht übernommen', () => {
    const st = { sessions: { bt: { completed: true, metrics: { testHr: '120' } } } };
    expect(runTestUpdate(st, weekWith('2026-10-28', s), prof, '2026-10-29')).toBe(null);
  });
});

describe('Schwimmtest', () => {
  test('Kraul-Check: längste Strecke am Stück (Können), 25 m Kraul, Brust-Tempo aus 200 m Brust', () => {
    const s = { id: 'sc', sport: 'swim', title: 'Schwimmtest: Kraul-Check', plannedMinutes: 47 };
    const st = { sessions: { sc: { completed: true, metrics: { longestCrawl: '75', crawl25: '0:34', spl: '21', breast200: '4:20' } } } };
    const u = runTestUpdate(st, weekWith('2026-10-27', s), prof, '2026-10-28')!;
    expect(u).toMatchObject({ sport: 'swim', title: 'Schwimmtest ausgewertet', thresholds: { crawl25Sec: 34, breast100Sec: 130 }, skills: { swimCrawlM: 75, swimCrawl: 'some' } });
    expect(u.text).toMatch(/Kraul am Stück: 75 m/); expect(u.text).toMatch(/21 Zügen/);
    const p = applyTestUpdate(prof, u);
    expect(p.skills.swimCrawlM).toBe(75); expect(p.thresholds.breast100Sec).toBe(130);
    expect(p.thresholds.lthrRun).toBe(170);
  });
  test('CSS-Test: Schwimm-Schwelle = (400 m − 200 m) / 2', () => {
    const s = { id: 'css', sport: 'swim', title: 'Schwimmtest 400/200 m', plannedMinutes: 40 };
    const st = { sessions: { css: { completed: true, metrics: { css400: '8:40', css200: '4:10' } } } };
    const u = runTestUpdate(st, weekWith('2026-12-08', s), prof, '2026-12-09')!;
    expect(u.thresholds).toEqual({ cssSec: 135 });
    expect(u.skills!.swimCrawlM).toBe(400);
  });
  test('Testfelder nur bei Tests, mit Zeiten im Format mm:ss', () => {
    expect(SPORT_FIELDS.swim.filter(f => f.test).map(f => f.key)).toEqual(['crawl25', 'breast200', 'css400', 'css200']);
    expect(SPORT_FIELDS.bike.filter(f => f.test).map(f => f.key)).toEqual(['testHr', 'testPower', 'testSpeed']);
    expect(SPORT_FIELDS.run.filter(f => f.test).map(f => f.key)).toEqual(['testHr', 'testPace']);
  });
});

describe('Lauftest mit Testfeldern', () => {
  test('Ø-Puls der letzten 20 min und Ø-Pace aus den Testfeldern gehen vor dem Durchschnitt der ganzen Einheit', () => {
    const s = { id: 'rt', sport: 'run', title: 'Lauftest 30 min', plannedMinutes: 55 };
    const st = { sessions: { rt: { completed: true, metrics: { hr: '160', pace: '5:20', testHr: '174', testPace: '4:58' } } } };
    const u = runTestUpdate(st, weekWith('2026-10-25', s), prof, '2026-10-26')!;
    expect(u).toMatchObject({ sport: 'run', lthrRun: 174, thresholdPaceRunSec: 298, thresholds: { lthrRun: 174, thresholdPaceRunSec: 298 } });
  });
});

describe('Bausteine', () => {
  test('Schwimmen mit Brust-Ausdauer bis zur Zielzeit, Kraul-Stücke bleiben so kurz wie die Stufe', () => {
    const sp = W.swimLearn({}, { ladder: 'swim', n: 2, breast: true }, 'x', 50);
    const t = W.totals(sp).min;
    expect(t).toBeGreaterThanOrEqual(46); expect(t).toBeLessThanOrEqual(53);
    expect(Math.max(...sp.steps.filter(s => s.mode === 'crawl').map(s => s.m || 0))).toBe(25);
    expect(sp.fillMin).toBe(50);
  });
  test('Sweet Spot: Titel und Ablauf passen zusammen, Ein- und Ausrollen füllen die Dauer', () => {
    const b = W.build(W.bikeSweetSpot({ indoor: true }, 3, 12, 75));
    expect(b.title).toBe('Rad-Intervalle 3×12 min Sweet Spot (Rolle)');
    expect(b.plannedMinutes).toBe(75);
    expect(b.description).toMatch(/3×12 min zügig.*Sweet Spot/);
  });
});

describe('Wochen-Engine beim festen Wochenaufbau', () => {
  const mk = (mon: string, n: number, sessions: (d: string) => any[]) => ({ weekNumber: n, startDate: mon, endDate: C.addDays(mon, 6), days: [0, 1, 2, 3, 4, 5, 6].map(k => ({ date: C.addDays(mon, k), sessions: sessions(C.addDays(mon, k)) })) });
  const ctx = { css: null, breast100: 165 };
  const check = W.build(W.swimCheck(ctx, { ladder: 'swim', n: 2, breast: true }, 45));
  const weeks = [
    mk('2026-11-23', 11, d => d.endsWith('24') ? [{ id: 'sw1', sport: 'swim', ...W.build(W.swimLearn(ctx, { ladder: 'swim', n: 2, breast: true }, 'x', 50)), stage: { ladder: 'swim', n: 2 } }, { id: 'ck', sport: 'swim', title: 'Kraul-Check alt', plannedMinutes: 40 }] : d.endsWith('25') ? [{ id: 'ss1', sport: 'bike', title: 'Sweet Spot 3×8 min (Rolle)', plannedMinutes: 60, pattern: true, zone: 'Zone 3' }] : [{ id: 'r' + d, sport: 'run', title: 'Lockerer Lauf 45 min', plannedMinutes: 45, zone: 'Zone 2' }]),
    mk('2026-11-30', 12, d => d.endsWith('01') ? [{ id: 'ck2', ...check }, { id: 'sw2', sport: 'swim', ...W.build(W.swimLearn(ctx, { ladder: 'swim', n: 2, breast: true }, 'x', 50)) }] : d.endsWith('02') ? [{ id: 'ss2', sport: 'bike', title: 'Sweet Spot 3×12 min (Rolle)', plannedMinutes: 75, pattern: true, zone: 'Zone 3' }] : [{ id: 'q' + d, sport: 'run', title: 'Lockerer Lauf 45 min', plannedMinutes: 45, zone: 'Zone 2' }])
  ];
  const trend = Array.from({ length: 30 }, (_, i) => ({ date: C.addDays('2026-11-01', i), ctl: 40, atl: 44, restingHR: 50, hrv: 70, sleepHours: 8 }));
  test('Umfang bleibt (nicht automatisch ±10 %), auch wenn wenig abgehakt ist; die Sweet-Spot-Leiter bleibt beim Generator', () => {
    const state = { sessions: { ss1: { completed: true, metrics: { min: '60', hr: '150' } } }, trend, illnessPeriods: [], adjustments: {}, customWorkouts: {}, activities: {}, profile: prof };
    const r = C.weeklyAdjustments(state, weeks, '2026-11-29', { planMeta: { pattern: true } });
    expect(r.adjustments.filter((a: any) => /-vol-/.test(a.id))).toEqual([]);
    expect(r.adjustments.some((a: any) => a.sessionId === 'ss2')).toBe(false);
    expect(r.adjustments.find((a: any) => /summary/.test(a.id)).reason).toMatch(/Fester Wochenplan/);
    // ohne festen Wochenaufbau wie bisher: wenig umgesetzt → weniger
    const r2 = C.weeklyAdjustments(state, weeks, '2026-11-29', { planMeta: {} });
    expect(r2.adjustments.some((a: any) => /-vol-/.test(a.id))).toBe(true);
  });
  test('ab 400 m Kraul am Stück: Kraul-Check wird CSS-Test (400 m + 200 m)', () => {
    const state = { sessions: { sw1: { completed: true, metrics: { min: '50', longestCrawl: '400' } } }, trend, illnessPeriods: [], adjustments: {}, customWorkouts: {}, activities: {}, profile: prof };
    const r = C.weeklyAdjustments(state, weeks, '2026-11-29', { planMeta: { pattern: true } });
    const a = r.adjustments.find((x: any) => x.sessionId === 'ck2');
    expect(a.set.title).toBe('Schwimmtest 400/200 m');
    expect(a.reason).toMatch(/400 m Kraul am Stück/);
  });
  test('Lernstufe aus dem Kraul-Check: längste Strecke am Stück in 2 Einheiten bestimmt die Stufe, die aufgefüllte Dauer bleibt', () => {
    const w = [{ ...weeks[0], days: weeks[0].days.map((d: any) => d.date === '2026-11-24' ? { ...d, sessions: [{ id: 'ckx', ...check }, d.sessions[0]] } : d) }, weeks[1]];
    // Auftrag 17: nur einmal 100 m → Stufe bleibt
    const one = { sessions: { ckx: { completed: true, metrics: { longestCrawl: '100' } }, sw1: { completed: true, metrics: { min: '30', rpe: 8 } } }, trend, illnessPeriods: [], adjustments: {}, customWorkouts: {}, activities: {}, profile: prof };
    expect(C.weeklyAdjustments(one, w, '2026-11-29', { planMeta: { pattern: true } }).adjustments.some((x: any) => x.sessionId === 'sw2' && /stage/.test(x.id))).toBe(false);
    const state = { sessions: { ckx: { completed: true, metrics: { longestCrawl: '100' } }, sw1: { completed: true, metrics: { min: '30', rpe: 8, longestCrawl: '100' } } }, trend, illnessPeriods: [], adjustments: {}, customWorkouts: {}, activities: {}, profile: prof };
    const r = C.weeklyAdjustments(state, w, '2026-11-29', { planMeta: { pattern: true } });
    const a = r.adjustments.find((x: any) => x.sessionId === 'sw2');
    expect(a.set.stage.n).toBe(4);
    expect(a.set.plannedMinutes).toBeGreaterThanOrEqual(45);
    expect(a.reason).toMatch(/100 m Kraul am Stück in 2 Einheiten/);
  });
});

test('Krankheit diese Woche, nächste Woche ist schon Wiedereinstieg: nicht noch einmal kürzen', () => {
  const mon = '2026-10-19';
  const wk = (m: string, n: number, extra: any = {}) => ({ weekNumber: n, startDate: m, endDate: C.addDays(m, 6), ...extra, days: [0, 1, 2, 3, 4, 5, 6].map(k => ({ date: C.addDays(m, k), sessions: [{ id: `s${n}-${k}`, sport: 'run', title: 'Lockerer Lauf 40 min', plannedMinutes: 40, zone: 'Zone 2' }] })) });
  const weeks = [wk('2026-10-12', 5, { isRecoveryWeek: true }), wk(mon, 6, { entry: true })];
  const state = { sessions: {}, trend: [], illnessPeriods: [{ id: 'i', start: '2026-10-07', end: '2026-10-12' }], adjustments: {}, customWorkouts: {}, activities: {}, profile: prof };
  const r = C.weeklyAdjustments(state, weeks, '2026-10-18', { planMeta: { pattern: true } });
  expect(r.adjustments.filter((a: any) => /-vol-/.test(a.id))).toEqual([]);
  expect(r.adjustments.find((a: any) => /summary/.test(a.id)).reason).toMatch(/Wiedereinstieg/);
});
