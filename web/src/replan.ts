/* Kommende Wochen neu planen (Auftrag 4 C3): nach geänderten Berücksichtigungen, Können oder Zeiten.
   Erledigte Einheiten und vergangene Wochen bleiben, ebenso vom Nutzer als „fest“ markierte Einheiten.
   Die Änderung erscheint mit Begründung im Coach-Chat. */
import { STATE, PLAN, BASE_WEEKS, PLAN_KEY, readPlan, saveState, profile, goals, replacePlanInPlace, rebuildPlanIndex } from './store';
import { todayStr, addDays } from './util';
import { replanPlan, replanStart, calibrationDue } from '../../shared/replan';
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
import { checkPlanRules } from '../../shared/planrules';
import { chosenSports, sportAllowed } from '../../shared/sports';

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
/* Ab wann gilt eine Änderung? Heute, ab 18 Uhr morgen (Auftrag 11) */
export const replanFrom = () => replanStart(todayStr(), new Date().getHours());
export const fromText = () => replanFrom() === todayStr() ? 'heute' : 'morgen';
/* Vorschau ohne Speichern (Auftrag 6, Punkt 1): was ändert sich in dieser und der nächsten Woche, wenn Profil/Ziele so übernommen werden?
   Rechnet genau wie replanFuture: neuer Plan ab nächster Woche, laufende Woche nach den Regeln repariert. */
