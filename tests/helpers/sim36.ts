/** Auftrag 36, Punkt 5: große Simulation ohne Browser (Zeitraffer, ERFUNDENE Nutzer, keine echten Daten, kein Netz, keine KI).
 * 36 Nutzer (10 Test-Personen + 26 aus users20: Sportarten, Ziele, Niveaus, Alter 16–64, Geschlecht, Teamsport, Uhr bzw. Handeingabe,
 * faul bis fleißig) je 12–24 Monate. Täglich realistisch: Einheiten machen, auslassen, verschieben, umwandeln, kürzen, Werte eintragen
 * (Abschnitte, Intervalle mit Hilfsmittel-, Lage- und Titeländerung, Kraftübungen mit „wie letztes Mal“), krank und verletzt (über den
 * Coach-Chat, wie ein Mensch), Tests, Wettkämpfe, Coach-Fragen. Danach neues Ziel (ein Jahr später), damit der Plan weiterläuft.
 * Automatisch geprüft:
 *  - kein Absturz (jeder Schritt einzeln, Fehler mit Datum)
 *  - Daten-Check jede Nacht VOR der Plan-Pflege (wie der Server um 2 Uhr): keine Regel-Verstöße, keine widersprüchlichen Werte
 *  - Scores und Prognose wöchentlich: endlich, im Bereich, keine Sprünge ohne Grund; bei langer Pause/Krankheit nicht besser
 *  - Coach: keine kaputten Texte (NaN/undefined), keine falschen Zahlen (Zahlen-Prüfer), Bewertung der Intervalle sagt „mit Pull Buoy“
 *  - Änderungen überall verstanden: Pull-Buoy-Wiederholungen nie „Kraul am Stück“, Titel im Satz-Namen, Umwandlung im Plan,
 *    Kraftübungen im Score (nicht „nur Regelmäßigkeit“), Belastung je Einheit genau einmal */
import * as C from '../../shared/core';
import { applyOnboarding } from '../../shared/onboarding';
import { replanPlan, extendPlan, planUpkeep } from '../../shared/replan';
import { runEngine } from '../../shared/coach/engine';
import { doneItems, reviewItem, ivEvalOf } from '../../shared/coach/review';
import { converse } from '../../shared/coach/dialog';
import { applyOps } from '../../shared/coach/ops';
import { checkValueClaims, valueFacts } from '../../shared/coach/claims';
import { dataCheck } from '../../shared/datacheck';
import { PERSONAS } from '../../fixtures/personas';
import { manyUsers20 } from '../../fixtures/users20';
import { CHANGE_KINDS, omitOptions, actualMetrics } from '../../shared/results';
import { plannedIntervals, stampRows, ivGroups, ivDiffNotes, type IvRow } from '../../shared/intervals';
import { convertKinds, convertSession } from '../../shared/convert';
import { lastStrengthExercises } from '../../shared/strength';
import { sportScores, legacyActivities, namedFromPlan, estimatesAt } from '../../shared/scores';
import { goalPrognoses, planFactsOf, correctionFromGoals, trendHistory, watchVo2max } from '../../shared/prognosis';
import { mainGoal } from '../../shared/goals';
import { checkTrainingRules } from '../../shared/trainingrules';

const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
export const SIM36_START = '2026-11-16';
export interface SimUser { id: string; answers: any; weeks: number; diligence: number; watch: boolean; label: string }
export function users36(): SimUser[] {
  const a = PERSONAS.map((p, i) => ({ id: 'S36-' + p.id, label: p.label, answers: copy(p.answers), weeks: 52 + (i % 3) * 26, diligence: [0.92, 0.75, 0.6][i % 3], watch: i % 2 === 0 }));
  const many = manyUsers20();
  // 26 verschiedene aus den 50 (jeder zweite, dazu einige ungerade für mehr Ziele/Fälle)
  const pick = many.filter((_, i) => (i + Math.floor(i / 10)) % 2 === 0).concat(many.filter((_, i) => (i + Math.floor(i / 10)) % 2 === 1).slice(0, 1));
  const b = pick.map((u: any, i: number) => ({ id: 'S36-' + u.id, label: u.label, answers: copy(u.answers), weeks: [52, 78, 104][i % 3], diligence: [0.95, 0.8, 0.65, 0.5][i % 4], watch: u.device !== 'manual' }));
  return [...a, ...b].slice(0, 36);
}
export interface SimResult { id: string; days: number; actions: Record<string, number>; failures: string[]; dcNight: Record<string, number>; dcAfter: Record<string, number>; coachFixed: number; ms: Record<string, number>; firstDc: Record<string, string> }

