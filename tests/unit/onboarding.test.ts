import { test, expect } from 'vitest';
import { BLOCKS, missingRequired, progress, prefillFromData, applyOnboarding } from '../../shared/onboarding';

test('Pflichtfragen: nur das Nötigste, mit Stern', () => {
  const req = BLOCKS.flatMap(b => b.questions.filter(q => q.required).map(q => q.id));
  expect(req).toEqual(['goals', 'birthYear', 'injuries', 'sports', 'weeklyHoursNow', 'windows', 'weeklyHours', 'maxDayHours']);
  expect(missingRequired({}).length).toBe(req.length);
});
test('Fragen erscheinen nur, wenn sie passen (Schwimmen, Zyklus)', () => {
  const swim = BLOCKS.find(b => b.id === 'background')!.questions.find(q => q.id === 'swimContinuous')!;
  expect(swim.show!({ sports: ['run'] })).toBe(false);
  expect(swim.show!({ sports: ['swim'] })).toBe(true);
});
test('Was verbundene Dienste wissen, wird vorgeschlagen statt gefragt', () => {
  const acts = [...Array(16)].map((_, i) => ({ date: `2026-09-${String(i + 10).padStart(2, '0')}`, sport: i % 2 ? 'run' : 'swim', min: 45, swim: i % 2 ? null : { longestContinuousM: 600 } }));
  const p = prefillFromData(acts, [{ date: '2026-10-10', sleepHours: 8.2 }], '2026-10-14');
  expect(p.sports.sort()).toEqual(['run', 'swim']); expect(p.weeklyHoursNow).toBe(1.5); expect(p.swimContinuous).toBe(600); expect(p.sleep).toBe(8.2);
});
test('Antworten → Profil, Ziel und Plan mit Einstiegstests', () => {
  const a = { goals: [{ type: 'tri_sprint', name: 'Stadttriathlon', date: '2027-06-13', priority: 'A' }], outcome: 'time', targetTime: '1:25', birthYear: 2008, injuries: 'keine', sports: ['swim', 'bike', 'run', 'football'], teamSportName: 'Fußball', weeklyHoursNow: 5, windows: { 2: [{ from: '06:15', to: '06:55' }], 3: [{ from: '17:00', to: '18:30' }], 4: [{ from: '17:00', to: '18:30' }], 6: [{ from: '09:00', to: '12:00' }], 0: [{ from: '09:00', to: '11:30' }] }, weeklyHours: 7, maxDayHours: 3, fixed: [{ id: 'f', dow: 1, sport: 'football', title: 'Fußballtraining', minutes: 90 }], strength: '1', wantTests: true, medical: false };
  expect(missingRequired(a)).toEqual([]);
  expect(progress(a)).toBeGreaterThan(30);
  const r = applyOnboarding(a, '2026-10-14');
  expect(r.profile.sports).toContain('strength'); expect(r.profile.injuries).toBe('');
  expect(r.goals[0].targetTimeSec).toBe(5100);
  expect(r.gen!.violations).toEqual([]);
  expect(r.gen!.summary).toHaveLength(5);
  const titles = r.gen!.plan.weeks.slice(0, 2).flatMap((w: any) => w.days.flatMap((d: any) => d.sessions.map((s: any) => s.title)));
  expect(titles).toContain('Lauftest 30 min');
  expect(r.gen!.plan.weeks[0].days[0].sessions[0].title).toBe('Fußballtraining');
});
test('Gesundheitliche Einschränkung → Hinweis zur Arztabklärung, vorsichtiger Start', () => {
  const r = applyOnboarding({ goals: [{ type: 'run_10k', name: '10 km', date: '2027-04-01' }], birthYear: 1980, injuries: 'keine', sports: ['run'], weeklyHoursNow: 4, windows: { 1: [{ from: '18:00', to: '19:00' }] }, weeklyHours: 5, maxDayHours: 1.5, medical: true }, '2026-10-14');
  expect(r.warnings[0]).toMatch(/ärztlich/); expect(r.profile.medicalCaution).toBe(true);
});
