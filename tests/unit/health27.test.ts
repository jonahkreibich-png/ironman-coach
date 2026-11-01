/* Auftrag 27: gemeinsamer Ablauf für krank / wieder gesund / doch noch krank / wieder schmerzfrei (shared/coach/ops), für Heute und Coach. */
import { test, expect } from 'vitest';
import { applyOps, undoOps, activeInjury, type Op } from '../../shared/coach/ops';
import * as C from '../../shared/core';

const TODAY = '2026-11-01', Y = '2026-10-31';
function store(state: any, profile: any = {}) {
  const s: any = { state, profile, goals: {}, saveProfile(p: any) { s.profile = p; } };
  return s;
}
const run = (s: any, ops: Op[]) => applyOps(s, ops, Date.parse(TODAY + 'T08:00:00Z'), TODAY);

test('wieder gesund beendet alle laufenden Phasen mit gestern, alte und künftige bleiben', () => {
  const s = store({ illnessPeriods: [
    { id: 'alt', start: '2026-10-07', end: '2026-10-12' },
    { id: 'jetzt', start: '2026-10-30', end: null },
    { id: 'doppelt', start: '2026-10-31', end: null },
    { id: 'zukunft', start: '2026-11-10', end: '2026-11-12' }
  ] });
  const r = run(s, [{ op: 'illness-end', date: Y }]);
  expect(s.state.illnessPeriods.map((p: any) => [p.id, p.end])).toEqual([['alt', '2026-10-12'], ['jetzt', Y], ['doppelt', Y], ['zukunft', '2026-11-12']]);
  expect(C.illnessAt(s.state.illnessPeriods, TODAY)).toBeNull();
  expect(C.illnessAt(s.state.illnessPeriods, Y)).not.toBeNull(); // vergangene Krank-Tage bleiben
  expect(r.summary.join(' ')).toContain('Wiedereinstieg ab heute');
  undoOps(s, r.undo);
  expect(s.state.illnessPeriods.filter((p: any) => !p.end).map((p: any) => p.id)).toEqual(['jetzt', 'doppelt']);
});

test('heute begonnen und heute gesund: Phase wird entfernt, Rückgängig stellt sie wieder her', () => {
  const s = store({ illnessPeriods: [{ id: 'heute', start: TODAY, end: null }] });
  const r = run(s, [{ op: 'illness-end', date: Y }]);
  expect(s.state.illnessPeriods).toEqual([]);
  undoOps(s, r.undo);
  expect(s.state.illnessPeriods).toEqual([{ id: 'heute', start: TODAY, end: null }]);
});

test('Rückgängig aus älteren Coach-Nachrichten (illnessEnd als Objekt) funktioniert weiter', () => {
  const s = store({ illnessPeriods: [{ id: 'x', start: '2026-10-20', end: Y }] });
  undoOps(s, { adj: [], illness: [], rules: [], illnessEnd: { id: 'x', prev: null } } as any);
  expect(s.state.illnessPeriods[0].end).toBeNull();
});

test('ich bin krank legt keine zweite offene Phase an', () => {
  const s = store({ illnessPeriods: [{ id: 'offen', start: '2026-10-30', end: null }] });
  run(s, [{ op: 'illness-start', date: TODAY }]);
  expect(s.state.illnessPeriods).toHaveLength(1);
});

test('doch noch krank öffnet die zuletzt beendete Phase', () => {
  const s = store({ illnessPeriods: [{ id: 'a', start: '2026-10-01', end: '2026-10-03' }, { id: 'b', start: '2026-10-25', end: '2026-10-29' }] });
  const r = run(s, [{ op: 'illness-reopen' }]);
  expect(s.state.illnessPeriods.find((p: any) => p.id === 'b').end).toBeNull();
  expect(s.state.illnessPeriods.find((p: any) => p.id === 'a').end).toBe('2026-10-03');
  undoOps(s, r.undo);
  expect(s.state.illnessPeriods.find((p: any) => p.id === 'b').end).toBe('2026-10-29');
});

const weeks = [{ weekNumber: 1, startDate: '2026-10-26', days: [{ date: '2026-10-30', sessions: [] }] }];
test('wieder schmerzfrei: Beschwerde-Regeln und -Notizen weg, selbst eingetragene Regeln bleiben, Schmerz-Notizen davor zählen nicht mehr', () => {
  const pain = { id: 'r1', kind: 'body', body: 'knee', noIntervals: true, source: 'chat', text: 'Knie: Beschwerden seit 30.10.2026' };
  const own = { id: 'r2', kind: 'body', body: 'back', noIntervals: true, source: 'manual', text: 'Rücken schonen' };
  const s = store({ settings: {}, trend: [{ date: '2026-10-30', illness: 'Knie 5/10' }], weekNotes: { 1: 'Leiste 3/10' } }, { rules: [pain, own], notes: [pain.text, 'Rücken schonen'] });
  expect(activeInjury(s.state, s.profile, weeks, TODAY)).toEqual({ part: 'Knie', level: 5, since: '2026-10-30' });
  expect(C.painFlag(s.state, weeks, TODAY)).toBeTruthy();
  const r = run(s, [{ op: 'injury-end' }]);
  expect(r.replan).toBe('Beschwerden vorbei');
  expect(s.profile.rules.map((x: any) => x.id)).toEqual(['r2']);
  expect(s.profile.notes).toEqual(['Rücken schonen']);
  expect(s.state.settings.painClearedOn).toBe(TODAY);
  expect(activeInjury(s.state, s.profile, weeks, TODAY)).toBeNull();
  expect(C.painFlag(s.state, weeks, TODAY)).toBeNull(); // auch die alte Wochennotiz bremst nicht mehr
  // neue Schmerzangabe nach dem Ende zählt wieder
  s.state.trend.push({ date: '2026-11-02', illness: 'Wade 4/10' });
  expect(activeInjury(s.state, s.profile, weeks, '2026-11-02')).toMatchObject({ part: 'Wade', level: 4 });
  s.state.trend.pop();
  undoOps(s, r.undo);
  expect(s.profile.rules.map((x: any) => x.id).sort()).toEqual(['r1', 'r2']);
  expect(s.state.settings.painClearedOn).toBeUndefined();
});

test('Schmerz-Notiz aus dem Coach wird bei Rückgängig wieder entfernt', () => {
  const s = store({ trend: [{ date: TODAY, hrv: 60 }] });
  const r = run(s, [{ op: 'trend-note', text: 'Knie 5/10' }]);
  expect(s.state.trend[0].illness).toBe('Knie 5/10');
  undoOps(s, r.undo);
  expect(s.state.trend[0]).toEqual({ date: TODAY, hrv: 60 });
});
