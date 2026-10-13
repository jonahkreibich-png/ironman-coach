/* Kommende Wochen neu planen (Auftrag 4 C3): nach geänderten Berücksichtigungen, Können oder Zeiten.
   Erledigte Einheiten und vergangene Wochen bleiben, ebenso vom Nutzer als „fest“ markierte Einheiten.
   Die Änderung erscheint mit Begründung im Coach-Chat. */
import { STATE, PLAN, BASE_WEEKS, PLAN_KEY, readPlan, saveState, profile, goals, replacePlanInPlace, rebuildPlanIndex } from './store';
import { todayStr, addDays } from './util';
import { replanPlan } from '../../shared/replan';
import * as C from '../../shared/core';
import { D } from './data';
import { repairWeek } from '../../shared/repair';
import { rulesOf, type Rule } from '../../shared/constraints';
import { parseFor } from '../../shared/ruleparse';
import type { Conflict } from '../../shared/plangen';
import { planDiff } from '../../shared/plandiff';
import type { Profile } from '../../shared/profile';
import type { Goal } from '../../shared/goals';
import { t } from '../../shared/i18n';
import { sportLabel } from './kit';

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
/* Laufende Woche sofort an die Regeln anpassen (Verschieben oder Streichen, mit Rückgängig). Liefert die Änderungen als Text. */
export function repairNow(rules?: Rule[]): string[] {
  const today = todayStr();
  const r = rules || rulesOf(profile(), parseFor(today));
  const eff = C.applyAdjustments(BASE_WEEKS, STATE.adjustments || {});
  const adj = repairWeek(eff, STATE, r, today, 'rules-' + Date.now());
  const now = Date.now();
  adj.forEach((a, i) => { STATE.adjustments[a.id] = { ...a, createdAt: now + i, date: today }; });
  if (adj.length) rebuildPlanIndex();
  return adj.map(a => a.what);
}
/* Vorschau ohne Speichern (Auftrag 6, Punkt 1): was ändert sich in dieser und der nächsten Woche, wenn Profil/Ziele so übernommen werden?
   Rechnet genau wie replanFuture: neuer Plan ab nächster Woche, laufende Woche nach den Regeln repariert. */
export function previewReplan(p: Profile, goalList: Goal[]): { ok: boolean; msg: string; changes: string[]; thisWeek: string[]; nextWeek: string[]; conflicts: number } {
  const old = readPlan(); const gl = (goalList || []).filter(g => g && !g.result);
  if (!old || !gl.length) return { ok: false, msg: t('stage.noReplan'), changes: [], thisWeek: [], nextWeek: [], conflicts: 0 };
  const today = todayStr();
  const r = replanPlan(old, p, gl, today, { stages: currentStages(), recentHours: recentHours(), adjustments: STATE.adjustments || {}, state: STATE });
  if (!r) return { ok: false, msg: t('stage.noReplan'), changes: [], thisWeek: [], nextWeek: [], conflicts: 0 };
  const before = C.planDays(C.applyAdjustments(BASE_WEEKS, STATE.adjustments || {}));
  const adj = { ...(STATE.adjustments || {}) };
  repairWeek(C.applyAdjustments(r.plan.weeks, adj), STATE, rulesOf(p, parseFor(today)), today, 'preview').forEach((a: any) => { adj[a.id] = a; });
  const after = C.planDays(C.applyAdjustments(r.plan.weeks, adj));
  const dowIdx = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
  const mon = addDays(today, -((dowIdx(today) + 6) % 7));
  const wk = (d: string) => d > addDays(mon, 6) ? 1 : 0;
  const day = (d: string, anchor: string) => t('dow.' + dowIdx(d)) + (wk(d) !== wk(anchor) ? ' ' + t(wk(d) ? 'stage.nextWeek' : 'stage.thisWeek') : '');
  const done = (id: string) => !!(STATE.sessions && STATE.sessions[id] && STATE.sessions[id].completed);
  const diff = planDiff(before, after, today, addDays(mon, 13), { sport: sportLabel, day }, done);
  const thisWeek = diff.filter(c => !wk(c.from || c.to || today)).map(c => c.text), nextWeek = diff.filter(c => wk(c.from || c.to || today)).map(c => c.text);
  return { ok: true, msg: '', changes: [...thisWeek, ...nextWeek], thisWeek, nextWeek, conflicts: (r.gen.conflicts || []).length };
}
export function replanFuture(reason: string, why: string, o: { needTests?: any } = {}): { ok: boolean; msg: string; conflicts?: Conflict[]; changed?: string[] } {
  const old = readPlan();
  const gl = goals().filter(g => !g.result);
  if (!old || !gl.length) return { ok: false, msg: 'Ohne Plan und Ziel gibt es nichts neu zu planen.' };
  const today = todayStr();
  const r = replanPlan(old, profile(), gl, today, { stages: currentStages(), recentHours: recentHours(), adjustments: STATE.adjustments || {}, state: STATE, needTests: o.needTests });
  if (!r) return { ok: false, msg: 'Ohne Plan und Ziel gibt es nichts neu zu planen.' };
  const { plan: next, gen } = r;
  try { localStorage.setItem(PLAN_KEY + '_prev', JSON.stringify(old)); } catch (e) { return { ok: false, msg: 'Speichern nicht möglich.' }; }
  replacePlanInPlace(next);
  // diese Woche: was jetzt gegen eine harte Regel verstößt, sofort verschieben oder streichen
  const changed = repairNow();
  const now = Date.now();
  const id = 'msg-replan-' + now;
  const dropped = [...new Set(gen.dropped.filter(x => !/wird locker/.test(x)).map(x => x.replace(/^Woche \d+: /, '')))].slice(0, 3);
  STATE.coachMsgs[id] = { id, at: now, date: today, kind: 'adjust', from: 'coach', title: 'Plan angepasst: ' + reason, unread: true,
    text: `${why} Ab nächster Woche gilt der angepasste Plan, erledigte Einheiten bleiben, wie sie sind.${changed.length ? ' Diese Woche: ' + changed.join('; ') + '.' : ''}${dropped.length ? ' Nicht alles passte: ' + dropped.join('; ') + '.' : ''}` };
  // passt ein Wunsch nicht zu den harten Regeln: klar sagen und Lösungen anbieten
  gen.conflicts.forEach((c, i) => {
    const cid = `msg-conflict-${c.id}-${now}`;
    STATE.coachMsgs[cid] = { id: cid, at: now + 1 + i, date: today, kind: 'proposal-local', from: 'coach', title: 'Das passt nicht ganz', unread: true, text: c.text,
      actions: c.options.map(o => ({ label: o.label, kind: 'rule-fix', payload: { sport: c.sport, option: o.id, day: o.day, n: o.n } })) };
  });
  saveState();
  void PLAN;
  return { ok: true, msg: 'Kommende Wochen angepasst.', conflicts: gen.conflicts, changed };
}
