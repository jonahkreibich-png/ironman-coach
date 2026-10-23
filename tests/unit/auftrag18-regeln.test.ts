/* Auftrag 18, Punkt 2, 5 und 6 (dauerhaft): Trainingswissen als feste Regeln. Jede Regel aus docs/TRAININGSREGELN.md hat einen Test;
   die Datei selbst entsteht aus shared/trainingknowledge.ts und muss aktuell sein. */
import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import * as C from '../../shared/core';
import * as W from '../../shared/workouts';
import { defaultProfile } from '../../shared/profile';
import { generatePlan } from '../../shared/plangen';
import { checkTrainingRules, repairTrainingRules, restDayReason, bigDay } from '../../shared/trainingrules';
import { KNOWLEDGE, rulesMarkdown, rulesForAi } from '../../shared/trainingknowledge';
import { JARGON, searchGlossary } from '../../shared/glossary';
import { capsFor, easyAfterDays } from '../../shared/periodize';
import { sleepNeed } from '../../shared/profile';
import { seasonHint } from '../../shared/goalcheck';
import { cycleHint, shoeHint } from '../../shared/care';
import { coachSkill } from '../../shared/coach/freeai';
import { world } from '../helpers/chat-world';

const ctx = { runThrSec: 300, lthrRun: 170, lthrBike: 160, bikeKmh: 30, ftp: null, css: null, breast100: 165, indoor: false, bikeName: null, pool: 25, gear: [], swimMPerMin: null, crawl100: null } as any;
const S = (id: string, spec: W.Spec, extra: any = {}) => ({ id, ...W.build(spec), ...extra });
const easyRun = (id: string, m: number) => S(id, W.runEasy(ctx, m));
const longRun = (id: string, m: number) => S(id, W.runLong(ctx, m), { long: true });
const longBike = (id: string, m: number) => S(id, W.bikeLong(ctx, m), { long: true });
const easyBike = (id: string, m: number) => S(id, W.bikeEasy(ctx, m));
const swim = (id: string, m: number) => S(id, W.swimNormal(ctx, 'endurance', m, 'base', 200));
const brick = (id: string) => { const sp = W.runEasy(ctx, 15); sp.title = 'Koppellauf 15 min (direkt nach dem Rad)'; return S(id, sp); };
const strength = (id: string, area?: 'lower' | 'upper') => S(id, area ? W.strengthArea(area, { minutes: 40 }) : W.strengthSession(['run'], { minutes: 40 }));
const game = (id: string) => ({ id, sport: 'football', title: 'Fußball: Spiel', plannedMinutes: 90, fixed: true, hard: true, spec: { sport: 'football', kind: 'game', steps: [], ctx: {} } });
const quality = (id: string) => S(id, W.runIntervals(ctx, 4, 4, 2, 4));
/* eine Woche ab Montag 2026-11-02, Tage Mo..So */
function week(days: any[][], o: any = {}) {
  const mon = '2026-11-02';
  return { weekNumber: 1, startDate: mon, endDate: C.addDays(mon, 6), phase: 'build', ...o, days: days.map((l, i) => ({ date: C.addDays(mon, i), sessions: l.length ? l : [{ id: 'r' + i, sport: 'rest', title: 'Ruhetag' }] })) };
}
const adult = { ...defaultProfile(), birthYear: 1990, experienceYears: 5, weeklyHours: 10, sports: ['swim', 'bike', 'run', 'strength'] } as any;
const teen = { ...adult, birthYear: 2012 } as any;
const rules = (weeks: any[], p = adult, o: any = {}) => checkTrainingRules(weeks, p, o).map(i => i.rule);

