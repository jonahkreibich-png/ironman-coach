/* Kommende Wochen neu planen (Kern, ohne Browser): gleicher Ablauf für App, Fragebogen, Coach-Chat, Server und Tests.
   Regel für alle (Auftrag 7): Gibt es schon einen Plan, wird FORTGESETZT, nicht neu begonnen. Vergangene Wochen bleiben,
   Wochen- und Blockzählung laufen weiter, der Umfang knüpft an die Belastung (CTL/ATL) an, Score-Kalibrierung und Verlauf
   bleiben im Plan. Ab nächstem Montag gilt der neue Abschnitt; vom Nutzer als „fest“ markierte Einheiten werden übernommen. */
import { generatePlan, transitionPlan, continuationOf, type GenResult } from './plangen';
import * as C from './core';
import type { Profile } from './profile';
import type { Goal } from './goals';

export interface ReplanOpts { stages?: any; recentHours?: number | null; adjustments?: any; /** Zustand (Trend, Krankheit, Einheiten) für die Belastung */ state?: any; needTests?: Partial<Record<'run' | 'bike' | 'swim', boolean>> }
export function replanPlan(old: any, profile: Profile, goals: Goal[], today: string, o: ReplanOpts = {}): { plan: any; gen: GenResult } | null {
  const gl = (goals || []).filter(g => g && !g.result);
  if (!old || !gl.length) return null;
  const stages = o.stages || {};
  const eff = C.applyAdjustments(old.weeks || [], o.adjustments || {});
  const load = o.state ? C.loadBaseline({ ...o.state, adjustments: o.adjustments || o.state.adjustments }, eff, today) : null;
  const gen = generatePlan({ profile, goals: gl, today, currentWeeklyHours: o.recentHours ?? null, load, continueFrom: continuationOf(old, today), needTests: o.needTests,
    stages: { swim: stages.swim === undefined ? undefined as any : stages.swim, runwalk: stages.runwalk === undefined ? undefined as any : stages.runwalk } });
  const next = transitionPlan(old, gen.plan, today);
  const locked = C.planDays(eff).flatMap((d: any) => d.sessions.filter((s: any) => s.locked && d.date > today).map((s: any) => ({ s, date: d.date })));
  for (const { s, date } of locked) {
    const day = next.weeks.flatMap((w: any) => w.days).find((d: any) => d.date === date);
    if (day) { day.sessions = day.sessions.filter((x: any) => x.sport !== 'rest'); if (!day.sessions.some((x: any) => x.id === s.id)) day.sessions.push({ ...s, _adj: undefined, _orig: undefined }); }
  }
  next.meta = { ...next.meta, explain: gen.plan.meta.explain };
  return { plan: next, gen };
}
