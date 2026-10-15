/* Auftrag 11, Punkte 2, 3, 4 und 6 sowie Papas unplausible Daten */
import { describe, expect, test } from 'vitest';
import { defaultProfile, withEstimates } from '../../shared/profile';
import { generatePlan } from '../../shared/plangen';
import { applyOnboarding, profileFromAnswers, BLOCKS, missingRequired } from '../../shared/onboarding';
import { replanPlan, replanStart, calibrationDue } from '../../shared/replan';
import { sanitizeProfile, ghostGames } from '../../shared/sanity';
import { weekSummary } from '../../shared/weekgrid';
import * as C from '../../shared/core';
import { isIntense } from '../../shared/rules';

const today = '2026-10-15'; // Donnerstag
const team: any = { goals: [{ id: 'g1', type: 'run_10k', name: '10 km', date: '2027-05-02', priority: 'A' }], birthYear: 1980, injuries: 'keine', sports: ['run', 'strength'], weeklyHoursNow: 4,
  dayLoad: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 3, 0: 3 }, teamYes: true, teamName: 'Volleyball', teamTrainingDays: [2, 4], teamTrainingMinutes: 90 };

describe('2. Teamsport ohne Spiele', () => {
  test('Fragebogen: erst „Gibt es Spiele?“, Spieltage nur bei Ja', () => {
    const q = (id: string) => BLOCKS.flatMap(b => b.questions).find(x => x.id === id)!;
    expect(q('teamGames').show!({ teamYes: true })).toBe(true);
    expect(q('teamGameMinutes').show!({ teamYes: true, teamGames: false })).toBe(false);
  });
  test('ohne Spiele: keine Spiel-Einheiten, keine Spieltag-Regel, auch wenn alte Spieltage in den Antworten stehen', () => {
    const r = applyOnboarding({ ...team, teamGames: false, teamGameDays: [6] }, today);
    expect(r.profile.teamSport!.gameDays).toEqual([]);
    const all = r.gen!.plan.weeks.flatMap((w: any) => w.days.flatMap((d: any) => d.sessions));
    expect(all.some((s: any) => s.sport === 'football' && C.isGame(s))).toBe(false);
    expect(all.filter((s: any) => s.sport === 'football').length).toBeGreaterThan(5);
    expect(r.gen!.summary.join(' ')).not.toMatch(/Spieltag/);
  });
  test('mit Spielen: Spiele im Plan', () => {
    const r = applyOnboarding({ ...team, teamGames: true, teamGameDays: [6], teamGameMinutes: 60 }, today);
    expect(r.gen!.plan.weeks[2].days.flatMap((d: any) => d.sessions).some((s: any) => C.isGame(s))).toBe(true);
  });
  test('bestehende Nutzer mit leeren Spieltagen: Spiele im Plan werden gefunden (und entfallen beim Start)', () => {
    const p: any = { teamSport: { name: 'Fußball', trainingDays: [1], trainingMinutes: 90, gameDays: [], gameMinutes: 90 } };
    const weeks = [{ days: [{ date: '2026-10-17', sessions: [{ id: 'x', sport: 'football', title: 'Fußball: Spiel' }, { id: 'y', sport: 'football', title: 'Fußball-Training' }] }] }];
    expect(ghostGames(weeks, p, today).map(g => g.id)).toEqual(['x']);
    expect(ghostGames(weeks, { ...p, teamSport: { ...p.teamSport, gameDays: [6] } }, today)).toEqual([]);
    // ein Teamname mit „Spiel“ ist kein Spiel
    expect(C.isGame({ sport: 'football', title: 'Spielvereinigung-Training', spec: { kind: 'team' } })).toBe(false);
  });
});

