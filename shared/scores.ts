import { actualMetrics } from './results';
/* Leistungs-Scores je Sportart (Auftrag 12): feste Leistungsskala 0-100 statt „Anteil am Ziel“.
   20 = Einsteiger, 50 = solider Hobbysportler, 70 = stark, 85 = Spitzenamateur, 100 = Elite; alters- und geschlechtsbereinigt, wenn bekannt.
   Kein Abschneiden bei 100 mehr: wer besser wird, steigt weiter.
   Hauptteil je Sport: Laufen Schwellen-Pace (VDOT), Rad FTP in W/kg (ohne Watt: Schwellen-Geschwindigkeit flach), Schwimmen CSS
   (vorher aus 25-m-Zeit oder Brust), Kraft Regelmäßigkeit und Steigerung. Effizienz, längste Einheit, Entkopplung und Technik zählen weiter.
   Drei Marken statt „Ziel“: „Für dein Ziel nötig“ (Ankommen), „Nächstes Etappenziel“ (3-5 % besser in etwa 8 Wochen, nach dem
   eigenen Fortschritt) und „Wunschzeit“ (falls eingetragen). Jede Einheit, jeder Test und jeder Wert rechnet neu; „Warum?“ nennt die
   gezählten Einheiten, wie sicher der Wert ist und was am meisten bringt.
   Bedingungen werden herausgerechnet: Hitze über 22 °C, Höhenmeter, Rollentrainer. Werte unter Krankheit zählen weniger. */
import type { Activity } from './activity/analyze';
import { intervalsOf } from './activity/structure';
import type { Profile } from './profile';
import { ageOf } from './profile';
import type { Goal } from './goals';
import { requirementFor, type Requirement } from './sports';
import { addDays, illnessAt, planDays, isIntervals } from './core';
import { vdotFromThreshold } from './vdot';
import { loadSeriesFromDaily } from './load';
import { bikeSpeedsOf, kindOf, powerFracFromHr, thrSpeedFromRide, GRAVEL_F, BIKE_KIND_LABEL, type BikeKind } from './bikespeed';
import { runFilter, obsSd, rpeFrac, type FObs, type FResult } from './scorefilter';

export type ScoreSport = 'run' | 'bike' | 'swim' | 'strength';
export interface ScoreMark { kind: 'need' | 'next' | 'wish'; label: string; raw: number; text: string; pos: number; done: boolean }
export interface ScorePart {
  key: string; label: string; sub: number | null; weight: number; value: string; target: string;
  raw: number | null; lowerBetter?: boolean; marks: ScoreMark[];
}
export interface Counted { date: string; title: string; value: string; manual: boolean }
export interface Gain { key: string; text: string; delta: number }
export interface StageGoal { target: number; from: number; set: string }
export interface SportScore {
  sport: ScoreSport; score: number; measured: number | null; confidence: number; confText: string; level: string;
  /** Auftrag 19: Bereich der Schätzung (± Punkte) und Text dazu („± 4, wenig Daten“) */
  range: number; rangeText: string;
  parts: ScorePart[]; trend: { date: string; score: number }[]; why: string[]; basis: string;
  counted: Counted[]; gains: Gain[]; stages: Record<string, StageGoal>; reached: { key: string; text: string }[];
}
export interface FormScore { ctl: number | null; target: number; score: number; bySport: Partial<Record<ScoreSport, { ctl: number; target: number }>> }
export interface ScoreInput {
  today: string;
  activities: Activity[];
  trend: any[];
  illness: any[];
  profile: Profile;
  goal: Goal | null;
  /** alte Startwerte (Skala bis Auftrag 11); werden nicht mehr gebraucht, der Startwert kommt aus den Schwellen im Profil */
  calibration?: { date: string; scores: Record<string, number> } | null;
  manualAdjust?: Record<string, number>;
  /** Tagesbelastung je Sport (für CTL je Sport) */
  loadsBySport?: Record<string, Record<string, number>>;
  settings?: any;
  /** gespeicherte Etappenziele je Teil („run.thr“) */
  stages?: Record<string, StageGoal> | null;
}

