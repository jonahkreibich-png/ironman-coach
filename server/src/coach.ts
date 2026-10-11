/* Phase 4 auf dem Server: tägliche und wöchentliche Plan-Anpassungen.
   Die Regeln stehen in core.js (gemeinsam mit der App). Der Plan des Coachs bleibt unverändert,
   Anpassungen sind eigene Datensätze (kind "adjust") mit Rückgängig. */
import * as C from '../../shared/core';
import { type Env, berlinParts, getRecord, getRecords, putRecords, getMeta, setMeta } from './store';


export async function loadState(env: Env, uid: number): Promise<any> {
  const [planRec, settingsRec, sessions, customs, trend, illness, weekNotes, adjustments, nutrition] = await Promise.all([
    getRecord(env, uid, 'plan', 'main'), getRecord(env, uid, 'settings', 'main'),
    getRecords(env, uid, 'session'), getRecords(env, uid, 'custom'), getRecords(env, uid, 'trend'),
    getRecords(env, uid, 'illness'), getRecords(env, uid, 'weekNote'), getRecords(env, uid, 'adjust'), getRecords(env, uid, 'nutrition')
  ]);
  const customWorkouts: any = {};
  Object.values(customs).forEach(w => { if (w && w.date) (customWorkouts[w.date] = customWorkouts[w.date] || []).push(w); });
  const plan = planRec ? planRec.data : null;
  return {
    plan, baseWeeks: (plan && plan.weeks) || [], planMeta: (plan && plan.meta) || {},
    nutritionProfile: (settingsRec && settingsRec.data && settingsRec.data.nutritionProfile) || null,
    state: {
      sessions, customWorkouts, weekNotes, adjustments, nutrition,
      trend: Object.values(trend).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date)),
      illnessPeriods: Object.values(illness).filter(Boolean),
      settings: (settingsRec && settingsRec.data && settingsRec.data.settings) || {}
    }
  };
}

async function save(env: Env, uid: number, list: any[]) {
  if (!list.length) return;
  const t = Date.now();
  await putRecords(env, uid, list.map((a, i) => ({ kind: 'adjust', key: a.id, data: a, updatedAt: t + i })));
}

/* Täglich morgens nach dem Abruf, einmal pro Tag. force: auch wenn heute schon gelaufen. */
export async function runDaily(env: Env, uid: number, opts?: any): Promise<any> {
  opts = opts || {};
  const b = berlinParts();
  const done = await getMeta(env, uid, 'daily_done');
  if (!opts.force && done === b.date) return { skipped: 'heute schon erledigt' };
  const L = await loadState(env, uid);
  if (!L.plan) return { skipped: 'kein Plan' };
  const today = L.state.trend.find(p => p.date === b.date);
  // Auf die Morgenwerte warten, höchstens bis 10 Uhr
  if (!opts.force && !C.hasRecovery(today) && b.hour < 10) return { skipped: 'warte auf Morgenwerte' };
  const list = C.dailyAdjustments(L.state, L.baseWeeks, b.date, { planMeta: L.planMeta });
  await save(env, uid, list);
  await setMeta(env, uid, 'daily_done', b.date);
  return { date: b.date, created: list.length, adjustments: list };
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
  const out = C.weeklyAdjustments(L.state, L.baseWeeks, date, { planMeta: L.planMeta });
  await save(env, uid, out.adjustments);
  await setMeta(env, uid, 'weekly_done', b.date);
  return { date, created: out.adjustments.length, adjustments: out.adjustments, summary: out.summary };
}
