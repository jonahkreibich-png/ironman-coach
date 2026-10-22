/* Auftrag 17, Punkt 7: großer Test – zusätzlich zu Auftrag 15 (tests/helpers/many-sim.ts) für jeden Test-Nutzer:
   Plan prüfen auf Dreifach-Tage, harte Einheiten pro Woche, klare Namen, nur vorhandene Schwimm-Hilfsmittel, Kraul-Stücke passend zum Können;
   dann 3 Wochen mit Abweichungen vom Soll (weniger Meter, kürzeres Kraul am Stück, kürzere Läufe), ausgelassenen und Extra-Einheiten und
   nachträglichen Korrekturen (Wert nach unten). Geprüft: der Coach behauptet nie das Soll als geschafft (Bewertungen, Wochen-Nachrichten,
   Antworten), Stufe und Können steigen nie über das wirklich Eingetragene, Korrekturen werden neu bewertet („Korrigiert: …“). */
import * as C from '../../shared/core';
import { applyOnboarding } from '../../shared/onboarding';
import { checkPlanRules } from '../../shared/planrules';
import { isHardSession, maxHard, fixedHardDays } from '../../shared/intensity';
import { nameIssues } from '../../shared/sessiontypes';
import { runEngine } from '../../shared/coach/engine';
import { converse } from '../../shared/coach/dialog';
import { claimFacts, unsupportedClaims } from '../../shared/coach/claims';
import { swimBests, swimSkillUpdate } from '../../shared/swimskill';
import { simulate, type Finding as F15 } from './many-sim';
import type { ManyUser } from '../../fixtures/manyusers';

export type Kind17 = 'tripleDay' | 'hardWeek' | 'names' | 'gear' | 'crawlPiece' | 'sollIst' | 'stage' | 'correction' | 'coach';
export const KIND17_LABEL: Record<Kind17, string> = {
  tripleDay: 'drei Termine an einem Tag', hardWeek: 'zu viele harte Einheiten in einer Woche', names: 'unklarer oder widersprüchlicher Name',
  gear: 'Hilfsmittel eingeplant, das nicht vorhanden ist', crawlPiece: 'Kraul-Stück länger als das Können', sollIst: 'Coach behauptet Soll als geschafft',
  stage: 'Stufe/Können über dem Eingetragenen', correction: 'Korrektur nicht neu bewertet', coach: 'Coach-Fehler'
};
export interface Finding17 { user: string; kind: Kind17; msg: string }

const GEAR_WORD: Record<string, RegExp> = { board: /Kickbrett/, buoy: /Pull Buoy/, fins: /Flossen/, paddles: /Paddles/, snorkel: /Schnorchel/ };
const rnd = (seed: number) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const live = (d: any) => (d.sessions || []).filter((s: any) => s && s.sport !== 'rest' && !s.cancelled);
const ownHardOf = (w: any) => (w.days || []).reduce((a: number, d: any) => a + live(d).filter((s: any) => !s.fixed && !s.race && s.sport !== 'football' && isHardSession(s)).length, 0);
/* längstes Kraul-Stück im Hauptteil ohne Hilfsmittel und ohne Technik-Übung (aus dem Beschreibungstext) */
export function longestCrawlPiece(s: any): number {
  const main = String(s.description || '').split(/\nAusschwimmen:/)[0].split(/\nHauptteil:/)[1] || '';
  let max = 0;
  for (const line of main.split('\n')) {
    if (/Pull Buoy|Kickbrett|Flossen|Beinschlag|Technik|so weit wie möglich/i.test(line)) continue;
    const m = /•\s*(?:\d+×)?(\d+) m Kraul\b/.exec(line); if (m) max = Math.max(max, +m[1]);
  }
  return max;
}

