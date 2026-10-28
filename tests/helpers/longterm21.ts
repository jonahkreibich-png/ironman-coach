/* Auftrag 21, Punkt 8: Langzeit-Simulation mit erfundenen Nutzern (keine echten Personen, kein Netzwerk).
   36 Nutzer (verschiedene Ziele, Sportarten, Alter, Niveaus, mit/ohne Uhr, mit/ohne Teamsport, mit/ohne Hilfsmittel), je 13-26 Wochen
   Tag für Tag: Einheiten genau, kürzer, ausgelassen, extra; Werte mit Fortschritt oder Stagnation; Krankheit, Urlaub, Tests, Wettkampf,
   Korrekturen, Coach-Gespräche, neue Verbindung (Uhr ab Woche 4). Nach jeder simulierten Woche automatisch geprüft:
   Trainingsregeln, Scores (plausibel, keine Sprünge, steigen bei Fortschritt, nicht steigend in Pausen), Stufen nur nach Ist-Werten,
   Hilfsmittel, Coach-Texte (interne Texte, Wochentage, Artikel, unbelegte Aussagen), Prognose, keine Fehler.
   Baut auf der Simulation von Codex (longitudinal24) auf und nutzt dieselben Bausteine der App. */
import * as C from '../../shared/core';
import * as W from '../../shared/workouts';
import { applyOnboarding } from '../../shared/onboarding';
import { replanPlan, extendPlan } from '../../shared/replan';
import { checkTrainingRules } from '../../shared/trainingrules';
import { runEngine } from '../../shared/coach/engine';
import { converse } from '../../shared/coach/dialog';
import { internalLeaks, unsupportedClaims, claimFacts } from '../../shared/coach/claims';
import { swimBests, swimSkillUpdate } from '../../shared/swimskill';
import { sportScores, legacyActivities, estimatesAt } from '../../shared/scores';
import { prognosis } from '../../shared/prognosis';
import { mainGoal } from '../../shared/goals';
import { PERSONAS } from '../../fixtures/personas';
import { manyUsers20 } from '../../fixtures/users20';

const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
export const LT_START = '2026-11-02'; // Montag
export interface LtUser { id: string; label: string; answers: any; progress: boolean; watch: boolean; weeks: number; ill: boolean; vacation: boolean }
export function ltUsers(): LtUser[] {
  const base = [
    ...PERSONAS.slice(0, 6).map(p => ({ id: 'L-' + p.id, label: p.label, answers: copy(p.answers) })),
    ...manyUsers20().filter((_, i) => i % 5 !== 4).slice(0, 30).map(u => ({ id: 'L-' + u.id, label: u.label, answers: copy(u.answers), device: u.device }))
  ];
  return base.map((u: any, i) => {
    const a = u.answers;
    if (a.sports.includes('swim') && i % 3 === 0) a.swimGear = ['board', 'buoy'];
    if (a.sports.includes('swim') && i % 3 === 1) a.swimGear = [];
    return { id: u.id, label: u.label, answers: a, progress: i % 3 !== 2, watch: u.device ? u.device !== 'manual' : i % 2 === 0, weeks: 13 + (i * 5) % 14, ill: i % 3 === 0, vacation: i % 4 === 1 };
  });
}

export interface WeekPoint { week: number; date: string; scores: Record<string, number>; plannedMin: number; doneMin: number; swimStage: number | null; crawl: number; paused: boolean }
export interface LtResult { id: string; label: string; weeks: number; failures: { kind: string; text: string }[]; series: WeekPoint[]; counts: Record<string, number> }

const DOW = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const DOW_S = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const dowOf = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
function badDates(text: string, today: string): string[] {
  const out: string[] = [];
  for (const m of String(text || '').matchAll(/\b(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Mo|Di|Mi|Do|Fr|Sa|So)\.?,? (?:den )?(\d{1,2})\.(\d{1,2})\./g)) {
    const tm = +today.slice(5, 7); let y = +today.slice(0, 4); if (+m[3] < tm - 6) y++; if (+m[3] > tm + 6) y--;
    const real = dowOf(`${y}-${m[3].padStart(2, '0')}-${m[2].padStart(2, '0')}`);
    const named = DOW.indexOf(m[1]) >= 0 ? DOW.indexOf(m[1]) : DOW_S.indexOf(m[1]);
    if (named !== real) out.push(m[0]);
  }
  return out;
}

