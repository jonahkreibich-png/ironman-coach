/* Kommende Wochen neu planen (Auftrag 4 C3): nach geänderten Berücksichtigungen, Können oder Zeiten.
   Erledigte Einheiten und vergangene Wochen bleiben, ebenso vom Nutzer als „fest“ markierte Einheiten.
   Die Änderung erscheint mit Begründung im Coach-Chat. */
import { STATE, PLAN, BASE_WEEKS, PLAN_KEY, readPlan, saveState, profile, goals, replacePlanInPlace } from './store';
import { todayStr, addDays } from './util';
import { generatePlan, transitionPlan } from '../../shared/plangen';
import * as C from '../../shared/core';
import { D } from './data';

/* Aktuelle Lernstufen aus dem Plan (die zuletzt geplante Stufe je Lernweg) */
export function currentStages(): { swim?: any; runwalk?: number | null } {
  const days = C.planDays(C.applyAdjustments(BASE_WEEKS, STATE.adjustments || {}));
  const out: any = {};
  for (const d of days) for (const s of d.sessions) {
    if (!s.stage || d.date > addDays(todayStr(), 7)) continue;
    if (s.stage.ladder === 'runwalk') out.runwalk = s.stage.n; else out.swim = { ladder: s.stage.ladder, n: s.stage.n };
  }
  return out;
}
function recentHours(): number | null {
  const d = D(); const from = addDays(d.today, -42);
  const acts = d.activities.filter(a => a.date >= from && a.date <= d.today);
  return acts.length ? Math.round(acts.reduce((s, a: any) => s + (a.min || 0), 0) / 60 / 6 * 10) / 10 : null;
}
export function replanFuture(reason: string, why: string): { ok: boolean; msg: string } {
  const old = readPlan();
  const gl = goals().filter(g => !g.result);
  if (!old || !gl.length) return { ok: false, msg: 'Ohne Plan und Ziel gibt es nichts neu zu planen.' };
  const today = todayStr();
  const stages = currentStages();
  const gen = generatePlan({ profile: profile(), goals: gl, today, currentWeeklyHours: recentHours(), stages: { swim: stages.swim === undefined ? undefined as any : stages.swim, runwalk: stages.runwalk === undefined ? undefined as any : stages.runwalk } });
  const next = transitionPlan(old, gen.plan, today);
  // Feste Einheiten der kommenden Wochen mitnehmen
  const eff = C.applyAdjustments(BASE_WEEKS, STATE.adjustments || {});
  const locked = C.planDays(eff).flatMap(d => d.sessions.filter((s: any) => s.locked && d.date > today).map((s: any) => ({ s, date: d.date })));
  for (const { s, date } of locked) {
    const day = next.weeks.flatMap((w: any) => w.days).find((d: any) => d.date === date);
    if (day) { day.sessions = day.sessions.filter((x: any) => x.sport !== 'rest'); if (!day.sessions.some((x: any) => x.id === s.id)) day.sessions.push({ ...s, _adj: undefined, _orig: undefined }); }
  }
  next.meta = { ...next.meta, explain: gen.plan.meta.explain };
  try { localStorage.setItem(PLAN_KEY + '_prev', JSON.stringify(old)); } catch (e) { return { ok: false, msg: 'Speichern nicht möglich.' }; }
  replacePlanInPlace(next);
  const now = Date.now();
  const id = 'msg-replan-' + now;
  STATE.coachMsgs[id] = { id, at: now, date: today, kind: 'adjust', from: 'coach', title: 'Plan angepasst: ' + reason, text: `${why} Ab nächster Woche gilt der angepasste Plan, erledigte Einheiten bleiben, wie sie sind.${gen.dropped.length ? ' Nicht alles passte: ' + [...new Set(gen.dropped.map(x => x.replace(/^Woche \d+: /, '')))].slice(0, 3).join('; ') + '.' : ''}` };
  saveState();
  void PLAN;
  return { ok: true, msg: 'Kommende Wochen angepasst.' };
}
