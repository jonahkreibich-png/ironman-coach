import { describe, expect, test } from 'vitest';
import * as W from '../../shared/workouts';
import { paceCtx, generatePlan } from '../../shared/plangen';
import { defaultProfile, withEstimates } from '../../shared/profile';

const today = '2026-10-20';
const profile = (gear: string[], crawl: 'some' | 'yes' = 'some') => withEstimates({
  ...defaultProfile(), birthYear: 1980, sports: ['swim'], weeklyHours: 2,
  skills: { swimCrawl: crawl, swimCrawlM: 50, swimBreast: true, poolM: 25, swimGear: gear },
} as any, today);

describe('Schwimmtechnik mit vorhandenem Material und bestaetigtem Koennen', () => {
  test('50 m Kraul: Brett und Buoy haben getrennte Technikaufgaben ohne laengere Kraulstrecken', () => {
    const ctx = paceCtx(profile(['board', 'buoy']), false, null, today);
    const built = W.build(W.swimLearn(ctx, { ladder: 'swim', n: 3, breast: true }, undefined, 40));
    expect(built.spec.steps.some(s => s.mode === 'kick' && s.gear?.includes('board'))).toBe(true);
    expect(built.spec.steps.some(s => s.mode === 'pull' && s.gear?.includes('buoy'))).toBe(true);
    expect(built.description).toContain('Kraul-Beinschlag mit Kickbrett');
    expect(built.description).toContain('Kraul mit Pull Buoy');
    for (const s of built.spec.steps.filter(s => s.mode === 'crawl' || s.mode === 'pull')) expect(s.m).toBeLessThanOrEqual(50);
    expect(built.plannedKm).toBe(W.swimSums(built.spec).meters / 1000);
    expect(built.plannedMinutes).toBe(Math.round(W.swimSums(built.spec).min));
  });

  test('ohne Material und ohne getrennte Pull-Angabe braucht keine Serie Material', () => {
    const built = W.build(W.swimLearn(paceCtx(profile([]), false, null, today), { ladder: 'swim', n: 3, breast: true }, undefined, 40));
    expect(built.description).not.toMatch(/Kickbrett|Pull Buoy|Flossen|Paddles|Schnorchel/);
    expect(built.spec.steps.every(s => !s.gear?.length)).toBe(true);
    expect(built.spec.steps.filter(s => s.mode === 'crawl').every(s => (s.m || 0) <= 50)).toBe(true);
  });

  test.each([2, 3, 4, 5])('Stufe %i nutzt Material ohne eine neue Distanz zu erfinden', n => {
    const built = W.build(W.swimLearn({ gear: ['board', 'buoy'], pool: 25 }, { ladder: 'swim', n, breast: true }));
    expect(built.spec.steps.some(s => s.mode === 'kick' && s.gear?.includes('board'))).toBe(true);
    const pull = built.spec.steps.filter(s => s.mode === 'pull');
    expect(pull.length).toBeGreaterThan(0);
    for (const s of pull) expect(s.m).toBeLessThanOrEqual(W.SWIM_STAGE_M[n]);
  });

  test('laengere Pull-Stuecke brauchen eine eigene bestaetigte Pull-Distanz', () => {
    const built = W.build(W.swimLearn({ gear: ['buoy'] }, { ladder: 'swim', n: 3, breast: true, pull: 100 }));
    expect(built.spec.steps.find(s => s.mode === 'pull')?.m).toBe(100);
    expect(built.spec.steps.filter(s => s.mode === 'crawl').every(s => (s.m || 0) <= 50)).toBe(true);
  });

  test.each([[], ['board'], ['buoy'], ['board', 'buoy']].map(gear => [gear] as const))('Material %j: nur vorhandene Hilfsmittel, gleiche Kraulgrenze', gear => {
    const built = W.build(W.swimLearn({ gear, pool: 25 }, { ladder: 'swim', n: 3, breast: true, pull: 100 }));
    for (const s of built.spec.steps) for (const item of s.gear || []) expect(gear).toContain(item);
    expect(built.spec.steps.some(s => s.mode === 'pull')).toBe(gear.includes('buoy'));
    for (const s of built.spec.steps.filter(s => s.mode === 'crawl')) expect(s.m).toBeLessThanOrEqual(50);
  });

  test('normales Techniktraining bei 50 m nutzt Brett und Buoy ebenfalls in kurzen Serien', () => {
    const built = W.build(W.swimNormal({ gear: ['board', 'buoy'], pool: 25 }, 'technique', 40, 'base', 50));
    expect(built.spec.steps.some(s => s.mode === 'kick' && s.gear?.includes('board'))).toBe(true);
    expect(built.spec.steps.some(s => s.mode === 'pull' && s.gear?.includes('buoy'))).toBe(true);
    for (const s of built.spec.steps.filter(s => s.mode === 'crawl' || s.mode === 'pull')) expect(s.m).toBeLessThanOrEqual(50);
  });

  test('12 Wochen halten die bestaetigten 50 m und planen vorhandenes Material ein', () => {
    const result = generatePlan({ profile: profile(['board', 'buoy']), goals: [{ id: 'g', type: 'fitness', name: 'Fitness', date: null, priority: 'A' }], today, from: today, maxWeeks: 12 });
    const swims = result.plan.weeks.flatMap(w => w.days.flatMap(d => d.sessions)).filter(s => s.sport === 'swim' && s.spec && s.spec.kind !== 'test');
    expect(swims.length).toBeGreaterThan(8);
    for (const s of swims) {
      expect(s.spec.steps.some(x => x.mode === 'kick' && x.gear?.includes('board'))).toBe(true);
      expect(s.spec.steps.some(x => x.mode === 'pull' && x.gear?.includes('buoy'))).toBe(true);
      for (const x of s.spec.steps.filter(x => x.mode === 'crawl' || x.mode === 'pull')) expect(x.m).toBeLessThanOrEqual(50);
      expect(s.stage?.n).toBe(3);
    }
  });
});
