/* Auftrag 30, Punkt 8: Langzeit-Simulation mit 30 erfundenen Nutzern über 3–6 Monate (Pflicht vor jedem Release, läuft in npm test).
   „Anders gemacht“ in allen Arten, App-Anpassungen, Bestwert/Tageswert im Coach, neue Regeln (Erholungstiefe, Kraft, harte Tage).
   Drehen und App-Wechsel laufen im Browser-Test tests/e2e/auftrag30-rueckkehr.spec.ts (mit Langzeit-Daten). */
import { describe, test, expect } from 'vitest';
import { users30, simulate30 } from '../helpers/longterm30';

describe('Langzeit-Simulation Auftrag 30 (30 erfundene Nutzer, 3–6 Monate)', () => {
  const all = users30();
  test('30 Nutzer', () => { expect(all.length).toBe(30); expect(all.every(u => u.weeks >= 13 && u.weeks <= 26)).toBe(true); });
  for (const u of all) test(`${u.id}: ${u.weeks} Wochen`, async () => {
    const r = await simulate30(u);
    console.info('LT30', JSON.stringify({ ...r, strengthBase: undefined }));
    expect(r.failures).toEqual([]);
    expect(r.days).toBe(u.weeks * 7);
    expect(Object.values(r.changed).reduce((a, b) => a + b, 0)).toBeGreaterThan(5);
    expect(r.adjustments + r.replans).toBeGreaterThan(0);
  }, 300_000);
});