/* Plan-Prüfungen von Auftrag 17 ab „from“ (12 Wochen) */
export function planFindings17(user: string, weeks: any[], profile: any, today: string, from: string, label: string, ability: number | null): Finding17[] {
  const out: Finding17[] = []; const add = (kind: Kind17, msg: string) => out.push({ user, kind, msg: `${label}: ${msg}` });
  const ws = weeks.filter((w: any) => (w.endDate || C.addDays(w.startDate, 6)) >= from).slice(0, 12);
  for (const i of checkPlanRules(ws, profile, { from })) if (i.rule === 'tripleDay') add('tripleDay', i.msg);
  const gear: string[] = (profile.skills || {}).swimGear || [];
  let bw = 0;
  for (const w0 of weeks) { if (w0 === ws[0]) break; bw = String(w0.phase || 'base') === 'base' ? bw + 1 : 0; }
  for (const w of ws) {
    const ph = String(w.phase || 'base').toLowerCase() as any; const baseWeek = ph === 'base' ? bw : 0; bw = ph === 'base' ? bw + 1 : 0;
    const fixed = fixedHardDays(w);
    // eigene harte Einheiten (Tests zählen wie in shared/intensity.ts einen mehr), Spiele und Wettkämpfe sind im Limit schon enthalten
    const tests = (w.days || []).some((d: any) => live(d).some((s: any) => /test/i.test(s.title || '') && isHardSession(s))) ? 1 : 0;
    const own = ownHardOf(w), max = maxHard(profile, ph, w.startDate || today, baseWeek, fixed) - fixed + tests;
    if (own > max && !w.partial) add('hardWeek', `Woche ${w.weekNumber}: ${own} eigene harte Einheiten (+${fixed} Spiel/Wettkampf), erlaubt ${max}.`);
    for (const d of w.days || []) for (const s of live(d)) {
      if (d.date < from) continue;
      for (const n of nameIssues(s)) add('names', `${d.date} ${n}`);
      if (s.sport !== 'swim') continue;
      const txt = `${s.title}\n${s.description || ''}`;
      for (const [g, re] of Object.entries(GEAR_WORD)) if (re.test(txt) && !gear.includes(g)) add('gear', `${d.date} ${s.title}: ${re.source} ohne ${g} im Profil.`);
      // in den ersten 3 Wochen (noch kein Nachweis): Kraul-Stücke höchstens so lang wie das angegebene Können (mindestens 25 m)
      if (ability != null && d.date < C.addDays(today, 21)) { const p = longestCrawlPiece(s); if (p > Math.max(25, ability)) add('crawlPiece', `${d.date} ${s.title}: ${p} m Kraul am Stück, Können ${ability} m.`); }
    }
  }
  return out;
}

