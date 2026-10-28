import {effectiveCustomWorkouts} from './store';
/* Abgeleitete Daten für die Bildschirme, pro Zeichnen einmal berechnet. */
import * as C from '../../shared/core';
import { readinessInputs, readinessSnapshot } from '../../shared/readiness';
import { STATE, PLAN, BASE_WEEKS, DAYS, SESS, findDay, profile, goals, saveSoon } from './store';
import { todayStr } from './util';
import { sleepNeed, isMinor, ageOf, type Profile } from '../../shared/profile';
import { mainGoal, type Goal } from '../../shared/goals';
import { sportScores, formScore, legacyActivities, namedFromPlan, estimatesAt, rescoreNotes, SCORE_MODEL, type SportSport } from './data-types';
import { prognosis, correctionFromGoals, type Prognosis, type PlanFacts } from '../../shared/prognosis';
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
let lastInp: any = null;
/* Prognose für ein Ziel am Renntag (beim Eintragen des Ergebnisses), ohne Korrektur aus diesem Rennen */
export function prognosisFor(goal: Goal, date: string): Prognosis | null {
  D(); if (!lastInp) return null;
  try {
    const inp = { ...lastInp, goal, today: date };
    const back = C.addDays(date, -70);
    return prognosis(goal, estimatesAt(inp, date), { profile: lastInp.profile, today: date, history: [{ date: back, est: estimatesAt(inp, back) }], plan: planFacts(goal, date), correction: correctionFromGoals(goals().filter(g => g.id !== goal.id && (!g.date || g.date < date))) });
  } catch (e) { return null; }
}
export function invalidate() { cache = null; }
export function D(): Derived { if (!cache || cache.today !== todayStr()) { cache = compute(); afterCompute(cache); } return cache; }

/* Etappenziele merken und erreichte im Coach melden (Auftrag 12). Die neue Score-Skala erklärt „Neu in dieser Version“. */
function afterCompute(d: Derived) {
  try {
    const S = (STATE.settings = STATE.settings || {});
    const stored = S.stageGoals || {};
    const next: Record<string, any> = Object.assign({}, ...d.scores.map((x: any) => x.stages || {}));
    const reached = d.scores.flatMap((x: any) => x.reached || []);
    let changed = false;
    if (JSON.stringify(next) !== JSON.stringify(stored)) { S.stageGoals = next; changed = true; }
    reached.forEach((r: any) => {
      const id = `msg-stage-${r.key}-${d.today}`; if (STATE.coachMsgs[id]) return;
      const nx = next[r.key]; const sc = d.scores.find((x: any) => r.key.startsWith(x.sport + '.'));
      const part = sc && sc.parts.find((p: any) => r.key.endsWith('.' + p.key)); const mark = part && part.marks.find((m: any) => m.kind === 'next');
      STATE.coachMsgs[id] = { id, at: Date.now(), date: d.today, kind: 'info', from: 'coach', title: 'Etappenziel erreicht 🎉', unread: true, important: true, text: r.text + (nx && mark ? ' ' + mark.text + '.' : '') };
      changed = true;
    });
    // Auftrag 20: neue Score-Rechnung einmal im Coach erklären (nur wer schon vorher Einheiten hatte, nur in den ersten 4 Wochen)
    if (S.scoreModel !== SCORE_MODEL && lastInp && d.activities.length) {
      const had = d.activities.some((a: any) => a.date < '2026-10-24');
      if (had && d.today <= '2026-11-21') rescoreNotes(lastInp, d.scores).forEach(n => {
        const id = `msg-rescore${SCORE_MODEL}-${n.sport}`; if (STATE.coachMsgs[id]) return;
        STATE.coachMsgs[id] = { id, at: Date.now(), date: d.today, kind: 'info', from: 'coach', title: 'Score neu berechnet', unread: true, text: n.text };
      });
      // erst merken, wenn Daten da sind (beim ersten Öffnen vor dem Abgleich ist der Stand noch leer)
      if (had || d.today > '2026-11-21') { S.scoreModel = SCORE_MODEL; changed = true; }
    }
    if (changed) saveSoon();
  } catch (e) { /* Anzeige geht vor */ }
}
/* Geplantes Training bis zum Rennen: längster Lauf, längste Fahrt, Koppeleinheiten (für die Prognose am Renntag) */
function planFacts(goal: Goal | null, today: string): PlanFacts {
  const out: PlanFacts = { longRunPlanned: null, longRidePlanned: null, bricksDone: 0, bricksPlanned: 0 };
  const brick = (s: any) => /koppel|brick/i.test(s.title || '') || (s.spec && s.spec.kind === 'brick');
  const end = goal && goal.date ? goal.date : today;
  SESS.forEach((s: any) => {
    if (s.cancelled || s.sport === 'rest') return;
    const st = STATE.sessions[s.id] || {};
    if (s.date < today) { if (st.completed && brick(s) && s.date >= C.addDays(today, -84)) out.bricksDone!++; return; }
    if (s.date >= end) return;
    if (brick(s)) out.bricksPlanned!++;
    if (s.sport === 'run' && !C.isHard(s)) out.longRunPlanned = Math.max(out.longRunPlanned || 0, s.plannedMinutes || 0);
    if (s.sport === 'bike' && !C.isHard(s)) out.longRidePlanned = Math.max(out.longRidePlanned || 0, s.plannedMinutes || 0);
  });
  Object.entries(effectiveCustomWorkouts() || {}).forEach(([d, l]: any) => (l || []).forEach((w: any) => { if (d >= C.addDays(today, -84) && d < today && /koppel|brick/i.test(w.title || '')) out.bricksDone!++; }));
  return out;
}

