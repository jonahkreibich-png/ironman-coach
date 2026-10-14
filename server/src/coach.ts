/* Coach-Engine auf dem Server: läuft bei jedem neuen Datenpunkt (Einheit, Nachtwerte, Krankheit, Essen)
   und zusätzlich täglich und wöchentlich. Anpassungen (kind "adjust") und Nachrichten (kind "coachMsg") werden
   gespeichert und per Sync an die App verteilt, wichtige Nachrichten zusätzlich als Mitteilung. */
import * as C from '../../shared/core';
import { type Env, berlinParts, getRecord, getRecords, putRecords, getMeta, setMeta, type Change } from './store';
import { runEngine, type EngineCtx, type EngineEvent, type CoachMsg } from '../../shared/coach/engine';
import { profileFromLegacy, mergeProfile } from '../../shared/profile';
import { goalFromPlanMeta, type Goal } from '../../shared/goals';
import { migrateNotes, runTestUpdate, applyTestUpdate } from '../../shared/fields';
import { analyze, type Trigger } from '../../shared/coach/analysis';
import { extendPlan } from '../../shared/replan';

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
  // Werte aus alten Notizen für Engine und Analyse lesen (nur im Speicher; gespeichert wird es von der App)
  try { migrateNotes(state, (plan && plan.weeks) || []); } catch (e) { /* weiter ohne */ }
  const today = berlinParts().date;
  const profile = mergeProfile(profileRec && profileRec.data, profileFromLegacy({ ...state, planWeeks: (plan && plan.weeks) || [] }, today), today);
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
  try { await runAnalysis(env, uid, 'morning', { L, rephrase: opts.rephrase }); } catch (e) { /* die Analyse darf den Morgen nie stören */ }
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
  try { await extendIfNeeded(env, uid, L); } catch (e) { /* weiter mit dem bisherigen Plan */ }
  const r = await runEngineFor(env, uid, { type: 'weekly' }, { L, date, rephrase: opts.rephrase });
  await setMeta(env, uid, 'weekly_done', b.date);
  try { await runAnalysis(env, uid, 'weekly', { L, date, rephrase: opts.rephrase }); } catch (e) { /* weiter */ }
  const summary = C.weekSummary(L.state, L.baseWeeks, date);
  return { date, created: r.created, adjustments: r.adjustments, summary };
}

/* Analyse-Coach (Auftrag 7): morgens, nach neuen Einheiten, sonntags. Speichert das Ergebnis (analysis/latest), kleine Änderungen
   als Anpassung mit Mitteilung (Rückgängig in der App), größere als Vorschlag. rephrase: die KI formuliert nur die Texte um. */
export async function runAnalysis(env: Env, uid: number, trigger: Trigger, opts: { L?: any; date?: string; rephrase?: (m: CoachMsg) => Promise<CoachMsg> } = {}): Promise<any> {
  const L = opts.L || await loadState(env, uid);
  if (!L.plan) return { skipped: 'kein Plan' };
  const t = Date.now();
  const changes: Change[] = [];
  // Schwellentest erledigt (z. B. von der Uhr): Zonen automatisch übernehmen, mit Mitteilung
  const tu = runTestUpdate(L.state, C.applyAdjustments(L.baseWeeks, L.state.adjustments || {}), L.profile, opts.date || berlinParts().date);
  if (tu) {
    L.profile = applyTestUpdate(L.profile, tu); L.state.profile = L.profile;
    const sRec = await getRecord(env, uid, 'settings', 'main'); const sd = (sRec && sRec.data) || {};
    changes.push({ kind: 'profile', key: 'main', data: { ...L.profile, updatedAt: t }, updatedAt: t });
    if (tu.settings && Object.keys(tu.settings).length) changes.push({ kind: 'settings', key: 'main', data: { ...sd, settings: { ...(sd.settings || {}), ...tu.settings } }, updatedAt: t + 1 });
    changes.push({ kind: 'coachMsg', key: 'msg-test-' + tu.sessionId, data: { id: 'msg-test-' + tu.sessionId, at: t, date: tu.date, kind: 'info', from: 'coach', title: tu.title, text: tu.text, important: true }, updatedAt: t + 2 });
  }
  const ctx = engineCtx(L, opts.date);
  const r = analyze(ctx, trigger);
  r.auto.forEach((a, i) => changes.push({ kind: 'adjust', key: a.id, data: a, updatedAt: t + 10 + i }));
  const msgs: CoachMsg[] = [];
  for (const m of r.messages) msgs.push(opts.rephrase && m.kind !== 'proposal' && m.kind !== 'adjust' ? await opts.rephrase(m) : m);
  msgs.forEach((m, i) => changes.push({ kind: 'coachMsg', key: m.id, data: m, updatedAt: t + 100 + i }));
  changes.push({ kind: 'analysis', key: 'latest', data: { date: r.date, trigger, at: r.at, load: r.load, top: r.top, insights: r.insights.slice(0, 10) }, updatedAt: t + 200 });
  await putRecords(env, uid, changes);
  r.auto.forEach(a => { L.state.adjustments[a.id] = a; });
  msgs.forEach(m => { L.state.coachMsgs[m.id] = m; });
  await setMeta(env, uid, 'analysis_last', { at: t, trigger, sig: await dataSignature(env, uid) });
  return { trigger, top: r.top.map(i => i.title), auto: r.auto.length, proposals: r.proposals.length, messages: msgs.length };
}
/* Fingerabdruck der Einheiten: ändert er sich, ist eine neue Einheit da (egal aus welcher Quelle) */
export async function dataSignature(env: Env, uid: number): Promise<string> {
  const row: any = await env.DB.prepare("SELECT COUNT(*) AS n, MAX(updated_at) AS m FROM records WHERE user_id = ? AND kind IN ('session', 'custom', 'activity')").bind(uid).first();
  return row ? row.n + ':' + row.m : '';
}
/* Sonntags: Plan verlängern, wenn er bald endet */
export async function extendIfNeeded(env: Env, uid: number, L: any): Promise<boolean> {
  if (!L.plan) return false;
  const next = extendPlan(L.plan, L.profile, L.goals, berlinParts().date);
  if (!next) return false;
  await putRecords(env, uid, [{ kind: 'plan', key: 'main', data: next, updatedAt: Date.now() }]);
  L.plan = next; L.baseWeeks = next.weeks; L.planMeta = next.meta;
  return true;
}
