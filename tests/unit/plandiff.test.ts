/* Auftrag 6, Punkt 1: Vorschau „was ändert sich im Plan“ vor dem Übernehmen einer Einstellung */
import { test, expect } from 'vitest';
import * as C from '../../shared/core';
import { planDiff } from '../../shared/plandiff';
import { repairWeek } from '../../shared/repair';
import { parseRules } from '../../shared/ruleparse';

const A = C.addDays;
const mon = '2026-10-12';
const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const L = { sport: (s: string) => ({ run: 'Lauf', bike: 'Rad', swim: 'Schwimmen', strength: 'Kraft' } as any)[s] || s, day: (d: string, _a: string) => DOW[new Date(d + 'T12:00:00Z').getUTCDay()] };
const weeks = (): any[] => [{ weekNumber: 1, startDate: mon, endDate: A(mon, 6), days: [
  { date: mon, sessions: [{ id: 'mo', sport: 'run', title: 'Lockerer Lauf', plannedMinutes: 40 }] },
  { date: A(mon, 1), sessions: [{ id: 'di', sport: 'bike', title: 'Rad', plannedMinutes: 60 }] },
  { date: A(mon, 2), sessions: [{ id: 'mi', sport: 'run', title: 'Lockerer Lauf', plannedMinutes: 45 }] },
  { date: A(mon, 3), sessions: [{ id: 'do', sport: 'swim', title: 'Schwimmen', plannedMinutes: 45 }] },
  { date: A(mon, 4), sessions: [{ id: 'fr', sport: 'rest', title: 'Ruhetag' }] },
  { date: A(mon, 5), sessions: [{ id: 'sa', sport: 'bike', title: 'Lange Ausfahrt', plannedMinutes: 120 }] },
  { date: A(mon, 6), sessions: [{ id: 'so', sport: 'rest', title: 'Ruhetag' }] }
] }];

test('Regel „mittwochs kein Laufen“: Vorschau nennt „Lauf von Mi auf …“ und sonst nichts', () => {
  const rules = parseRules('mittwochs kein Laufen', mon).rules;
  const adj = repairWeek(weeks(), { sessions: {} }, rules, mon);
  const after = C.applyAdjustments(weeks(), Object.fromEntries(adj.map(a => [a.id, a])));
  const d = planDiff(C.planDays(weeks()), C.planDays(after), mon, A(mon, 6), L);
  expect(d).toHaveLength(1);
  expect(d[0].kind).toBe('moved');
  expect(d[0].text).toMatch(/^Lauf von Mi auf (Do|Fr|Sa|So)$/);
});
test('nichts geändert → leere Liste', () => {
  expect(planDiff(C.planDays(weeks()), C.planDays(weeks()), mon, A(mon, 6), L)).toEqual([]);
});
test('neu erzeugter Plan (andere Kennungen): kürzer, entfallen, neu, verschoben', () => {
  const next = weeks();
  next[0].days.forEach(d => d.sessions.forEach((s: any) => { s.id = 'n-' + s.id; }));
  (next[0].days[1].sessions[0] as any).plannedMinutes = 45;            // Rad Di 60 → 45
  next[0].days[3].sessions = [{ id: 'n-kraft', sport: 'strength', title: 'Kraft', plannedMinutes: 30 }] as any; // Schwimmen weg, Kraft neu
  const mi = next[0].days[2].sessions.pop()!; next[0].days[5].sessions.push(mi); // Lauf Mi → Sa
  const d = planDiff(C.planDays(weeks()), C.planDays(next), mon, A(mon, 6), L).map(x => x.text);
  expect(d).toEqual(['Rad Di: 60 → 45 min', 'Lauf von Mi auf Sa', 'Schwimmen Do entfällt', 'Neu: Kraft Do (30 min)']);
});
test('erledigte Einheiten und Tage außerhalb des Fensters zählen nicht', () => {
  const next = weeks(); next[0].days[0].sessions = [];
  expect(planDiff(C.planDays(weeks()), C.planDays(next), mon, A(mon, 6), L, id => id === 'mo')).toEqual([]);
  expect(planDiff(C.planDays(weeks()), C.planDays(next), A(mon, 1), A(mon, 6), L)).toEqual([]);
});
