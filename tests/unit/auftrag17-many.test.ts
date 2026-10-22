/* Auftrag 17, Punkt 7: großer Test mit 65 Test-Nutzern (fixtures/manyusers.ts, manyUsers17). Je Nutzer laufen die Prüfungen von Auftrag 15
   (tests/helpers/many-sim.ts) und zusätzlich die von Auftrag 17 (tests/helpers/many17.ts): keine Dreifach-Tage, harte Einheiten pro Woche,
   klare Namen, nur vorhandene Hilfsmittel, Kraul-Stücke passend zum Können, Soll nie als geschafft behauptet, Stufe nie über dem
   Eingetragenen, Korrekturen neu bewertet. Bildschirme, Konsole und Betreiber-Infos: tests/e2e/auftrag17-many.spec.ts. */
import { test, expect, describe } from 'vitest';
import fs from 'node:fs';
import { manyUsers17, MANY_TODAY } from '../../fixtures/manyusers';
import { simulate17, KIND17_LABEL, type Finding17 } from '../helpers/many17';
import { KIND_LABEL } from '../helpers/many-sim';

const USERS = manyUsers17();
// bekannte Grenzen aus Auftrag 15 (siehe auftrag15-many.test.ts)
const KNOWN: Record<string, string[]> = { 'n26-tri-olympic': ['intensity'], 'n48-tri-sprint': ['intensity'], 'n50-bike-event': ['intensity'] };

describe('Auftrag 17: 65 Test-Nutzer mit Abweichungen und Korrekturen', () => {
  const all: Finding17[] = []; const rows: any[] = [];
  test('Bandbreite inkl. der neuen Fälle', () => {
    expect(USERS.length).toBeGreaterThanOrEqual(65);
    for (const id of ['n61-kraul-25', 'n62-kraul-50', 'n63-tri-fussball', 'n64-auslasser-korrigierer', 'n65-widerspruechlich']) expect(USERS.some(u => u.id === id)).toBe(true);
    expect(USERS.some(u => (u.answers.swimGear || []).length === 0 && u.answers.sports.includes('swim'))).toBe(true);
    expect(USERS.some(u => (u.answers.swimGear || []).length >= 4)).toBe(true);
  });
  test.each(USERS.map(u => [u.id, u] as const))('%s', (id, u) => {
    const r = simulate17(u, MANY_TODAY, { skipper: u.skipper, corrector: u.corrector });
    all.push(...r.findings);
    rows.push({ id, ...r.stats, findings15: r.base.length, findings17: r.findings.length });
    const bad15 = r.base.filter(f => !(KNOWN[id] || []).includes(f.kind)).map(f => `${KIND_LABEL[f.kind]}: ${f.msg}`);
    expect([...bad15, ...r.findings.map(f => `${KIND17_LABEL[f.kind]}: ${f.msg}`)]).toEqual([]);
  });
  test('Bericht (test-results/auftrag17-bericht.json)', () => {
    fs.mkdirSync('test-results', { recursive: true });
    const by: Record<string, string[]> = {};
    for (const f of all) (by[f.kind] = by[f.kind] || []).includes(f.user) || by[f.kind].push(f.user);
    fs.writeFileSync('test-results/auftrag17-bericht.json', JSON.stringify({ users: USERS.length, byKind: by, rows, findings: all }, null, 1));
    expect(rows.reduce((a, r) => a + r.corrections, 0)).toBeGreaterThan(50);
    expect(rows.reduce((a, r) => a + r.swimEntries, 0)).toBeGreaterThan(100);
  });
});
