/* Phase 4 auf dem Server: tägliche und wöchentliche Plan-Anpassungen.
   Die Regeln stehen in core.js (gemeinsam mit der App). Der Plan des Coachs bleibt unverändert,
   Anpassungen sind eigene Datensätze (kind "adjust") mit Rückgängig. */
import '../../core.js';
import { berlinParts, getRecord, getRecords, putRecords, getMeta, setMeta } from './store.js';

const C = globalThis.CoachCore;

export async function loadState(env) {
  const [planRec, settingsRec, sessions, customs, trend, illness, weekNotes, adjustments] = await Promise.all([
    getRecord(env, 'plan', 'main'), getRecord(env, 'settings', 'main'),
    getRecords(env, 'session'), getRecords(env, 'custom'), getRecords(env, 'trend'),
    getRecords(env, 'illness'), getRecords(env, 'weekNote'), getRecords(env, 'adjust')
  ]);
  const customWorkouts = {};
  Object.values(customs).forEach(w => { if (w && w.date) (customWorkouts[w.date] = customWorkouts[w.date] || []).push(w); });
  const plan = planRec ? planRec.data : null;
  return {
    plan, baseWeeks: (plan && plan.weeks) || [], planMeta: (plan && plan.meta) || {},
    state: {
      sessions, customWorkouts, weekNotes, adjustments,
      trend: Object.values(trend).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date)),
      illnessPeriods: Object.values(illness).filter(Boolean),
      settings: (settingsRec && settingsRec.data && settingsRec.data.settings) || {}
    }
  };
}

async function save(env, list) {
  if (!list.length) return;
  const t = Date.now();
  await putRecords(env, list.map((a, i) => ({ kind: 'adjust', key: a.id, data: a, updatedAt: t + i })));
}

/* Täglich morgens nach dem Abruf, einmal pro Tag. force: auch wenn heute schon gelaufen. */
export async function runDaily(env, opts) {
  opts = opts || {};
  const b = berlinParts();
  const done = await getMeta(env, 'daily_done');
  if (!opts.force && done === b.date) return { skipped: 'heute schon erledigt' };
  const L = await loadState(env);
  if (!L.plan) return { skipped: 'kein Plan' };
  const today = L.state.trend.find(p => p.date === b.date);
  // Auf die Morgenwerte warten, höchstens bis 10 Uhr
  if (!opts.force && !C.hasRecovery(today) && b.hour < 10) return { skipped: 'warte auf Morgenwerte' };
  const list = C.dailyAdjustments(L.state, L.baseWeeks, b.date, { planMeta: L.planMeta });
  await save(env, list);
  await setMeta(env, 'daily_done', b.date);
  return { date: b.date, created: list.length, adjustments: list };
}

/* Sonntag 18 Uhr für die nächste Woche. */
export async function runWeekly(env, opts) {
  opts = opts || {};
  const b = berlinParts();
  const done = await getMeta(env, 'weekly_done');
  if (!opts.force && done === b.date) return { skipped: 'diese Woche schon erledigt' };
  const L = await loadState(env);
  if (!L.plan) return { skipped: 'kein Plan' };
  const date = opts.date || b.date;
  const out = C.weeklyAdjustments(L.state, L.baseWeeks, date, { planMeta: L.planMeta });
  await save(env, out.adjustments);
  await setMeta(env, 'weekly_done', b.date);
  return { date, created: out.adjustments.length, adjustments: out.adjustments, summary: out.summary };
}