const clamp = (x: number, a = 0, b = 100) => Math.max(a, Math.min(b, x));
const mmss = (s: number) => { s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const de = (v: number, d = 1) => (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d).replace('.', ',');
const WINDOW = 42, RECENT = 21;
const SPORT_LABEL: Record<ScoreSport, string> = { run: 'Laufen', bike: 'Rad', swim: 'Schwimmen', strength: 'Kraft' };

/* ---------- Feste Skalen (Mann, 18-35 Jahre); stückweise linear, über die Enden hinaus weiter (kein Abschneiden) ---------- */
export const SCALES = {
  /* VDOT: 10 km in 70 min ≈ 27 → 20, 48 min ≈ 42 → 50, 39 min ≈ 52 → 70, 33 min ≈ 63 → 85, 28 min ≈ 75 → 100 */
  runVdot: [[15, 2], [20, 8], [27, 20], [42, 50], [52, 70], [63, 85], [75, 100]] as [number, number][],
  bikeWkg: [[1.0, 3], [2.0, 20], [3.0, 50], [3.8, 70], [4.5, 85], [5.8, 100]] as [number, number][],
  /* Schwellen-Geschwindigkeit Rennrad flach (Gravel wird umgerechnet), passend zu den W/kg */
  bikeKmh: [[18, 2], [22, 8], [28, 20], [32, 50], [35.5, 70], [37.5, 85], [40.5, 100]] as [number, number][],
  /* CSS in s/100 m (kleiner = besser) */
  swimCss: [[68, 100], [82, 85], [95, 70], [110, 50], [150, 20], [200, 4], [240, 0]] as [number, number][],
  swimCont: [[0, 0], [12.5, 4], [25, 8], [50, 13], [100, 20], [200, 28], [400, 38], [800, 50], [1500, 62], [2000, 68], [3800, 80], [6000, 90]] as [number, number][],
  swimDps: [[0.6, 0], [0.8, 5], [1.0, 15], [1.3, 35], [1.6, 55], [1.9, 72], [2.2, 87], [2.5, 100]] as [number, number][],
  longRun: [[0, 0], [20, 10], [30, 18], [45, 30], [60, 40], [90, 55], [120, 70], [150, 82], [180, 90], [210, 95]] as [number, number][],
  longRide: [[0, 0], [30, 12], [60, 28], [90, 42], [120, 52], [180, 66], [240, 77], [300, 86], [360, 92]] as [number, number][],
  /* Entkopplung in % (kleiner = besser) */
  dec: [[-2, 100], [0, 98], [1, 92], [3, 80], [5, 65], [7, 50], [10, 30], [15, 10], [20, 0]] as [number, number][],
  strengthWeek: [[0, 0], [0.5, 20], [1, 40], [1.5, 55], [2, 68], [2.5, 78], [3, 86], [4, 95]] as [number, number][],
  strengthProg: [[-0.2, 10], [0, 40], [0.1, 60], [0.25, 80], [0.5, 95]] as [number, number][]
};
export function scale(table: [number, number][], x: number): number {
  const t = [...table].sort((a, b) => a[0] - b[0]);
  if (x <= t[0][0]) { const [x0, y0] = t[0], [x1, y1] = t[1]; return Math.max(0, y0 + (x - x0) * (y1 - y0) / (x1 - x0)); }
  for (let i = 1; i < t.length; i++) if (x <= t[i][0]) { const [x0, y0] = t[i - 1], [x1, y1] = t[i]; return y0 + (x - x0) * (y1 - y0) / (x1 - x0); }
  const [x0, y0] = t[t.length - 2], [x1, y1] = t[t.length - 1];
  return Math.max(0, y1 + (x - x1) * (y1 - y0) / (x1 - x0));
}
export function levelLabel(score: number): string {
  return score < 30 ? 'Einsteiger' : score < 45 ? 'fortgeschritten' : score < 60 ? 'solider Hobbysportler' : score < 78 ? 'stark' : score < 93 ? 'Spitzenamateur' : 'Elite-Niveau';
}

/* Alters- und Geschlechtsbereinigung: Faktor auf die Leistung (größer = besser), bezogen auf Männer 18-35.
   Frauen: Laufen −11 %, Rad −14 % W/kg, Schwimmen −8 %. Ab 35 etwa 0,75 % pro Jahr, ab 60 stärker. Unter 18 bis 2,5 % pro Jahr. */
export function ageSexFactor(p: Pick<Profile, 'birthYear' | 'sex'>, today: string, sport: ScoreSport): number {
  if (sport === 'strength') return 1;
  let f = 1;
  if (p.sex === 'f') f /= sport === 'run' ? 0.89 : sport === 'bike' ? 0.86 : 0.92;
  const age = ageOf(p, today);
  if (age != null && age > 35) f /= Math.max(0.45, 1 - 0.0075 * (age - 35) - (age > 60 ? 0.006 * (age - 60) : 0));
  if (age != null && age < 18) f /= Math.max(0.6, 1 - 0.025 * (18 - age));
  return f;
}

/* Gewicht einer Messung: krank oder kurz danach zählt halb, ältere zählen weniger */
function weightOf(a: Activity, inp: ScoreInput, end: string): number {
  const ill = illnessAt(inp.illness, a.date) || illnessAt(inp.illness, addDays(a.date, -2)) ? 0.5 : 1;
  const age = Math.max(0, (Date.parse(end) - Date.parse(a.date)) / 86400000);
  return ill * Math.exp(-Math.LN2 * age / WINDOW);
}
/* Hitze herausrechnen: über 22 °C steigt der Puls bei gleichem Tempo um etwa 0,4 % pro Grad */
function heatFactor(a: Activity): number { return a.tempC != null && a.tempC > 22 && !a.indoor ? 1 + 0.004 * (a.tempC - 22) : 1; }
/* Höhenmeter herausrechnen: 1 m bergauf zählt beim Laufen wie 8 m flach, beim Rad wie 12 m */
function flatSpeedFactor(a: Activity): number {
  if (!a.km || !a.ascentM || a.indoor) return 1;
  const k = a.sport === 'run' ? 8 : 12;
  return (a.km * 1000 + k * a.ascentM) / (a.km * 1000);
}
function inWindow(a: Activity, end: string, days: number) { return a.date <= end && a.date > addDays(end, -days); }
const isManual = (a: Activity) => a.source === 'manual' || (a.sources || []).every(s => s === 'manual');
const titleOf = (a: Activity) => a.name || ({ run: 'Lauf', bike: 'Radfahrt', swim: 'Schwimmen', strength: 'Kraft' } as any)[a.sport] || 'Einheit';

interface Est { v: number; w: number; date: string }
function wmedian(list: Est[]): number | null {
  const s = list.filter(x => Number.isFinite(x.v) && Number.isFinite(x.w) && x.w > 0).sort((a, b) => a.v - b.v);
  if (!s.length) return null;
  const tot = s.reduce((a, x) => a + x.w, 0);
  let acc = 0;
  for (const x of s) { acc += x.w; if (acc >= tot / 2) return x.v; }
  return s[s.length - 1].v;
}
/* Laufen: Anteil der Schwellen-Geschwindigkeit bei einem Puls-Anteil (Z2 81-89 % ↔ Pace 1,26-1,15 × Schwelle) */
const runFrac = (h: number) => clamp(0.79 + (h - 0.81), 0.6, 1.0);

/* Marke „Für dein Ziel nötig“ / „Wunschzeit“: Text mit Abstand und Haken */
function markText(kind: ScoreMark['kind'], label: string, raw: number, cur: number | null, lowerBetter: boolean, fmt: (v: number) => string, diff: (a: number, b: number) => string): { text: string; done: boolean } {
  const better = cur != null && (lowerBetter ? cur <= raw : cur >= raw);
  if (kind === 'next') return { text: `${label}: ${fmt(raw)}`, done: better };
  if (cur == null) return { text: `${label}: ${fmt(raw)}`, done: false };
  return { text: better ? `${label}: ${fmt(raw)}, du bist schon ${diff(cur, raw)} ${lowerBetter ? 'schneller' : 'weiter'} ✓` : `${label}: ${fmt(raw)}, es fehlen noch ${diff(cur, raw)}`, done: better };
}

/* ---------- Teil-Bausteine ---------- */
interface Ctx { inp: ScoreInput; end: string; req: Requirement; need: Requirement; wish: Requirement | null; f: number; legacy?: boolean }
interface Raw { parts: ScorePart[]; n: number; counted: Counted[]; latest: string | null; manualShare: number; levelSource: string; extra: any; evidence?: Est[];
  /** Auftrag 19: laufende Schätzung des Hauptwerts; sub(z) rechnet in Punkte des Hauptteils um */
  filter?: FResult | null; sub?: (z: number) => number; mainKey?: string; priorSd?: number }

/* ---------- Auftrag 19: Messungen über die ganze Geschichte für die laufende Schätzung ---------- */
const TEST_RE = /test\b|ftp|\bcss\b|wettkampf|rennen|\brace\b|parkrun|zeitfahren/i;
function historyActs(c: Ctx, sport: string): Activity[] {
  const seen = new Set<string>();
  return c.inp.activities.filter(a => a.sport === sport && !a.mergedInto && a.date <= c.end && (a.min == null || (Number.isFinite(a.min) && a.min >= 0)))
    .filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; });
}
function trainDays(c: Ctx, sport: string): { trained: string[]; cross: string[] } {
  const trained: string[] = [], cross: string[] = [];
  c.inp.activities.forEach(a => {
    if (a.mergedInto || a.date > c.end || !((a.min || 0) > 0 || (a.km || 0) > 0)) return;
    if (a.sport === sport) trained.push(a.date); else if (a.sport === 'run' || a.sport === 'bike' || a.sport === 'swim') cross.push(a.date);
  });
  return { trained, cross };
}
function filterFor(c: Ctx, sport: string, obs: FObs[]): FResult | null {
  if (c.legacy || !obs.length) return null;
  const td = trainDays(c, sport);
  return runFilter({ obs, trained: td.trained, cross: td.cross, illness: c.inp.illness || [], end: c.end, prior: null });
}
type Add = (v: number, kind: FObs['kind'], base: number, value: string) => void;
function adder(c: Ctx, a: Activity, out: FObs[], log = true): Add {
  return (v, kind, base, value) => {
    if (!Number.isFinite(v) || (log && !(v > 0))) return;
    const q = obsSd(base, a, c.inp.illness || []);
    out.push({ id: a.id, date: a.date, z: log ? Math.log(v) : v, sd: q.sd, kind, title: titleOf(a), value, ill: q.ill, manual: q.manual });
  };
}
function runObs(c: Ctx, lthr: number): FObs[] {
  const out: FObs[] = [];
  historyActs(c, 'run').forEach(a => {
    if (!a.min || a.min < 10) return;
    const add = adder(c, a, out);
    if (a.avgHr && a.speedKmh && a.min >= 15 && a.min <= 75 && a.avgHr >= 0.92 * lthr) {
      const test = TEST_RE.test(a.name || '');
      add(a.speedKmh / 3.6 * flatSpeedFactor(a) * heatFactor(a) * lthr / a.avgHr, test ? 'test' : 'effort', test ? 0.025 : 0.035, `${mmss(3600 / a.speedKmh)}/km bei Puls ${a.avgHr}`);
      return;
    }
    const laps = (a.laps || []).filter(l => l.kind === 'work' && l.sec >= 180 && l.speed && l.avgHr && l.avgHr >= 0.9 * lthr);
    if (laps.length) {
      const v = wmedian(laps.map(l => ({ v: l.speed! * lthr / l.avgHr! * 0.98, w: 1, date: a.date })));
      if (v) { add(v, 'laps', 0.045, `Intervalle ${mmss(1000 / laps[0].speed!)}/km bei Puls ${laps[0].avgHr}`); return; }
    }
    if ((intervalsOf(a) || { count: 0 }).count >= 2) return;
    const sp = a.speedKmh ? a.speedKmh / 3.6 : a.efficiency && a.avgHr ? a.efficiency * a.avgHr / 60 : null;
    if (!sp) return;
    if (a.avgHr && a.avgHr < 0.92 * lthr) { add(sp * flatSpeedFactor(a) * heatFactor(a) / runFrac(a.avgHr / lthr), 'hr', 0.06, `${mmss(1000 / sp)}/km bei Puls ${a.avgHr}`); return; }
    const fr = !a.avgHr && a.rpe != null && a.min >= 20 ? rpeFrac(a.rpe) : null;
    if (fr) add(sp * flatSpeedFactor(a) / runFrac(fr), 'rpe', 0.09, `${mmss(1000 / sp)}/km, Gefühl ${a.rpe}/10`);
  });
  return out;
}
function bikeObs(c: Ctx, lthr: number, power: boolean): FObs[] {
  const out: FObs[] = [];
  const p = c.inp.profile;
  historyActs(c, 'bike').forEach(a => {
    if (!a.min || a.min < 15) return;
    const add = adder(c, a, out);
    const iv = (intervalsOf(a) || { count: 0 }).count >= 2;
    if (power) {
      if (!a.avgPower) return;
      const W = Math.round(a.avgPower);
      if (a.avgHr && a.min <= 75 && a.min >= 20 && a.avgHr >= 0.9 * lthr) {
        const test = TEST_RE.test(a.name || '');
        add(a.avgPower * 0.95 * lthr / a.avgHr, test ? 'test' : 'effort', test ? 0.025 : 0.04, `${W} W bei Puls ${a.avgHr}`);
        return;
      }
      const laps = (a.laps || []).filter(l => l.kind === 'work' && l.sec >= 480 && l.power);
      if (laps.length) {
        const v = wmedian(laps.map(l => ({ v: l.power! * (l.sec >= 1200 ? 0.95 : 0.9), w: 1, date: a.date })));
        if (v) { add(v, 'laps', 0.045, `Intervalle ${Math.round(laps[0].power!)} W`); return; }
      }
      const nm = a.name || '';
      if (/sweet ?spot/i.test(nm)) { add(a.avgPower / 0.9, 'titled', 0.07, `${W} W (Sweet Spot)`); return; }
      if (/schwelle|threshold|ftp/i.test(nm)) { add(a.avgPower / 0.97, 'titled', 0.07, `${W} W (Schwelle)`); return; }
      if (iv) return;
      if (a.avgHr && a.avgHr <= 0.88 * lthr) { add(a.avgPower / powerFracFromHr(a.avgHr / lthr), 'hr', 0.08, `${W} W bei Puls ${a.avgHr}`); return; }
      const fr = !a.avgHr && a.rpe != null ? rpeFrac(a.rpe) : null;
      if (fr) add(a.avgPower / powerFracFromHr(fr), 'rpe', 0.1, `${W} W, Gefühl ${a.rpe}/10`);
      return;
    }
    if (!a.speedKmh) return;
    const k = kindOf({ indoor: a.indoor, bikeType: a.bikeType, name: a.name }, p);
    if (k === 'indoor') return; // drinnen ohne Leistung: Tempo zählt nicht
    const roadEq = (kmh: number) => k === 'gravel' ? kmh / GRAVEL_F : kmh;
    const sp = a.speedKmh * flatSpeedFactor(a) * heatFactor(a);
    const val = `${de(a.speedKmh)} km/h ${BIKE_KIND_LABEL[k]}`;
    if (a.avgHr && a.avgHr >= 0.9 * lthr && a.min >= 20) { add(roadEq(sp * Math.cbrt(lthr / a.avgHr)), TEST_RE.test(a.name || '') ? 'test' : 'effort', 0.03, `${val} bei Puls ${a.avgHr}`); return; }
    if (iv) return;
    if (a.avgHr) { add(roadEq(thrSpeedFromRide(sp, a.avgHr, lthr)), 'hr', 0.045, `${val} bei Puls ${a.avgHr}`); return; }
    const fr = a.rpe != null ? rpeFrac(a.rpe) : null;
    if (fr) add(roadEq(thrSpeedFromRide(sp, fr * lthr, lthr)), 'rpe', 0.07, `${val}, Gefühl ${a.rpe}/10`);
  });
  return out;
}
function swimObs(c: Ctx): FObs[] {
  const out: FObs[] = [];
  historyActs(c, 'swim').forEach(a => {
    const pc = a.swim && a.swim.pace100; if (!pc) return;
    const cont = (a.swim && a.swim.longestContinuousM) || 0;
    const test = TEST_RE.test(a.name || '');
    const add = adder(c, a, out, false);
    const value = `${mmss(pc)}/100 m${cont ? `, ${cont} m am Stück` : ''}`;
    // CSS als −ln(Sekunden pro 100 m): größer = besser
    if (test) add(-Math.log(pc), 'test', 0.025, value);
    else if (cont >= 400) add(-Math.log(pc + 3), 'swimset', 0.03, value);
    else add(-Math.log(pc - 4), 'swimpace', 0.05, value);
  });
  return out;
}