export interface Sim17 { findings: Finding17[]; base: F15[]; profile: any; goals: any[]; plan: any; state: any; today: string; stats: { hardMax: number; triple: number; corrections: number; swimEntries: number } }
export function simulate17(u: ManyUser, T0: string, o: { skipper?: boolean; corrector?: boolean } = {}): Sim17 {
  const F: Finding17[] = []; const add = (kind: Kind17, msg: string) => F.push({ user: u.id, kind, msg });
  const base = simulate(u, T0).findings;
  const r = applyOnboarding(u.answers, T0);
  const stats = { hardMax: 0, triple: 0, corrections: 0, swimEntries: 0 };
  if (!r.gen) return { findings: F, base, profile: r.profile, goals: r.goals, plan: null, state: null, today: T0, stats };
  let profile: any = r.profile; const goals = r.goals; const plan = r.gen.plan;
  const sk0: any = profile.skills || {};
  const swims = (profile.sports || []).includes('swim');
  const ability = swims ? (sk0.swimCrawl === 'yes' || Number(sk0.swimCrawlM) > 0 ? Number(sk0.swimCrawlM) || 0 : 0) : null;
  F.push(...planFindings17(u.id, plan.weeks, profile, T0, T0, 'Start', ability));
  for (const w of plan.weeks.slice(0, 12)) stats.hardMax = Math.max(stats.hardMax, ownHardOf(w));
  stats.triple = F.filter(f => f.kind === 'tripleDay').length;

  // ---------- 3 Wochen mit Abweichungen vom Soll ----------
  const R = rnd(u.id.split('').reduce((a, c) => a * 37 + c.charCodeAt(0), 11));
  const state: any = { sessions: {}, customWorkouts: {}, trend: [], illnessPeriods: [], adjustments: {}, coachMsgs: {}, settings: {}, activities: {}, nutrition: {} };
  const ctx = (today: string, now: number): any => ({ today, now, state: { ...state, profile }, baseWeeks: plan.weeks, planMeta: plan.meta || {}, profile, goals });
  const entered: number[] = []; // alle eingetragenen Werte „Kraul am Stück“
  const check = (where: string, text: string, today: string) => {
    if (!text) return;
    const bad = unsupportedClaims(text, claimFacts(ctx(today, Date.parse(today + 'T20:00:00Z'))));
    for (const b of bad) add('sollIst', `${where}: „${b.slice(0, 140)}“`);
  };
  const runEv = (date: string, now: number, ev: any) => {
    let out: any; try { out = runEngine(ctx(date, now), ev); } catch (e: any) { add('coach', `${date} Engine ${ev.type}: ${e.message}`); return []; }
    for (const m of out.messages) { state.coachMsgs[m.id] = m; check(`${date} ${m.title || m.kind}`, m.text || '', date); }
    for (const a of out.adjustments || []) state.adjustments[a.id] = { ...a, createdAt: now };
    return out.messages as any[];
  };
  let correctedOnce = false;
  for (let k = 0; k < 21; k++) {
    const date = C.addDays(T0, k); const now = Date.parse(date + 'T19:00:00Z');
    state.trend.push({ date, hrv: 58 + Math.round(R() * 14), restingHR: 50 + Math.round(R() * 8), sleepHours: 6 + Math.round(R() * 25) / 10, feel: 1 + Math.floor(R() * 4) });
    const day = C.planDays(C.applyAdjustments(plan.weeks, state.adjustments)).find((d: any) => d.date === date);
    const done: string[] = [];
    for (const s of day ? live(day) : []) {
      if (s.fixed || s.sport === 'football' || s.race) continue;
      const x = R();
      if (x < (o.skipper ? 0.45 : 0.15)) { state.sessions[s.id] = { skipped: true, skipReason: 'keine Zeit' }; continue; }
      const f = 0.55 + R() * 0.4; // immer weniger als geplant
      const min = Math.max(10, Math.round((s.plannedMinutes || 40) * f));
      const metrics: any = { min: String(min), rpe: String(3 + Math.floor(R() * 4)) };
      const src: any = { min: 'manual', rpe: 'manual' };
      if (s.sport === 'swim') {
        const planned = longestCrawlPiece(s);
        const crawl = planned >= 50 ? Math.max(25, Math.floor(planned / 2 / 25) * 25) : planned >= 25 ? 25 : 0; // Ist: halbes Soll-Stück
        metrics.meters = String(Math.max(100, Math.round((s.plannedKm || 0.8) * 1000 * f / 25) * 25)); src.meters = 'manual';
        if (crawl) { metrics.longestCrawl = String(crawl); src.longestCrawl = 'manual'; entered.push(crawl); }
        stats.swimEntries++;
      }
      if (s.sport === 'run' && s.plannedKm) { metrics.km = String(Math.round(s.plannedKm * f * 10) / 10); src.km = 'manual'; }
      if (s.sport === 'bike' && s.plannedKm) { metrics.km = String(Math.round(s.plannedKm * f)); src.km = 'manual'; }
      state.sessions[s.id] = { completed: true, metrics, metricsSrc: src, completedAt: now };
      done.push(s.id);
    }
    if (k % 7 === 3) { // Extra-Einheit
      const sp = (profile.sports || []).find((x: string) => x !== 'strength') || 'strength';
      (state.customWorkouts[date] = state.customWorkouts[date] || []).push({ id: `x17-${u.id}-${k}`, sport: sp, title: 'Extra-Einheit', plannedMinutes: 35, completed: true, metrics: { min: 35, rpe: 4 } });
    }
    if (done.length) runEv(date, now, { type: 'activity', sessionIds: done });
    // Schwimm-Können wie in der App (web/src/testupdate.ts): Korrekturen und bestätigte Fortschritte wirken sofort
    if (swims) {
      const best = swimBests(state, plan.weeks, date);
      const up = swimSkillUpdate(profile, plan.weeks, state.adjustments, date, best, now);
      if (up && !up.reviewOnly) { profile = { ...profile, skills: { ...(profile.skills || {}), ...up.skills } }; up.adjustments.forEach((a: any, i: number) => { state.adjustments[a.id] = { ...a, createdAt: now + i, date }; }); check(`${date} Schwimm-Können`, up.text, date); }
      const conf = C.confirmedOf(entered);
      const cur = Number((profile.skills || {}).swimCrawlM) || 0;
      if (entered.length && cur > Math.max(conf, ability || 0)) add('stage', `${date}: Können ${cur} m, eingetragen ${entered.join('/')} m, Angabe ${ability} m.`);
      if (best.crawl > Math.max(...entered, 0)) add('stage', `${date}: Bestwert ${best.crawl} m über dem Eingetragenen (${entered.join('/')}).`);
    }
    // Korrektur: am Tag danach den Wert einer erledigten Einheit nach unten korrigieren
    const yest = C.addDays(date, -1);
    const prevDone = Object.entries(state.sessions).filter(([id, v]: any) => v.completed && v.completedAt === Date.parse(yest + 'T19:00:00Z') && id).map(([id]) => id);
    if ((o.corrector || !correctedOnce) && prevDone.length && k > 0) {
      const id = prevDone[0]; const st = state.sessions[id]; const m = { ...st.metrics };
      if (m.longestCrawl && +m.longestCrawl > 25) m.longestCrawl = String(+m.longestCrawl - 25);
      else if (m.km) m.km = String(Math.max(1, Math.round(+m.km * 0.7 * 10) / 10));
      else m.min = String(Math.max(10, Math.round(+m.min * 0.7)));
      state.sessions[id] = { ...st, metrics: m, metricsSrc: { ...(st.metricsSrc || {}), ...Object.fromEntries(Object.keys(m).map(x => [x, 'manual'])) }, editedAt: now };
      if (m.longestCrawl) { const i = entered.lastIndexOf(+st.metrics.longestCrawl); if (i >= 0) entered[i] = +m.longestCrawl; }
      const old = state.coachMsgs['msg-review-' + id];
      const msgs = runEv(date, now + 60000, { type: 'activity', sessionIds: [id] });
      const re = msgs.find((x: any) => x.id === 'msg-review-' + id);
      if (old && re && !/^Korrigiert:/.test(re.text || '')) add('correction', `${date}: neue Bewertung von ${id} ohne „Korrigiert“.`);
      correctedOnce = true; stats.corrections++;
    }
    runEv(date, now + 120000, { type: 'daily' });
    if (new Date(date + 'T12:00:00Z').getUTCDay() === 0) runEv(date, now + 180000, { type: 'weekly' });
  }
  // ---------- Coach-Fragen zu Leistungen ----------
  const T3 = C.addDays(T0, 21); let dialog: any = {};
  for (const q of ['Was habe ich diese Woche geschafft?', 'Wie weit kann ich kraulen?', 'Wie war meine letzte Einheit?', 'Wie läuft mein Training?']) {
    try { const { reply, dialog: d2 } = converse(ctx(T3, Date.parse(T3 + 'T08:00:00Z')), dialog, q); dialog = d2; if (!reply || !reply.text) add('coach', `„${q}“: keine Antwort`); else if (reply.intent !== 'swim-skill') check(`„${q}“`, reply.text, T3); }
    catch (e: any) { add('coach', `„${q}“: ${e.message}`); }
  }
  // Plan nach den 3 Wochen (mit Anpassungen) erneut prüfen
  const eff = C.applyAdjustments(plan.weeks, state.adjustments);
  const now3 = (profile.skills || {}).swimCrawlM;
  F.push(...planFindings17(u.id, eff, profile, T3, T3, 'nach 3 Wochen', swims ? Math.max(Number(now3) || 0, ability || 0) : null));
  return { findings: F, base, profile, goals, plan: { ...plan, weeks: plan.weeks }, state, today: T3, stats };
}