describe('Papas Daten: unplausible Werte', () => {
  test('Geburtsjahr „197“: wird nicht angenommen, Pulswerte neu geschätzt, „Kraulen“ = was angezeigt wurde', () => {
    const bad: any = { ...defaultProfile(), birthYear: 197, sports: ['swim', 'run'], thresholds: { lthrRun: -954, lthrBike: -922, thresholdPaceRunSec: 337, thresholdSpeedBikeKmh: 27, maxHr: -1072, estimated: ['lthrRun', 'lthrBike', 'maxHr'] }, skills: { swimCrawl: null, swimBreast: true }, answers: { swimBreast: true } };
    const fx = sanitizeProfile(bad, today);
    expect(fx.badBirthYear).toBe(197); expect(fx.profile.birthYear).toBe(null);
    expect(fx.profile.thresholds.lthrRun).toBeGreaterThan(100); expect(fx.profile.thresholds.maxHr).toBeGreaterThan(120);
    expect(fx.profile.skills.swimCrawl).toBe('yes');
    expect(sanitizeProfile(fx.profile, today).changed).toBe(false);
  });
  test('Kraulen ist Pflicht, wenn Schwimmen gewählt ist', () => {
    expect(missingRequired({ sports: ['swim'] }).some(m => m.q.id === 'swimCrawl')).toBe(true);
  });
});

describe('3. Änderungen gelten sofort', () => {
  const p = withEstimates({ ...defaultProfile(), birthYear: 1985, weeklyHours: 8, maxDayHours: 2.5, sports: ['bike', 'run'] as any, dayLoad: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 3, 0: 3 } as any, skills: { runContinuousMin: 60, bikeLongestMin: 120 } }, today);
  const g = [{ id: 'g', type: 'run_half' as const, name: 'HM', date: '2027-04-11', priority: 'A' as const }];
  const old = generatePlan({ profile: p, goals: g, today: '2026-10-08' }).plan; // ab Mo 12.10.
  const days = (plan: any) => C.planDays(plan.weeks).filter((d: any) => d.date >= '2026-10-12' && d.date <= '2026-10-18');
  const oldWeek = days(old);
  const done = oldWeek.flatMap((d: any) => d.sessions).find((s: any) => s.sport !== 'rest' && oldWeek.find((d: any) => d.sessions.includes(s))!.date < today);
  const state = { sessions: { [done.id]: { completed: true, metrics: { min: done.plannedMinutes } } }, trend: [], illnessPeriods: [], customWorkouts: {} };
  test('ab 18 Uhr gilt die Änderung ab morgen', () => {
    expect(replanStart(today, 17)).toBe(today); expect(replanStart(today, 18)).toBe('2026-10-16');
  });
  test('vergangene Tage und Erledigtes bleiben genau, der Rest der Woche ist neu; keine zwei harten Tage hintereinander', () => {
    const r = replanPlan(old, { ...p, weeklyHours: 6 }, g, today, { state, adjustments: {}, from: today })!;
    const nw = days(r.plan);
    for (const d of oldWeek.filter((x: any) => x.date < today)) expect(nw.find((x: any) => x.date === d.date)!.sessions).toEqual(d.sessions);
    expect(nw.flatMap((d: any) => d.sessions).some((s: any) => s.id === done.id)).toBe(true);
    const fut = nw.filter((d: any) => d.date >= today).flatMap((d: any) => d.sessions).filter((s: any) => s.sport !== 'rest');
    expect(fut.length).toBeGreaterThan(0);
    expect(fut.every((s: any) => !oldWeek.flatMap((d: any) => d.sessions).some((o: any) => o.id === s.id))).toBe(true);
    const hard = nw.map((d: any) => d.sessions.some((s: any) => isIntense(s)));
    for (let i = 1; i < 7; i++) expect(hard[i] && hard[i - 1] && nw[i].date >= today).toBe(false);
    // die Woche behält ihre Nummer, die Woche danach ist die nächste
    const wk = r.plan.weeks.find((w: any) => w.startDate === '2026-10-12');
    expect(wk.weekNumber).toBe(1); expect(wk.partial).toBe(true);
    expect(r.plan.weeks.find((w: any) => w.startDate === '2026-10-19').weekNumber).toBe(2);
  });
  test('Rest der Woche: Erledigtes zählt mit, nicht mehr als die Woche hergibt', () => {
    const r = replanPlan(old, p, g, today, { state, adjustments: {}, from: today })!;
    const own = (ds: any[]) => ds.flatMap((d: any) => d.sessions).filter((s: any) => ['run', 'bike', 'swim', 'strength'].includes(s.sport)).reduce((a: number, s: any) => a + (s.plannedMinutes || 0), 0);
    const nw = days(r.plan);
    expect(own(nw.filter((d: any) => d.date >= today)) + done.plannedMinutes).toBeLessThanOrEqual(own(oldWeek) * 1.25);
  });
  test('ab 18 Uhr: heute bleibt unverändert', () => {
    const r = replanPlan(old, p, g, today, { state, adjustments: {}, from: replanStart(today, 19) })!;
    expect(days(r.plan).find((d: any) => d.date === today)!.sessions).toEqual(oldWeek.find((d: any) => d.date === today)!.sessions);
  });
  test('neuer Nutzer: Plan beginnt heute, Tage davor heißen „Vor dem Planstart“', () => {
    const r = applyOnboarding({ ...team, teamGames: false }, today, undefined, { from: today });
    const w0 = r.gen!.plan.weeks[0];
    expect(w0.startDate).toBe('2026-10-12'); expect(w0.partial).toBe(true);
    expect(w0.days[0].sessions[0].title).toBe('Vor dem Planstart');
    expect(w0.days.filter((d: any) => d.date >= today).flatMap((d: any) => d.sessions).some((s: any) => s.sport !== 'rest')).toBe(true);
  });
});

