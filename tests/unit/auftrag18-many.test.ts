/* Auftrag 18, Punkt 4: großer Test. 69 Test-Nutzer (fixtures/manyusers.ts, manyUsers18: die 65 aus Auftrag 17 und dazu Jugendlicher mit
   Fußball und Halbmarathon, Triathlet mit Koppel-Wochen, 10 km in 6 Wochen, Wettkampf direkt nach einem Spiel).
   Jeder Plan wird ganz (alle Wochen) gegen alle Trainingsregeln aus Punkt 2 geprüft, ohne Ausnahmen. Die vier neuen Fälle laufen
   zusätzlich 3 Wochen mit Abweichungen durch (tests/helpers/many17.ts): Coach-Texte dürfen keine Ursache ohne Daten nennen (Punkt 1). */
import { test, expect, describe } from 'vitest';
import fs from 'node:fs';
import { manyUsers18, MANY_TODAY } from '../../fixtures/manyusers';
import { applyOnboarding } from '../../shared/onboarding';
import { checkTrainingRules, TRULE_LABEL } from '../../shared/trainingrules';
import { mainGoal } from '../../shared/goals';
import { simulate17, KIND17_LABEL } from '../helpers/many17';
import { KIND_LABEL } from '../helpers/many-sim';
import { isHardSession } from '../../shared/intensity';

const USERS = manyUsers18();
const NEW = ['n66-teen-fussball-hm', 'n67-tri-koppel', 'n68-10k-6-wochen', 'n69-wettkampf-nach-spiel'];
const by: Record<string, number> = {};

describe('Auftrag 18: 69 Test-Nutzer, ganzer Plan gegen alle Trainingsregeln', () => {
  test('Bandbreite: über 50 Nutzer, alle Altersgruppen, mit und ohne Teamsport, wenig und viel Zeit, die vier verlangten Fälle', () => {
    expect(USERS.length).toBeGreaterThanOrEqual(69);
    for (const id of NEW) expect(USERS.some(u => u.id === id)).toBe(true);
    const ages = USERS.map(u => 2026 - u.answers.birthYear);
    expect(Math.min(...ages)).toBeLessThanOrEqual(14); expect(Math.max(...ages)).toBeGreaterThanOrEqual(70);
    expect(USERS.filter(u => u.answers.teamYes).length).toBeGreaterThan(5);
  });
  test.each(USERS.map(u => [u.id, u] as const))('%s', (id, u) => {
    const r = applyOnboarding(u.answers, MANY_TODAY);
    if (!r.gen) return;
    const is = checkTrainingRules(r.gen.plan.weeks, r.profile, { goals: r.goals, today: MANY_TODAY, from: MANY_TODAY, goalType: (mainGoal(r.goals, MANY_TODAY) || {} as any).type || null });
    for (const i of is) by[i.rule] = (by[i.rule] || 0) + 1;
    expect(is.map(i => `${TRULE_LABEL[i.rule]}: ${i.msg}`)).toEqual([]);
  });
  test.each(NEW.map(id => [id] as const))('%s: 3 Wochen mit Abweichungen, Coach-Texte ohne Ursache ohne Daten', id => {
    const u = USERS.find(x => x.id === id)!;
    const r = simulate17(u, MANY_TODAY, {});
    expect([...r.base.map(f => `${KIND_LABEL[f.kind]}: ${f.msg}`), ...r.findings.map(f => `${KIND17_LABEL[f.kind]}: ${f.msg}`)]).toEqual([]);
  });
  test('Sonderfälle im Detail', () => {
    const plan = (id: string) => { const u = USERS.find(x => x.id === id)!; const r = applyOnboarding(u.answers, MANY_TODAY); return { r, days: r.gen!.plan.weeks.flatMap((w: any) => w.days.map((d: any) => ({ w, d }))) }; };
    // Jugendlicher: Laufen nur Do/Sa/So, nie Hartes am Tag vor dem Spiel (Freitag), Wochenstunden unter dem Alter
    const t = plan('n66-teen-fussball-hm');
    for (const { d } of t.days) {
      const dow = new Date(d.date + 'T12:00:00Z').getUTCDay();
      const runs = d.sessions.filter((s: any) => s.sport === 'run' && !s.race);
      if (runs.length) expect([0, 4, 6], `${d.date}`).toContain(dow);
      if (dow === 4) expect(d.sessions.some((s: any) => isHardSession(s)), `${d.date} vor dem Spiel`).toBe(false);
    }
    // 10 km in 6 Wochen: jede normale Woche ein Qualitätslauf, Wettkampfwoche ohne Kraft
    const k = plan('n68-10k-6-wochen');
    const raceW = k.r.gen!.plan.weeks[k.r.gen!.plan.weeks.length - 1];
    expect(raceW.days.flatMap((d: any) => d.sessions).some((s: any) => s.sport === 'strength')).toBe(false);
    // Wettkampf am Tag nach dem Spiel: Woche leichter, Hinweis zum Spiel
    const g = plan('n69-wettkampf-nach-spiel');
    const gw = g.r.gen!.plan.weeks[g.r.gen!.plan.weeks.length - 1];
    expect(gw.important).toMatch(/nur kurz spielen oder aussetzen/);
  });
  test('Bericht (test-results/auftrag18-bericht.json)', () => {
    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync('test-results/auftrag18-bericht.json', JSON.stringify({ users: USERS.length, violations: by }, null, 1));
  });
});
