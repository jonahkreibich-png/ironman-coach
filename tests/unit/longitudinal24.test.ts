import { describe, expect, test } from 'vitest';
import { HORIZONS, SIM_PROFILES, simulateLongitudinal24 } from '../helpers/longitudinal24';
describe('SIMULATED deterministic longitudinal trajectories (no real accounts)', () => {
  for (const horizon of HORIZONS) for (const profile of SIM_PROFILES) {
    test(`${profile.id}: ${horizon} virtual weeks`, async () => {
      // Yield between CPU-only virtual timelines so Vitest can flush worker RPC updates.
      await new Promise<void>(resolve => setImmediate(resolve));
      const result = await simulateLongitudinal24(profile, horizon);
      console.info('SIM24', JSON.stringify(result));
      expect(result.failures).toEqual([]);
      expect(result.days).toBe(horizon * 7); expect(result.checkpoints).toBe(horizon);
      expect(result.completed).toBeGreaterThan(0); expect(result.missed).toBeGreaterThan(0);
      expect(result.partial).toBeGreaterThan(0);
      expect(result.replans).toBeGreaterThan(0); expect(result.engineCalls).toBeGreaterThanOrEqual(horizon);
      expect(result.events['manual-load-anchor']).toBe(1); expect(result.events['equipment-change']).toBe(1);
      expect(result.events['score-check']).toBe(Math.floor(horizon / 4)); expect(Number.isFinite(result.elapsedMs)).toBe(true);
      if (horizon >= 12) { expect(result.events['availability-change']).toBe(1); expect(result.events['goal-change']).toBe(1); }
    }, 120_000);
  }
  test('same seed replays the same executed history', async () => {
    const a = await simulateLongitudinal24(SIM_PROFILES[4], 4, 77), b = await simulateLongitudinal24(SIM_PROFILES[4], 4, 77);
    expect({ ...a, elapsedMs: 0 }).toEqual({ ...b, elapsedMs: 0 });
  }, 120_000);
});

import { extendPlan } from '../../shared/replan';
import { defaultProfile, withEstimates } from '../../shared/profile';
import { checkPlanRules } from '../../shared/planrules';
import * as C from '../../shared/core';
test('extension checks Sunday/Monday spacing and preserves every existing session', () => {
  const today = '2026-11-01';
  const profile = withEstimates({ ...defaultProfile(), birthYear: 1985, sports: ['bike'], weeklyHours: 3,
    dayLoad: { 0: 1, 1: 1, 2: 0, 3: 0, 4: 2, 5: 0, 6: 0 },
    freq: { bike: [2, 2] }, weekPattern: { slots: [{ dow: 1, sport: 'bike', role: 'easy', min: [30, 30] }, { dow: 4, sport: 'bike', role: 'easy', min: [45, 45] }] },
  } as any, today);
  const plan: any = { meta: {}, weeks: [{ weekNumber: 1, startDate: '2026-10-26', endDate: today, phase: 'base', days: Array.from({ length: 7 }, (_, i) => ({ date: C.addDays('2026-10-26', i), sessions: i === 6 ? [{ id: 'existing-sunday', sport: 'bike', title: 'Lockere Ausfahrt', plannedMinutes: 30, zone: 'Zone 2', locked: true }] : [] })) }] };
  const before = JSON.stringify(plan);
  const next = extendPlan(plan, profile, [{ id: 'next', type: 'bike_event', name: 'SIMULATED ride', date: '2027-05-30', priority: 'A' }], today)!;
  expect(next).toBeTruthy(); expect(JSON.stringify(plan)).toBe(before); expect(next.weeks[0]).toEqual(plan.weeks[0]);
  const joined = next.weeks.slice(0, 2);
  expect(checkPlanRules(joined, profile)).toEqual([]);
  const monday = next.weeks[1].days[0].sessions.find((s: any) => s.sport === 'bike');
  if (monday) { expect(monday.adjacentOk).toBeTruthy(); expect(monday.description).toMatch(/Warum:|Ausnahme:/); expect(monday.hard).not.toBe(true); expect(monday.plannedMinutes).toBeLessThanOrEqual(45); }
});