// Letzte beobachtete Fähigkeit bleibt bei Pause bestehen. Nur die Sicherheit altert.
// Leere Kurz-Einträge dürfen weder das Fenster noch das Vertrauen erneuern.
function evidenceActivities(c: Ctx, sport: ScoreSport): { end: string; activities: Activity[] } {
  const valid = c.inp.activities.filter(a => a.sport === sport && !a.mergedInto && a.date <= c.end && (a.min == null || (Number.isFinite(a.min) && a.min >= 0)) &&
    (sport === 'run' ? !!(a.min && a.min >= 10 && ((a.avgHr && (a.speedKmh || a.efficiency)) || a.laps?.some(l => l.kind === 'work' && l.speed && l.avgHr) || a.min >= 30)) :
      sport === 'bike' ? !!(a.min && a.min >= 15) : sport === 'swim' ? !!(a.km || a.min) : true));
  const end = valid.map(a => a.date).sort().pop() || c.end;
  const seen = new Set<string>();
  const activities = valid.filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return inWindow(a, end, WINDOW); });
  return { end, activities };
}

function mk(key: string, label: string, weight: number, raw: number | null, sub: number | null, value: string, opts: { lowerBetter?: boolean; target?: string } = {}): ScorePart {
  return { key, label, weight, raw, sub: sub == null ? null : Math.round(sub * 10) / 10, value, target: opts.target || '', lowerBetter: opts.lowerBetter, marks: [] };
}

/* ---------- Laufen ---------- */
function runRaw(c: Ctx): Raw {
  const { inp } = c;
  const { end, activities: runs } = evidenceActivities(c, 'run');
  const lthr = inp.profile.thresholds.lthrRun || 170;
  const easy = runs.filter(a => a.avgHr && a.avgHr <= 0.89 * lthr && !((intervalsOf(a) || { count: 0 }).count >= 2) && (a.speedKmh || a.efficiency));
  const counted: Counted[] = [];
  // Schwelle: harte Einheiten, Intervall-Runden, Profil (Test oder Schätzung); lockere Läufe über den Puls-Anteil
  const thr: Est[] = [];
  runs.forEach(a => {
    const local: Est[] = [];
    if (a.avgHr && a.speedKmh && a.min! >= 15 && a.min! <= 75 && a.avgHr >= 0.92 * lthr) { local.push({ v: a.speedKmh / 3.6 * flatSpeedFactor(a) * heatFactor(a) * lthr / a.avgHr, w: 1, date: a.date }); counted.push({ date: a.date, title: titleOf(a), value: `${mmss(3600 / a.speedKmh)}/km bei Puls ${a.avgHr} (hart)`, manual: isManual(a) }); }
    (a.laps || []).filter(l => l.kind === 'work' && l.sec >= 180 && l.speed && l.avgHr && l.avgHr >= 0.9 * lthr).forEach(l => local.push({ v: l.speed! * lthr / l.avgHr! * 0.98, w: 0.8, date: a.date }));
    const v = wmedian(local);
    if (v != null) {
      thr.push({ v, w: weightOf(a, inp, end), date: a.date });
      if (!counted.some(x => x.date === a.date && x.title === titleOf(a))) counted.push({ date: a.date, title: titleOf(a), value: `${mmss(1000 / v)}/km aus Intervallrunden (Schätzung)`, manual: isManual(a) });
    }
  });
  const imp: Est[] = [];
  easy.forEach(a => {
    const sp = a.speedKmh ? a.speedKmh / 3.6 : (a.efficiency! * a.avgHr! / 60);
    imp.push({ v: sp * flatSpeedFactor(a) * heatFactor(a) / runFrac(a.avgHr! / lthr), w: weightOf(a, inp, end), date: a.date });
    counted.push({ date: a.date, title: titleOf(a), value: `${mmss(1000 / sp)}/km bei Puls ${a.avgHr}`, manual: isManual(a) });
  });
  const t = inp.profile.thresholds;
  const est = (t.estimated || []).includes('thresholdPaceRunSec');
  const impMed = wmedian(imp.filter(x => x.date > addDays(end, -RECENT)));
  const evidence = [...thr, ...imp.map(x => ({ ...x, w: x.w * 0.5 }))];
  // Auftrag 19: laufende Schätzung über alle Läufe (alte Rechnung nur noch zum Vergleich beim Umstieg)
  const flt = filterFor(c, 'run', runObs(c, lthr));
  const thrSpeed = flt ? Math.exp(flt.z) : wmedian(evidence) ?? (t.thresholdPaceRunSec > 0 ? 1000 / t.thresholdPaceRunSec : null);
  const effSpeed = impMed && thrSpeed ? clamp(impMed, thrSpeed * 0.85, thrSpeed * 1.15) : null;
  const effs = easy.filter(a => inWindow(a, end, RECENT) && a.efficiency).map(a => ({ v: a.efficiency! * heatFactor(a) * flatSpeedFactor(a), w: weightOf(a, inp, end), date: a.date }));
  const eff = wmedian(effs);
  const decs = runs.filter(a => a.decouplingPct != null && a.min! >= 30).map(a => ({ v: a.decouplingPct!, w: weightOf(a, inp, end) * (a.min! >= 45 ? 1 : 0.5), date: a.date }));
  const dec = wmedian(decs);
  const easyMins = runs.filter(a => !a.avgHr || a.avgHr <= 0.9 * lthr).map(a => a.min || 0);
  const skillCont = (inp.profile.skills || {}).runContinuousMin || null;
  // Auftrag 19: kurze Läufe im Fenster sind kein Beweis, dass ein längerer nicht geht: höchster Wert aus Einheiten und Fragebogen
  const runMax = easyMins.length ? Math.max(...easyMins) : null;
  const longest = runMax != null && skillCont != null ? Math.max(runMax, skillCont) : runMax ?? skillCont;
  const longFromSkill = longest != null && longest !== runMax;
  const f = c.f;
  const lvl = (sp: number) => scale(SCALES.runVdot, vdotFromThreshold(sp * f));
  const parts: ScorePart[] = [
    mk('thr', 'Schwellen-Pace', 0.65, thrSpeed ? 1000 / thrSpeed : null, thrSpeed ? lvl(thrSpeed) : null, thrSpeed ? mmss(1000 / thrSpeed) + '/km' : '–', { lowerBetter: true }),
    mk('eff', 'Effizienz locker', 0, effSpeed ? 1000 / effSpeed : null, effSpeed ? lvl(effSpeed) : null, eff ? `${de(eff, 2)} m pro Herzschlag${effSpeed ? ` (≈ ${mmss(1000 / effSpeed)}/km an der Schwelle)` : ''}` : '–', { lowerBetter: true }),
    mk('long', !longFromSkill ? 'Längster lockerer Lauf' : 'Laufen am Stück (Fragebogen)', 0.2, longest, longest ? scale(SCALES.longRun, longest) : null, longest ? longest + ' min' : '–'),
    mk('dec', 'Aerobe Entkopplung', 0.15, dec, dec != null ? scale(SCALES.dec, dec) : null, dec != null ? de(dec) + ' %' : '–', { lowerBetter: true, target: 'unter 5 %' })
  ];
  const latest = runs.map(a => a.date).sort().pop() || null;
  return { evidence, parts, n: runs.length, counted, latest, manualShare: runs.length ? runs.filter(isManual).length / runs.length : 1, levelSource: thr.length > 1 || imp.length || flt ? 'Einheiten' : est ? 'Schätzung aus dem Profil' : t.source || 'Profil', extra: { thrSpeed, eff, dec, longest, impMed },
    filter: flt, sub: z => lvl(Math.exp(z)), mainKey: 'thr', priorSd: est ? 0.1 : 0.05 };
}

