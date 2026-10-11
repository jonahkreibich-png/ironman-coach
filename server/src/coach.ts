/* Coach-Engine auf dem Server: läuft bei jedem neuen Datenpunkt (Einheit, Nachtwerte, Krankheit, Essen)
   und zusätzlich täglich und wöchentlich. Anpassungen (kind "adjust") und Nachrichten (kind "coachMsg") werden
   gespeichert und per Sync an die App verteilt, wichtige Nachrichten zusätzlich als Mitteilung. */
import * as C from '../../shared/core';
import { type Env, berlinParts, getRecord, getRecords, putRecords, getMeta, setMeta, type Change } from './store';
import { runEngine, type EngineCtx, type EngineEvent, type CoachMsg } from '../../shared/coach/engine';
import { profileFromLegacy, mergeProfile } from '../../shared/profile';
import { goalFromPlanMeta, type Goal } from '../../shared/goals';

export async function loadState(env: Env, uid: number): Promise<any> {
  const [planRec, settingsRec, profileRec, sessions, customs, trend, illness, weekNotes, adjustments, nutrition, activities, coachMsgs, coachNotes, goals] = await Promise.all([
    getRecord(env, uid, 'plan', 'main'), getRecord(env, uid, 'settings', 'main'), getRecord(env, uid, 'profile', 'main'),
    getRecords(env, uid, 'session'), getRecords(env, uid, 'custom'), getRecords(env, uid, 'trend'),
    getRecords(env, uid, 'illness'), getRecords(env, uid, 'weekNote'), getRecords(env, uid, 'adjust'), getRecords(env, uid, 'nutrition'),
    getRecords(env, uid, 'activity'), getRecords(env, uid, 'coachMsg'), getRecords(env, uid, 'coachNote'), getRecords(env, uid, 'goal')
  ]);
  const customWorkouts: any = {};
  Object.values(customs).forEach(w => { if (w && w.date) (customWorkouts[w.date] = customWorkouts[w.date] || []).push(w); });
  const plan = planRec ? planRec.data : null;
  const sdata = (settingsRec && settingsRec.data) || {};
  const state: any = {
    sessions, customWorkouts, weekNotes, adjustments, nutrition, activities, coachMsgs, coachNotes,
    trend: Object.values(trend).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date)),
    illnessPeriods: Object.values(illness).filter(Boolean),
    settings: sdata.settings || {}, nutritionProfile: sdata.nutritionProfile || null
  };
  const today = berlinParts().date;
  const profile = mergeProfile(profileRec && profileRec.data, profileFromLegacy({ ...state, planWeeks: (plan && plan.weeks) || [] }, today));
  let goalList: Goal[] = Object.values(goals).filter(Boolean);
  if (!goalList.length && plan) { const g = goalFromPlanMeta(plan.meta); if (g) goalList = [g]; }
  state.profile = profile;
  return {
    plan, baseWeeks: (plan && plan.weeks) || [], planMeta: (plan && plan.meta) || {},
    nutritionProfile: state.nutritionProfile, profile, goals: goalList, state
  };
}

export function engineCtx(L: any, date?: string): EngineCtx {
  return { today: date || berlinParts().date, now: Date.now(), state: L.state, baseWeeks: L.baseWeeks, planMeta: L.planMeta, profile: L.profile, goals: L.goals };
}

export interface EngineRun { created: number; adjustments: any[]; messages: CoachMsg[] }
/* Engine für ein Ereignis ausführen und Ergebnisse speichern */
export async function runEngineFor(env: Env, uid: number, ev: EngineEvent, opts: { date?: string; L?: any; rephrase?: (m: CoachMsg) => Promise<CoachMsg> } = {}): Promise<EngineRun> {
  const L = opts.L || await loadState(env, uid);
  if (!L.plan) return { created: 0, adjustments: [], messages: [] };
  const ctx = engineCtx(L, opts.date);
  const out = runEngine(ctx, ev);
  const t = Date.now();
  const changes: Change[] = out.adjustments.map((a, i) => ({ kind: 'adjust', key: a.id, data: a, updatedAt: t + i }));
  const msgs: CoachMsg[] = [];
  for (const m of out.messages) msgs.push(opts.rephrase && (m.kind === 'briefing' || m.kind === 'session' || m.kind === 'week') ? await opts.rephrase(m) : m);
  msgs.forEach((m, i) => changes.push({ kind: 'coachMsg', key: m.id, data: m, updatedAt: t + 100 + i }));
  if (changes.length) await putRecords(env, uid, changes);
  // Im Speicher nachziehen, falls weitere Schritte denselben Stand nutzen
  out.adjustments.forEach(a => { L.state.adjustments[a.id] = a; });
  msgs.forEach(m => { L.state.coachMsgs[m.id] = m; });
  return { created: out.adjustments.length, adjustments: out.adjustments, messages: msgs };
}

/* Täglich morgens nach dem Abruf, einmal pro Tag. force: auch wenn heute schon gelaufen. */
export async function runDaily(env: Env, uid: number, opts?: any): Promise<any> {
  opts = opts || {};
  const b = berlinParts();
  const done = await getMeta(env, uid, 'daily_done');
  if (!opts.force && done === b.date) return { skipped: 'heute schon erledigt' };
  const L = await loadState(env, uid);
  if (!L.plan) return { skipped: 'kein Plan' };
  const today = L.state.trend.find((p: any) => p.date === b.date);
  // Auf die Morgenwerte warten, höchstens bis 10 Uhr
  if (!opts.force && !C.hasRecovery(today) && b.hour < 10) return { skipped: 'warte auf Morgenwerte' };
  const r = await runEngineFor(env, uid, { type: 'daily' }, { L, rephrase: opts.rephrase });
  await setMeta(env, uid, 'daily_done', b.date);
  return { date: b.date, created: r.created, adjustments: r.adjustments, messages: r.messages.length };
}

/* Sonntag 18 Uhr für die nächste Woche. */
export async function runWeekly(env: Env, uid: number, opts?: any): Promise<any> {
  opts = opts || {};
  const b = berlinParts();
  const done = await getMeta(env, uid, 'weekly_done');
  if (!opts.force && done === b.date) return { skipped: 'diese Woche schon erledigt' };
  const L = await loadState(env, uid);
  if (!L.plan) return { skipped: 'kein Plan' };
  const date = opts.date || b.date;
  const r = await runEngineFor(env, uid, { type: 'weekly' }, { L, date, rephrase: opts.rephrase });
  await setMeta(env, uid, 'weekly_done', b.date);
  const summary = C.weekSummary(L.state, L.baseWeeks, date);
  return { date, created: r.created, adjustments: r.adjustments, summary };
}
