/* Plan-Generator (regelbasiert, Auftrag 4): aus Zielen, Profil, Zeit pro Tag, Häufigkeit je Sportart, Teamsport,
   Können und Berücksichtigungen ein periodisierter Plan.
   - Das A-Ziel bestimmt die Phasen (Grundlage, Aufbau, spezifisch, Tapering), Erholungswochen alle 3-4 Wochen.
   - B-Ziele: 3-5 Tage Tapering, danach 2-4 Tage Erholung. C-Ziele: Trainingswettkampf ohne Tapering.
   - Liegen Ziele in verschiedenen Sportarten, verteilt sich der Umfang nach Priorität und Zeitabstand.
   - Jede Einheit entsteht aus Bausteinen (shared/workouts.ts): Titel, Dauer, Distanz und Text passen immer zusammen.
   - Wer nicht kraulen oder nicht lange laufen kann, bekommt einen Lernweg statt Strecken über dem Können.
   Dieselben Sicherheitsregeln wie bei der Anpassung (shared/rules.ts). Ausgabe im bekannten Plan-Format. */
import type { Profile, SportKey, TeamSport } from './profile';
import { isMinor, DAYLOAD_MIN, ageOf } from './profile';
import type { Goal, GoalType } from './goals';
import { GOALS, legsOf, mainGoal } from './goals';
import { addDays } from './core';
import { validateWeeks, weekMinutes, goalAllowed, type Violation } from './rules';
import { HR_ZONES } from './sports';
import * as W from './workouts';
import { parseConsiderations, effectsOf, tipFor, type Effects, type Consideration } from './considerations';

export type Phase = 'base' | 'build' | 'specific' | 'taper' | 'race';
export interface GenInput {
  profile: Profile;
  /** ein einzelnes Ziel (alte Form) */
  goal?: Goal;
  /** alle Ziele; das A-Ziel bestimmt die Phasen */
  goals?: Goal[];
  today: string;
  /** Trainingsstunden pro Woche der letzten 4-8 Wochen (gemessen oder aus dem Fragebogen) */
  currentWeeklyHours?: number | null;
  /** fehlende Schwellen → Einstiegstests in den ersten 2 Wochen */
  needTests?: Partial<Record<'run' | 'bike' | 'swim', boolean>>;
  runIntervalsAllowed?: boolean;
  /** höchstens so viele Wochen ausgeben (der Rest folgt als späterer Block) */
  maxWeeks?: number;
  /** erreichte Lernstufen aus den Messdaten (sonst aus dem Profil) */
  stages?: { swim?: { ladder: 'swim' | 'swimBreast'; n: number } | null; runwalk?: number | null };
}
export interface GenResult { plan: any; summary: string[]; violations: Violation[]; phases: { phase: Phase; from: string; to: string; weeks: number }[]; dropped: string[] }

const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DOW_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const PHASE_LABEL: Record<Phase, string> = { base: 'Grundlage', build: 'Aufbau', specific: 'Wettkampfspezifisch', taper: 'Tapering', race: 'Wettkampfwoche' };
const SPORT_DE: Record<string, string> = { swim: 'Schwimmen', bike: 'Rad', run: 'Laufen', strength: 'Kraft', football: 'Teamsport' };
const dowOf = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
const daysBetween = (a: string, b: string) => Math.round((+new Date(b + 'T12:00:00Z') - +new Date(a + 'T12:00:00Z')) / 86400000);
function nextMonday(d: string) { const w = dowOf(d); return addDays(d, w === 1 ? 0 : ((8 - w) % 7)); }
const r5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);
const ENDURANCE: SportKey[] = ['swim', 'bike', 'run'];

/* Phasen über die verfügbaren Wochen verteilen */
export function phasePlan(nWeeks: number, goalType: string, recoveryEvery: number): { phase: Phase; recovery: boolean }[] {
  const longTaper = /marathon|middle|long|bike_event/.test(goalType) ? 2 : 1;
  const out: { phase: Phase; recovery: boolean }[] = [];
  const race = 1, taper = Math.min(longTaper, Math.max(0, nWeeks - 3));
  const rest = Math.max(1, nWeeks - race - taper);
  const specific = Math.max(1, Math.round(rest * 0.25)), build = Math.max(1, Math.round(rest * 0.35));
  const base = Math.max(0, rest - specific - build);
  const seq: Phase[] = [...Array(base).fill('base'), ...Array(build).fill('build'), ...Array(specific).fill('specific'), ...Array(taper).fill('taper'), 'race'];
  let sinceRecovery = 0;
  seq.slice(0, nWeeks).forEach((p, i) => {
    sinceRecovery++;
    const recovery = (p === 'base' || p === 'build' || p === 'specific') && sinceRecovery >= recoveryEvery && i < seq.length - race - taper - 1;
    if (recovery) sinceRecovery = 0;
    out.push({ phase: p, recovery });
  });
  return out;
}

/* ---------- Bedarf je Ziel ---------- */
function goalNeed(g: Goal): Partial<Record<SportKey, number>> {
  const t = g.type;
  if (t === 'fitness') return { run: 0.4, bike: 0.35, swim: 0.25 };
  if (GOALS[t].group === 'tri') {
    const s = new Set(legsOf(g).map(l => l.sport));
    const base: any = t === 'duathlon' ? { run: 0.45, bike: 0.55 } : t === 'aquathlon' ? { swim: 0.4, run: 0.6 } : { swim: 0.2, bike: 0.45, run: 0.35 };
    Object.keys(base).forEach(k => { if (!s.has(k as SportKey)) delete base[k]; });
    return base;
  }
  return { [legsOf(g)[0].sport]: 1 };
}
const PRIO_W: Record<string, number> = { A: 1, B: 0.6, C: 0.3 };
/* Anteil je Sportart in einer Woche: Ziele nach Priorität und Abstand gewichtet, gewählte Sportarten bekommen einen Grundanteil */
export function weekShare(goals: Goal[], weekStart: string, sports: SportKey[]): Partial<Record<SportKey, number>> {
  const w: Partial<Record<SportKey, number>> = {};
  for (const g of goals) {
    if (!g.date || g.date < weekStart) continue;
    const weeks = daysBetween(weekStart, g.date) / 7;
    const f = (PRIO_W[g.priority] || 0.3) / (1 + weeks / 6);
    for (const [s, v] of Object.entries(goalNeed(g)) as [SportKey, number][]) w[s] = (w[s] || 0) + f * v;
  }
  const endu = sports.filter(s => ENDURANCE.includes(s));
  const sum0 = Object.values(w).reduce((a, b) => a + (b || 0), 0) || 1;
  for (const s of endu) w[s] = Math.max(w[s] || 0, sum0 * 0.12);
  const sum = Object.values(w).reduce((a, b) => a + (b || 0), 0) || 1;
  const out: Partial<Record<SportKey, number>> = {};
  (Object.keys(w) as SportKey[]).forEach(k => { out[k] = (w[k] || 0) / sum; });
  return out;
}

