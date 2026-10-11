/* Abgeleitete Daten für die Bildschirme, pro Zeichnen einmal berechnet. */
import * as C from '../../shared/core';
import { STATE, PLAN, BASE_WEEKS, DAYS, SESS, findDay, profile, goals } from './store';
import { todayStr } from './util';
import { sleepNeed, isMinor, ageOf, type Profile } from '../../shared/profile';
import { mainGoal, type Goal } from '../../shared/goals';
import { sportScores, formScore, legacyActivities, estimatesAt, type SportSport } from './data-types';
import { prognosis, type Prognosis } from '../../shared/prognosis';
import { raceModeGoal, recentRace } from '../../shared/race';
import type { EngineCtx } from '../../shared/coach/engine';
import type { Activity } from '../../shared/activity/analyze';

export interface Derived {
  today: string; profile: Profile; goals: Goal[]; goal: Goal | null; minor: boolean; age: number | null;
  fallback: any; readiness: any; history: any[]; ill: any; ret: any;
  activities: Activity[]; scores: any[]; form: any; prognosis: Prognosis | null; raceGoal: Goal | null; recentRace: Goal | null;
  loadsBySport: Record<string, Record<string, number>>; engine: EngineCtx;
}
let cache: Derived | null = null;
export function invalidate() { cache = null; }
export function D(): Derived { if (!cache) cache = compute(); return cache; }

function compute(): Derived {
  const today = todayStr();
  const prof = profile();
  const gl = goals();
  const goal = mainGoal(gl, today);
  const fallback = { ...(STATE.settings.readiness || {}), sleepNeed: sleepNeed(prof, today) };
  const readiness = C.readinessFor(STATE.trend, STATE.illnessPeriods, today, fallback);
  const history = C.readinessHistory(STATE.trend, STATE.illnessPeriods, today, 14, fallback);
  const ill = C.illnessAt(STATE.illnessPeriods, today);
  const ret = returnPhase(today);
  const acts: Activity[] = [...(Object.values(STATE.activities || {}) as Activity[]).filter(a => a && !a.mergedInto), ...legacyActivities(STATE, BASE_WEEKS.length ? PLAN.weeks : [], prof)];
  // Belastung je Sport (für die Gesamt-Form)
  const loadsBySport: Record<string, Record<string, number>> = {};
  const thr = prof.thresholds;
  SESS.forEach(s => { const st = STATE.sessions[s.id]; if (st && st.completed && s.sport !== 'rest') { const m = (loadsBySport[s.sport] = loadsBySport[s.sport] || {}); m[s.date] = (m[s.date] || 0) + C.sessionLoad(s, st, thr); } });
  Object.entries(STATE.customWorkouts || {}).forEach(([d, l]: any) => (l || []).forEach((w: any) => { const m = (loadsBySport[w.sport] = loadsBySport[w.sport] || {}); m[d] = (m[d] || 0) + C.sessionLoad({ sport: w.sport, title: w.title, plannedMinutes: w.plannedMinutes }, w, thr); }));
  const cal = PLAN.meta && PLAN.meta.scoreCalibration;
  const inp = { today, activities: acts, trend: STATE.trend, illness: STATE.illnessPeriods, profile: prof, goal, calibration: cal || null, manualAdjust: STATE.scoreAdjust, loadsBySport };
  const scoreSports = (['swim', 'bike', 'run', 'strength'] as SportSport[]).filter(s => prof.sports.includes(s as any) || (goal && JSON.stringify(goal).includes(s)));
  const scores = sportScores(inp, scoreSports.length ? scoreSports : ['run']);
  const form = formScore(inp);
  const prog = goal ? prognosis(goal, estimatesAt(inp, today)) : null;
  const state = { ...STATE, profile: prof, settings: { ...STATE.settings, readiness: fallback } };
  return {
    today, profile: prof, goals: gl, goal, minor: isMinor(prof, today), age: ageOf(prof, today), fallback, readiness, history, ill, ret,
    activities: acts, scores, form, prognosis: prog, raceGoal: raceModeGoal(gl, today), recentRace: recentRace(gl, today), loadsBySport,
    engine: { today, now: Date.now(), state, baseWeeks: BASE_WEEKS, planMeta: PLAN.meta || {}, profile: prof, goals: gl }
  };
}

/* Wiedereinstieg nach Krankheit (Tag 1 = erster Tag ohne Symptome) */
export const RETURN_STAGES = ['return.s0', 'return.s1', 'return.s2', 'return.s3'];
export function returnPhase(date: string): { period: any; day: number; stage: number } | null {
  const ended = (STATE.illnessPeriods || []).filter((p: any) => p.end && p.end < date).sort((a: any, b: any) => b.end.localeCompare(a.end))[0];
  if (!ended) return null;
  const day = Math.round((+new Date(date + 'T12:00:00') - +new Date(ended.end + 'T12:00:00')) / 86400000);
  if (day > 8) return null;
  return { period: ended, day, stage: day <= 1 ? 0 : day <= 3 ? 1 : day <= 5 ? 2 : 3 };
}
export { findDay, DAYS, SESS };
