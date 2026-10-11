import { test, expect } from 'vitest';
import { BLOCKS, missingRequired, progress, prefillFromData, applyOnboarding, profileFromAnswers, understood, parseDur } from '../../shared/onboarding';

test('Pflichtfragen: nur das Nötigste, mit Stern', () => {
  const req = BLOCKS.flatMap(b => b.questions.filter(q => q.required).map(q => q.id));
  expect(req).toEqual(['goals', 'birthYear', 'injuries', 'sports', 'weeklyHoursNow', 'dayLoad', 'weeklyHours']);
  expect(missingRequired({}).length).toBe(req.length);
  // „kein Training“ an allen Tagen zählt nicht als Antwort
  expect(missingRequired({ dayLoad: { 1: 0, 2: 0 } }).some(m => m.q.id === 'dayLoad')).toBe(true);
});
test('Fragen erscheinen nur, wenn sie passen (Schwimmen, Teamsport)', () => {
  const q = (id: string) => BLOCKS.flatMap(b => b.questions).find(x => x.id === id)!;
  expect(q('swimCrawl').show!({ sports: ['run'] })).toBe(false);
  expect(q('swimCrawl').show!({ sports: ['swim'] })).toBe(true);
  expect(q('swimCrawlM').show!({ sports: ['swim'], swimCrawl: 'no' })).toBe(false);
  expect(q('swimBreast').show!({ sports: ['swim'], swimCrawl: 'no' })).toBe(true);
  expect(q('teamGameDays').show!({ teamYes: false })).toBe(false);
  expect(q('teamGameDays').show!({ teamYes: true })).toBe(true);
  // B1: keine Uhrzeiten mehr
  expect(BLOCKS.flatMap(b => b.questions).some(x => x.type === 'windows' || x.type === 'fixed')).toBe(false);
});
test('Was verbundene Dienste wissen, wird vorgeschlagen statt gefragt', () => {
  const acts = [...Array(16)].map((_, i) => ({ date: `2026-09-${String(i + 10).padStart(2, '0')}`, sport: i % 2 ? 'run' : 'swim', min: 45, swim: i % 2 ? null : { longestContinuousM: 600 } }));
  const p = prefillFromData(acts, [{ date: '2026-10-10', sleepHours: 8.2 }], '2026-10-14');
  expect(p.sports.sort()).toEqual(['run', 'swim']); expect(p.weeklyHoursNow).toBe(1.5); expect(p.swimCrawlM).toBe(600); expect(p.swimCrawl).toBe('yes'); expect(p.runContinuousMin).toBe(45); expect(p.sleep).toBe(8.2);
});
test('Antworten → Profil (Tage, Häufigkeit, Teamsport, Können, Räder), Ziele mit eigener Wunschzeit, Plan mit Einstiegstests', () => {
  const a = { goals: [{ type: 'tri_sprint', name: 'Stadttriathlon', date: '2027-06-13', priority: 'A', targetTime: '1:25' }, { type: 'run_10k', name: '10 km', date: '2026-12-06', priority: 'C', targetTime: '0:48:00' }], birthYear: 1990, injuries: 'keine', sports: ['swim', 'bike', 'run', 'strength'], weeklyHoursNow: 5,
    teamYes: true, teamName: 'Handball', teamTrainingDays: [1], teamTrainingMinutes: 90, teamGameDays: [6], teamGameMinutes: 60,
    dayLoad: { 0: 3, 2: 1, 3: 2, 4: 2, 6: 1 }, weeklyHours: 7, maxDayHours: 3, freq: { swim: [1, 2], run: [2, 3], strength: [1, 1] },
    swimCrawl: 'yes', swimCrawlM: 1000, runContinuousMin: 60, bikes: ['gravel', 'trainer'], powerMeter: true, wantTests: true, medical: false };
  expect(missingRequired(a)).toEqual([]);
  expect(progress(a)).toBeGreaterThan(30);
  const r = applyOnboarding(a, '2026-10-14');
  expect(r.profile.sports).toEqual(expect.arrayContaining(['strength', 'football']));
  expect(r.profile.teamSport).toMatchObject({ name: 'Handball', trainingDays: [1], gameDays: [6] });
  expect(r.profile.dayLoad).toEqual({ 0: 3, 2: 1, 3: 2, 4: 2, 6: 1 });
  expect(r.profile.freq.run).toEqual([2, 3]);
  expect(r.profile.bikes).toEqual(['gravel', 'trainer']); expect(r.profile.powerMeter).toBe(true);
  expect(r.goals.map(g => g.targetTimeSec)).toEqual([5100, 2880]);
  expect(r.gen!.violations).toEqual([]);
  expect(r.gen!.summary).toHaveLength(5);
  const titles = r.gen!.plan.weeks.slice(0, 2).flatMap((w: any) => w.days.flatMap((d: any) => d.sessions.map((s: any) => s.title)));
  expect(titles).toContain('Lauftest 30 min');
  expect(titles).toContain('Handball-Training');
});
test('Zeiten: Bestzeiten als m:ss, lange Distanzen als h:mm, Sekunden aus getrennten Feldern', () => {
  expect(parseDur('6:40', 'ms')).toBe(400);
  expect(parseDur('1:45', 'hm')).toBe(6300);
  expect(parseDur('0:54:30', 'ms')).toBe(3270);
  expect(parseDur(3270, 'ms')).toBe(3270);
  const p = profileFromAnswers({ bests: { run10k: 3270, swim400: '6:40' } }, '2026-10-14').profile;
  expect(p.bests).toEqual({ run10k: 3270, swim400: 400 });
  expect(p.thresholds.thresholdPaceRunSec).toBe(329);
});
test('Gesundheitliche Einschränkung → Hinweis zur Arztabklärung, vorsichtiger Start', () => {
  const r = applyOnboarding({ goals: [{ type: 'run_10k', name: '10 km', date: '2027-04-01' }], birthYear: 1980, injuries: 'keine', sports: ['run'], weeklyHoursNow: 4, dayLoad: { 1: 2 }, weeklyHours: 5, maxDayHours: 1.5, medical: true }, '2026-10-14');
  expect(r.warnings[0]).toMatch(/ärztlich/); expect(r.profile.medicalCaution).toBe(true);
});
test('Alte Antworten (Zeitfenster) funktionieren weiter', () => {
  const r = applyOnboarding({ goals: [{ type: 'run_10k', name: '10 km', date: '2027-04-01' }], birthYear: 1980, injuries: 'keine', sports: ['run'], weeklyHoursNow: 4, windows: { 2: [{ from: '18:00', to: '19:00' }], 6: [{ from: '09:00', to: '11:00' }] }, weeklyHours: 5 }, '2026-10-14');
  expect(missingRequired({ windows: { 2: [{ from: '18:00', to: '19:00' }] } }).some(m => m.q.id === 'dayLoad')).toBe(false);
  expect(r.gen!.plan.weeks.length).toBeGreaterThan(4);
});
test('„Das habe ich verstanden“: ohne Teamsport steht dort kein Fußball', () => {
  const u = understood({ goals: [{ type: 'run_half', name: 'HM', date: '2027-04-01', priority: 'A' }], sports: ['run'], teamYes: false, dayLoad: { 0: 3 } }, '2026-10-14');
  expect(u.find(x => x.label === 'Teamsport')!.text).toBe('kein Teamsport');
  expect(JSON.stringify(u)).not.toMatch(/Fußball|Spieltag/);
});
