import {effectiveCustomWorkouts} from './store';
/* Abgeleitete Daten für die Bildschirme, pro Zeichnen einmal berechnet. */
import * as C from '../../shared/core';
import { readinessInputs, readinessSnapshot } from '../../shared/readiness';
import { STATE, PLAN, BASE_WEEKS, DAYS, SESS, findDay, profile, goals, saveSoon } from './store';
import { todayStr } from './util';
import { sleepNeed, isMinor, ageOf, type Profile } from '../../shared/profile';
import { mainGoal, goalSports, type Goal } from '../../shared/goals';
import { sportScores, formScore, legacyActivities, namedFromPlan, estimatesAt, rescoreNotes, SCORE_MODEL, type SportSport } from './data-types';
import { prognosis, correctionFromGoals, planFactsOf, goalPrognoses, goalMismatches, lastMove, trendHistory, type Move, type Prognosis, type PlanFacts, type GoalProg } from '../../shared/prognosis';
import { raceModeGoal, recentRace } from '../../shared/race';
import type { EngineCtx } from '../../shared/coach/engine';
import type { Activity } from '../../shared/activity/analyze';
import { duplicateMsgIds, compactDecided } from '../../shared/coach/feed';

export interface Derived {
  today: string; profile: Profile; goals: Goal[]; goal: Goal | null; minor: boolean; age: number | null;
  fallback: any; readiness: any; history: any[]; ill: any; ret: any;
  activities: Activity[]; scores: any[]; form: any; prognosis: Prognosis | null;
  /** Auftrag 23: Prognose für jedes Ziel mit Datum oder Platzhalter-Termin, das nächste zuerst */
  prognoses: GoalProg[]; raceGoal: Goal | null; recentRace: Goal | null;
  /** Auftrag 24: Ziele, die nicht zu den gewählten Sportarten passen (Hinweis statt Prognose) */
  mismatches: { goal: Goal; missing: string[] }[];
  loadsBySport: Record<string, Record<string, number>>; engine: EngineCtx;
}
let cache: Derived | null = null;
let lastInp: any = null;
/* Prognose für ein Ziel am Renntag (beim Eintragen des Ergebnisses), ohne Korrektur aus diesem Rennen */
export function prognosisFor(goal: Goal, date: string): Prognosis | null {
  D(); if (!lastInp) return null;
  try {
    const inp = { ...lastInp, goal, today: date };
    return prognosis(goal, estimatesAt(inp, date), { profile: lastInp.profile, today: date, history: trendHistory(x => estimatesAt(inp, x), date), plan: planFacts(goal, date), correction: correctionFromGoals(goals().filter(g => g.id !== goal.id && (!g.date || g.date < date))) });
  } catch (e) { return null; }
}
export function invalidate() { cache = null; }
/* Auftrag 23: Prognose für ein (auch gerade bearbeitetes) Ziel mit allen Daten – dieselbe Rechnung wie im Fortschritt */
export function goalPrognosis(goal: Goal): Prognosis | null {
  const d = D(); if (!lastInp || !goal.date || goal.type === 'fitness') return null;
  try { return prognosis(goal, estimatesAt(lastInp, d.today), { profile: d.profile, today: d.today, ill: d.ill ? d.ill.start : null, history: trendHistory(x => estimatesAt(lastInp, x), d.today), plan: planFacts(goal, d.today), correction: correctionFromGoals(d.goals) }); } catch (e) { return null; }
}
/* Auftrag 23: Was hat die Prognose eines Ziels zuletzt bewegt (Einheit, Test oder Wettkampf)? Erst beim Anzeigen gerechnet, je Datenstand gemerkt. */
const moveCache = new Map<string, Move | null>();
export function progMove(goal: Goal): Move | null {
  const d = D(); if (!lastInp) return null;
  const key = [goal.id, goal.date, d.today, d.activities.length, d.activities.length ? d.activities[d.activities.length - 1].date : '', JSON.stringify(goal.result || null), (d.goals || []).filter(g => g.result).length].join('|');
  if (moveCache.has(key)) return moveCache.get(key)!;
  let m: Move | null = null;
  try {
    const inp = lastInp; const gl = d.goals;
    const dates = [...d.activities.map((a: any) => a.date), ...gl.filter(g => g.result && g.date).map(g => g.date!)].filter(x => x && x >= C.addDays(d.today, -90));
    const ests = new Map<string, any>(); const estAt = (x: string) => { if (!ests.has(x)) ests.set(x, estimatesAt(inp, x)); return ests.get(x); };
    m = lastMove(goal, estAt, dates, { profile: d.profile, today: d.today, plan: planFacts(goal, d.today), corrAt: x => correctionFromGoals(gl.filter(g => g.date && g.date <= x)) });
  } catch (e) { m = null; }
  if (moveCache.size > 30) moveCache.clear();
  moveCache.set(key, m); return m;
}
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
    // Auftrag 21: doppelte Coach-Meldungen (gleicher Anlass) aufräumen; die Löschung geht per Abgleich auch an den Server
    const dups = duplicateMsgIds(Object.values(STATE.coachMsgs || {}));
    if (dups.length) { dups.forEach(id => { delete STATE.coachMsgs[id]; }); changed = true; }
    for (const m of Object.values(STATE.coachMsgs || {}) as any[]) { const c = compactDecided(m, Date.now()); if (c) { STATE.coachMsgs[m.id] = c; changed = true; } }
    if (changed) saveSoon();
  } catch (e) { /* Anzeige geht vor */ }
}
/* Geplantes Training bis zum Rennen: längster Lauf, längste Fahrt, Koppeleinheiten (für die Prognose am Renntag) */
export function planFacts(goal: Goal | null, today: string): PlanFacts {
  return planFactsOf(SESS, (s: any) => !!(STATE.sessions[s.id] || {}).completed, effectiveCustomWorkouts() || {}, goal, today, C.isTestOrRace);
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
  // Auftrag 24: nur gewählte Sportarten (vorher kamen die Sportarten des Ziels dazu, auch wenn man sie nicht trainiert); ohne Wahl die des Ziels
  const chosenScore = (['swim', 'bike', 'run', 'strength'] as SportSport[]).filter(s => (prof.sports || []).includes(s as any));
  const scoreSports = chosenScore.length ? chosenScore : (['swim', 'bike', 'run'] as SportSport[]).filter(s => goal && goalSports(goal).includes(s as any));
  lastInp = inp;
  const scores = sportScores(inp, scoreSports.length ? scoreSports : ['run']);
  const form = formScore(inp);
  let prog: Prognosis | null = null;
  let progs: GoalProg[] = [];
  try {
    // Auftrag 24: Trend aus mehreren Ständen (12, 8, 5 Wochen zurück), nur wo es damals eigene Daten gab; krank = Pause läuft
    const est = estimatesAt(inp, today), history = trendHistory(x => estimatesAt(inp, x), today), correction = correctionFromGoals(gl);
    progs = goalPrognoses(gl, PLAN.meta || {}, today, est, { profile: prof, history, correction, ill: ill ? ill.start : null, planFor: g => planFacts(g, today) });
    const own = goal && progs.find(x => x.goal.id === goal.id);
    prog = own ? own.p : goal ? prognosis(goal, est, { profile: prof, today, history, plan: planFacts(goal, today), correction, ill: ill ? ill.start : null }) : null;
  } catch (e) { prog = null; }
  const state = { ...STATE, profile: prof, settings: { ...STATE.settings, readiness: fallback } };
  return {
    today, profile: prof, goals: gl, goal, minor: isMinor(prof, today), age: ageOf(prof, today), fallback, readiness, history, ill, ret,
    activities: acts, scores, form, prognosis: prog, prognoses: progs, mismatches: goalMismatches(gl, PLAN.meta || {}, today, prof.sports), raceGoal: raceModeGoal(gl, today), recentRace: recentRace(gl, today), loadsBySport,
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
