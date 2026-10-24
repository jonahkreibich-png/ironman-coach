/* Auftrag 20, Punkt 3: großer Test mit 50 neuen Test-Nutzern (fixtures/users20.ts), Fokus Scores (Rolle ohne Watt, wenige Daten, Ausreißer,
   Pausen, Tests, Laufband, GPS-Fehler, ohne Puls) und realistische Dauer (Schwimmen, Intervalle mit Pausen). Alle Funde müssen leer sein.
   Bericht: test-results/auftrag20-gross.json. */
import { test, expect, describe, afterAll } from 'vitest';
import fs from 'node:fs';
import { manyUsers20, MANY20_TODAY } from '../../fixtures/users20';
import { simulate20 } from '../helpers/many20';

const USERS = manyUsers20();
const report: any = { users: USERS.length, findings: {}, swim: { n: 0, min: 0, m: 0 } };

describe('Auftrag 20: 50 neue Test-Nutzer (Scores und Dauer)', () => {
  test('Bandbreite: 50 Nutzer, 10 Daten-Fälle, 5 Ziele', () => {
    expect(USERS.length).toBe(50);
    expect(new Set(USERS.map(u => u.case)).size).toBe(10);
  });
  test.each(USERS.map(u => [u.id, u] as const))('%s', async (id, u) => {
    await new Promise(r => setTimeout(r, 5));
    const r = simulate20(u, MANY20_TODAY);
    report.swim.n += r.stats.swims; report.swim.min += r.stats.swimMin; report.swim.m += r.stats.swimM;
    for (const f of r.findings) { report.findings[f.kind] = (report.findings[f.kind] || 0) + 1; (report.list = report.list || []).push(id + ' | ' + f.kind + ': ' + f.msg); }
    expect(r.plan, 'kein Plan').toBeTruthy();
    expect(r.findings.map(f => `${f.kind}: ${f.msg}`)).toEqual([]);
  }, 180000);
  afterAll(() => { fs.mkdirSync('test-results', { recursive: true }); fs.writeFileSync('test-results/auftrag20-gross.json', JSON.stringify(report, null, 1)); });
});