/* ---------- Können: längste Einheit, die zur Person passt ---------- */
export function abilityCap(p: Profile, sport: 'run' | 'bike', weekIdx: number): number | null {
  const sk = p.skills || {};
  const base = sport === 'run' ? sk.runContinuousMin : sk.bikeLongestMin;
  if (base == null || !(base > 0)) return null;
  const start = Math.max(base * 1.15, base + 10);
  return Math.round(start * Math.pow(1.1, weekIdx));
}
const LONG_CAP: Partial<Record<GoalType, { run: number; bike: number }>> = {
  run_5k: { run: 60, bike: 90 }, run_10k: { run: 80, bike: 90 }, run_half: { run: 120, bike: 90 }, run_marathon: { run: 165, bike: 90 },
  tri_supersprint: { run: 45, bike: 75 }, tri_sprint: { run: 60, bike: 100 }, tri_olympic: { run: 85, bike: 150 }, tri_middle: { run: 120, bike: 240 }, tri_long: { run: 165, bike: 330 },
  duathlon: { run: 70, bike: 120 }, aquathlon: { run: 60, bike: 60 }, bike_event: { run: 60, bike: 330 }, swim_goal: { run: 50, bike: 90 }, fitness: { run: 70, bike: 120 }
};

/* Teamsport aktiv an diesem Tag? (Saison von … bis, sonst ganzjährig) */
export function teamActive(ts: TeamSport | null | undefined, date: string): boolean {
  if (!ts) return false;
  if (ts.seasonFrom && date < ts.seasonFrom) return false;
  if (ts.seasonTo && date > ts.seasonTo) return false;
  return true;
}
/* Minuten pro Wochentag: neue Form (kurz/mittel/lang), alte Zeitfenster oder Standard */
export function dayCap(p: Profile, dow: number): number {
  const dl = p.dayLoad || {};
  if (Object.keys(dl).length) { const v = (dl as any)[dow] || 0; return v === 3 ? Math.max(120, (p.maxDayHours || 2.5) * 60) : DAYLOAD_MIN[v as 0 | 1 | 2 | 3] || 0; }
  const av = p.availability || {};
  if (Object.keys(av).length) return Math.min((av[dow] || []).reduce((a, w) => a + Math.max(0, toMin(w.to) - toMin(w.from)), 0), (p.maxDayHours || 2.5) * 60);
  return dow === 1 ? 0 : (dow === 0 || dow === 6 ? (p.maxDayHours || 2.5) * 60 : 75);
}
function toMin(hhmm: string) { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); return m ? +m[1] * 60 + +m[2] : 0; }

/* Häufigkeit je Sportart: Wunsch aus dem Fragebogen, sonst aus dem Zeitbudget */
export function freqOf(p: Profile, sport: SportKey): [number, number] {
  const f = (p.freq || {})[sport];
  if (f && f.length === 2) return [Math.max(0, f[0]), Math.max(f[0], f[1])];
  const h = p.weeklyHours || 5;
  if (sport === 'strength') return p.sports.includes('strength') ? [1, 2] : [0, 0];
  if (sport === 'run') return h < 4 ? [2, 3] : [2, 4];
  if (sport === 'bike') return h < 4 ? [1, 2] : [1, 3];
  if (sport === 'swim') return h < 4 ? [1, 2] : [1, 3];
  return [0, 0];
}

export function paceCtx(p: Profile, indoor: boolean, bikeName: string | null, today: string): W.PaceCtx {
  const th = p.thresholds; const age = ageOf(p, today) ?? 35;
  return { runThrSec: th.thresholdPaceRunSec || null, lthrRun: th.lthrRun || null, lthrBike: th.lthrBike || null, bikeKmh: th.thresholdSpeedBikeKmh || null, ftp: p.powerMeter ? th.ftp || null : null, css: th.cssSec || null, breast100: 165 + (age >= 50 ? 15 : 0) + (p.sex === 'f' ? 5 : 0), indoor, bikeName };
}
const BIKE_LABEL: Record<string, string> = { road: 'Rennrad', gravel: 'Gravelbike', mtb: 'Mountainbike', tt: 'Zeitfahrrad', trekking: 'Trekkingrad', ebike: 'E-Bike', trainer: 'Rolle', spin: 'Indoor-Bike' };
function bikeChoice(p: Profile, hard: boolean, month: number, eff: Effects): { indoor: boolean; name: string | null } {
  const b = p.bikes || [];
  const indoorAvail = b.includes('trainer') || b.includes('spin');
  const forcedIndoor = !!eff.bikeIndoor || !!(eff.bikeIndoorMonths && eff.bikeIndoorMonths.includes(month));
  if (forcedIndoor) return { indoor: true, name: indoorAvail ? BIKE_LABEL[b.includes('trainer') ? 'trainer' : 'spin'] : null };
  if (hard && indoorAvail) return { indoor: true, name: BIKE_LABEL[b.includes('trainer') ? 'trainer' : 'spin'] };
  const out = ['gravel', 'road', 'mtb', 'trekking', 'tt', 'ebike'].find(k => b.includes(k));
  const outHard = ['road', 'tt', 'gravel'].find(k => b.includes(k));
  return { indoor: false, name: (hard ? outHard || out : out) ? BIKE_LABEL[(hard ? outHard || out : out)!] : null };
}

