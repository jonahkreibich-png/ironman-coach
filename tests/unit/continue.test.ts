/* Auftrag 7, Punkt 2: Fragebogen oder Profiländerung bei vorhandenem Plan heißt FORTSETZEN, nicht neu beginnen.
   Wochen- und Blockzählung laufen weiter, vergangene Wochen und erledigte Einheiten bleiben, Score-Kalibrierung und Verlauf
   (seed…) bleiben im Plan, Scores ändern sich durch die Übernahme nicht. Der Umfang knüpft an die Belastung (CTL/ATL) an. */
import { test, expect, describe } from 'vitest';
import { generatePlan, transitionPlan, continuationOf, phasePlan, ctlToWeekMin } from '../../shared/plangen';
import { replanPlan } from '../../shared/replan';
import { applyOnboarding } from '../../shared/onboarding';
import { defaultProfile, withEstimates, progressionOf } from '../../shared/profile';
import { sportScores, legacyActivities } from '../../shared/scores';
import { PERSONAS } from '../../fixtures/personas';
import * as C from '../../shared/core';

const today = '2026-10-13'; // Dienstag, letzte Woche des alten Blocks läuft
const addDays = C.addDays;
/* Alter, handgeschriebener Plan wie bei Jonah: 5 Wochen „Block 1“, Woche 5 Erholung, Score-Kalibrierung und Verlauf in meta/seed */
function oldPlan() {
  const weeks = [0, 1, 2, 3, 4].map(i => {
    const mon = addDays('2026-09-14', i * 7);
    return { weekNumber: i + 1, label: 'Woche ' + (i + 1), startDate: mon, endDate: addDays(mon, 6), isRecoveryWeek: i === 4, focus: 'alt', days: [0, 1, 2, 3, 4, 5, 6].map(k => ({ date: addDays(mon, k), sessions: [
      k === 1 ? { id: `w${i + 1}-tue-swim`, sport: 'swim', title: 'Kraultechnik', plannedMinutes: 50 } : k === 3 ? { id: `w${i + 1}-thu-run`, sport: 'run', title: 'Lockerer Lauf', plannedMinutes: 60, zone: 'Zone 2' } : k === 5 ? { id: `w${i + 1}-sat-bike`, sport: 'bike', title: 'Grundlagenfahrt', plannedMinutes: 120, zone: 'Zone 2' } : { id: `w${i + 1}-${k}-rest`, sport: 'rest', title: 'Ruhetag' }] })) };
  });
  return { meta: { event: 'Ironman', eventDate: '2029-09-15', blockName: 'Block 1 · Grundlage', baseScores: { swim: 22, bike: 45, run: 62, strength: 52 }, scoreCalibration: { version: 2, date: '2026-10-03', scores: { swim: 30, bike: 48, run: 64, strength: 52 } } },
    weeks, seedMetrics: [{ date: '2026-09-01', sport: 'run', km: 5, min: 32, hr: 150 }], seedTrend: [{ date: '2026-09-01', ctl: 30 }], zonePercents: [], keyDates: [] };
}
const profile = withEstimates({ ...defaultProfile(), birthYear: 2009, weeklyHours: 10, maxDayHours: 3, sports: ['swim', 'bike', 'run', 'strength', 'football'] as any,
  teamSport: { name: 'Fußball', trainingDays: [1], trainingMinutes: 90, gameDays: [5], gameMinutes: 90 }, progression: { buildWeeks: 3, incPct: 10 },
  thresholds: { lthrRun: 170, lthrBike: 169, thresholdPaceRunSec: 339, thresholdSpeedBikeKmh: 28, estimated: [] } } as any, today);
const goals = [{ id: 'goal-main', type: 'tri_long' as const, name: 'Ironman', date: '2029-09-15', priority: 'A' as const }];
// erledigte Einheiten und Werte (CTL ~32 vor der Erkältung, Krankheit 7.-10.10.)
function state() {
  const sessions: any = {}; ['w1-tue-swim', 'w2-thu-run', 'w3-sat-bike', 'w4-tue-swim', 'w4-thu-run'].forEach(id => { sessions[id] = { completed: true, metrics: { min: '40', km: id.includes('run') ? '5.1' : '', hr: 148 } }; });
  const trend: any[] = [];
  for (let d = '2026-09-14'; d <= today; d = addDays(d, 1)) trend.push({ date: d, ctl: d < '2026-10-07' ? 32 : 22, atl: d < '2026-10-07' ? 34 : 4, restingHR: 56, hrv: 65, sleepHours: 8 });
  return { sessions, trend, illnessPeriods: [{ id: 'ill-1', start: '2026-10-07', end: '2026-10-10' }], customWorkouts: {}, adjustments: {}, activities: {}, settings: {} };
}