/* ---------- Rad ---------- */
function bikeRaw(c: Ctx): Raw {
  const { inp } = c;
  const { end, activities: rides } = evidenceActivities(c, 'bike');
  const p = inp.profile;
  const lthr = p.thresholds.lthrBike || 165;
  const weight = p.weightKg || 70;
  const counted: Counted[] = [];
  // FTP: harte 20-75-min-Abschnitte, Runden ab 8 min, Sweet-Spot-/Schwellen-Einheiten mit Ø-Watt, Profil
  const ftpEst: Est[] = [];
  let strong = 0, titled = 0;
  rides.forEach(a => {
    const w = weightOf(a, inp, end);
    const local: Est[] = [];
    if (a.avgPower && a.avgHr && a.min! >= 20 && a.min! <= 75 && a.avgHr >= 0.9 * lthr) { local.push({ v: a.avgPower * 0.95 * lthr / a.avgHr, w, date: a.date }); strong++; }
    (a.laps || []).filter(l => l.kind === 'work' && l.sec >= 480 && l.power).forEach(l => { local.push({ v: l.power! * (l.sec >= 1200 ? 0.95 : 0.9), w: 0.8 * w, date: a.date }); strong++; });
    const nm = `${a.name || ''}`;
    if (a.avgPower && !(a.laps || []).some(l => l.kind === 'work') && /sweet ?spot/i.test(nm)) { local.push({ v: a.avgPower / 0.9, w: 0.5 * w, date: a.date }); titled++; }
    else if (a.avgPower && !(a.laps || []).some(l => l.kind === 'work') && /schwelle|threshold|ftp/i.test(nm)) { local.push({ v: a.avgPower / 0.97, w: 0.5 * w, date: a.date }); titled++; }
    const v = wmedian(local);
    if (v != null) ftpEst.push({ v, w, date: a.date });
    if (a.avgPower) counted.push({ date: a.date, title: titleOf(a), value: `${Math.round(a.avgPower)} W${a.avgHr ? ` bei Puls ${a.avgHr}` : ''}`, manual: isManual(a) });
  });
  // FTP nur aus Test/Profil, harten Abschnitten oder Runden; Titel allein („Sweet Spot“ mit Ø-Watt) erst ab 2 Einheiten
  const ftpOld = (strong > 0 || titled >= 2 ? wmedian(ftpEst) : null) ?? (p.thresholds.ftp && p.thresholds.ftp > 0 ? p.thresholds.ftp : null);
  // Auftrag 19: laufende Schätzung (FTP aus allen Fahrten mit Watt; sonst Schwellen-Tempo)
  const pObs = c.legacy ? [] : bikeObs(c, lthr, true);
  const fltP = pObs.length && (strong > 0 || titled >= 2 || pObs.some(o => o.kind !== 'titled') || pObs.length >= 2) ? filterFor(c, 'bike', pObs) : null;
  const ftp = fltP ? Math.exp(fltP.z) : ftpOld;
  // Ohne Watt: Schwellen-Geschwindigkeit (Rennrad-Wert; Gravel wird umgerechnet, drinnen zählt die virtuelle Geschwindigkeit wie Rennrad)
  const bs = bikeSpeedsOf(p);
  const roadEq = (kmh: number, k: BikeKind) => k === 'gravel' ? kmh / GRAVEL_F : kmh;
  const spThr: Est[] = [];
  const imp: Est[] = [];
  rides.filter(a => a.speedKmh && a.avgHr).forEach(a => {
    const k = kindOf({ indoor: a.indoor, bikeType: a.bikeType, name: a.name }, p);
    if (k === 'indoor' && !a.avgPower) return; // drinnen ohne Leistung: Tempo zählt nicht
    const w = weightOf(a, inp, end);
    const sp = a.speedKmh! * flatSpeedFactor(a) * heatFactor(a);
    if (a.avgHr! >= 0.9 * lthr && a.min! >= 20) spThr.push({ v: roadEq(sp * Math.cbrt(lthr / a.avgHr!), k), w, date: a.date });
    else if (a.avgHr! <= 0.88 * lthr && !((intervalsOf(a) || { count: 0 }).count >= 2)) imp.push({ v: roadEq(thrSpeedFromRide(sp, a.avgHr!, lthr), k), w, date: a.date });
    if (!a.avgPower) counted.push({ date: a.date, title: titleOf(a), value: `${de(a.speedKmh!)} km/h ${BIKE_KIND_LABEL[k]} bei Puls ${a.avgHr}`, manual: isManual(a) });
  });
  const speedEst = (p.thresholds.estimated || []).includes('thresholdSpeedBikeKmh');
  const impMed = wmedian(imp.filter(x => x.date > addDays(end, -RECENT)));
  const speedEvidence = [...spThr, ...imp.map(x => ({ ...x, w: x.w * 0.5 }))];
  const fltS = !ftp ? filterFor(c, 'bike', bikeObs(c, lthr, false)) : null;
  const thrKmh = fltS ? Math.exp(fltS.z) : wmedian(speedEvidence) ?? (p.thresholds.thresholdSpeedBikeKmh > 0 ? roadEq(bs[bs.main], bs.main) : null); // Rennrad-Äquivalent
  // Effizienz: mit Watt Leistung pro Herzschlag bei lockeren Fahrten (in FTP umgerechnet), sonst Tempo pro Herzschlag
  const effP: Est[] = rides.filter(a => a.avgPower && a.avgHr && a.avgHr <= 0.88 * lthr && inWindow(a, end, RECENT)).map(a => ({ v: a.avgPower! / powerFracFromHr(a.avgHr! / lthr), w: weightOf(a, inp, end), date: a.date }));
  const effFtp = wmedian(effP);
  const decs = rides.filter(a => a.decouplingPct != null && a.min! >= 60).map(a => ({ v: a.decouplingPct!, w: 1, date: a.date }));
  const dec = wmedian(decs);
  const skillLong = (p.skills || {}).bikeLongestMin || null;
  const rideMax = rides.length ? Math.max(...rides.map(a => a.min || 0)) : null;
  const longest = rideMax != null && skillLong != null ? Math.max(rideMax, skillLong) : rideMax ?? skillLong;
  const rideFromSkill = longest != null && longest !== rideMax;
  const f = c.f;
  const usePower = !!ftp;
  const lvlW = (w: number) => scale(SCALES.bikeWkg, w / weight * f);
  const lvlS = (k: number) => scale(SCALES.bikeKmh, k * Math.cbrt(f));
  const mainLabel = BIKE_KIND_LABEL[bs.main];
  const shownKmh = thrKmh ? (bs.main === 'gravel' ? thrKmh * GRAVEL_F : thrKmh) : null;
  const effVal = usePower ? (effFtp ? clamp(effFtp, ftp! * 0.85, ftp! * 1.15) : null) : (impMed && thrKmh ? clamp(impMed, thrKmh * 0.85, thrKmh * 1.15) : null);
  const parts: ScorePart[] = [
    usePower ? mk('thr', 'FTP', 0.65, ftp! / weight, lvlW(ftp!), `${Math.round(ftp!)} W (${de(ftp! / weight, 1)} W/kg)`)
      : mk('thr', 'Schwellen-Tempo', 0.65, shownKmh, thrKmh ? lvlS(thrKmh) : null, shownKmh ? `${de(shownKmh)} km/h (${mainLabel}, flach)` : '–'),
    mk('eff', 'Effizienz locker', 0, effVal, effVal ? (usePower ? lvlW(effVal) : lvlS(effVal)) : null, effVal ? (usePower ? `≈ ${Math.round(effVal)} W an der Schwelle` : `≈ ${de(bs.main === 'gravel' ? effVal * GRAVEL_F : effVal)} km/h an der Schwelle`) + ' (aus lockeren Fahrten)' : '–'),
    mk('long', !rideFromSkill ? 'Längste Fahrt' : 'Längste Fahrt (Fragebogen)', 0.2, longest, longest ? scale(SCALES.longRide, longest) : null, longest ? longest + ' min' : '–'),
    mk('dec', 'Aerobe Entkopplung', 0.15, dec, dec != null ? scale(SCALES.dec, dec) : null, dec != null ? de(dec) + ' %' : '–', { lowerBetter: true, target: 'unter 5 %' })
  ];
  const latest = rides.map(a => a.date).sort().pop() || null;
  return { evidence: usePower ? ftpEst : speedEvidence, parts, n: rides.length, counted, latest, manualShare: rides.length ? rides.filter(isManual).length / rides.length : 1, levelSource: rides.length ? 'Einheiten' : speedEst ? 'Schätzung aus dem Profil' : 'Profil', extra: { ftp, thrKmh, shownKmh, usePower, dec, longest, weight, mainKind: bs.main },
    filter: usePower ? fltP : fltS, sub: z => usePower ? lvlW(Math.exp(z)) : lvlS(Math.exp(z)), mainKey: 'thr',
    priorSd: usePower ? ((p.thresholds.estimated || []).includes('ftp') ? 0.1 : 0.05) : speedEst ? 0.06 : 0.035 };
}

