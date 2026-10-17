/* Auftrag 15, Punkt 5: großer Test mit 60 unterschiedlichen Test-Nutzern (fixtures/manyusers.ts). Jeder wird komplett durchgespielt:
   Fragebogen → Plan → 3 Wochen (erledigt, ausgelassen, Extra-Einheiten, Morgenwerte, Krankheit) → Coach (Engine + Fragen) → Profil ändern und
   neu planen → Scores, Prognose, Ampel. Automatisch geprüft (tests/helpers/many-sim.ts): nur gewählte Sportarten, keine gleiche Sportart an
   Folgetagen ohne Begründung, nie zwei harte Tage hintereinander, Umfang passt zu Zeit und Niveau (auch Erholungswochen), realistische
   Meter/Zeit, Intensität je Phase, keine widersprüchlichen Texte, Fachbegriffe erklärt, Coach schlägt keine fremde Sportart vor, Scores,
   Prognose und Ampel gültig, Neuplanen behält Erledigtes. Bildschirm, Konsole und Betreiber-Infos prüft tests/e2e/auftrag15-many.spec.ts. */
import { test, expect, describe } from 'vitest';
import fs from 'node:fs';
import { manyUsers, MANY_TODAY } from '../../fixtures/manyusers';
import { simulate, KIND_LABEL, type Finding } from '../helpers/many-sim';

const USERS = manyUsers();
/* Bekannte Grenzen (Intensität je Phase), weil es keinen Tag für eine harte Einheit gibt:
   n26: 65 J., Olympisch, Spiele samstags, nur Di/Mi/Do/Sa/So Zeit – nach der Profil-Änderung liegt die lange Ausfahrt sonntags direkt nach dem Spiel.
   n48: Einsteigerin Sprint, nur Sa/So Zeit – nach der Änderung 1 von 2 Wochen mit Tempolauf.
   n50: 66 J., Rad-Event, Handball Di/Do und Spiel Sa, „kann mittwochs nicht“: Freitag ist der Tag vor dem Spiel, Montag liegt nach der langen
        Sonntagsausfahrt und muss nach der Abstandsregel locker sein. Das Spiel ist der harte Reiz der Woche. */
const KNOWN: Record<string, string[]> = { 'n26-tri-olympic': ['intensity'], 'n48-tri-sprint': ['intensity'], 'n50-bike-event': ['intensity'] };

describe('Auftrag 15: 60 Test-Nutzer komplett durchgespielt', () => {
  const all: Finding[] = [];
  test('mindestens 50 Nutzer mit großer Bandbreite', () => {
    expect(USERS.length).toBeGreaterThanOrEqual(50);
    const ages = USERS.map(u => 2026 - u.answers.birthYear);
    expect(Math.min(...ages)).toBeLessThanOrEqual(14); expect(Math.max(...ages)).toBeGreaterThanOrEqual(75);
    const types = new Set(USERS.map(u => u.answers.goals[0].type));
    for (const t of ['fitness', 'run_5k', 'run_10k', 'run_half', 'run_marathon', 'tri_supersprint', 'tri_sprint', 'tri_olympic', 'tri_middle', 'tri_long', 'bike_event', 'swim_goal']) expect(types).toContain(t);
    const combos = new Set(USERS.map(u => [...u.answers.sports].sort().join('+')));
    expect(combos.size).toBeGreaterThanOrEqual(15);
    for (const sp of ['run', 'bike', 'swim']) expect(USERS.some(u => !u.answers.sports.includes(sp))).toBe(true);
    expect(USERS.some(u => u.answers.sports.length === 1)).toBe(true);
    expect(USERS.some(u => u.answers.teamYes && u.answers.teamGames)).toBe(true);
    expect(USERS.some(u => u.answers.teamYes && !u.answers.teamGames)).toBe(true);
    expect(USERS.some(u => u.teen && !u.answers.weightKg && /abnehmen/.test(u.answers.why))).toBe(true);
    for (const c of ['yes', 'some', 'no']) expect(USERS.some(u => u.answers.swimCrawl === c)).toBe(true);
    expect(USERS.some(u => u.answers.poolM === '50')).toBe(true);
    expect(USERS.some(u => u.ill)).toBe(true);
    expect(USERS.some(u => /Knie|Achilles|Schulter|Rücken/.test(u.answers.injuries))).toBe(true);
  });
  test.each(USERS.map(u => [u.id, u] as const))('%s', (id, u) => {
    const r = simulate(u, MANY_TODAY);
    all.push(...r.findings);
    const bad = r.findings.filter(f => !(KNOWN[id] || []).includes(f.kind));
    expect(bad.map(f => `${KIND_LABEL[f.kind]}: ${f.msg}`)).toEqual([]);
  });
  test('Bericht (test-results/auftrag15-bericht.json)', () => {
    fs.mkdirSync('test-results', { recursive: true });
    const by: Record<string, string[]> = {};
    for (const f of all) (by[f.kind] = by[f.kind] || []).includes(f.user) || by[f.kind].push(f.user);
    fs.writeFileSync('test-results/auftrag15-bericht.json', JSON.stringify({ users: USERS.length, byKind: by, findings: all }, null, 1));
    expect(USERS.length).toBe(60);
  });
});