describe('Plan geht weiter (kein Neustart)', () => {
  const st = state();
  const r = replanPlan(oldPlan(), profile, goals, today, { state: st, adjustments: {}, needTests: { run: true } })!;
  const plan = r.plan; const w6 = plan.weeks.find((w: any) => w.startDate === '2026-10-19');

  test('vergangene Wochen bleiben unverändert, Zählung läuft weiter: Woche 6 = Block 2, Woche 1', () => {
    expect(plan.weeks.slice(0, 5)).toEqual(oldPlan().weeks);
    expect(w6.weekNumber).toBe(6);
    expect(w6.label).toBe('Woche 6');
    expect(w6.headline).toMatch(/^Woche 6 · Block 2, Woche 1 → Ironman/);
    expect(plan.meta.blockName).toMatch(/^Block 2/);
    expect(plan.meta.previousBlock).toBe('Block 1 · Grundlage');
  });
  test('Score-Kalibrierung, Startwerte und Verlauf (seed…) bleiben im Plan', () => {
    expect(plan.meta.scoreCalibration).toEqual(oldPlan().meta.scoreCalibration);
    expect(plan.meta.baseScores).toEqual(oldPlan().meta.baseScores);
    expect(plan.seedMetrics).toEqual(oldPlan().seedMetrics);
    expect(plan.seedTrend).toEqual(oldPlan().seedTrend);
  });
  test('erledigte Einheiten bleiben im Plan und zählen weiter für die Scores', () => {
    const ids = new Set(C.planDays(plan.weeks).flatMap((d: any) => d.sessions.map((s: any) => s.id)));
    Object.keys(st.sessions).forEach(id => expect(ids.has(id)).toBe(true));
    expect(legacyActivities(st, plan.weeks, profile).length).toBe(legacyActivities(st, oldPlan().weeks, profile).length);
  });
  test('Scores sind nach der Übernahme gleich wie vorher (nicht zurückgesetzt)', () => {
    const inp = (p: any) => ({ today, activities: legacyActivities(st, p.weeks, profile), trend: st.trend, illness: st.illnessPeriods, profile, goal: goals[0] as any, calibration: p.meta.scoreCalibration, manualAdjust: {} });
    expect(sportScores(inp(plan)).map(s => s.score)).toEqual(sportScores(inp(oldPlan())).map(s => s.score));
    expect(sportScores(inp(plan)).find(s => s.sport === 'run')!.score).toBeGreaterThan(40);
  });
  test('Umfang aus der letzten Aufbauwoche (Auftrag 8): erledigt statt geplant, wenn abgehakt und deutlich weniger; nach Krankheit in Stufen', () => {
    const own = (w: any) => w.days.reduce((a: number, d: any) => a + d.sessions.filter((s: any) => ['swim', 'bike', 'run'].includes(s.sport)).reduce((b: number, s: any) => b + (s.plannedMinutes || 0), 0), 0);
    // Woche 4 (5.-11.10.): krank vom 7. bis 10.10. → ausgelassen heißt nicht „zu viel“, es zählt der Plan (230 min)
    const c = continuationOf(oldPlan(), today, st)!;
    expect(c).toMatchObject({ lastNormalMin: 230, lastNormalTracked: false, lastNormalDoneMin: 80 });
    const base = 230;
    const [a, b, d] = ['2026-10-19', '2026-10-26', '2026-11-02'].map(m => plan.weeks.find((w: any) => w.startDate === m));
    expect(a.entry).toBe(true); expect(b.entry).toBe(true); expect(d.entry).toBeUndefined();
    expect(own(a)).toBeLessThan(own(d));
    expect(own(d)).toBeGreaterThan(base * 0.6); expect(own(d)).toBeLessThan(base * 1.4);
    const ex = plan.meta.explain.join(' ');
    expect(ex).toMatch(/auf Höhe deiner letzten Aufbauwoche \(3,8 h\)/);
    expect(ex).toMatch(/in Stufen: erst etwa 72 %, dann 90 %, dann wieder 100 %/);
    // ohne Krankheit in der Woche: abgehakt (2 von 3) und deutlich weniger erledigt → das Erledigte zählt (mindestens 60 % des Plans)
    const healthy = { ...st, illnessPeriods: [{ id: 'ill-x', start: '2026-09-01', end: '2026-09-03' }] };
    expect(continuationOf(oldPlan(), today, healthy)).toMatchObject({ lastNormalTracked: true, lastNormalDoneMin: 80 });
    const r3 = replanPlan(oldPlan(), profile, goals, today, { state: healthy, adjustments: {} })!;
    expect(r3.plan.meta.explain.join(' ')).toMatch(/wie in deiner letzten Aufbauwoche erledigt \(2,3 h von 3,8 h\)/);
    void ctlToWeekMin;
  });
  test('CTL zählt nicht, wenn Einheiten in den Daten fehlen (CTL viel niedriger als das Training)', () => {
    const low = { ...state(), trend: state().trend.map((p: any) => ({ ...p, ctl: 8, atl: 8 })) };
    const full = { ...low, sessions: { ...low.sessions, 'w4-sat-bike': { completed: true, metrics: { min: '120' } }, 'w4-thu-run': { completed: true, metrics: { min: '60' } }, 'w4-tue-swim': { completed: true, metrics: { min: '50' } } } };
    const r2 = replanPlan(oldPlan(), profile, goals, today, { state: full, adjustments: {} })!;
    expect(r2.plan.meta.explain.join(' ')).toMatch(/auf Höhe deiner letzten Aufbauwoche \(3,8 h\).*nicht alle Einheiten in den Daten/);
  });
  test('erste Woche nach der Krankheit: nichts Hartes außer dem Schwellentest, der liegt am Ende der Woche', () => {
    const hard = w6.days.flatMap((d: any) => d.sessions.filter((s: any) => s.hard && s.sport !== 'football').map((s: any) => ({ s, date: d.date })));
    expect(hard.length).toBe(1);
    expect(hard[0].s.title).toMatch(/Lauftest/);
    expect(hard[0].date >= '2026-10-24').toBe(true);
    // am Tag vor dem Test nichts Langes
    const before = w6.days.find((d: any) => d.date === addDays(hard[0].date, -1));
    expect(before.sessions.some((s: any) => /Lang/.test(s.title))).toBe(false);
  });
  test('Aufbau 3+1: Block 2 = Wochen 6-9, Woche 9 ist Erholung, Steigerung höchstens 10 %', () => {
    const b2 = plan.weeks.filter((w: any) => w.block === 2);
    expect(b2.map((w: any) => w.weekNumber)).toEqual([6, 7, 8, 9]);
    expect(b2.map((w: any) => !!w.isRecoveryWeek)).toEqual([false, false, false, true]);
    expect(plan.weeks.find((w: any) => w.weekNumber === 10).headline).toMatch(/Block 3, Woche 1/);
    expect(r.gen.violations).toEqual([]);
  });
});

