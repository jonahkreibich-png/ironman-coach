/* Auftrag 5 A4: Die Engine verschiebt verpasste Einheiten nie gegen die Regeln der Person. */
import { test, expect } from 'vitest';
import * as C from '../../shared/core';

const A = C.addDays;
function plan() {
  const mon = '2026-10-12';
  return [{ weekNumber: 1, label: 'Woche 1', startDate: mon, endDate: A(mon, 6), days: [
    { date: mon, sessions: [{ id: 'mo', sport: 'rest', title: 'Ruhetag' }] },
    { date: A(mon, 1), sessions: [{ id: 'di', sport: 'bike', title: 'Sweet-Spot 3×8', zone: 'Zone 3-4', plannedMinutes: 60 }] },
    { date: A(mon, 2), sessions: [{ id: 'mi', sport: 'rest', title: 'Ruhetag' }] },
    { date: A(mon, 3), sessions: [{ id: 'do', sport: 'rest', title: 'Ruhetag' }] },
    { date: A(mon, 4), sessions: [{ id: 'fr', sport: 'run', title: 'Locker', zone: 'Zone 2', plannedMinutes: 40 }] },
    { date: A(mon, 5), sessions: [{ id: 'sa', sport: 'rest', title: 'Ruhetag' }] },
    { date: A(mon, 6), sessions: [{ id: 'so', sport: 'run', title: 'Langer Lauf', zone: 'Zone 2', plannedMinutes: 90 }] }
  ] }];
}
const base = (notes: string[]) => ({ sessions: {}, trend: [], illnessPeriods: [], adjustments: {}, settings: {}, profile: { notes, thresholds: {} } });

test('ohne Regel: verpasste Schlüsseleinheit vom Dienstag rutscht auf Donnerstag (heute ohne grüne Ampel nicht)', () => {
  const adj = C.dailyAdjustments(base([]), plan(), '2026-10-14', { now: 1 });
  expect(adj.find((a: any) => a.type === 'move')).toMatchObject({ sessionId: 'di', to: '2026-10-15' });
});
test('„Rad nie Mi und Do“: die Engine verschiebt nicht auf einen verbotenen Tag', () => {
  const adj = C.dailyAdjustments(base(['Rad nie am Mittwoch und Donnerstag']), plan(), '2026-10-14', { now: 1 });
  expect(adj.filter((a: any) => a.type === 'move')).toEqual([]);
});
test('„donnerstags gar nichts“: auch kein Verschieben auf Donnerstag', () => {
  const adj = C.dailyAdjustments(base(['donnerstags gar nichts']), plan(), '2026-10-14', { now: 1 });
  expect(adj.find((a: any) => a.type === 'move' && a.to === '2026-10-15')).toBeUndefined();
});
test('Tagesgrenze: kein Verschieben, wenn der Tag dann zu lang würde', () => {
  const adj = C.dailyAdjustments(base(['Mo-Fr höchstens 45 min']), plan(), '2026-10-14', { now: 1 });
  expect(adj.filter((a: any) => a.type === 'move')).toEqual([]);
});
test('ruleOk: harte Regel und Tagesgrenze', () => {
  const rules = [{ id: 'x', kind: 'onlyDays', strength: 'hard', sport: 'run', days: [6, 0] }] as any;
  expect(C.ruleOk(rules, { sport: 'run', plannedMinutes: 40 }, '2026-10-14', [])).toBe(false);
  expect(C.ruleOk(rules, { sport: 'run', plannedMinutes: 40 }, '2026-10-17', [])).toBe(true);
  expect(C.ruleOk(rules, { sport: 'bike', plannedMinutes: 40 }, '2026-10-14', [])).toBe(true);
});
