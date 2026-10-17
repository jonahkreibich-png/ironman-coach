/* Auftrag 15: nur gewählte Sportarten, gleiche Sportart nicht an zwei Tagen hintereinander (auch So → Mo), Mamas Plan ohne Neuanfang. */
import { test, expect, describe } from 'vitest';
import * as C from '../../shared/core';
import { applyOnboarding } from '../../shared/onboarding';
import { generatePlan, paceCtx } from '../../shared/plangen';
import { replanPlan } from '../../shared/replan';
import { checkPlanRules, repairSpacing, repairSports } from '../../shared/planrules';
import { checkPlan } from '../../shared/plancheck';
import { sportAllowed, chosenSports } from '../../shared/sports';
import { runTool } from '../../shared/coach/tools';
import { checkIntensity } from '../../shared/intensity';
import * as W from '../../shared/workouts';

const T = '2026-10-17';
/* Mama: Allgemeine Fitness, Rad, Schwimmen, Kraft – kein Laufen, kein Teamsport */
const mamaAnswers = {
  goals: [{ id: 'g-fit', type: 'fitness', name: 'Allgemeine Fitness', date: null, priority: 'A', timeMode: 'total' }], birthYear: 1968, sex: 'f', injuries: 'keine', medical: false,
  sports: ['bike', 'swim', 'strength'], experienceYears: 2, weeklyHoursNow: 3, swimCrawl: 'some', swimCrawlM: 25, swimBreast: true, poolM: '25', openWater: false,
  bikeLongestMin: 60, bikes: ['trekking'], powerMeter: false, teamYes: false, dayLoad: { 1: 1, 2: 2, 3: 1, 4: 2, 5: 1, 6: 2, 0: 2 }, notes: [], wantTests: true
};
const sessions = (weeks: any[], from = '') => C.planDays(weeks).filter((d: any) => d.date >= from).flatMap((d: any) => (d.sessions || []).filter((s: any) => s && s.sport !== 'rest').map((s: any) => ({ ...s, date: d.date })));