/* ---------- Schwimmen ---------- */
function swimRaw(c: Ctx): Raw {
  const { inp } = c;
  const { end, activities: swims } = evidenceActivities(c, 'swim');
  const p = inp.profile; const sk = p.skills || {}; const th = p.thresholds;
  const counted: Counted[] = [];
  const canCrawl = sk.swimCrawl === 'yes' || sk.swimCrawl === 'some' || (sk.swimCrawlM || 0) >= 25 || (!!th.cssSec && !(th.estimated || []).includes('cssSec')) || swims.some(a => a.swim && (a.swim.longestContinuousM || 0) >= 25) || (sk.swimCrawl == null && !!th.cssSec);
  // CSS: lange Serien (+3 s), Pace einer Einheit (−4 s, Pausen sind drin), Test im Profil, 25-m-Zeit, sonst Brust
  const css: Est[] = [];
  swims.forEach(a => {
    const pc = a.swim && a.swim.pace100;
    const cont = (a.swim && a.swim.longestContinuousM) || 0;
    if (pc) css.push({ v: cont >= 400 ? pc + 3 : pc - 4, w: (cont >= 400 ? 1 : 0.5) * weightOf(a, inp, end), date: a.date });
    counted.push({ date: a.date, title: titleOf(a), value: [a.km ? Math.round(a.km * 1000) + ' m' : '', pc ? mmss(pc) + '/100 m' : '', cont ? `${cont} m am Stück` : ''].filter(Boolean).join(', ') || `${a.min} min`, manual: isManual(a) });
  });
  const cssEst = (th.estimated || []).includes('cssSec');
  let source = 'CSS';
  const evidence = [...css];
  if (!css.length && th.cssSec) css.push({ v: th.cssSec, w: cssEst ? 0.3 : 0.8, date: end });
  if (!css.length && th.crawl25Sec) css.push({ v: th.crawl25Sec * 4 * 1.12, w: 0.6, date: end });
  if (!css.length) { const br = th.breast100Sec || 170 + (p.sex === 'f' ? 5 : 0); css.push({ v: br + (canCrawl ? 0 : 5), w: 0.3, date: end }); source = canCrawl ? 'geschätzt' : 'Brust'; }
  const s = [...css].sort((a, b) => a.v - b.v);
  // nicht der einzelne Ausreißer: gewichteter Median
  // Auftrag 19: laufende Schätzung über alle Schwimmeinheiten mit Pace
  const flt = filterFor(c, 'swim', swimObs(c));
  const cssV = flt ? Math.exp(-flt.z) : wmedian(s)!;
  const conts = swims.map(a => (a.swim && a.swim.longestContinuousM) || 0).filter(x => x > 0);
  // ein kurzes Stück in einer Technik-Einheit senkt das Können nicht: höchster Wert aus Einheiten und Fragebogen
  const cont = conts.length ? Math.max(...conts, sk.swimCrawlM || 0) : (sk.swimCrawlM ?? null);
  const pool = (a: Activity) => (a.swim && a.swim.poolLengthM) || 25;
  const dpsVals = swims.filter(a => inWindow(a, end, RECENT) && a.swim && (a.swim.strokesPerLength || a.swim.metersPerStroke)).map(a => ({ v: a.swim!.strokesPerLength ? (pool(a) - 5) / a.swim!.strokesPerLength! : a.swim!.metersPerStroke!, w: 1, date: a.date }));
  const dps = wmedian(dpsVals);
  const spl = wmedian(swims.filter(a => inWindow(a, end, RECENT) && a.swim && a.swim.strokesPerLength).map(a => ({ v: a.swim!.strokesPerLength!, w: 1, date: a.date })));
  const f = c.f;
  const parts: ScorePart[] = [
    mk('css', canCrawl ? 'CSS (Schwellen-Pace)' : 'Brust-Tempo', 0.45, cssV, scale(SCALES.swimCss, cssV / f), mmss(cssV) + '/100 m' + (source === 'Brust' ? ' Brust' : ''), { lowerBetter: true }),
    mk('cont', 'Kraul am Stück', 0.3, cont, cont != null ? scale(SCALES.swimCont, cont) : null, cont ? Math.round(cont) + ' m' : cont == null ? 'unbekannt' : 'noch nicht'),
    mk('tech', 'Meter pro Zug', 0.25, dps, dps ? scale(SCALES.swimDps, dps) : null, dps ? de(dps, 2) + ' m' + (spl ? ' (' + (Number.isInteger(spl) ? spl : de(spl)) + ' Züge/Bahn)' : '') : '–', { target: '1,6 m' })
  ];
  const latest = swims.map(a => a.date).sort().pop() || null;
  return { evidence, parts, n: swims.length, counted, latest, manualShare: swims.length ? swims.filter(isManual).length / swims.length : 1, levelSource: source === 'CSS' ? (cssEst && !swims.length ? 'Schätzung aus dem Profil' : 'Einheiten und Test') : source === 'Brust' ? 'Brust-Tempo' : 'Schätzung', extra: { css: cssV, dps, spl, cont, canCrawl },
    filter: flt, sub: z => scale(SCALES.swimCss, Math.exp(-z) / f), mainKey: 'css', priorSd: source === 'CSS' ? (cssEst ? 0.1 : 0.04) : 0.12 };
}

/* ---------- Kraft: Regelmäßigkeit und Steigerung ---------- */
function strengthRaw(c: Ctx): Raw {
  const { end, activities: list } = evidenceActivities(c, 'strength');
  const perWeek = list.length / 6;
  const weights = list.map(a => (a as any).liftKg).filter((x: any) => typeof x === 'number');
  const prog = weights.length >= 2 ? (weights[weights.length - 1] - weights[0]) / Math.max(1, weights[0]) : null;
  const parts: ScorePart[] = [
    mk('reg', 'Regelmäßigkeit', prog != null ? 0.75 : 1, perWeek, scale(SCALES.strengthWeek, perWeek), de(perWeek) + ' pro Woche'),
    ...(prog != null ? [mk('prog', 'Steigerung der Gewichte', 0.25, prog, scale(SCALES.strengthProg, prog), (prog >= 0 ? '+' : '') + Math.round(prog * 100) + ' %', { target: '+10 % in 6 Wochen' })] : [])
  ];
  return { parts, n: list.length, counted: list.map(a => ({ date: a.date, title: titleOf(a), value: a.min ? a.min + ' min' : 'erledigt', manual: isManual(a) })), latest: list.map(a => a.date).sort().pop() || null, manualShare: 1, levelSource: 'Einheiten', extra: { perWeek } };
}

