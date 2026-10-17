/* Plan-Generator (regelbasiert, Auftrag 4): aus Zielen, Profil, Zeit pro Tag, Häufigkeit je Sportart, Teamsport,
   Können und Berücksichtigungen ein periodisierter Plan.
   - Das A-Ziel bestimmt die Phasen (Grundlage, Aufbau, spezifisch, Tapering), Erholungswochen alle 3-4 Wochen.
   - B-Ziele: 3-5 Tage Tapering, danach 2-4 Tage Erholung. C-Ziele: Trainingswettkampf ohne Tapering.
   - Liegen Ziele in verschiedenen Sportarten, verteilt sich der Umfang nach Priorität und Zeitabstand.
   - Jede Einheit entsteht aus Bausteinen (shared/workouts.ts): Titel, Dauer, Distanz und Text passen immer zusammen.
   - Wer nicht kraulen oder nicht lange laufen kann, bekommt einen Lernweg statt Strecken über dem Können.
   Dieselben Sicherheitsregeln wie bei der Anpassung (shared/rules.ts). Ausgabe im bekannten Plan-Format. */
import type { Profile, SportKey, TeamSport } from './profile';
import { isMinor, DAYLOAD_MIN, ageOf, progressionOf } from './profile';
import type { Goal, GoalType } from './goals';
import { GOALS, legsOf, mainGoal } from './goals';
import { addDays } from './core';
import { validateWeeks, weekMinutes, ownWeekMinutes, goalAllowed, type Violation } from './rules';
import { HR_ZONES, chosenSports } from './sports';
import * as W from './workouts';
import { speedFor, kindFromName } from './bikespeed';
import { tipFor } from './considerations';
import { rulesOf, effectsOf, evaluate, allowedHard, dayLimit, prefers, describe as ruleText, daysText, SPORT_NAME, type Rule, type Effects, type RuleSport } from './constraints';
import { parseFor } from './ruleparse';
import * as WP from './weekpattern';
import * as K from './keysessions';
import { placeholders, macroPhases, timelineOf, capsFor, easyAfterDays, PHASE_NAME, type Anchor, type WeekPhase } from './periodize';
import { levelOf, maxHard, repairIntensity, qualityFor } from './intensity';
import { repairSports, repairSpacing } from './planrules';

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
  /** Regeln (sonst aus dem Profil: gespeicherte Regeln plus Notizen) */
  rules?: Rule[];
  /** Belastung aus den Daten (core.loadBaseline): der Umfang startet dort, nicht bei einer Schätzung */
  load?: { ctl: number | null; atl: number | null; preIllnessCtl?: number | null; illness?: { start: string; end: string | null } | null; source?: string | null } | null;
  /** Fortsetzung eines vorhandenen Plans: Wochen- und Blockzählung laufen weiter, der Umfang knüpft an */
  continueFrom?: { weekNo: number; blockNo: number; lastNormalMin: number | null; blockName?: string | null; builtSinceRecovery?: number;
    /** erledigt in der letzten Aufbauwoche (Minuten) und ob die Woche überhaupt abgehakt wurde (sonst zählt der Plan) */
    lastNormalDoneMin?: number | null; lastNormalTracked?: boolean;
    /** die letzte Aufbauwoche selbst (Bezug für die Steigerung) und ihre langen Einheiten */
    lastNormalWeek?: any; lastLongRun?: number | null; lastLongBike?: number | null; lastSwim?: number | null;
    /** die laufende Woche war im alten Plan eine Erholungswoche (bleibt es beim Neuplanen mitten in der Woche) */ curRecovery?: boolean } | null;
  /** Auftrag 11: ab diesem Tag gilt der neue Plan (heute, ab 18 Uhr morgen). Die Woche beginnt am Montag davor; Tage davor bleiben. */
  from?: string | null;
  /** Einheiten der laufenden Woche, die bleiben (vergangen oder erledigt), je Datum; _done = erledigt (zählt zum Wochenumfang) */
  frozen?: { date: string; sessions: any[] }[] | null;
  /** gemessener Wochenumfang (Minuten eigenes Training) aus den ersten Wochen: Start dort statt bei der Schätzung */
  measuredStartMin?: number | null;
  /** „Stunden bisher: weiß ich nicht“: vorsichtig starten, nach 2 Wochen an die echten Daten anpassen */
  hoursUnknown?: boolean;
}
/* CTL ist etwa die tägliche Belastung (TSS) der letzten 6 Wochen. Lockeres Ausdauertraining bringt etwa 50 TSS pro Stunde. */
export const TSS_PER_HOUR = 50;
export const ctlToWeekMin = (ctl: number) => Math.round(ctl * 7 / TSS_PER_HOUR * 60);
/* Passt etwas nicht zu den harten Regeln (z. B. 3 Läufe gewünscht, aber nur Sa/So erlaubt), sagt der Plan es klar und bietet Lösungen an */
export interface Conflict { id: string; sport: RuleSport; want: number; can: number; days: number[]; text: string; options: { id: 'fewer' | 'allow'; label: string; day?: number; n?: number }[] }
export interface GenResult { plan: any; summary: string[]; violations: Violation[]; phases: { phase: Phase; from: string; to: string; weeks: number }[]; dropped: string[]; conflicts: Conflict[] }

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
export function phasePlan(nWeeks: number, goalType: string, recoveryEvery: number, builtSinceRecovery = 0): { phase: Phase; recovery: boolean }[] {
  const longTaper = /marathon|middle|long|bike_event/.test(goalType) ? 2 : 1;
  const out: { phase: Phase; recovery: boolean }[] = [];
  const race = 1, taper = Math.min(longTaper, Math.max(0, nWeeks - 3));
  const rest = Math.max(1, nWeeks - race - taper);
  // bei weit entfernten Zielen bleibt es lange bei der Grundlage: Aufbau höchstens 20, spezifisch höchstens 16 Wochen
  const specific = Math.max(1, Math.min(16, Math.round(rest * 0.25))), build = Math.max(1, Math.min(20, Math.round(rest * 0.35)));
  const base = Math.max(0, rest - specific - build);
  const seq: Phase[] = [...Array(base).fill('base'), ...Array(build).fill('build'), ...Array(specific).fill('specific'), ...Array(taper).fill('taper'), 'race'];
  let sinceRecovery = Math.max(0, Math.min(recoveryEvery - 1, builtSinceRecovery));
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
  // Auftrag 15: nur gewählte Sportarten bekommen Zeit (vorher bekam z. B. „Allgemeine Fitness“ immer auch Laufen)
  (Object.keys(w) as SportKey[]).forEach(k => { if (!endu.includes(k)) delete w[k]; });
  const sum0 =Object.values(w).reduce((a, b) => a + (b || 0), 0) || 1;
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
  const pos = (v: any) => (typeof v === 'number' && v > 0 ? v : null);
  return { runThrSec: pos(th.thresholdPaceRunSec), lthrRun: pos(th.lthrRun), lthrBike: pos(th.lthrBike), bikeKmh: pos(th.thresholdSpeedBikeKmh) ? speedFor(p, kindFromName(bikeName, indoor)) : null, ftp: p.powerMeter ? pos(th.ftp) : null, css: cssFor(p), breast100: pos(th.breast100Sec) || 165 + (age >= 50 ? 15 : 0) + (p.sex === 'f' ? 5 : 0), indoor, bikeName,
    pool: (p.skills || {}).poolM === 50 ? 50 : 25, gear: Array.isArray((p.skills || {}).swimGear) ? (p.skills || {}).swimGear as string[] : [],
    // ohne CSS: Kraul-Tempo aus dem Kraul-Check (25 m auf Zeit, auf 100 m hochgerechnet mit Wenden und Ermüdung)
    crawl100: !cssFor(p) && pos(th.crawl25Sec) ? Math.round(pos(th.crawl25Sec)! * 4 * 1.1) : null };
}
/* Schwimm-Schwelle für die Planung (Auftrag 14): geschätzte CSS nur ab 400 m Kraul am Stück; sonst rechnet die App Kraul etwa wie Brust,
   damit Meter und Zeit für alle zusammenpassen, die erst kurze Strecken kraulen. */
