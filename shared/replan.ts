import {effectiveCustomBuckets} from './custom-state26';
import { personalResponse } from './response';
/* Kommende Wochen neu planen (Kern, ohne Browser): gleicher Ablauf für App, Fragebogen, Coach-Chat, Server und Tests.
   Regel für alle (Auftrag 7): Gibt es schon einen Plan, wird FORTGESETZT, nicht neu begonnen. Vergangene Wochen bleiben,
   Wochen- und Blockzählung laufen weiter, der Umfang knüpft an die Belastung (CTL/ATL) an, Score-Kalibrierung und Verlauf
   bleiben im Plan. Auftrag 11: Änderungen gelten ab heute (ab 18 Uhr ab morgen), nicht erst ab nächstem Montag. Vergangene Tage und
   erledigte Einheiten der laufenden Woche bleiben unverändert, der Rest der Woche wird neu verteilt (Erledigtes zählt mit).
   Vom Nutzer als „fest“ markierte Einheiten werden übernommen. */
import { generatePlan, transitionPlan, continuationOf, mondayOf, dayCap, enforceRecovery, type GenResult } from './plangen';
import { checkTrainingRules, repairTrainingRules, capLongSessions, TRULE_LABEL } from './trainingrules';
import * as C from './core';
import * as W from './workouts';
import type { Profile } from './profile';
import type { Goal } from './goals';
import { repairSpacing } from './planrules';
import { easyOf, isHardSession } from './intensity';
import { rulesOf, evaluate, dayLimit, allowedHard } from './constraints';
import { parseFor } from './ruleparse';

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
  // Auftrag 20: Lauf-Geh-Einheiten pro Woche bisher (letzte 2 normale Wochen vor dem Neuplanen): nicht sprunghaft mehr (eine mehr = +50-100 % Laufumfang)
  const rwN = (() => { const ws = eff.filter((w: any) => w.endDate < from && !w.isRecoveryWeek && !w.partial).slice(-2); const n = ws.map((w: any) => (w.days || []).reduce((a: number, d: any) => a + (d.sessions || []).filter((s: any) => s && !s.cancelled && s.stage && s.stage.ladder === 'runwalk').length, 0)); return n.length && n.every(x => x > 0) ? Math.max(...n) : null; })();
  const gen = generatePlan({ recentRunWalkN: rwN, profile, goals: gl, today, currentWeeklyHours: o.recentHours ?? null, load, from, frozen: frozenDays(old, o.adjustments, o.state, from), measuredStartMin: o.measuredStartMin ?? null, recentOwnMin, recentLong, pauseDays, response: st0 ? personalResponse(st0, old.weeks || [], today) : null,
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
  // Auftrag 19: Wettkämpfe kurz vor dem Ende des Plans: die Tage danach bleiben auch im neuen Abschnitt locker
  const past = (goals || []).filter(g => g && g.date && g.date <= lastEnd && g.date > C.addDays(lastEnd, -21));
  const gen = generatePlan({ profile, goals: gl, today: lastEnd, continueFrom: continuationOf(plan, lastEnd), load: null, pastGoals: past });
  const next = transitionPlan(plan, gen.plan, lastEnd);
  // Generated blocks have no knowledge of the preceding Sunday's sport. Repair
  // the join with a read-only copy of the old tail; all existing weeks stay exact.
  const from = C.addDays(lastEnd, 1);
  const tail = JSON.parse(JSON.stringify(weeks[weeks.length - 1]));
  for (const d of tail.days || []) for (const s of d.sessions || []) s.frozen = true;
  const rules = rulesOf(profile, parseFor(from));
  const fixes = repairSpacing([tail, ...next.weeks.slice(weeks.length)], profile, {
    from, noMove: true, keep: (s: any) => !!s.pinned || !!s.locked || !!s._done,
    dayCap: (date: string) => Math.min(dayCap(profile, new Date(date + 'T12:00:00Z').getUTCDay()), dayLimit(rules, date).cap),
    allowed: (s: any, date: string) => !evaluate(rules, s, date).hard.length && dayLimit(rules, date).cap > 0 && !(s.sport === 'swim' && s.place !== 'outdoor' && !allowedHard(rules, { sport: 'swim', place: 'pool' }, date)),
  });
  // The first new day also observes the old block's final hard day, across sports.
  const lastDay = (tail.days || []).find((d: any) => d.date === lastEnd);
  const firstDay = next.weeks.slice(weeks.length).flatMap((w: any) => w.days || []).find((d: any) => d.date === from);
  if (lastDay?.sessions.some(isHardSession) && firstDay) {
    firstDay.sessions = firstDay.sessions.map((s: any) => {
      if (!isHardSession(s)) return s;
      if (s.fixed || s.race || s.stage || s.frozen || s.pinned || s.locked || s._done || !s.spec || /test/i.test(s.title || '')) {
        fixes.push(from + ': Konflikt: zwei harte Tage hintereinander; feste Einheit bleibt erhalten.');
        return s;
      }
      const easy = easyOf(s, next.weeks[weeks.length]?.phase || 'base');
      easy.description = (easy.description || '') + ' Warum: Nach dem harten Vortag locker, damit keine zwei harten Tage hintereinander entstehen.';
      fixes.push(from + ': Locker nach dem harten Vortag: keine zwei harte Tage hintereinander.');
      return easy;
    });
  }
  if (fixes.length) next.meta = { ...next.meta, ruleFixes: [...(next.meta?.ruleFixes || []), ...fixes] };
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
  Object.entries((state && effectiveCustomBuckets(state)) || {}).forEach(([d, l]: any) => { if (d >= from && d < m.calibrateAt) (l || []).forEach((c: any) => { if (c && c.sport !== 'football') { min += +((c.metrics || {}).min) || c.plannedMinutes || 0; n++; } }); });
  if (n < 2) return null;
  return { minutes: Math.round(min / 2) };
}

/* ---------- Auftrag 34: Plan-Pflege für bestehende Pläne ----------
   Ursache von „Erholungswoche zu niedrig/hoch“, „Ruhetage“, „Lange Einheit +10 min“ … im täglichen Daten-Check: Pläne, die mit einer
   älteren Fassung des Generators erstellt wurden (vor Auftrag 30 durfte die Erholungswoche bei 50 % oder 82 % liegen), behielten ihre
   Wochen; neue Regeln griffen erst beim nächsten Neu-Planen. Hier laufen dieselben Reparatur-Bausteine wie im Generator
   (repairTrainingRules, enforceRecovery, capLongSessions) – aber nur in Wochen mit einem Verstoß und nur ab morgen. Das Ergebnis sind
   normale Anpassungen (mit Grund, Mitteilung und Rückgängig), der gespeicherte Plan bleibt unverändert. Nicht angefasst: Erledigtes,
   Feste/Gesperrte, Wettkämpfe, Teamsport, von Hand oder im Chat geänderte Einheiten. Hat jemand eine Pflege-Änderung rückgängig gemacht,
   bleibt die Einheit, wie sie ist. Ergebnis nur, wenn danach weniger Verstöße übrig sind. */
const UPKEEP_FIELDS = ['title', 'plannedMinutes', 'plannedKm', 'zone', 'description', 'spec', 'hard', 'long'] as const;
export interface Upkeep { adjustments: any[]; before: number; after: number; texts: string[]; /** Wochen, in denen eine Regel mit den eigenen Regeln der Person nicht erfüllbar ist (ehrliche Lücke, wie im Generator) */ gaps: { week: number; rule: string; why: string }[] }
export function planUpkeep(baseWeeks: any[], state: any, profile: Profile, goals: Goal[], today: string, now = Date.now(), meta: any = {}): Upkeep {
  const none: Upkeep = { adjustments: [], before: 0, after: 0, texts: [], gaps: [] };
  const adjs: Record<string, any> = (state && state.adjustments) || {};
  const from = C.addDays(today, 1);
  const goalType = ((goals || []).find(g => g && g.priority === 'A' && !g.result) || (goals || [])[0] || ({} as any)).type || null;
  const tOpts = { from, today, goals: goals || [], goalType };
  const eff = C.applyAdjustments(baseWeeks || [], adjs);
  const issues0 = checkTrainingRules(eff, profile, tOpts as any);
  if (!issues0.length) return { ...none };
  const bad = new Set(issues0.map(x => x.week));
  // von Hand/Chat/KI geändert, oder eine frühere Pflege wurde rückgängig gemacht: so lassen
  const byUser = (s: any) => (s._adj || []).some((id: string) => { const a = adjs[id]; return a && (a.from_user || a.from_ai || /^(user|chat|ai|plan-edit|edit)-/.test(String(a.group || a.id))); });
  const refused = new Set(Object.values(adjs).filter((a: any) => a && a.undone && /^plancheck-/.test(String(a.id))).map((a: any) => a.sessionId || (a.session && a.session.id)));
  const weeks = JSON.parse(JSON.stringify(eff));
  const keepIds = new Set<string>(); const keepBase = new Set<string>();
  const weekOf = new Map<string, any>();
  weeks.forEach((w: any) => (w.days || []).forEach((d: any) => (d.sessions || []).forEach((s: any) => {
    weekOf.set(s.id, w);
    const done = !!(((state && state.sessions) || {})[s.id] || {}).completed;
    if (d.date < from || done || s.fixed || s.race || s.locked || s.ruleOverride || s.sport === 'football' || byUser(s) || refused.has(s.id)) keepBase.add(s.id);
    // im Wochenraster festgelegt (pinned): Tag und Art bleiben, nur die Dauer darf sich ändern
    if (!bad.has(w.weekNumber) || keepBase.has(s.id) || s.pinned) keepIds.add(s.id);
  })));
  const rules = rulesOf(profile, parseFor(today));
  const dow = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
  const capOf = (date: string) => Math.min(dayCap(profile, dow(date)), dayLimit(rules, date).cap);
  const opts: any = { ...tOpts, keep: (s: any) => keepIds.has(s.id), dayCap: capOf, runQualityOk: meta.runIntervalsAllowed !== false,
    allowed: (s: any, date: string) => !evaluate(rules, { ...s, long: !!s.long, hard: !!s.hard }, date).hard.length && dayLimit(rules, date).cap > 0 && !(s.sport === 'swim' && s.place !== 'outdoor' && !allowedHard(rules, { sport: 'swim', place: 'pool' }, date)) };
  const fixTexts: string[] = [];
  // welcher Schritt hat welche Einheit geändert (Grund in der Mitteilung)
  const why = new Map<string, string>();
  const snap = () => { const m = new Map<string, string>(); weeks.forEach((w: any) => (w.days || []).forEach((d: any) => (d.sessions || []).forEach((x: any) => { if (x && x.id) m.set(x.id, d.date + JSON.stringify(x)); }))); return m; };
  const mark = (before: Map<string, string>, label: string) => { const after = snap(); for (const [id, v] of after) if (before.get(id) !== v && !why.has(id)) why.set(id, label); for (const id of before.keys()) if (!after.has(id) && !why.has(id)) why.set(id, label); };
  // gezielt je Regel (vorher lief die ganze Reparatur über jede Woche mit irgendeinem Verstoß und legte z. B. einen zweiten Ruhetag an,
  // obwohl nur die lange Einheit zu lang war):
  // 1) allgemeine Trainingsregeln (Ruhetage, Wettkampfwoche, nach langem Tag …) nur in Wochen mit genau so einem Verstoß
  const SPECIAL = new Set(['recoveryDepth', 'longStep', 'longCap']);
  const general = new Set(issues0.filter(x => !SPECIAL.has(x.rule)).map(x => x.week));
  const generalLabel = (wn: number) => [...new Set(issues0.filter(x => x.week === wn && !SPECIAL.has(x.rule)).map(x => TRULE_LABEL[x.rule]))].join(', ');
  if (general.size) { const b0 = snap(); fixTexts.push(...repairTrainingRules(weeks, profile, { ...opts, keep: (s: any) => keepIds.has(s.id) || !general.has((weekOf.get(s.id) || {}).weekNumber) })); const after = snap(); for (const [id, v] of after) if (b0.get(id) !== v) why.set(id, generalLabel((weekOf.get(id) || weeks.find((w: any) => w.days.some((d: any) => (d.sessions || []).some((y: any) => y && y.id === id))) || {}).weekNumber) || 'Trainingsregeln'); for (const id of b0.keys()) if (!after.has(id)) why.set(id, generalLabel((weekOf.get(id) || {}).weekNumber) || 'Trainingsregeln'); }
  const gaps = weeks.filter((w: any) => general.has(w.weekNumber) && (w.qualityGap || (w.freqGap || []).length)).flatMap((w: any) => [...(w.qualityGap ? [{ week: w.weekNumber, rule: 'goalQuality', why: String(w.qualityGap) }] : []), ...((w.freqGap || []).length ? [{ week: w.weekNumber, rule: 'minFreq', why: 'Häufigkeit mit deinen Regeln nicht möglich' }] : [])]);
  // 2) Erholungswoche: dieselbe Stelle wie der Generator (enforceRecovery), nur für die betroffene Woche und ihre Bezugswoche
  for (const x of issues0.filter(i => i.rule === 'recoveryDepth')) {
    const i = weeks.findIndex((w: any) => w.weekNumber === x.week); if (i < 1) continue;
    let j = i - 1; while (j >= 0 && (weeks[j].isRecoveryWeek || weeks[j].partial || weeks[j].entry || weeks[j].reduced || weeks[j].phase === 'taper' || weeks[j].phase === 'race')) j--;
    if (j >= 0) { const b0 = snap(); enforceRecovery([weeks[i]], weeks[j], keepIds, capOf); mark(b0, TRULE_LABEL.recoveryDepth); }
  }
  // 3) lange Einheiten: genau auf die Grenze aus der Prüfung (gleiche Zahlen wie der Daten-Check)
  const bL = snap();
  for (let k = 0; k < 30; k++) {
    const longs = checkTrainingRules(weeks, profile, tOpts as any).filter(x => x.rule === 'longStep' || x.rule === 'longCap');
    if (!longs.length) break;
    let changed = false;
    for (const x of longs) {
      const w = weeks.find((y: any) => y.weekNumber === x.week); if (!w) continue;
      const bike = /Ausfahrt/.test(x.msg); const m = /(\d+) min nach (\d+) min/.exec(x.msg) || /höchstens (\d+) min/.exec(x.msg);
      const lim = m ? (m.length > 2 ? +m[2] + (bike ? 15 : 10) : +m[1]) : null; if (!lim) continue;
      const cand = (w.days || []).filter((d: any) => d.date >= from && (!x.date || d.date === x.date)).flatMap((d: any) => (d.sessions || []).filter((s2: any) => s2 && s2.spec && !s2.cancelled && !keepBase.has(s2.id) && s2.sport === (bike ? 'bike' : 'run') && (s2.long || /^Lang/.test(s2.title || ''))));
      for (const s2 of cand) if ((s2.plannedMinutes || 0) > lim) { for (let t = 0; t < 4 && s2.plannedMinutes > lim; t++) { const rb = W.rebuildScaled(s2, lim / s2.plannedMinutes * (1 - 0.03 * t)); if (rb && rb.plannedMinutes < s2.plannedMinutes) { Object.assign(s2, rb, { plannedKm: rb.plannedKm ?? undefined }); changed = true; } } }
    }
    if (!changed) break;
  }
  // lange Ausfahrt mit Blöcken lässt sich nicht immer einfach skalieren: dann dieselbe Stelle wie der Generator (capLongSessions)
  for (let k = 0; k < 3 && checkTrainingRules(weeks, profile, tOpts as any).some(x => x.rule === 'longStep' || x.rule === 'longCap'); k++) capLongSessions(weeks, profile, { ...opts, keep: (s2: any) => keepBase.has(s2.id) });
  mark(bL, TRULE_LABEL.longStep);
  // Unterschiede zum jetzigen Stand als normale Anpassungen
  const where = (ws: any[]) => { const m = new Map<string, { s: any; date: string }>(); ws.forEach(w => (w.days || []).forEach((d: any) => (d.sessions || []).forEach((s: any) => { if (s && s.id && s.sport !== 'rest') m.set(s.id, { s, date: d.date }); }))); return m; };
  const A = where(eff), B = where(weeks);
  const group = 'plancheck-' + today;
  const out: any[] = [];
  const dm = (d: string) => `${['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][dow(d)]} ${+d.slice(8)}.${+d.slice(5, 7)}.`;
  const reasonOf = (id: string) => 'Trainingsregel: ' + (why.get(id) || 'Trainingsregeln');
  const strip = (s: any) => { const o: any = {}; for (const k of UPKEEP_FIELDS) o[k] = s[k] == null ? null : s[k]; return o; };
  for (const [id, a] of A) {
    if (a.date < from || keepBase.has(id)) continue;
    const b = B.get(id); const reason = reasonOf(id);
    if (!b || b.s.cancelled && !a.s.cancelled) { if (!a.s.cancelled) out.push({ id: `${group}-${id}-cancel`, group, type: 'cancel', sessionId: id, what: `${a.s.title} (${dm(a.date)}) entfällt`, reason }); continue; }
    if (b.date !== a.date) out.push({ id: `${group}-${id}-move`, group, type: 'move', sessionId: id, from: a.date, to: b.date, what: `${a.s.title}: ${dm(a.date)} → ${dm(b.date)}`, reason });
    const sa = strip(a.s), sb = strip(b.s); const set: any = {};
    for (const k of UPKEEP_FIELDS) if (JSON.stringify(sa[k]) !== JSON.stringify(sb[k])) set[k] = sb[k];
    if (Object.keys(set).length) out.push({ id: `${group}-${id}-modify`, group, type: 'modify', sessionId: id, set, what: a.s.plannedMinutes !== b.s.plannedMinutes ? `${a.s.title} (${dm(b.date)}): ${a.s.plannedMinutes} → ${b.s.plannedMinutes} min` : `${a.s.title} (${dm(b.date)}) → ${b.s.title}`, reason });
  }
  for (const [id, b] of B) if (!A.has(id) && b.date >= from) { const { _adj, _orig, ...sess } = b.s; out.push({ id: `${group}-${id}-add`, group, type: 'add', to: b.date, session: sess, what: `${b.s.title} (${dm(b.date)}) dazu`, reason: reasonOf(id) }); }
  if (!out.length) return { ...none, before: issues0.length, after: issues0.length, gaps };
  // nur übernehmen, wenn es wirklich besser wird (gegen den gespeicherten Plan mit allen Anpassungen geprüft)
  const trial = { ...adjs }; out.forEach((a, i) => { trial[a.id] = { ...a, createdAt: now + i, date: today }; });
  const after = checkTrainingRules(C.applyAdjustments(baseWeeks || [], trial), profile, tOpts as any).length;
  if (after >= issues0.length) return { ...none, before: issues0.length, after: issues0.length, gaps };
  return { adjustments: out.map((a, i) => ({ ...a, createdAt: now + i, date: today, from_upkeep: true })), before: issues0.length, after, texts: out.map(a => a.what), gaps };
}

/* Auftrag 34: Mitteilung zur Plan-Pflege – kurz, mit Beispielen und Grund */
export function upkeepText(up: Upkeep): string {
  const n = up.adjustments.length; const ex = up.texts.slice(0, 3);
  const reasons = [...new Set(up.adjustments.map(a => String(a.reason || '').replace(/^Trainingsregel: /, '')).filter(Boolean))].slice(0, 3);
  const gap = up.gaps.find(g => g.rule === 'goalQuality');
  return `Ich habe deinen Plan mit den Trainingsregeln abgeglichen und ${n === 1 ? 'eine Einheit' : n + ' Einheiten'} angepasst${ex.length ? ', zum Beispiel: ' + ex.join('; ') : ''}.`
    + (reasons.length ? ` Grund: ${reasons.join(', ')}.` : '')
    + (gap ? ` Hinweis: ${gap.why}` : '')
    + ' Du kannst das rückgängig machen.';
}
