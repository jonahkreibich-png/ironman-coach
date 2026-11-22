/* Auftrag 39: Ein Wettkampf zählt als Test seiner Sportart. Gemeldet bei Nutzer 1: Lauftest am 18.4.2027, 2 Wochen nach dem
   Halbmarathon am 4.4.2027 (dazu Schwimm- und Radtest am 13./14.4.). Erwartet für alle Nutzer und Sportarten:
   - in den 2 Wochen nach einem Wettkampf kein Test,
   - ein A/B-Wettkampf setzt den 8-Wochen-Rhythmus seiner Sportarten neu (kein Lauftest kurz nach dem Halbmarathon),
   - Tests der übrigen Sportarten kommen erst danach (verschoben, nicht gestrichen). */
import { test, expect, describe } from 'vitest';
import { replanPlan } from '../../shared/replan';
import * as C from '../../shared/core';
import { checkTrainingRules, repairTrainingRules } from '../../shared/trainingrules';
import * as Wk from '../../shared/workouts';
import { today, oldPlan, profile, goals, state } from '../../fixtures/pattern-person';

const diff = (a: string, b: string) => Math.round((+new Date(b + 'T12:00:00Z') - +new Date(a + 'T12:00:00Z')) / 86400000);
const isTest = (s: any) => !!s && !s.race && !s.cancelled && (s.spec?.kind === 'test' || /test|Kraul-Check/i.test(s.title || ''));
function plan(gl: any[]) {
  const r = replanPlan(oldPlan(), profile, gl, today, { state: state(), adjustments: {}, stages: { swim: { ladder: 'swim', n: 2 } }, from: '2026-10-19' })!;
  return r.plan;
}
const testsOf = (p: any) => C.planDays(p.weeks).flatMap((d: any) => d.sessions.filter(isTest).map((s: any) => ({ date: d.date, sport: s.sport, title: s.title })));