describe('Fragebogen bei vorhandenem Plan', () => {
  const answers = { goals: [{ id: 'goal-main', type: 'tri_long', name: 'Ironman', date: '2029-09-15', priority: 'A' }, { id: 'g-sprint', type: 'tri_sprint', name: 'Sprint-Triathlon', date: null, priority: 'C' }],
    birthYear: 2009, sports: ['swim', 'bike', 'run', 'strength'], weeklyHoursNow: 1.2, weeklyHours: 15, maxDayHours: 5, teamYes: true, teamName: 'Fußball', teamTrainingDays: [1], teamGameDays: [5],
    dayLoad: { 0: 3, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 3 }, swimBreast: true, injuries: 'keine' };
  const r = applyOnboarding(answers, today, profile, { old: oldPlan(), state: state(), adjustments: {} });
  test('setzt fort statt neu zu beginnen', () => {
    expect(r.continued).toBe(true);
    const w6 = r.gen!.plan.weeks.find((w: any) => w.startDate === '2026-10-19');
    expect(w6.weekNumber).toBe(6);
    expect(w6.headline).not.toMatch(/Woche 1 von/);
    expect(r.gen!.plan.meta.scoreCalibration.scores.run).toBe(64);
  });
  test('der Umfang kommt aus der Belastung, nicht aus „1,2 h in den letzten Wochen“', () => {
    const w6 = r.gen!.plan.weeks.find((w: any) => w.startDate === '2026-10-19');
    const own = w6.days.reduce((a: number, d: any) => a + d.sessions.filter((s: any) => ['swim', 'bike', 'run'].includes(s.sport)).reduce((b: number, s: any) => b + (s.plannedMinutes || 0), 0), 0);
    expect(own).toBeGreaterThan(1.2 * 60 * 1.5);
  });
  test('Ziele ohne Termin werden nicht als Wettkampf eingeplant, stehen aber als Weg in der Erklärung', () => {
    const races = C.planDays(r.gen!.plan.weeks).flatMap((d: any) => d.sessions.filter((s: any) => s.race));
    expect(races).toEqual([]);
    expect(r.gen!.plan.meta.explain.join(' ')).toMatch(/Dein Weg: Sprint-Triathlon → Ironman/);
  });
  test('alle Test-Personen: zweiter Fragebogen setzt den ersten Plan fort', () => {
    for (const p of PERSONAS) {
      const first = applyOnboarding(p.answers, '2026-10-14');
      if (!first.gen) continue;
      const later = '2026-11-04';
      const second = applyOnboarding(p.answers, later, first.profile, { old: first.gen.plan, state: { trend: [], illnessPeriods: [], sessions: {} }, adjustments: {} });
      const weeks = second.gen!.plan.weeks;
      expect(second.continued).toBe(true);
      // Wochen vor dem nächsten Montag sind dieselben, die Zählung lückenlos
      const kept = first.gen.plan.weeks.filter((w: any) => w.endDate < '2026-11-09');
      expect(weeks.slice(0, kept.length)).toEqual(kept);
      weeks.forEach((w: any, i: number) => expect(w.weekNumber).toBe(i + 1));
    }
  });
});