describe('Punkt 2: Regeln werden erkannt und korrigiert', () => {
  test('Ruhetag: mindestens 1 pro Woche; die Korrektur schafft einen (lockere Einheit wandert oder entfällt)', () => {
    const w = week([[easyRun('a', 40)], [swim('b', 40)], [easyBike('c', 60)], [easyRun('d', 40)], [swim('e', 40)], [longBike('f', 120)], [longRun('g', 90)]]);
    expect(rules([w])).toContain('restDay');
    repairTrainingRules([w], adult, {});
    expect(rules([w])).not.toContain('restDay');
  });
  test('Jugendliche: Wochenstunden nie über dem Alter (Teamsport zählt mit)', () => {
    const w = week([[game('g1')], [easyRun('a', 120)], [easyBike('b', 200)], [], [easyRun('c', 120)], [longBike('d', 240)], [longRun('e', 120)]]);
    expect(rules([w], teen)).toContain('teenHours');
    repairTrainingRules([w], teen, {});
    expect(rules([w], teen)).not.toContain('teenHours');
  });
  test('Nach langem Tag (lange Ausfahrt + Koppel) kein langer Lauf; Sonntag locker und kürzer (etwa 2/3)', () => {
    const w = week([[], [swim('a', 40)], [easyBike('b', 60)], [easyRun('c', 40)], [], [longBike('d', 150), brick('e')], [longRun('f', 105)]]);
    expect(rules([w])).toContain('bigDayNext');
    repairTrainingRules([w], adult, {});
    expect(rules([w])).not.toContain('bigDayNext');
    const sun = w.days[6].sessions.find((s: any) => s.sport === 'run');
    expect(sun.plannedMinutes).toBeLessThanOrEqual(75); expect(sun.hard).toBeFalsy();
  });
  test('Lange Ausfahrt Sa + langer Lauf So ist erlaubt (ohne Koppel, ohne Tempo am Sonntag)', () => {
    const w = week([[], [swim('a', 40)], [easyBike('b', 60)], [easyRun('c', 40)], [], [longBike('d', 180)], [longRun('f', 105)]]);
    expect(rules([w])).not.toContain('bigDayNext');
    expect(bigDay(w.days[5]).longRideOnly).toBe(true);
    w.days[6].sessions = [S('q', W.runLong(ctx, 105), { long: true, hard: true })]; (w.days[6].sessions[0] as any).spec.kind = 'longq';
    expect(rules([w])).toContain('bigDayNext');
  });
  test('Höchstens 2 Sportarten pro Tag (Koppellauf zählt als Laufen), Dreifach nur als Generalprobe', () => {
    const w = week([[], [easyRun('x', 40)], [easyBike('b', 60)], [], [easyRun('c', 40)], [swim('a', 40), longBike('d', 150), brick('e')], [easyRun('f', 50)]]);
    expect(rules([w])).toContain('maxSports');
    repairTrainingRules([w], adult, {});
    expect(rules([w])).not.toContain('maxSports');
  });
  test('Harte Tage: nie hintereinander, nichts Hartes vor einem Spiel', () => {
    const w = week([[], [quality('a')], [S('b', W.bikeIntervals(ctx, 4, 8, 4, 2))], [], [quality('c')], [game('g')], [longRun('e', 80)]]);
    const r0 = rules([w]); expect(r0).toContain('hardAdjacent'); expect(r0).toContain('hardBeforeEvent');
    repairTrainingRules([w], adult, {});
    const r1 = rules([w]); expect(r1).not.toContain('hardAdjacent'); expect(r1).not.toContain('hardBeforeEvent');
  });
  test('Erholungswoche ohne Intervalle (Tests erlaubt), Test nicht direkt nach einem Spiel', () => {
    const w = week([[], [quality('a')], [], [easyBike('b', 50)], [game('g')], [S('t', W.runTest(ctx))], [easyRun('c', 40)]], { isRecoveryWeek: true });
    const r0 = rules([w]); expect(r0).toContain('recoveryIntervals'); expect(r0).toContain('testLoad');
    repairTrainingRules([w], adult, {});
    const r1 = rules([w]); expect(r1).not.toContain('recoveryIntervals'); expect(r1).not.toContain('testLoad');
  });
  test('Kraft Beine nie am Tag vor oder an Spiel/Wettkampf/langem Lauf; Kraft am Spieltag höchstens 30 min', () => {
    const w = week([[], [], [easyBike('b', 50)], [strength('k', 'lower')], [strength('u', 'upper'), game('g')], [], [longRun('e', 80)]]);
    const r0 = rules([w]); expect(r0).toContain('legsStrength'); expect(r0).toContain('strengthGameDay');
    repairTrainingRules([w], adult, {});
    const r1 = rules([w]); expect(r1).not.toContain('legsStrength'); expect(r1).not.toContain('strengthGameDay');
    expect(w.days[4].sessions.find((s: any) => s.sport === 'strength').description).toMatch(/nicht direkt vor dem Spiel/);
  });
  test('Wettkampfwoche: keine Kraft, nichts Hartes; Spiel 2 Tage vorher → Woche leichter und Hinweis', () => {
    const race = { id: 'hm', sport: 'run', title: 'Halbmarathon', plannedMinutes: 110, race: true, goalId: 'hm', goalType: 'run_half', priority: 'B', hard: true };
    const w = week([[], [strength('k', 'lower')], [quality('q')], [], [game('g')], [easyRun('c', 30)], [race]], { phase: 'race' });
    const r0 = rules([w]); expect(r0.filter(x => x === 'raceWeek').length).toBeGreaterThanOrEqual(3);
    repairTrainingRules([w], adult, {});
    expect(rules([w])).not.toContain('raceWeek');
    expect(w.important).toMatch(/nur kurz spielen oder aussetzen/);
  });
  test('Nach dem Wettkampf: Halbmarathon 7 Tage locker und kurz, keine lange Ausfahrt direkt danach', () => {
    expect(easyAfterDays('run_half')).toBe(7); expect(easyAfterDays('run_10k')).toBe(3); expect(easyAfterDays('tri_olympic')).toBe(7); expect(easyAfterDays('tri_middle')).toBeGreaterThanOrEqual(10);
    const race = { id: 'hm', sport: 'run', title: 'Halbmarathon', plannedMinutes: 110, race: true, goalId: 'hm', goalType: 'run_half', priority: 'B', hard: true };
    const w1 = week([[], [], [], [], [], [], [race]], { phase: 'race' });
    const w2 = { ...week([[easyRun('a', 30)], [quality('q')], [], [easyRun('b', 40)], [], [longBike('l', 95)], [easyRun('c', 40)]]), weekNumber: 2, startDate: '2026-11-09', endDate: '2026-11-15' };
    w2.days.forEach((d: any, i: number) => { d.date = C.addDays('2026-11-09', i); });
    expect(rules([w1, w2])).toContain('afterRace');
    repairTrainingRules([w1, w2], adult, {});
    expect(rules([w1, w2])).not.toContain('afterRace');
  });
  test('Lauf-Qualität vor dem Laufziel: in den letzten 7 Wochen jede normale Woche, Sonntag dann locker', () => {
    const race = { id: 'hm', sport: 'run', title: 'Halbmarathon', plannedMinutes: 110, race: true, goalId: 'hm', goalType: 'run_half', priority: 'A', hard: true };
    const wk = week([[], [easyRun('a', 50)], [easyBike('b', 60)], [], [easyRun('c', 45)], [swim('s', 40)], [longRun('l', 95)]], { phase: 'specific' });
    const rw = { ...week([[], [], [], [], [], [], [race]], { phase: 'race' }), weekNumber: 4, startDate: '2026-11-23', endDate: '2026-11-29' };
    rw.days.forEach((d: any, i: number) => { d.date = C.addDays('2026-11-23', i); });
    expect(rules([wk, rw])).toContain('goalQuality');
    repairTrainingRules([wk, rw], adult, {});
    expect(rules([wk, rw])).not.toContain('goalQuality');
    expect(wk.days.flatMap((d: any) => d.sessions).some((s: any) => s.sport === 'run' && s.hard)).toBe(true);
  });
  test('Langer Lauf passend zum Ziel (Halbmarathon höchstens 105 min) und höchstens +10 min pro Woche', () => {
    expect(capsFor('run_half', '2027-03-01').run).toBe(105);
    const w1 = week([[], [easyRun('a', 40)], [], [easyBike('b', 60)], [], [swim('s', 40)], [longRun('l', 80)]]);
    const w2 = { ...week([[], [easyRun('a2', 40)], [], [easyBike('b2', 60)], [], [swim('s2', 40)], [longRun('l2', 110)]]), weekNumber: 2, startDate: '2026-11-09', endDate: '2026-11-15' };
    w2.days.forEach((d: any, i: number) => { d.date = C.addDays('2026-11-09', i); });
    const o = { goalType: 'run_half' as const };
    const r0 = rules([w1, w2], adult, o); expect(r0).toContain('longStep'); expect(r0).toContain('longCap');
    repairTrainingRules([w1, w2], adult, o);
    expect(rules([w1, w2], adult, o)).toEqual([]);
  });
  test('Generator: jeder neue Plan hält alle Regeln ein (Beispiel Halbmarathon mit Fußball)', () => {
    const p = { ...adult, birthYear: 2009, sports: ['run', 'bike', 'swim', 'strength', 'football'], teamSport: { name: 'Fußball', trainingDays: [1], trainingMinutes: 90, gameDays: [5], gameMinutes: 90, seasonFrom: null, seasonTo: null } } as any;
    const g = { id: 'hm', type: 'run_half' as const, name: 'Halbmarathon', date: '2027-04-04', priority: 'A' as const };
    const r = generatePlan({ profile: p, goals: [g], today: '2026-10-23', currentWeeklyHours: 7 });
    expect(checkTrainingRules(r.plan.weeks, p, { goals: [g], goalType: 'run_half', from: '2026-10-26' })).toEqual([]);
  });
});

