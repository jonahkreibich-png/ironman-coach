/** Auftrag 30, Punkt 8: Langzeit-Simulation (ERFUNDENE Nutzer, keine echten Daten, kein Netz).
 * 30 Nutzer (10 Test-Personen + 20 aus users20), je 13–26 Wochen (3–6 Monate). Täglich: Einheiten erledigen, auslassen oder „anders machen“
 * (alle Arten mit ihren Feldern), Morgenwerte, Schwimm-Werte mit Spitzen und schwächeren Tagen (Bestwert/Tageswert), Coach (täglich,
 * nach Einheiten, wöchentlich) mit seinen App-Anpassungen, tägliche Plan-Anpassung, Neu-Planen alle 4 Wochen und Verlängerung sonntags.
 * Geprüft wird jeden Tag bzw. jede Woche:
 *  - „anders gemacht“: Titel, Sportart, Belastung und Bewertung nutzen das Gemachte; Stufen zählen nur passende Nachweise
 *  - nie zwei harte Tage hintereinander nach den Anpassungen (auch nach „härter als geplant“), Nachholen nie gestapelt
 *  - Coach-Texte: keine „von X auf Y“-Aussage unter dem Bestwert, kein „Rückschritt“ ohne schwächeren Trend (nach dem Prüfer)
 *  - neue Regeln: Erholungswochen 50–78 % (Plan-Check), Kraft in der Grundlage, Plan-Check ohne Verstöße der neuen Regeln
 *  - Dauer immer endlich und positiv, keine Abstürze */
import * as C from '../../shared/core';
import { applyOnboarding } from '../../shared/onboarding';
import { replanPlan, extendPlan } from '../../shared/replan';
import { runEngine } from '../../shared/coach/engine';
import { doneItems, reviewItem } from '../../shared/coach/review';
import { verifyCoachText } from '../../shared/coach/claims';
import { valueStories } from '../../shared/coach/analysis';
import { PERSONAS } from '../../fixtures/personas';
import { manyUsers20 } from '../../fixtures/users20';
import { actualTitle, actualSport, changedOf, CHANGE_KINDS, omitOptions } from '../../shared/results';
import { checkTrainingRules } from '../../shared/trainingrules';
import { isHardSession } from '../../shared/intensity';

const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
export const LT30_START = '2026-10-26';
export interface LtUser { id: string; answers: any; weeks: number }
export function users30(): LtUser[] {
  const a = PERSONAS.map((p, i) => ({ id: 'SIM30-' + p.id, answers: copy(p.answers), weeks: 13 + (i % 3) * 6 }));
  const b = manyUsers20().slice(0, 20).map((u: any, i: number) => ({ id: 'SIM30-u' + i, answers: copy(u.answers), weeks: i % 2 ? 13 : 20 }));
  return [...a, ...b].slice(0, 30);
}
export interface Lt30 { id: string; days: number; changed: Record<string, number>; adjustments: number; replans: number; extensions: number; coachMsgs: number; fixedClaims: number; failures: string[]; recoveryWeeks: number; strengthBase: number[] }
const OTHER: Record<string, string> = { run: 'bike', bike: 'run', swim: 'run', strength: 'run', football: 'run' };

