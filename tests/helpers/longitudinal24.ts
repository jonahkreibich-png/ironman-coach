/** SIMULATED software trajectories only; no network, accounts or biological predictions. */
import * as C from '../../shared/core';
import { applyOnboarding } from '../../shared/onboarding';
import { replanPlan, extendPlan } from '../../shared/replan';
import { dayCap } from '../../shared/plangen';
import { checkPlanRules } from '../../shared/planrules';
import { checkIntensity } from '../../shared/intensity';
import { runEngine } from '../../shared/coach/engine';
import { PERSONAS } from '../../fixtures/personas';
import { manyUsers20 } from '../../fixtures/users20';
import { sportScores, legacyActivities } from '../../shared/scores';
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
export const SIM_START = '2026-10-26';
export const HORIZONS = [4, 12, 24, 52] as const;
export const SIM_PROFILES = [
  ['beginner', 'einsteiger-sprint'], ['experienced', 'erfahren-md-marathon'],
  ['high-volume', 'langdistanz-profi'], ['student-football', 'jugend-langdistanz'],
  ['irregular', 'olympisch-erfahren'], ['manual-corrections', 'erfahren-md-marathon'],
  ['missing-data', 'einsteiger-sprint'], ['plateau', 'olympisch-erfahren'],
  ['pause-return', 'vater-rad-lauf'], ['ambitious-short', 'laeuferin-hm'],
].map(([id, persona]) => {
  const answers = copy(PERSONAS.find(p => p.id === persona)!.answers);
  if (answers.sports.includes('swim')) answers.swimGear = ['board', 'buoy'];
  if (id === 'missing-data') Object.assign(answers, { bikes: manyUsers20()[0].answers.bikes, powerMeter: false, wantTests: false });
  if (id === 'ambitious-short') { answers.goals[0].date = C.addDays(SIM_START, 35); answers.weeklyHours = 3; }
  answers.goals.push({ id: 'sim-next', type: answers.goals[0].type, name: 'SIMULATED next season', date: C.addDays(SIM_START, 560), priority: 'B' });
  return { id: 'SIMULATED-' + id, type: id, answers };
});
export interface Sim24 {
  id: string; weeks: number; days: number; checkpoints: number; replans: number; extensions: number;
  completed: number; partial: number; missed: number; corrections: number; football: number;
  events: Record<string, number>; failures: string[]; sessions: number; engineCalls: number;
  maxDailySessions: number; maxWeeklyMinutes: number; elapsedMs: number; phases: string[];
}
export async function simulateLongitudinal24(user: typeof SIM_PROFILES[number], weeks: number, seed = 2401): Promise<Sim24> {
  const began = performance.now();
  let rng = seed + user.id.split('').reduce((n, c) => n + c.charCodeAt(0), 0);
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  const out: Sim24 = { id: user.id, weeks, days: 0, checkpoints: 0, replans: 0, extensions: 0, completed: 0, partial: 0, missed: 0, corrections: 0, football: 0, events: {}, failures: [], sessions: 0, engineCalls: 0, maxDailySessions: 0, maxWeeklyMinutes: 0, elapsedMs: 0, phases: [] };
  const fail = (ok: boolean, text: string) => { if (!ok && out.failures.length < 30) out.failures.push(text); };
  const event = (name: string) => { out.events[name] = (out.events[name] || 0) + 1; };
  const initial = applyOnboarding(copy(user.answers), SIM_START);
  if (!initial.gen) throw new Error('SIMULATED onboarding failed: ' + user.id);
  let profile: any = initial.profile, goals: any[] = initial.goals, plan: any = initial.gen.plan;
  const state: any = { profile, sessions: {}, customWorkouts: {}, trend: [], illnessPeriods: [], adjustments: {}, coachMsgs: {}, settings: {}, activities: {}, nutrition: {} };
  // Independent executed-minute/RPE ledger; never calls plannedLoad/sessionLoad.
  const ledger = new Map<string, { date: string; min: number; rpe: number }>();
  // Experienced trajectories start with an actual synthetic diary, not just declared years.
  if (['experienced', 'high-volume', 'plateau'].includes(user.type)) for (let d = -56; d < 0; d += 2) {
    const date = C.addDays(SIM_START, d), id = 'SIMULATED-history-' + d;
    const min = user.type === 'high-volume' ? 90 : user.type === 'experienced' ? 60 : 45;
    const sport = d % 4 === 0 ? 'run' : 'bike';
    state.customWorkouts[date] = [{ id, title: id, sport, completed: true, metrics: { min, km: min / (sport === 'run' ? 6 : 2.5) }, rpe: 4 }];
    ledger.set(id, { date, min, rpe: 4 }); event('seeded-history');
  }
  const corrected = new Map<string, number>();
  const initialCrawl = profile.skills?.swimCrawlM || 0;
  const engine = (date: string, type: 'weekly' | 'daily' | 'activity', sessionIds: string[] = []) => {
    const now = Date.parse(date + 'T19:00:00Z');
    const result = runEngine({ today: date, now, state, baseWeeks: plan.weeks, planMeta: plan.meta, profile, goals }, type === 'activity' ? { type, sessionIds } : { type });
    out.engineCalls++;
    for (const msg of result.messages) state.coachMsgs[msg.id] = msg;
    for (const adj of result.adjustments) state.adjustments[adj.id] = { ...adj, createdAt: now };
  };
  for (let k = 0; k < weeks * 7; k++) {
    const date = C.addDays(SIM_START, k); out.days++;
    const fatigue = k % 35 === 17;
    state.trend.push({ date, hrv: fatigue ? 25 : 60 + Math.round(random() * 8), restingHR: fatigue ? 78 : 52 + Math.round(random() * 4), sleepHours: fatigue ? 4 : 8, feel: fatigue ? 1 : 4 });
    if (fatigue) { event('fatigue'); engine(date, 'daily'); }
    if (k === 12) { Object.assign(state.trend.at(-1), { ctl: 35, atl: 42, _manual: { ctl: true, atl: true } }); event('manual-load-anchor'); }
    const paused = user.type === 'pause-return' && k >= 14 && k < 49;
    if (paused) event('pause-day');
    const day = C.planDays(C.applyAdjustments(plan.weeks, state.adjustments)).find((d: any) => d.date === date);
    const active = (day?.sessions || []).filter((s: any) => s && s.sport !== 'rest' && !s.cancelled);
    out.maxDailySessions = Math.max(out.maxDailySessions, active.length);
    const executed: string[] = [];
    for (const s of active) {
      const roll = random();
      if (paused || roll < (user.type === 'irregular' ? 0.6 : 0.18)) { state.sessions[s.id] = { skipped: true, skipReason: 'SIMULATED unavailable' }; out.missed++; continue; }
      const partial = roll < (user.type === 'irregular' ? 0.75 : 0.4);
      const min = Math.max(1, Math.round((s.plannedMinutes || 30) * (partial ? 0.5 : 0.95))), rpe = s.sport === 'football' ? 7 : 4;
      state.sessions[s.id] = { completed: true, metrics: { min }, rpe, completedAt: Date.parse(date + 'T18:00:00Z') };
      if (user.type !== 'missing-data' && ['run', 'bike'].includes(s.sport)) state.sessions[s.id].metrics.km = min / (s.sport === 'run' ? 6 : 2.5);
      ledger.set(s.id, { date, min, rpe }); executed.push(s.id); out.completed++; if (partial) out.partial++;
      if (s.sport === 'football') out.football++;
    }
    if (user.type === 'student-football' && k % 28 === 8) {
      const id = 'SIMULATED-game-' + k;
      state.customWorkouts[date] = [{ id, title: 'SIMULATED extra football', sport: 'football', completed: true, metrics: { min: 80 }, rpe: 7 }];
      ledger.set(id, { date, min: 80, rpe: 7 }); out.football++; event('extra-football');
    }
    if (k % (user.type === 'manual-corrections' ? 7 : 14) === (user.type === 'manual-corrections' ? 6 : 13) && ledger.size) {
      const id = [...ledger.keys()].at(-1)!;
      if (state.sessions[id]) {
        const entry = ledger.get(id)!; entry.min = Math.max(1, Math.round(entry.min / 2));
        const oldMin = state.sessions[id].metrics.min;
        if (state.sessions[id].metrics.km != null) state.sessions[id].metrics.km *= entry.min / oldMin;
        state.sessions[id].metrics.min = entry.min; state.sessions[id].metricsManual = { min: true };
        corrected.set(id, entry.min); out.corrections++; event('retroactive-correction'); engine(date, 'activity', [id]);
      }
    }
    if (user.type === 'missing-data' && executed.length) event('missing-measurements');
    if (user.type === 'plateau') event('unchanged-performance');
    if (k >= 63 && !out.events['synthetic-personal-best'] && executed.length && user.type === 'experienced') {
      const id = executed.find(id => state.sessions[id].metrics.km != null);
      if (id) { state.sessions[id].metrics.km *= 1.06; event('synthetic-personal-best'); engine(date, 'activity', [id]); }
    }
    if (k === 18) {
      const id = 'SIMULATED-import-outlier';
      (state.customWorkouts[date] ||= []).push({ id, title: id, sport: 'run', source: 'SIMULATED import', completed: true, metrics: { min: 20, hr: -999, power: -999 }, rpe: 4 });
      ledger.set(id, { date, min: 20, rpe: 4 }); event('invalid-import-outlier');
    }
    if (k === 20 || k === 55 || k === 83) {
      if (k === 20) { profile = { ...profile, skills: { ...profile.skills, swimGear: [] } }; event('equipment-change'); }
      if (k === 55) { profile = { ...profile, weeklyHours: Math.max(2, profile.weeklyHours * 0.8), dayLoad: { ...profile.dayLoad, 3: 0 } }; event('availability-change'); }
      if (k === 83) { goals = goals.map(g => ({ ...g, date: g.id === 'sim-next' ? C.addDays(g.date, 28) : g.date })); event('goal-change'); }
      state.profile = profile;
    }
    if (k % 28 === 20 || k === 55 || k === 83) {
      const before = copy(C.planDays(plan.weeks).filter((d: any) => d.date < date));
      const next = replanPlan(plan, profile, goals, date, { state, adjustments: state.adjustments, from: date });
      fail(!!next, `${date}: replan missing`);
      if (next) {
        plan = next.plan; out.replans++;
        const pastAfter = C.planDays(plan.weeks).filter((d: any) => d.date < date);
        const changedDay = pastAfter.find((d: any, i: number) => JSON.stringify(d) !== JSON.stringify(before[i]));
        if (changedDay) console.info('SIM24_HISTORY_DIFF', JSON.stringify({ date, before: before.find((d: any) => d.date === changedDay.date), after: changedDay }));
        fail(!changedDay, `${date}: historical plan changed`);
        for (const [id, min] of corrected) fail(state.sessions[id]?.metrics?.min === min, `${date}: correction lost ${id}`);
      }
    }
    if (k % 7 !== 6) continue;
    // Let the worker receive RPC acknowledgements during CPU-heavy virtual years.
    await new Promise<void>(resolve => setImmediate(resolve));
    out.checkpoints++; engine(date, 'weekly');
    const upcoming = plan.weeks.filter((w: any) => w.startDate > date).slice(0, 2);
    for (const issue of checkPlanRules(upcoming, profile)) fail(false, date + ': ' + issue.rule + ' ' + issue.msg);
    for (const issue of checkIntensity(upcoming, profile, date)) if (issue.rule === 'adjacent') fail(false, date + ': hard adjacent ' + issue.msg);
    for (const d of C.planDays(upcoming)) {
      const ownMin = d.sessions.filter((s: any) => !s.fixed && !s.race && !s.cancelled && !['rest', 'football'].includes(s.sport)).reduce((n: number, s: any) => n + (s.plannedMinutes || 0), 0);
      if (!d.sessions.some((s: any) => s.race)) fail(ownMin <= dayCap(profile, new Date(d.date + 'T12:00:00Z').getUTCDay()) + 5, d.date + ': daily availability exceeded');
    }
    const extended = extendPlan(plan, profile, goals, date);
    if (extended) { fail(JSON.stringify(extended.weeks.slice(0, plan.weeks.length)) === JSON.stringify(plan.weeks), `${date}: extension rewrote existing weeks`); plan = extended; out.extensions++; }
    const loads: Record<string, number> = {};
    for (const x of ledger.values()) loads[x.date] = (loads[x.date] || 0) + Math.round(x.min * 100 * (x.rpe / 9) ** 2 / 60);
    fail(JSON.stringify(Object.entries(C.dailyLoads(state, plan.weeks)).sort()) === JSON.stringify(Object.entries(loads).sort()), `${date}: loads disagree with executed ledger`);
    const series = C.ownLoadSeries(state, plan.weeks, date);
    let ctl = 0, atl = 0;
    const first = [...Object.keys(loads), ...state.trend.filter((p: any) => p._manual).map((p: any) => p.date)].sort()[0];
    if (first) for (let d = first; d <= date; d = C.addDays(d, 1)) {
      ctl = ctl * 41 / 42 + (loads[d] || 0) / 42; atl = atl * 6 / 7 + (loads[d] || 0) / 7;
      const anchor = state.trend.find((p: any) => p.date === d && p._manual); if (anchor) { ctl = anchor.ctl; atl = anchor.atl; }
    }
    const last = series.at(-1);
    if (last) {
      fail(Math.abs(last.ctl - ctl) <= 0.051 && Math.abs(last.atl - atl) <= 0.051, `${date}: recurrence mismatch`);
      fail(Math.abs(last.tsb - (ctl - atl)) <= 0.051 && Number.isFinite(last.loadRatio ?? 0) && (ctl <= 0 ? last.loadRatio == null : Math.abs(last.loadRatio - atl / ctl) <= 0.00051), `${date}: derived load invalid`);
    }
    const week = plan.weeks.find((w: any) => w.startDate <= date && w.endDate >= date);
    if (week) {
      if (!out.phases.includes(week.phase)) out.phases.push(week.phase);
      const own = week.days.flatMap((d: any) => d.sessions.map((s: any) => ({ ...s, _simdate: d.date }))).filter((s: any) => !s.fixed && !s.race && !s.cancelled && !['rest', 'football'].includes(s.sport));
      const ownMinutes = (w: any) => w.days.flatMap((d: any) => d.sessions).filter((s: any) => !s.fixed && !s.race && !s.cancelled && !['rest', 'football'].includes(s.sport)).reduce((n: number, s: any) => n + (s.plannedMinutes || 0), 0);
      const previousNormal = plan.weeks.filter((w: any) => w.startDate < week.startDate && !w.isRecoveryWeek && !w.partial && !w.reduced && !w.entry && !['taper', 'race'].includes(w.phase)).at(-1);
      if (week.isRecoveryWeek) event('recovery-week');
      if (week.phase === 'taper') event('taper-week');
      if (week.isRecoveryWeek && !week.partial && previousNormal && ownMinutes(previousNormal) >= 90) fail(ownMinutes(week) <= ownMinutes(previousNormal) * 0.9 + 5, date + ': recovery not lighter');
      const minutes = own.reduce((n: number, s: any) => n + (s.plannedMinutes || 0), 0); out.maxWeeklyMinutes = Math.max(out.maxWeeklyMinutes, minutes);
      fail(minutes <= profile.weeklyHours * 60 * 1.1 + 10, `${date}: weekly availability exceeded ${minutes}/${profile.weeklyHours * 60}`);
      for (const s of own) {
        fail(Number.isFinite(s.plannedMinutes) && s.plannedMinutes > 0, `${date}: invalid duration`);
        if (s.sport === 'swim') for (const step of s.spec?.steps || []) {
          fail((step.gear || []).every((g: string) => (s._simdate <= C.addDays(SIM_START, 20) ? user.answers.swimGear || [] : profile.skills?.swimGear || []).includes(g)), `${date}: unavailable gear`);
          if (step.mode === 'crawl' && initialCrawl > 0 && initialCrawl < 400) fail((step.m || 0) <= initialCrawl, `${date}: evidence-free crawl increase ${step.m}/${initialCrawl}`);
        }
      }
    }
    if (k % 28 === 27) {
      const scores = sportScores({ today: date, activities: legacyActivities(state, plan.weeks, profile), trend: state.trend, illness: [], profile, goal: goals[0] } as any);
      for (const score of scores) fail(Number.isFinite(score.score), `${date}: nonfinite score`); event('score-check');
    }
  }
  out.sessions = ledger.size; out.elapsedMs = performance.now() - began; return out;
}