export function previewReplan(p: Profile, goalList: Goal[]): { ok: boolean; msg: string; changes: string[]; thisWeek: string[]; nextWeek: string[]; conflicts: number } {
  const old = readPlan(); const gl = (goalList || []).filter(g => g && !g.result);
  if (!old || !gl.length) return { ok: false, msg: t('stage.noReplan'), changes: [], thisWeek: [], nextWeek: [], conflicts: 0 };
  const today = todayStr();
  const r = replanPlan(old, p, gl, today, { stages: currentStages(), recentHours: recentHours(), adjustments: STATE.adjustments || {}, state: STATE, from: replanFrom() });
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
export function replanFuture(reason: string, why: string, o: { needTests?: any; measuredStartMin?: number | null; fresh?: boolean } = {}): { ok: boolean; msg: string; conflicts?: Conflict[]; changed?: string[] } {
  const old = readPlan();
  const gl = goals().filter(g => !g.result);
  if (!old || !gl.length) return { ok: false, msg: 'Ohne Plan und Ziel gibt es nichts neu zu planen.' };
  const today = todayStr();
  const from = replanFrom();
  const r = replanPlan(old, profile(), gl, today, { stages: currentStages(), recentHours: recentHours(), adjustments: STATE.adjustments || {}, state: STATE, needTests: o.needTests, from, measuredStartMin: o.measuredStartMin });
  if (r && o.measuredStartMin) r.plan.meta = { ...r.plan.meta, calibrated: true };
  if (!r) return { ok: false, msg: 'Ohne Plan und Ziel gibt es nichts neu zu planen.' };
  const { plan: next, gen } = r;
  try { localStorage.setItem(PLAN_KEY + '_prev', JSON.stringify(old)); } catch (e) { return { ok: false, msg: 'Speichern nicht möglich.' }; }
  replacePlanInPlace(next);
  // diese Woche: was jetzt gegen eine harte Regel verstößt, sofort verschieben oder streichen
  const changed = repairNow();
  const now = Date.now();
  // gleicher Anlass am selben Tag: eine Nachricht, die aktualisiert wird (Auftrag 11: Papa bekam 3 gleiche Nachrichten)
  const id = `msg-replan-${today}-${reason.replace(/[^a-z0-9äöü]+/gi, '-').toLowerCase()}`;
  const dropped = [...new Set(gen.dropped.filter(x => !/wird locker|entfällt \(Wettkampf\)/.test(x)).map(x => x.replace(/^Woche \d+: /, '')))].slice(0, 3);
  STATE.coachMsgs[id] = { id, at: now, date: today, kind: 'adjust', from: 'coach', title: 'Plan angepasst: ' + reason, unread: true,
    text: `${why} Der angepasste Plan gilt ab ${from === today ? 'heute' : 'morgen'}. Vergangene und erledigte Einheiten bleiben, wie sie sind; der Rest dieser Woche ist neu verteilt.${changed.length ? ' Diese Woche: ' + changed.join('; ') + '.' : ''}${dropped.length ? ' Nicht alles passte: ' + dropped.join('; ') + '.' : ''}` };
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

/* „Stunden bisher: weiß ich nicht“ (Auftrag 11): nach 2 Wochen an die echten Daten anpassen (beim Öffnen der App) */
export function calibrateIfDue(): boolean {
  const plan = readPlan(); if (!plan) return false;
  const due = calibrationDue(plan, STATE, todayStr()); if (!due) return false;
  const h = (Math.round(due.minutes / 6) / 10).toString().replace('.', ',');
  const r = replanFuture('deine ersten 2 Wochen', `Du hattest beim Start nicht gewusst, wie viel du bisher trainierst. In den ersten 2 Wochen waren es etwa ${h} h pro Woche: daran richtet sich der Plan jetzt aus.`, { measuredStartMin: due.minutes });
  return r.ok;
}

/* Auftrag 15 (für alle): Der Plan enthält nur gewählte Sportarten. Beim Start prüft die App den Plan ab heute; steht eine nicht gewählte
   Sportart darin (Mamas Fall), plant sie ab heute neu (Vergangenes und Erledigtes bleibt) und sagt es im Coach. Dabei gilt auch der Abstand
   zwischen gleichen Sportarten. Den Abstand allein ändert die App nicht ungefragt (neue und geänderte Pläne bekommen ihn vom Generator).
   Einmal je Befund: bleibt nach dem Neuplanen etwas übrig, fragt die App nicht bei jedem Start erneut. */
export function planRulesOnStart(): boolean {
  const plan = readPlan(); if (!plan) return false;
  const p = profile(); const from = replanFrom();
  const eff = C.applyAdjustments(BASE_WEEKS, STATE.adjustments || {});
  const issues = checkPlanRules(eff, p, { from }).filter(i => i.rule === 'sport');
  const sig = issues.map(i => i.msg).join('|');
  if (!issues.length || STATE.settings.planRules15 === sig) return false;
  const sportIss = issues.filter(i => i.rule === 'sport');
  const names = [...new Set(sportIss.map(i => (/\((Laufen|Rad|Schwimmen|Kraft|Teamsport)\)/.exec(i.msg) || [])[1]).filter(Boolean))];
  const mine = chosenSports(p).map(s => sportLabel(s)).join(', ');
  const why = sportIss.length
    ? `In deinem Plan standen Einheiten, die du nicht gewählt hast (${names.join(', ') || 'andere Sportarten'}). Ab jetzt plane ich nur mit deinen Sportarten: ${mine}.`
    : 'Neue Regel: dieselbe Sportart liegt nicht mehr an zwei Tagen hintereinander. Geht es wegen Zeit, Schwimmbad oder festen Terminen nicht anders, ist eine der beiden Einheiten locker und kurz.';
  const r = replanFuture(sportIss.length ? 'nur deine Sportarten' : 'Abstand zwischen gleichen Sportarten', why);
  if (!r.ok && sportIss.length) {
    // ohne Ziel kein Neuplanen: dann fallen die Einheiten weg (mit Rückgängig)
    const now = Date.now();
    C.planDays(eff).filter((d: any) => d.date >= from).forEach((d: any) => (d.sessions || []).forEach((s: any, i: number) => {
      if (!s || s.race || s.cancelled || sportAllowed(p, s.sport) || (STATE.sessions[s.id] && STATE.sessions[s.id].completed)) return;
      const id = `nosport-${s.id}`; STATE.adjustments[id] = { id, group: 'nosport-' + todayStr(), type: 'cancel', removed: true, sessionId: s.id, date: todayStr(), createdAt: now + i, what: `${s.title} entfällt`, reason: 'Sportart nicht gewählt' };
    }));
    rebuildPlanIndex();
  }
  const after = checkPlanRules(C.applyAdjustments(BASE_WEEKS, STATE.adjustments || {}), profile(), { from }).filter(i => i.rule === 'sport');
  STATE.settings.planRules15 = after.map(i => i.msg).join('|') || sig;
  saveState();
  return true;
}