/* Wettkampf-Einheit: Dauer aus Wunschzeit oder typischer Dauer */
function raceSession(g: Goal): any {
  const def = GOALS[g.type];
  const min = g.targetTimeSec ? Math.round(g.targetTimeSec / 60) : Math.round((def.hours[0] + def.hours[1]) / 2 * 60);
  const sport: SportKey = def.group === 'tri' ? (g.type === 'aquathlon' || g.type === 'duathlon' ? 'run' : 'bike') : (legsOf(g)[0] || { sport: 'run' }).sport;
  const prio = g.priority === 'A' ? 'Hauptziel' : g.priority === 'B' ? 'wichtiges Rennen' : 'Trainingswettkampf';
  const lines = [`Wettkampf (${prio})${g.targetTimeSec ? `, Wunschzeit ${hm(g.targetTimeSec)}` : ''}.`,
    g.priority === 'C' ? 'Als Training laufen lassen: zügig, aber nicht ganz am Limit. Kein Tapering davor.' : 'Ruhig starten, das erste Drittel bewusst etwas langsamer als geplant, dann steigern.',
    'Nur gewohntes Essen und Trinken, nichts Neues am Wettkampftag.'];
  return { sport, title: g.name, plannedMinutes: min, description: lines.join('\n'), race: true, goalId: g.id, priority: g.priority, hard: true,
    spec: { sport, kind: 'race', title: g.name, ctx: {}, steps: [{ part: 'main', min, note: lines.join(' ') }], noDistance: true } };
}
const hm = (s: number) => { const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`; };

interface Cand { s: any; long?: boolean; hard?: boolean; strength?: boolean; fixed?: boolean; pairDay?: string; prio: number }

export function generatePlan(inp: GenInput): GenResult {
  const { profile, today } = inp;
  const start = nextMonday(addDays(today, 1));
  const goals0 = (inp.goals && inp.goals.length ? inp.goals : inp.goal ? [inp.goal] : []).filter(g => g && GOALS[g.type] && !g.result && (!g.date || g.date >= today));
  const goals = goals0.map(g => ({ ...g, date: g.date || addDays(start, 7 * 12) }));
  const A = (inp.goal && goals.find(g => g.id === inp.goal!.id)) || mainGoal(goals, today) || { id: 'goal-fitness', type: 'fitness' as GoalType, name: 'Fitness', date: addDays(start, 7 * 12 - 1), priority: 'A' as const };
  const goalDate = A.date!;
  let nWeeks = Math.max(4, Math.ceil(daysBetween(start, goalDate) / 7) + (dowOf(goalDate) === 0 ? 0 : 1));
  nWeeks = Math.min(nWeeks, 60);
  const inBlock = goals.filter(g => g.id !== A.id && g.date! <= addDays(start, nWeeks * 7 - 1));
  const later = goals.filter(g => g.id !== A.id && !inBlock.includes(g));
  const age = ageOf(profile, today);
  const ageAtRace = profile.birthYear ? +goalDate.slice(0, 4) - profile.birthYear : null;
  const minor = isMinor(profile, today);
  const cons: Consideration[] = parseConsiderations([...(profile.notes || []), ...(profile.injuries ? [profile.injuries] : [])]);
  const eff = effectsOf(cons);
  const cautious = profile.medicalCaution || eff.caution || (age != null && age >= 50);
  const recoveryEvery = minor || cautious ? 3 : 4;
  const phases = phasePlan(nWeeks, A.type, recoveryEvery);
  const allGoals = [A as Goal, ...inBlock];
  // Sportarten: gewählte plus die, die ein Ziel braucht
  const need = new Set<SportKey>(allGoals.flatMap(g => Object.keys(goalNeed(g)) as SportKey[]));
  let sports = [...new Set<SportKey>([...profile.sports.filter(s => s !== 'football'), ...need])].filter(s => ENDURANCE.includes(s) || s === 'strength');
  if (eff.noBike) sports = sports.filter(s => s !== 'bike');
  const wantStrength = profile.sports.includes('strength') || freqOf(profile, 'strength')[0] > 0;
  if (wantStrength && !sports.includes('strength')) sports.push('strength');
  if (!wantStrength) sports = sports.filter(s => s !== 'strength');
  const runAllowed = (inp.runIntervalsAllowed ?? !minor) && !eff.runEasyOnly;
  const pc = (indoor: boolean, name: string | null) => paceCtx(profile, indoor, name, today);
  const ts = profile.teamSport || null;
  // Lernstufen
  const swimStage = inp.stages && inp.stages.swim !== undefined ? inp.stages.swim : W.swimLadderStart(profile.skills || {});
  const runStage = inp.stages && inp.stages.runwalk !== undefined ? inp.stages.runwalk : W.runLadderStart((profile.skills || {}).runContinuousMin);

  // Umfang: Start bei der aktuellen Form, höchstens +10 % (unter 18: +8 %) pro Woche bis zum Budget
  const budget = Math.max(1.5, profile.weeklyHours || 5);
  const peakCapH = Math.max(...allGoals.map(g => ({ tri_supersprint: 6, tri_sprint: 8, tri_olympic: 11, tri_middle: 14, tri_long: 18, run_5k: 6, run_10k: 7, run_half: 8, run_marathon: 10, duathlon: 9, aquathlon: 6, bike_event: 12, swim_goal: 5, fitness: 7 } as Record<string, number>)[g.type] || 10));
  const peak = Math.min(budget, peakCapH) * 60;
  const startMin = Math.min(peak, Math.max(90, (inp.currentWeeklyHours ?? budget * 0.7) * 60 * (cautious ? 0.85 : 1)));
  const inc = minor ? 1.07 : 1.09;
  const volumes: number[] = [];
  let cur = startMin, lastNormal = startMin;
  phases.forEach((p, i) => {
    if (i === 0) { volumes.push(cur); lastNormal = cur; return; }
    if (p.phase === 'race') { volumes.push(Math.round(lastNormal * 0.45)); return; }
    if (p.phase === 'taper') { volumes.push(Math.round(lastNormal * (phases[i + 1] && phases[i + 1].phase === 'taper' ? 0.75 : 0.6))); return; }
    if (p.recovery) { volumes.push(Math.round(lastNormal * 0.65)); return; }
    cur = Math.min(peak, lastNormal * inc);
    volumes.push(Math.round(cur)); lastNormal = cur;
  });

  const weeks: any[] = [];
  const dropped: string[] = [];
  const idp = 'g' + today.replace(/-/g, '').slice(2) + 'w';
  let prevSundayHard = false;
  phases.forEach((ph, wi) => {
    const mon = addDays(start, wi * 7);
    const month = +addDays(mon, 3).slice(5, 7);
    const dates = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
    const raceOn: Record<string, Goal> = {};
    allGoals.forEach(g => { if (dates.includes(g.date!)) raceOn[g.date!] = g; });
    // Tage: Zeit, Teamsport, Wettkampf, Tapering vor und Erholung nach B/A-Rennen
    const slots = dates.map((date, i) => {
      const dow = dowOf(date);
      const tsOn = teamActive(ts, date);
      let cap = dayCap(profile, dow), noHard = false;
      for (const g of allGoals) {
        const d = daysBetween(g.date!, date); // >0: nach dem Rennen
        if (g.priority !== 'C' && d < 0 && d >= -(g.priority === 'A' ? 3 : 4)) { noHard = true; cap = Math.round(cap * 0.7); }
        if (g.priority !== 'C' && d > 0 && d <= (g.priority === 'A' ? 4 : 3)) { noHard = true; cap = Math.min(cap, 45); }
        if (g.priority === 'C' && d === -1) noHard = true;
      }
      return { i, date, dow, cap, used: 0, items: [] as Cand[], team: tsOn && ts!.trainingDays.includes(dow), game: tsOn && ts!.gameDays.includes(dow), race: raceOn[date] || null, noHard,
        pool: !eff.poolDays || eff.poolDays.includes(dow) };
    });
    const isHardDay = (i: number) => i >= 0 && i < 7 && (slots[i].game || !!slots[i].race || slots[i].items.some(x => x.hard));
    const prevHard = (i: number) => i === 0 ? prevSundayHard : isHardDay(i - 1);
    const put = (i: number, c: Cand) => { slots[i].items.push(c); slots[i].used += c.s.plannedMinutes || 0; };

    // 1) Feste Termine: Wettkämpfe, Teamsport, alte feste Termine
    slots.forEach(sl => {
      if (sl.race) put(sl.i, { s: raceSession(sl.race), hard: true, fixed: true, prio: 0 });
      if (sl.game && !sl.race) put(sl.i, { s: W.build({ sport: 'football', kind: 'game', title: `${ts!.name || 'Teamsport'}: Spiel`, ctx: {}, noDistance: true, steps: [{ part: 'main', min: ts!.gameMinutes || 90, note: 'Spieltag: zählt als harter Tag. Am Tag davor nichts Hartes.' }] }), hard: true, fixed: true, prio: 0 });
      else if (sl.team && !sl.race) put(sl.i, { s: W.build({ sport: 'football', kind: 'team', title: `${ts!.name || 'Teamsport'}-Training`, ctx: {}, noDistance: true, steps: [{ part: 'main', min: ts!.trainingMinutes || 90, note: 'Fester Termin. Zählt im Plan als Belastung.' }] }), fixed: true, prio: 0 });
      (profile.fixed || []).filter(f => f.dow === sl.dow && !sl.race).forEach(f => put(sl.i, { s: { sport: f.sport, title: f.title, time: f.time, plannedMinutes: f.minutes || 75, description: 'Fester Termin', fixed: true }, hard: !!f.hard, fixed: true, prio: 0 }));
    });
    const fixedMin = slots.reduce((a, sl) => a + sl.items.filter(x => !x.s.race).reduce((b, x) => b + (x.s.plannedMinutes || 0), 0), 0);
    const total = volumes[wi];
    const endurance = Math.max(0, total - fixedMin * 0.5);

    // 2) Einheiten der Woche erzeugen
    const share = weekShare(allGoals, mon, sports);
    const hardOk = !ph.recovery && ph.phase !== 'race';
    let hardLeft = ph.recovery || ph.phase === 'race' ? 0 : ph.phase === 'base' ? 1 : ph.phase === 'taper' ? 1 : 2;
    if (minor) hardLeft = Math.min(hardLeft, 2);
    hardLeft -= slots.filter(sl => sl.game || (sl.race && sl.race.priority === 'C')).length; // Spiel und C-Rennen zählen als harte Einheit
    const target = A;
    const whyBase = (sport: string, kind: string) => {
      const goalName = target.name;
      if (kind === 'long') return `baut deine Ausdauer für ${goalName} auf.`;
      if (kind === 'intervals' || kind === 'threshold' || kind === 'tempo') return `macht dich schneller für ${goalName}.`;
      if (kind === 'technique' || kind === 'swimlearn') return 'Technik spart später viel Kraft.';
      if (kind === 'strength') return 'stabile Muskeln und Sehnen schützen vor Verletzungen.';
      if (ph.recovery) return 'Erholungswoche: dein Körper verarbeitet das Training.';
      return `${sport === 'swim' ? 'Wassergefühl und Grundlage' : 'Grundlage'} für ${goalName}, ohne müde zu machen.`;
    };
    const cands: Cand[] = [];
    const tip = (sport: string) => tipFor(sport, cons) || (age != null && age >= 50 ? 'Länger aufwärmen, Gelenke freuen sich.' : undefined);
    const add = (spec: W.Spec, o: Partial<Cand> = {}) => {
      spec.why = spec.why || whyBase(spec.sport, spec.kind); const tp = tip(spec.sport); if (tp && !spec.tip) spec.tip = tp;
      const s = W.build(spec);
      cands.push({ s, hard: !!s.hard, prio: s.sport === 'swim' || s.stage ? 3 : 5, ...o });
    };
    const swimBlocked = !!eff.noSwim || !!(eff.noSwimMonths && eff.noSwimMonths.includes(month)) || !slots.some(sl => sl.pool && sl.cap > 0);
    for (const sport of sports) {
      if (sport === 'strength') continue;
      const [fmin, fmax] = freqOf(profile, sport);
      let mins = endurance * (share[sport] || 0) * (sport === 'run' && eff.runVolume ? eff.runVolume : 1) * (sport === 'swim' && eff.swimVolume ? eff.swimVolume : 1);
      const typ = sport === 'run' ? 40 : sport === 'bike' ? 60 : 40;
      let n = Math.max(fmin, Math.min(fmax, Math.round(mins / typ)));
      if (!n && (share[sport] || 0) > 0.05) n = 1;
      if (ph.phase === 'race') n = Math.min(n, sport === 'swim' ? 1 : 2);
      if (!n) continue;
      if (sport === 'swim' && swimBlocked) {
        const noPool = eff.noSwim || (eff.noSwimMonths && eff.noSwimMonths.includes(month));
        dropped.push(`Woche ${wi + 1}: Schwimmen entfällt (${noPool ? 'kein Schwimmbad' : 'kein Schwimmtag frei'})`);
        // Ersatz: Zugkraft und Rumpf für Schwimmer, damit die Schwimm-Muskulatur nicht einschläft
        if (noPool) for (let k = 0; k < Math.min(n, 1); k++) {
          const sp = W.strengthSession(['swim'], { light: ph.recovery, shoulder: eff.strengthShoulder, variant: 1, why: 'Ersatz fürs Schwimmen (kein Schwimmbad): kräftigt Schultern und Rumpf für die Zeit im Wasser.' });
          sp.title = 'Schwimm-Ersatz: Zugkraft und Rumpf ' + W.totals(sp).min + ' min';
          cands.push({ s: { ...W.build(sp), replaces: 'swim' }, strength: true, prio: 4 });
        }
        continue;
      }
      if (sport === 'run') {
        if (runStage != null) { for (let k = 0; k < n; k++) add(W.runWalk(pc(false, null), runStage, `bringt dich Schritt für Schritt zu 30 min am Stück, die Grundlage für ${target.name}.`)); continue; }
        const ctx = pc(false, null);
        const cap = abilityCap(profile, 'run', wi);
        const longCap = Math.min((LONG_CAP[target.type] || LONG_CAP.fitness)!.run, cap ?? 999, ph.phase === 'taper' ? 50 : 999);
        let rest = mins; let left = n;
        if (n >= 2 && ph.phase !== 'race') { const L = Math.max(30, Math.min(longCap, rest * 0.4)); add(W.runLong(ctx, L), { long: true, prio: 1 }); rest -= L; left--; }
        if (hardOk && hardLeft > 0 && runAllowed && left >= 1 && ph.phase !== 'base' && n >= 2) {
          const spec = keyRun(ctx, target.type, ph.phase, wi); add(spec, { hard: true, prio: 2 }); rest -= W.totals(spec).min; left--; hardLeft--;
        }
        for (let k = 0; k < left; k++) { const m = Math.max(25, Math.min(cap ?? 60, 60, rest / Math.max(1, left - k))); add(W.runEasy(ctx, m, { strides: ph.phase === 'base' && k === 0 && !eff.runEasyOnly })); rest -= m; }
      }
      if (sport === 'bike') {
        const cap = abilityCap(profile, 'bike', wi);
        const longCap = Math.min((LONG_CAP[target.type] || LONG_CAP.fitness)!.bike, cap ?? 999, ph.phase === 'taper' ? 75 : 999);
        let rest = mins; let left = n;
        if (n >= 1 && ph.phase !== 'race') { const c = bikeChoice(profile, false, month, eff); const L = Math.max(45, Math.min(longCap, rest * (n === 1 ? 1 : 0.5))); add(W.bikeLong(pc(c.indoor, c.name), L), { long: true, prio: 1 }); rest -= L; left--; }
        if (hardOk && hardLeft > 0 && left >= 1) {
          const c = bikeChoice(profile, true, month, eff);
          const step = [[3, 8], [3, 10], [3, 12], [2, 15], [2, 20]][Math.min(4, Math.floor(wi / 3))];
          const spec = ph.phase === 'base' ? W.bikeIntervals(pc(c.indoor, c.name), step[0], step[1], 3, 5) : W.bikeIntervals(pc(c.indoor, c.name), step[0], step[1], 4, 5);
          add(spec, { hard: true, prio: 2 }); rest -= W.totals(spec).min; left--; hardLeft--;
        }
        for (let k = 0; k < left; k++) { const c = bikeChoice(profile, false, month, eff); const m = Math.max(30, Math.min(cap ?? 90, 90, rest / Math.max(1, left - k))); add(W.bikeEasy(pc(c.indoor, c.name), m)); rest -= m; }
      }
      if (sport === 'swim') {
        const ctx = pc(false, null);
        if (swimStage) { for (let k = 0; k < n; k++) add(W.swimLearn(ctx, swimStage, swimStage.ladder === 'swimBreast' ? 'Brust bringt Ausdauer im Wasser, die Kraul-Technik kommt Schritt für Schritt dazu.' : `Kraul lernen, damit du ${target.name} entspannt schwimmen kannst.`)); continue; }
        const per = Math.max(25, Math.min(60, mins / n));
        for (let k = 0; k < n; k++) {
          const hard = hardOk && hardLeft > 0 && k === 1 && ph.phase !== 'base';
          const kind: W.Kind = k === 0 ? 'technique' : hard ? 'css' : 'endurance';
          add(swimByMinutes(ctx, kind, per, ph.phase), { hard });
          if (hard) hardLeft--;
        }
      }
    }
    // Einstiegstests in den ersten 2 Wochen (nur, wenn das Können passt)
    if (wi <= 1 && inp.needTests) {
      const ctx = pc(false, null);
      const swap = (sport: string, spec: W.Spec) => { const i = cands.findIndex(c => c.s.sport === sport && c.hard) ; const j = i >= 0 ? i : cands.findIndex(c => c.s.sport === sport && !c.long); const c = { s: W.build(spec), hard: true, prio: 2 }; if (j >= 0) cands[j] = c; else cands.push(c); };
      if (wi === 0 && inp.needTests.run && runStage == null && sports.includes('run')) swap('run', W.runTest(ctx));
      if (wi === 1 && inp.needTests.bike && sports.includes('bike')) { const c = bikeChoice(profile, true, month, eff); swap('bike', W.bikeTest(pc(c.indoor, c.name))); }
      if (wi === 0 && inp.needTests.swim && !swimStage && sports.includes('swim') && !swimBlocked) swap('swim', W.swimTest(ctx));
    }
    // Kraft mit gewählter Häufigkeit, in Erholungs- und Wettkampfwochen leichter
    if (sports.includes('strength')) {
      const [smin, smax] = freqOf(profile, 'strength');
      const n = ph.phase === 'race' ? Math.min(1, smax) : Math.max(smin, Math.min(smax, smin || 1));
      for (let k = 0; k < n; k++) cands.push({ s: W.build({ ...W.strengthSession([...profile.sports, ...sports], { light: ph.recovery || ph.phase === 'taper' || ph.phase === 'race', back: eff.strengthBack, knee: eff.strengthKnee, shoulder: eff.strengthShoulder, variant: k, why: 'stabile Muskeln und Sehnen schützen vor Verletzungen und machen dich ökonomischer.' }), tip: tipFor('strength', cons) || undefined }), strength: true, prio: 4 });
    }
    // Koppellauf in der spezifischen Phase (Triathlon): direkt nach der langen Ausfahrt
    if (GOALS[target.type].group === 'tri' && ph.phase === 'specific' && !ph.recovery && sports.includes('run') && sports.includes('bike') && runStage == null) {
      const spec = W.runEasy(pc(false, null), 15); spec.title = 'Wechsel-Lauf 15 min (direkt nach dem Rad)'; spec.why = 'gewöhnt die Beine an den Wechsel vom Rad zum Laufen.';
      cands.push({ s: W.build(spec), pairDay: 'bikeLong', prio: 1.5 });
    }

    // 3) Verteilen: lange Einheiten auf lange Tage, harte nie nebeneinander, Kraft nicht vor harten Tagen
    const order = cands.sort((a, b) => a.prio - b.prio || (b.long ? 1 : 0) - (a.long ? 1 : 0) || (b.hard ? 1 : 0) - (a.hard ? 1 : 0) || (b.s.plannedMinutes || 0) - (a.s.plannedMinutes || 0));
    for (const c of order) {
      const s = c.s;
      const fits = (i: number, min: number) => slots[i].used + min <= slots[i].cap;
      const ok = (i: number) => {
        const sl = slots[i];
        if (sl.race) return false;
        if (sl.cap <= 0) return false;
        if (s.sport === 'swim' && !sl.pool) return false;
        const own = sl.items.filter(x => !x.fixed || x.s.sport === 'football');
        if (own.length >= 2) return false;
        if (sl.items.some(x => x.s.sport === s.sport && !c.pairDay)) return false;
        if (c.hard) { if (sl.noHard || isHardDay(i) || prevHard(i) || isHardDay(i + 1) || (i + 1 < 7 && slots[i + 1].noHard && !!slots[i + 1].race) || (i > 0 && !!slots[i - 1].race) || (sl.team && !sl.game)) return false; }
        if (c.strength) { if (isHardDay(i) || isHardDay(i + 1) || (i + 1 < 7 && (slots[i + 1].game || !!slots[i + 1].race)) || sl.noHard && sl.cap < 45) return false; }
        if (c.long && i + 1 < 7 && (slots[i + 1].game || !!slots[i + 1].race)) return false;
        if ((c.long || c.hard || c.strength) && (sl.game || sl.team)) return false;
        if (c.pairDay === 'bikeLong') return sl.items.some(x => x.long && x.s.sport === 'bike');
        return true;
      };
      const score = (i: number) => {
        const sl = slots[i]; let sc = sl.cap - sl.used;
        if (c.long) sc += sl.dow === 0 || sl.dow === 6 ? 300 : 0;
        if (c.long && s.sport === 'run' && sl.dow === 0) sc += 50;
        if (c.long && s.sport === 'bike' && sl.dow === 6) sc += 50;
        if (c.strength) sc += sl.items.length ? 40 : 0;
        sc -= sl.items.length * 60;
        return sc;
      };
      let idx = [...Array(7).keys()].filter(i => ok(i) && fits(i, s.plannedMinutes)).sort((a, b) => score(b) - score(a))[0];
      let placed = s;
      if (idx == null && !c.fixed && s.spec && !s.stage) {
        // passt nicht ganz: an einem freien Tag kürzer machen (mindestens 25 min)
        const opts = [...Array(7).keys()].filter(i => ok(i) && slots[i].cap - slots[i].used >= 25).sort((a, b) => (slots[b].cap - slots[b].used) - (slots[a].cap - slots[a].used));
        if (opts.length) {
          idx = opts[0];
          const room = slots[idx].cap - slots[idx].used;
          const f = room / Math.max(1, s.plannedMinutes);
          let sp = W.scaleSpec(s.spec, f);
          for (let k = 0; k < 6 && W.totals(sp).min > room; k++) sp = W.scaleSpec(sp, 0.85);
          if (W.totals(sp).min <= room) placed = { ...W.build(sp) }; else idx = undefined as any;
        }
      }
      if (idx == null) { dropped.push(`Woche ${wi + 1}: ${s.title} passt zeitlich nicht`); if (c.hard) hardLeft++; continue; }
      put(idx, { ...c, s: placed });
    }

    // 4) Tage zusammenbauen
    let id = 0;
    const days = slots.map(sl => {
      // IDs eindeutig je Erstellung (Datum), damit ein neuer Plan nie Zustände alter Einheiten erbt
      const list = sl.items.map(x => ({ id: `${idp}${wi + 1}-${DOW[sl.dow].toLowerCase()}-${++id}`, ...x.s, ...(x.fixed && x.s.sport === 'football' ? { fixed: true } : {}) }));
      return { date: sl.date, dow: DOW[sl.dow], sessions: list.length ? list : [{ id: `${idp}${wi + 1}-${DOW[sl.dow].toLowerCase()}-rest`, sport: 'rest', title: 'Ruhetag' }] };
    });
    prevSundayHard = isHardDay(6);
    const races = slots.filter(sl => sl.race).map(sl => ({ goalId: sl.race!.id, name: sl.race!.name, date: sl.date, priority: sl.race!.priority }));
    const otherRaces = races.filter(r => r.goalId !== A.id);
    const headline = `Woche ${wi + 1} von ${nWeeks} → ${A.name}${otherRaces.length ? ', mit ' + otherRaces.map(r => `${r.name} am ${DOW_LONG[dowOf(r.date)]}`).join(' und ') : ''}${races.some(r => r.goalId === A.id) ? ': Wettkampf!' : ''}`;
    weeks.push({
      weekNumber: wi + 1, label: 'Woche ' + (wi + 1), headline, target: { goalId: A.id, name: A.name, weeks: nWeeks, n: wi + 1 }, races,
      startDate: mon, endDate: addDays(mon, 6), isRecoveryWeek: ph.recovery, reduced: otherRaces.some(r => r.priority === 'B') || undefined,
      phase: ph.phase, focus: ph.recovery ? 'Erholung: weniger Umfang, Körper verarbeitet das Training' : focusText(ph.phase, GOALS[A.type].group),
      important: weekImportant(ph, otherRaces, wi, inp, runStage, swimStage), days
    });
  });

  // Umfang in einem Durchgang begrenzen: jede Woche höchstens +10 % (unter 18 +8 %) gegenüber der letzten normalen Woche
  enforceVolume(weeks, minor ? 1.08 : 1.10, budget * 60);
  const violations = validateWeeks(weeks, { minor });
  const age2 = goalAllowed(A.type, ageAtRace);
  if (!age2.ok) violations.push({ rule: 'age', msg: age2.msg! });
  inBlock.forEach(g => { const a = goalAllowed(g.type, profile.birthYear ? +g.date!.slice(0, 4) - profile.birthYear : null); if (!a.ok) violations.push({ rule: 'age', msg: `${g.name}: ${a.msg}` }); });

  const keyDates = [{ date: goalDate, label: A.name }, ...inBlock.map(g => ({ date: g.date!, label: g.name }))];
  weeks.forEach(w => w.days.forEach((d: any) => d.sessions.forEach((s: any) => { if (/test/i.test(s.title) && !s.race) keyDates.push({ date: d.date, label: s.title }); })));
  const phaseList: GenResult['phases'] = [];
  weeks.forEach(w => { const last = phaseList[phaseList.length - 1]; if (last && last.phase === w.phase) { last.to = w.endDate; last.weeks++; } else phaseList.push({ phase: w.phase, from: w.startDate, to: w.endDate, weeks: 1 }); });
  const shown = inp.maxWeeks ? weeks.slice(0, inp.maxWeeks) : weeks;
  const explain = planExplain(A as Goal, inBlock, later, phaseList, shown, profile, sports, cons, runStage, swimStage);
  const plan = {
    meta: { generated: true, generatedAt: today, goalId: A.id, event: A.name, eventDate: goalDate, goalIds: allGoals.map(g => g.id), blockName: `${A.name}: ${PHASE_LABEL[shown[0].phase as Phase]}`, runIntervalsAllowed: inp.runIntervalsAllowed ?? !minor, phases: phaseList, explain, totalWeeks: nWeeks },
    weeks: shown, keyDates,
    zonePercents: HR_ZONES.map(z => ({ zone: z.zone, label: z.label, low: z.low, high: z.high }))
  };
  return { plan, phases: phaseList, violations, dropped, summary: planSummary(plan, inp, A as Goal, inBlock, phaseList, volumes, sports, minor, runStage, swimStage) };
}

/* Schwimmeinheit mit Ziel-Minuten: Serien so wählen, dass die Zeit passt */
function swimByMinutes(ctx: W.PaceCtx, kind: W.Kind, minutes: number, phase: Phase): W.Spec {
  const mk = (k: number): W.Spec => {
    if (kind === 'technique') return W.swimSession(ctx, kind, [{ part: 'main', reps: 6, m: 50, zone: 1, mode: 'drill', restSec: 20, note: 'Abschlag, Fingerspitzen, Seitlage' }, { part: 'main', reps: k, m: 100, zone: 2, mode: 'crawl', restSec: 20 }]);
    if (kind === 'css') return W.swimSession(ctx, kind, [{ part: 'main', reps: k, m: 100, zone: 4, mode: 'crawl', restSec: 15 }], 300, 200);
    const len = phase === 'specific' ? 400 : 200;
    return W.swimSession(ctx, kind, [{ part: 'main', reps: k, m: len, zone: 2, mode: 'crawl', restSec: 30 }]);
  };
  let k = 2;
  while (k < 20 && W.totals(mk(k + 1)).min <= minutes) k++;
  return mk(k);
}

/* Schlüsseleinheit Laufen passend zum Ziel */
function keyRun(ctx: W.PaceCtx, type: GoalType, phase: Phase, wi: number): W.Spec {
  if (phase === 'build' || phase === 'taper') return W.runIntervals(ctx, phase === 'taper' ? 4 : 5, 3, 2, 4);
  if (type === 'run_half' || type === 'tri_middle') return W.runTempo(ctx, Math.min(30, 15 + wi), 3);
  if (type === 'run_marathon' || type === 'tri_long') return W.runTempo(ctx, Math.min(40, 20 + wi), 3);
  if (type === 'run_5k') return W.runIntervals(ctx, 6, 2, 2, 5);
  return W.runIntervals(ctx, 4, 6, 2, 4);
}

function enforceVolume(weeks: any[], maxInc: number, budgetMin = Infinity) {
  const scaleWeek = (w: any, sport: string | undefined, f: number) => w.days.forEach((d: any) => { d.sessions = d.sessions.map((s: any) => {
    if (s.fixed || s.race || !s.plannedMinutes || (sport && s.sport !== sport) || s.sport === 'rest' || (s.spec && s.spec.title)) return s;
    if (s.spec && !s.stage) { const r = W.rebuildScaled(s, f); return r ? { ...s, ...r, plannedKm: r.plannedKm ?? undefined } : s; }
    return s;
  }); });
  // Zeitbudget pro Woche (ohne feste Termine wie Teamsport und Wettkampf)
  const own = (w: any) => w.days.reduce((a: number, d: any) => a + d.sessions.filter((s: any) => !s.fixed && !s.race && s.sport !== 'rest' && !s.cancelled).reduce((b: number, s: any) => b + (s.plannedMinutes || 0), 0), 0);
  for (const w of weeks) for (let guard = 0; guard < 6 && own(w) > budgetMin + 5; guard++) scaleWeek(w, undefined, Math.max(0.5, budgetMin / own(w) * 0.98));
  for (let i = 1; i < weeks.length; i++) {
    let j = i - 1; while (j > 0 && (weeks[j].isRecoveryWeek || weeks[j].reduced)) j--;
    for (const sport of [undefined, 'run'] as (string | undefined)[]) {
      for (let guard = 0; guard < 6; guard++) {
        const ref = weekMinutes(weeks[j], sport), cur = weekMinutes(weeks[i], sport);
        if (ref < (sport ? 40 : 60) || cur <= ref * maxInc) break;
        const fixed = weeks[i].days.reduce((a: number, d: any) => a + d.sessions.filter((s: any) => (s.fixed || s.race || s.stage) && (!sport || s.sport === sport)).reduce((b: number, s: any) => b + (s.plannedMinutes || 0), 0), 0);
        const f = Math.max(0.3, (ref * maxInc - fixed) / Math.max(1, cur - fixed) * 0.98);
        scaleWeek(weeks[i], sport, f);
      }
    }
  }
}
function focusText(p: Phase, group: string): string {
  return ({ base: 'Grundlage: viel locker, Technik, Kraft', build: 'Aufbau: Intervalle dazu, lange Einheiten wachsen', specific: group === 'tri' ? 'Wettkampfnah: Koppeltraining und Renntempo' : 'Wettkampfnah: Renntempo üben', taper: 'Tapering: weniger Umfang, kurz und knackig', race: 'Wettkampfwoche: frisch werden' } as Record<Phase, string>)[p];
}
function weekImportant(ph: { phase: Phase; recovery: boolean }, races: any[], wi: number, inp: GenInput, runStage: number | null, swimStage: any): string {
  if (races.length) return races.map(r => r.priority === 'C' ? `${r.name} ist ein Trainingswettkampf: zügig, aber nicht am Limit.` : `${r.name}: die Tage davor ruhiger, danach 2-3 Tage locker.`).join(' ');
  if (wi <= 1 && inp.needTests) return 'Die Tests diese Woche ersetzen die geschätzten Werte durch echte.';
  if (ph.recovery) return 'Weniger ist diese Woche mehr: der Körper wird in der Pause stärker.';
  if (runStage != null || swimStage) return 'Die Lernstufen steigen erst, wenn die aktuelle Stufe klappt. Trag deine Einheiten ein oder lass sie von der Uhr übernehmen.';
  return ({ base: 'Viel locker, die harte Einheit kontrolliert.', build: 'Die harten Einheiten zählen: ausgeruht hingehen.', specific: 'Renntempo üben und gut erholen.', taper: 'Weniger Umfang, die Frische kommt.', race: 'Frisch bleiben, nichts Neues ausprobieren.' } as Record<Phase, string>)[ph.phase];
}

/* Kurze Erklärung oben im Plan (Auftrag 4 F3) */
function planExplain(A: Goal, inBlock: Goal[], later: Goal[], phases: GenResult['phases'], weeks: any[], p: Profile, sports: SportKey[], cons: Consideration[], runStage: number | null, swimStage: any): string[] {
  const out: string[] = [];
  out.push(`Phasen bis ${A.name}: ${phases.map(x => `${PHASE_LABEL[x.phase]} (${x.weeks} ${x.weeks === 1 ? 'Woche' : 'Wochen'})`).join(' → ')}.`);
  if (inBlock.length) out.push(`Unterwegs: ${inBlock.map(g => `${g.name} (${g.priority === 'B' ? 'B: kurzes Tapering, danach Erholung' : 'C: als Training'})`).join(', ')}.`);
  if (later.length) out.push(`Danach geplant: ${later.map(g => g.name).join(', ')}. Dafür kommt ein neuer Block.`);
  const counts = (sp: string) => { const c = weeks.slice(0, Math.min(4, weeks.length)).map(w => w.days.reduce((a: number, d: any) => a + d.sessions.filter((s: any) => s.sport === sp && !s.race).length, 0)); return c.length ? Math.round(c.reduce((a, b) => a + b, 0) / c.length) : 0; };
  const why: Record<string, string> = { run: A.type.startsWith('run') ? 'dein Ziel ist ein Lauf' : 'Laufen kommt im Ziel vor', bike: A.type === 'bike_event' ? 'dein Ziel ist auf dem Rad' : 'Rad trainiert viel Ausdauer bei wenig Belastung für die Gelenke', swim: swimStage ? 'zuerst Technik lernen' : 'Technik braucht Regelmäßigkeit', strength: 'schützt vor Verletzungen' };
  out.push('So oft pro Woche: ' + sports.map(s => `${SPORT_DE[s]} ${counts(s)}× (${why[s] || ''})`).join(', ') + (p.teamSport ? `, dazu ${p.teamSport.name || 'Teamsport'}` : '') + '.');
  if (runStage != null) out.push('Laufen startet mit Lauf-Geh-Wechsel und steigt eine Stufe, sobald die letzte geklappt hat.');
  if (swimStage) out.push(swimStage.ladder === 'swimBreast' ? 'Schwimmen: zuerst Brust plus Kraul-Technik, dann Schritt für Schritt Kraul.' : 'Schwimmen: Kraul lernen in Stufen, nie längere Strecken als du schon kannst.');
  const u = cons.filter(c => c.understood);
  if (u.length) out.push('Berücksichtigt: ' + u.map(c => `${c.label} (${c.effect})`).join('; ') + '.');
  return out;
}

/* Der Plan in 5 Sätzen: „Das ist dein Plan, weil …“ */
function planSummary(plan: any, inp: GenInput, A: Goal, inBlock: Goal[], phases: GenResult['phases'], volumes: number[], sports: SportKey[], minor: boolean, runStage: number | null, swimStage: any): string[] {
  const n = plan.meta.totalWeeks;
  const h = (m: number) => (Math.round(m / 6) / 10).toString().replace('.', ',');
  const ph = phases.map(p => `${p.weeks} ${p.weeks === 1 ? 'Woche' : 'Wochen'} ${PHASE_LABEL[p.phase]}`).join(', ');
  const ts = inp.profile.teamSport;
  return [
    `Dein Plan führt in ${n} Wochen zu „${A.name}“${A.date ? ` am ${A.date.split('-').reverse().join('.')}` : ''}: ${ph}.${inBlock.length ? ` Unterwegs: ${inBlock.map(g => g.name).join(', ')}.` : ''}`,
    `Du startest mit ${h(volumes[0])} h pro Woche, weil das zu deiner aktuellen Form passt, und steigerst höchstens um ${minor ? 8 : 10} % pro Woche bis ${h(Math.max(...volumes))} h.`,
    `Die Zeit verteilt sich auf ${sports.filter(s => s !== 'strength').map(s => SPORT_DE[s]).join(', ')}${sports.includes('strength') ? ', dazu Kraft' : ''}${runStage != null || swimStage ? ', mit Lernstufen passend zu deinem Können' : ''}.`,
    `Etwa 80 % sind locker, nur 1-2 Einheiten pro Woche sind hart. Nie zwei harte Tage hintereinander${ts ? `, ${ts.name || 'Teamsport'} ist eingeplant und vor Spieltagen gibt es nichts Hartes` : ''}.`,
    `Alle ${minor || inp.profile.medicalCaution ? 3 : 4} Wochen kommt eine Erholungswoche, vor dem Wettkampf wird der Umfang reduziert, damit du frisch an den Start gehst.`
  ];
}

/* Sauberer Übergang, wenn sich Ziel oder Alltag ändern: vergangene Wochen bleiben, ab nächstem Montag gilt der neue Plan */
export function transitionPlan(oldPlan: any, newPlan: any, today: string): any {
  const keep = (oldPlan && oldPlan.weeks || []).filter((w: any) => w.endDate < nextMonday(addDays(today, 1)));
  const offset = keep.length;
  const weeks = [...keep, ...newPlan.weeks.map((w: any, i: number) => ({ ...w, weekNumber: offset + i + 1, label: 'Woche ' + (offset + i + 1) }))];
  return { ...newPlan, weeks, meta: { ...newPlan.meta, previousBlock: oldPlan && oldPlan.meta && oldPlan.meta.blockName } };
}
export { weekMinutes };
