import { afterEach, expect, test, vi } from 'vitest';
import { todayStr } from '../../web/src/util';
import { readinessDate } from '../../shared/readiness';
import { berlinParts } from '../../server/src/store';

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
for (const [utc, day] of [
  ['2026-10-24T22:30:00Z', '2026-10-25'],
  ['2026-10-25T23:30:00Z', '2026-10-26'],
  ['2027-03-28T22:30:00Z', '2027-03-29']
]) test(`Heute, Coach und Server haben bei ${utc} denselben Trainingstag trotz Gerätezeitzone`, () => {
  vi.stubEnv('TZ', 'America/Los_Angeles'); vi.useFakeTimers(); vi.setSystemTime(new Date(utc));
  expect(readinessDate()).toBe(day); expect(todayStr()).toBe(day); expect(berlinParts().date).toBe(day);
});
