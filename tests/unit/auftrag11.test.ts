/* Auftrag 11: Fehler aus dem Test mit Papa und Optimierungen für neue Nutzer (für alle Nutzer). */
import { describe, expect, test } from 'vitest';
import { defaultProfile, withEstimates } from '../../shared/profile';
import { generatePlan } from '../../shared/plangen';
import * as W from '../../shared/workouts';

const today = '2026-10-15';
const goal = { id: 'g', type: 'tri_olympic' as const, name: 'Olympisch', date: '2027-07-18', priority: 'A' as const };
const base = (skills: any) => withEstimates({ ...defaultProfile(), birthYear: 1975, weeklyHours: 8, maxDayHours: 2.5, sports: ['swim', 'bike', 'run'] as any, skills }, today);
const swims = (skills: any, o: any = {}) => {
  const r = generatePlan({ profile: base(skills), goals: [{ ...goal, ...(o.goal || {}) }], today, ...(o.inp || {}) });
  return r.plan.weeks.slice(0, o.weeks || 6).flatMap((w: any) => w.days.flatMap((d: any) => d.sessions.filter((s: any) => s.sport === 'swim').map((s: any) => ({ ...s, date: d.date }))));
};
const crawlMax = (s: any) => Math.max(0, ...((s.spec && s.spec.steps) || []).filter((x: any) => x.part === 'main' && (x.mode === 'crawl' || x.mode === 'pull')).map((x: any) => x.m || 0));

describe('1. Kraulen richtig einstufen', () => {
  test('nein → Technik von Anfang an (mit Brust: Brust und Kraul-Technik)', () => {
    expect(W.swimLadderStart({ swimCrawl: 'no', swimBreast: true })).toEqual({ ladder: 'swimBreast', n: 0 });
    const s = swims({ swimCrawl: 'no', swimBreast: true });
    expect(s.length).toBeGreaterThan(0);
    s.forEach(x => expect(x.title).toMatch(/Brust und Kraul-Technik/));
  });
  test('ein bisschen, 25 m → Lern-Stufen „Kraul lernen“ mit 25-m-Stücken', () => {
    expect(W.swimLadderStart({ swimCrawl: 'some', swimCrawlM: 25 })).toEqual({ ladder: 'swim', n: 2 });
    const s = swims({ swimCrawl: 'some', swimCrawlM: 25, swimBreast: true });
    s.forEach(x => { expect(x.title).toMatch(/Kraul lernen/); expect(crawlMax(x)).toBeLessThanOrEqual(25); });
  });
  test('ja, 50 m → normales Training mit Stücken bis 50 m, kein „Kraul lernen“', () => {
    expect(W.swimLadderStart({ swimCrawl: 'yes', swimCrawlM: 50 })).toBe(null);
    const s = swims({ swimCrawl: 'yes', swimCrawlM: 50 });
    s.forEach(x => { expect(x.title).not.toMatch(/Kraul lernen/); expect(x.title).toMatch(/^Schwimmen: (Grundlage|Technik \+ Ausdauer|Intervalle)/); expect(crawlMax(x)).toBeLessThanOrEqual(50); });
  });
  test('ja, 200 m → normales Training mit Technik-Anteil, Stücke bis 200 m', () => {
    const s = swims({ swimCrawl: 'yes', swimCrawlM: 200 });
    s.forEach(x => { expect(x.title).not.toMatch(/Kraul lernen/); expect(crawlMax(x)).toBeLessThanOrEqual(200); });
    expect(s.some(x => /Technik \+ Ausdauer/.test(x.title))).toBe(true);
    // auch „ein bisschen“ mit 200 m ist normales Training
    expect(W.swimLadderStart({ swimCrawl: 'some', swimCrawlM: 200 })).toBe(null);
  });
  test('ja, 400 m → normales Training, Schwimmtest 400/200 m möglich', () => {
    const s = swims({ swimCrawl: 'yes', swimCrawlM: 400 }, { inp: { needTests: { swim: true } }, weeks: 2 });
    expect(s.some(x => x.title === 'Schwimmtest 400/200 m')).toBe(true);
    s.forEach(x => expect(x.title).not.toMatch(/Kraul lernen/));
  });
  test('ja ohne Meterangabe → wie 100 m, nie Technik-Stufe 0, kein 400-m-Test', () => {
    expect(W.swimLadderStart({ swimCrawl: 'yes' })).toBe(null);
    expect(W.swimRepMax({ swimCrawl: 'yes' })).toBe(100);
    const s = swims({ swimCrawl: 'yes' }, { inp: { needTests: { swim: true } } });
    s.forEach(x => { expect(x.title).not.toMatch(/Kraul lernen|Wassergewöhnung/); expect(crawlMax(x)).toBeLessThanOrEqual(100); expect(x.title).not.toBe('Schwimmtest 400/200 m'); });
    expect(s.some(x => /Kraul-Check/.test(x.title))).toBe(true);
  });
  test('„Pull Buoy“ im Titel nur mit Pull-Buoy-Stücken in der Einheit', () => {
    const s = swims({ swimCrawl: 'yes', swimCrawlM: 300 }, { weeks: 10 });
    s.filter(x => /Pull Buoy/.test(x.title)).forEach(x => expect(x.spec.steps.some((st: any) => st.mode === 'pull')).toBe(true));
  });
  test('ohne CSS: Zone 3 ist schneller als Zone 2', () => {
    expect(W.swimPace({ breast100: 180 }, 3)).toBeLessThan(W.swimPace({ breast100: 180 }, 2));
  });
});