function rawFor(sport: ScoreSport, c: Ctx): Raw { return sport === 'run' ? runRaw(c) : sport === 'bike' ? bikeRaw(c) : sport === 'swim' ? swimRaw(c) : strengthRaw(c); }
function combine(parts: ScorePart[]): { score: number | null; coverage: number } {
  const have = parts.filter(p => p.sub != null);
  const wsum = have.reduce((a, p) => a + p.weight, 0);
  if (!wsum) return { score: null, coverage: 0 };
  return { score: have.reduce((a, p) => a + p.sub! * p.weight, 0) / wsum, coverage: wsum / parts.reduce((a, p) => a + p.weight, 0) };
}
function ctxFor(sport: ScoreSport, inp: ScoreInput, end: string): Ctx {
  // Ein bekannter Aktualisierungszeitpunkt darf historische Kurven nicht vorwegnehmen.
  // Undatierte Profilwerte sind nur ein unsicherer Startwert, keine neue Messung.
  if (inp.profile.thresholds.trendAt && inp.profile.thresholds.trendAt > end) {
    inp = { ...inp, profile: { ...inp.profile, thresholds: { ...inp.profile.thresholds,
      lthrRun: 170, lthrBike: 165, thresholdPaceRunSec: 0, thresholdSpeedBikeKmh: 0,
      ftp: null, cssSec: null, crawl25Sec: null, breast100Sec: null, bikeSpeeds: null } } };
  }
  const req = requirementFor(inp.goal, inp.profile);
  const need = inp.goal ? requirementFor({ ...inp.goal, targetTimeSec: null, splits: null }, inp.profile) : req;
  const wish = inp.goal && (inp.goal.targetTimeSec || (inp.goal.splits && Object.keys(inp.goal.splits).length)) ? req : null;
  return { inp, end, req, need, wish, f: ageSexFactor(inp.profile, end, sport) };
}
function scoreAt(sport: ScoreSport, inp: ScoreInput, end: string, legacy = false) {
  const c = { ...ctxFor(sport, inp, end), legacy };
  const r = rawFor(sport, c);
  const cb = combine(r.parts);
  const measured = cb.score;
  // Vertrauen: Menge, Aktualität, Uhr statt Hand, Anteil gemessener Teile
  const evidenceLatest = r.evidence?.map(x => x.date).sort().pop() || r.latest;
  const ageDays = evidenceLatest ? Math.max(0, (Date.parse(end) - Date.parse(evidenceLatest)) / 86400000) : 99;
  const recF = Math.exp(-Math.LN2 * ageDays / WINDOW);
  const qF = 0.75 + 0.25 * (1 - r.manualShare);
  // Eine Aktivität / ein Tag ist keine Reihe unabhängiger Tests.
  const days = new Map<string, number>();
  for (const x of r.evidence || []) days.set(x.date, Math.min(1, (days.get(x.date) || 0) + x.w));
  const effectiveN = sport === 'strength' ? r.n : [...days.values()].reduce((a, v) => a + v, 0);
  const nF = Math.min(1, effectiveN / (sport === 'strength' ? 4 : 6));
  const med = wmedian(r.evidence || []);
  const deviation = med && wmedian((r.evidence || []).map(x => ({ ...x, v: Math.abs(x.v - med) / Math.abs(med) })));
  const agreement = deviation == null ? 1 : 1 / (1 + 4 * deviation);
  const confidence = Math.round(Math.max(r.n ? 0 : 0.05, nF * recF * qF * cb.coverage * agreement) * 100) / 100;
  const score = Math.round(clamp((measured ?? 10) + ((inp.manualAdjust && inp.manualAdjust[sport]) || 0), 1, 120));
  const range = rangeOf(sport, r, effectiveN);
  return { score, measured: measured == null ? null : Math.round(measured), confidence, raw: r, parts: r.parts, c, ageDays, range };
}
/* Auftrag 19: Anteil des Hauptteils am Score und Bereich (± Punkte) aus der Unsicherheit der Schätzung */
function shareOf(r: Raw, key: string): number {
  const have = r.parts.filter(p => p.sub != null); const wsum = have.reduce((a, p) => a + p.weight, 0) || 1;
  const p = have.find(x => x.key === key); return p ? p.weight / wsum : 0;
}
function rangeOf(sport: ScoreSport, r: Raw, n: number): number {
  if (sport === 'strength') return n >= 8 ? 3 : n >= 4 ? 5 : 8;
  const have = r.parts.filter(p => p.sub != null); const wsum = have.reduce((a, p) => a + p.weight, 0) || 1;
  const main = have.find(p => p.key === r.mainKey);
  let v = 0;
  if (main && r.sub) {
    // ohne laufende Schätzung (nur Profil): Unsicherheit des Profilwerts
    const z = r.filter ? r.filter.z : null, sd = r.filter ? r.filter.sd : (r.priorSd || 0.1);
    const half = z != null ? Math.abs(r.sub(z + sd) - r.sub(z - sd)) / 2 : Math.max(1, main.sub! * sd * 1.6);
    v += Math.pow(half * main.weight / wsum, 2);
  }
  have.filter(p => p !== main && p.weight > 0).forEach(p => { v += Math.pow(3 * p.weight / wsum, 2); });
  // fehlende Teile: unbekannt, nicht schlecht, aber der Bereich wird etwas breiter
  r.parts.filter(p => p.sub == null && p.weight > 0).forEach(p => { v += Math.pow(4 * p.weight, 2); });
  return Math.max(1, Math.round(Math.sqrt(v)));
}
function rangeTextOf(range: number): string {
  return `± ${range}${range >= 6 ? ', wenig Daten' : range <= 2 ? ', gut belegt' : ''}`;
}
/* „Warum?“: die letzten Einheiten mit ihrem Beitrag (+/−) und dem Grund */
const KIND_WHY: Record<string, string> = {
  test: 'Test, zählt stark', effort: 'harte Einheit mit Puls, zählt stark', laps: 'Intervalle mit Puls', hr: 'Tempo bei bekanntem Puls',
  rpe: 'ohne Puls, nur nach Gefühl, zählt wenig', titled: 'Watt einer Intervall-Einheit, zählt wenig', swimset: 'lange Serie, zählt gut', swimpace: 'Tempo der Einheit'
};
function stepLines(sport: ScoreSport, now: ReturnType<typeof scoreAt>, today: string): string[] {
  const r = now.raw; if (!r.filter || !r.sub) return [];
  const share = shareOf(r, r.mainKey || 'thr');
  const label = SPORT_LABEL[sport];
  const what = { run: 'Laufen', bike: 'Radfahren', swim: 'Schwimmen', strength: 'Kraft' }[sport];
  const steps = r.filter.steps.slice(1).filter(s => s.date > addDays(today, -42)).slice(-5).reverse();
  return steps.map(s => {
    const d = (r.sub!(s.after) - r.sub!(s.before)) * share;
    const n = Math.round(d);
    const sign = n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '±0';
    const dd = `${s.date.slice(8)}.${s.date.slice(5, 7)}.`;
    if (s.kind === 'pause') return `${sign} ${label}: ${s.days} Tage ohne ${what} bis ${dd}, die Form sinkt langsam (etwa 1 % pro Woche)`;
    const dir = d > 0.3 ? 'besser als erwartet' : d < -0.3 ? 'schwächer als erwartet' : 'wie erwartet';
    const extra = [s.ill ? 'krank, zählt weniger' : '', s.manual ? 'von Hand' : ''].filter(Boolean).join(', ');
    return `${sign} ${label}: ${dd} ${s.title}, ${s.value}: ${dir} (${KIND_WHY[s.kind] || 'Messung'}${extra ? ', ' + extra : ''})`;
  });
}
/* Umstieg auf die neue Rechnung (Version 3.6): 4 Wochen lang sagen, was die alte Rechnung ergeben hätte */
const NEW_SCORE_FROM = '2026-10-24';
function switchLine(sport: ScoreSport, inp: ScoreInput, now: ReturnType<typeof scoreAt>): string | null {
  if (inp.today < NEW_SCORE_FROM || inp.today > addDays(NEW_SCORE_FROM, 28) || sport === 'strength') return null;
  const old = scoreAt(sport, inp, inp.today, true);
  if (Math.abs(old.score - now.score) < 2) return null;
  return `Neu berechnet: Nach der alten Rechnung stünde hier ${old.score}. Jetzt zählen Tests und harte Einheiten stärker, Pausen senken den Wert langsam, und du siehst den Bereich (${rangeTextOf(now.range)}).`;
}

