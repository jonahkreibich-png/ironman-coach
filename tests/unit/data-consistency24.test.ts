import { describe, expect, test } from 'vitest';
import * as C from '../../shared/core';
import { defaultProfile } from '../../shared/profile';
import { swimBests } from '../../shared/swimskill';
import { mergeTrendValues, setManual, setSessionMetricManual } from '../../shared/activity/merge';
import { effectiveActivity } from '../../shared/results';

const date = '2026-10-24';
describe('Korrektur und Loeschung synthetischer Ergebnisse', () => {
  test('100 auf 50 m und halbe Dauer erneuern Bestwert, Belastung und CTL/ATL', () => {
    const a: any = { id: 'synthetic-swim', sport: 'swim', source: 'file', date, sessionId: 's', min: 60, km: 1, icuLoad: 120, swim: { longestCrawlM: 100, longestContinuousM: 100 } };
    const weeks = [{ days: [{ date, sessions: [{ id: 's', sport: 'swim', plannedMinutes: 60 }] }] }];
    const st = { completed: true, activityId: a.id, icuLoad: 120, metrics: { min: '60', meters: '1000', longestCrawl: '100' }, metricsAuto: { min: '60', meters: '1000', longestCrawl: '100' }, metricsSrc: { min: 'file', meters: 'file', longestCrawl: 'file' } };
    const state: any = { profile: defaultProfile(), activities: { [a.id]: a }, sessions: { s: st }, customWorkouts: {}, trend: [], settings: {} };
    expect(swimBests(state, weeks, date).best).toBe(100);
    const before = C.dailyLoads(state, weeks)[date];
    state.sessions.s = setSessionMetricManual(setSessionMetricManual(st, 'longestCrawl', '50'), 'min', '30');
    expect(swimBests(state, weeks, date).best).toBe(50);
    expect(C.recordedActivities(state)[0].swim.longestContinuousM).toBe(50);
    expect(C.dailyLoads(state, weeks)[date]).toBeLessThan(before);
    const load = C.dailyLoads(state, weeks)[date];
    expect(C.ownLoadSeries(state, weeks, date)[0]).toMatchObject({ ctl: Math.round(load / 42 * 10) / 10, atl: Math.round(load / 7 * 10) / 10 });
    delete state.sessions.s; delete state.activities[a.id];
    expect(swimBests(state, weeks, date).best).toBe(0);
    expect(C.dailyLoads(state, weeks)).toEqual({});
    expect(C.recordedActivities(state)).toEqual([]);
  });

  test('automatischer Import laesst manuelle CTL und ATL nach einer Korrektur stehen', () => {
    let point = mergeTrendValues(null, date, 'intervals', { ctl: 40, atl: 50 }, {}).point;
    point = setManual(setManual(point, date, 'ctl', 60), date, 'atl', 70);
    point = mergeTrendValues(point, date, 'intervals', { ctl: 20, atl: 30 }, {}).point;
    const state: any = { profile: defaultProfile(), sessions: {}, activities: {}, customWorkouts: {}, trend: [point], settings: {} };
    expect(C.ownLoadSeries(state, [], date)[0]).toMatchObject({ ctl: 60, atl: 70, tsb: -10 });
  });

  test('manuelle Spitzenleistung und Schwimmfrequenz erreichen dieselbe effektive Aufzeichnung', () => {
    const a: any = { sport: 'bike', maxPower: 900, maxCadence: 150 };
    const corrected = effectiveActivity(a, { metrics: { maxPower: '400', maxCadence: '110' }, metricsSrc: { maxPower: 'manual', maxCadence: 'manual' } });
    expect(corrected).toMatchObject({ maxPower: 400, maxCadence: 110 });
    const swim = effectiveActivity({ sport: 'swim', swim: { strokeRate: 60 } }, { metrics: { rate: '40' }, metricsSrc: { rate: 'manual' } });
    expect(swim.swim.strokeRate).toBe(40);
  });
});