describe('4. Wochenraster: Zeit nur einmal', () => {
  test('Stunden, längster Tag und Häufigkeit aus dem Raster, nie widersprüchlich', () => {
    const a: any = { sports: ['run', 'swim'], dayLoad: { 1: 1, 3: 2, 6: 3 }, maxDayHours: 2, notes: [], rules: [] };
    const ws = weekSummary(a, today);
    expect(ws.capH).toBe(4.5); expect(ws.weeklyHours).toBe(4.5); expect(ws.hasLong).toBe(true);
    expect(ws.sports.find(x => x.sport === 'run')!.days).toBe(3);
    expect(weekSummary({ ...a, weeklyHours: 9 }, today).weeklyHours).toBe(4.5);
    expect(weekSummary({ ...a, freq: { run: [5, 5] } }, today).sports.find(x => x.sport === 'run')!.freq).toEqual([3, 3]);
    const pr = profileFromAnswers({ ...a, freq: { run: [5, 5] }, weeklyHours: 9 }, today).profile;
    expect(pr.weeklyHours).toBe(4.5); expect(pr.freq.run).toEqual([3, 3]);
  });
  test('bestehende Antworten werden übernommen (eigene Stundenzahl bleibt)', () => {
    expect(weekSummary({ sports: ['run'], dayLoad: { 0: 3, 1: 2, 2: 1, 3: 2, 4: 1, 5: 2, 6: 3 }, maxDayHours: 2, weeklyHours: 7 }, today).weeklyHours).toBe(7);
  });
  test('ein einziger Bildschirm für Zeit', () => {
    const time = BLOCKS.find(b => b.id === 'time')!;
    expect(time.questions.map(q => q.type)).toEqual(['week']);
    expect(BLOCKS.flatMap(b => b.questions).filter(q => ['weeklyHours', 'maxDayHours', 'freq', 'grid'].includes(q.id))).toEqual([]);
  });
});

describe('6. Stunden bisher', () => {
  test('„Weiß ich nicht“: vorsichtiger Start, nach 2 Wochen Anpassung an die echten Daten', () => {
    const r = applyOnboarding({ ...team, teamYes: false, weeklyHoursNow: 'unknown' }, today, undefined, { from: today });
    const plan = r.gen!.plan;
    expect(plan.meta.calibrateAt).toBe('2026-10-29');
    expect(plan.meta.explain.join(' ')).toMatch(/vorsichtig/);
    expect(missingRequired({ ...team, weeklyHoursNow: 'unknown' }).some(m => m.q.id === 'weeklyHoursNow')).toBe(false);
    const ss = C.planDays(plan.weeks).filter((d: any) => d.date >= '2026-10-15' && d.date < '2026-10-29').flatMap((d: any) => d.sessions).filter((s: any) => s.sport !== 'rest');
    const st = { sessions: Object.fromEntries(ss.map((s: any) => [s.id, { completed: true, metrics: { min: 60 } }])) };
    expect(calibrationDue(plan, st, '2026-10-28')).toBe(null);
    expect(calibrationDue(plan, st, '2026-10-29')!.minutes).toBe(Math.round(ss.length * 60 / 2));
    expect(calibrationDue({ ...plan, meta: { ...plan.meta, calibrated: true } }, st, '2026-10-29')).toBe(null);
  });
});
