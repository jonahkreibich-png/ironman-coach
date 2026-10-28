import { expect, test } from 'vitest';
// @ts-ignore - deterministic JavaScript fixture, same as the browser seed helper
import { makeDemo } from '../../fixtures/demo.mjs';
import { readiness24Fixture, READINESS24_TODAY } from '../../fixtures/readiness24';
import { mergeProfile, profileFromLegacy } from '../../shared/profile';
import { readinessSnapshot } from '../../shared/readiness';
import { converse } from '../../shared/coach/dialog';

function seeded() {
  const state = makeDemo(READINESS24_TODAY); readiness24Fixture(state);
  const profile = mergeProfile(state.profile, profileFromLegacy({ ...state, planWeeks: state.plan.weeks }, READINESS24_TODAY), READINESS24_TODAY);
  return { state, profile, point: state.trend.find((p: any) => p.date === READINESS24_TODAY), snapshot: () => readinessSnapshot(state, state.plan.weeks, profile, READINESS24_TODAY) };
}
test('actual browser seed is yellow for its adult profile; local coach agrees', () => {
  const f = seeded(); expect(f.profile.birthYear).toBe(1990);
  expect(f.snapshot().level).toBe(1);
  const ctx: any = { state: f.state, profile: f.profile, baseWeeks: f.state.plan.weeks, goals: [], planMeta: f.state.plan.meta, today: READINESS24_TODAY, now: Date.parse(READINESS24_TODAY + 'T10:00:00Z') };
  expect(converse(ctx, {}, 'Wie ist meine Ampel?').reply.text).toMatch(/gelb/i);
});
test('adult sleep boundary and persisted correction follow the actual readiness rules', () => {
  const f = seeded(); const before = f.snapshot();
  f.point.sleepHours = 6.5; expect(f.snapshot().level).toBe(0);
  f.point.sleepHours = 8.5; expect(f.snapshot().level).toBe(0);
  expect(f.snapshot().version).not.toBe(before.version);
});
