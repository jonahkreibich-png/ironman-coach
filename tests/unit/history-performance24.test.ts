import { describe, expect, test, afterAll } from 'vitest';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { defaultProfile, withEstimates } from '../../shared/profile';
import { sportScores } from '../../shared/scores';
import { buildContext } from '../../shared/coach/summary';
import * as C from '../../shared/core';

const measurements: any[] = [];
const today = '2036-01-01';
function syntheticHistory(n: number) {
  const profile = withEstimates({ ...defaultProfile(), birthYear: 1990, sports: ['run', 'bike'], weeklyHours: 7, skills: { runContinuousMin: 50, bikeLongestMin: 100 } } as any, today);
  const activities: Record<string, any> = {};
  for (let i = 0; i < n; i++) {
    const run = i % 3 === 0, min = run ? 35 : 50, km = run ? 5 : 18;
    const date = C.addDays(today, -Math.floor((n - 1 - i) / 2));
    const id = 'SYNTHETIC-history-' + i;
    activities[id] = { id, date, sport: run ? 'run' : 'bike', source: 'manual', sources: ['manual'], name: 'Künstliches Testtraining', min, km, avgHr: run ? 145 : 135, avgPower: null, indoor: false, speedKmh: km / min * 60, paceSecKm: run ? min * 60 / km : null, startMs: Date.parse(date + 'T12:00:00Z') + i % 2 * 3600000, laps: [], intervals: null, swim: null, manual: {} };
  }
  const coachMsgs = Object.fromEntries(Array.from({ length: n * 3 }, (_, i) => ['msg-' + i, { id: 'msg-' + i, at: i, date: today, from: 'coach', kind: 'info', text: 'Künstliche historische Testnachricht' }]));
  const state: any = { activities, sessions: {}, customWorkouts: {}, coachMsgs, coachNotes: {}, profile, settings: {}, trend: [], adjustments: {}, illnessPeriods: [] };
  return { profile, state };
}

describe('Wachsende synthetische Historie', () => {
  for (const n of [500, 5000]) test(`${n} Trainings und ${n * 3} Nachrichten: korrekte, begrenzte Auswertung`, () => {
    const { profile, state } = syntheticHistory(n);
    const samples: number[] = []; const phases: any[] = []; const heapStart = process.memoryUsage().heapUsed;
    let result: any;
    for (let pass = 0; pass < 3; pass++) {
      const start = performance.now();
      const acts = C.recordedActivities(state);
      const t1 = performance.now();
      const loads = C.ownLoadSeries(state, [], today);
      const t2 = performance.now();
      const scores = sportScores({ today, activities: acts, trend: [], illness: [], profile, goal: null, settings: {} } as any, ['run', 'bike']);
      const t3 = performance.now();
      const context = buildContext({ today, now: 1, state, profile, baseWeeks: [], goals: [], planMeta: {} });
      const t4 = performance.now();
      phases.push({ activities: Math.round(t1-start), load: Math.round(t2-t1), scores: Math.round(t3-t2), context: Math.round(t4-t3) });
      samples.push(t4 - start);
      result = { acts, loads, scores, context };
    }
    expect(result.acts).toHaveLength(n);
    expect(result.scores.every((s: any) => Number.isFinite(s.score) && s.score >= 0 && s.score <= 120)).toBe(true);
    expect(result.loads.at(-1).date).toBe(today);
    expect(result.context).not.toContain('Künstliche historische Testnachricht');
    expect(result.context.length).toBeLessThan(30000);
    const row = { synthetic: true, trainings: n, messages: n * 3, historyDays: Math.ceil(n / 2), contextChars: result.context.length, phasesMs: phases, samplesMs: samples.map(x => Math.round(x)), medianMs: Math.round([...samples].sort((a,b) => a-b)[1]), heapDeltaMiB: Math.round((process.memoryUsage().heapUsed - heapStart) / 1048576 * 10) / 10, note: 'Node-Laufzeit; Heap-Differenz ist kein Spitzenverbrauch. Keine Browser-/D1-Latenz.' };
    measurements.push(row); console.info('QA24 performance', JSON.stringify(row));
  }, 60000);
  afterAll(() => { fs.mkdirSync('test-results', { recursive: true }); fs.writeFileSync('test-results/qa24-performance.json', JSON.stringify(measurements, null, 2)); });
});
