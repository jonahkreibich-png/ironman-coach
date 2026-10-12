/* Prüfstand für den Coach-Chat (Auftrag 5 D6): eine Test-Person mit echtem Plan, ein Gespräch wie in der App
   (converse → bei Bestätigung applyOps → bei Bedarf neu planen und laufende Woche an die Regeln anpassen), Rückgängig. */
import { PERSONAS, PERSONA_TODAY } from '../../fixtures/personas';
import { applyOnboarding } from '../../shared/onboarding';
import { converse, type DialogState, type Reply } from '../../shared/coach/dialog';
import { applyOps, undoOps, type Undo } from '../../shared/coach/ops';
import { replanPlan } from '../../shared/replan';
import { repairWeek } from '../../shared/repair';
import { rulesOf, hardViolations } from '../../shared/constraints';
import { parseFor } from '../../shared/ruleparse';
import * as C from '../../shared/core';

export const CHAT_TODAY = '2026-10-21'; // Mittwoch in Woche 1 der Test-Pläne
export function world(id: string, today = CHAT_TODAY) {
  const p = PERSONAS.find(x => x.id === id)!;
  const r = applyOnboarding(p.answers, PERSONA_TODAY);
  const W = {
    today, profile: r.profile, goals: Object.fromEntries(r.goals.map(g => [g.id, g])) as Record<string, any>, plan: r.gen!.plan,
    state: { sessions: {}, trend: [], illnessPeriods: [], adjustments: {}, coachMsgs: {}, settings: {}, activities: {}, customWorkouts: {} } as any,
    dialog: {} as DialogState, replies: [] as Reply[], undos: [] as Undo[], now: Date.parse(today + 'T08:00:00Z'),
    ctx() { return { today: W.today, now: W.now, state: { ...W.state, profile: W.profile }, baseWeeks: W.plan.weeks, planMeta: W.plan.meta || {}, profile: W.profile, goals: Object.values(W.goals) as any[] }; },
    weeks() { return C.applyAdjustments(W.plan.weeks, W.state.adjustments); },
    days() { return C.planDays(W.weeks()); },
    day(date: string) { return W.days().find((d: any) => d.date === date) || null; },
    sessions(from = W.today, to = C.addDays(W.today, 6)) { return W.days().filter((d: any) => d.date >= from && d.date <= to).flatMap((d: any) => d.sessions.filter((s: any) => s.sport !== 'rest' && !s.cancelled && !s.race && !s.fixed).map((s: any) => ({ ...s, date: d.date }))); },
    rules() { return rulesOf(W.profile, parseFor(W.today)); },
    violations() { return hardViolations(W.weeks(), W.rules(), W.today); },
    say(text: string): Reply {
      W.now += 60000;
      const { reply, dialog } = converse(W.ctx(), W.dialog, text);
      W.dialog = dialog; W.replies.push(reply);
      if (reply.apply && reply.apply.length) W.run(reply.apply);
      return reply;
    },
    run(ops: any[]) {
      const store = { state: W.state, profile: W.profile, goals: W.goals, saveProfile: (p: any) => { W.profile = p; } };
      const res = applyOps(store, ops, W.now, W.today);
      W.profile = store.profile; W.undos.push(res.undo);
      if (res.replan) W.replan();
      return res;
    },
    replan() {
      const r = replanPlan(W.plan, W.profile, Object.values(W.goals) as any, W.today, { adjustments: W.state.adjustments });
      if (r) W.plan = r.plan;
      const adj = repairWeek(W.weeks(), W.state, W.rules(), W.today, 'rules-' + W.now);
      adj.forEach((a, i) => { W.state.adjustments[a.id] = { ...a, createdAt: W.now + i }; });
    },
    undo() { const u = W.undos.pop(); if (!u) return; const store = { state: W.state, profile: W.profile, goals: W.goals, saveProfile: (p: any) => { W.profile = p; } }; undoOps(store, u); W.profile = store.profile; if (u.rules.length || u.goal) W.replan(); },
    tap(i = 0) { const r = W.replies[W.replies.length - 1]; const o = (r.options || [])[i]; if (!o) throw new Error('keine Option ' + i + ' in: ' + r.text); return W.say(o.say); }
  };
  return W;
}
export type World = ReturnType<typeof world>;
