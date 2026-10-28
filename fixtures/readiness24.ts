export const READINESS24_TODAY = '2026-10-24';
export const READINESS24_YELLOW_SLEEP = 6;

/** Synthetic adult fixture shared by readiness browser and unit regressions. */
export function readiness24Fixture(d: any): void {
  d.profile = { ...(d.profile || {}), birthYear: 1990 };
  d.activities = {}; d.sessions = {}; d.customWorkouts = {}; d.illnessPeriods = [];
  d.settings = { ...(d.settings || {}), readiness: { rhrMax: 50 }, freeAi: { enabled: false } };
  d.trend = [...Array.from({ length: 8 }, (_, i) => ({ date: new Date(Date.parse(READINESS24_TODAY + 'T12:00:00Z') - (i + 1) * 86400000).toISOString().slice(0, 10), restingHR: 60, _src: { restingHR: 'oura' }, _auto: { restingHR: { oura: 60 } } })), { date: READINESS24_TODAY, restingHR: 55, sleepHours: READINESS24_YELLOW_SLEEP }];
}
