/* Auftrag 17, Punkt 7: Befunde aus dem großen Test (tests/unit/auftrag17-many.test.ts) als feste Tests. */
import { describe, expect, test } from 'vitest';
import * as C from '../../shared/core';
import * as W from '../../shared/workouts';
import { applyOnboarding } from '../../shared/onboarding';
import { swimBests, swimSkillUpdate } from '../../shared/swimskill';
import { manyUsers17, MANY_TODAY } from '../../fixtures/manyusers';

const U = manyUsers17();
const ans = (id: string) => JSON.parse(JSON.stringify(U.find(u => u.id === id)!.answers));

describe('Auftrag 17: Befunde aus dem großen Test', () => {
  test('„kann nicht kraulen“ mit alter Meterangabe: kein Können, keine „Bestätigt“-Nachricht ohne Nachweis', () => {
    const r = applyOnboarding(ans('n65-widerspruechlich'), MANY_TODAY);
    expect(r.profile.skills.swimCrawl).toBe('no');
    expect(r.profile.skills.swimCrawlM ?? null).toBeNull();
    // auch ein Profil, in dem die Zahl schon steht: die Kraul-Art steigt nicht ohne eingetragenen Nachweis
    const p = { ...r.profile, skills: { ...r.profile.skills, swimCrawlM: 400 } };
    const st: any = { sessions: {}, customWorkouts: {}, activities: {}, adjustments: {} };
    const up = swimSkillUpdate(p, r.gen!.plan.weeks, {}, MANY_TODAY, swimBests(st, r.gen!.plan.weeks, MANY_TODAY), 1);
    expect(up && up.skills.swimCrawl).not.toBe('yes');
    expect(up ? up.text : '').not.toMatch(/Bestätigt/);
  });
  test('empfindliche Schulter: keine Paddles im Plan und kein Hinweis auf Paddles, die es nicht gibt', () => {
    const a = ans('n38-tri-sprint'); expect(a.injuries).toMatch(/Schulter/);
    for (const gear of [['board', 'buoy'], ['board', 'buoy', 'paddles']]) {
      const r = applyOnboarding({ ...a, swimGear: gear }, MANY_TODAY);
      const swims = C.planDays(r.gen!.plan.weeks).flatMap((d: any) => d.sessions).filter((s: any) => s && s.sport === 'swim');
      expect(swims.length).toBeGreaterThan(5);
      for (const s of swims) expect(`${s.title}\n${s.description}\n${s.tip || ''}`, s.title).not.toMatch(/Paddles/);
    }
  });
  test('harte Einheiten werden beim Kürzen nicht unter 25 min gekürzt', () => {
    const ctx = { runThrSec: 300 } as W.PaceCtx;
    const s = W.build(W.runIntervals(ctx, 5, 4, 2, 4));
    expect(s.plannedMinutes).toBeGreaterThanOrEqual(40);
    const r = W.rebuildScaled({ ...s, sport: 'run' }, 0.3);
    expect(r.plannedMinutes).toBeGreaterThanOrEqual(25);
    // lockere Einheiten dürfen weiter kürzer werden
    const e = W.build(W.runEasy(ctx, 40));
    expect(W.rebuildScaled({ ...e, sport: 'run' }, 0.4).plannedMinutes).toBeLessThan(25);
  });
});