describe('Auftrag 39: Wettkampf zählt als Test', () => {
  const RACE = '2027-04-04';
  const hm = { id: 'g-hm', type: 'run_half', name: 'Halbmarathon', date: RACE, priority: 'B' };
  const p = plan([...goals, hm]);
  const tests = testsOf(p);

  test('Halbmarathon steht im Plan, Tests gibt es weiter', () => {
    expect(C.planDays(p.weeks).some((d: any) => d.date === RACE && d.sessions.some((s: any) => s.race))).toBe(true);
    expect(tests.length).toBeGreaterThan(2);
  });
  test('in den 2 Wochen nach dem Halbmarathon kein Test (vorher Schwimm-, Rad- und Lauftest 9-14 Tage danach)', () => {
    const near = tests.filter(t => { const k = diff(RACE, t.date); return k >= 1 && k <= 14; });
    expect(near, JSON.stringify(near)).toEqual([]);
  });
  test('Halbmarathon = Lauftest: der nächste Lauftest frühestens 7 Wochen danach', () => {
    const run = tests.filter(t => t.sport === 'run' && t.date > RACE);
    for (const t of run) expect(diff(RACE, t.date), t.date).toBeGreaterThanOrEqual(49);
  });
  test('Schwimm- und Radtest werden nur verschoben: sie kommen nach den 2 Wochen', () => {
    const due = (sp: string) => tests.filter(t => t.sport === sp && t.date > RACE);
    const lastBefore = (sp: string) => tests.filter(t => t.sport === sp && t.date < RACE).pop();
    for (const sp of ['swim', 'bike']) if (lastBefore(sp) && diff(lastBefore(sp)!.date, RACE) >= 49 && p.weeks[p.weeks.length - 1].startDate > '2027-05-01') expect(due(sp).length, sp).toBeGreaterThan(0);
  });
  test('Trainingsregel meldet Tests nach einem Wettkampf (für die Pflege bestehender Pläne)', () => {
    const w = JSON.parse(JSON.stringify(p.weeks));
    const day = C.planDays(w).find((d: any) => d.date === '2027-04-14')!;
    day.sessions.push({ id: 'x-test', sport: 'bike', title: 'Radtest 20 min', plannedMinutes: 60, hard: true, spec: { sport: 'bike', kind: 'test', ctx: {}, steps: [{ part: 'main', min: 60 }] } });
    const iss = checkTrainingRules(w, profile, { goals: [...goals, hm] as any, from: '2026-10-19' }).filter(i => i.rule === 'testAfterRace');
    expect(iss.some(i => i.date === '2027-04-14')).toBe(true);
  });
  // Wettkampf früher im Plan (danach noch Wochen): Tests werden verschoben, nicht doppelt
  const FEB = '2027-02-07';
  const pf = plan([...goals, { ...hm, date: FEB, id: 'g-feb' }]);
  test('verschobene Tests zählen am geplanten Termin: zwischen zwei Tests derselben Sportart mindestens 6 Wochen (vorher Schwimm-/Radtest 23./24.2. und wieder 9./10.3.)', () => {
    const t = testsOf(pf).filter(x => x.date > '2026-12-31');
    for (const sp of ['swim', 'bike', 'run']) { const ds = t.filter(x => x.sport === sp).map(x => x.date); for (let i = 1; i < ds.length; i++) expect(diff(ds[i - 1], ds[i]), sp + ' ' + ds.join(',')).toBeGreaterThanOrEqual(42); }
    expect(t.filter(x => { const k = diff(FEB, x.date); return k >= 1 && k <= 14; })).toEqual([]);
    expect(t.some(x => x.sport === 'swim' && diff(FEB, x.date) > 14 && diff(FEB, x.date) <= 21), 'Schwimmtest direkt nach den 2 Wochen').toBe(true);
    expect(t.filter(x => x.sport === 'run' && x.date > FEB).every(x => diff(FEB, x.date) >= 49)).toBe(true);
  });
  test('bestehender Plan wie bei Nutzer 1 (Rad- und Lauftest 10/14 Tage danach): Pflege schiebt den Radtest hinter die 2 Wochen, Lauftest wird lockerer Lauf', () => {
    const w = JSON.parse(JSON.stringify(pf.weeks));
    const days = w.flatMap((x: any) => x.days);
    const ctx = { runThrSec: 300, lthrRun: 170, lthrBike: 160, bikeKmh: 28, ftp: null } as any;
    const put = (date: string, sport: string, b: any, id: string) => { const d = days.find((x: any) => x.date === date)!; d.sessions = [...d.sessions.filter((x: any) => x.sport !== sport && x.sport !== 'rest'), { ...b, id, sport }]; };
    put('2027-02-17', 'bike', Wk.build(Wk.bikeTest(ctx)), 'u1-bike-test');
    put('2027-02-21', 'run', Wk.build(Wk.runTest(ctx)), 'u1-run-test');
    const before = checkTrainingRules(w, profile, { goals: [...goals, { ...hm, date: FEB, id: 'g-feb' }] as any, from: '2026-10-19' }).filter(i => i.rule === 'testAfterRace');
    expect(before.map(i => i.date).sort()).toEqual(['2027-02-17', '2027-02-21']);
    const fixes = repairTrainingRules(w, profile, { goals: [...goals, { ...hm, date: FEB, id: 'g-feb' }] as any, from: '2026-10-19', today });
    expect(fixes.join(' | ')).toMatch(/Radtest 20 min → 2027-0[23]/);
    const after = checkTrainingRules(w, profile, { goals: [...goals, { ...hm, date: FEB, id: 'g-feb' }] as any, from: '2026-10-19' }).filter(i => i.rule === 'testAfterRace');
    expect(after).toEqual([]);
    const where = (id: string) => C.planDays(w).find((d: any) => d.sessions.some((x: any) => x.id === id));
    expect(diff(FEB, where('u1-bike-test')!.date)).toBeGreaterThan(14);
    const run = where('u1-run-test')!.sessions.find((x: any) => x.id === 'u1-run-test');
    expect(run.title).not.toMatch(/test/i);
  });
  test('C-Wettkampf: 2 Wochen ohne Test, zählt aber nicht als Test', () => {
    const c = plan([...goals, { ...hm, priority: 'C', id: 'g-c' }]);
    const near = testsOf(c).filter(t => { const k = diff(RACE, t.date); return k >= 1 && k <= 14; });
    expect(near).toEqual([]);
  });
});