describe('5. Beckenlänge und Freiwasser', () => {
  const lengths = (s: any[]) => s.flatMap(x => x.spec.steps.map((st: any) => st.m || 0)).filter((m: number) => m > 0);
  test('25-m-Becken: keine Stücke, die nicht aufgehen (75, 125 …)', () => {
    const s = swims({ swimCrawl: 'some', swimCrawlM: 75, swimPullM: 175, swimBreast: true, poolM: 25 }, { weeks: 12 });
    lengths(s).forEach(m => expect(m === 25 || m % 50 === 0).toBe(true));
    expect(W.poolFit({ sport: 'swim', kind: 'endurance', ctx: { pool: 25 }, steps: [{ part: 'main', reps: 4, m: 75, mode: 'crawl' }] }).steps[0].m).toBe(50);
  });
  test('50-m-Becken: alles in 50-m-Schritten', () => {
    const s = swims({ swimCrawl: 'yes', swimCrawlM: 1500, poolM: 50 }, { weeks: 12 });
    lengths(s).forEach(m => expect(m % 50).toBe(0));
    // wer erst 25 m krault: halbe Bahn Kraul, Rest Brust
    const f = W.poolFit({ sport: 'swim', kind: 'swimlearn', stage: { ladder: 'swim', n: 2 }, ctx: { pool: 50 }, steps: [{ part: 'main', reps: 8, m: 25, mode: 'crawl' }] });
    expect(f.steps[0]).toMatchObject({ m: 50, mode: 'mixed' });
  });
  test('Freiwasser in der Saison und vor dem Triathlon, nicht ohne Freiwasser', () => {
    const summer = { goal: { date: '2027-08-01' }, weeks: 60 };
    const ow = swims({ swimCrawl: 'yes', swimCrawlM: 1500, poolM: 50, openWater: true, openWaterFrom: 6, openWaterTo: 9 }, summer).filter(x => x.spec.kind === 'openwater');
    expect(ow.length).toBeGreaterThan(3);
    ow.forEach(x => { const m = +x.date.slice(5, 7); expect(m >= 6 && m <= 9).toBe(true); expect(x.description).toMatch(/Sichten/); expect(x.description).toMatch(/Neopren/); });
    expect(swims({ swimCrawl: 'yes', swimCrawlM: 1500, openWater: false }, summer).some(x => x.spec.kind === 'openwater')).toBe(false);
    // Anfänger (unter 200 m am Stück) nie allein ins Freiwasser
    expect(swims({ swimCrawl: 'some', swimCrawlM: 50, swimBreast: true, openWater: true }, summer).some(x => x.spec.kind === 'openwater')).toBe(false);
  });
});