describe('Bausteine', () => {
  test('continuationOf: Woche, Block, Aufbauwochen seit der Erholung', () => {
    expect(continuationOf(oldPlan(), today)).toMatchObject({ weekNo: 5, blockNo: 1, builtSinceRecovery: 0 });
    const p = oldPlan(); p.weeks[4].isRecoveryWeek = false;
    expect(continuationOf(p, today)).toMatchObject({ builtSinceRecovery: 5 });
    expect(continuationOf({ weeks: [] }, today)).toBe(null);
  });
  test('phasePlan mit 3 Aufbauwochen: Erholung jede 4. Woche, angefangener Block wird zu Ende geführt', () => {
    expect(phasePlan(40, 'tri_long', 4).slice(0, 12).map(x => x.recovery)).toEqual([false, false, false, true, false, false, false, true, false, false, false, true]);
    expect(phasePlan(8, 'tri_long', 4, 2).map(x => x.recovery).slice(0, 2)).toEqual([false, true]);
  });
  test('Aufbau-Rhythmus: eigener Wunsch höchstens +10 %, sonst nach Alter', () => {
    expect(progressionOf(profile, today)).toEqual({ buildWeeks: 3, incPct: 10 });
    expect(progressionOf({ ...profile, progression: { buildWeeks: 3, incPct: 25 } } as any, today).incPct).toBe(10);
    expect(progressionOf({ ...profile, progression: null } as any, today)).toEqual({ buildWeeks: 2, incPct: 8 });
    expect(progressionOf({ ...profile, birthYear: 1990, progression: null } as any, today)).toEqual({ buildWeeks: 3, incPct: 10 });
  });
  test('transitionPlan ohne Kalibrierung im alten Plan: nichts Erfundenes', () => {
    const g = generatePlan({ profile, goals, today });
    const t = transitionPlan({ meta: {}, weeks: [] }, g.plan, today);
    expect(t.meta.scoreCalibration).toBeUndefined();
    expect(t.weeks[0].weekNumber).toBe(1);
  });
  test('weit entferntes Ziel: Phasen über den ganzen Weg, kein Wettkampf in den ausgegebenen Wochen, Grundlage zuerst', () => {
    const g = generatePlan({ profile, goals, today });
    expect(g.plan.weeks.length).toBe(26);
    expect(g.plan.meta.totalWeeks).toBeGreaterThan(150);
    expect(g.plan.weeks.every((w: any) => w.phase === 'base')).toBe(true);
    expect(C.planDays(g.plan.weeks).some((d: any) => d.sessions.some((s: any) => s.race))).toBe(false);
  });
});
