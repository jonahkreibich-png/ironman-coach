/* Auftrag 19, Punkt 4: großer Test mit 54 neuen Test-Nutzern (fixtures/users19.ts), komplett durchgespielt (tests/helpers/many19.ts).
   Alle Funde müssen leer sein. Bericht mit Regel-Zählung und Qualität je Phase/Sportart: test-results/auftrag19-gross.json. */
import { test, expect, describe, afterAll } from 'vitest';
import fs from 'node:fs';
import { manyUsers19, MANY19_TODAY } from '../../fixtures/users19';
import { simulate19 } from '../helpers/many19';

const USERS = manyUsers19();
const report: any = { users: USERS.length, findings: {}, rules: {}, quality: {}, weeks: {} };

describe('Auftrag 19: 54 neue Test-Nutzer komplett', () => {
  test('Bandbreite: über 50 Nutzer, alle Ziele, jede Ausstattung, Teamsport ja/nein, wenig/viel Zeit, 14 bis 70 Jahre', () => {
    expect(USERS.length).toBeGreaterThanOrEqual(50);
    for (const d of ['watch', 'manual', 'power', 'hr']) expect(USERS.filter(u => u.device === d).length).toBeGreaterThan(10);
    expect(USERS.filter(u => u.answers.teamYes).length).toBeGreaterThan(10);
    const ages = USERS.map(u => 2026 - u.answers.birthYear);
    expect(Math.min(...ages)).toBeLessThanOrEqual(14); expect(Math.max(...ages)).toBeGreaterThanOrEqual(70);
    expect(new Set(USERS.flatMap(u => u.answers.goals.map((g: any) => g.type))).size).toBeGreaterThanOrEqual(13);
  });
  test.each(USERS.map(u => [u.id, u] as const))('%s', async (id, u) => {
    await new Promise(r => setTimeout(r, 5)); // Vitest kurz Luft lassen (lange Rechnungen am Stück)
    const r = simulate19(u, MANY19_TODAY);
    report.quality[id] = r.quality; report.weeks[id] = r.weeks;
    for (const f of r.findings) { report.findings[f.kind] = (report.findings[f.kind] || 0) + 1; (report.list = report.list || []).push(id + ' | ' + f.kind + ': ' + f.msg); }
    for (const [k, v] of Object.entries(r.rules)) report.rules[k] = (report.rules[k] || 0) + v;
    expect(r.plan, 'kein Plan').toBeTruthy();
    expect(r.findings.map(f => `${f.kind}: ${f.msg}`)).toEqual([]);
  }, 120000);
  afterAll(() => { fs.mkdirSync('test-results', { recursive: true }); fs.writeFileSync('test-results/auftrag19-gross.json', JSON.stringify(report, null, 1)); });
});
