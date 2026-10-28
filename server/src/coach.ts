/* Coach-Engine auf dem Server: läuft bei jedem neuen Datenpunkt (Einheit, Nachtwerte, Krankheit, Essen)
   und zusätzlich täglich und wöchentlich. Anpassungen (kind "adjust") und Nachrichten (kind "coachMsg") werden
   gespeichert und per Sync an die App verteilt, wichtige Nachrichten zusätzlich als Mitteilung. */
import * as C from '../../shared/core';
import { type Env, berlinParts, getRecord, getRecords, putRecords, getMeta, setMeta, recordsRevision, RecordsChangedError, type Change } from './store';
import { runEngine, type EngineCtx, type EngineEvent, type CoachMsg } from '../../shared/coach/engine';
import { profileFromLegacy, mergeProfile } from '../../shared/profile';
import { goalFromPlanMeta, type Goal } from '../../shared/goals';
import { migrateNotes, runTestUpdate, applyTestUpdate } from '../../shared/fields';
import { swimBests, swimSkillUpdate, legacySwimReview, swimRateUpdate, swimPaceUpdate, swimStrokeUpdate, swimRateText } from '../../shared/swimskill';
import { refreshFuture, trendThresholds, refreshAdjustments } from '../../shared/refresh';
import { mainGoal } from '../../shared/goals';
import { analyze, swimReviewMessages, type Trigger } from '../../shared/coach/analysis';
import { extendPlan } from '../../shared/replan';
import { evidenceSignature } from '../../shared/results';
import { dedupeIncoming } from '../../shared/coach/feed';

/* Auftrag 21: jede Coach-Meldung höchstens einmal je Anlass (alle Meldungsarten). Vor dem Speichern: Duplikate unter anderer Id
   fallen weg, alte Duplikate im Verlauf werden gelöscht. */
export function dedupeMsgChanges(existing: Record<string, any>, changes: Change[], t: number): Change[] {
  const incoming = changes.filter(c => c.kind === 'coachMsg' && !c.deleted && c.data).map(c => c.data);
  const { keep, drop } = dedupeIncoming(existing || {}, incoming);
  const ids = new Set(keep.map((m: any) => m.id));
  const out = changes.filter(c => c.kind !== 'coachMsg' || c.deleted || ids.has(c.key));
  drop.forEach((id, i) => out.push({ kind: 'coachMsg', key: id, deleted: true, updatedAt: t + 400 + i }));
  return out;
}

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

export interface EngineRun { created: number; adjustments: any[]; messages: CoachMsg[]; skipped?: string }
/* Engine für ein Ereignis ausführen und Ergebnisse speichern */
export async function runEngineFor(env: Env, uid: number, ev: EngineEvent, opts: { date?: string; L?: any; rephrase?: (m: CoachMsg) => Promise<CoachMsg> } = {}): Promise<EngineRun> {
  // Ein von einer vorherigen KI-/Enginephase gereichter Stand kann veraltet sein.
  // Revision vor dem Lesen erfassen; bei Aenderungen wird atomar nichts geschrieben.
  const revision = await recordsRevision(env, uid);
  const L = await loadState(env, uid);
  if (!L.plan) return { created: 0, adjustments: [], messages: [], skipped: 'kein Plan' };
  const ctx = engineCtx(L, opts.date);
  const out = runEngine(ctx, ev);
  const t = Date.now();
  const changes: Change[] = out.adjustments.map((a, i) => ({ kind: 'adjust', key: a.id, data: a, updatedAt: t + i }));
  const msgs: CoachMsg[] = [];
  // Bewertungen (Auftrag 12) behalten ihre 3 Teile, die KI formuliert sie nicht um
  for (const m of out.messages) msgs.push(opts.rephrase && (m.kind === 'briefing' || m.kind === 'session' || m.kind === 'week') && !m.id.startsWith('msg-review-') ? await opts.rephrase(m) : m);
  msgs.forEach((m, i) => changes.push({ kind: 'coachMsg', key: m.id, data: m, updatedAt: t + 100 + i }));
  const final = dedupeMsgChanges(L.state.coachMsgs, changes, t);
  try { await putRecords(env, uid, final, revision); }
  catch (e) { if (e instanceof RecordsChangedError) return {created:0,adjustments:[],messages:[],skipped:'Daten inzwischen geaendert'}; throw e; }
  // Im Speicher nachziehen, falls weitere Schritte denselben Stand nutzen
  out.adjustments.forEach(a => { L.state.adjustments[a.id] = a; });
  msgs.forEach(m => { L.state.coachMsgs[m.id] = m; });
  if (opts.L) Object.assign(opts.L, L);
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
  if (r.skipped) return { skipped: r.skipped };
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
  if (r.skipped) return { skipped: r.skipped };
  await setMeta(env, uid, 'weekly_done', b.date);
  try { await runAnalysis(env, uid, 'weekly', { L, date, rephrase: opts.rephrase }); } catch (e) { /* weiter */ }
  const summary = C.weekSummary(L.state, L.baseWeeks, date);
  return { date, created: r.created, adjustments: r.adjustments, summary };
}