import { runTestUpdate, raceTestUpdate, thresholdPaceFromRace, applyTestUpdate } from '../../shared/fields';
describe('Auftrag 39: Zonen aus dem Wettkampf-Ergebnis', () => {
  const D = '2027-04-04', T = '2027-04-06';
  const weeks = [{ weekNumber: 1, days: [{ date: D, sessions: [{ id: 'race-hm', sport: 'run', race: true, goalId: 'g-hm', title: 'Halbmarathon' }] }] }];
  const prof: any = { thresholds: { thresholdPaceRunSec: 320, lthrRun: 170 }, appliedTests: [] };
  const st = (g: any, hr?: number) => ({ goals: { [g.id]: g }, sessions: hr ? { 'race-hm': { completed: true, metrics: { hr: String(hr) } } } : {} });
  const hm = { id: 'g-hm', type: 'run_half', name: 'Halbmarathon', date: D, priority: 'B', result: { timeSec: 6600 } };
  test('Schwellen-Pace über VDOT (Halbmarathon 1:50 h ≈ 5:05/km, Daniels VDOT 40)', () => {
    const p = thresholdPaceFromRace(21.1, 6600)!; expect(p).toBeGreaterThanOrEqual(300); expect(p).toBeLessThanOrEqual(310);
    expect(thresholdPaceFromRace(10, 2400)!).toBeLessThan(p); // 10 km in 40 min ist schneller
  });
  test('Halbmarathon mit Ergebnis und Ø Puls 165 → Lauftest: Pace und Schwellenpuls (165 ÷ 0,98 = 168), einmal', () => {
    const u = runTestUpdate(st(hm, 165), weeks, prof, T)!;
    expect(u.sport).toBe('run'); expect(u.sessionId).toBe('race:g-hm'); expect(u.thresholds.lthrRun).toBe(168);
    expect(u.thresholds.thresholdPaceRunSec).toBeGreaterThanOrEqual(300);
    expect(u.text).toMatch(/zählt als Lauftest/);
    const p2 = applyTestUpdate(prof, u);
    expect(p2.thresholds.origin.thresholdPaceRunSec.src).toBe('Halbmarathon');
    expect(runTestUpdate(st(hm, 165), weeks, p2, T)).toBeNull();
  });
  test('ohne Ergebnis, C-Wettkampf oder älter als 3 Wochen: keine Änderung', () => {
    expect(raceTestUpdate(st({ ...hm, result: null }), weeks, prof, T)).toBeNull();
    expect(raceTestUpdate(st({ ...hm, priority: 'C' }), weeks, prof, T)).toBeNull();
    expect(raceTestUpdate(st(hm), weeks, prof, '2027-04-30')).toBeNull();
  });
  test('Triathlon: Schwimm-Teilzeit im Becken → CSS; Freiwasser seit Auftrag 40 umgerechnet (ohne Wenden +3 %, Strecke +3 s/100 m)', () => {
    const tri = { id: 'g-tri', type: 'tri_sprint', name: 'Sprint', date: D, priority: 'A', result: { timeSec: 4800, splits: { swim: 900 } }, course: { swimVenue: 'pool' } };
    const u = raceTestUpdate({ goals: { 'g-tri': tri }, sessions: {} }, [], { thresholds: { cssSec: 125 } }, T)!;
    expect(u.sport).toBe('swim'); expect(u.thresholds.cssSec).toBe(120);
    const o = raceTestUpdate({ goals: { 'g-tri': { ...tri, course: { swimVenue: 'open' } } }, sessions: {} }, [], { thresholds: { cssSec: 125 } }, T)!;
    expect(o.thresholds.cssSec).toBe(114); expect(o.sessionId).toBe('race:g-tri:swim'); expect(o.text).toMatch(/Freiwasser umgerechnet/);
  });
});