describe('Punkt 6: Zusätzliches Trainingswissen', () => {
  test('Schlafbedarf: Jugendliche 8-10 h, Erwachsene 7-9 h; kurzer Schlaf allein macht die Ampel nicht rot', () => {
    expect(sleepNeed({ birthYear: 2010 } as any, '2026-10-23')).toEqual([8, 10]);
    expect(sleepNeed({ birthYear: 1990 } as any, '2026-10-23')).toEqual([7, 9]);
    const trend = Array.from({ length: 10 }, (_, k) => ({ date: C.addDays('2026-10-23', -10 + k), sleepHours: 8, restingHR: 50, hrv: 70 }));
    trend.push({ date: '2026-10-23', sleepHours: 4.5, restingHR: 50, hrv: 70 });
    const R = C.readinessFor(trend, [], '2026-10-23', { sleepNeed: [7, 9] });
    expect(R.level).toBe(1);
  });
  test('Rad drinnen höchstens etwa 2 h', () => { expect(capsFor('tri_middle', '2027-06-01', { indoor: true }).bike).toBe(120); });
  test('Schmerz ab 4/10: Laufen der nächsten Tage wird lockeres Rad (gleiche Dauer), mit Hinweis auf Arzt/Physio', () => {
    const W0 = world('laeuferin-hm');
    const run = W0.sessions(W0.today, C.addDays(W0.today, 2)).find((s: any) => s.sport === 'run');
    W0.state.trend.push({ date: W0.today, illness: 'Knie 5/10' });
    W0.profile = { ...W0.profile, sports: [...new Set([...(W0.profile.sports || []), 'bike'])] } as any;
    const adj = C.dailyAdjustments({ ...W0.state, profile: W0.profile }, W0.plan.weeks, W0.today, { planMeta: W0.plan.meta });
    if (run) {
      const a = adj.find((x: any) => x.sessionId === run.id);
      expect(a).toBeTruthy(); expect(a.set.sport).toBe('bike'); expect(a.set.plannedMinutes).toBe(run.plannedMinutes);
      expect(a.reason).toMatch(/Arzt oder Physio/);
    }
  });
  test('Wiedereinstieg nach einer Pause ohne Krankheit: eine Woche ohne Intensität, nach über 2 Wochen weniger Umfang', () => {
    const W0 = world('olympisch-erfahren');
    // regelmäßig trainiert, dann 16 Tage Pause, heute wieder eine Einheit
    for (let k = 40; k >= 20; k -= 3) (W0.state.customWorkouts[C.addDays(W0.today, -k)] = []).push({ id: 'c' + k, sport: 'run', title: 'Lauf', completed: true, metrics: { min: 40 } });
    (W0.state.customWorkouts[W0.today] = []).push({ id: 'cnow', sport: 'run', title: 'Lauf', completed: true, metrics: { min: 30 } });
    expect(C.returnAfterPause(W0.state, W0.plan.weeks, W0.today)).toBeGreaterThanOrEqual(15);
    const adj = C.dailyAdjustments({ ...W0.state, profile: W0.profile }, W0.plan.weeks, W0.today, { planMeta: W0.plan.meta });
    const pause = adj.filter((a: any) => /^pause-/.test(a.id) && a.type === 'modify');
    expect(pause.length).toBeGreaterThan(0);
    expect(adj.find((a: any) => a.type === 'note' && /Wiedereinstieg/.test(a.what))!.reason).toMatch(/70 %/);
  });
  test('Hals-Regel: Schnupfen ohne Fieber → nur locker und kurz; Husten/Fieber → Krankheitsphase', () => {
    const W0 = world('laeuferin-hm');
    const r = W0.say('Ich habe Schnupfen');
    expect(r.text).toMatch(/Hals-Regel/); expect(r.text).toMatch(/locker und kurz/);
    const W1 = world('laeuferin-hm');
    expect(W1.say('Ich habe Husten und Fieber').intent).toBe('sick');
  });
  test('Verpasste Woche: nächste Woche wiederholen statt steigern', () => {
    const W0 = world('laeuferin-hm');
    const r = C.weeklyAdjustments({ ...W0.state, profile: W0.profile }, W0.plan.weeks, '2026-10-25', { planMeta: W0.plan.meta });
    const note = r.adjustments.find((a: any) => a.type === 'note');
    if (note && r.summary && r.summary.ratio != null && r.summary.ratio < 0.5) expect(note.reason).toMatch(/wiederholt/);
  });
  test('Einheiten-Texte: Verpflegung ab etwa 80 min, Essen nach harten/langen Einheiten, Lauf-ABC', () => {
    const g = { id: 'm', type: 'tri_middle' as const, name: 'Mitteldistanz', date: '2027-07-04', priority: 'A' as const };
    const r = generatePlan({ profile: { ...adult, weeklyHours: 12 }, goals: [g], today: '2026-10-23', currentWeeklyHours: 9 });
    const all = r.plan.weeks.flatMap((w: any) => w.days.flatMap((d: any) => d.sessions));
    const long = all.filter((s: any) => (s.sport === 'run' || s.sport === 'bike') && s.plannedMinutes >= 80 && !s.race);
    expect(long.length).toBeGreaterThan(0);
    long.forEach((s: any) => expect(s.description, s.title).toMatch(/30-60 g Kohlenhydrate/));
    expect(all.some((s: any) => /Lauf-ABC/.test(s.description || ''))).toBe(true);
    expect(all.filter((s: any) => s.hard && !s.race && s.sport !== 'football').every((s: any) => /innerhalb von 1-2 h eine/.test(s.description || ''))).toBe(true);
  });
  test('Generalprobe vor einem Triathlon: einmal Schwimmen + Rad + Koppellauf an einem Tag (erlaubter Dreifach-Tag)', () => {
    const g = { id: 'o', type: 'tri_olympic' as const, name: 'Olympische Distanz', date: '2027-06-20', priority: 'A' as const };
    const r = generatePlan({ profile: { ...adult, weeklyHours: 10 }, goals: [g], today: '2026-10-23', currentWeeklyHours: 8 });
    const sim = r.plan.weeks.flatMap((w: any) => w.days).filter((d: any) => d.sessions.some((s: any) => s.raceSim));
    expect(sim.length).toBe(1);
    expect(new Set(sim[0].sessions.map((s: any) => s.sport)).size).toBe(3);
    expect(checkTrainingRules(r.plan.weeks, adult, { goals: [g], goalType: 'tri_olympic' }).filter(i => i.rule === 'maxSports' || i.rule === 'raceSim')).toEqual([]);
  });
  test('Höchstens 2-3 A-Wettkämpfe pro Jahr, genug Abstand', () => {
    const A = (id: string, date: string) => ({ id, type: 'run_10k', name: id, date, priority: 'A' }) as any;
    expect(seasonHint([A('a', '2027-03-01'), A('b', '2027-03-20')], '2026-10-23')).toMatch(/Wochen auseinander/);
    expect(seasonHint([A('a', '2027-03-01'), A('b', '2027-05-01'), A('c', '2027-07-01'), A('d', '2027-09-01')], '2026-10-23')).toMatch(/4 Hauptziele/);
    expect(seasonHint([A('a', '2027-03-01'), A('b', '2027-09-01')], '2026-10-23')).toBeNull();
  });
  test('Freiwillig: Zyklus-Hinweise und Laufschuh-Kilometer', () => {
    expect(cycleHint({ on: true, start: '2026-10-22', length: 28 }, '2026-10-23')).toMatch(/Tag 2/);
    expect(cycleHint({ on: false, start: '2026-10-22' }, '2026-10-23')).toBeNull();
    const state = { sessions: {}, customWorkouts: { '2026-10-01': [{ id: 'x', sport: 'run', completed: true, metrics: { km: '20' } }] }, activities: {} };
    expect(shoeHint(state, [], { since: '2026-01-01', km0: 600 }, '2026-10-23')).toMatch(/620 km/);
    expect(shoeHint(state, [], { since: '2026-01-01', km0: 100 }, '2026-10-23')).toBeNull();
  });
});

