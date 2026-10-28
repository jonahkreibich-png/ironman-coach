import { describe, test, expect } from 'vitest';
import { daySummary, weekSummary } from '../../shared/plan-summary26';
const day = () => ({ date: '2026-10-26', sessions: [{ id: 'swim', sport: 'swim', title: 'Swim', plannedMinutes: 60 }, { id: 'run', sport: 'run', title: 'Run', plannedMinutes: 40 }] });
const state = () => ({ sessions: {} as any, customWorkouts: {} as any, activities: {} as any });
describe('current day summary', () => {
  test('updates active planned minutes 100 -> 40 -> 70 without changing actual data', () => {
    const d = day(), s = state();
    expect(daySummary(d, s).plannedMinutes).toBe(100);
    s.sessions.swim = { skipped: true, metrics: { min: 12 } };
    expect(daySummary(d, s).plannedMinutes).toBe(40);
    s.customWorkouts[d.date] = [{ id: 'bike', title: 'Extra bike', sport: 'bike', completed: false, plannedMinutes: 30, metrics: { min: 99 } }];
    const snapshot = JSON.stringify(s), summary = daySummary(d, s);
    expect(summary.plannedMinutes).toBe(70);
    expect(summary.upcoming.map(x => x.id)).toEqual(['run', 'bike']);
    expect(summary.actualMinutes).toBe(0);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
  test('preserves cancelled history but excludes removed, moved-away and failed sessions from upcoming', () => {
    const d: any = day(), s = state();
    d.sessions[0].cancelled = true;
    d.sessions.push({ id: 'gone', sport: 'bike', removed: true, plannedMinutes: 90 });
    d.sessions.push({ id: 'moved', sport: 'bike', movedTo: '2026-11-02', plannedMinutes: 30 });
    s.sessions.run = { skipped: true };
    expect(daySummary(d, s).upcoming).toEqual([]);
    expect(daySummary(d, s).planned.map(x => x.id)).toEqual(['swim', 'run']);
  });
  test('separates completed legacy extras and actual metrics from custom drafts', () => {
    const d = day(), s = state();
    s.sessions.swim = { completed: true, activityId: 'a', metrics: { min: '55,5' } };
    s.customWorkouts[d.date] = [{ id: 'duplicate', activityId: 'a', sport: 'swim', metrics: { min: 55.5 } }, { id: 'extra', sport: 'strength', metrics: { min: 20 } }, { id: 'draft', sport: 'bike', completed: false, plannedMinutes: 30, metrics: { min: 90 } }];
    s.activities.a = { id: 'a', min: 60 };
    const summary = daySummary(d, s);
    expect(summary.actualMinutes).toBe(75.5);
    expect(summary.extras.map(x => x.id)).toEqual(['extra', 'draft']);
    expect(summary.upcoming.map(x => x.id)).toEqual(['run', 'draft']);
    expect(summary.plannedMinutes).toBe(130);
  });
  test('does not invent actual minutes from planned time; unknown planned time stays explicit', () => {
    const s = state(); s.sessions.done = { completed: true };
    const summary = daySummary({ date: '2026-10-26', sessions: [{ id: 'done', sport: 'run', plannedMinutes: 40 }, { id: 'unknown', sport: 'swim' }] }, s);
    expect(summary.actualMinutes).toBe(0);
    expect(summary.unknownActualMinutes).toBe(1);
    expect(summary.unknownPlannedMinutes).toBe(1);
  });
});


test('deduplicates imported activities through mergedInto chains and preserves corrections', () => {
  const d = day(), s = state();
  s.sessions.swim = { completed: true, activityId: 'original', metrics: { min: 50 } };
  s.activities.original = { id: 'original', mergedInto: 'middle' };
  s.activities.middle = { id: 'middle', mergedInto: 'final' };
  s.activities.final = { id: 'final', min: 55 };
  s.customWorkouts[d.date] = [{ id: 'same', activityId: 'final', sport: 'swim', metrics: { min: 55 } }];
  expect(daySummary(d, s).actualMinutes).toBe(50);
  expect(daySummary(d, s).extras).toEqual([]);
});

test('legacy manually added prescribed extra increases Soll while its measured duration remains Ist', () => {
  const d = day(), s = state();
  s.sessions.swim = { skipped: true };
  s.customWorkouts[d.date] = [{ id: 'manual', sport: 'bike', plannedMinutes: 30, metrics: { min: 27 } }];
  const summary = daySummary(d, s);
  expect(summary.plannedMinutes).toBe(70);
  expect(summary.actualMinutes).toBe(27);
  expect(summary.active.map(x => x.id)).toEqual(['run', 'manual']);
  expect(summary.upcoming.map(x => x.id)).toEqual(['run']);
});

test('manual clear never revives imported minutes and legacy custom logs keep actual semantics', () => {
 const d=day(),s=state(); s.sessions.swim={completed:true,activityId:'a',metrics:{},metricsManual:{min:true}};
 s.activities.a={id:'a',min:55};
 s.customWorkouts[d.date]=[{id:'legacy',sport:'bike',plannedMinutes:30}];
 const summary=daySummary(d,s);
 expect(summary.actualMinutes).toBe(30);
 expect(summary.unknownActualMinutes).toBe(1);
 expect(summary.completed.find(x=>x.id==='swim')?.actualMinutes).toBeNull();
});
test('week statistics use the same cancelled and custom source as day summaries', () => {
 const d=day(),s=state(),w={days:[d]};
 expect(weekSummary(w,s).plannedMinutes).toBe(100);
 s.sessions.swim={skipped:true};
 expect(weekSummary(w,s).plannedMinutes).toBe(40);
 s.customWorkouts[d.date]=[{id:'extra',sport:'bike',plannedMinutes:30,metrics:{min:27}}];
 expect(weekSummary(w,s)).toMatchObject({plannedMinutes:70,actualMinutes:27,total:2,done:1,ownPlannedMinutes:70});
});