describe('Nur gewählte Sportarten', () => {
  test('Mama (Fitness, Rad/Schwimmen/Kraft): kein Laufen, kein Laufspiel, kein Teamsport, keine Lauf-Tests, kein Koppellauf', () => {
    const r = applyOnboarding(mamaAnswers, T);
    const all = sessions(r.gen!.plan.weeks);
    expect(all.length).toBeGreaterThan(20);
    expect(all.filter((s: any) => s.sport === 'run' || s.sport === 'football')).toEqual([]);
    expect(all.some((s: any) => /Lauf|Fahrtspiel|Laufspiel/.test(s.title))).toBe(false);
    expect(new Set(all.filter((s: any) => !s.race).map((s: any) => s.sport))).toEqual(new Set(['bike', 'swim', 'strength']));
    expect(checkPlan(r.gen!.plan.weeks, r.profile, r.goals, T).filter(i => i.rule === 'sport')).toEqual([]);
    // die Erklärung nennt nur ihre Sportarten
    expect(r.gen!.plan.meta.explain.join(' ')).not.toMatch(/Laufen \d/);
  });
  test('alle Kombinationen: Plan nur mit gewählten Sportarten (Fitness und Ziele mit anderen Sportarten)', () => {
    const combos = [['bike'], ['swim'], ['run'], ['strength', 'bike'], ['swim', 'strength'], ['bike', 'swim'], ['run', 'swim'], ['run', 'bike', 'strength'], ['swim', 'bike', 'run', 'strength']];
    for (const type of ['fitness', 'tri_sprint', 'run_10k', 'bike_event', 'swim_goal']) for (const sp of combos) {
      const a = { ...mamaAnswers, sports: sp, goals: [{ id: 'g', type, name: 'Ziel', date: type === 'fitness' ? null : '2027-06-13', priority: 'A', timeMode: 'total' }], runContinuousMin: 40, freq: undefined };
      const r = applyOnboarding(a, T);
      const got = new Set(sessions(r.gen!.plan.weeks).filter((s: any) => !s.race).map((s: any) => s.sport));
      for (const s of got) expect(sp, `${type} ${sp.join('+')}: ${s}`).toContain(s);
      expect(checkPlanRules(r.gen!.plan.weeks, r.profile).filter(i => i.rule === 'sport')).toEqual([]);
    }
  });
  test('Ziel braucht eine nicht gewählte Sportart: Plan sagt es, plant sie aber nicht ein', () => {
    const r = applyOnboarding({ ...mamaAnswers, sports: ['bike', 'run'], runContinuousMin: 40, goals: [{ id: 'g', type: 'tri_sprint', name: 'Sprint', date: '2027-06-13', priority: 'A', timeMode: 'total' }] }, T);
    expect(sessions(r.gen!.plan.weeks).filter((s: any) => s.sport === 'swim' && !s.race)).toEqual([]);
    expect(r.gen!.plan.meta.explain.join(' ')).toMatch(/Dein Ziel enthält auch Schwimmen/);
  });
  test('Teamsport nur, wenn angegeben; eigene feste Termine zählen als angegeben', () => {
    const p: any = { sports: ['bike'], teamSport: null, fixed: [] };
    expect(sportAllowed(p, 'football')).toBe(false); expect(sportAllowed(p, 'run')).toBe(false); expect(sportAllowed(p, 'bike')).toBe(true);
    expect(sportAllowed({ ...p, fixed: [{ dow: 2, sport: 'run' }] }, 'run')).toBe(true);
    expect(chosenSports({ sports: ['bike'], freq: { strength: [1, 1] } } as any)).toEqual(['bike', 'strength']);
  });
  test('Plan-Check meldet und korrigiert nicht gewählte Sportarten (bewegliche Einheiten)', () => {
    const r = applyOnboarding(mamaAnswers, T);
    const weeks = JSON.parse(JSON.stringify(r.gen!.plan.weeks));
    const d = weeks[1].days[2]; d.sessions = [{ id: 'x-run', sport: 'run', title: 'Lockerer Lauf 40 min', plannedMinutes: 40 }];
    expect(checkPlanRules(weeks, r.profile).some(i => i.rule === 'sport')).toBe(true);
    const fx = repairSports(weeks, r.profile);
    expect(fx.join(' ')).toMatch(/Lockerer Lauf 40 min entfällt/);
    expect(checkPlanRules(weeks, r.profile).filter(i => i.rule === 'sport')).toEqual([]);
  });
  test('Mamas alter Plan mit Läufen wird ab heute neu geplant, ohne Neuanfang: Vergangenes und Erledigtes bleibt, ab heute kein Laufen', () => {
    // alter Plan: entstand mit dem alten Fehler (Laufen im Plan), Start vor 9 Tagen
    const start = C.addDays(T, -9);
    const old = generatePlan({ profile: { ...applyOnboarding(mamaAnswers, start).profile, sports: ['bike', 'swim', 'strength', 'run'] } as any, goals: applyOnboarding(mamaAnswers, start).goals, today: start, currentWeeklyHours: 3 }).plan;
    expect(sessions(old.weeks).some((s: any) => s.sport === 'run')).toBe(true);
    const done = sessions(old.weeks).filter((s: any) => s.date < T).slice(0, 3);
    const state: any = { sessions: Object.fromEntries(done.map((s: any) => [s.id, { completed: true, metrics: { min: s.plannedMinutes } }])), customWorkouts: {}, illnessPeriods: [], trend: [], activities: {} };
    const r = applyOnboarding(mamaAnswers, T);
    const nx = replanPlan(old, r.profile, r.goals, T, { state, from: T, adjustments: {} })!;
    expect(sessions(nx.plan.weeks, T).filter((s: any) => s.sport === 'run')).toEqual([]);
    for (const s of done) expect(sessions(nx.plan.weeks).some((x: any) => x.id === s.id)).toBe(true);
    const before = C.planDays(old.weeks).filter((d: any) => d.date < T && d.date >= C.addDays(T, -((new Date(T + 'T12:00:00Z').getUTCDay() + 6) % 7)));
    for (const d of before) expect(JSON.stringify(C.planDays(nx.plan.weeks).find((x: any) => x.date === d.date).sessions.map((s: any) => s.id))).toBe(JSON.stringify(d.sessions.map((s: any) => s.id)));
  });
  test('KI-Coach darf keine nicht gewählte Sportart einplanen', () => {
    const r = applyOnboarding(mamaAnswers, T);
    const s = sessions(r.gen!.plan.weeks, C.addDays(T, 1))[0];
    const ctx: any = { today: T, now: Date.now(), profile: r.profile, goals: r.goals, planMeta: r.gen!.plan.meta, baseWeeks: r.gen!.plan.weeks, state: { sessions: {}, adjustments: {}, customWorkouts: {}, illnessPeriods: [], trend: [], activities: {} } };
    const out = runTool(ctx, 'modify_session', { session_id: s.id, sport: 'run', reason: 'Abwechslung' });
    expect(out.isError).toBe(true); expect(out.result).toMatch(/nicht gewählt/);
  });
});