const QUESTIONS = ['Was steht heute an?', 'Wie war meine letzte Einheit?', 'Bin ich auf Kurs für mein Ziel?', 'Kann ich heute härter trainieren?', 'Wie lange soll ich laufen?', 'Was mache ich morgen?', 'Warum ist mein Score gesunken?', 'Wie schnell soll ich schwimmen?'];

export async function simulate36(user: SimUser, seed = 3601): Promise<SimResult> {
  let rng = seed + user.id.split('').reduce((n, c) => n + c.charCodeAt(0), 0);
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  const pickOf = <T>(l: T[]): T => l[Math.floor(random() * l.length)];
  const out: SimResult = { id: user.id, days: 0, actions: {}, failures: [], dcNight: {}, dcAfter: {}, coachFixed: 0, ms: {}, firstDc: {} };
  const act = (k: string) => { out.actions[k] = (out.actions[k] || 0) + 1; };
  const fail = (ok: boolean, text: string) => { if (!ok && out.failures.length < 40) out.failures.push(text); };
  const time = async <T>(k: string, fn: () => T | Promise<T>): Promise<T | null> => { const t0 = Date.now(); try { return await fn(); } catch (e) { fail(false, `${k}: ${(e as Error).message}`.slice(0, 220)); return null; } finally { out.ms[k] = (out.ms[k] || 0) + Date.now() - t0; } };
  const init = applyOnboarding(copy(user.answers), SIM36_START);
  if (!init.gen) { out.failures.push('Onboarding ohne Plan'); return out; }
  let profile: any = init.profile, goals: any[] = init.goals, plan: any = init.gen.plan;
  const state: any = { profile, sessions: {}, customWorkouts: {}, trend: [], illnessPeriods: [], adjustments: {}, coachMsgs: {}, settings: {}, activities: {}, rules: [] };
  const ctx = (date: string) => ({ today: date, now: Date.parse(date + 'T19:00:00Z'), state, baseWeeks: plan.weeks, planMeta: plan.meta || {}, profile, goals } as any);
  const engine = (date: string, type: 'daily' | 'weekly' | 'activity', ids: string[] = []) => {
    const r = runEngine(ctx(date), type === 'activity' ? { type, sessionIds: ids } : { type } as any);
    for (const m of r.messages) state.coachMsgs[m.id] = m;
    for (const a of r.adjustments) state.adjustments[a.id] = { ...a, createdAt: Date.parse(date + 'T19:00:00Z') };
  };
  const chat = (date: string, text: string) => {
    const { reply } = converse(ctx(date), {}, text);
    fail(!!reply.text && !/undefined|NaN|\[object/.test(reply.text), `${date}: Coach-Antwort kaputt auf „${text}“: ${String(reply.text).slice(0, 100)}`);
    if (reply.apply && reply.apply.length) { const store = { state, profile, goals, saveProfile: (p: any) => { profile = p; state.profile = p; } }; applyOps(store as any, reply.apply, Date.parse(date + 'T12:00:00Z'), date); profile = store.profile; }
    act('Coach-Frage');
    return reply;
  };
  let ill: { until: string } | null = null, injured: { until: string } | null = null;
  /* wie die App (Plan bearbeiten, Umwandeln): neue Regel-Hinweise → Hinweis zeigen; etwa die Hälfte übernimmt trotzdem (Ausnahme), sonst Abbruch */
  const userAdj = (date: string, a: any): boolean => {
    const rules = (adj: any) => checkTrainingRules(C.applyAdjustments(plan.weeks, adj), profile, { from: date, today: date, goals }).map(i => i.rule + '|' + i.week + '|' + (i.date || '')).sort().join(',');
    const before = rules(state.adjustments); const next = { ...state.adjustments, [a.id]: a };
    const fresh = rules(next).split(',').filter(x => x && !before.split(',').includes(x));
    if (!fresh.length) { state.adjustments[a.id] = a; return true; }
    if (random() < 0.5) { act('Hinweis → abgebrochen'); return false; }
    state.adjustments[a.id] = { ...a, override: true }; act('Hinweis → trotzdem übernommen'); return true;
  };
  let prevScores: Record<string, number> = {}, prevProg: Record<string, number> = {}; let prevThr = '';
  let pauseDays = 0;
  const lastBy: Record<string, string> = {};
  const doneDate: Record<string, string> = {};
  const totalDays = user.weeks * 7;
  for (let k = 0; k < totalDays; k++) {
    const date = C.addDays(SIM36_START, k); out.days++;
    // Morgenwerte (Uhr-Nutzer mit VO2max und Puls in Ruhe)
    state.trend.push({ date, hrv: 55 + Math.round(random() * 14), restingHR: 48 + Math.round(random() * 6), sleepHours: 6.5 + Math.round(random() * 4) / 2, ...(user.watch && k % 3 === 0 ? { vo2max: 48 + Math.round(random() * 4) } : {}) });
    // krank bzw. verletzt werden und wieder gesund (über den Coach-Chat, wie ein Mensch)
    if (!ill && !injured && random() < 1 / 110) { chat(date, 'Ich bin krank, Erkältung mit Fieber.'); ill = { until: C.addDays(date, 4 + Math.floor(random() * 8)) }; act('krank'); }
    else if (ill && date >= ill.until) { chat(date, 'Ich bin wieder gesund.'); for (const p of state.illnessPeriods) if (p && !p.end) p.end = date; ill = null; }
    if (!ill && !injured && random() < 1 / 220 && (profile.sports || []).includes('run')) { chat(date, 'Mein Knie tut beim Laufen weh.'); injured = { until: C.addDays(date, 10 + Math.floor(random() * 14)) }; act('verletzt'); }
    else if (injured && date >= injured.until) { chat(date, 'Das Knie ist wieder gut, keine Schmerzen mehr.'); injured = null; }
    // nachts: Daten-Check wie der Server (vor der Plan-Pflege), dann Pflege und Tagesanpassung der App
    await time('Daten-Check', () => {
      const r = dataCheck({ state, baseWeeks: plan.weeks, profile, goals, today: date });
      for (const f of r.findings) if (!f.fixed && (f.group === 'rules' || f.group === 'values')) { const key = f.key.replace(/:.*$/, '') + ':' + (f.key.split(':')[1] || ''); out.dcNight[key] = (out.dcNight[key] || 0) + 1; if (!out.firstDc[key]) out.firstDc[key] = `${date}: ${f.text}`; }
      if (process.env.SIM36_DEBUG && r.findings.some((f: any) => f.group === 'rules' && !f.fixed)) {
        const iss = checkTrainingRules(C.applyAdjustments(plan.weeks, state.adjustments), profile, { from: date, today: date, goals, goalType: (mainGoal(goals, date) || ({} as any)).type || null });
        const seen = (out as any).debug = (out as any).debug || [];
        for (const i of iss) { if (seen.filter((x: any) => x.rule === i.rule).length >= 4) continue;
          const wk = C.applyAdjustments(plan.weeks, state.adjustments).find((w: any) => w.weekNumber === i.week);
          const adj = wk ? wk.days.flatMap((d: any) => d.sessions).filter((x: any) => x._adj || Object.values(state.adjustments).some((a: any) => a && a.sessionId === x.id && !a.undone)).map((x: any) => x.title + ' [' + Object.values(state.adjustments).filter((a: any) => a && a.sessionId === x.id && !a.undone).map((a: any) => a.type + ':' + String(a.reason || '').slice(0, 40) + ':' + String(a.what || '').slice(0, 50)).join(' | ') + ']') : [];
          const base = plan.weeks.find((w: any) => w.weekNumber === i.week);
          const effW = C.applyAdjustments(plan.weeks, state.adjustments); const wi = effW.findIndex((w: any) => w.weekNumber === i.week);
          const ctxW = effW.slice(Math.max(0, wi - 3), wi + 1).map((w: any) => ({ wk: w.weekNumber, ph: w.phase, rec: !!w.isRecoveryWeek, red: !!w.reduced, entry: !!w.entry, part: !!w.partial, long: w.days.flatMap((d: any) => d.sessions).filter((x: any) => !x.cancelled && (x.sport === 'bike' || x.sport === 'run')).map((x: any) => `${x.sport}:${x.plannedMinutes}${x.long ? 'L' : ''}${x._orig ? '/' + x._orig.plannedMinutes + '@' + (x._adj || []).map((id: string) => String(id).slice(0, 18)).join('+') : ''}`).join(' ') }));
          const detail = effW.slice(Math.max(0, wi - 1), wi + 1).map((w: any) => w.weekNumber + ': ' + w.days.map((d: any) => d.date.slice(5) + ' ' + d.sessions.filter((x: any) => x.sport !== 'rest').map((x: any) => `${x.title.slice(0, 28)}(${x.plannedMinutes}${x.cancelled ? ' X' : ''}${x.ruleOverride ? ' OV' : ''}${x.hard ? ' H' : ''})[${(x._adj || []).map((id: string) => { const q: any = state.adjustments[id] || {}; return (q.type || '?') + ':' + String(q.reason || '').slice(0, 22) + '@' + new Date(q.createdAt || 0).toISOString().slice(5, 10); }).join(';')}]`).join(' + ')).join(' | '));
          seen.push({ detail, ctxW, date, rule: i.rule, msg: i.msg, week: i.week, phase: wk && wk.phase, rec: wk && wk.isRecoveryWeek, adj, baseLong: base ? base.days.flatMap((d: any) => d.sessions).filter((x: any) => x.long || /^Lang/.test(x.title || '')).map((x: any) => x.title + ' ' + x.plannedMinutes) : [] }); }
      }
    });
    await time('Plan-Pflege', () => {
      const up = planUpkeep(plan.weeks, state, profile, goals, date, Date.parse(date + 'T05:00:00Z'), plan.meta || {});
      for (const a of up.adjustments) state.adjustments[a.id] = a;
      if (up.adjustments.length) act('Plan-Pflege');
    });
    await time('Tagesanpassung', () => { for (const a of C.dailyAdjustments(state, plan.weeks, date, {})) if (!state.adjustments[a.id]) { state.adjustments[a.id] = { ...a, createdAt: Date.parse(date + 'T06:00:00Z') }; act('Tagesanpassung'); } });
    const eff = C.applyAdjustments(plan.weeks, state.adjustments);
    const days = C.planDays(eff);
    const day = days.find((d: any) => d.date === date);
    const live = (day?.sessions || []).filter((s: any) => s && s.sport !== 'rest' && !s.cancelled && !(state.sessions[s.id] || {}).completed);
    // umwandeln (eine Einheit 1–3 Tage voraus) und verschieben (auf morgen), wie in der App: Anpassung „von dir“
    if (random() < 0.05) {
      const ahead = days.filter((d: any) => d.date > date && d.date <= C.addDays(date, 3)).flatMap((d: any) => d.sessions.map((s: any) => ({ ...s, date: d.date }))).filter((s: any) => convertKinds(s).length);
      if (ahead.length) { const s = pickOf(ahead); const kind = pickOf(convertKinds(s)); const o = convertSession(s, kind); if (o && userAdj(date, { id: `user-cv-${s.id}-${k}`, group: `user-cv-${s.id}-${k}`, type: 'modify', sessionId: s.id, set: { ...o.set, converted: o.kind }, what: 'Umgewandelt', reason: 'von dir', createdAt: Date.parse(date + 'T08:00:00Z'), date })) { act('umwandeln');
        // verstanden: im Plan steht die neue Einheit
        const after = C.planDays(C.applyAdjustments(plan.weeks, state.adjustments)).find((d: any) => d.date === s.date)?.sessions.find((x: any) => x.id === s.id);
        fail(!!after && after.title === o.set.title, `${date}: Umwandlung nicht im Plan (${s.title} → ${o.set.title})`); } }
    }
    const done: string[] = [];
    for (const s of live) {
      const r = random();
      const skipP = (1 - user.diligence) * (ill ? 3 : 1) + (injured && s.sport === 'run' ? 0.8 : 0);
      if (ill && s.sport !== 'rest') { state.sessions[s.id] = { skipped: true }; act('ausgelassen'); continue; }
      if (r < skipP * 0.75) { state.sessions[s.id] = { skipped: true }; act('ausgelassen'); continue; }
      if (r < skipP && !s.race && !s.fixed) { const id = `user-mv-${s.id}`; if (!state.adjustments[id] && userAdj(date, { id, group: id, type: 'move', sessionId: s.id, from: date, to: C.addDays(date, 1), what: 'verschoben', reason: 'von dir', createdAt: Date.parse(date + 'T07:00:00Z'), date })) { act('verschoben'); continue; } }
      const short = random() < 0.12;
      const min = Math.max(10, Math.round((s.plannedMinutes || 40) * (short ? 0.65 : 0.9 + random() * 0.15)));
      const lthr = (profile.thresholds || {}).lthrRun || 165;
      const hr = Math.round(lthr * (s.hard || s.race ? 0.9 + random() * 0.06 : 0.76 + random() * 0.08));
      const st: any = { completed: true, rpe: String(s.hard || s.race ? 7 + Math.round(random() * 2) : 3 + Math.round(random() * 2)), metrics: { min: String(min) }, metricsSrc: { min: 'manual' } };
      if (['run', 'bike', 'swim', 'football'].includes(s.sport)) { st.metrics.hr = String(hr); st.metricsSrc.hr = 'manual'; }
      if (s.sport === 'run') { const pace = Math.round(((profile.thresholds || {}).thresholdPaceRunSec || 330) * (s.hard ? 1.02 : 1.22) * (0.97 + random() * 0.06)); st.metrics.km = String(Math.round(min * 60 / pace * 10) / 10); st.metricsSrc.km = 'manual'; }
      if (s.sport === 'bike') { st.metrics.km = String(Math.round(min / 60 * (24 + random() * 6) * 10) / 10); st.metricsSrc.km = 'manual'; }
      if (s.sport === 'swim') { st.metrics.meters = String(Math.round(min * (25 + random() * 10) / 25) * 25); st.metricsSrc.meters = 'manual'; }
      if (short) { st.asPlanned = false; st.changed = { kind: 'shorter', reason: pickOf(['time', 'tired', 'weather']) }; act('gekürzt'); }
      else if (random() < 0.12) {
        const kinds = CHANGE_KINDS.map(([x]) => x).filter(x => ['run', 'bike', 'swim'].includes(s.sport) || !['otherIntervals', 'place', 'split'].includes(x));
        const kind = pickOf(kinds); const ch: any = { kind };
        if (kind === 'easy') ch.zone = 2; if (kind === 'harder') ch.zone = 4; if (kind === 'otherSport') ch.sport = s.sport === 'run' ? 'bike' : 'run';
        if (kind === 'place') ch.place = 'in'; if (kind === 'split') { const a = Math.round(min * 0.6); ch.parts = [a, min - a]; }
        if (kind === 'omit') ch.omit = omitOptions(s)[0][0];
        st.asPlanned = false; st.changed = ch; act('anders gemacht');
      } else st.asPlanned = true;
      // Abschnitte (Aufwärmen/Hauptteil/Ausklang) bei manchen Lauf-/Radeinheiten
      if ((s.sport === 'run' || s.sport === 'bike') && !s.hard && random() < 0.1) { st.metrics.sections = [{ part: 'warm', min: 10, hr: hr - 12 }, { part: 'main', min: Math.max(5, min - 20), hr }, { part: 'cool', min: 10, hr: hr - 15 }]; st.metricsSrc.sections = 'manual'; act('Abschnitte'); }
      // Intervalle mit Lage/Hilfsmittel/Titel (Satz gleich, eine Wiederholung abweichend), wenn der Plan welche hat
      const targets = !st.changed || st.asPlanned ? plannedIntervals(s, profile.thresholds || {}) : [];
      if (targets.length && random() < 0.7) {
        const aided = s.sport === 'swim' && random() < 0.35, hill = s.sport === 'run' && random() < 0.15, titled = random() < 0.25;
        let rows: IvRow[] = targets.map((t, i) => {
          const base: IvRow = s.sport === 'swim' ? { sec: Math.round(((t.pace100 ? t.pace100[0] + 4 : 140)) * (t.m || 100) / 100 * (0.97 + random() * 0.08)) } : { sec: t.sec || 240, hr: hr + 4 };
          if (s.sport === 'run') base.pace = `${Math.floor(((profile.thresholds || {}).thresholdPaceRunSec || 330) / 60)}:${String(((profile.thresholds || {}).thresholdPaceRunSec || 330) % 60).padStart(2, '0')}`;
          if (aided && t.set === targets[0].set) base.gear = ['buoy'];
          if (hill) base.type = 'hill';
          if (titled) base.title = s.sport === 'swim' ? 'Hauptserie' : 'Bergsprints';
          if (i === 1) base.sec = Math.round((base.sec || 60) * 1.06);
          return base;
        });
        rows = stampRows(rows, targets, s.sport);
        st.metrics.intervals = rows; st.metricsSrc.intervals = 'manual'; act(aided ? 'Intervalle mit Pull Buoy' : hill ? 'Intervalle bergauf' : 'Intervalle');
        if (titled) { const g = ivGroups(rows, targets, s.sport)[0]; fail(g.label.startsWith(rows[0].title!), `${date}: Satz-Titel nicht übernommen: ${g.label}`); act('Titel geändert'); }
        if (aided) {
          // verstanden: Pull Buoy zählt nie als Kraul am Stück ohne Hilfsmittel, der Coach sagt „mit Pull Buoy“
          const m = actualMetrics(st, null);
          const crawlFree = Math.max(0, ...rows.filter(x => x.stroke === 'crawl' && !(x.gear || []).length).map(x => x.m || 0));
          fail(!(Number(m.longestCrawl) > crawlFree), `${date}: Pull-Buoy-Wiederholungen als Kraul am Stück gezählt (${m.longestCrawl} m)`);
        }
      }
      // Kraft: Übungen eintragen, oft „wie letztes Mal“ mit etwas mehr Gewicht
      if (s.sport === 'strength' && random() < user.diligence) {
        const hist = Object.entries(state.sessions).map(([id, x]: any) => ({ id, date: doneDate[id] || '', exercises: x.metrics && x.metrics.exercises }));
        const last = lastStrengthExercises(hist, date, s.id);
        const ex = last && random() < 0.7 ? last.exercises.map((e: any) => ({ ...e, kg: e.kg != null ? Math.round((e.kg + (random() < 0.4 ? 2.5 : 0)) * 2) / 2 : null })) : (s.spec && s.spec.exercises || []).map((e: any, i: number) => ({ name: e.name, sets: e.sets || 3, reps: e.reps || '10', kg: i % 2 ? null : 20 }));
        if (ex.length) { st.metrics.exercises = ex; st.metricsSrc.exercises = 'manual'; act(last ? 'Kraft wie letztes Mal' : 'Kraftübungen'); }
      }
      doneDate[s.id] = date;
      // Uhr-Nutzer: Aufzeichnung statt Handeintrag für Dauer/Puls
      if (user.watch && ['run', 'bike', 'swim'].includes(s.sport)) {
        const id = `act-${s.id}`; const km = Number(st.metrics.km || 0) || (s.sport === 'swim' ? Number(st.metrics.meters) / 1000 : 0);
        state.activities[id] = { id, sport: s.sport, date, startMs: Date.parse(date + 'T17:00:00Z'), source: 'file', sources: ['file'], name: s.title, min, km, avgHr: hr, maxHr: hr + 12, speedKmh: km && min ? Math.round(km / (min / 60) * 10) / 10 : null, paceSecKm: s.sport === 'run' && km ? Math.round(min * 60 / km) : null, laps: [], splits: [], ...(s.sport === 'swim' ? { swim: { poolLengthM: 25, lengths: 0, activeLengths: 0, strokesPerLength: 18, metersPerStroke: 1.1, pace100: km ? Math.round(min * 60 / (km * 10)) : null, byStroke: { freestyle: km * 1000 }, longestContinuousM: null, strokeRate: null } } : {}), sessionId: s.id };
        st.activityId = id; act('Uhr');
      }
      state.sessions[s.id] = st; done.push(s.id); lastBy[s.sport] = date; act(s.race ? 'Wettkampf' : /test|Kraul-Check/i.test(s.title || '') ? 'Test' : 'erledigt');
    }
    if (done.length) {
      pauseDays = 0;
      await time('Coach nach Einheit', () => engine(date, 'activity', done));
      // Bewertung der erledigten Einheiten: Texte heil; Intervalle mit Pull Buoy: Coach sagt „mit Pull Buoy“, nie „ohne“
      await time('Bewertung', () => {
        const items = doneItems(ctx(date), date, date);
        for (const id of done) {
          const d = items.find(x => x.key === id); if (!d) { fail(!!(state.sessions[id] || {}).changed, `${date}: ${id} fehlt in den erledigten Einheiten`); continue; }
          const rv = reviewItem(ctx(date), d); fail(!!rv.text && !/undefined|NaN|\[object/.test(rv.text), `${date}: Bewertung kaputt (${d.title})`);
          const rows: IvRow[] = ((state.sessions[id] || {}).metrics || {}).intervals || [];
          const tg = d.planned ? plannedIntervals(d.planned, profile.thresholds || {}) : [];
          if (rows.some(x => (x.gear || []).includes('buoy') && x.ti != null && tg[x.ti] && !(tg[x.ti].gear || []).includes('buoy'))) {
            const notes = ivDiffNotes(ivEvalOf(ctx(date), d));
            fail(notes.some(n => /mit Pull Buoy/.test(n)), `${date}: Coach erwähnt den Pull Buoy nicht (${d.title})`);
            fail(!/ohne Pull Buoy|(?<!statt )ohne Hilfsmittel geschwommen/.test(rv.text), `${date}: Coach behauptet „ohne“ trotz Pull Buoy`);
          }
          const loads = C.dailyLoadEntries(state, C.applyAdjustments(plan.weeks, state.adjustments)).filter((x: any) => x.key === 'session:' + id);
          fail(loads.length <= 1 && loads.every((x: any) => Number.isFinite(x.load)), `${date}: Belastung ${id} doppelt/ungültig`);
        }
      });
    } else pauseDays++;
    // Coach-Fragen (etwa jede Woche eine)
    if (random() < 0.15) await time('Coach-Frage', () => {
      const reply = chat(date, pickOf(QUESTIONS));
      const f = valueFacts(ctx(date), 60); const ck = checkValueClaims(reply.text, f, date); out.coachFixed += ck.corrected.length + ck.dropped.length;
    });
    // neues Ziel nach dem letzten Wettkampf (ein Jahr später, gleicher Typ), Plan neu
    const g = mainGoal(goals, date);
    if (!g && goals.length) await time('neues Ziel', () => {
      const last = [...goals].filter(x => x.date).sort((a, b) => a.date.localeCompare(b.date)).pop();
      if (!last) return;
      goals = [...goals, { ...last, id: last.id + '-n' + k, name: last.name + ' (nächstes Jahr)', date: C.addDays(last.date, 364) }];
      const nx = replanPlan(plan, profile, goals, C.addDays(date, 1), { state, adjustments: state.adjustments, from: C.addDays(date, 1) }); if (nx) plan = nx.plan;
      act('neues Ziel');
    });
    if (k % 7 !== 6) continue;
    await new Promise<void>(r => setImmediate(r));
    await time('Coach wöchentlich', () => engine(date, 'weekly'));
    // Scores und Prognose: plausibel, keine Sprünge ohne Grund, bei Pause nicht besser
    await time('Scores', () => {
      const acts = [...namedFromPlan(state, plan.weeks, C.recordedActivities(state)), ...legacyActivities(state, plan.weeks, profile)] as any[];
      const chosen = ['swim', 'bike', 'run', 'strength'].filter(x => (profile.sports || []).includes(x));
      const inp: any = { today: date, activities: acts, trend: state.trend, illness: state.illnessPeriods, profile, goal: mainGoal(goals, date) };
      const sc = sportScores(inp, (chosen.length ? chosen : ['run']) as any);
      const thrNow = JSON.stringify({ ...(profile.thresholds || {}), source: undefined, trendAt: undefined }) + JSON.stringify((profile.skills || {}));
      const thrChanged = !!prevThr && thrNow !== prevThr; prevThr = thrNow;
      for (const x of sc) {
        fail(Number.isFinite(x.score) && x.score >= 1 && x.score <= 120, `${date}: Score ${x.sport} ungültig (${x.score})`);
        const p = x.measured != null ? prevScores[x.sport] : undefined;
        const tested = Object.entries(doneDate).some(([id, dd]) => dd > C.addDays(date, -7) && /test|Kraul-Check|Wettkampf/i.test((days.find((q: any) => q.date === dd)?.sessions.find((q: any) => q.id === id) || {}).title || '') && (days.find((q: any) => q.date === dd)?.sessions.find((q: any) => q.id === id) || {}).sport === x.sport);
        const raced = Object.entries(doneDate).some(([id, dd]) => dd > C.addDays(date, -7) && (days.find((q: any) => q.date === dd)?.sessions.find((q: any) => q.id === id) || {}).race);
        const newK = x.sport === 'strength' && Object.entries(doneDate).some(([id, dd]) => dd > C.addDays(date, -7) && (days.find((q: any) => q.date === dd)?.sessions.find((q: any) => q.id === id) || {}).sport === 'strength');
        // „vorläufig“ (wenige Einheiten, für die Person so markiert) bzw. die ersten Krafteinheiten: Bewegung ist erklärt
        const early = x.provisional || (x.sport === 'strength' && acts.filter(a => a.sport === 'strength' && a.date <= date).length <= 6);
        if (p != null && !tested && !raced && !thrChanged && !early) fail(Math.abs(x.score - p) <= (newK ? 20 : 12), `${date}: Score ${x.sport} springt ${p} → ${x.score} in einer Woche` + (process.env.SIM36_DEBUG ? ` WHY ${x.why.slice(0, 3).join(' / ')} PARTS ${x.parts.map(q => q.key + ':' + q.value + '@' + q.weight).join(', ')}` : ''));
        if (p != null && (ill || pauseDays >= 14) && x.sport !== 'strength') fail(x.score <= p + 3, `${date}: Score ${x.sport} steigt in der Pause (${p} → ${x.score})`);
        if (x.measured != null) prevScores[x.sport] = x.score; else delete prevScores[x.sport];
        if (x.sport === 'strength' && acts.some(a => a.sport === 'strength' && a.exercises && a.exercises.length && a.date > C.addDays(date, -28))) fail(x.parts.length > 1, `${date}: Kraft-Score trotz Übungen nur Regelmäßigkeit`);
      }
      if (k % 28 === 27 || !Object.keys(prevProg).length) {
        const sessions = C.planDays(C.applyAdjustments(plan.weeks, state.adjustments)).flatMap((d: any) => (d.sessions || []).map((x: any) => ({ ...x, date: d.date })));
        const list = goalPrognoses(goals, plan.meta || {}, date, estimatesAt(inp, date), { profile, history: trendHistory(x => estimatesAt(inp, x), date), ill: ill ? date : null, correction: correctionFromGoals(goals), vo2max: watchVo2max(state, profile, date), planFor: gg => planFactsOf(sessions, (x: any) => !!(state.sessions[x.id] || {}).completed, state.customWorkouts, gg, date, C.isTestOrRace) });
        for (const x of list) {
          const t = x.p.race ? x.p.race.total : x.p.total!;
          fail(Number.isFinite(t.best) && t.best > 0 && t.low <= t.best && t.high >= t.best, `${date}: Prognose ${x.goal.name} ungültig`);
          const pv = prevProg[x.goal.id];
          if (pv && !x.p.race === !prevProg['race:' + x.goal.id] && !thrChanged) fail(Math.abs(t.best / pv - 1) <= (k < 56 ? 0.2 : 0.12), `${date}: Prognose ${x.goal.name} springt ${Math.round(pv / 60)} → ${Math.round(t.best / 60)} min in 4 Wochen`);
          prevProg[x.goal.id] = t.best; prevProg['race:' + x.goal.id] = x.p.race ? 1 : 0;
        }
      }
    });
    if (k % 56 === 55) await time('Neu-Planen', () => { const nx = replanPlan(plan, profile, goals, C.addDays(date, 1), { state, adjustments: state.adjustments, from: C.addDays(date, 1) }); if (nx) { plan = nx.plan; act('Neu-Planen'); } });
    await time('Verlängern', () => { const ex = extendPlan(plan, profile, goals, date); if (ex) { plan = ex; act('Verlängern'); } });
  }
  // Daten-Check nach der Pflege am letzten Tag (wie die Release-Prüfung)
  const last = C.addDays(SIM36_START, totalDays - 1);
  const r = dataCheck({ state, baseWeeks: plan.weeks, profile, goals, today: last });
  for (const f of r.findings) if (!f.fixed && (f.group === 'rules' || f.group === 'values')) out.dcAfter[f.key] = (out.dcAfter[f.key] || 0) + 1;
  return out;
}