/* ---------- Marken: Für dein Ziel nötig, Nächstes Etappenziel, Wunschzeit ---------- */
const STEPS_CONT = [25, 50, 100, 200, 300, 400, 600, 800, 1000, 1500, 2000, 3000, 3800, 5000];
function nextFor(sport: ScoreSport, p: ScorePart, rate: number): number | null {
  if (p.raw == null) return null;
  if (p.key === 'cont') return STEPS_CONT.find(x => x > p.raw!) || Math.round(p.raw * 1.2);
  if (p.key === 'long') return Math.round((p.raw + (sport === 'bike' ? 30 : 15)) / 5) * 5;
  if (p.key === 'reg') return Math.min(3, Math.round((p.raw + 0.5) * 2) / 2);
  if (p.key === 'dec') return p.raw > 5 ? Math.max(5, Math.round(p.raw - 2)) : null;
  if (p.key === 'thr' || p.key === 'css') {
    const pct = clamp(0.03 + Math.max(0, rate) * 0.5, 0.03, 0.05);
    return p.lowerBetter ? Math.round(p.raw * (1 - pct)) : Math.round(p.raw * (1 + pct) * (p.raw < 10 ? 100 : 10)) / (p.raw < 10 ? 100 : 10);
  }
  return null;
}
function fmtPart(sport: ScoreSport, p: ScorePart, extra: any): (v: number) => string {
  if (p.key === 'thr' && sport === 'run') return v => mmss(v) + '/km';
  if (p.key === 'thr' && sport === 'bike') return extra.usePower ? (v => `${Math.round(v * extra.weight)} W (${de(v, 1)} W/kg)`) : (v => `${de(v)} km/h`);
  if (p.key === 'css') return v => mmss(v) + '/100 m';
  if (p.key === 'cont') return v => Math.round(v) + ' m';
  if (p.key === 'long') return v => Math.round(v) + ' min';
  if (p.key === 'dec') return v => de(v) + ' %';
  if (p.key === 'reg') return v => de(v) + ' pro Woche';
  return v => de(v);
}
function diffPart(sport: ScoreSport, p: ScorePart, extra: any): (a: number, b: number) => string {
  if (p.key === 'thr' && sport === 'run') return (a, b) => `${Math.round(Math.abs(a - b))} s`;
  if (p.key === 'css') return (a, b) => `${Math.round(Math.abs(a - b))} s pro 100 m`;
  if (p.key === 'thr' && sport === 'bike') return extra.usePower ? ((a, b) => `${Math.round(Math.abs(a - b) * extra.weight)} W`) : ((a, b) => `${de(Math.abs(a - b))} km/h`);
  if (p.key === 'cont') return (a, b) => `${Math.round(Math.abs(a - b))} m`;
  if (p.key === 'long') return (a, b) => `${Math.round(Math.abs(a - b))} min`;
  return (a, b) => de(Math.abs(a - b));
}
/* Wert → Position auf der Skala des Teils (für den Balken) */
function posOf(sport: ScoreSport, key: string, v: number, c: Ctx, extra: any): number {
  if (sport === 'run' && (key === 'thr' || key === 'eff')) return scale(SCALES.runVdot, vdotFromThreshold(1000 / v * c.f));
  if (sport === 'bike' && key === 'thr') return extra.usePower ? scale(SCALES.bikeWkg, v * c.f) : scale(SCALES.bikeKmh, (extra.mainKind === 'gravel' ? v / GRAVEL_F : v) * Math.cbrt(c.f));
  if (key === 'css') return scale(SCALES.swimCss, v / c.f);
  if (key === 'cont') return scale(SCALES.swimCont, v);
  if (key === 'long') return scale(sport === 'bike' ? SCALES.longRide : SCALES.longRun, v);
  if (key === 'dec') return scale(SCALES.dec, v);
  if (key === 'reg') return scale(SCALES.strengthWeek, v);
  return 0;
}
function needOf(sport: ScoreSport, key: string, R: Requirement, extra: any): number | null {
  if (sport === 'run' && key === 'thr') return R.runThresholdSecKm || null;
  if (sport === 'run' && key === 'long') return R.longRunMin || null;
  if (sport === 'bike' && key === 'thr') return extra.usePower ? (R.bikeFtpWkg || null) : R.bikeThresholdKmh ? Math.round((extra.mainKind === 'gravel' ? R.bikeThresholdKmh * GRAVEL_F : R.bikeThresholdKmh) * 10) / 10 : null;
  if (sport === 'bike' && key === 'long') return R.longRideMin || null;
  if (sport === 'swim' && key === 'css') return extra.canCrawl ? R.swimCss100 || null : null;
  if (sport === 'swim' && key === 'cont') return R.longSwimM || null;
  return null;
}
function addMarks(sport: ScoreSport, now: ReturnType<typeof scoreAt>, past: ReturnType<typeof scoreAt>, inp: ScoreInput): { stages: Record<string, StageGoal>; reached: { key: string; text: string }[] } {
  const stages: Record<string, StageGoal> = {}; const reached: { key: string; text: string }[] = [];
  const extra = now.raw.extra;
  for (const p of now.parts) {
    if (p.raw == null) continue;
    const fmt = fmtPart(sport, p, extra), diff = diffPart(sport, p, extra);
    const lower = !!p.lowerBetter;
    const id = `${sport}.${p.key}`;
    const need = needOf(sport, p.key, now.c.need, extra);
    if (need != null) { const m = markText('need', 'Für dein Ziel nötig', need, p.raw, lower, fmt, diff); p.marks.push({ kind: 'need', label: 'Für dein Ziel nötig', raw: need, text: m.text, done: m.done, pos: posOf(sport, p.key, need, now.c, extra) }); }
    // Etappenziel: gespeichert lassen, bis es erreicht ist (oder 10 Wochen alt); Tempo nach dem eigenen Fortschritt der letzten 8 Wochen
    const q = past.parts.find(x => x.key === p.key);
    const rate = q && q.raw ? (lower ? (q.raw - p.raw) / q.raw : (p.raw - q.raw) / q.raw) : 0;
    let st = inp.stages && inp.stages[id];
    const hit = st && (lower ? p.raw <= st.target : p.raw >= st.target);
    if (st && hit) { reached.push({ key: id, text: `${SPORT_LABEL[sport]}: Etappenziel erreicht, ${p.label} ${fmt(p.raw)} (Ziel war ${fmt(st.target)}).` }); st = undefined; }
    if (st && st.set < addDays(inp.today, -70)) st = undefined;
    if (!st) { const nx = nextFor(sport, p, rate); if (nx != null && nx !== p.raw) st = { target: nx, from: p.raw, set: inp.today }; }
    if (st) { stages[id] = st; p.marks.push({ kind: 'next', label: 'Nächstes Etappenziel', raw: st.target, text: `Nächstes Etappenziel: ${fmt(st.target)}`, done: false, pos: posOf(sport, p.key, st.target, now.c, extra) }); }
    if (now.c.wish) {
      const w = needOf(sport, p.key, now.c.wish, extra);
      if (w != null && (p.key === 'thr' || p.key === 'css') && w !== need) { const m = markText('wish', 'Wunschzeit', w, p.raw, lower, fmt, diff); p.marks.push({ kind: 'wish', label: 'Wunschzeit', raw: w, text: m.text, done: m.done, pos: posOf(sport, p.key, w, now.c, extra) }); }
    }
    p.target = p.marks.map(m => m.text).join(' · ') || p.target;
  }
  return { stages, reached };
}

/* Was bringt am meisten? Jeder Teil auf sein nächstes Etappenziel → Zuwachs im Score */
function gainsOf(sport: ScoreSport, now: ReturnType<typeof scoreAt>): Gain[] {
  const have = now.parts.filter(p => p.sub != null); const wsum = have.reduce((a, p) => a + p.weight, 0) || 1;
  const extra = now.raw.extra;
  const out: Gain[] = [];
  for (const p of have) {
    const nx = p.marks.find(m => m.kind === 'next'); if (!nx) continue;
    const delta = Math.round((nx.pos - p.sub!) * p.weight / wsum);
    if (delta < 1) continue;
    const what = sport === 'swim' && p.key === 'cont' ? `Kraul am Stück auf ${fmtPart(sport, p, extra)(nx.raw)}` : p.key === 'long' ? `${p.label.replace(/ \(Fragebogen\)/, '')} auf ${fmtPart(sport, p, extra)(nx.raw)}` : `${p.label} auf ${fmtPart(sport, p, extra)(nx.raw)}`;
    out.push({ key: p.key, text: `${what} → +${delta}`, delta });
  }
  // fehlende Messungen: genauer statt höher
  now.parts.filter(p => p.sub == null).forEach(p => out.push({ key: p.key, text: p.key === 'dec' ? 'Eine lockere Einheit ab 60 min mit Puls aufzeichnen (Entkopplung) → Score genauer' : p.key === 'tech' ? 'Züge pro Bahn eintragen → Technik zählt mit' : `${p.label} messen → Score genauer`, delta: 0 }));
  return out.sort((a, b) => b.delta - a.delta).slice(0, 3);
}

/* Die 2-3 Kennzahlen, die den Score zuletzt am meisten bewegt haben */
function whyTexts(sport: ScoreSport, now: ReturnType<typeof scoreAt>, then: ReturnType<typeof scoreAt>, delta: number): string[] {
  const label = SPORT_LABEL[sport];
  const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
  const out: { w: number; t: string }[] = [];
  const have = now.parts.filter(p => p.sub != null); const wsum = have.reduce((a, p) => a + p.weight, 0) || 1;
  now.parts.forEach(p => {
    const q = then.parts.find(x => x.key === p.key);
    if (p.sub == null || !q || q.sub == null) return;
    const contrib = Math.round((p.sub - q.sub) * p.weight / wsum);
    let t = '';
    if (sport === 'run' && p.key === 'eff' && now.raw.extra.eff && then.raw.extra.eff) {
      const ref = 1000 / 360; // Bezug: 6:00/km
      const d = Math.round(ref * 60 / then.raw.extra.eff - ref * 60 / now.raw.extra.eff);
      if (Math.abs(d) < 2 && !contrib) return;
      t = d > 0 ? `${d} Schläge weniger Puls bei gleicher Pace wie vor 3 Wochen` : `${-d} Schläge mehr Puls bei gleicher Pace als vor 3 Wochen`;
    } else {
      if (!contrib) return;
      t = `${p.label} ${p.value} (vor 3 Wochen ${q.value})`;
    }
    out.push({ w: Math.abs(contrib) || 0.5, t: contrib ? `${sign(contrib)} ${label}: ${t}` : `${label}: ${t}` });
  });
  out.sort((a, b) => b.w - a.w);
  const list = out.slice(0, 3).map(x => x.t);
  if (!list.length) list.push(delta === 0 ? 'Zu wenig neue Messungen für eine Veränderung. Der Score bewegt sich, sobald Einheiten mit Puls und Tempo dazukommen.' : 'Neue Messungen haben den Wert etwas verschoben.');
  return list;
}
function confTextOf(sport: ScoreSport, s: ReturnType<typeof scoreAt>): string {
  const r = s.raw; const lvl = s.confidence >= 0.6 ? 'hoch' : s.confidence >= 0.3 ? 'mittel' : 'niedrig';
  const what = { run: 'Läufe', bike: 'Fahrten', swim: 'Schwimmeinheiten', strength: 'Krafteinheiten' }[sport];
  const watch = r.n ? Math.round((1 - r.manualShare) * r.n) : 0;
  const bits = [r.n ? `${r.n} ${what} im letzten Messfenster (6 Wochen)${sport !== 'strength' ? `, ${watch ? `davon ${watch} von der Uhr` : 'alle von Hand eingetragen'}` : ''}` : `noch keine verwertbaren ${what}`];
  if (r.latest && s.ageDays > 10) bits.push(`letzte vor ${Math.round(s.ageDays)} Tagen`);
  if (/Schätzung/.test(r.levelSource)) bits.push('Hauptwert nur aus dem Profil geschätzt (ein Test macht ihn genau)');
  else if (sport !== 'strength' && !r.evidence?.length) bits.push('Hauptwert aus dem Profil, keine neue Leistungsmessung');
  return `Sicherheit ${lvl}: ${bits.join('; ')}.`;
}

