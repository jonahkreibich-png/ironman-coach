/* Kommende Wochen neu planen (Kern, ohne Browser): gleicher Ablauf für App, Fragebogen, Coach-Chat, Server und Tests.
   Regel für alle (Auftrag 7): Gibt es schon einen Plan, wird FORTGESETZT, nicht neu begonnen. Vergangene Wochen bleiben,
   Wochen- und Blockzählung laufen weiter, der Umfang knüpft an die Belastung (CTL/ATL) an, Score-Kalibrierung und Verlauf
   bleiben im Plan. Auftrag 11: Änderungen gelten ab heute (ab 18 Uhr ab morgen), nicht erst ab nächstem Montag. Vergangene Tage und
   erledigte Einheiten der laufenden Woche bleiben unverändert, der Rest der Woche wird neu verteilt (Erledigtes zählt mit).
   Vom Nutzer als „fest“ markierte Einheiten werden übernommen. */
import { generatePlan, transitionPlan, continuationOf, mondayOf, type GenResult } from './plangen';
import * as C from './core';
import type { Profile } from './profile';
import type { Goal } from './goals';

/* Ab wann gilt eine Änderung? Heute, ab 18 Uhr morgen. */
export function replanStart(today: string, hour: number): string { return hour >= 18 ? C.addDays(today, 1) : today; }

export interface ReplanOpts { stages?: any; recentHours?: number | null; adjustments?: any; /** Zustand (Trend, Krankheit, Einheiten) für die Belastung */ state?: any; needTests?: Partial<Record<'run' | 'bike' | 'swim', boolean>>;
  /** ab diesem Tag gilt der neue Plan (Standard: heute) */ from?: string | null; /** gemessener Wochenumfang (Minuten) für die Kalibrierung */ measuredStartMin?: number | null }

/* Einheiten der laufenden Woche, die bleiben: alles vor „from“ und alles Erledigte. Genommen wird die Einheit aus dem Basisplan
   (Anpassungen wirken weiter über ihre ID), einsortiert an dem Tag, an dem sie wirklich liegt (auch nach Verschieben). */
export function frozenDays(old: any, adjustments: any, state: any, from: string): { date: string; sessions: any[] }[] | null {
  const mon = mondayOf(from);
  const covers = (old.weeks || []).some((w: any) => (w.days || []).some((d: any) => d.date >= mon && d.date <= C.addDays(mon, 6)));
  if (!covers) return null;
  const base: Record<string, any> = {};
  C.planDays(old.weeks || []).forEach((d: any) => (d.sessions || []).forEach((s: any) => { if (s && s.id) base[s.id] = s; }));
  const st = (state && state.sessions) || {};
  const out: Record<string, any[]> = {};
  for (const d of C.planDays(C.applyAdjustments(old.weeks || [], adjustments || {}))) {
    if (d.date < mon || d.date > C.addDays(mon, 6)) continue;
    for (const s of d.sessions || []) {
      if (!s || (s.sport === 'rest' && d.date >= from)) continue;
      const done = !!(st[s.id] && st[s.id].completed);
      if (d.date >= from && !done) continue;
      const orig = JSON.parse(JSON.stringify(base[s.id] || s));
      if (done) { orig._done = true; const m = +(((st[s.id] || {}).metrics || {}).min); if (m > 0) orig._doneMin = m; }
      (out[d.date] = out[d.date] || []).push(orig);
    }
  }
  return Object.entries(out).map(([date, sessions]) => ({ date, sessions }));
}