function compute(): Derived {
  const today = todayStr();
  const prof = profile();
  const gl = goals();
  const goal = mainGoal(gl, today);
  const fallback = readinessInputs(STATE, PLAN.weeks || [], prof, today);
  const readiness = readinessSnapshot(STATE, PLAN.weeks || [], prof, today);
  const history = C.readinessHistory(STATE.trend, STATE.illnessPeriods, today, 14, fallback);
  const ill = C.illnessAt(STATE.illnessPeriods, today);
  const ret = returnPhase(today);
  const acts: Activity[] = [...namedFromPlan(STATE, PLAN.weeks || [], C.recordedActivities(STATE)), ...legacyActivities(STATE, BASE_WEEKS.length ? PLAN.weeks : [], prof)];
  // Belastung je Sport (für die Gesamt-Form)
  const loadsBySport: Record<string, Record<string, number>> = {};
  C.dailyLoadEntries({ ...STATE, profile: prof }, PLAN.weeks).forEach(e => { const m = (loadsBySport[e.sport] = loadsBySport[e.sport] || {}); m[e.date] = (m[e.date] || 0) + e.load; });
  const cal = PLAN.meta && PLAN.meta.scoreCalibration;
  const inp = { today, activities: acts, trend: STATE.trend, illness: STATE.illnessPeriods, profile: prof, goal, calibration: cal || null, manualAdjust: STATE.scoreAdjust, loadsBySport, settings: STATE.settings, stages: (STATE.settings || {}).stageGoals || null };
  const scoreSports = (['swim', 'bike', 'run', 'strength'] as SportSport[]).filter(s => prof.sports.includes(s as any) || (goal && JSON.stringify(goal).includes(s)));
  lastInp = inp;
  const scores = sportScores(inp, scoreSports.length ? scoreSports : ['run']);
  const form = formScore(inp);
  let prog: Prognosis | null = null;
  try {
    const back = C.addDays(today, -70);
    prog = goal ? prognosis(goal, estimatesAt(inp, today), { profile: prof, today, history: [{ date: back, est: estimatesAt(inp, back) }], plan: planFacts(goal, today), correction: correctionFromGoals(gl) }) : null;
  } catch (e) { prog = null; }
  const state = { ...STATE, profile: prof, settings: { ...STATE.settings, readiness: fallback } };
  return {
    today, profile: prof, goals: gl, goal, minor: isMinor(prof, today), age: ageOf(prof, today), fallback, readiness, history, ill, ret,
    activities: acts, scores, form, prognosis: prog, raceGoal: raceModeGoal(gl, today), recentRace: recentRace(gl, today), loadsBySport,
    engine: { readinessSnapshot: readiness, today, now: Date.now(), state, baseWeeks: BASE_WEEKS, planMeta: PLAN.meta || {}, profile: prof, goals: gl }
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