export function cssFor(p: Profile): number | null {
  const th = p.thresholds; const v = typeof th.cssSec === 'number' && th.cssSec > 0 ? th.cssSec : null;
  if (!v) return null;
  const est = (th.estimated || []).includes('cssSec');
  return est && ((p.skills || {}).swimCrawlM || 0) < 400 ? null : v;
}
const BIKE_LABEL: Record<string, string> = { road: 'Rennrad', gravel: 'Gravelbike', mtb: 'Mountainbike', tt: 'Zeitfahrrad', trekking: 'Trekkingrad', ebike: 'E-Bike', trainer: 'Rolle', spin: 'Indoor-Bike' };
function bikeChoice(p: Profile, hard: boolean, month: number, eff: Effects): { indoor: boolean; name: string | null } {
  const b = p.bikes || [];
  const indoorAvail = (b.includes('trainer') || b.includes('spin')) && !(eff.noTrainerMonths && eff.noTrainerMonths.includes(month));
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
  if ((g as any).placeholder) lines.push('Termin ist ein Platzhalter: Trag das echte Datum beim Ziel ein, dann plant die App neu.');
  return { sport, title: g.name + ((g as any).placeholder ? ' (Platzhalter)' : ''), plannedMinutes: min, description: lines.join('\n'), race: true, goalId: g.id, priority: g.priority, hard: true, ...((g as any).placeholder ? { placeholder: true } : {}),
    spec: { sport, kind: 'race', title: g.name, ctx: {}, steps: [{ part: 'main', min, note: lines.join(' ') }], noDistance: true } };
}
const hm = (s: number) => { const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`; };

interface Cand { s: any; long?: boolean; hard?: boolean; strength?: boolean; fixed?: boolean; pairDay?: string; prio: number; /** bleibt aus dem alten Plan (vergangen oder erledigt) */ frozen?: boolean; /** lockere Variante, falls die harte Einheit keinen Platz findet */ easy?: W.Spec;
  /** nur an diesen Wochentagen (Kraft nach Körperbereich) */ onDays?: number[]; test?: boolean; /** morgens vor der Schule oder nachmittags */ slot?: 'am' | 'pm' }

export function generatePlan(inp: GenInput): GenResult {
  const { profile, today } = inp;
  // ohne „from“ wie bisher ab nächstem Montag; mit „from“ ab dem Montag dieser Woche, die Tage vor „from“ bleiben, wie sie sind
  const from = inp.from || null;
  const start = from ? addDays(from, -((dowOf(from) + 6) % 7)) : nextMonday(addDays(today, 1));
  const midWeek = !!from && (from > start || (inp.frozen || []).some(f => f.sessions.length > 0));
  // Einstiegstests: bleiben in der laufenden Woche weniger als 3 Tage, kommen sie eine Woche später
  const tw = midWeek && 7 - daysBetween(start, from!) < 3 ? 1 : 0;
  const frozenOn = (date: string) => ((inp.frozen || []).find(f => f.date === date) || { sessions: [] as any[] }).sessions.filter((s: any) => s && s.sport !== 'rest');
  const goals0 = (inp.goals && inp.goals.length ? inp.goals : inp.goal ? [inp.goal] : []).filter(g => g && GOALS[g.type] && !g.result && (!g.date || g.date >= today));
  // Ziele ohne Termin bekommen Platzhalter-Termine (Auftrag 9): Reihenfolge nach Distanz, Vorbereitung nach Fitness, Saison, Abstand zum A-Ziel.
  // Ein Hauptziel ohne Datum bekommt 12 Wochen.
  const dated = goals0.filter(g => g.date);
  const fallbackA = dated.some(g => g.priority === 'A') ? null : (goals0.find(g => !g.date && g.priority === 'A') || (!dated.length ? goals0[0] : null));
  // Hauptziel ohne Datum: Platzhalter in der passenden Saison (Auftrag 11: vorher stillschweigend in 12 Wochen, z. B. ein Triathlon im Januar)
  const fitH0 = inp.continueFrom && inp.continueFrom.lastNormalMin ? inp.continueFrom.lastNormalMin / 60 : inp.currentWeeklyHours ?? null;
  const placeA = fallbackA && !fallbackA.date ? placeholders([fallbackA], null, today, fitH0)[0] || null : null;
  const goalsD = [...dated, ...(fallbackA && !fallbackA.date ? [placeA || fallbackA] : [])].map(g => ({ ...g, date: g.date || addDays(start, 7 * 12) }));
  const A = (inp.goal && goalsD.find(g => g.id === inp.goal!.id)) || mainGoal(goalsD, today) || { id: 'goal-fitness', type: 'fitness' as GoalType, name: 'Fitness', date: addDays(start, 7 * 12 - 1), priority: 'A' as const };
  const goalDate = A.date!;
  const cont0 = inp.continueFrom || null;
  const fitH = cont0 && cont0.lastNormalMin ? cont0.lastNormalMin / 60 : inp.currentWeeklyHours ?? (inp.load && inp.load.ctl ? ctlToWeekMin(inp.load.ctl) / 60 : null);
  const placed = placeholders(goals0.filter(g => g !== fallbackA), A as Goal, today, fitH).filter(g => g.date! < goalDate);
  const goals = [...goalsD, ...placed];
  const pathGoals: Goal[] = [];
  // Phasen über den ganzen Weg bis zum Ziel. Liegt das Ziel mehr als 60 Wochen entfernt, werden 26 Wochen ausgegeben, mindestens aber bis zum nächsten Ziel
  // (der nächste Abschnitt folgt automatisch)
  const nTotal = Math.min(260, Math.max(4, Math.ceil(daysBetween(start, goalDate) / 7) + (dowOf(goalDate) === 0 ? 0 : 1)));
  const nextAnchor = goals.filter(g => g.id !== A.id && g.date! >= start).map(g => g.date!).sort()[0];
  const toNext = nextAnchor ? Math.ceil(daysBetween(start, nextAnchor) / 7) + 2 : 0;
  const nWeeks = Math.min(nTotal, inp.maxWeeks || (nTotal > 60 ? Math.max(26, Math.min(52, toNext)) : nTotal));
  const inBlock = goals.filter(g => g.id !== A.id && g.date! <= addDays(start, nWeeks * 7 - 1));
  const later = [...goals.filter(g => g.id !== A.id && !inBlock.includes(g)), ...pathGoals];
  const age = ageOf(profile, today);
  const ageAtRace = profile.birthYear ? +goalDate.slice(0, 4) - profile.birthYear : null;
  const minor = isMinor(profile, today);
  const rules: Rule[] = inp.rules || rulesOf(profile, parseFor(today));
  const eff = effectsOf(rules);
  const conflicts: Conflict[] = [];
  const cautious = profile.medicalCaution || eff.caution || (age != null && age >= 50);
  const prog = progressionOf(profile, today, cautious);
  const recoveryEvery = prog.buildWeeks + 1;
  const cont = inp.continueFrom || null;
  // Makrozyklen: auf jedes A-, B- (und mit genug Abstand C-) Ziel hin Grundlage → Aufbau → spezifisch → Tapering → Wettkampf, nach B-Zielen 1 Woche Erholung
  const anchors: Anchor[] = goals.filter(g => g.date! >= start).map(g => ({ id: g.id, type: g.type, name: g.name, date: g.date!, priority: g.id === A.id ? 'A' : g.priority, ...((g as any).placeholder ? { placeholder: true } : {}) }));
  // mitten in der Woche: eine Erholungswoche bleibt Erholungswoche, eine Aufbauwoche wird nicht plötzlich zur Erholung
  const built0 = cont ? cont.builtSinceRecovery || 0 : 0;
  const builtArg = cont && midWeek ? (cont.curRecovery ? recoveryEvery - 1 : Math.min(built0, Math.max(0, recoveryEvery - 2))) : built0;
  const macro: WeekPhase[] = macroPhases(start, nTotal, anchors, recoveryEvery, builtArg);
  const phases = macro.slice(0, nWeeks).map(x => ({ phase: x.phase as Phase, recovery: x.recovery }));
  const segGoal = (wi: number) => macro[Math.min(wi, macro.length - 1)] || { goalType: A.type, goalName: A.name, goalId: A.id } as WeekPhase;
  // nach einer Krankheit (Ende höchstens 14 Tage vor dem Start): erste Woche locker einsteigen, der Test erst am Ende der Woche
  const ill = inp.load && inp.load.illness;
  const afterIllness = !!ill && (!ill.end || ill.end >= addDays(start, -14));
  const allGoals = [A as Goal, ...inBlock];
  // Sportarten (Auftrag 15, feste Regel): nur die gewählten. Ein Ziel fügt keine Sportart hinzu (vorher bekam „Allgemeine Fitness“
  // ohne Laufen trotzdem Läufe). Nur ohne jede Auswahl (sehr alte Profile) gelten die Sportarten der Ziele.
  const need = new Set<SportKey>(allGoals.flatMap(g => Object.keys(goalNeed(g)) as SportKey[]));
  const chosen = chosenSports(profile);
  let sports = (chosen.length ? chosen : [...need]).filter(s => ENDURANCE.includes(s) || s === 'strength');
  const missingForGoal = allGoals.filter(g => g.type !== 'fitness').flatMap(g => Object.keys(goalNeed(g)) as SportKey[]).filter((s, i, a) => a.indexOf(s) === i && !sports.includes(s));
  if (eff.noBike) sports = sports.filter(s => s !== 'bike');
  const wantStrength = profile.sports.includes('strength') || freqOf(profile, 'strength')[0] > 0;
  if (wantStrength && !sports.includes('strength')) sports.push('strength');
  if (!wantStrength) sports = sports.filter(s => s !== 'strength');
  const runAllowed = (inp.runIntervalsAllowed ?? true) && !eff.runEasyOnly;
  const pc = (indoor: boolean, name: string | null) => paceCtx(profile, indoor, name, today);
  const ts = profile.teamSport || null;
  // Lernstufen
  const fromSkill = W.swimLadderStart(profile.skills || {});
  const fromPlan = inp.stages && inp.stages.swim !== undefined ? inp.stages.swim : fromSkill;
  // Stufe: die weiter fortgeschrittene aus Plan und Können (z. B. nach „ich schaffe jetzt 100 m Kraul am Stück“)
  // „kann kraulen“ (auch ohne Meterangabe) oder 200 m am Stück: normales Training, auch wenn der alte Plan noch eine Lernstufe hatte
  const skS = profile.skills || {};
  const swimStage0 = fromPlan === null || fromSkill === null ? (fromSkill === null && (skS.swimCrawlM || skS.swimCrawl === 'yes') ? null : fromPlan ?? fromSkill)
    : fromPlan.ladder === fromSkill.ladder ? (fromPlan.n >= fromSkill.n ? fromPlan : fromSkill) : fromSkill.ladder === 'swim' ? fromSkill : fromPlan;
  // Kraul lernen und Brust können: Brust zum Einschwimmen und für die Ausdauer dazu
  const swimStage = swimStage0 && swimStage0.ladder === 'swim' ? { ...swimStage0, ...((profile.skills || {}).swimBreast ? { breast: true } : {}), ...((profile.skills || {}).swimPullM ? { pull: (profile.skills || {}).swimPullM } : {}) } : swimStage0;
  const runStage = inp.stages && inp.stages.runwalk !== undefined ? inp.stages.runwalk : W.runLadderStart((profile.skills || {}).runContinuousMin);
  // normales Schwimmtraining: Stücke höchstens so lang wie die Strecke am Stück; CSS-Test erst ab 400 m
  const repMax = W.swimRepMax(skS);
  const crawl400 = !swimStage && (skS.swimCrawlM || 0) >= 400;

  // Umfang (Auftrag 8, für alle): Start auf Höhe der letzten Aufbauwoche (geplant, bzw. erledigt, wenn die Woche abgehakt wurde und deutlich
  // weniger war). Die CTL ist nur dann eine Obergrenze, wenn sie zum tatsächlichen Training passt (sonst fehlen Einheiten in den Daten).
  // Nach einer Krankheit: Wiedereinstieg in Stufen (etwa 72 %, 90 %, dann wieder 100 %). Danach jede Aufbauwoche +incPct bis zum Wochenlimit.
  const budget = Math.max(1.5, profile.weeklyHours || 5);
  const peakCapH = Math.max(...allGoals.map(g => ({ tri_supersprint: 6, tri_sprint: 8, tri_olympic: 11, tri_middle: 14, tri_long: 18, run_5k: 6, run_10k: 7, run_half: 8, run_marathon: 10, duathlon: 9, aquathlon: 6, bike_event: 12, swim_goal: 5, fitness: 7 } as Record<string, number>)[g.type] || 10));
  const tsP = profile.teamSport || null;
  const teamWeekMin = tsP && teamActive(tsP, addDays(start, 3)) ? (tsP.trainingDays || []).length * (tsP.trainingMinutes || 90) + (tsP.gameDays || []).length * (tsP.gameMinutes || 90) : 0;
  // Wochenlimit (auf Wunsch inklusive Teamsport); kein Abschlag mehr für weit entfernte Ziele, solange das Limit nicht erreicht ist
  const ownBudget = Math.max(90, budget * 60 - (profile.budgetInclTeam ? teamWeekMin : 0));
  // ohne „inklusive Teamsport“: wie bisher zählt der Teamsport zur Hälfte gegen das Limit
  const peakOwn = Math.min(ownBudget - (profile.budgetInclTeam ? 0 : teamWeekMin * 0.5), peakCapH * 60);
  const L = inp.load || null;
  const usePre = afterIllness && !!(L && L.preIllnessCtl && L.preIllnessCtl > (L.ctl || 0));
  const ctlBase = L ? (usePre ? L.preIllnessCtl! : L.ctl) : null;
  const ctlMin = ctlBase ? ctlToWeekMin(ctlBase) : null;
  const hh0 = (m: number) => (Math.round(m / 6) / 10).toString().replace('.', ',');
  let ownStart: number | null = null; let startWhy = '';
  const lastPlanned = cont && cont.lastNormalMin ? cont.lastNormalMin : null;
  if (inp.measuredStartMin != null && inp.measuredStartMin > 0) {
    // Auftrag 11: „Stunden bisher: weiß ich nicht“ → nach 2 Wochen an die echten Daten angepasst
    ownStart = inp.measuredStartMin; startWhy = `aus deinem Training der ersten 2 Wochen (${hh0(ownStart)} h pro Woche)`;
  } else if (lastPlanned) {
    const done = cont!.lastNormalTracked && cont!.lastNormalDoneMin != null ? cont!.lastNormalDoneMin : null;
    ownStart = done != null && done < lastPlanned * 0.9 ? Math.max(done, lastPlanned * 0.6) : lastPlanned;
    startWhy = done != null && done < lastPlanned * 0.9 ? `wie in deiner letzten Aufbauwoche erledigt (${hh0(ownStart)} h von ${hh0(lastPlanned)} h)` : `auf Höhe deiner letzten Aufbauwoche (${hh0(lastPlanned)} h)`;
    const ctlComplete = ctlMin != null && ctlMin >= ownStart * 0.8;
    if (ctlComplete && ctlMin! * (1 + prog.incPct / 100) < ownStart) { ownStart = ctlMin! * (1 + prog.incPct / 100); startWhy += `, begrenzt durch deine Belastung (CTL ${Math.round(ctlBase!)})`; }
    else if (ctlMin != null && !ctlComplete) startWhy += `; die CTL (${Math.round(ctlBase!)}) ist niedriger, weil nicht alle Einheiten in den Daten sind, deshalb zählt sie hier nicht`;
  } else if (ctlMin != null) { ownStart = ctlMin; startWhy = `aus deiner Belastung (CTL ${Math.round(ctlBase!)}${usePre ? ' vor der Krankheit' : ''}${L && L.source ? ', ' + L.source : ''})`; }
  if (ownStart != null && L && L.atl != null && L.ctl && L.atl > L.ctl * 1.3 && !afterIllness) { ownStart *= 0.9; startWhy += ', 10 % weniger, weil die Müdigkeit (ATL) gerade hoch ist'; }
  if (ownStart != null && afterIllness) startWhy += ', nach der Krankheit in Stufen: erst etwa 72 %, dann 90 %, dann wieder 100 %';
  const baseOwn = ownStart != null ? Math.min(peakOwn, Math.max(90, ownStart)) : Math.min(peakOwn, Math.max(90, (inp.currentWeeklyHours ?? budget * 0.7) * 60 * (cautious ? 0.85 : 1) - teamWeekMin * 0.5));
  const pat = profile.weekPattern && (profile.weekPattern.slots || []).length ? profile.weekPattern : null;
  const inc = 1 + prog.incPct / 100;
  const ENTRY_F = [0.72, 0.9];
  const ownVols: number[] = []; const entryWeek: boolean[] = [];
  let lastNormal = baseOwn, afterEntry = false;
  phases.forEach((p, i) => {
    const mon = addDays(start, i * 7);
    const tg = pat ? WP.targetFor(pat, mon) : null;
    if (tg) {
      if (tg.recovery != null) p.recovery = tg.recovery;
      ownVols.push(Math.round(tg.hours * 60)); entryWeek.push(!!tg.entry);
      if (!tg.recovery && !tg.entry) lastNormal = tg.hours * 60;
      afterEntry = !!tg.entry; return;
    }
    entryWeek.push(false);
    if (p.phase === 'race') { const pr = segGoal(i).priority; ownVols.push(Math.round(lastNormal * (pr === 'C' ? 0.85 : pr === 'B' ? 0.6 : 0.45))); return; }
    if (p.phase === 'taper') { ownVols.push(Math.round(lastNormal * (phases[i + 1] && phases[i + 1].phase === 'taper' ? 0.75 : 0.6))); return; }
    if (p.recovery) { ownVols.push(Math.round(lastNormal * 0.65)); afterEntry = false; return; }
    if (afterIllness && i < ENTRY_F.length) { ownVols.push(Math.round(baseOwn * ENTRY_F[i])); entryWeek[i] = true; afterEntry = true; return; }
    // erste Woche (oder erste nach dem Wiedereinstieg): auf Höhe der letzten Aufbauwoche, danach +incPct
    const cur = i === 0 || afterEntry ? Math.min(peakOwn, lastNormal) : Math.min(peakOwn, lastNormal * inc);
    ownVols.push(Math.round(cur)); lastNormal = cur; afterEntry = false;
  });
  // Bisherige Form (eigenes Training + halber Teamsport) für die freie Verteilung
  const volumes = ownVols.map(v => v + teamWeekMin * 0.5);
  const startMin = volumes[0];
  void startMin;

  const weeks: any[] = [];
  const dropped: string[] = [];
  const idp = 'g' + today.replace(/-/g, '').slice(2) + 'w';
  let prevSundayHard = false, prevSundayStrength = false;
  /* Einheiten vom Sonntag davor (gleiche Sportart nicht So → Mo) */
  let prevSunday: any[] = [];
  let lastLR: number | null = cont && cont.lastLongRun ? cont.lastLongRun : null;
  const gq: { bikeN: Record<string, number>; runQN: Record<string, number>; swimN: Record<string, number> } = { bikeN: {}, runQN: {}, swimN: {} };
  const blockWeekOf = (wi: number) => { let k = 0; for (let i = wi - 1; i >= 0 && !phases[i].recovery; i--) k++; return k; };
  // Woche innerhalb der Grundlage (für Tempo in der späten Grundlage), bei Fortsetzung mit den Wochen davor
  const baseWeekOf = (wi: number) => { let k = 0; for (let i = wi - 1; i >= 0 && phases[i].phase === 'base'; i--) k++; return k + (wi - k === 0 && cont && cont.weekNo ? Math.min(8, cont.weekNo) : 0); };
  // Fester Wochenaufbau: Stand der langen Einheiten, der Sweet-Spot-Leiter und des letzten Tests
  const weeksSince = (from: string | undefined) => from && from < start ? Math.floor(daysBetween(from, start) / 7) : 0;
  const keySlot = pat ? pat.slots.find(x => x.role === 'key' && x.keyFrom) : null;
  const strideSlot = pat ? pat.slots.find(x => x.stridesFrom) : null;
  const brickSlot = pat ? pat.slots.find(x => x.role === 'brick' && x.from) : null;
  const ks = weeksSince(keySlot && keySlot.keyFrom);
  let pst: WP.PatternState = { longRun: (cont && cont.lastLongRun) || 60, longBike: (cont && cont.lastLongBike) || 90, swim: (cont && cont.lastSwim) || 45,
    keyWeeks: ks - Math.floor(ks / 4), strideWeeks: weeksSince(strideSlot && strideSlot.stridesFrom), brickWeeks: weeksSince(brickSlot && brickSlot.from),
    lastTestMon: pat ? ((pat.targets || []).filter(t => (t.tests || []).length && t.start < start).map(t => t.start).sort().pop() || null) : null,
    runRef: cont && cont.lastNormalWeek ? weekMinutes(cont.lastNormalWeek, 'run') || null : null };
  const legsStrength = (x: Cand) => !!x.strength && x.s.area !== 'upper';
  let blockNo = cont ? cont.blockNo + (cont.builtSinceRecovery ? 0 : 1) : 1, blockWeek = cont && cont.builtSinceRecovery ? cont.builtSinceRecovery : 0;
  phases.forEach((ph, wi) => {
    const mon = addDays(start, wi * 7);
    const month = +addDays(mon, 3).slice(5, 7);
    const dates = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
    const raceOn: Record<string, Goal> = {};
    allGoals.forEach(g => { if (dates.includes(g.date!)) raceOn[g.date!] = g; });
    // Tage: Zeit, Teamsport, Wettkampf, Tapering vor und Erholung nach B/A-Rennen
    const part = midWeek && wi === 0;
    const slots = dates.map((date, i) => {
      const dow = dowOf(date);
      // Tage vor „from“ sind zu: dort bleibt, was war (Auftrag 11)
      if (part && date < from!) return { i, date, dow, cap: 0, used: 0, items: [] as Cand[], team: false, game: false, race: null as Goal | null, noHard: true, pool: false, closed: true };
      const tsOn = teamActive(ts, date);
      const lim = dayLimit(rules, date);
      let cap = Math.min(dayCap(profile, dow), lim.cap), noHard = lim.noHard;
      for (const g of allGoals) {
        const d = daysBetween(g.date!, date); // >0: nach dem Rennen
        if (g.priority !== 'C' && d < 0 && d >= -(g.priority === 'A' ? 3 : 4)) { noHard = true; cap = Math.round(cap * 0.7); }
        if (d > 0 && d <= easyAfterDays(g.type)) { noHard = true; cap = Math.min(cap, d <= 2 ? 45 : 60); }
        if (g.priority === 'C' && d === -1) noHard = true;
      }
      return { i, date, dow, cap, used: 0, items: [] as Cand[], team: tsOn && ts!.trainingDays.includes(dow), game: tsOn && ts!.gameDays.includes(dow), race: raceOn[date] || null, noHard,
        pool: allowedHard(rules, { sport: 'swim', place: 'pool' }, date), closed: false };
    });
    const isHardDay = (i: number) => i >= 0 && i < 7 && (slots[i].game || !!slots[i].race || slots[i].items.some(x => x.hard));
    const prevHard = (i: number) => i === 0 ? prevSundayHard : isHardDay(i - 1);
    // Teamsport zählt nicht gegen die Zeit pro Tag (im Fragebogen: „Teamsport-Training musst du hier nicht einrechnen“)
    const put = (i: number, c: Cand) => { slots[i].items.push(c); if (!(c.fixed && c.s.sport === 'football')) slots[i].used += c.s.plannedMinutes || 0; };
    /* Häufigkeit auf die Tage begrenzen, die die harten Regeln erlauben; passt der Wunsch nicht, gibt es einen klaren Hinweis mit Lösungen */
    const limitByRules = (sport: RuleSport, n: number, want: number) => {
      const okDays = slots.filter(sl => sl.cap > 0 && !sl.race && allowedHard(rules, { sport, place: sport === 'swim' ? 'pool' : undefined }, sl.date));
      if (n <= okDays.length) return n;
      const seasonal = !okDays.length && slots.filter(sl => sl.cap > 0).every(sl => evaluate(rules, { sport, place: sport === 'swim' ? 'pool' : undefined }, sl.date).hard.every(r => (r.months && r.months.length) || r.kind === 'period'));
      if (seasonal) return 0;
      if (!ph.recovery && ph.phase !== 'race' && ph.phase !== 'taper' && !part) noteConflict(conflicts, rules, slots, sport, Math.max(want, n), okDays.map(x => x.dow));
      return okDays.length;
    };

    // 0) Laufende Woche: was bleibt (vergangene Tage, Erledigtes von heute), zählt mit (Belastung, harte Tage, Umfang)
    const doneBy: Record<string, number> = {}; let doneOwn = 0, doneHard = 0;
    if (part) slots.forEach(sl => frozenOn(sl.date).forEach((s: any) => {
      put(sl.i, { s, fixed: true, frozen: true, hard: !!s.hard || (s.sport === 'football' && /spiel/i.test(s.title || '')), prio: 0 });
      if (!s._done || s.sport === 'football' || s.race || s.cancelled) return;
      doneBy[s.sport] = (doneBy[s.sport] || 0) + 1; doneOwn += s._doneMin || s.plannedMinutes || 0; if (s.hard) doneHard++;
    }));
    // 1) Feste Termine: Wettkämpfe, Teamsport, alte feste Termine
    slots.forEach(sl => {
      if (sl.closed) return;
      if (part && sl.items.some(x => x.frozen && (x.s.sport === 'football' || x.s.race))) return;
      if (sl.race) put(sl.i, { s: raceSession(sl.race), hard: true, fixed: true, prio: 0 });
      if (sl.game && !sl.race) put(sl.i, { s: W.build({ sport: 'football', kind: 'game', title: `${ts!.name || 'Teamsport'}: Spiel`, ctx: {}, noDistance: true, steps: [{ part: 'main', min: ts!.gameMinutes || 90, note: 'Spieltag: zählt als harter Tag. Am Tag davor nichts Hartes.' }] }), hard: true, fixed: true, prio: 0 });
      else if (sl.team && !sl.race) put(sl.i, { s: W.build({ sport: 'football', kind: 'team', title: `${ts!.name || 'Teamsport'}-Training`, ctx: {}, noDistance: true, steps: [{ part: 'main', min: ts!.trainingMinutes || 90, note: 'Fester Termin. Zählt im Plan als Belastung.' }] }), fixed: true, prio: 0 });
      (profile.fixed || []).filter(f => f.dow === sl.dow && !sl.race).forEach(f => put(sl.i, { s: { sport: f.sport, title: f.title, time: f.time, plannedMinutes: f.minutes || 75, description: 'Fester Termin', fixed: true }, hard: !!f.hard, fixed: true, prio: 0 }));
    });
    const fixedMin = slots.reduce((a, sl) => a + sl.items.filter(x => !x.s.race && !x.frozen).reduce((b, x) => b + (x.s.plannedMinutes || 0), 0), 0);
    const total = volumes[wi];
    let endurance = Math.max(0, total - fixedMin * 0.5);
    if (part) {
      // Rest der Woche: Wochenumfang minus Erledigtes, höchstens so viel, wie die restlichen Tage hergeben (kein Nachholen auf einen Schlag)
      const capAll = dates.reduce((a, d) => a + dayCap(profile, dowOf(d)), 0) || 1;
      const capLeft = dates.filter(d => d >= from!).reduce((a, d) => a + dayCap(profile, dowOf(d)), 0);
      endurance = Math.max(0, Math.min(ownVols[0] - doneOwn, ownVols[0] * capLeft / capAll * 1.15));
    }

    let patImportant = '';
    if (pat) {
      // Fester Wochenaufbau: jede Einheit an ihrem Tag, Dauer aus der Vorgabe oder den Regeln; harte Regeln werden nie verletzt
      const tg = WP.targetFor(pat, mon);
      const tests = WP.testsFor(pat, mon, ph.recovery, pst);
      const cOut0 = bikeChoice(profile, false, month, eff);
      if (!tg && inp.needTests && wi >= tw && wi <= tw + 1) { if (wi === tw && inp.needTests.run) tests.add('run'); if (wi === tw && inp.needTests.swim) tests.add('swim'); if (wi === tw + 1 && inp.needTests.bike) tests.add('bike'); }
      const cOut = bikeChoice(profile, false, month, eff), cIn = bikeChoice(profile, true, month, eff);
      const sgP = segGoal(wi);
      // lockere Tage nach einem Wettkampf (Sprint 3, Olympisch 5, Mittel 10, Lang/Marathon 14 Tage)
      const easyDates = dates.filter(d => goals.some(g => g.date && d > g.date && daysBetween(g.date, d) <= easyAfterDays(g.type)));
      const items = WP.patternWeek(pat, { mon, dates, recovery: ph.recovery, entry: entryWeek[wi], ownMin: ownVols[wi], target: tg, tests, phase: ph.phase,
        goalType: sgP.goalType, minor: (ageOf(profile, mon) ?? 30) < 18, easyDates,
        hardDows: slots.filter(x => x.game || x.race).map(x => x.dow),
        caps: { run: capsFor(sgP.goalType, mon, { aGoal: A.type, age: ageOf(profile, mon), runEasySecKm: profile.thresholds.thresholdPaceRunSec ? profile.thresholds.thresholdPaceRunSec * 1.2 : null, swimLearning: !!swimStage }).run,
          bikeOut: capsFor(sgP.goalType, mon, { aGoal: A.type, age: ageOf(profile, mon), indoor: cOut0.indoor }).bike, swim: capsFor(sgP.goalType, mon, { swimLearning: !!swimStage, phase: ph.phase as any }).swim },
        run: pc(false, null), bikeOut: pc(cOut.indoor, cOut.name), bikeIn: pc(cIn.indoor, cIn.name), swim: pc(false, null), swimStage: swimStage as any, inc: 1 + prog.incPct / 100,
        crawl400, repMax, strength: { knee: eff.strengthKnee, back: eff.strengthBack, shoulder: eff.strengthShoulder }, goalName: A.name,
        level: levelOf(profile), baseWeek: baseWeekOf(wi), maxHard: maxHard(profile, ph.phase, mon, baseWeekOf(wi)), noZ5: (() => { const a = ageOf(profile, mon); return a != null && (a < 18 || a >= 60); })() }, pst);
      for (const it of items) {
        // laufende Woche: nichts vor „from“, und nicht dieselbe Sportart neben einer schon erledigten Einheit
        if (part && (it.dow !== undefined) && (() => { const sl0 = slots.find(x => x.dow === it.dow)!; return sl0.closed || sl0.items.some(x => x.frozen && x.s.sport === it.s.sport); })()) continue;
        const sl = slots.find(x => x.dow === it.dow)!;
        const probe = { ...it.s, long: !!it.long, hard: !!it.hard };
        if (sl.race) { dropped.push(`Woche ${wi + 1}: ${it.s.title} entfällt (Wettkampf)`); continue; }
        if (it.s.sport === 'swim' && !sl.pool) { dropped.push(`Woche ${wi + 1}: ${it.s.title} am ${DOW[sl.dow]} entfällt (kein Schwimmbad laut deinen Regeln)`); continue; }
        const hardHit = evaluate(rules, probe, sl.date).hard;
        if (hardHit.length) { dropped.push(`Woche ${wi + 1}: ${it.s.title} am ${DOW[sl.dow]} entfällt (Regel: ${ruleText(hardHit[0])})`); continue; }
        if (legsStrength({ s: it.s, strength: it.strength, prio: 0 }) && (sl.game || (sl.i < 6 && slots[sl.i + 1].game))) { dropped.push(`Woche ${wi + 1}: Kraft Unterkörper nicht am Spieltag oder am Tag davor`); continue; }
        put(sl.i, { s: it.s, long: it.long, hard: it.hard, test: it.test, strength: it.strength, prio: 1 });
      }
      pst = WP.advance(pst, items, ph.recovery || entryWeek[wi] || ph.phase === 'taper' || ph.phase === 'race', mon, tests);
      const T: Record<string, string> = { swim: 'Schwimmen (Kraul-Check)', bike: 'Rad', run: 'Lauf' };
      const testDays = items.filter(x => x.test).map(x => `${T[x.s.sport] || x.s.title} ${DOW[x.dow]}`);
      patImportant = [
        testDays.length ? `Tests: ${testDays.join(', ')}. Die App übernimmt die Werte automatisch in Zonen und Pace und meldet es im Coach.` : '',
        entryWeek[wi] ? 'Wiedereinstieg: alles locker, der Umfang steigt Schritt für Schritt.' : ph.recovery ? 'Erholungswoche: weniger Umfang, der Körper wird in der Pause stärker.' : items.some(x => x.hard && !x.test) ? 'Die Schlüsseleinheit zählt: ausgeruht hingehen.' : '',
        profile.morning && (profile.morning.days || []).length ? `Morgens ${profile.morning.label || 'vor der Schule'} optional 30-40 min Mobility oder lockeres Rad (nur an erlaubten Rad-Tagen), nur bei grüner Ampel.` : ''
      ].filter(Boolean).join(' ');
    } else {
    // 2) Einheiten der Woche erzeugen
    const share = weekShare(allGoals, mon, sports);
    const hardOk = !ph.recovery && ph.phase !== 'race';
    // harte Einheiten pro Woche: Grundlage 1 (Rad), Aufbau/spezifisch 3 (Rad, Lauf, Schwimmen; unter 18: 2), Tapering 1
    // Auftrag 14: Zahl der harten Tage nach Niveau, Alter und Phase (Einsteiger 1, Fortgeschrittene 2, Erfahrene 3; unter 18 und ab 60 höchstens 2)
    let hardLeft = ph.recovery || ph.phase === 'race' ? 0 : maxHard(profile, ph.phase, mon, baseWeekOf(wi));
    // erste Woche nach einer Krankheit: nichts Hartes (ein Test am Ende der Woche ist die Ausnahme)
    if (wi === 0 && afterIllness) hardLeft = 0;
    // laufende Woche: schon erledigte harte Einheiten zählen mit (keine doppelte harte Einheit)
    if (part) hardLeft = Math.max(0, hardLeft - doneHard);
    // Spiel und C-Rennen zählen in Grundlage und Tapering als harte Einheit; im Aufbau/spezifisch ist das Kontingent für Intervall-Einheiten (Abstand gilt trotzdem)
    // Spiele und C-Rennen zählen als harte Tage (Auftrag 14: in allen Phasen)
    hardLeft = Math.max(0, hardLeft - slots.filter(sl => sl.game || (sl.race && sl.race.priority === 'C')).length);
    const lv = levelOf(profile); const ageW = ageOf(profile, mon); const noZ5 = ageW != null && (ageW < 18 || ageW >= 60);
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
    // Obergrenzen der langen Einheiten: Distanz des Ziels dieses Zyklus, Jahreszeit (drinnen/draußen), Alter (Auftrag 9)
    const sg = segGoal(wi);
    const sgGoal = goals.find(g => g.id === sg.goalId);
    const capsW = (indoor: boolean) => capsFor(sg.goalType, mon, { aGoal: A.type, phase: ph.phase as any, age: ageOf(profile, mon), indoor, runEasySecKm: profile.thresholds.thresholdPaceRunSec ? profile.thresholds.thresholdPaceRunSec * 1.2 : null, swimLearning: !!swimStage,
      bikeKm: sgGoal && sg.goalType === 'bike_event' ? (legsOf(sgGoal).find(l => l.sport === 'bike') || { km: 0 }).km : null });
    const tip = (sport: string) => tipFor(sport, rules) || (age != null && age >= 50 ? 'Länger aufwärmen, Gelenke freuen sich.' : undefined);
    const add = (spec: W.Spec, o: Partial<Cand> = {}) => {
      spec.why = spec.why || whyBase(spec.sport, spec.kind); const tp = tip(spec.sport); if (tp && !spec.tip) spec.tip = tp;
      let s = W.build(spec);
      const smax = sportMax(rules, spec.sport);
      if (smax && s.plannedMinutes > smax && s.spec && !s.stage) { let sp = s.spec; for (let k = 0; k < 8 && W.totals(sp).min > smax; k++) sp = W.scaleSpec(sp, Math.max(0.5, smax / W.totals(sp).min)); s = W.build(sp); }
      cands.push({ s, hard: !!s.hard, prio: s.sport === 'swim' || s.stage ? 3 : 5, ...o });
    };
    const swimBlocked = !!eff.noSwim || !!(eff.noSwimMonths && eff.noSwimMonths.includes(month)) || !slots.some(sl => sl.pool && sl.cap > 0);
    // Reihenfolge der Schlüsseleinheiten: Rad, Lauf, dann Schwimmen
    // Reihenfolge für die harten Einheiten (Auftrag 14): Laufziel zuerst Laufen, Rad-Event zuerst Rad, Triathlon im Wechsel, damit jede Sportart ihre Intensität bekommt
    const grp = GOALS[sg.goalType] ? GOALS[sg.goalType].group : '';
    const prio0 = sg.goalType === 'bike_event' ? ['bike', 'run', 'swim'] : grp === 'run' ? ['run', 'bike', 'swim'] : grp === 'tri' ? (['bike', 'run', 'swim'] as string[]).map((_, i, a) => a[(i + wi) % 3]) : ['bike', 'run', 'swim'];
    for (const sport of [...sports].sort((a, b) => [...prio0, 'strength'].indexOf(a) - [...prio0, 'strength'].indexOf(b))) {
      if (sport === 'strength') continue;
      const [fmin, fmax] = freqOf(profile, sport);
      let mins = endurance * (share[sport] || 0) * (sport === 'run' && eff.runVolume ? eff.runVolume : 1) * (sport === 'swim' && eff.swimVolume ? eff.swimVolume : 1);
      const typ = sport === 'run' ? 40 : sport === 'bike' ? 60 : 40;
      let n = Math.max(fmin, Math.min(fmax, Math.round(mins / typ)));
      // laufende Woche: was in dieser Sportart schon erledigt ist, zählt mit
      if (part) n = Math.max(0, Math.min(n, Math.round(mins / typ) || (mins > 20 ? 1 : 0)) - (doneBy[sport] || 0));
      if (!n && (share[sport] || 0) > 0.05) n = 1;
      if (ph.phase === 'race') n = Math.min(n, sport === 'swim' ? 1 : 2);
      if (!(sport === 'swim' && swimBlocked)) n = limitByRules(sport as RuleSport, n, fmin);
      if (!n) continue;
      if (sport === 'swim' && swimBlocked) {
        const noPool = eff.noSwim || (eff.noSwimMonths && eff.noSwimMonths.includes(month));
        dropped.push(`Woche ${wi + 1}: Schwimmen entfällt (${noPool ? 'kein Schwimmbad' : 'kein Schwimmtag frei'})`);
        // Ersatz: Zugkraft und Rumpf für Schwimmer, damit die Schwimm-Muskulatur nicht einschläft
        // Ersatz nur mit Kraft, wenn Kraft gewählt ist (Auftrag 15: nur gewählte Sportarten)
        if (noPool && sports.includes('strength')) for (let k = 0; k < Math.min(n, 1); k++) {
          const sp = W.strengthSession(['swim'], { light: ph.recovery, shoulder: eff.strengthShoulder, variant: 1, why: 'Ersatz fürs Schwimmen (kein Schwimmbad): kräftigt Schultern und Rumpf für die Zeit im Wasser.' });
          sp.title = 'Schwimm-Ersatz: Zugkraft und Rumpf ' + W.totals(sp).min + ' min';
          cands.push({ s: { ...W.build(sp), replaces: 'swim' }, strength: true, prio: 4 });
        }
        continue;
      }
      if (sport === 'run') {
        // Gehen/Laufen-Stufen steigen erst, wenn die aktuelle Stufe geklappt hat (Wochenplanung nach den Daten)
        if (runStage != null) { for (let k = 0; k < n; k++) add(W.runWalk(pc(false, null), runStage, `bringt dich Schritt für Schritt zu 30 min am Stück, die Grundlage für ${target.name}.`)); continue; }
        const ctx = pc(false, null);
        const cap = abilityCap(profile, 'run', wi);
        const longCap = Math.min(capsW(false).run, cap ?? 999, ph.phase === 'taper' ? 50 : 999);
        let rest = mins; let left = n;
        // langer Lauf höchstens +10 min pro Woche
        if (n >= 2 && ph.phase !== 'race') { const L = Math.max(30, Math.min(longCap, lastLR != null ? lastLR + 10 : 999, rest * (n === 2 ? 0.55 : 0.4))); add(W.runLong(ctx, L), { long: true, prio: 1 }); rest -= L; left--; }
        // Qualitätslauf: Aufbau Schwelle, spezifisch Wettkampftempo je Ziel-Distanz (unter 18 nie Zone 5)
        const rq = hardOk && hardLeft > 0 && runAllowed && left >= 1 && (n >= (ph.phase === 'base' ? 3 : 2) || ph.phase === 'taper') ? K.runQualityStep(ph.phase, sg.goalType, gq.runQN[ph.phase] || 0, (ageOf(profile, mon) ?? 30) < 18, { noZ5, baseWeek: baseWeekOf(wi), level: lv }) : null;
        if (rq) {
          // Grundlage: der Tempoteil steckt in einem normalen Lauf (gleiche Dauer wie die anderen Läufe der Woche)
          // Auftrag 14: die Qualität passt in den Anteil eines Laufs dieser Woche (sonst steigt der Laufumfang zu stark); passt sie nicht, bekommt sie eine andere Sportart
          const share = Math.min(cap ?? 60, 60, rest / Math.max(1, left));
          let spec = rq.kind === 'tempo' ? K.longRunWithQuality(ctx, r5(Math.max(rq.reps * rq.min + (rq.reps - 1) * rq.rest + 25, share)), rq) : K.runQuality(ctx, rq);
          const fits = (sp: W.Spec) => W.totals(sp).min <= share * 1.2 + 5 || W.totals(sp).min + (left - 1) * 25 <= rest + 5;
          if (rq.kind !== 'tempo' && !fits(spec)) spec = K.runQuality(ctx, rq, { short: true });
          if (ph.phase !== 'taper' && !fits(spec)) spec = null as any;
          if (spec) { add(spec, { hard: true, prio: 2, easy: W.runEasy(ctx, Math.min(60, W.totals(spec).min)) }); rest -= W.totals(spec).min; left--; hardLeft--; gq.runQN[ph.phase] = (gq.runQN[ph.phase] || 0) + 1; }
        }
        // Grundlage: ein lockerer Lauf mit Hügelsprints, Fahrtspiel oder Steigerungen (im Wechsel)
        for (let k = 0; k < left; k++) { const m = Math.max(25, Math.min(cap ?? 60, 60, rest / Math.max(1, left - k))); add(ph.phase === 'base' && k === 0 && !eff.runEasyOnly && !ph.recovery ? K.runBaseVariant(ctx, m, wi) : W.runEasy(ctx, m, { strides: ph.phase === 'base' && k === 0 && !eff.runEasyOnly })); rest -= m; }
      }
      if (sport === 'bike') {
        const cap = abilityCap(profile, 'bike', wi);
        let rest = mins; let left = n;
        // Tapering mit nur einer Radeinheit: der kurze, scharfe Reiz geht vor der langen Ausfahrt
        const taperKey = ph.phase === 'taper' && n === 1 && hardOk && hardLeft > 0;
        if (n >= 1 && ph.phase !== 'race' && !taperKey) { const c = bikeChoice(profile, false, month, eff); const longCap = Math.min(capsW(c.indoor).bike, cap ?? 999, ph.phase === 'taper' ? 75 : 999); const L = Math.max(45, Math.min(longCap, rest * (n === 1 ? 1 : 0.5))); add(K.bikeLongVariant(W.bikeLong(pc(c.indoor, c.name), L), wi, ph.phase), { long: true, prio: 1 }); rest -= L; left--; }
        // Einsteiger: in der Grundlage noch keine Intervalle auf dem Rad (Auftrag 14)
        if (hardOk && hardLeft > 0 && left >= 1 && !(lv === 'beginner' && ph.phase === 'base')) {
          const c = bikeChoice(profile, true, month, eff);
          // Fortschritt je Phase: Sweet Spot/Kraftausdauer → Schwelle/Over-Unders → je Ziel VO2max, Schwelle, Wettkampftempo
          const spec = K.bikeKey(pc(c.indoor, c.name), ph.phase, sg.goalType, gq.bikeN[ph.phase] || 0, undefined, { noZ5 });
          gq.bikeN[ph.phase] = (gq.bikeN[ph.phase] || 0) + 1;
          add(spec, { hard: true, prio: 2, easy: W.bikeEasy(pc(c.indoor, c.name), Math.min(90, W.totals(spec).min)) }); rest -= W.totals(spec).min; left--; hardLeft--;
        }
        for (let k = 0; k < left; k++) { const c = bikeChoice(profile, false, month, eff); const m = Math.max(30, Math.min(cap ?? 90, 90, rest / Math.max(1, left - k))); add(W.bikeEasy(pc(c.indoor, c.name), m)); rest -= m; }
      }
      if (sport === 'swim') {
        const ctx = pc(false, null);
        // Schwerpunkt je Woche (Technik, Pull Buoy, zügige Bahnen), kürzere Pausen im Block, Freiwasser in der spezifischen Phase
        if (swimStage) { for (let k = 0; k < n; k++) add(K.swimVariant(W.swimLearn(ctx, swimStage, swimStage.ladder === 'swimBreast' ? 'Brust bringt Ausdauer im Wasser, die Kraul-Technik kommt Schritt für Schritt dazu.' : `Kraul lernen, damit du ${target.name} entspannt schwimmen kannst.`), wi + k, blockWeekOf(wi), ph.phase)); continue; }
        const per = Math.max(25, Math.min(capsW(false).swim, mins / n));
        for (let k = 0; k < n; k++) {
          const hard = hardOk && hardLeft > 0 && k === 1 && ph.phase !== 'base';
          const kind = k === 0 ? 'technique' : hard ? 'css' : 'endurance';
          const sw = W.swimNormal(ctx, kind, per, ph.phase, repMax, gq.swimN[ph.phase] || 0);
          add(kind === 'css' ? sw : K.fitSwim(K.swimVariant(sw, wi + k, blockWeekOf(wi), ph.phase), per), { hard });
          if (hard) { hardLeft--; gq.swimN[ph.phase] = (gq.swimN[ph.phase] || 0) + 1; }
        }
      }
    }
    // Einstiegstests in den ersten 2 Wochen (nur, wenn das Können passt)
    if (wi >= tw && wi <= tw + 1 && inp.needTests) {
      const ctx = pc(false, null);
      const swap = (sport: string, spec: W.Spec) => { const i = cands.findIndex(c => c.s.sport === sport && c.hard) ; const j = i >= 0 ? i : cands.findIndex(c => c.s.sport === sport && !c.long); const soft = /Kraul-Check/.test(spec.title || ''); const b = W.build(spec); if (soft) delete b.hard; const c: Cand = { s: b, hard: !soft, prio: 0.8, test: true }; if (j >= 0) cands[j] = c; else cands.push(c); };
      if (wi === tw && inp.needTests.run && runStage == null && sports.includes('run')) swap('run', W.runTest(ctx));
      if (wi === tw + 1 && inp.needTests.bike && sports.includes('bike') && !(skS.bikeLongestMin != null && skS.bikeLongestMin < 75)) { const c = bikeChoice(profile, true, month, eff); swap('bike', W.bikeTest(pc(c.indoor, c.name))); }
      // Schwimmtest 400/200 m nur, wer 400 m am Stück krault; sonst der Kraul-Check (Auftrag 11: vorher auch für Anfänger)
      if (wi === tw && inp.needTests.swim && sports.includes('swim') && !swimBlocked && !(swimStage && (swimStage.ladder === 'swimBreast' || swimStage.n < 2))) swap('swim', crawl400 ? W.swimTest(ctx) : W.swimCheck(ctx, swimStage as any, 40));
    }
    // Kraft nach Körperbereich an festen Tagen (z. B. Unterkörper Di, Oberkörper Fr), nie Beine am Spieltag oder am Tag davor
    const sp = profile.strengthPlan;
    if (sports.includes('strength') && sp && ((sp.lower || []).length || (sp.upper || []).length || (sp.core || []).length)) {
      const light = ph.recovery || ph.phase === 'taper' || ph.phase === 'race';
      for (const area of ['lower', 'upper', 'core'] as const) for (const dow of (sp[area] || [])) {
        const sl = slots.find(x => x.dow === dow);
        if (!sl || sl.race) continue;
        if (area === 'lower' && (sl.game || (slots[sl.i + 1] && (slots[sl.i + 1].game || slots[sl.i + 1].race)))) { dropped.push(`Woche ${wi + 1}: Kraft Unterkörper nicht am Spieltag oder am Tag davor`); continue; }
        cands.push({ s: W.build({ ...W.strengthArea(area, { light, back: eff.strengthBack, knee: eff.strengthKnee, shoulder: eff.strengthShoulder, why: area === 'lower' ? 'kräftige Beine und Hüfte schützen Knie, Leiste und Achillessehne und machen dich beim Laufen ökonomischer.' : area === 'upper' ? 'Schultern und Rücken stark machen, das hilft beim Kraulen und schützt die Schulter.' : 'ein stabiler Rumpf hält die Haltung beim Laufen, auf dem Rad und im Wasser.' }), tip: tipFor('strength', rules) || undefined }), strength: true, prio: 0.5, onDays: [dow] });
      }
    } else if (sports.includes('strength')) {
      const [smin, smax] = freqOf(profile, 'strength');
      const n = limitByRules('strength', ph.phase === 'race' ? Math.min(1, smax) : Math.max(smin, Math.min(smax, smin || 1)), smin);
      for (let k = 0; k < n; k++) cands.push({ s: W.build({ ...W.strengthSession([...profile.sports, ...sports], { light: ph.recovery || ph.phase === 'taper' || ph.phase === 'race', back: eff.strengthBack, knee: eff.strengthKnee, shoulder: eff.strengthShoulder, variant: k, why: 'stabile Muskeln und Sehnen schützen vor Verletzungen und machen dich ökonomischer.' }), tip: tipFor('strength', rules) || undefined }), strength: true, prio: 4 });
    }
    // Koppellauf in der spezifischen Phase (Triathlon): direkt nach der langen Ausfahrt
    // Koppeleinheiten ab der Aufbauphase regelmäßig
    if ((GOALS[sg.goalType].group === 'tri' || GOALS[target.type].group === 'tri') && (ph.phase === 'build' || ph.phase === 'specific') && !ph.recovery && sports.includes('run') && sports.includes('bike') && runStage == null) {
      const spec = W.runEasy(pc(false, null), 15); spec.title = 'Wechsel-Lauf 15 min (direkt nach dem Rad)'; spec.why = 'gewöhnt die Beine an den Wechsel vom Rad zum Laufen.';
      cands.push({ s: W.build(spec), pairDay: 'bikeLong', prio: 1.5 });
    }

    // 3) Verteilen: lange Einheiten auf lange Tage, harte nie nebeneinander, Kraft nicht vor harten Tagen
    const order = cands.sort((a, b) => a.prio - b.prio || (b.long ? 1 : 0) - (a.long ? 1 : 0) || (b.hard ? 1 : 0) - (a.hard ? 1 : 0) || (b.s.plannedMinutes || 0) - (a.s.plannedMinutes || 0));
    // Morgens vor Schule/Arbeit: dort nur eine kurze Einheit ohne Schwimmbad; nachmittags höchstens zwei, an Teamsport-Tagen nur die feste Krafteinheit
    const mo = profile.morning && (profile.morning.days || []).length ? profile.morning : null;
    const morningDay = (sl: any) => !!mo && mo.days.includes(sl.dow);
    const canMorning = (c: Cand, s: any) => !!mo && !c.fixed && !c.onDays && !['swim', 'strength', 'football'].includes(s.sport) && (s.plannedMinutes || 0) <= mo.maxMin && !(c.long || c.test);
    const legs = legsStrength;
    const grpSame = (x: any, y: any) => x.sport === 'strength' && y.sport === 'strength' ? (!x.area || !y.area || x.area === y.area) : x.sport === y.sport;
    const brickT = (x: any) => /^(Koppellauf|Wechsel-Lauf)/.test(x.title || '');
    const nearSame = (i: number, s: any, c: Cand) => !c.pairDay && !brickT(s) && s.sport !== 'football'
      && [...(i === 0 ? prevSunday : slots[i - 1].items.map(x => x.s)), ...(i < 6 ? slots[i + 1].items.map(x => x.s) : [])].some((y: any) => y && !y.race && !brickT(y) && grpSame(y, s));
    for (const c of order) {
      const s = c.s;
      const fits = (i: number, min: number) => slots[i].used + min <= slots[i].cap;
      const probe = { ...s, long: !!c.long || s.long, hard: !!c.hard || s.hard };
      const amFree = (i: number, sx: any) => morningDay(slots[i]) && canMorning(c, sx) && !slots[i].items.some(x => x.slot === 'am');
      const ok = (i: number, sx: any = s) => {
        const sl = slots[i];
        if (sl.race) return false;
        if (sl.cap <= 0) return false;
        if (c.onDays && !c.onDays.includes(sl.dow)) return false;
        if (s.sport === 'swim' && !sl.pool) return false;
        // harte Regeln der Person (Tage, Orte, Zeiträume) werden nie verletzt
        if (!c.fixed && evaluate(rules, probe, sl.date).hard.length) return false;
        const own = sl.items.filter(x => !x.fixed || x.s.sport === 'football');
        if (morningDay(sl)) {
          const pm = own.filter(x => x.slot !== 'am');
          const pmFree = (c.onDays ? true : !(sl.team || sl.game)) && pm.length < 2;
          if (!pmFree && !amFree(i, sx)) return false;
        } else if (own.length >= 2) return false;
        if (sl.items.some(x => x.s.sport === s.sport && !c.pairDay)) return false;
        if (c.hard) { if ((i === 0 ? prevSundayStrength : slots[i - 1].items.some(legs)) || sl.noHard || isHardDay(i) || prevHard(i) || isHardDay(i + 1) || (i + 1 < 7 && slots[i + 1].noHard && !!slots[i + 1].race) || (i > 0 && !!slots[i - 1].race) || (sl.team && !sl.game)) return false; }
        if (c.strength && !c.onDays) { if (isHardDay(i) || isHardDay(i + 1) || (i + 1 < 7 && (slots[i + 1].game || !!slots[i + 1].race)) || sl.noHard && sl.cap < 45) return false; }
        if (c.long && i + 1 < 7 && (slots[i + 1].game || !!slots[i + 1].race || slots[i + 1].items.some(x => x.test))) return false;
        if (c.long && sl.items.some(x => x.test)) return false;
        if ((c.long || c.hard || (c.strength && !c.onDays)) && (sl.game || sl.team)) return false;
        if (c.pairDay === 'bikeLong') return sl.items.some(x => x.long && x.s.sport === 'bike');
        return true;
      };
      const score = (i: number) => {
        const sl = slots[i]; let sc = sl.cap - sl.used;
        // harte Einheit so legen, dass für die nächste harte Einheit noch ein Tag mit Abstand bleibt (z. B. Rad Di, Lauf Do)
        if (c.hard && order.slice(order.indexOf(c) + 1).some(x => x.hard)) {
          const free = [...Array(7).keys()].filter(j => Math.abs(j - i) >= 2 && slots[j].cap >= 40 && !slots[j].race && !slots[j].game && !slots[j].team && !slots[j].noHard
            && !isHardDay(j - 1) && !isHardDay(j + 1) && !(j > 0 && slots[j - 1].game) && Math.abs(j - i) !== 1).length;
          sc += Math.min(2, free) * 120;
        }
        // Test nach einer Krankheit möglichst spät in der Woche
        if (c.test && afterIllness && wi === 0) sc += i * 120;
        if (c.long) sc += sl.dow === 0 || sl.dow === 6 ? 300 : 0;
        if (c.long && s.sport === 'run' && sl.dow === 0) sc += 50;
        if (c.long && s.sport === 'bike' && sl.dow === 6) sc += 50;
        if (c.strength) sc += sl.items.length ? 40 : 0;
        // gleiche Sportart nicht an zwei Tagen hintereinander (z. B. Schwimmen Di und Sa statt Sa und So)
        if ((i > 0 && slots[i - 1].items.some(x => x.s.sport === s.sport)) || (i < 6 && slots[i + 1].items.some(x => x.s.sport === s.sport))) sc -= 300;
        sc -= sl.items.length * 60;
        // Schwimmbad-Tage für das Schwimmen freihalten, solange noch Schwimmeinheiten fehlen
        if (s.sport !== 'swim' && sl.pool && !sl.items.some(y => y.s.sport === 'swim') && order.slice(order.indexOf(c) + 1).some(x => x.s.sport === 'swim')) sc -= 200;
        // weiche Regeln möglichst einhalten, Vorlieben bevorzugen
        sc -= evaluate(rules, probe, sl.date).soft.length * 400;
        rules.forEach(r => { if (prefers(r, probe, sl.date) === true) sc += 250; });
        return sc;
      };
      // Auftrag 15: gleiche Sportart (Kraft: gleiche Muskelgruppe) nie an zwei Tagen hintereinander, auch nicht So → Mo; nur wenn es nicht anders geht
      const spread = (i: number) => !nearSame(i, s, c);
      let idx = [...Array(7).keys()].filter(i => ok(i) && fits(i, s.plannedMinutes) && spread(i)).sort((a, b) => score(b) - score(a))[0];
      if (idx == null) idx = [...Array(7).keys()].filter(i => ok(i) && fits(i, s.plannedMinutes)).sort((a, b) => score(b) - score(a))[0];
      let placed = s;
      if (idx == null && !c.fixed && s.spec && !s.stage) {
        // passt nicht ganz: an einem freien Tag kürzer machen (mindestens 25 min)
        const roomy = (i: number) => ok(i) && slots[i].cap - slots[i].used >= 25;
        const opts0 = [...Array(7).keys()].filter(i => roomy(i) && spread(i));
        const opts = (opts0.length ? opts0 : [...Array(7).keys()].filter(roomy)).sort((a, b) => (slots[b].cap - slots[b].used) - (slots[a].cap - slots[a].used));
        if (opts.length) {
          idx = opts[0];
          const room = slots[idx].cap - slots[idx].used;
          const f = room / Math.max(1, s.plannedMinutes);
          let sp = W.scaleSpec(s.spec, f);
          for (let k = 0; k < 6 && W.totals(sp).min > room; k++) sp = W.scaleSpec(sp, 0.85);
          if (W.totals(sp).min <= room) placed = { ...W.build(sp) }; else idx = undefined as any;
        }
      }
      if (idx == null && c.easy) {
        // harte Einheit findet keinen Platz (z. B. wegen Regeln): lieber locker als gar nicht
        const e = W.build({ ...c.easy, why: c.easy.why || s.spec?.why, tip: s.spec?.tip });
        order.splice(order.indexOf(c) + 1, 0, { s: e, prio: c.prio });
        dropped.push(`Woche ${wi + 1}: ${s.title} wird locker (kein passender Tag für eine harte Einheit)`); hardLeft++; continue;
      }
      if (idx == null) { dropped.push(`Woche ${wi + 1}: ${s.title} passt zeitlich nicht`); if (c.hard) hardLeft++; continue; }
      // weiche Regel nicht einzuhalten: in der Einheit erklären
      const softHit = evaluate(rules, probe, slots[idx].date).soft;
      if (softHit.length) { const note = softNote(softHit[0], probe, slots, idx); placed = { ...placed, ruleNote: note, description: `${placed.description || ''}\nAusnahme: ${note}`.trim() }; }
      put(idx, { ...c, s: placed, slot: morningDay(slots[idx]) ? (amFree(idx, placed) ? 'am' : 'pm') : undefined });
    }
    // Erste Woche nach einer Krankheit: Ausdauer-Einheiten auf den Wochenumfang kürzen (Test und Lernstufen bleiben)
    if (wi === 0 && afterIllness) {
      const endu = slots.flatMap(sl => sl.items).filter(x => ['swim', 'bike', 'run'].includes(x.s.sport) && !x.test && !x.fixed && !x.s.stage && x.s.spec && (x.s.plannedMinutes || 0) > 30);
      const have = endu.reduce((a, x) => a + (x.s.plannedMinutes || 0), 0);
      const fixedEndu = slots.flatMap(sl => sl.items).filter(x => ['swim', 'bike', 'run'].includes(x.s.sport) && !endu.includes(x)).reduce((a, x) => a + (x.s.plannedMinutes || 0), 0);
      const want = Math.max(0, endurance - fixedEndu);
      if (have > want * 1.1 && have > 0) { const f = Math.max(0.75, want / have); endu.forEach(x => { const rb = W.rebuildScaled(x.s, f); if (rb) x.s = { ...x.s, ...rb, plannedKm: rb.plannedKm ?? undefined }; }); }
    }
    // Morgens-Einheiten: Uhrzeit für die Erinnerung am Vorabend und ein Hinweis im Text
    slots.forEach(sl => sl.items.forEach(x => {
      if (x.slot !== 'am') return;
      // morgens im Dunkeln lieber auf die Rolle, wenn es eine gibt
      if (x.s.sport === 'bike' && x.s.spec && !x.s.spec.ctx.indoor && (profile.bikes || []).some(b => b === 'trainer' || b === 'spin')) x.s = { ...x.s, ...W.build({ ...x.s.spec, ctx: { ...x.s.spec.ctx, indoor: true, bikeName: BIKE_LABEL[(profile.bikes || []).includes('trainer') ? 'trainer' : 'spin'] }, noDistance: true }), plannedKm: undefined };
      const when = `Morgens ${mo && mo.label ? mo.label : 'vor der Schule'}, höchstens ${mo ? mo.maxMin : 40} min.`;
      x.s = x.s.spec ? { ...x.s, slot: 'am', time: x.s.time || '06:30', spec: { ...x.s.spec, when }, description: W.describe({ ...x.s.spec, when }) } : { ...x.s, slot: 'am', time: x.s.time || '06:30', description: `${when}\n${x.s.description || ''}`.trim() };
    }));

    }
    // Freiwasser (Auftrag 11): in der eigenen Saison jede zweite Woche, vor einem Triathlon jede Woche eine Schwimmeinheit im Freiwasser
    if (!swimStage && repMax >= 200 && openWaterWeek(profile, mon, wi, goals, ph)) {
      const it = slots.flatMap(sl => sl.items.map(x => ({ sl, x }))).filter(({ x }) => x.s.sport === 'swim' && !x.test && !x.hard && !x.fixed && (x.s.plannedMinutes || 0) >= 25)
        .sort((a, b) => (+(b.sl.dow === 0 || b.sl.dow === 6)) - (+(a.sl.dow === 0 || a.sl.dow === 6)))[0];
      if (it) it.x.s = W.build(W.swimOpenWater(pc(false, null), it.x.s.plannedMinutes || 45));
    }
    // 4) Tage zusammenbauen
    let id = 0;
    const days = slots.map(sl => {
      // IDs eindeutig je Erstellung (Datum), damit ein neuer Plan nie Zustände alter Einheiten erbt
      const list = sl.items.map(x => x.frozen ? x.s : ({ id: `${idp}${wi + 1}-${DOW[sl.dow].toLowerCase()}-${++id}`, ...x.s, ...(x.fixed && x.s.sport === 'football' ? { fixed: true } : {}) }));
      // vor dem Start eines neuen Plans (neuer Nutzer mitten in der Woche): kein Ruhetag, sondern „vor dem Planstart“
      return { date: sl.date, dow: DOW[sl.dow], sessions: list.length ? list : [{ id: `${idp}${wi + 1}-${DOW[sl.dow].toLowerCase()}-rest`, sport: 'rest', title: sl.closed && !inp.frozen ? 'Vor dem Planstart' : 'Ruhetag' }] };
    });
    prevSundayHard = isHardDay(6); prevSundayStrength = slots[6].items.some(legsStrength); prevSunday = slots[6].items.map(x => x.s);
    if (!ph.recovery && ph.phase !== 'taper' && ph.phase !== 'race') { const lr = Math.max(0, ...slots.flatMap(sl => sl.items).filter(x => x.s.sport === 'run' && (x.long || x.s.long || /Langer Lauf/.test(x.s.title || ''))).map(x => x.s.plannedMinutes || 0)); if (lr) lastLR = lr; }
    const races = slots.filter(sl => sl.race).map(sl => ({ goalId: sl.race!.id, name: sl.race!.name, date: sl.date, priority: sl.race!.priority }));
    const otherRaces = races.filter(r => r.goalId !== A.id);
    const segRace = races.some(r => r.goalId === segGoal(wi).goalId && r.goalId !== A.id);
    // Blöcke: ein Block endet mit einer Erholungswoche. Bei einer Fortsetzung laufen Wochen- und Blockzählung weiter.
    blockWeek++;
    const wn = (cont ? cont.weekNo : 0) + wi + 1;
    const others2 = otherRaces.filter(r => r.goalId !== segGoal(wi).goalId);
    const extra = `${others2.length ? ', mit ' + others2.map(r => `${r.name} am ${DOW_LONG[dowOf(r.date)]}`).join(' und ') : ''}${races.some(r => r.goalId === A.id) || segRace ? ': Wettkampf!' : ''}`;
    const sgH = segGoal(wi); const toward = sgH.goalName || A.name;
    const headline = cont ? `Woche ${wn} · Block ${blockNo}, Woche ${blockWeek} · ${PHASE_NAME[ph.phase as keyof typeof PHASE_NAME]} → ${toward}${extra}` : `Woche ${wi + 1} von ${nTotal} · ${PHASE_NAME[ph.phase as keyof typeof PHASE_NAME]} → ${toward}${extra}`;
    const blk = { block: blockNo, blockWeek };
    if (ph.recovery) { blockNo++; blockWeek = 0; }
    weeks.push({
      weekNumber: wn, label: 'Woche ' + wn, headline, ...blk, target: { goalId: A.id, name: A.name, weeks: nTotal, n: wi + 1 }, races,
      startDate: mon, endDate: addDays(mon, 6), isRecoveryWeek: ph.recovery, reduced: otherRaces.some(r => r.priority === 'B') || dates.some(d => goals.some(g => g.date && d > g.date && daysBetween(g.date, d) <= easyAfterDays(g.type))) || undefined,
      entry: entryWeek[wi] || undefined, ...(part ? { partial: true, from } : {}), vorgabe: pat && WP.targetFor(pat, mon) ? true : undefined,
      phase: ph.phase, focus: ph.recovery ? 'Erholung: weniger Umfang, Körper verarbeitet das Training' : entryWeek[wi] ? 'Wiedereinstieg: locker, Umfang steigt in Stufen' : focusText(ph.phase, GOALS[A.type].group, sports.includes('strength')),
      important: patImportant || weekImportant(ph, otherRaces, wi, inp, runStage, swimStage, afterIllness), days
    });
  });

  // Auftrag 15: Plan-Check nur gewählte Sportarten und Abstand gleicher Sportarten, mit Korrektur (vor den Umfangsgrenzen, damit die danach stimmen)
  const keepIds = new Set<string>((inp.frozen || []).flatMap(f => f.sessions.map((s: any) => s && s.id).filter(Boolean)));
  const ruleFixes = [...repairSports(weeks, profile, { from: from || start }),
    ...repairSpacing(weeks, profile, { from: from || start, keep: (s: any) => keepIds.has(s.id),
      quality: (s: any, date: string, phase: string, from?: any) => {
        // die Qualität der gekürzten Einheit wandert in die lange Einheit daneben (Lauf: Tempo im langen Lauf, gleiche Dauer)
        const a = ageOf(profile, date); const noZ5q = a != null && (a < 18 || a >= 60);
        if (s.sport === 'run' && s.spec && !eff.runEasyOnly && runAllowed) {
          // genau der Qualitätsteil der gekürzten Einheit (Leiter läuft weiter), sonst der erste Schritt der Phase
          const st = from && from.spec && from.spec.steps ? from.spec.steps.find((x: any) => x.part === 'main' && (x.zone || 0) >= 3) : null;
          // passt der Block nicht in die lange Einheit, werden es weniger Wiederholungen
          const fitQ = (q: any) => { const r = { ...q }; const room = (s.plannedMinutes || 60) - 25; while (r.reps > 1 && r.reps * r.min + (r.reps - 1) * r.rest > room) r.reps--; if (r.reps * r.min > room) r.min = Math.max(5, Math.floor(room / 5) * 5); return r; };
          const rq0 = st ? { reps: st.reps || 1, min: st.min || 10, zone: st.zone, rest: st.restMin || 2, label: st.note || 'Tempo', why: from.spec.why || 'Qualität im langen Lauf.', kind: (st.zone >= 4 ? 'threshold' : 'tempo') as any }
            : K.runQualityStep(phase as any, A.type, 0, minor, { noZ5: noZ5q, baseWeek: 4, level: levelOf(profile) });
          if (!rq0) return null;
          const rq = fitQ(rq0);
          const b = W.build({ ...K.longRunWithQuality(s.spec.ctx, s.plannedMinutes || 60, rq), why: s.spec.why });
          return b.plannedMinutes <= (s.plannedMinutes || 60) + 2 ? { ...s, ...b, id: s.id, long: true, hard: true } : null;
        }
        // Rad: der harte Block der gekürzten Einheit in der langen Ausfahrt (nach dem ersten Drittel), gleiche Dauer
        const hs = from && from.spec && from.spec.steps ? from.spec.steps.find((x: any) => x.part === 'main' && (x.zone || 0) >= 3) : null;
        if (s.sport === 'bike' && s.spec && hs) {
          const total = s.plannedMinutes || 90; const hq = { ...hs, reps: hs.reps || 1 };
          while (hq.reps > 1 && hq.reps * (hq.min || 10) + (hq.reps - 1) * (hq.restMin || 3) > total - 35) hq.reps--;
          if ((hq.min || 10) * hq.reps > total - 35) hq.min = Math.max(5, Math.floor((total - 35) / 5) * 5);
          const qMin = hq.reps * (hq.min || 10) + (hq.reps - 1) * (hq.restMin || 3);
          const easy = Math.max(10, total - 15 - qMin); const before = Math.max(10, Math.round(easy * 0.4 / 5) * 5), after = Math.max(5, easy - before);
          const b = W.build({ sport: 'bike', kind: 'longq', ctx: s.spec.ctx, noDistance: s.spec.noDistance, why: `${from.spec.why || 'Qualität auf dem Rad.'} In der langen Ausfahrt: erst locker, dann der harte Block, locker zu Ende fahren.`,
            steps: [{ part: 'warm', min: 15, zone: 1 }, { part: 'main', min: before, zone: 2 }, hq, { part: 'main', min: after, zone: 2, note: 'locker zu Ende fahren, essen und trinken' }] } as any);
          return Math.abs(b.plannedMinutes - total) <= 5 ? { ...s, ...b, id: s.id, long: true, hard: true } : null;
        }
        const q = qualityFor(s, phase as any, { goalType: A.type, runEasyOnly: !!eff.runEasyOnly, runAllowed, minor, noZ5: () => noZ5q }, profile, 0, date);
        return q && q.hard && q.plannedMinutes >= (s.plannedMinutes || 0) - 5 ? { ...q, long: true } : null; }, dayCap: (date: string) => Math.min(dayCap(profile, dowOf(date)), dayLimit(rules, date).cap),
      allowed: (s: any, date: string) => !evaluate(rules, { ...s, long: !!s.long, hard: !!s.hard }, date).hard.length && dayLimit(rules, date).cap > 0 && !(s.sport === 'swim' && !allowedHard(rules, { sport: 'swim', place: 'pool' }, date)) }) ];
  // Umfang in einem Durchgang begrenzen: jede Woche höchstens +10 % (unter 18 +8 %) gegenüber der letzten normalen Woche
  const prevRef = cont && cont.lastNormalWeek ? [cont.lastNormalWeek] : [];
  enforceVolume(weeks, 1 + prog.incPct / 100, ownBudget, prevRef[0] || null);
  enforceLongRun(weeks, cont && cont.lastLongRun ? cont.lastLongRun : null);
  // was bleibt, bleibt genau so (auch nach den Kürzungen oben)
  if (midWeek && weeks[0]) { const orig: Record<string, any> = {}; (inp.frozen || []).forEach(f => f.sessions.forEach((s: any) => { if (s && s.id) { const { _done, _doneMin, ...o } = s; orig[s.id] = JSON.parse(JSON.stringify(o)); } }));
    const strip = (s: any) => { const { _done, _doneMin, ...o } = s; return JSON.parse(JSON.stringify(o)); };
    weeks[0].days.forEach((d: any) => { const f = (inp.frozen || []).find(x => x.date === d.date); d.sessions = d.date < from! && f && f.sessions.length ? f.sessions.map(strip) : d.sessions.map((s: any) => orig[s.id] || s); }); }
  // Auftrag 14: Plan-Check Intensität mit Korrektur, bevor die Person den Plan sieht
  const intensityFixes = repairIntensity(weeks, profile, today, { goalType: A.type, runEasyOnly: !!eff.runEasyOnly, runAllowed, from: from || start, minor,
    baseOffset: phases[0] && phases[0].phase === 'base' && cont && cont.weekNo ? Math.min(8, cont.weekNo) : 0, noZ5: (d: string) => { const a = ageOf(profile, d); return a != null && (a < 18 || a >= 60); } });
  const violations = validateWeeks(weeks, { minor, maxIncPct: prog.incPct }, prevRef);
  const age2 = goalAllowed(A.type, ageAtRace);
  if (!age2.ok) violations.push({ rule: 'age', msg: age2.msg! });
  inBlock.forEach(g => { const a = goalAllowed(g.type, profile.birthYear ? +g.date!.slice(0, 4) - profile.birthYear : null); if (!a.ok) violations.push({ rule: 'age', msg: `${g.name}: ${a.msg}` }); });

  const keyDates = [{ date: goalDate, label: A.name }, ...inBlock.map(g => ({ date: g.date!, label: g.name }))];
  weeks.forEach(w => w.days.forEach((d: any) => d.sessions.forEach((s: any) => { if (/test/i.test(s.title) && !s.race) keyDates.push({ date: d.date, label: s.title }); })));
  const phaseList: GenResult['phases'] = [];
  weeks.forEach(w => { const last = phaseList[phaseList.length - 1]; if (last && last.phase === w.phase) { last.to = w.endDate; last.weeks++; } else phaseList.push({ phase: w.phase, from: w.startDate, to: w.endDate, weeks: 1 }); });
  const shown = inp.maxWeeks ? weeks.slice(0, inp.maxWeeks) : weeks;
  const explain = planExplain(A as Goal, inBlock, later.filter(g => !pathGoals.includes(g)), phaseList, shown, profile, sports, rules, runStage, swimStage, conflicts);
  const hh = (m: number) => (Math.round(m / 6) / 10).toString().replace('.', ',');
  const fmtD = (d: string) => `${+d.slice(8)}.${+d.slice(5, 7)}.`;
  const patTargets = pat ? (pat.targets || []).filter(t => t.start >= start).sort((a, b) => a.start.localeCompare(b.start)) : [];
  explain.splice(1, 0, ...[
    cont ? `Der Plan setzt deinen bisherigen Plan fort: Woche ${cont.weekNo + 1} ist Block ${weeks[0] ? weeks[0].block : cont.blockNo + 1}, Woche ${weeks[0] ? weeks[0].blockWeek : 1}. Erledigte Einheiten, Werte und Scores bleiben.` : '',
    patTargets.length ? `Umfang nach deinen Vorgaben bis ${fmtD(addDays(patTargets[patTargets.length - 1].start, 6))}: ${patTargets.map(t => `${hh(t.hours * 60)} h${t.recovery ? ' (Erholung)' : ''}`).join(', ')}. Danach geht es im gleichen Muster weiter.`
      : startWhy ? `Umfang zum Start: ${hh(ownVols[0])} h eigenes Training pro Woche, ${startWhy}.` : '',
    `Aufbau: ${prog.buildWeeks} Wochen steigern (bis +${prog.incPct} % pro Woche), dann 1 Woche Erholung. Nach einer Erholungswoche geht es mindestens auf Höhe der letzten Aufbauwoche weiter.`,
    pat ? patternText(pat, profile) : '',
    inp.hoursUnknown ? 'Deine bisherigen Stunden kanntest du nicht: der Plan startet vorsichtig und passt sich nach 2 Wochen an dein echtes Training an.' : '',
    midWeek && !cont ? `Dein Plan beginnt ${from === today ? 'heute' : 'morgen'}; diese Woche ist deshalb kürzer.` : '',
    afterIllness && !patTargets.length ? 'Nach deiner Krankheit: die erste Woche ohne harte Einheiten' + (inp.needTests && inp.needTests.run ? ', der Test kommt erst am Ende der Woche.' : '.') : '',
    missingForGoal.length ? `Dein Ziel enthält auch ${missingForGoal.map(s => SPORT_DE[s]).join(' und ')}. Du hast es nicht gewählt, deshalb plant die App es nicht ein. Willst du es trainieren: Mehr → Profil und Ziele → Sportarten.` : ''
  ].filter(Boolean));
  // Weg zum Hauptziel mit Terminen; Platzhalter klar gekennzeichnet
  const way = goals.filter(g => g.date! >= start).sort((a, b) => a.date!.localeCompare(b.date!));
  if (way.length > 1 || placed.length) explain.push(`Dein Weg: ${way.map(g => `${g.name} ${fmtD(g.date!)}${String(g.date).slice(2, 4)}${(g as any).placeholder ? ' (Platzhalter)' : ''}`).join(' → ')}.${placed.length ? ' Platzhalter richten sich nach Reihenfolge, Saison und deiner Form. Trag das echte Datum beim Ziel ein, dann plant die App neu.' : ''}`);
  explain.splice(1, 0, `Zyklen: ${cycleText(macro, start)}`);
  const plan = {
    meta: { timeline: timelineOf(start, macro, anchors, []), placeholders: placed.map(g => ({ id: g.id, name: g.name, date: g.date })), generated: true, generatedAt: today, ...(inp.hoursUnknown ? { calibrateAt: addDays(from || start, 14) } : {}), goalId: A.id, event: A.name, eventDate: goalDate, goalIds: allGoals.map(g => g.id), blockName: `Block ${shown[0].block} · ${PHASE_LABEL[shown[0].phase as Phase]}`, runIntervalsAllowed: inp.runIntervalsAllowed ?? true, phases: phaseList, explain, totalWeeks: nTotal, plannedUntil: shown[shown.length - 1].endDate, progression: prog, conflicts, ...(pat ? { pattern: true } : {}), ...(intensityFixes.length ? { intensityFixes: intensityFixes.slice(0, 40) } : {}), ...(ruleFixes.length ? { ruleFixes: ruleFixes.slice(0, 40) } : {}), intensityOpts: { runEasyOnly: !!eff.runEasyOnly, runAllowed } },
    weeks: shown, keyDates,
    zonePercents: HR_ZONES.map(z => ({ zone: z.zone, label: z.label, low: z.low, high: z.high }))
  };
  return { plan, phases: phaseList, violations, dropped, conflicts, summary: planSummary(plan, inp, A as Goal, inBlock, phaseList, volumes, sports, minor, runStage, swimStage) };
}

/* Zyklen kurz: „Grundlage bis 21.2. → Aufbau bis 9.5. → … → Sprint-Triathlon 13.6.“ (die nächsten zwei Ziele) */
function cycleText(macro: WeekPhase[], start: string): string {
  const parts: string[] = []; let goals = 0;
  for (let i = 0; i < macro.length && goals < 2; i++) {
    const p = macro[i]; const nx = macro[i + 1];
    if (nx && nx.phase === p.phase && nx.goalId === p.goalId && !(p.phase === 'race')) continue;
    const end = addDays(start, i * 7 + 6);
    if (p.phase === 'race') { parts.push(`${p.goalName} ${+end.slice(8)}.${+end.slice(5, 7)}.`); goals++; }
    else parts.push(`${PHASE_NAME[p.phase]} bis ${+end.slice(8)}.${+end.slice(5, 7)}.`);
  }
  return parts.join(' → ') + '.';
}

/* Erklärung des festen Wochenaufbaus */
const ROLE_TXT: Record<string, string> = { swim: 'Schwimmen', lower: 'Kraft Unterkörper', upper: 'Kraft Oberkörper', long: 'lang', key: 'Schlüsseleinheit', easy: 'locker', brick: 'Koppellauf' };
function patternText(p: NonNullable<Profile['weekPattern']>, profile: Profile): string {
  const days = [1, 2, 3, 4, 5, 6, 0].map(dow => {
    const items = p.slots.filter(x => x.dow === dow).map(x => x.role === 'long' ? (x.sport === 'run' ? 'langer Lauf' : 'lange Ausfahrt') : x.role === 'key' ? 'Rad (Sweet Spot ab ' + (x.keyFrom ? `${+x.keyFrom.slice(8)}.${+x.keyFrom.slice(5, 7)}.` : 'Aufbau') + ')' : x.role === 'easy' ? (x.sport === 'run' ? 'lockerer Lauf' : 'lockeres Rad') : ROLE_TXT[x.role]);
    const ts = profile.teamSport;
    if (ts && (ts.trainingDays || []).includes(dow)) items.unshift(ts.name || 'Teamsport');
    if (ts && (ts.gameDays || []).includes(dow)) items.push('Spiel');
    return items.length ? `${DOW[dow]} ${items.join(' + ')}` : '';
  }).filter(Boolean);
  return `Fester Wochenaufbau: ${days.join(', ')}. Langer Lauf höchstens +${p.longRunStep || 10} min pro Woche${p.longRunMax ? `, vorerst nicht über ${p.longRunMax} min` : ''}.${p.testEveryWeeks ? ` Tests alle ${p.testEveryWeeks} Wochen in der Erholungswoche.` : ''}`;
}

/* Freiwasser-Woche? Saison (Monate) aus dem Profil, sonst Juni bis September; jede zweite Woche, in den 6 Wochen vor einem Triathlon jede Woche */
export function openWaterWeek(p: Profile, mon: string, wi: number, goals: Goal[], ph: { phase: Phase; recovery: boolean }): boolean {
  const sk = p.skills || {};
  if (!sk.openWater || ph.phase === 'race') return false;
  const m = +addDays(mon, 3).slice(5, 7), from = sk.openWaterFrom || 6, to = sk.openWaterTo || 9;
  if (!(from <= to ? m >= from && m <= to : m >= from || m <= to)) return false;
  const triSoon = goals.some(g => g.date && g.date >= mon && g.date <= addDays(mon, 42) && GOALS[g.type] && GOALS[g.type].group === 'tri' && g.type !== 'duathlon');
  return triSoon || wi % 2 === 0;
}

/* Schlüsseleinheit Laufen passend zum Ziel */
function keyRun(ctx: W.PaceCtx, type: GoalType, phase: Phase, wi: number): W.Spec {
  if (phase === 'build' || phase === 'taper') return W.runIntervals(ctx, phase === 'taper' ? 4 : 5, 3, 2, 4);
  if (type === 'run_half' || type === 'tri_middle') return W.runTempo(ctx, Math.min(30, 15 + wi), 3);
  if (type === 'run_marathon' || type === 'tri_long') return W.runTempo(ctx, Math.min(40, 20 + wi), 3);
  if (type === 'run_5k') return W.runIntervals(ctx, 6, 2, 2, 5);
  return W.runIntervals(ctx, 4, 6, 2, 4);
}

const ownMin = (w: any, sport?: string) => sport ? weekMinutes(w, sport) : ownWeekMinutes(w);
function enforceVolume(weeks: any[], maxInc: number, budgetMin = Infinity, prev: any = null) {
  const scaleWeek = (w: any, sport: string | undefined, f: number) => w.days.forEach((d: any) => { d.sessions = d.sessions.map((s: any) => {
    if (s.fixed || s.race || !s.plannedMinutes || (sport && s.sport !== sport) || s.sport === 'rest' || (s.spec && s.spec.title)) return s;
    if (s.spec && !s.stage) { const r = W.rebuildScaled(s, f); return r ? { ...s, ...r, plannedKm: r.plannedKm ?? undefined } : s; }
    return s;
  }); });
  // Zeitbudget pro Woche (ohne feste Termine wie Teamsport und Wettkampf)
  const own = (w: any) => w.days.reduce((a: number, d: any) => a + d.sessions.filter((s: any) => !s.fixed && !s.race && s.sport !== 'rest' && !s.cancelled).reduce((b: number, s: any) => b + (s.plannedMinutes || 0), 0), 0);
  for (const w of weeks) for (let guard = 0; guard < 6 && own(w) > budgetMin + 5; guard++) scaleWeek(w, undefined, Math.max(0.5, budgetMin / own(w) * 0.98));
  const all = prev ? [prev, ...weeks] : weeks;
  for (let i = 1; i < all.length; i++) {
    // Wochen mit eigener Vorgabe bleiben, wie sie vorgegeben sind
    if (all[i].vorgabe) continue;
    // Bezug: letzte normale Woche (nicht Erholung, Wiedereinstieg oder Woche mit Wettkampf)
    let j = i - 1; while (j > 0 && (all[j].isRecoveryWeek || all[j].reduced || all[j].entry || all[j].partial || all[j].phase === 'taper' || all[j].phase === 'race' || (all[j].races || []).length)) j--;
    // angebrochene Woche (Plan ab heute) ist kein Bezug für die Steigerung
    if (all[j].partial || all[i].partial) continue;
    for (const sport of [undefined, 'run'] as (string | undefined)[]) {
      for (let guard = 0; guard < 6; guard++) {
        const ref = ownMin(all[j], sport), cur = ownMin(all[i], sport);
        if (ref < (sport ? 40 : 60) || cur <= ref * maxInc) break;
        const fixed = all[i].days.reduce((a: number, d: any) => a + d.sessions.filter((s: any) => (s.fixed || s.stage) && !s.race && s.sport !== 'football' && !s.cancelled && (!sport || s.sport === sport)).reduce((b: number, s: any) => b + (s.plannedMinutes || 0), 0), 0);
        const f = Math.max(0.3, (ref * maxInc - fixed) / Math.max(1, cur - fixed) * 0.98);
        const before = ownMin(all[i], sport);
        scaleWeek(all[i], sport, f);
        if (ownMin(all[i], sport) >= before) {
          const cand = all[i].days.flatMap((d: any) => d.sessions).filter((x: any) => x.spec && !x.stage && !x.fixed && !x.race && !x.long && !/^Langer/.test(x.title || '') && (!sport || x.sport === sport) && ['run', 'bike', 'swim'].includes(x.sport) && x.plannedMinutes > 25).sort((a: any, b: any) => b.plannedMinutes - a.plannedMinutes)[0];
          const rb = cand ? W.rebuildScaled(cand, (cand.plannedMinutes - 5) / cand.plannedMinutes) : null;
          if (rb && rb.plannedMinutes < cand.plannedMinutes) Object.assign(cand, rb, { plannedKm: rb.plannedKm ?? undefined }); else break;
        }
      }
    }
  }
}
/* Nach allen Kürzungen: langer Lauf höchstens +10 min gegenüber dem letzten langen Lauf einer Aufbauwoche (auch in Erholungswochen nicht länger) */
function enforceLongRun(weeks: any[], start: number | null) {
  let last = start;
  for (const w of weeks) {
    const runs = w.days.flatMap((d: any) => d.sessions.filter((s: any) => s.sport === 'run' && !s.race && !s.stage && (s.long || /^Langer Lauf/.test(s.title || ''))));
    for (const s of runs) {
      if (last != null && s.plannedMinutes > last + 10 && s.spec) { const rb = W.rebuildScaled(s, (last + 10) / s.plannedMinutes); if (rb && rb.plannedMinutes <= last + 10) Object.assign(s, rb, { plannedKm: rb.plannedKm ?? undefined }); }
    }
    const lr = Math.max(0, ...runs.map((s: any) => s.plannedMinutes || 0));
    if (lr && !w.isRecoveryWeek && w.phase !== 'taper' && w.phase !== 'race') last = lr;
  }
}
function focusText(p: Phase, group: string, strength = true): string {
  return ({ base: strength ? 'Grundlage: viel locker, Technik, Kraft' : 'Grundlage: viel locker, Technik', build: 'Aufbau: Intervalle dazu, lange Einheiten wachsen', specific: group === 'tri' ? 'Wettkampfnah: Koppeltraining und Renntempo' : 'Wettkampfnah: Renntempo üben', taper: 'Tapering: weniger Umfang, kurz und knackig', race: 'Wettkampfwoche: frisch werden' } as Record<Phase, string>)[p];
}
function weekImportant(ph: { phase: Phase; recovery: boolean }, races: any[], wi: number, inp: GenInput, runStage: number | null, swimStage: any, after = false): string {
  if (races.length) return races.map(r => r.priority === 'C' ? `${r.name} ist ein Trainingswettkampf: zügig, aber nicht am Limit.` : `${r.name}: die Tage davor ruhiger, danach 2-3 Tage locker.`).join(' ');
  if (wi <= 1 && inp.needTests) return wi === 0 && after ? 'Erste Woche nach der Krankheit: alles locker. Der Test am Ende der Woche bringt deine Zonen auf den neuen Stand.' : 'Der Test diese Woche bringt deine Zonen auf den neuen Stand.';
  if (ph.recovery) return 'Weniger ist diese Woche mehr: der Körper wird in der Pause stärker.';
  if (runStage != null || swimStage) return 'Die Lernstufen steigen erst, wenn die aktuelle Stufe klappt. Trag deine Einheiten ein oder lass sie von der Uhr übernehmen.';
  return ({ base: 'Viel locker, die harte Einheit kontrolliert.', build: 'Die harten Einheiten zählen: ausgeruht hingehen.', specific: 'Renntempo üben und gut erholen.', taper: 'Weniger Umfang, die Frische kommt.', race: 'Frisch bleiben, nichts Neues ausprobieren.' } as Record<Phase, string>)[ph.phase];
}

/* Kurze Erklärung oben im Plan (Auftrag 4 F3) */
function planExplain(A: Goal, inBlock: Goal[], later: Goal[], phases: GenResult['phases'], weeks: any[], p: Profile, sports: SportKey[], rules: Rule[], runStage: number | null, swimStage: any, conflicts: Conflict[]): string[] {
  const out: string[] = [];
  out.push(`Phasen bis ${A.name}: ${phases.map(x => `${PHASE_LABEL[x.phase]} (${x.weeks} ${x.weeks === 1 ? 'Woche' : 'Wochen'})`).join(' → ')}.`);
  if (inBlock.length) out.push(`Unterwegs: ${inBlock.map(g => `${g.name} (${g.priority === 'B' ? 'B: kurzes Tapering, danach Erholung' : 'C: als Training'})`).join(', ')}.`);
  if (later.length) out.push(`Danach geplant: ${later.map(g => g.name).join(', ')}. Dafür kommt ein neuer Block.`);
  const counts = (sp: string) => { const c = weeks.slice(0, Math.min(4, weeks.length)).map(w => w.days.reduce((a: number, d: any) => a + d.sessions.filter((s: any) => s.sport === sp && !s.race).length, 0)); return c.length ? Math.round(c.reduce((a, b) => a + b, 0) / c.length) : 0; };
  const why: Record<string, string> = { run: A.type.startsWith('run') ? 'dein Ziel ist ein Lauf' : 'Laufen kommt im Ziel vor', bike: A.type === 'bike_event' ? 'dein Ziel ist auf dem Rad' : 'Rad trainiert viel Ausdauer bei wenig Belastung für die Gelenke', swim: swimStage ? 'zuerst Technik lernen' : 'Technik braucht Regelmäßigkeit', strength: 'schützt vor Verletzungen' };
  out.push('So oft pro Woche: ' + sports.map(s => `${SPORT_DE[s]} ${counts(s)}× (${why[s] || ''})`).join(', ') + (p.teamSport ? `, dazu ${p.teamSport.name || 'Teamsport'}` : '') + '.');
  if (runStage != null) out.push('Laufen startet mit Lauf-Geh-Wechsel und steigt eine Stufe, sobald die letzte geklappt hat.');
  if (swimStage) out.push(swimStage.ladder === 'swimBreast' ? 'Schwimmen: zuerst Brust plus Kraul-Technik, dann Schritt für Schritt Kraul.' : 'Schwimmen: Kraul lernen in Stufen, nie längere Strecken als du schon kannst.');
  const u = rules.filter(r => r.kind !== 'info');
  if (u.length) out.push('Deine Regeln: ' + [...new Set(u.map(ruleText))].join('; ') + '.');
  conflicts.forEach(c => out.push(c.text));
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
    `Etwa 80 % sind locker, nur 1-2 Einheiten pro Woche sind hart. Nie zwei harte Tage hintereinander${ts ? `, ${ts.name || 'Teamsport'} ist eingeplant${(ts.gameDays || []).length ? ' und vor Spieltagen gibt es nichts Hartes' : ''}` : ''}.`,
    `Alle ${minor || inp.profile.medicalCaution ? 3 : 4} Wochen kommt eine Erholungswoche, vor dem Wettkampf wird der Umfang reduziert, damit du frisch an den Start gehst.`
  ];
}

/* Sauberer Übergang, wenn sich Ziel oder Alltag ändern: vergangene Wochen bleiben, ab nächstem Montag gilt der neue Plan.
   Was zum Bisherigen gehört, bleibt erhalten: Score-Kalibrierung und Startwerte (meta), Verlauf (seed…), Wochenzählung. */
const SEED_KEYS = ['seedTrend', 'seedSessions', 'seedMilestones', 'seedIllness', 'seedMetrics'];
const weekEnd = (w: any) => w.endDate || addDays(w.startDate, 6);
export const mondayOf = (d: string) => addDays(d, -((dowOf(d) + 6) % 7));
/* from (Auftrag 11): ab diesem Tag gilt der neue Plan; die Woche davor (ab Montag) kommt schon aus dem neuen Plan (mit den Tagen, die bleiben) */
export function transitionPlan(oldPlan: any, newPlan: any, today: string, from?: string | null): any {
  const cut = from ? mondayOf(from) : nextMonday(addDays(today, 1));
  const keep = (oldPlan && oldPlan.weeks || []).filter((w: any) => weekEnd(w) < cut);
  const offset = keep.reduce((m: number, w: any) => Math.max(m, +w.weekNumber || 0), 0);
  const weeks = [...keep, ...newPlan.weeks.map((w: any, i: number) => ({ ...w, weekNumber: offset + i + 1, label: 'Woche ' + (offset + i + 1) }))];
  const om = (oldPlan && oldPlan.meta) || {};
  const history = [...(om.history || [])];
  if (om.blockName && keep.length && !history.some((h: any) => h.blockName === om.blockName)) history.push({ blockName: om.blockName, from: keep[0].startDate, to: weekEnd(keep[keep.length - 1]) });
  const seeds: any = {};
  SEED_KEYS.forEach(k => { if (oldPlan && oldPlan[k] !== undefined && newPlan[k] === undefined) seeds[k] = oldPlan[k]; });
  return { ...seeds, ...newPlan, weeks, meta: { ...om, ...newPlan.meta, previousBlock: om.blockName || null, history } };
}
/* Wo steht ein vorhandener Plan? Letzte Woche vor dem nächsten Montag, Block, Aufbauwochen seit der letzten Erholung, Umfang der letzten normalen Woche */
export function continuationOf(oldPlan: any, today: string, state?: any, from?: string | null): GenInput['continueFrom'] {
  const cut = from ? mondayOf(from) : nextMonday(addDays(today, 1));
  const keep = (oldPlan && oldPlan.weeks || []).filter((w: any) => weekEnd(w) < cut);
  const cur = from ? (oldPlan && oldPlan.weeks || []).find((w: any) => w.startDate <= from && weekEnd(w) >= from) : null;
  if (!keep.length) return null;
  const last = keep[keep.length - 1];
  const m = /Block (\d+)/i.exec(String((oldPlan.meta || {}).blockName || ''));
  const hist = ((oldPlan.meta || {}).history || []).find((h: any) => h && h.from <= last.startDate && h.to >= last.startDate);
  const hm = hist ? /Block (\d+)/i.exec(String(hist.blockName || '')) : null;
  const blockNo = +last.block || (hm ? +hm[1] : m ? +m[1] : 1);
  let built = 0; for (let i = keep.length - 1; i >= 0 && !keep[i].isRecoveryWeek; i--) built++;
  const own = (w: any) => (w.days || []).reduce((a: number, d: any) => a + (d.sessions || []).filter((s: any) => s && s.sport !== 'rest' && s.sport !== 'football' && !s.cancelled && !s.race).reduce((b: number, s: any) => b + (s.plannedMinutes || 0), 0), 0);
  const normal = [...keep].reverse().find((w: any) => !w.isRecoveryWeek && !w.reduced && !w.entry);
  const list = (w: any) => (w.days || []).flatMap((d: any) => (d.sessions || []).filter((s: any) => s && !s.cancelled && !s.race && ['swim', 'bike', 'run', 'strength'].includes(s.sport)));
  // erledigt: nur wenn die Woche überhaupt abgehakt wurde (mindestens 60 % der Einheiten erledigt oder ausgelassen), sonst fehlen nur Daten
  let doneMin: number | null = null, tracked = false;
  if (normal && state && state.sessions) {
    const ss = list(normal); const st = (s: any) => state.sessions[s.id] || {};
    const sick = (state.illnessPeriods || []).some((p: any) => p && p.start <= weekEnd(normal) && (!p.end || p.end >= normal.startDate));
    // krank in dieser Woche: ausgelassen heißt nicht „zu viel“, dann zählt der Plan
    tracked = !sick && ss.length > 0 && ss.filter((s: any) => st(s).completed || st(s).skipped).length >= ss.length * 0.6;
    doneMin = ss.filter((s: any) => st(s).completed).reduce((a: number, s: any) => a + (+((st(s).metrics || {}).min) || s.plannedMinutes || 0), 0);
    const extra = Object.entries(state.customWorkouts || {}).filter(([d]) => d >= normal.startDate && d <= weekEnd(normal)).flatMap(([, l]: any) => l || []).filter((c: any) => c && c.sport !== 'football');
    doneMin += extra.reduce((a: number, c: any) => a + (+((c.metrics || {}).min) || c.plannedMinutes || 0), 0);
  }
  const maxOf = (sport: string) => normal ? Math.max(0, ...list(normal).filter((s: any) => s.sport === sport).map((s: any) => s.plannedMinutes || 0)) || null : null;
  const swims = normal ? list(normal).filter((s: any) => s.sport === 'swim').map((s: any) => s.plannedMinutes || 0) : [];
  return { weekNo: keep.reduce((mx: number, w: any) => Math.max(mx, +w.weekNumber || 0), 0), blockNo, builtSinceRecovery: built, lastNormalMin: normal ? own(normal) || null : null, blockName: (oldPlan.meta || {}).blockName || null,
    lastNormalDoneMin: doneMin, lastNormalTracked: tracked, lastNormalWeek: normal || null, lastLongRun: maxOf('run'), lastLongBike: maxOf('bike'), lastSwim: swims.length ? Math.round(swims.reduce((a: number, b: number) => a + b, 0) / swims.length) : null, curRecovery: !!(cur && cur.isRecoveryWeek) };
}
export { weekMinutes };

/* Höchstdauer je Sportart aus harten Regeln (z. B. „Schwimmen höchstens 45 min“) */
function sportMax(rules: Rule[], sport: string): number | null {
  const m = rules.filter(r => r.kind === 'maxDay' && r.strength === 'hard' && r.sport === sport && !(r.days || []).length).map(r => r.minutes || 0).filter(x => x > 0);
  return m.length ? Math.min(...m) : null;
}
const SPORT_UNIT: Record<RuleSport, [string, string]> = { run: ['Lauf', 'Läufe'], bike: ['Radeinheit', 'Radeinheiten'], swim: ['Schwimmeinheit', 'Schwimmeinheiten'], strength: ['Krafteinheit', 'Krafteinheiten'] };
const DOW_FULL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
function noteConflict(list: Conflict[], rules: Rule[], slots: any[], sport: RuleSport, want: number, days: number[]) {
  if (list.some(c => c.sport === sport)) return;
  const can = days.length;
  const where = daysText(days) === 'Sa und So' ? 'am Wochenende' : can ? 'an ' + daysText(days) : '';
  // ein Tag, der nur wegen einer „nur an“-Regel fehlt (nicht ausdrücklich verboten, mit Zeit)
  const blockedOnlyBy = (sl: any) => { const ev = evaluate(rules.filter(r => r.strength === 'hard'), { sport, place: sport === 'swim' ? 'pool' : undefined }, sl.date).hard; return ev.length > 0 && ev.every(r => r.kind === 'onlyDays' || (r.kind === 'placeDays' && !!r.placeOnly)); };
  const dist = (d: number) => Math.min(7, ...days.map(x => Math.min(Math.abs(x - d), 7 - Math.abs(x - d))));
  const extra = slots.filter(sl => sl.cap > 0 && !sl.race && !days.includes(sl.dow) && blockedOnlyBy(sl)).sort((a, b) => b.cap - a.cap || dist(a.dow) - dist(b.dow))[0];
  const [one, many] = SPORT_UNIT[sport];
  const options: Conflict['options'] = [];
  if (can) options.push({ id: 'fewer', n: can, label: `${can} ${can === 1 ? one : many} ${where}, dafür ${can === 1 ? 'länger' : 'einer länger'}` });
  if (extra) options.push({ id: 'allow', day: extra.dow, label: `${SPORT_NAME[sport]} auch am ${DOW_FULL[extra.dow]} erlauben?` });
  list.push({ id: 'freq-' + sport, sport, want, can, days, options,
    text: can ? `Du möchtest ${want}× ${SPORT_NAME[sport]} pro Woche, deine Regeln erlauben ${SPORT_NAME[sport]} nur ${daysText(days)}. Der Plan plant deshalb ${can}× ein.` : `${SPORT_NAME[sport]} passt an keinem Tag zu deinen Regeln und Zeiten.` });
}
/* Erklärung, warum eine weiche Regel nicht eingehalten werden konnte */
function softNote(r: Rule, s: any, slots: any[], idx: number): string {
  const here = DOW_FULL[slots[idx].dow];
  const what = r.what === 'long' || (r.kind === 'prefer' && s.long) ? (s.sport === 'run' ? 'Langer Lauf' : s.sport === 'bike' ? 'Lange Ausfahrt' : 'Lange Einheit') : (s.title || 'Einheit');
  const wish = (r.kind === 'prefer' || r.kind === 'onlyDays') ? (r.days || []) : [];
  const raceDay = slots.find(sl => wish.includes(sl.dow) && sl.race);
  const noTime = slots.find(sl => wish.includes(sl.dow) && sl.cap <= 0);
  const reason = raceDay ? `weil ${DOW_FULL[raceDay.dow]} dein Rennen ist` : noTime ? `weil am ${DOW_FULL[noTime.dow]} keine Zeit eingeplant ist` : r.kind === 'neverDays' ? 'weil an den anderen Tagen kein Platz mehr war' : 'weil an deinen Wunschtagen kein Platz mehr war';
  return `${what} ausnahmsweise am ${here}, ${reason}.`;
}
