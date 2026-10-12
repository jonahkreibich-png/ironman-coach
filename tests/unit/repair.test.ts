/* Auftrag 5 A4: Ändert jemand eine Einschränkung, wird die laufende Woche sofort angepasst. */
import { test, expect } from 'vitest';
import * as C from '../../shared/core';
import { repairWeek } from '../../shared/repair';
import { parseRules } from '../../shared/ruleparse';
import { hardViolations } from '../../shared/constraints';

const A = C.addDays;
const mon = '2026-10-12';
const weeks = () => [{ weekNumber: 1, startDate: mon, endDate: A(mon, 6), days: [
  { date: mon, sessions: [{ id: 'mo', sport: 'run', title: 'Lockerer Lauf', plannedMinutes: 40 }] },
  { date: A(mon, 1), sessions: [{ id: 'di', sport: 'bike', title: 'Rad Intervalle 3×10', plannedMinutes: 60, hard: true }] },
  { date: A(mon, 2), sessions: [{ id: 'mi', sport: 'run', title: 'Lockerer Lauf', plannedMinutes: 45 }] },
  { date: A(mon, 3), sessions: [{ id: 'do', sport: 'swim', title: 'Schwimmen', plannedMinutes: 45 }] },
  { date: A(mon, 4), sessions: [{ id: 'fr', sport: 'rest', title: 'Ruhetag' }] },
  { date: A(mon, 5), sessions: [{ id: 'sa', sport: 'bike', title: 'Lange Ausfahrt', plannedMinutes: 120 }] },
  { date: A(mon, 6), sessions: [{ id: 'so', sport: 'rest', title: 'Ruhetag' }] }
] }];

test('neue Regel „mittwochs kein Laufen“ am Dienstag: der Lauf vom Mittwoch rutscht auf einen erlaubten Tag', () => {
  const rules = parseRules('ab jetzt mittwochs kein Laufen', '2026-10-13').rules;
  const adj = repairWeek(weeks(), { sessions: {} }, rules, '2026-10-13');
  expect(adj.length).toBe(1);
  expect(adj[0]).toMatchObject({ type: 'move', sessionId: 'mi', from: '2026-10-14' });
  expect(adj[0].to).not.toBe('2026-10-14');
  expect(adj[0].reason).toBe('Regel „Laufen: nie Mi“');
  const after = C.applyAdjustments(weeks(), Object.fromEntries(adj.map(a => [a.id, a])));
  expect(hardViolations(after, rules, '2026-10-13')).toEqual([]);
});
test('Laufen nur Sa/So: Läufe der Woche wandern aufs Wochenende, Vergangenes bleibt', () => {
  const rules = parseRules('Laufen nur am Wochenende', mon).rules;
  const adj = repairWeek(weeks(), { sessions: { mo: { completed: true } } }, rules, '2026-10-13');
  expect(adj.map(a => a.sessionId)).toEqual(['mi']);
  expect(['2026-10-17', '2026-10-18']).toContain(adj[0].to);
});
test('kein erlaubter Tag frei: Einheit entfällt mit Grund', () => {
  const rules = parseRules('Schwimmbad nur montags', mon).rules;
  const adj = repairWeek(weeks(), { sessions: {} }, rules, '2026-10-13');
  expect(adj).toEqual([expect.objectContaining({ type: 'cancel', sessionId: 'do', reason: 'Regel „Schwimmen: nur Mo“, kein anderer Tag frei' })]);
});