describe('Coach-Wissen, Lexikon und Doku', () => {
  test('docs/TRAININGSREGELN.md ist aktuell (aus shared/trainingknowledge.ts) und markiert jede Regel', () => {
    expect(fs.readFileSync('docs/TRAININGSREGELN.md', 'utf8').trim()).toBe(rulesMarkdown().trim());
    for (const k of KNOWLEDGE) { expect(['war schon da', 'verbessert', 'neu']).toContain(k.status); expect(k.source.length).toBeGreaterThan(5); }
  });
  test('KI-Coach bekommt die Regeln als kurzen Kontext', () => {
    const W0 = world('laeuferin-hm');
    expect(coachSkill(W0.ctx(), 'App')).toContain(rulesForAi().split('\n')[1]);
    expect(rulesForAi().length).toBeLessThan(6000);
  });
  test('Lexikon „Training verstehen“ und Schwimm-Übungen (z. B. 6-3-6, Abschlag)', () => {
    expect(searchGlossary('', 'understand').length).toBe(KNOWLEDGE.length);
    expect(JARGON.some(j => j.term === '6-3-6')).toBe(true);
    expect(JARGON.some(j => j.term === 'Abschlagschwimmen')).toBe(true);
  });
  test('Regel-Coach: „Warum habe ich heute frei?“ mit Grund aus dem Plan', () => {
    const w = week([[game('g')], [], [easyBike('b', 50)], [], [], [longBike('d', 150), brick('e')], [easyRun('f', 40)]]);
    expect(restDayReason([w], '2026-11-03')).toMatch(/gestern war Fußball: Spiel/);
    const W0 = world('laeuferin-hm');
    for (let k = 0; k < 7; k++) { const d = C.addDays(W0.today, k); const day = W0.day(d); if (day && !day.sessions.some((s: any) => s.sport !== 'rest')) { W0.today = d; break; } }
    const r = W0.say('Warum habe ich heute frei?');
    expect(r.text).toMatch(/Ruhetag|Training geplant/);
  });
});