/* Analyse-Coach (Auftrag 7): morgens, nach neuen Einheiten, sonntags. Speichert das Ergebnis (analysis/latest), kleine Änderungen
   als Anpassung mit Mitteilung (Rückgängig in der App), größere als Vorschlag. rephrase: die KI formuliert nur die Texte um. */
export async function runAnalysis(env: Env, uid: number, trigger: Trigger, opts: { L?: any; date?: string; rephrase?: (m: CoachMsg) => Promise<CoachMsg> } = {}): Promise<any> {
  // Ein von einer vorherigen KI-/Enginephase gereichter Stand kann veraltet sein.
  // Revision vor dem Lesen erfassen; bei Aenderungen wird atomar nichts geschrieben.
  const revision = await recordsRevision(env, uid);
  const L = await loadState(env, uid);
  if (!L.plan) return { skipped: 'kein Plan' };
  const sourceSignature = await dataSignature(env, uid);
  const t = Date.now();
  const changes: Change[] = [];
  // Schwellentest erledigt (z. B. von der Uhr): Zonen automatisch übernehmen, mit Mitteilung
  const tu = runTestUpdate(L.state, C.applyAdjustments(L.baseWeeks, L.state.adjustments || {}), L.profile, opts.date || berlinParts().date);
  if (tu) {
    L.profile = applyTestUpdate(L.profile, tu); L.state.profile = L.profile;
    const sRec = await getRecord(env, uid, 'settings', 'main'); const sd = (sRec && sRec.data) || {};
    changes.push({ kind: 'profile', key: 'main', data: { ...L.profile, updatedAt: t }, updatedAt: t });
    if (tu.settings && Object.keys(tu.settings).length) changes.push({ kind: 'settings', key: 'main', data: { ...sd, settings: { ...(sd.settings || {}), ...tu.settings } }, updatedAt: t + 1 });
    // alle kommenden Einheiten mit den neuen Zonen, Beispiel vorher/nachher
    const day = opts.date || berlinParts().date;
    const rf = L.plan ? refreshFuture(L.plan.weeks || [], L.profile, day, L.state) : { weeks: [], changed: 0, example: null };
    if (rf.changed) { L.plan = { ...L.plan, weeks: rf.weeks }; L.baseWeeks = rf.weeks; changes.push({ kind: 'plan', key: 'main', data: L.plan, updatedAt: t + 6 }); }
    const more = rf.changed ? ` ${rf.changed} kommende Einheiten rechnen ab jetzt damit.${rf.example ? ' Zum Beispiel ' + rf.example + '.' : ''}` : '';
    changes.push({ kind: 'coachMsg', key: 'msg-test-' + tu.sessionId, data: { id: 'msg-test-' + tu.sessionId, at: t, date: tu.date, kind: 'info', from: 'coach', title: tu.title, text: tu.text + more, important: true }, updatedAt: t + 2 });
  } else if (L.plan) {
    // klarer Trend aus den Uhrdaten (ohne Test): Zonen anpassen, alle kommenden Einheiten neu rechnen
    const day = opts.date || berlinParts().date;
    let tr: any = null; try { tr = trendThresholds(L.state, L.baseWeeks, L.profile, mainGoal(L.goals || [], day), day); } catch (e) { tr = null; }
    if (tr) {
      L.profile = { ...L.profile, thresholds: { ...L.profile.thresholds, ...tr.thresholds } }; L.state.profile = L.profile;
      const sRec = await getRecord(env, uid, 'settings', 'main'); const sd = (sRec && sRec.data) || {};
      changes.push({ kind: 'profile', key: 'main', data: { ...L.profile, updatedAt: t }, updatedAt: t });
      if (Object.keys(tr.settings).length) changes.push({ kind: 'settings', key: 'main', data: { ...sd, settings: { ...(sd.settings || {}), ...tr.settings } }, updatedAt: t + 1 });
      const rf = refreshFuture(L.plan.weeks || [], L.profile, day, L.state);
      if (rf.changed) { L.plan = { ...L.plan, weeks: rf.weeks }; L.baseWeeks = rf.weeks; changes.push({ kind: 'plan', key: 'main', data: L.plan, updatedAt: t + 6 }); }
      changes.push({ kind: 'coachMsg', key: 'msg-trend-' + day, data: { id: 'msg-trend-' + day, at: t, date: day, kind: 'info', from: 'coach', title: 'Zonen aus deinen Uhrdaten aktualisiert', important: true,
        text: tr.text + (rf.changed ? ` ${rf.changed} kommende Einheiten rechnen ab jetzt damit.${rf.example ? ' Zum Beispiel ' + rf.example + '.' : ''}` : '') + ' Ändern kannst du die Werte unter Mehr → Einstellungen.' }, updatedAt: t + 2 });
    }
  }
  // Schwimmen: neue Bestwerte → Können eintragen und alle kommenden Schwimmeinheiten neu stufen
  {
    const day = opts.date || berlinParts().date;
    // Auftrag 17: eigene Schwimm-Pace (mit Pausen) → kommende Schwimmeinheiten mit realistischen Metern
    const rate = swimRateUpdate(L.profile, L.state, L.baseWeeks, day);
    // Auftrag 20: eigenes Tempo ohne Pausen gleich mit
    const pace = swimPaceUpdate(L.profile, L.state, L.baseWeeks, day);
    const strokes = swimStrokeUpdate(L.profile, L.state, L.baseWeeks, day);
    if (rate !== undefined || pace !== undefined || strokes) {
      L.profile = { ...L.profile, skills: { ...(L.profile.skills || {}), ...(rate !== undefined ? { swimMPerMin: rate } : {}), ...(pace !== undefined ? { swimPace100: pace } : {}), ...(strokes || {}) } }; L.state.profile = L.profile;
      changes.push({ kind: 'profile', key: 'main', data: { ...L.profile, updatedAt: t + 2 }, updatedAt: t + 2 });
      const rf = L.plan ? refreshFuture(L.plan.weeks || [], L.profile, day, L.state) : { weeks: [], changed: 0, example: null };
      if (rf.changed) { L.plan = { ...L.plan, weeks: rf.weeks }; L.baseWeeks = rf.weeks; changes.push({ kind: 'plan', key: 'main', data: L.plan, updatedAt: t + 6 });
        if (!L.state.coachMsgs['msg-swimrate-' + day]) changes.push({ kind: 'coachMsg', key: 'msg-swimrate-' + day, data: { id: 'msg-swimrate-' + day, at: t, date: day, kind: 'adjust', from: 'coach', title: 'Schwimmen an dein Tempo angepasst', text: swimRateText(rate ?? (L.profile.skills || {}).swimMPerMin ?? null, pace ?? null) }, updatedAt: t + 7 }); }
    }
    // Auftrag 21: kommende Einheiten mit dem aktuellen Profil (z. B. Rolle ohne Watt: kein virtuelles Tempo) – nur wenn sich etwas ändert
    if (L.plan) { const rf0 = refreshFuture(L.plan.weeks || [], L.profile, day, L.state); if (rf0.changed) { L.plan = { ...L.plan, weeks: rf0.weeks }; L.baseWeeks = rf0.weeks; changes.push({ kind: 'plan', key: 'main', data: L.plan, updatedAt: t + 6 }); } }
    // Auftrag 21: kommende automatische Anpassungen mit dem aktuellen Tempo/den Zonen neu rechnen
    refreshAdjustments(L.baseWeeks, L.state.adjustments || {}, L.profile, day).forEach((x, i) => { L.state.adjustments[x.id] = x; changes.push({ kind: 'adjust', key: x.id, data: x, updatedAt: t + 8 + i }); });
    const best = swimBests(L.state, L.baseWeeks, day);
    const su = legacySwimReview(L.profile, L.baseWeeks, L.state.adjustments || {}, day, best, t, L.state) || swimSkillUpdate(L.profile, L.baseWeeks, L.state.adjustments || {}, day, best, t, undefined, L.state);
    const notices=swimReviewMessages({...engineCtx(L,day),now:t},su);
    notices.forEach((m,i)=>{L.state.coachMsgs[m.id]=m;changes.push({kind:'coachMsg',key:m.id,data:m,updatedAt:t+5+i});});
    const swimMsgId = su ? 'msg-' + su.key : '';
    if (su) {
      if (!su.reviewOnly) { L.profile = { ...L.profile, skills: { ...(L.profile.skills || {}), ...su.skills } }; L.state.profile = L.profile;
      changes.push({ kind: 'profile', key: 'main', data: { ...L.profile, updatedAt: t + 3 }, updatedAt: t + 3 }); }
      if (su.reviewOnly) {
        // Der bestehende Proposal-Speicher verwendet dieselbe Ereigniskennung wie die App.
      } else {
        // Auftrag 17: Korrekturen und bestätigte Fortschritte gelten sofort für die kommenden Schwimmeinheiten (rückgängig machbar)
        su.adjustments.forEach((a, i) => { const x = { ...a, createdAt: t + i, date: day }; L.state.adjustments[a.id] = x; changes.push({ kind: 'adjust', key: a.id, data: x, updatedAt: t + 6 + i }); });
        if (!su.silent && !L.state.coachMsgs[swimMsgId]) changes.push({ kind: 'coachMsg', key: swimMsgId, data: { id: swimMsgId, at: t, date: day, kind: 'adjust', from: 'coach', title: /^Korrigiert/.test(su.text) ? 'Schwimmen korrigiert' : 'Schwimm-Stufe', text: su.text, important: true }, updatedAt: t + 5 });
      }
    }
  }
  const ctx = engineCtx(L, opts.date);
  const r = analyze(ctx, trigger);
  r.auto.forEach((a, i) => changes.push({ kind: 'adjust', key: a.id, data: a, updatedAt: t + 10 + i }));
  const msgs: CoachMsg[] = [];
  for (const m of r.messages) msgs.push(opts.rephrase && m.kind !== 'proposal' && m.kind !== 'adjust' ? await opts.rephrase(m) : m);
  msgs.forEach((m, i) => changes.push({ kind: 'coachMsg', key: m.id, data: m, updatedAt: t + 100 + i }));
  changes.push({ kind: 'analysis', key: 'latest', data: { date: r.date, trigger, at: r.at, inputVersion:r.inputVersion, modelVersion:r.modelVersion, load: r.load, top: r.top, insights: r.insights.slice(0, 10) }, updatedAt: t + 200 });
  try { await putRecords(env, uid, dedupeMsgChanges(L.state.coachMsgs, changes, t), revision); }
  catch (e) { if (e instanceof RecordsChangedError) return {skipped:'Daten inzwischen geaendert'}; throw e; }
  r.auto.forEach(a => { L.state.adjustments[a.id] = a; });
  msgs.forEach(m => { L.state.coachMsgs[m.id] = m; });
  if (opts.L) Object.assign(opts.L, L);
  await setMeta(env, uid, 'analysis_last', { at: t, trigger, sig: sourceSignature });
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
