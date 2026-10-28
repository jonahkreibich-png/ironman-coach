/* Auftrag 21, Punkt 8: Langzeit-Simulation mit 36 erfundenen Nutzern über 13-26 Wochen (siehe tests/helpers/longterm21.ts).
   Jede gefundene Fehlerart wird im allgemeinen Code behoben; dieser Test hält das dauerhaft fest. */
import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import { ltUsers, simulateLongterm21, type LtResult } from '../helpers/longterm21';

const results: LtResult[] = [];
describe('Auftrag 21: Langzeit-Simulation (36 erfundene Nutzer)', () => {
  const users = ltUsers();
  test('mindestens 30 Nutzer, 3-6 Monate, gemischte Fälle', () => {
    expect(users.length).toBeGreaterThanOrEqual(30);
    expect(Math.min(...users.map(u => u.weeks))).toBeGreaterThanOrEqual(13);
    expect(Math.max(...users.map(u => u.weeks))).toBeLessThanOrEqual(26);
    expect(users.some(u => u.watch) && users.some(u => !u.watch)).toBe(true);
    expect(users.some(u => (u.answers.swimGear || []).length) && users.some(u => u.answers.sports.includes('swim') && !(u.answers.swimGear || []).length)).toBe(true);
  });
  for (const u of users) test(u.id, async () => {
    const r = await simulateLongterm21(u);
    results.push(r);
    expect(r.failures).toEqual([]);
  }, 300_000);
  test('Bericht schreiben', () => {
    if (process.env.LT21_REPORT) fs.writeFileSync(process.env.LT21_REPORT, JSON.stringify(results, null, 1));
    expect(results.length).toBe(users.length);
  });
});