import { generatePlan } from '../../shared/plangen';
import * as W from '../../shared/workouts';
test('late plan limits preserve past Thursday60min and already completed current-day75min', () => {
  const today = '2027-01-10';
  const profile = withEstimates({ ...defaultProfile(), birthYear: 1985, sports: ['run'], weeklyHours: 1, dayLoad: { 0: 2, 1: 0, 2: 2, 3: 0, 4: 2, 5: 0, 6: 0 }, skills: { runContinuousMin: 90 } } as any, today);
  const past = { id: 'SIMULATED-past-thursday', ...W.build(W.runLong({}, 60)), long: true };
  const completed = { id: 'SIMULATED-already-completed', ...W.build(W.runLong({}, 75)), long: true };
  const frozen = [{ date: '2027-01-07', sessions: [{ ...past }] }, { date: today, sessions: [{ ...completed, _done: true, _doneMin: 75 }] }];
  const next = generatePlan({ profile, goals: [{ id: 'g', type: 'run_half', name: 'SIMULATED half', date: '2027-05-30', priority: 'A' }], today, from: today, recentLong: { run: 40, bike: null }, frozen });
  const sessions = C.planDays(next.plan.weeks).flatMap((d: any) => d.sessions);
  expect(sessions.find((s: any) => s.id === past.id)).toEqual(past);
  expect(sessions.find((s: any) => s.id === completed.id)).toEqual(completed);
});

import { sportScores } from '../../shared/scores';
import type { Activity } from '../../shared/activity/analyze';
/** Small score checkpoints reuse the ten-profile inventory; the existing long timelines
 * remain the full simulation. These cases introduce no model or additional long suite. */
describe('bounded score evidence across ten synthetic user types', () => {
  const cases = [
    { name: 'sparse beginner', n: 1 },
    { name: 'fast-progress beginner', n: 8, progress: 0.15 },
    { name: 'stable advanced', n: 16 },
    { name: 'variable volume', n: 16, variable: true },
    { name: 'long history', n: 60 },
    { name: 'missing heart rate', n: 16, noHr: true },
    { name: 'no power meter', n: 16, bike: true },
    { name: 'manual entries only', n: 16, manual: true },
    { name: 'regular improvements', n: 16, progress: 0.05 },
    { name: 'return after two-week pause', n: 16, pause: 15 },
  ];
  for (const [i, user] of SIM_PROFILES.entries()) {
    const cfg = cases[i];
    test(`${cfg.name}: ${user.id}`, () => {
      const today = '2026-10-27', sport = cfg.bike ? 'bike' : 'run';
      const p = { ...defaultProfile(), powerMeter: false, skills: {}, thresholds: { ...defaultProfile().thresholds, thresholdPaceRunSec: 330, thresholdSpeedBikeKmh: 28 } };
      const activities = Array.from({ length: cfg.n }, (_, j) => ({
        id: `${user.id}-${j}`, date: C.addDays(today, -((cfg.n - j - 1) * 4 + (cfg.pause || 1))),
        sport, source: cfg.manual ? 'manual' : 'healthfit', sources: [cfg.manual ? 'manual' : 'healthfit'],
        min: cfg.variable ? (j % 2 ? 30 : 60) : 40, avgHr: cfg.noHr ? null : 150,
        speedKmh: (cfg.bike ? 25 : 10) + (cfg.progress || 0) * j, km: null,
        avgPower: null, rpe: 5, laps: [], indoor: false,
      } as Activity));
      const inp = { today, profile: p, goal: null, illness: [], trend: [], activities };
      const original = JSON.stringify(inp), [score] = sportScores(inp, [sport]);
      expect(score.measured).not.toBeNull();
      expect(Number.isFinite(score.score)).toBe(true);
      expect(score.confidence).toBeGreaterThanOrEqual(0);
      expect(score.confidence).toBeLessThanOrEqual(1);
      expect(JSON.stringify(inp)).toBe(original);
      // Stable IDs make order/restart irrelevant; another user's data never enters the input.
      const [replayed] = sportScores(JSON.parse(JSON.stringify({ ...inp, activities: [...activities].reverse() })), [sport]);
      expect(replayed).toEqual(score);
      const [withoutEvidence] = sportScores({ ...inp, activities: [] }, [sport]);
      expect(withoutEvidence.measured).toBeNull();
      expect(withoutEvidence.provisional).toBe(true);
      if (cfg.n === 1) expect(score.provisional).toBe(true);
      if (cfg.pause) {
        const [current] = sportScores({ ...inp, today: C.addDays(today, -14) }, [sport]);
        expect(score.confidence).toBeLessThan(current.confidence);
        expect(score.score).toBeLessThanOrEqual(current.score);
      }
    });
  }
});