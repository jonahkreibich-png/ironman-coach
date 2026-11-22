/* Auftrag 40, Vorschläge 7 und 8: Tests ohne Wettkampfziel; verschobener Test, der nicht mehr in den Plan passt. */
import { test, expect, describe } from 'vitest';
import { manyUsers, MANY_TODAY } from '../../fixtures/manyusers';
import { simulate } from '../helpers/many-sim';
import { analyze } from '../../shared/coach/analysis';
import * as C from '../../shared/core';

function ctxOf(id: string) {
  const u = manyUsers().find(x => x.id === id)!;
  const sim = simulate(u, MANY_TODAY);
  const goals = sim.goals as any[];
  const ctx: any = { today: sim.today, now: Date.parse(sim.today + 'T07:00:00Z'), state: { ...sim.state, profile: sim.profile }, baseWeeks: sim.plan.weeks, planMeta: sim.plan.meta || {}, profile: sim.profile, goals };
  return { sim, ctx };
}
const isTest = (s: any) => !!s && !s.cancelled && ((s.spec && s.spec.kind === 'test') || /test/i.test(s.title || ''));

describe('Vorschlag 7: Fitness-Ziel – alle 8 Wochen ein Test als Vorschlag mit „Übernehmen“', () => {
  /* Läufer mit langen Läufen, Ziel auf „Fitness“ umgestellt (keine Wettkämpfe): der Wochenrhythmus plant keine Tests mehr */
  function fitnessRunner() {
    const { ctx } = ctxOf('n22-run-half');
    ctx.goals = [{ id: 'fit', type: 'fitness', name: 'Fitness', priority: 'A' }];
    const days = C.planDays(C.applyAdjustments(ctx.baseWeeks, ctx.state.adjustments || {}));
    for (const d of days) for (const s of d.sessions) if (isTest(s)) { if (d.date >= ctx.today) s.cancelled = true; else delete ctx.state.sessions[s.id]; }
    ctx.profile.skills = { ...(ctx.profile.skills || {}), runContinuousMin: 90 };
    return { ctx, days };
  }
  test('Zonen geschätzt, nie getestet → Lauftest-Vorschlag, ersetzt einen Lauf ≥ 40 min der nächsten 3 Wochen, mit „Übernehmen“', () => {
    const { ctx } = fitnessRunner();
    ctx.profile.thresholds = { ...ctx.profile.thresholds, estimated: ['lthrRun', 'thresholdPaceRunSec'] };
    const a = analyze(ctx, 'morning');
    const p = a.proposals.find(x => x.id.startsWith('test-due-run'));
    expect(p).toBeTruthy();
    expect(p!.title).toMatch(/^Vorschlag: Lauftest 30 min am \d+\.\d+\.$/);
    expect(p!.text).toMatch(/Lauf-Zonen sind noch geschätzt/);
    const adj = p!.changes[0].data;
    expect(adj.type).toBe('modify'); expect(adj.set.hard).toBe(true);
    expect(a.messages.some((m: any) => m.kind === 'proposal' && m.id === 'msg-ana-prop-' + p!.id)).toBe(true);
  });
  test('letzter Lauftest vor 9 Wochen → Vorschlag; vor 3 Wochen → keiner', () => {
    for (const [ago, want] of [[63, true], [21, false]] as const) {
      const { ctx, days } = fitnessRunner();
      ctx.profile.thresholds = { ...ctx.profile.thresholds, estimated: [] };
      const d = days.find((x: any) => x.date === C.addDays(ctx.today, -ago)) || days.filter((x: any) => x.date < C.addDays(ctx.today, -ago + 3)).pop();
      if (!d) continue;
      const t = { id: 'old-test-' + ago, sport: 'run', title: 'Lauftest 30 min', plannedMinutes: 50, spec: { kind: 'test' } };
      d.sessions.push(t); ctx.state.sessions[t.id] = { completed: true };
      ctx.baseWeeks = ctx.baseWeeks.map((w: any) => ({ ...w, days: w.days.map((x: any) => x.date === d.date ? { ...x, sessions: [...x.sessions.filter((s: any) => s.id !== t.id), t] } : x) }));
      const a = analyze(ctx, 'morning');
      expect(a.proposals.some(x => x.id.startsWith('test-due-run')), ago + ' Tage').toBe(want);
    }
  });
  test('Einsteiger (Laufen am Stück unter 45 min) oder ohne Ausdauersport: kein Test-Vorschlag', () => {
    for (const id of ['n16-fitness', 'n08-fitness']) expect(analyze(ctxOf(id).ctx, 'morning').proposals.some(x => x.id.startsWith('test-due-')), id).toBe(false);
  });
  test('mit Wettkampfziel: kein solcher Vorschlag (der Wochenrhythmus plant die Tests)', () => {
    const { ctx } = ctxOf('n22-run-half');
    const a = analyze(ctx, 'morning');
    expect(a.proposals.some(x => x.id.startsWith('test-due-'))).toBe(false);
  });
});
