/* Auftrag 36: ein Teil (Shard) der großen Simulation – Vitest verteilt Dateien auf Worker, darum je Teil eine kleine Datei (tests/sim). */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import { users36, simulate36 } from './sim36';

export const SIM36_SHARDS = 18;
export function sim36Shard(n: number) {
  const ONLY = process.env.SIM36_ONLY ? new Set(process.env.SIM36_ONLY.split(',')) : null;
  // lange Nutzer zuerst verteilen, damit alle Teile etwa gleich lange brauchen
  const all = users36().map((u, i) => ({ u, i })).sort((a, b) => b.u.weeks - a.u.weeks || a.i - b.i).map(x => x.u);
  const mine = all.filter((u, i) => i % SIM36_SHARDS === n && (!ONLY || ONLY.has(u.id)));
  describe(`Auftrag 36: große Simulation, Teil ${n + 1}/${SIM36_SHARDS}`, () => {
    if (n === 0) test('mindestens 30 verschiedene Nutzer, 12–24 Monate', () => { const u = users36(); expect(u.length).toBeGreaterThanOrEqual(30); expect(u.every(x => x.weeks >= 52 && x.weeks <= 104)).toBe(true); });
    for (const u of mine) test(`${u.id}: ${u.weeks} Wochen`, async () => {
      const t0 = Date.now();
      const r = await simulate36(u);
      fs.mkdirSync('test-results/sim36', { recursive: true });
      fs.writeFileSync(`test-results/sim36/${u.id}.json`, JSON.stringify({ ...r, label: u.label, weeks: u.weeks, wallMs: Date.now() - t0 }, null, 1));
      expect(r.failures).toEqual([]);
      expect(r.dcNight).toEqual({});
      expect(r.dcAfter).toEqual({});
      expect(r.days).toBe(u.weeks * 7);
    }, 1_800_000);
  });
}