export async function simulateLongterm21(u: LtUser, seed = 2101): Promise<LtResult> {
  let rng = seed + u.id.split('').reduce((n, c) => n + c.charCodeAt(0), 0);
  const rnd = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  const res: LtResult = { id: u.id, label: u.label, weeks: u.weeks, failures: [], series: [], counts: {} };
  const fail = (kind: string, text: string) => { if (res.failures.filter(f => f.kind === kind).length < 5) res.failures.push({ kind, text }); };
  const count = (k: string) => { res.counts[k] = (res.counts[k] || 0) + 1; };
  const guard = <T>(kind: string, fn: () => T): T | null => { try { return fn(); } catch (e: any) { fail('Fehler im Ablauf', `${kind}: ${String(e && e.message || e).slice(0, 160)}`); return null; } };

  const init = guard('Fragebogen', () => applyOnboarding(copy(u.answers), LT_START));
  if (!init || !init.gen) { fail('Fehler im Ablauf', 'kein Plan'); return res; }
  let profile: any = init.profile, goals: any[] = init.goals, plan: any = init.gen.plan;
  const state: any = { profile, sessions: {}, customWorkouts: {}, trend: [], illnessPeriods: [], adjustments: {}, coachMsgs: {}, settings: {}, activities: {}, nutrition: {} };
  let dialog: any = {};
  const sports: string[] = (profile.sports || []).filter((s: string) => ['run', 'bike', 'swim', 'strength'].includes(s));
  const startCrawl = profile.skills?.swimCrawlM || 0;
  let crawlAbility = startCrawl, fit = 1; // Ist-Können und Form (Fortschritt oder Stagnation)
  const th = () => profile.thresholds || {};
  const illFrom = C.addDays(LT_START, 30), illTo = C.addDays(LT_START, 35);
  const vacFrom = C.addDays(LT_START, 55), vacTo = C.addDays(LT_START, 66);
  if (u.ill) state.illnessPeriods.push({ id: 'ill-1', start: illFrom, end: illTo, kind: 'cold', note: 'SIMULIERT Erkältung' });
  const engine = (date: string, ev: any) => guard('Coach-Engine', () => {
    const now = Date.parse(date + 'T19:00:00Z');
    const r = runEngine({ today: date, now, state, baseWeeks: plan.weeks, planMeta: plan.meta, profile, goals } as any, ev);
    for (const m of r.messages) state.coachMsgs[m.id] = m;
    for (const a of r.adjustments) state.adjustments[a.id] = { ...a, createdAt: now };
  });
  let prevScores: Record<string, number> | null = null;
  const firstScores: Record<string, number> = {};
  let doneWeek = 0;

  for (let k = 0; k < u.weeks * 7; k++) {
    const date = C.addDays(LT_START, k);
    const paused = (u.ill && date >= illFrom && date <= illTo) || (u.vacation && date >= vacFrom && date <= vacTo);
    if (u.progress && k % 7 === 0 && !paused) fit *= 1.004;
    if (paused && k % 7 === 0) fit *= 0.995;
    state.trend.push({ date, hrv: 55 + Math.round(rnd() * 10), restingHR: 52 + Math.round(rnd() * 4), sleepHours: 7 + Math.round(rnd() * 2) / 2 });
    const day = C.planDays(C.applyAdjustments(plan.weeks, state.adjustments)).find((d: any) => d.date === date);
    const active = (day?.sessions || []).filter((s: any) => s && s.sport !== 'rest' && !s.cancelled);
    const done: string[] = [];
    for (const s of active) {
      if (s.race) { if (!paused) { state.sessions[s.id] = { completed: true, metrics: { min: s.plannedMinutes || 60 }, rpe: 9 }; count('Wettkampf'); doneWeek += s.plannedMinutes || 60; } continue; }
      const roll = rnd();
      if (paused || roll < 0.12) { state.sessions[s.id] = { skipped: true, skipReason: paused ? 'krank/Urlaub' : 'keine Zeit' }; count('ausgelassen'); continue; }
      const short = roll < 0.32;
      const min = Math.max(5, Math.round((s.plannedMinutes || 30) * (short ? 0.6 + rnd() * 0.2 : 0.95 + rnd() * 0.1)));
      const hard = C.isHard(s) || C.isTestOrRace(s);
      const m: any = { min: String(min) };
      if (s.sport === 'run') {
        const thr = (th().thresholdPaceRunSec || 330) / fit; const pace = Math.round(thr * (hard ? 1.02 : 1.22)); m.km = String(Math.round(min * 60 / pace * 100) / 100);
        if (u.watch) m.hr = String(Math.round((th().lthrRun || 170) * (hard ? 0.95 : 0.8)));
        if (/test/i.test(s.title || '') && u.watch) { m.testHr = String(Math.round((th().lthrRun || 170) * 1.0)); m.testPace = `${Math.floor(thr / 60)}:${String(Math.round(thr % 60)).padStart(2, '0')}`; count('Test'); }
      } else if (s.sport === 'bike') {
        const v = (th().thresholdSpeedBikeKmh || 28) * fit * (hard ? 0.97 : 0.82); if (!/rolle|indoor|trainer/i.test(s.title || '')) m.km = String(Math.round(min / 60 * v * 10) / 10);
        if (u.watch) m.hr = String(Math.round((th().lthrBike || 165) * (hard ? 0.93 : 0.78)));
      } else if (s.sport === 'swim') {
        m.meters = String(Math.round(min * 20 * fit / 25) * 25);
        if (crawlAbility > 0) { m.longestCrawl = String(crawlAbility); if ((profile.skills?.swimGear || []).includes('buoy')) m.longestPull = String(crawlAbility); }
        if (u.watch) m.hr = String(125 + Math.round(rnd() * 10));
      } else if (s.sport === 'strength') m.area = 'full';
      state.sessions[s.id] = { completed: true, metrics: m, rpe: hard ? 7 : 4, feel: 2, ...(u.watch && k >= 28 ? { source: 'healthfit' } : {}) };
      done.push(s.id); doneWeek += min; count(short ? 'kürzer' : 'genau');
    }
    // Extra-Einheit (etwa jede 3. Woche)
    if (!paused && rnd() < 0.05 && sports.includes('run')) { (state.customWorkouts[date] ||= []).push({ id: 'x-' + k, date, sport: 'run', title: 'Extra-Lauf', completed: true, metrics: { min: '30', km: '5' }, rpe: 3 }); count('extra'); doneWeek += 30; }
    // Fortschritt im Schwimmen: alle 3 Wochen eine Strecke weiter (nur wer Fortschritt macht), echte Werte in den Einheiten
    if (u.progress && sports.includes('swim') && k % 21 === 20 && crawlAbility > 0 && crawlAbility < 400) { crawlAbility = Math.min(400, crawlAbility * 2); count('Schwimm-Fortschritt'); }
    // Korrektur alle 3 Wochen: die letzte Einheit kürzer eingetragen
    if (k % 21 === 10 && done.length) { const st = state.sessions[done[0]]; st.metrics.min = String(Math.max(5, Math.round(+st.metrics.min * 0.7))); st.metricsManual = { min: true }; for (const k of ['km', 'meters']) if (st.metrics[k] != null) { st.metrics[k] = String(Math.round(+st.metrics[k] * 0.7 * 100) / 100); st.metricsManual[k] = true; } count('Korrektur'); engine(date, { type: 'activity', sessionIds: [done[0]] }); }
    if (done.length) engine(date, { type: 'activity', sessionIds: done });
    // Schwimm-Stufe wie in der App (eingetragene Werte → Können, kommende Einheiten)
    if (sports.includes('swim') && done.length) guard('Schwimm-Stufe', () => {
      const best = swimBests(state, plan.weeks, date);
      const up = swimSkillUpdate(profile, plan.weeks, state.adjustments, date, best, Date.parse(date + 'T20:00:00Z'), undefined, state);
      if (up) { profile = { ...profile, skills: { ...profile.skills, ...up.skills } }; state.profile = profile; up.adjustments.forEach((a: any, i: number) => { state.adjustments[a.id] = { ...a, createdAt: Date.parse(date + 'T20:00:00Z') + i, date }; }); if (!up.silent) count('Schwimm-Meldung'); }
    });
    // Coach-Gespräch zweimal pro Woche
    if (k % 7 === 2 || k % 7 === 5) guard('Coach-Gespräch', () => {
      const tomorrow = C.addDays(date, 1);
      const say = [`Ich hab ${DOW[dowOf(tomorrow)]} keine Zeit`, 'Wie war meine Woche?', 'Warum ist heute locker?', 'Heute lieber locker', `Tausch ${DOW[dowOf(tomorrow)]} und ${DOW[dowOf(C.addDays(date, 3))]}`, 'Wie läuft es mit meinem Ziel?'][Math.floor(rnd() * 6)];
      const ctx: any = { today: date, now: Date.parse(date + 'T12:00:00Z'), state: { ...state, profile }, baseWeeks: plan.weeks, planMeta: plan.meta || {}, profile, goals };
      const r = converse(ctx, dialog, say); dialog = r.dialog; count('Gespräch');
      const texts = [r.reply.text, ...(r.reply.options || []).map((o: any) => o.label)];
      for (const t of texts) {
        if (internalLeaks(t).length) fail('Coach: interner Text', `${date} „${say}“: ${internalLeaks(t)[0]}`);
        const bd = badDates(t, date); if (bd.length) fail('Coach: falscher Wochentag', `${date} „${say}“: ${bd[0]}`);
      }
      let bad: string[] = []; try { bad = unsupportedClaims(r.reply.text, claimFacts(ctx)); } catch (e) { bad = []; }
      if (bad.length) fail('Coach: unbelegte Aussage', `${date} „${say}“: ${bad[0]}`);
      if (r.reply.pending) dialog = {}; // Rückfragen nicht weiter verfolgen (Plan bleibt unverändert)
    });
    // Neuplanung alle 4 Wochen (wie nach Änderungen in der App) und Verlängerung am Sonntag
    if (k % 28 === 27) guard('Neuplanung', () => { const n = replanPlan(plan, profile, goals, C.addDays(date, 1), { state, adjustments: state.adjustments, from: C.addDays(date, 1) }); if (n) { plan = n.plan; count('Neuplanung'); } });
    if (k % 7 !== 6) continue;

    // ---------- Prüfungen nach jeder Woche ----------
    engine(date, { type: 'weekly' });
    const ext = guard('Verlängerung', () => extendPlan(plan, profile, goals, date)); if (ext) plan = ext;
    const eff = C.applyAdjustments(plan.weeks, state.adjustments);
    const upcoming = eff.filter((w: any) => w.endDate > date).slice(0, 2);
    // Trainingsregeln (TRAININGSREGELN.md) für die nächsten 2 Wochen
    const runsAround = () => C.planDays(eff).filter((d: any) => d.date > C.addDays(date, -21) && d.date < C.addDays(date, 21)).flatMap((d: any) => d.sessions.filter((x: any) => x.sport === 'run' && (x.plannedMinutes || 0) >= 25).map((x: any) => [d.date, x.title, x.plannedMinutes, x._adj ? 'ADJ:' + x._adj.join(',') : '', (state.sessions[x.id] || {}).completed ? 'done' : '']));
    guard('Trainingsregeln', () => { for (const i of checkTrainingRules(upcoming, profile, { from: C.addDays(date, 1), goals } as any)) { fail('Trainingsregel: ' + i.rule, `${date}: ${i.msg}`); if (process.env.LT21_DEBUG === u.id) console.log('DBGR', date, i.rule, i.msg, JSON.stringify(runsAround())); } });
    // Hilfsmittel nur vorhandene; Stufe nur nach Ist-Werten
    const gear = profile.skills?.swimGear || [];
    const best = sports.includes('swim') ? swimBests(state, plan.weeks, date) : null;
    const proven = Math.max(best ? best.crawl : 0, startCrawl);
    let stage: number | null = null;
    for (const d of C.planDays(upcoming)) for (const s of d.sessions) if (s.sport === 'swim' && !s.cancelled) {
      for (const g of W.swimAids(s)) if (!gear.includes(g)) fail('Hilfsmittel fehlt', `${d.date}: ${g} in ${s.title}`);
      if (s.stage && s.stage.ladder === 'swim') { stage = Math.max(stage ?? 0, s.stage.n); const len = W.SWIM_STAGE_M[s.stage.n] || 0; if (len > Math.max(proven, 25)) fail('Stufe ohne Nachweis', `${d.date}: Stufe ${s.stage.n} (${len} m) bei nachgewiesen ${proven} m`); }
    }
    // Coach-Meldungen der Woche
    for (const m of Object.values(state.coachMsgs) as any[]) if (m && m.date > C.addDays(date, -7)) {
      for (const t of [m.title || '', m.text || '']) {
        if (internalLeaks(t).length) fail('Coach: interner Text', `${m.id}: ${internalLeaks(t)[0]}`);
        const bd = badDates(t, date); if (bd.length) fail('Coach: falscher Wochentag', `${m.id}: ${bd[0]}`);
      }
    }
    // Scores
    const goal = mainGoal(goals, date);
    const inp: any = { today: date, activities: legacyActivities(state, plan.weeks, profile), trend: state.trend, illness: state.illnessPeriods, profile, goal };
    const sc = guard('Scores', () => sportScores(inp, sports.length ? sports as any : ['run'])) || [];
    if (process.env.LT21_DEBUG === u.id) for (const x of sc) console.log('DBG', date, x.sport, x.score, JSON.stringify(x.parts.map((p: any) => [p.key, p.value, p.sub])), (x.why || []).join(' | '), '||', x.confText);
    const scores: Record<string, number> = {};
    for (const x of sc) {
      scores[x.sport] = x.score;
      if (!(Number.isFinite(x.score) && x.score >= 1 && x.score <= 120)) fail('Score ungültig', `${date} ${x.sport}: ${x.score}`);
      // Kraft: höchstens 3 Einheiten pro Woche im Plan → kein „Elite-Niveau“ (Regelmäßigkeit über das Jahr richtig gerechnet)
      if (x.sport === 'strength' && x.score > 90) fail('Score unplausibel', `${date} Kraft ${x.score} (${(x.parts[0] || {}).value})`);
      // ein großer Schritt braucht einen Grund in „Warum?“: Test oder harte Einheit mit Puls in dieser Woche (zählt stark)
      const reason = (x.why || []).some((t: string) => { const mm = /(\d\d)\.(\d\d)\./.exec(t); if (!/zählt stark/.test(t) || !mm) return false; const d = `${date.slice(0, 4)}-${mm[2]}-${mm[1]}`; return d > C.addDays(date, -7) && d <= date; });
      if (x.sport !== 'strength' && prevScores && prevScores[x.sport] != null && Math.abs(x.score - prevScores[x.sport]) > 10 && !reason) fail('Score-Sprung ohne Grund', `${date} ${x.sport}: ${prevScores[x.sport]} → ${x.score}`);
      if (prevScores && prevScores[x.sport] != null && Math.abs(x.score - prevScores[x.sport]) > 10 && reason) count('Score-Sprung mit Grund');
      if (firstScores[x.sport] == null) firstScores[x.sport] = x.score;
    }
    // ganze Woche ohne Training (krank oder Urlaub)
    const pausedWeek = (u.ill && C.addDays(date, -6) >= illFrom && date <= illTo) || (u.vacation && C.addDays(date, -6) >= vacFrom && date <= vacTo);
    if (pausedWeek && prevScores) for (const s of Object.keys(scores)) if (s !== 'strength' && prevScores[s] != null && scores[s] > prevScores[s] + 1) fail('Score steigt in der Pause', `${date} ${s}: ${prevScores[s]} → ${scores[s]}`);
    prevScores = scores;
    // Prognose plausibel
    if (goal && goal.type !== 'fitness') guard('Prognose', () => {
      const pg: any = prognosis(goal, estimatesAt(inp, date), { profile, today: date });
      if (pg && pg.ok && !(Number.isFinite(pg.total.best) && pg.total.low <= pg.total.best && pg.total.best <= pg.total.high && pg.total.best > 0)) fail('Prognose', `${date}: ${JSON.stringify(pg.total)}`);
    });
    const planned = C.planDays(eff.filter((w: any) => w.startDate <= date && w.endDate >= date)).flatMap((d: any) => d.sessions).filter((s: any) => !s.cancelled && s.sport !== 'rest' && !s.fixed).reduce((n: number, s: any) => n + (s.plannedMinutes || 0), 0);
    res.series.push({ week: res.series.length + 1, date, scores, plannedMin: planned, doneMin: doneWeek, swimStage: stage, crawl: profile.skills?.swimCrawlM || 0, paused: !!pausedWeek });
    doneWeek = 0;
    await new Promise<void>(r => setImmediate(r));
  }
  // Fortschritt: wer Fortschritt macht, endet beim Hauptscore nicht deutlich unter dem Start
  const last = res.series.at(-1);
  if (u.progress && last) for (const s of Object.keys(firstScores)) if (s !== 'strength' && last.scores[s] != null && last.scores[s] < firstScores[s] - 3) fail('Score fällt trotz Fortschritt', `${s}: ${firstScores[s]} → ${last.scores[s]}`);
  return res;
}