describe('Gleiche Sportart nicht an zwei Tagen hintereinander', () => {
  const people = [
    { id: 'mama', a: mamaAnswers },
    { id: 'rad-viel', a: { ...mamaAnswers, sports: ['bike'], goals: [{ id: 'g', type: 'bike_event', name: 'Radmarathon', date: '2027-06-13', priority: 'A', timeMode: 'total' }], weeklyHoursNow: 6, dayLoad: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 3, 0: 3 } } },
    { id: 'tri-wenig-tage', a: { ...mamaAnswers, sports: ['swim', 'bike', 'run'], runContinuousMin: 45, swimCrawl: 'yes', swimCrawlM: 400, goals: [{ id: 'g', type: 'tri_olympic', name: 'Olympisch', date: '2027-07-11', priority: 'A', timeMode: 'total' }], dayLoad: { 1: 0, 2: 2, 3: 0, 4: 2, 5: 0, 6: 3, 0: 3 } } },
    { id: 'laeufer-5x', a: { ...mamaAnswers, sports: ['run'], runContinuousMin: 90, experienceYears: 6, weeklyHoursNow: 6, freq: { run: [5, 5] }, goals: [{ id: 'g', type: 'run_marathon', name: 'Marathon', date: '2027-04-25', priority: 'A', timeMode: 'total' }], dayLoad: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 3, 0: 3 } } }
  ];
  test.each(people.map(p => [p.id, p] as const))('%s: keine gleiche Sportart an Folgetagen ohne Begründung, auch nicht So → Mo; Ausnahmen locker, kurz, mit Grund', (_id, p) => {
    const r = applyOnboarding(p.a, T);
    const weeks = r.gen!.plan.weeks;
    expect(checkPlanRules(weeks, r.profile).filter(i => i.rule !== 'sport')).toEqual([]);
    for (const s of sessions(weeks).filter((x: any) => x.adjacentOk)) {
      expect(s.hard).toBeFalsy();
      expect(s.plannedMinutes).toBeLessThanOrEqual(46);
      expect(s.description).toMatch(/Ausnahme: zwei Tage hintereinander/);
    }
    // nie zwei harte Tage hintereinander (über alle Wochen, auch So → Mo)
    expect(checkIntensity(weeks, r.profile, T, r.gen!.plan.meta.intensityOpts || {}).filter(i => i.rule === 'adjacent')).toEqual([]);
  });
  test('über die Wochengrenze: Rad am Sonntag und Montag wird erkannt und korrigiert', () => {
    const r = applyOnboarding({ ...mamaAnswers }, T);
    const weeks = JSON.parse(JSON.stringify(r.gen!.plan.weeks.slice(1, 3)));
    const sun = weeks[0].days[6], mon = weeks[1].days[0];
    const bike = W.build(W.bikeEasy(paceCtx(r.profile, false, 'Trekkingrad', T), 40));
    const mk = (id: string) => ({ ...JSON.parse(JSON.stringify(bike)), id });
    sun.sessions = [mk('b-sun')]; mon.sessions = [mk('b-mon')];
    weeks[1].days[1].sessions = weeks[1].days[1].sessions.filter((s: any) => s.sport !== 'bike');
    expect(checkPlanRules(weeks, r.profile).some(i => i.rule === 'sameSport' && i.date === mon.date)).toBe(true);
    repairSpacing(weeks, r.profile, {});
    expect(checkPlanRules(weeks, r.profile).filter(i => i.rule === 'sameSport')).toEqual([]);
  });
  test('Kraft: gleiche Muskelgruppe nicht an Folgetagen, Oberkörper nach Unterkörper geht', () => {
    const k = (id: string, area?: string) => ({ id, sport: 'strength', title: 'Kraft 30 min', plannedMinutes: 30, ...(area ? { area } : {}) });
    const wk = (a: any, b: any) => [{ weekNumber: 1, days: [{ date: '2026-11-02', sessions: [a] }, { date: '2026-11-03', sessions: [b] }] }];
    expect(checkPlanRules(wk(k('a', 'lower'), k('b', 'upper')), { sports: ['strength'] } as any)).toEqual([]);
    expect(checkPlanRules(wk(k('a', 'lower'), k('b', 'lower')), { sports: ['strength'] } as any)[0].rule).toBe('strengthGroup');
    expect(checkPlanRules(wk(k('a'), k('b', 'upper')), { sports: ['strength'] } as any)[0].rule).toBe('strengthGroup');
  });
});