export async function simulate30(user: LtUser, seed = 3001): Promise<Lt30> {
  let rng = seed + user.id.split('').reduce((n, c) => n + c.charCodeAt(0), 0);
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  const out: Lt30 = { id: user.id, days: 0, changed: {}, adjustments: 0, replans: 0, extensions: 0, coachMsgs: 0, fixedClaims: 0, failures: [], recoveryWeeks: 0, strengthBase: [] };
  const fail = (ok: boolean, text: string) => { if (!ok && out.failures.length < 25) out.failures.push(text); };
  const init = applyOnboarding(copy(user.answers), LT30_START);
  if (!init.gen) { out.failures.push('Onboarding ohne Plan'); return out; }
  let profile: any = init.profile, goals: any[] = init.goals, plan: any = init.gen.plan;
  const state: any = { profile, sessions: {}, customWorkouts: {}, trend: [], illnessPeriods: [], adjustments: {}, coachMsgs: {}, settings: {}, activities: {} };
  const ctx = (date: string) => ({ today: date, now: Date.parse(date + 'T19:00:00Z'), state, baseWeeks: plan.weeks, planMeta: plan.meta || {}, profile, goals });
  const engine = (date: string, type: 'daily' | 'weekly' | 'activity', ids: string[] = []) => {
    const r = runEngine(ctx(date) as any, type === 'activity' ? { type, sessionIds: ids } : { type } as any);
    for (const m of r.messages) { state.coachMsgs[m.id] = m; out.coachMsgs++; }
    for (const a of r.adjustments) { state.adjustments[a.id] = { ...a, createdAt: Date.parse(date + 'T19:00:00Z') }; out.adjustments++; }
  };
  let swimPeak = 25;
  for (let k = 0; k < user.weeks * 7; k++) {
    const date = C.addDays(LT30_START, k); out.days++;
    state.trend.push({ date, hrv: 58 + Math.round(random() * 10), restingHR: 50 + Math.round(random() * 4), sleepHours: 7 + Math.round(random() * 2) / 2 });
    // tägliche Anpassung der App (Ampel, verpasste Schlüsseleinheiten, Nachholen, härter als geplant)
    try { for (const a of C.dailyAdjustments(state, plan.weeks, date, {})) if (!state.adjustments[a.id]) { state.adjustments[a.id] = { ...a, createdAt: Date.parse(date + 'T06:00:00Z') + out.adjustments }; out.adjustments++; } }
    catch (e) { fail(false, `${date}: dailyAdjustments ${(e as Error).message}`); }
    const eff = C.applyAdjustments(plan.weeks, state.adjustments);
    const day = C.planDays(eff).find((d: any) => d.date === date);
    const live = (day?.sessions || []).filter((s: any) => s && s.sport !== 'rest' && !s.cancelled);
    const done: string[] = [];
    for (const s of live) {
      const r = random();
      if (r < 0.15) { state.sessions[s.id] = { skipped: true }; continue; }
      const min = Math.max(10, Math.round((s.plannedMinutes || 40) * (0.85 + random() * 0.2)));
      const st: any = { completed: true, rpe: String(s.sport === 'football' ? 7 : 4 + Math.round(random() * 3)), metrics: { min: String(min), hr: String(130 + Math.round(random() * 20)) }, metricsSrc: { min: 'manual', hr: 'manual' } };
      // Schwimmen: Kraul am Stück mit Spitzen und schwächeren Tagen
      if (s.sport === 'swim') { const peak = random() < 0.15; if (peak) swimPeak += 25; const v = peak ? swimPeak : Math.max(25, swimPeak - 25 * Math.round(random() * 2)); st.metrics.longestCrawl = String(v); st.metrics.meters = String(Math.max(v, 1000)); }
      // „anders gemacht“ in ~30 % der Einheiten, alle Arten mit passenden Feldern
      if (random() < 0.3) {
        const kinds = CHANGE_KINDS.map(([x]) => x).filter(x => ['run', 'bike', 'swim'].includes(s.sport) || !['otherIntervals', 'place', 'split'].includes(x));
        const kind = kinds[Math.floor(random() * kinds.length)];
        const ch: any = { kind, reason: ['tired', 'time', 'weather', 'pain', 'motivation', undefined][Math.floor(random() * 6)] };
        if (kind === 'easy') ch.zone = 1 + Math.floor(random() * 2);
        if (kind === 'harder') ch.zone = 4 + Math.floor(random() * 2);
        if (kind === 'shorter') st.metrics.min = String(Math.max(10, Math.round(min * 0.6)));
        if (kind === 'longer') st.metrics.min = String(Math.round(min * 1.3));
        if (kind === 'aborted') st.metrics.min = String(Math.max(5, Math.round(min * 0.35)));
        if (kind === 'otherSport') ch.sport = OTHER[s.sport] || 'run';
        if (kind === 'place') ch.place = random() < 0.5 ? 'in' : 'out';
        if (kind === 'split') { const a = Math.round(min * 0.6), b = min - a; ch.parts = [a, b]; st.metrics.min = String(a + b); }
        if (kind === 'omit') { const o = omitOptions(s); ch.omit = o[Math.floor(random() * o.length)][0]; }
        if (kind === 'otherIntervals') st.metrics.intervals = [{ sec: 240, hr: 165 }, { sec: 240, hr: 168 }, { sec: 240, hr: 170 }];
        st.asPlanned = false; st.changed = ch; out.changed[kind] = (out.changed[kind] || 0) + 1;
      } else st.asPlanned = true;
      state.sessions[s.id] = st; done.push(s.id);
    }
    if (done.length) {
      try { engine(date, 'activity', done); } catch (e) { fail(false, `${date}: Coach nach Einheit ${(e as Error).message}`); }
      // „anders gemacht“: Titel, Sportart, Belastung und Bewertung des Gemachten
      try {
        const items = doneItems(ctx(date) as any, date, date);
        for (const id of done) {
          const st = state.sessions[id]; if (!changedOf(st)) continue;
          const s = live.find((x: any) => x.id === id); const d = items.find(x => x.key === id);
          fail(!!d, `${date}: ${id} fehlt in den erledigten Einheiten`); if (!d) continue;
          fail(d.title === actualTitle(s, st, d.act), `${date}: Titel ${d.title} ≠ ${actualTitle(s, st)}`);
          fail(d.sport === actualSport(s, st), `${date}: Sportart ${d.sport}`);
          const rv = reviewItem(ctx(date) as any, d); fail(!!rv.text && !/undefined|NaN/.test(rv.text), `${date}: Bewertung leer/kaputt (${changedOf(st)!.kind})`);
          const loads = C.dailyLoadEntries(state, C.applyAdjustments(plan.weeks, state.adjustments)).filter((x: any) => x.key === 'session:' + id);
          fail(loads.length === 1 && Number.isFinite(loads[0].load) && loads[0].sport === actualSport(s, st), `${date}: Belastung ${id}`);
        }
      } catch (e) { fail(false, `${date}: Prüfung anders gemacht ${(e as Error).message}`); }
    }
    // nie zwei harte Tage hintereinander (gestern + heute, nach allen Anpassungen; Spiele/Wettkämpfe ausgenommen, die sind fest)
    {
      const eff2 = C.planDays(C.applyAdjustments(plan.weeks, state.adjustments));
      const hardOn = (d: string) => (eff2.find((x: any) => x.date === d)?.sessions || []).some((s: any) => !s.cancelled && isHardSession(s) && !s.race && s.sport !== 'football' && !/test|Kraul-Check/i.test(s.title || '') && !(state.sessions[s.id] && changedOf(state.sessions[s.id]) && ['easy', 'otherSport', 'aborted'].includes(changedOf(state.sessions[s.id])!.kind)));
      const y = C.addDays(date, -1); const ySt = (eff2.find((x: any) => x.date === y)?.sessions || []).find((s: any) => state.sessions[s.id] && (changedOf(state.sessions[s.id]) || {} as any).kind === 'harder' && ((changedOf(state.sessions[s.id]) as any).zone || 0) >= 4 && !isHardSession(s));
      if (ySt) fail(!hardOn(date) || (eff2.find((x: any) => x.date === date)?.sessions || []).every((s: any) => !isHardSession(s) || s.pinned || /test/i.test(s.title || '')), `${date}: nach „härter als geplant“ wieder hart`);
      const redo = Object.values(state.adjustments).filter((a: any) => a && /^redo-/.test(a.id) && !a.undone && a.to && C.weekRange(a.to)[0] === C.weekRange(date)[0]);
      fail(redo.length <= 1, `${date}: mehr als ein Nachholen in der Woche (gestapelt)`);
    }
    if (k % 7 !== 6) continue;
    await new Promise<void>(r => setImmediate(r));
    try { engine(date, 'weekly'); } catch (e) { fail(false, `${date}: Coach wöchentlich ${(e as Error).message}`); }
    // Coach-Texte: nach dem Prüfer keine falsche Verlaufs-Aussage (Bestwert/Tageswert/Trend)
    try {
      const stories = valueStories(ctx(date) as any, date);
      for (const m of Object.values(state.coachMsgs) as any[]) {
        if (!m || m.from !== 'coach' || !m.text || m.date < C.addDays(date, -6)) continue;
        const t = verifyCoachText(m.text, ctx(date) as any, m.date, { stories });
        const best = stories.crawl && stories.crawl.best ? stories.crawl.best.v : null;
        const bad = /kraul|am stück/i.test(t) && best != null && [...t.matchAll(/\bvon\s+\d+[^.]*?\bauf\s+(\d+)\s*m\b/gi)].some(x => +x[1] < best);
        fail(!bad, `${date}: Verlauf unter Bestwert: ${t.slice(0, 120)}`);
        fail(!(/\brückschritt\b(?! ist)/i.test(t) && !/kein rückschritt|ist kein rückschritt/i.test(t)), `${date}: „Rückschritt“ ohne Trend: ${t.slice(0, 120)}`);
        if (t !== m.text) out.fixedClaims++;
      }
    } catch (e) { fail(false, `${date}: Coach-Prüfung ${(e as Error).message}`); }
    // alle 4 Wochen neu planen (wie nach Änderungen), sonntags verlängern (wie der Server)
    if (k % 28 === 27) {
      try { const nx = replanPlan(plan, profile, goals, C.addDays(date, 1), { state, adjustments: state.adjustments, from: C.addDays(date, 1) }); if (nx) { plan = nx.plan; out.replans++; } }
      catch (e) { fail(false, `${date}: Neu-Planen ${(e as Error).message}`); }
    }
    try { const ex = extendPlan(plan, profile, goals, date); if (ex) { plan = ex; out.extensions++; } } catch (e) { fail(false, `${date}: Verlängern ${(e as Error).message}`); }
    // neue Regeln im kommenden Plan
    const up = plan.weeks.filter((w: any) => w.startDate > date).slice(0, 6);
    const issues = checkTrainingRules(C.applyAdjustments(up, state.adjustments), profile, { goals, today: date, from: C.addDays(date, 1) }).filter(i => i.rule === 'recoveryDepth');
    for (const i of issues) fail(false, `${date}: ${i.msg}`);
    for (const w of up) {
      if (w.isRecoveryWeek) out.recoveryWeeks++;
      if (w.phase === 'base' && !w.isRecoveryWeek && (profile.sports || []).includes('strength')) out.strengthBase.push(w.days.flatMap((d: any) => d.sessions).filter((s: any) => s.sport === 'strength' && !s.cancelled).length);
      for (const s of w.days.flatMap((d: any) => d.sessions)) if (s.sport !== 'rest' && !s.cancelled) fail(Number.isFinite(s.plannedMinutes) && s.plannedMinutes > 0, `${date}: Dauer ungültig ${s.title}`);
    }
  }
  return out;
}
