import { expect, test } from 'vitest';
import { extendPlan } from '../../shared/replan';
import { defaultProfile, withEstimates } from '../../shared/profile';
import { checkIntensity, isHardSession } from '../../shared/intensity';
import { checkPlanRules } from '../../shared/planrules';
import * as C from '../../shared/core';

test('extension keeps a hard Sunday exact and makes the generated Monday easy across sports', () => {
  const today = '2026-11-01';
  const profile = withEstimates({ ...defaultProfile(), birthYear: 1985, experienceYears: 5,
    sports: ['bike', 'run'], weeklyHours: 8,
    dayLoad: { 0: 2, 1: 2, 2: 0, 3: 0, 4: 2, 5: 0, 6: 0 }, freq: { bike: [2, 2], run: [1, 1] },
    weekPattern: { slots: [{ dow: 1, sport: 'bike', role: 'key', keyFrom: '2026-01-01', min: [60, 60] }, { dow: 4, sport: 'run', role: 'easy', min: [45, 45] }] },
  } as any, today);
  const plan: any = { meta: {}, weeks: [{ weekNumber: 1, startDate: '2026-10-26', endDate: today, phase: 'base',
    days: Array.from({ length: 7 }, (_, i) => ({ date: C.addDays('2026-10-26', i), sessions: i === 6 ? [{
      id: 'existing-hard-sunday', sport: 'run', title: 'Schwelle', hard: true, plannedMinutes: 45, zone: 'Zone 4', locked: true,
    }] : [] })),
  }] };
  const before = JSON.stringify(plan);
  const next = extendPlan(plan, profile, [{ id: 'next', type: 'bike_event', name: 'SIMULATED ride', date: '2027-05-30', priority: 'A' }], today)!;
  expect(next).toBeTruthy(); expect(JSON.stringify(plan)).toBe(before); expect(next.weeks[0]).toEqual(plan.weeks[0]);
  const monday = next.weeks[1].days[0].sessions.find((s: any) => s.sport === 'bike');
  expect(monday).toBeTruthy(); expect(isHardSession(monday)).toBe(false);
  expect(monday.plannedMinutes).toBeLessThanOrEqual(60);
  expect(monday.description).toContain('harten');
  expect(checkIntensity(next.weeks.slice(0, 2), profile, today).filter(i => i.rule === 'adjacent')).toEqual([]);
  expect(checkPlanRules(next.weeks.slice(0, 2), profile)).toEqual([]);
  expect(next.meta.ruleFixes.some((s: string) => s.includes('zwei harte Tage hintereinander'))).toBe(true);
});