export function replanPlan(old: any, profile: Profile, goals: Goal[], today: string, o: ReplanOpts = {}): { plan: any; gen: GenResult } | null {
  const gl = (goals || []).filter(g => g && !g.result);
  if (!old || !gl.length) return null;
  const from = o.from || today;
  const stages = o.stages || {};
  const eff = C.applyAdjustments(old.weeks || [], o.adjustments || {});
  const load = o.state ? C.loadBaseline({ ...o.state, adjustments: o.adjustments || o.state.adjustments }, eff, today) : null;
  // Auftrag 17: Steigerung gedeckelt durch das wirklich erledigte eigene Training der letzten Wochen
  const st0 = o.state ? { ...o.state, adjustments: o.adjustments || o.state.adjustments } : null;
  const recentOwnMin = st0 ? C.recentOwnMinutes(st0, old.weeks || [], from) : null;
  const recentLong = st0 ? { run: C.recentLongest(st0, old.weeks || [], from, 'run'), bike: C.recentLongest(st0, old.weeks || [], from, 'bike') } : null;
  // Auftrag 18: Pause ohne Krankheit (Urlaub, Prüfungen …) → Wiedereinstieg je nach Länge
  const pauseDays = st0 ? C.trainingGap(st0, old.weeks || [], from) : null;
  const gen = generatePlan({ profile, goals: gl, today, currentWeeklyHours: o.recentHours ?? null, load, from, frozen: frozenDays(old, o.adjustments, o.state, from), measuredStartMin: o.measuredStartMin ?? null, recentOwnMin, recentLong, pauseDays,
    continueFrom: continuationOf(old, today, o.state ? { ...o.state, adjustments: o.adjustments || o.state.adjustments } : undefined, from), needTests: o.needTests,
    stages: { swim: stages.swim === undefined ? undefined as any : stages.swim, runwalk: stages.runwalk === undefined ? undefined as any : stages.runwalk } });
  const next = transitionPlan(old, gen.plan, today, from);
  const locked = C.planDays(eff).flatMap((d: any) => d.sessions.filter((s: any) => s.locked && d.date >= from).map((s: any) => ({ s, date: d.date })));
  for (const { s, date } of locked) {
    const day = next.weeks.flatMap((w: any) => w.days).find((d: any) => d.date === date);
    if (day) { day.sessions = day.sessions.filter((x: any) => x.sport !== 'rest'); if (!day.sessions.some((x: any) => x.id === s.id)) day.sessions.push({ ...s, _adj: undefined, _orig: undefined }); }
  }
  next.meta = { ...next.meta, explain: gen.plan.meta.explain, from };
  return { plan: next, gen };
}

/* Plan automatisch verlängern (sonntags auf dem Server): endet der Plan in weniger als 6 Wochen, kommt der nächste Abschnitt dazu.
   Bestehende Wochen bleiben unverändert (auch Anpassungen und feste Einheiten), der Umfang knüpft an die letzte normale Woche an. */
export function extendPlan(plan: any, profile: Profile, goals: Goal[], today: string): any | null {
  const weeks = (plan && plan.weeks) || []; if (!weeks.length) return null;
  const lastEnd = weeks[weeks.length - 1].endDate || C.addDays(weeks[weeks.length - 1].startDate, 6);
  const gl = (goals || []).filter(g => g && !g.result && (!g.date || g.date > lastEnd));
  if (!gl.length || lastEnd > C.addDays(today, 42)) return null;
  const gen = generatePlan({ profile, goals: gl, today: lastEnd, continueFrom: continuationOf(plan, lastEnd), load: null });
  const next = transitionPlan(plan, gen.plan, lastEnd);
  next.meta = { ...next.meta, explain: (plan.meta && plan.meta.explain) || gen.plan.meta.explain, extendedAt: today };
  return next.weeks.length > weeks.length ? next : null;
}

/* „Stunden bisher: weiß ich nicht“ (Auftrag 11): nach 2 Wochen den Umfang an die echten Daten anpassen.
   Fällig, wenn der Plan es vorsieht (meta.calibrateAt) und genug eingetragen ist; liefert den gemessenen Wochenumfang in Minuten. */
export function calibrationDue(plan: any, state: any, today: string): { minutes: number } | null {
  const m = plan && plan.meta; if (!m || !m.calibrateAt || m.calibrated || today < m.calibrateAt) return null;
  const from = C.addDays(m.calibrateAt, -14);
  let min = 0, n = 0;
  C.planDays(plan.weeks || []).filter((d: any) => d.date >= from && d.date < m.calibrateAt).forEach((d: any) => (d.sessions || []).forEach((s: any) => {
    const st = ((state && state.sessions) || {})[s.id]; if (!st || !st.completed || s.sport === 'football' || s.sport === 'rest') return;
    min += +((st.metrics || {}).min) || s.plannedMinutes || 0; n++;
  }));
  Object.entries((state && state.customWorkouts) || {}).forEach(([d, l]: any) => { if (d >= from && d < m.calibrateAt) (l || []).forEach((c: any) => { if (c && c.sport !== 'football') { min += +((c.metrics || {}).min) || c.plannedMinutes || 0; n++; } }); });
  if (n < 2) return null;
  return { minutes: Math.round(min / 2) };
}