export function sportScores(inp: ScoreInput, sports: ScoreSport[] = ['swim', 'bike', 'run', 'strength']): SportScore[] {
  return sports.map(sport => {
    const now = scoreAt(sport, inp, inp.today);
    const then = scoreAt(sport, inp, addDays(inp.today, -21));
    const past = scoreAt(sport, inp, addDays(inp.today, -56));
    const marks = addMarks(sport, now, past, inp);
    const trend = [35, 28, 21, 14, 7, 0].map(d => ({ date: addDays(inp.today, -d), score: d === 0 ? now.score : d === 21 ? then.score : scoreAt(sport, inp, addDays(inp.today, -d)).score }));
    const counted = [...now.raw.counted].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    // Auftrag 19: „Warum?“ = Umstieg (falls nötig), die letzten 3-5 Einheiten mit +/− und Grund, dann was sich sonst bewegt hat
    const steps = stepLines(sport, now, inp.today);
    const sw = switchLine(sport, inp, now);
    const rest = whyTexts(sport, now, then, now.score - then.score).filter(x => !steps.length || !/^Zu wenig neue Messungen|^Neue Messungen haben/.test(x));
    const why = [...(sw ? [sw] : []), ...steps, ...rest.slice(0, 3)];
    return { sport, score: now.score, measured: now.measured, confidence: now.confidence, confText: confTextOf(sport, now), level: levelLabel(now.score), parts: now.parts, trend,
      range: now.range, rangeText: rangeTextOf(now.range),
      why, basis: inp.goal ? inp.goal.name : 'allgemeine Fitness', counted, gains: gainsOf(sport, now), stages: marks.stages, reached: marks.reached };
  });
}

/* Gesamt-Form: Fitness (CTL) je Sport im Verhältnis zu dem, was das Ziel braucht */
export function formScore(inp: ScoreInput): FormScore {
  const req = requirementFor(inp.goal, inp.profile);
  const ctlOf = (loads: Record<string, number>) => {
    return loadSeriesFromDaily(loads, [], inp.today, inp.settings).at(-1)?.ctl || 0;
  };
  const bySport: FormScore['bySport'] = {};
  const all: Record<string, number> = {};
  Object.entries(inp.loadsBySport || {}).forEach(([sp, loads]) => {
    Object.entries(loads).forEach(([d, v]) => { all[d] = (all[d] || 0) + v; });
    const target = (req.ctlBySport as any)[sp];
    if (target) bySport[sp as ScoreSport] = { ctl: ctlOf(loads), target };
  });
  const total = loadSeriesFromDaily(all, inp.trend, inp.today, inp.settings).at(-1)?.ctl ?? 0;
  return { ctl: total || null, target: req.ctl, score: clamp(Math.round(total / req.ctl * 100)), bySport };
}

/* Alte Einträge ohne Aufzeichnung (Werte von Hand oder von intervals.icu) als einfache Aktivitäten, damit sie zählen */
export function legacyActivities(state: any, weeks: any[], profile: Profile): Activity[] {
  const out: Activity[] = [];
  const num = (v: any) => { if (v == null || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
  const pace = (v: any) => { const m = /^(\d+)[:.,](\d{1,2})$/.exec(String(v || '').trim()); return m ? +m[1] * 60 + +m[2] : null; };
  const add = (id: string, date: string, sport: string, m: any, title: string, s: any, plannedMin?: number | null) => {
    if (!m) return;
    const min = num(m.min), km = num(m.km), hr = num(m.hr), meters = num(m.meters);
    if (!min && !km && !meters && !num(m.power) && !num(m.speed) && !pace(m.pace) && sport !== 'strength') return;
    let paceSec = pace(m.pace); if (!paceSec && km && min && sport === 'run') paceSec = min * 60 / km;
    let speed = num(m.speed); if (!speed && km && min && sport === 'bike') speed = km / (min / 60);
    const sp = sport === 'run' && paceSec ? 1000 / paceSec : sport === 'bike' && speed ? speed / 3.6 : null;
    // Pace aus Gesamtzeit nur, wenn sie wie Schwimmen am Stück aussieht (Technik-Einheiten mit Pausen sonst viel zu langsam)
    const p100raw = meters && min ? min * 60 / (meters / 100) : null;
    const p100 = pace(m.pace100) || (p100raw && p100raw <= 200 ? p100raw : null);
    const spl = num(m.spl), dps = num(m.dps);
    const indoor = m.indoor === 'in' || (sport === 'bike' && /rolle|trainer|indoor|zwift|home ?trainer/i.test(title || ''));
    const effMin = min ?? (km && paceSec ? Math.round(km * paceSec / 60) : km && speed ? Math.round(km / speed * 60) : null);
    out.push({
      id: 'sess-' + id, source: (s && s.source) || 'manual', sources: [(s && s.source) || 'manual'], sport: sport as any, date, startMs: Date.parse(date + 'T12:00:00Z'), name: title,
      indoor, bikeType: m.bikeType || null, min: effMin != null ? Math.round(effMin) : null, elapsedMin: null, km: sport === 'swim' ? (meters ? meters / 1000 : null) : km,
      avgHr: hr, maxHr: num(m.maxHr), avgPower: num(m.power), avgCadence: num(m.cadence), speedKmh: sp && sport !== 'swim' ? Math.round(sp * 36) / 10 : null, paceSecKm: sport === 'run' ? paceSec : null,
      ascentM: null, kcal: null, tempC: num(s && s.temp), hrZones: null, decouplingPct: num(m.decoupling),
      efficiency: sp && hr ? Math.round(sp * 60 / hr * 100) / 100 : null,
      laps: [], intervals: null,
      swim: sport === 'swim' ? { poolLengthM: (profile.skills || {}).poolM === 50 ? 50 : 25, lengths: 0, activeLengths: 0, strokesPerLength: spl, metersPerStroke: dps || (spl ? Math.round(25 / spl * 100) / 100 : null), pace100: p100 ? Math.round(p100) : null, byStroke: {}, longestContinuousM: num(m.longestCrawl), strokeRate: num(m.rate) } : null,
      rpe: num(s && s.rpe)
    } as Activity);
  };
  planDays(weeks).forEach(d => d.sessions.forEach(s => { const st = (state.sessions || {})[s.id]; if (st && st.completed && !st.activityId) add(s.id, d.date, s.sport, st.metrics || {}, s.title, { ...st, zone: s.zone }, s.plannedMinutes); }));
  Object.entries(state.customWorkouts || {}).forEach(([d, l]) => (l as any[] || []).forEach((w: any) => { if (!w.activityId && w.completed !== false) add(w.id, d, w.sport, actualMetrics(w), w.title, w, null); }));
  return out;
}

/* Geschätzte Werte zu einem Stichtag (für Prognose und Plan) */
export interface Estimates {
  runThrSpeed: number | null; runEff: number | null; bikeThrKmh: number | null; ftp: number | null; swimCss: number | null; nRun: number; nBike: number; nSwim: number;
  /** Auftrag 12: Ausdauer und Datenlage für die Prognose */
  runLongMin?: number | null; runDec?: number | null; bikeLongMin?: number | null; bikeDec?: number | null; swimContM?: number | null; swimCanCrawl?: boolean;
  runManual?: number; bikeManual?: number; swimManual?: number; runLatest?: string | null; bikeLatest?: string | null; swimLatest?: string | null;
  /** Streuung der Schwellen-Schätzungen (Variationskoeffizient) */
  runSpread?: number | null; bikeSpread?: number | null;
  /** Schwelle Rad als Rennrad-Äquivalent (km/h), Hauptrad */
  bikeMainKind?: 'road' | 'gravel';
}
export function estimatesAt(inp: ScoreInput, end: string): Estimates {
  const r = runRaw(ctxFor('run', inp, end)), b = bikeRaw(ctxFor('bike', inp, end)), s = swimRaw(ctxFor('swim', inp, end));
  const cv = (list: number[]) => { if (list.length < 3) return null; const m = list.reduce((a, x) => a + x, 0) / list.length; const sd = Math.sqrt(list.reduce((a, x) => a + (x - m) * (x - m), 0) / list.length); return m ? sd / m : null; };
  const runSp = inp.activities.filter(a => a.sport === 'run' && inWindow(a, end, WINDOW) && a.speedKmh && a.avgHr).map(a => a.speedKmh! / runFrac(a.avgHr! / (inp.profile.thresholds.lthrRun || 170)));
  const bikeSp = inp.activities.filter(a => a.sport === 'bike' && inWindow(a, end, WINDOW) && a.speedKmh && a.avgHr && !a.indoor).map(a => thrSpeedFromRide(a.speedKmh!, a.avgHr!, inp.profile.thresholds.lthrBike || 165));
  return {
    runThrSpeed: r.extra.thrSpeed, runEff: r.extra.eff, bikeThrKmh: b.extra.thrKmh, ftp: b.extra.ftp, swimCss: s.extra.css, nRun: r.n, nBike: b.n, nSwim: s.n,
    runLongMin: r.extra.longest, runDec: r.extra.dec, bikeLongMin: b.extra.longest, bikeDec: b.extra.dec, swimContM: s.extra.cont, swimCanCrawl: s.extra.canCrawl,
    runManual: r.manualShare, bikeManual: b.manualShare, swimManual: s.manualShare, runLatest: r.latest, bikeLatest: b.latest, swimLatest: s.latest,
    runSpread: cv(runSp), bikeSpread: cv(bikeSp), bikeMainKind: b.extra.mainKind
  };
}
