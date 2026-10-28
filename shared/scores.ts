import {effectiveCustomBuckets} from './custom-state26';
import { actualMetrics, crawlOf } from './results';
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
import { vdotFromThreshold, vdot as vdotOf } from './vdot';
import { loadSeriesFromDaily } from './load';
import { bikeSpeedsOf, kindOf, powerFracFromHr, thrSpeedFromRide, GRAVEL_F, BIKE_KIND_LABEL, type BikeKind } from './bikespeed';
import { runFilter, obsSd, rpeFrac, zForPts, type FObs, type FResult, type FOpts20 } from './scorefilter';

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
  sport: ScoreSport; score: number; /** Evidence-backed score; null for a profile/start estimate. score remains available to low-data UI. */ measured: number | null; confidence: number; confText: string; level: string;
  /** Auftrag 19: Bereich der Schätzung (± Punkte) und Text dazu („± 4, wenig Daten“) */
  range: number; rangeText: string;
  /** Auftrag 20: vorläufig (weniger als 5 brauchbare Einheiten und kein Test) */
  provisional: boolean;
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
interface Ctx { inp: ScoreInput; end: string; req: Requirement; need: Requirement; wish: Requirement | null; f: number;
  /** Auftrag 20: true = Rechnung von Auftrag 19 (nur zum Vergleich beim Umstieg) */ legacy?: boolean;
  /** Profil ohne ausgeblendete Werte */ prof0?: Profile }
interface Raw { parts: ScorePart[]; n: number; counted: Counted[]; latest: string | null; manualShare: number; levelSource: string; extra: any; evidence?: Est[];
  /** Auftrag 19: laufende Schätzung des Hauptwerts; sub(z) rechnet in Punkte des Hauptteils um */
  filter?: FResult | null; sub?: (z: number) => number; mainKey?: string; priorSd?: number;
  /** Auftrag 20: was nicht gezählt hat (mit Grund) und der Startwert */
  ignored?: Ignored[]; prior?: { z: number; sd: number } }

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

/* ---------- Auftrag 20: Datenqualität je Wert ----------
   Watt zählen nur von einem Wattmesser (draußen) oder einem Smart-Trainer mit Watt (drinnen); die Geschwindigkeit von der Rolle zählt nie
   (bei der einfachen Rolle ist sie geschätzt, beim Smart-Trainer zählen die Watt). Laufband-Pace zählt schwächer. GPS-Ausreißer
   (unrealistische Werte) zählen nicht. Bei niedrigem Puls (unter 80 % der Schwelle) wird nur vorsichtig hochgerechnet: die Messung zählt
   weniger; unter 60 % sagt sie nichts über die Leistung. Was nicht zählt, steht mit Grund im „Warum?“. */
export interface Ignored { date: string; title: string; value: string; why: string; key: 'trainer' | 'watts' | 'gps' | 'lowhr' | 'intervals' | 'swim' }
export const isSmartTrainer = (p: Pick<Profile, 'trainerType' | 'powerMeter'>) => p.trainerType === 'smart' || (p.trainerType == null && !!p.powerMeter);
/* Stammen die Watt dieser Fahrt von einem Messgerät? */
export function wattsTrusted(a: Pick<Activity, 'indoor' | 'bikeType' | 'name'>, p: Pick<Profile, 'trainerType' | 'powerMeter' | 'bikes'>): boolean {
  const k = kindOf({ indoor: a.indoor, bikeType: a.bikeType, name: a.name }, p);
  return k === 'indoor' ? isSmartTrainer(p) : !!p.powerMeter;
}
/* realistische Grenzen (Durchschnitt) */
const GPS_MAX: Record<string, number> = { run: 23, bike: 52 };
function gpsBad(a: Activity): string | null {
  const max = GPS_MAX[a.sport]; if (!max || a.indoor) return null;
  if (a.speedKmh && a.speedKmh > max) return `${de(a.speedKmh)} km/h im Schnitt ist unrealistisch`;
  // Strecke und Zeit passen nicht zusammen (Sprünge im GPS)
  if (a.km && a.min && a.min >= 10) { const v = a.km / (a.min / 60); if (v > max * 1.05) return `${de(a.km)} km in ${a.min} min ist unrealistisch`; }
  return null;
}
const lapOk = (sport: string, sp?: number | null) => !sp || sp * 3.6 <= (GPS_MAX[sport] || 99) * 1.15;
/* Messung bei niedrigem Puls: Unsicherheit wächst, je weiter der Puls unter 80 % der Schwelle liegt */
const lowHrSd = (base: number, frac: number) => frac >= 0.8 ? base : base + 0.6 * (0.8 - frac);
const LOW_HR_TXT = 'Puls niedrig, nur vorsichtig hochgerechnet';
const VERY_LOW_HR = 'Puls sehr niedrig (unter 60 % der Schwelle), sagt nichts über die Leistung';
const IV_TXT = 'Intervalle ohne passende Runden, der Durchschnitt sagt wenig';

function filterFor(c: Ctx, sport: string, obs: FObs[], v20?: { prior: { z: number; sd: number }; o: FOpts20 } | null): FResult | null {
  const td = trainDays(c, sport);
  if (c.legacy || !v20) return obs.length ? runFilter({ obs, trained: td.trained, cross: td.cross, illness: c.inp.illness || [], end: c.end, prior: null }) : null;
  return runFilter({ obs, trained: td.trained, cross: td.cross, illness: c.inp.illness || [], end: c.end, prior: v20.prior, v20: v20.o });
}
type Add = (v: number, kind: FObs['kind'], base: number, value: string, extra?: string) => void;
function adder(c: Ctx, a: Activity, out: FObs[], log = true): Add {
  return (v, kind, base, value, extra) => {
    if (!Number.isFinite(v) || (log && !(v > 0))) return;
    const q = obsSd(base, a, c.inp.illness || []);
    out.push({ id: a.id, date: a.date, z: log ? Math.log(v) : v, sd: q.sd, kind, title: titleOf(a), value, ill: q.ill, manual: q.manual, extra });
  };
}
function runObs(c: Ctx, lthr: number, ign: Ignored[] = []): FObs[] {
  const out: FObs[] = [];
  const v20 = !c.legacy;
  // Auftrag 20: Schwellenpuls nur geschätzt (kein Test) → alles, was über den Puls rechnet, ist ungenauer
  const hrF = v20 && (c.inp.profile.thresholds.estimated || []).includes('lthrRun') ? 1.3 : 1;
  historyActs(c, 'run').forEach(a => {
    if (!a.min || a.min < 10) return;
    const add0 = adder(c, a, out);
    const val0 = a.speedKmh ? `${mmss(3600 / a.speedKmh)}/km${a.avgHr ? ` bei Puls ${a.avgHr}` : ''}` : '';
    if (v20) { const g = gpsBad(a); if (g) { ign.push({ date: a.date, title: titleOf(a), value: val0, why: `GPS-Fehler: ${g}`, key: 'gps' }); return; } }
    // Laufband: Tempo ungenau (Kalibrierung), zählt schwächer
    const tm = v20 && !!a.indoor;
    const add: Add = (v, kind, base, value, extra) => add0(v, kind, (tm ? base * 1.6 : base) * (kind === 'effort' || kind === 'laps' || kind === 'hr' ? hrF : 1), value, [tm ? 'Laufband, zählt weniger' : '', extra || ''].filter(Boolean).join(', ') || undefined);
    if (a.avgHr && a.speedKmh && a.min >= 15 && a.min <= 75 && a.avgHr >= 0.92 * lthr) {
      const test = TEST_RE.test(a.name || '');
      add(a.speedKmh / 3.6 * flatSpeedFactor(a) * heatFactor(a) * lthr / a.avgHr, test ? 'test' : 'effort', test ? 0.025 : 0.035, `${mmss(3600 / a.speedKmh)}/km bei Puls ${a.avgHr}`);
      return;
    }
    const laps = (a.laps || []).filter(l => l.kind === 'work' && l.sec >= 180 && l.speed && l.avgHr && l.avgHr >= 0.9 * lthr && (!v20 || lapOk('run', l.speed)));
    if (laps.length) {
      const v = wmedian(laps.map(l => ({ v: l.speed! * lthr / l.avgHr! * 0.98, w: 1, date: a.date })));
      // Auftrag 20: Runden eines Tests (z. B. die 30 min im Lauftest) zählen als Test
      const tl = v20 && TEST_RE.test(a.name || '');
      if (v) { add(v, tl ? 'test' : 'laps', tl ? 0.025 : 0.045, `${tl ? 'Test' : 'Intervalle'} ${mmss(1000 / laps[0].speed!)}/km bei Puls ${laps[0].avgHr}`); return; }
    }
    if ((intervalsOf(a) || { count: 0 }).count >= 2) { if (v20 && a.speedKmh) ign.push({ date: a.date, title: titleOf(a), value: val0, why: IV_TXT, key: 'intervals' }); return; }
    const sp = a.speedKmh ? a.speedKmh / 3.6 : a.efficiency && a.avgHr ? a.efficiency * a.avgHr / 60 : null;
    if (!sp) return;
    if (a.avgHr && a.avgHr < 0.92 * lthr) {
      const fr = a.avgHr / lthr;
      if (v20 && fr < 0.6) { ign.push({ date: a.date, title: titleOf(a), value: val0, why: VERY_LOW_HR, key: 'lowhr' }); return; }
      add(sp * flatSpeedFactor(a) * heatFactor(a) / runFrac(fr), 'hr', v20 ? lowHrSd(0.06, fr) : 0.06, `${mmss(1000 / sp)}/km bei Puls ${a.avgHr}`, v20 && fr < 0.8 ? LOW_HR_TXT : undefined); return;
    }
    const fr = !a.avgHr && a.rpe != null && a.min >= 20 ? rpeFrac(a.rpe) : null;
    if (fr) add(sp * flatSpeedFactor(a) / runFrac(fr), 'rpe', 0.09, `${mmss(1000 / sp)}/km, Gefühl ${a.rpe}/10`);
  });
  return out;
}
function bikeObs(c: Ctx, lthr: number, power: boolean, ign: Ignored[] = []): FObs[] {
  const out: FObs[] = [];
  const p = c.inp.profile;
  const v20 = !c.legacy;
  const hrF = v20 && (p.thresholds.estimated || []).includes('lthrBike') ? 1.3 : 1;
  historyActs(c, 'bike').forEach(a => {
    const k = kindOf({ indoor: a.indoor, bikeType: a.bikeType, name: a.name }, p);
    if (v20 && !power && k === 'indoor' && !isSmartTrainer(p) && (a.speedKmh || a.km || a.avgPower) && (!a.min || a.min < 15)) { ign.push({ date: a.date, title: titleOf(a), value: [a.km ? `${de(a.km)} km` : '', a.avgPower ? `${Math.round(a.avgPower)} W` : '', a.avgHr ? `Puls ${a.avgHr}` : ''].filter(Boolean).join(', '), why: 'Rolle ohne Watt – Geschwindigkeit und Watt nicht aussagekräftig', key: 'trainer' }); return; }
    if (!a.min || a.min < 15) return;
    const add0 = adder(c, a, out);
    const add: Add = (v, kind, base, value, extra) => add0(v, kind, base * (kind === 'effort' || kind === 'hr' ? hrF : 1), value, extra);
    const iv = (intervalsOf(a) || { count: 0 }).count >= 2;
    if (power) {
      if (!a.avgPower) return;
      const W = Math.round(a.avgPower);
      // Auftrag 20: Watt nur von Wattmesser oder Smart-Trainer (sonst geschätzt, z. B. aus der Geschwindigkeit der Rolle)
      if (v20 && !wattsTrusted(a, p)) return;
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
      if (a.avgHr && a.avgHr <= 0.88 * lthr) {
        const fr = a.avgHr / lthr;
        if (v20 && fr < 0.6) { ign.push({ date: a.date, title: titleOf(a), value: `${W} W bei Puls ${a.avgHr}`, why: VERY_LOW_HR, key: 'lowhr' }); return; }
        add(a.avgPower / powerFracFromHr(fr), 'hr', v20 ? lowHrSd(0.08, fr) : 0.08, `${W} W bei Puls ${a.avgHr}`, v20 && fr < 0.8 ? LOW_HR_TXT : undefined); return;
      }
      const fr = !a.avgHr && a.rpe != null ? rpeFrac(a.rpe) : null;
      if (fr) add(a.avgPower / powerFracFromHr(fr), 'rpe', 0.1, `${W} W, Gefühl ${a.rpe}/10`);
      return;
    }
    if (k === 'indoor') {
      // drinnen ohne Leistung: Tempo zählt nicht (Auftrag 20: mit Grund im „Warum?“)
      if (v20 && (a.speedKmh || a.km || a.avgPower)) ign.push({ date: a.date, title: titleOf(a),
        value: [a.km ? `${de(a.km)} km` : a.speedKmh ? `${de(a.speedKmh)} km/h` : '', a.avgPower ? `${Math.round(a.avgPower)} W` : '', a.avgHr ? `Puls ${a.avgHr}` : ''].filter(Boolean).join(', '),
        why: isSmartTrainer(p) ? 'Geschwindigkeit auf der Rolle ist nur virtuell' : 'Rolle ohne Watt – Geschwindigkeit und Watt nicht aussagekräftig', key: 'trainer' });
      return;
    }
    if (v20 && a.avgPower && !wattsTrusted(a, p)) ign.push({ date: a.date, title: titleOf(a), value: `${Math.round(a.avgPower)} W`, why: 'Watt ohne Wattmesser sind nur geschätzt und zählen nicht', key: 'watts' });
    if (!a.speedKmh && !(v20 && (a.laps || []).some(l => l.speed))) return;
    if (v20 && a.speedKmh) { const g = gpsBad(a); if (g) { ign.push({ date: a.date, title: titleOf(a), value: `${de(a.speedKmh)} km/h`, why: `GPS-Fehler: ${g}`, key: 'gps' }); return; } }
    const roadEq = (kmh: number) => k === 'gravel' ? kmh / GRAVEL_F : kmh;
    // Auftrag 20: Runden an der Schwelle (z. B. die 20 min im Radtest) zählen ohne Watt über das Tempo, ein Test als Test
    const sl = v20 ? (a.laps || []).filter(l => l.kind === 'work' && l.sec >= 480 && l.speed && l.avgHr && l.avgHr >= 0.9 * lthr && lapOk('bike', l.speed)).sort((x, y) => y.sec - x.sec) : [];
    if (sl.length) {
      const l = sl[0]; const tl = TEST_RE.test(a.name || '');
      const flat = a.km && a.ascentM ? flatSpeedFactor(a) : 1;
      add(roadEq(l.speed! * 3.6 * flat * Math.cbrt(lthr / l.avgHr!) * (l.sec >= 1080 ? 0.97 : 0.95)), tl ? 'test' : 'laps', tl ? 0.025 : 0.04, `${de(l.speed! * 3.6)} km/h ${BIKE_KIND_LABEL[k]} über ${Math.round(l.sec / 60)} min bei Puls ${Math.round(l.avgHr!)}`);
      return;
    }
    if (!a.speedKmh) return;
    const sp = a.speedKmh * flatSpeedFactor(a) * heatFactor(a);
    const val = `${de(a.speedKmh)} km/h ${BIKE_KIND_LABEL[k]}`;
    if (a.avgHr && a.avgHr >= 0.9 * lthr && a.min >= 20) { add(roadEq(sp * Math.cbrt(lthr / a.avgHr)), TEST_RE.test(a.name || '') ? 'test' : 'effort', 0.03, `${val} bei Puls ${a.avgHr}`); return; }
    if (iv) { if (v20) ign.push({ date: a.date, title: titleOf(a), value: val, why: IV_TXT, key: 'intervals' }); return; }
    if (a.avgHr) {
      const fr = a.avgHr / lthr;
      if (v20 && fr < 0.6) { ign.push({ date: a.date, title: titleOf(a), value: `${val} bei Puls ${a.avgHr}`, why: VERY_LOW_HR, key: 'lowhr' }); return; }
      add(roadEq(thrSpeedFromRide(sp, a.avgHr, lthr)), 'hr', v20 ? lowHrSd(0.045, fr) : 0.045, `${val} bei Puls ${a.avgHr}`, v20 && fr < 0.8 ? LOW_HR_TXT : undefined); return;
    }
    const fr = a.rpe != null ? rpeFrac(a.rpe) : null;
    if (fr) add(roadEq(thrSpeedFromRide(sp, fr * lthr, lthr)), 'rpe', 0.07, `${val}, Gefühl ${a.rpe}/10`);
  });
  return out;
}
/* Aggregate pace cannot prove unaided crawl performance when the recorded session includes
   other strokes or equipment. Unknown style remains a weak pace estimate, never a test. */
function swimPaceEligible(a: Activity): boolean {
  const sw: any = a.swim;
  if (!sw || !(sw.pace100 > 4) || !Number.isFinite(sw.pace100)) return false;
  const strokes = Object.keys(sw.byStroke || {}).filter(k => sw.byStroke[k] > 0);
  if (strokes.some(k => !/^(freestyle|crawl|front_crawl)$/i.test(k))) return false;
  const gear = [sw.gear, sw.equipment, (a as any).gear, (a as any).equipment].flatMap(v => Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).filter(k => v[k]) : v ? [v] : []);
  return !(sw.longestPullM > 0) && !gear.some(g => /buoy|pull|fin|paddle|board|snorkel|floss|brett/i.test(String(g)));
}
function swimObs(c: Ctx): FObs[] {
  const out: FObs[] = [];
  const v20 = !c.legacy;
  historyActs(c, 'swim').forEach(a => {
    const pc = a.swim && a.swim.pace100; if (!pc || (v20 && !swimPaceEligible(a))) return;
    const cont = (v20 ? crawlOf(a) : a.swim?.longestContinuousM) || 0;
    // A session title does not establish the measured 400/200 m protocol; profile test updates handle it.
    const test = !v20 && TEST_RE.test(a.name || '');
    const add = adder(c, a, out, false);
    const value = `${mmss(pc)}/100 m${cont ? `, ${cont} m am Stück` : ''}`;
    // Auftrag 20: viel Brust oder Technik in der Einheit → das Tempo sagt weniger über die Kraul-Schwelle
    const bs: any = (a.swim && a.swim.byStroke) || {}; const tot = Object.values(bs).reduce((s: number, x: any) => s + (+x || 0), 0);
    const mixed = v20 && tot > 0 && (+bs.freestyle || 0) / tot < 0.7;
    const f = mixed ? 1.5 : 1; const ex = mixed ? 'gemischte Lagen, zählt weniger' : undefined;
    // CSS als −ln(Sekunden pro 100 m): größer = besser
    if (test) add(-Math.log(pc), 'test', 0.025, value);
    else if (cont >= 400) add(-Math.log(pc + 3), 'swimset', 0.03 * f, value, ex);
    else add(-Math.log(pc - 4), 'swimpace', 0.05 * f, value, ex);
  });
  return out;
}

/* ---------- Auftrag 20: vorsichtiger Startwert und Obergrenze ----------
   Startwert aus dem Profil (Test- oder Trendwert, Bestzeiten, sonst Erfahrung und Alter) mit großer Unsicherheit. Ohne Test nie über eine
   Grenze, die zum Niveau in den anderen Sportarten und zur Erfahrung in dieser Sportart passt (kein Rad-Score 80 bei einem Rad-Neuling). */
function sessionsIn(c: Ctx, sport: string): number { return historyActs(c, sport).filter(a => (a.min || 0) >= 10).length; }
function thrSpeedForVdot(v: number): number {
  let lo = 1, hi = 8;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (vdotFromThreshold(mid) < v) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
function bestRunVdot(p: Profile): number | null {
  const b = p.bests || {}; const list: [number | null | undefined, number][] = [[b.run5k, 5000], [b.run10k, 10000], [b.runHalf, 21097.5], [b.runMarathon, 42195]];
  let best: number | null = null;
  for (const [t, m] of list) if (t && t > 0) { const v = vdotOf(m, t / 60); if (v > 10 && v < 90 && (best == null || v > best)) best = v; }
  return best;
}
const TREND_SD = 0.08;
function runPrior(c: Ctx): { z: number; sd: number } {
  const p = c.inp.profile; const t = p.thresholds;
  const est = (t.estimated || []).includes('thresholdPaceRunSec');
  if (t.thresholdPaceRunSec > 0) return { z: Math.log(1000 / t.thresholdPaceRunSec), sd: est ? 0.1 : t.trendAt ? TREND_SD : 0.06 };
  const bv = bestRunVdot(p); if (bv) return { z: Math.log(thrSpeedForVdot(bv)), sd: 0.07 };
  // nichts bekannt: vorsichtig nach Erfahrung (VDOT 30-41), alters- und geschlechtsbereinigt
  const sk = p.skills || {};
  const v = 30 + Math.min(8, p.experienceYears || 0) + ((sk.runContinuousMin || 0) >= 60 ? 3 : 0);
  return { z: Math.log(thrSpeedForVdot(v) / c.f), sd: 0.15 };
}
/* Obergrenze (Punkte des Hauptteils) ohne Test: Neulinge in der Sportart (unter 15 Einheiten) höchstens 12 über dem Niveau der anderen
   Sportarten (mindestens 50), mit etwas Erfahrung (15-39) 25 darüber (mindestens 65), ab 40 Einheiten keine Grenze */
function capPts(c: Ctx, sport: ScoreSport, base: number | null): number | null {
  const n = sessionsIn(c, sport);
  if (n >= 40) return null;
  const b = base ?? 45;
  return n < 15 ? Math.max(50, b + 12) : Math.max(65, b + 25);
}
/* Niveau Laufen aus dem Startwert (Bezug für die Obergrenze im Rad) */
function runBasePts(c: Ctx): number | null {
  const p = c.inp.profile;
  if (!(p.thresholds.thresholdPaceRunSec > 0) && !bestRunVdot(p)) return null;
  const pr = runPrior(c);
  return scale(SCALES.runVdot, vdotFromThreshold(Math.exp(pr.z) * c.f));
}

// Letzte beobachtete Fähigkeit bleibt bei Pause bestehen. Nur die Sicherheit altert.
// Leere Kurz-Einträge dürfen weder das Fenster noch das Vertrauen erneuern.
function evidenceActivities(c: Ctx, sport: ScoreSport): { end: string; activities: Activity[] } {
  const valid = c.inp.activities.filter(a => a.sport === sport && !a.mergedInto && a.date <= c.end && (a.min == null || (Number.isFinite(a.min) && a.min >= 0)) && (c.legacy || !gpsBad(a)) &&
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
  const { end, activities: runs0 } = evidenceActivities(c, 'run');
  const v20 = !c.legacy;
  // Auftrag 20: GPS-Fehler zählen nirgends
  const runs = v20 ? runs0.filter(a => !gpsBad(a)) : runs0;
  const lthr = inp.profile.thresholds.lthrRun || 170;
  const easy = runs.filter(a => a.avgHr && a.avgHr <= 0.89 * lthr && (!v20 || a.avgHr >= 0.6 * lthr) && !((intervalsOf(a) || { count: 0 }).count >= 2) && (a.speedKmh || a.efficiency));
  const counted: Counted[] = [];
  // Schwelle: harte Einheiten, Intervall-Runden, Profil (Test oder Schätzung); lockere Läufe über den Puls-Anteil
  const thr: Est[] = [];
  runs.forEach(a => {
    const local: Est[] = [];
    if (a.avgHr && a.speedKmh && a.min! >= 15 && a.min! <= 75 && a.avgHr >= 0.92 * lthr) { local.push({ v: a.speedKmh / 3.6 * flatSpeedFactor(a) * heatFactor(a) * lthr / a.avgHr, w: 1, date: a.date }); counted.push({ date: a.date, title: titleOf(a), value: `${mmss(3600 / a.speedKmh)}/km bei Puls ${a.avgHr} (hart)`, manual: isManual(a) }); }
    (a.laps || []).filter(l => l.kind === 'work' && l.sec >= 180 && l.speed && l.avgHr && l.avgHr >= 0.9 * lthr && (!v20 || lapOk('run', l.speed))).forEach(l => local.push({ v: l.speed! * lthr / l.avgHr! * 0.98, w: 0.8, date: a.date }));
    const v = wmedian(local);
    if (v != null) {
      thr.push({ v, w: weightOf(a, inp, end) * (v20 && a.indoor ? 0.6 : 1), date: a.date });
      if (!counted.some(x => x.date === a.date && x.title === titleOf(a))) counted.push({ date: a.date, title: titleOf(a), value: `${mmss(1000 / v)}/km aus Intervallrunden (Schätzung)`, manual: isManual(a) });
    }
  });
  const imp: Est[] = [];
  easy.forEach(a => {
    const sp = a.speedKmh ? a.speedKmh / 3.6 : (a.efficiency! * a.avgHr! / 60);
    const lowF = v20 && a.avgHr! < 0.8 * lthr ? 0.5 : 1;
    imp.push({ v: sp * flatSpeedFactor(a) * heatFactor(a) / runFrac(a.avgHr! / lthr), w: weightOf(a, inp, end) * lowF * (v20 && a.indoor ? 0.6 : 1), date: a.date });
    counted.push({ date: a.date, title: titleOf(a), value: `${mmss(1000 / sp)}/km bei Puls ${a.avgHr}${v20 && a.indoor ? ' (Laufband)' : ''}`, manual: isManual(a) });
  });
  const t = inp.profile.thresholds;
  const est = (t.estimated || []).includes('thresholdPaceRunSec');
  const impMed = wmedian(imp.filter(x => x.date > addDays(end, -RECENT)));
  const evidence = [...thr, ...imp.map(x => ({ ...x, w: x.w * 0.5 }))];
  const f = c.f;
  const lvl = (sp: number) => scale(SCALES.runVdot, vdotFromThreshold(sp * f));
  // Auftrag 20: Startwert + Unsicherheit, Ausreißer gedämpft, Wochengrenze, Obergrenze (Auftrag 19: alte Rechnung nur zum Vergleich)
  const ign: Ignored[] = [];
  const obs = runObs(c, lthr, ign);
  const prior = runPrior(c);
  const pts = (z: number) => lvl(Math.exp(z));
  const cap = v20 ? capWith(capPts(c, 'run', null), prior, pts) : null;
  const flt = filterFor(c, 'run', obs, v20 ? { prior, o: { pts, weekPts: WEEK_PTS.run, capZ: cap != null ? zForPts(pts, cap, prior.z) : null } } : null);
  const thrSpeed = flt ? Math.exp(flt.z) : wmedian(evidence) ?? (t.thresholdPaceRunSec > 0 ? 1000 / t.thresholdPaceRunSec : null);
  const effSpeed = impMed && thrSpeed ? clamp(impMed, thrSpeed * 0.85, thrSpeed * 1.15) : null;
  const effs = easy.filter(a => inWindow(a, end, RECENT) && a.efficiency && (!v20 || !a.indoor)).map(a => ({ v: a.efficiency! * heatFactor(a) * flatSpeedFactor(a), w: weightOf(a, inp, end), date: a.date }));
  const eff = wmedian(effs);
  const decs = runs.filter(a => a.decouplingPct != null && a.min! >= 30).map(a => ({ v: a.decouplingPct!, w: weightOf(a, inp, end) * (a.min! >= 45 ? 1 : 0.5), date: a.date }));
  const dec = wmedian(decs);
  const easyMins = runs.filter(a => !a.avgHr || a.avgHr <= 0.9 * lthr).map(a => a.min || 0);
  const skillCont = (inp.profile.skills || {}).runContinuousMin || null;
  // Auftrag 19: kurze Läufe im Fenster sind kein Beweis, dass ein längerer nicht geht: höchster Wert aus Einheiten und Fragebogen
  const runMax = easyMins.length ? Math.max(...easyMins) : null;
  const longest = runMax != null && skillCont != null ? Math.max(runMax, skillCont) : runMax ?? skillCont;
  const longFromSkill = longest != null && longest !== runMax;
  const parts: ScorePart[] = [
    mk('thr', 'Schwellen-Pace', 0.65, thrSpeed ? 1000 / thrSpeed : null, thrSpeed ? lvl(thrSpeed) : null, thrSpeed ? mmss(1000 / thrSpeed) + '/km' : '–', { lowerBetter: true }),
    mk('eff', 'Effizienz locker', 0, effSpeed ? 1000 / effSpeed : null, effSpeed ? lvl(effSpeed) : null, eff ? `${de(eff, 2)} m pro Herzschlag${effSpeed ? ` (≈ ${mmss(1000 / effSpeed)}/km an der Schwelle)` : ''}` : '–', { lowerBetter: true }),
    mk('long', !longFromSkill ? 'Längster lockerer Lauf' : 'Laufen am Stück (Fragebogen)', 0.2, longest, longest ? scale(SCALES.longRun, longest) : null, longest ? longest + ' min' : '–'),
    mk('dec', 'Aerobe Entkopplung', 0.15, dec, dec != null ? scale(SCALES.dec, dec) : null, dec != null ? de(dec) + ' %' : '–', { lowerBetter: true, target: 'unter 5 %' })
  ];
  const latest = runs.map(a => a.date).sort().pop() || null;
  const fromData = v20 ? !!(flt && flt.usable) : thr.length > 1 || imp.length || !!flt;
  return { evidence, parts, n: runs.length, counted, latest, manualShare: runs.length ? runs.filter(isManual).length / runs.length : 1, levelSource: fromData ? 'Einheiten' : est ? 'Schätzung aus dem Profil' : t.thresholdPaceRunSec > 0 ? t.source || 'Profil' : 'Schätzung aus dem Profil', extra: { thrSpeed, eff, dec, longest, impMed },
    filter: flt, sub: pts, mainKey: 'thr', priorSd: est ? 0.1 : 0.05, ignored: ign, prior };
}

/* ---------- Rad ---------- */
function bikeRaw(c: Ctx): Raw {
  const { inp } = c;
  const { end, activities: rides0 } = evidenceActivities(c, 'bike');
  const p = inp.profile;
  const v20 = !c.legacy;
  const rides = v20 ? rides0.filter(a => !gpsBad(a)) : rides0;
  // Auftrag 20: Watt nur von Wattmesser oder Smart-Trainer
  const pw = (a: Activity) => !a.avgPower ? null : !v20 || wattsTrusted(a, p) ? a.avgPower : null;
  const powerOK = !v20 || !!p.powerMeter || isSmartTrainer(p);
  const lthr = p.thresholds.lthrBike || 165;
  const weight = p.weightKg || 70;
  const counted: Counted[] = [];
  // FTP: harte 20-75-min-Abschnitte, Runden ab 8 min, Sweet-Spot-/Schwellen-Einheiten mit Ø-Watt, Profil
  const ftpEst: Est[] = [];
  let strong = 0, titled = 0;
  rides.forEach(a => {
    const w = weightOf(a, inp, end);
    const local: Est[] = [];
    const P = pw(a);
    if (P && a.avgHr && a.min! >= 20 && a.min! <= 75 && a.avgHr >= 0.9 * lthr) { local.push({ v: P * 0.95 * lthr / a.avgHr, w, date: a.date }); strong++; }
    if (!v20 || P) (a.laps || []).filter(l => l.kind === 'work' && l.sec >= 480 && l.power).forEach(l => { local.push({ v: l.power! * (l.sec >= 1200 ? 0.95 : 0.9), w: 0.8 * w, date: a.date }); strong++; });
    const nm = `${a.name || ''}`;
    if (P && !(a.laps || []).some(l => l.kind === 'work') && /sweet ?spot/i.test(nm)) { local.push({ v: P / 0.9, w: 0.5 * w, date: a.date }); titled++; }
    else if (P && !(a.laps || []).some(l => l.kind === 'work') && /schwelle|threshold|ftp/i.test(nm)) { local.push({ v: P / 0.97, w: 0.5 * w, date: a.date }); titled++; }
    const v = wmedian(local);
    if (v != null) ftpEst.push({ v, w, date: a.date });
    if (P) counted.push({ date: a.date, title: titleOf(a), value: `${Math.round(P)} W${a.avgHr ? ` bei Puls ${a.avgHr}` : ''}`, manual: isManual(a) });
  });
  const profFtp = powerOK && p.thresholds.ftp && p.thresholds.ftp > 0 ? p.thresholds.ftp : null;
  // FTP nur aus Test/Profil, harten Abschnitten oder Runden; Titel allein („Sweet Spot“ mit Ø-Watt) erst ab 2 Einheiten
  const ftpOld = (strong > 0 || titled >= 2 ? wmedian(ftpEst) : null) ?? profFtp;
  const f = c.f;
  const lvlW = (w: number) => scale(SCALES.bikeWkg, w / weight * f);
  const lvlS = (k: number) => scale(SCALES.bikeKmh, k * Math.cbrt(f));
  const base = v20 ? runBasePts(c) : null;
  // Auftrag 19/20: laufende Schätzung (FTP aus Fahrten mit gemessenen Watt; sonst Schwellen-Tempo)
  const ignP: Ignored[] = [];
  const pObs = bikeObs(c, lthr, true, ignP);
  let fltP: FResult | null = null;
  if (v20) {
    if (powerOK && (pObs.length || profFtp)) {
      const estF = (p.thresholds.estimated || []).includes('ftp');
      const prior = profFtp ? { z: Math.log(profFtp), sd: estF ? 0.12 : p.thresholds.trendAt ? TREND_SD : 0.06 } : { z: Math.log(2.3 * weight / f), sd: 0.18 };
      const ptsW = (z: number) => lvlW(Math.exp(z));
      const cap = capWith(capPts(c, 'bike', base), prior, ptsW);
      fltP = filterFor(c, 'bike', pObs, { prior, o: { pts: ptsW, weekPts: WEEK_PTS.bike, capZ: cap != null ? zForPts(ptsW, cap, prior.z) : null } });
    }
  } else fltP = pObs.length && (strong > 0 || titled >= 2 || pObs.some(o => o.kind !== 'titled') || pObs.length >= 2) ? filterFor(c, 'bike', pObs) : null;
  const ftp = fltP ? Math.exp(fltP.z) : v20 ? null : ftpOld;
  // Ohne Watt: Schwellen-Geschwindigkeit (Rennrad-Wert; Gravel wird umgerechnet). Drinnen zählt die Geschwindigkeit nicht.
  const bs = bikeSpeedsOf(p);
  const roadEq = (kmh: number, k: BikeKind) => k === 'gravel' ? kmh / GRAVEL_F : kmh;
  const spThr: Est[] = [];
  const imp: Est[] = [];
  rides.filter(a => a.speedKmh && a.avgHr).forEach(a => {
    const k = kindOf({ indoor: a.indoor, bikeType: a.bikeType, name: a.name }, p);
    if (k === 'indoor' && (v20 || !a.avgPower)) return; // drinnen: Tempo zählt nicht
    if (v20 && a.avgHr! < 0.6 * lthr) return;
    const w = weightOf(a, inp, end) * (v20 && a.avgHr! < 0.8 * lthr ? 0.5 : 1);
    const sp = a.speedKmh! * flatSpeedFactor(a) * heatFactor(a);
    if (a.avgHr! >= 0.9 * lthr && a.min! >= 20) spThr.push({ v: roadEq(sp * Math.cbrt(lthr / a.avgHr!), k), w, date: a.date });
    else if (a.avgHr! <= 0.88 * lthr && !((intervalsOf(a) || { count: 0 }).count >= 2)) imp.push({ v: roadEq(thrSpeedFromRide(sp, a.avgHr!, lthr), k), w, date: a.date });
    if (!pw(a)) counted.push({ date: a.date, title: titleOf(a), value: `${de(a.speedKmh!)} km/h ${BIKE_KIND_LABEL[k]} bei Puls ${a.avgHr}`, manual: isManual(a) });
  });
  const speedEst = (p.thresholds.estimated || []).includes('thresholdSpeedBikeKmh');
  const impMed = wmedian(imp.filter(x => x.date > addDays(end, -RECENT)));
  const speedEvidence = [...spThr, ...imp.map(x => ({ ...x, w: x.w * 0.5 }))];
  const ignS: Ignored[] = [];
  const sObs = bikeObs(c, lthr, false, ignS);
  let fltS: FResult | null = null;
  if (!ftp) {
    if (v20) {
      const prior = p.thresholds.thresholdSpeedBikeKmh > 0 ? { z: Math.log(roadEq(bs[bs.main], bs.main)), sd: speedEst ? 0.1 : p.thresholds.trendAt ? TREND_SD : 0.07 }
        : { z: Math.log((27 + Math.min(4, (p.experienceYears || 0) * 0.5)) / Math.cbrt(f)), sd: 0.12 };
      const ptsS = (z: number) => lvlS(Math.exp(z));
      const cap = capWith(capPts(c, 'bike', base), prior, ptsS);
      fltS = filterFor(c, 'bike', sObs, { prior, o: { pts: ptsS, weekPts: WEEK_PTS.bike, capZ: cap != null ? zForPts(ptsS, cap, prior.z) : null } });
    } else fltS = filterFor(c, 'bike', sObs);
  }
  const thrKmh = fltS ? Math.exp(fltS.z) : wmedian(speedEvidence) ?? (p.thresholds.thresholdSpeedBikeKmh > 0 ? roadEq(bs[bs.main], bs.main) : null); // Rennrad-Äquivalent
  // Effizienz: mit Watt Leistung pro Herzschlag bei lockeren Fahrten (in FTP umgerechnet), sonst Tempo pro Herzschlag
  const effP: Est[] = rides.filter(a => pw(a) && a.avgHr && a.avgHr <= 0.88 * lthr && inWindow(a, end, RECENT)).map(a => ({ v: pw(a)! / powerFracFromHr(a.avgHr! / lthr), w: weightOf(a, inp, end), date: a.date }));
  const effFtp = wmedian(effP);
  const decs = rides.filter(a => a.decouplingPct != null && a.min! >= 60).map(a => ({ v: a.decouplingPct!, w: 1, date: a.date }));
  const dec = wmedian(decs);
  const skillLong = (p.skills || {}).bikeLongestMin || null;
  const rideMax = rides.length ? Math.max(...rides.map(a => a.min || 0)) : null;
  const longest = rideMax != null && skillLong != null ? Math.max(rideMax, skillLong) : rideMax ?? skillLong;
  const rideFromSkill = longest != null && longest !== rideMax;
  const usePower = !!ftp;
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
  const flt = usePower ? fltP : fltS;
  const fromData = v20 ? !!(flt && flt.usable) : !!rides.length;
  return { evidence: usePower ? ftpEst : speedEvidence, parts, n: rides.length, counted, latest, manualShare: rides.length ? rides.filter(isManual).length / rides.length : 1, levelSource: fromData ? 'Einheiten' : speedEst || !(p.thresholds.thresholdSpeedBikeKmh > 0) ? 'Schätzung aus dem Profil' : 'Profil', extra: { ftp, thrKmh, shownKmh, usePower, dec, longest, weight, mainKind: bs.main },
    filter: flt, sub: z => usePower ? lvlW(Math.exp(z)) : lvlS(Math.exp(z)), mainKey: 'thr',
    priorSd: usePower ? ((p.thresholds.estimated || []).includes('ftp') ? 0.1 : 0.05) : speedEst ? 0.06 : 0.035,
    ignored: [...ignP, ...ignS].filter((x, i, l) => l.findIndex(y => y.date === x.date && y.title === x.title && y.why === x.why) === i) };
}

/* ---------- Schwimmen ---------- */
function swimRaw(c: Ctx): Raw {
  const { inp } = c;
  const { end, activities: swims } = evidenceActivities(c, 'swim');
  const p = inp.profile; const sk = p.skills || {}; const th = p.thresholds;
  const v20 = !c.legacy;
  const counted: Counted[] = [];
  const canCrawl = sk.swimCrawl === 'yes' || sk.swimCrawl === 'some' || (sk.swimCrawlM || 0) >= 25 || (!!th.cssSec && !(th.estimated || []).includes('cssSec')) || swims.some(a => (crawlOf(a) || 0) >= 25) || (sk.swimCrawl == null && !!th.cssSec);
  // CSS: lange Serien (+3 s), Pace einer Einheit (−4 s, Pausen sind drin), Test im Profil, 25-m-Zeit, sonst Brust
  const css: Est[] = [];
  const ignored: Ignored[] = [];
  swims.forEach(a => {
    const pc = a.swim && a.swim.pace100;
    const cont = (crawlOf(a) || 0);
    const eligible = !v20 || swimPaceEligible(a);
    if (pc && !eligible) ignored.push({ date: a.date, title: titleOf(a), value: mmss(pc) + '/100 m', why: 'Stil oder Hilfsmittel der Einheit erlauben keine Zuordnung zur Kraul-CSS ohne Hilfsmittel', key: 'swim' });
    if (pc && eligible) css.push({ v: cont >= 400 ? pc + 3 : pc - 4, w: (cont >= 400 ? 1 : 0.5) * weightOf(a, inp, end), date: a.date });
    counted.push({ date: a.date, title: titleOf(a), value: [a.km ? Math.round(a.km * 1000) + ' m' : '', pc ? mmss(pc) + '/100 m' : '', cont ? `${cont} m am Stück` : ''].filter(Boolean).join(', ') || `${a.min} min`, manual: isManual(a) });
  });
  const cssEst = (th.estimated || []).includes('cssSec');
  let source = 'CSS';
  const evidence = [...css];
  // Startwert (Auftrag 20: immer der Ausgangspunkt, mit Unsicherheit je Herkunft)
  let prior: { z: number; sd: number };
  if (th.cssSec) prior = { z: -Math.log(th.cssSec), sd: cssEst ? 0.1 : 0.04 };
  else if (th.crawl25Sec) prior = { z: -Math.log(th.crawl25Sec * 4 * 1.12), sd: 0.08 };
  else { const br = th.breast100Sec || 170 + (p.sex === 'f' ? 5 : 0); prior = { z: -Math.log(br + (canCrawl ? 0 : 5)), sd: 0.12 }; }
  if (!css.length && th.cssSec) css.push({ v: th.cssSec, w: cssEst ? 0.3 : 0.8, date: end });
  if (!css.length && th.crawl25Sec) css.push({ v: th.crawl25Sec * 4 * 1.12, w: 0.6, date: end });
  if (!css.length) { const br = th.breast100Sec || 170 + (p.sex === 'f' ? 5 : 0); css.push({ v: br + (canCrawl ? 0 : 5), w: 0.3, date: end }); source = canCrawl ? 'geschätzt' : 'Brust'; }
  const s = [...css].sort((a, b) => a.v - b.v);
  const f = c.f;
  const pts = (z: number) => scale(SCALES.swimCss, Math.exp(-z) / f);
  // Auftrag 19: laufende Schätzung über alle Schwimmeinheiten mit Pace
  const cap = v20 ? capWith(capPts(c, 'swim', null), prior, pts) : null;
  const flt = filterFor(c, 'swim', swimObs(c), v20 ? { prior, o: { pts, weekPts: WEEK_PTS.swim, capZ: cap != null ? zForPts(pts, cap, prior.z) : null } } : null);
  const cssV = flt ? Math.exp(-flt.z) : wmedian(s)!;
  const conts = swims.map(a => crawlOf(a) || 0).filter(x => x > 0);
  // ein kurzes Stück in einer Technik-Einheit senkt das Können nicht: höchster Wert aus Einheiten und Fragebogen
  const cont = conts.length ? Math.max(...conts, sk.swimCrawlM || 0) : (sk.swimCrawlM ?? null);
  const pool = (a: Activity) => (a.swim && a.swim.poolLengthM) || 25;
  const dpsVals = swims.filter(a => inWindow(a, end, RECENT) && a.swim && (a.swim.strokesPerLength || a.swim.metersPerStroke)).map(a => ({ v: a.swim!.strokesPerLength ? (pool(a) - 5) / a.swim!.strokesPerLength! : a.swim!.metersPerStroke!, w: 1, date: a.date }));
  const dps = wmedian(dpsVals);
  const spl = wmedian(swims.filter(a => inWindow(a, end, RECENT) && a.swim && a.swim.strokesPerLength).map(a => ({ v: a.swim!.strokesPerLength!, w: 1, date: a.date })));
  const parts: ScorePart[] = [
    mk('css', canCrawl ? 'CSS (Schwellen-Pace)' : 'Brust-Tempo', 0.45, cssV, scale(SCALES.swimCss, cssV / f), mmss(cssV) + '/100 m' + (source === 'Brust' ? ' Brust' : ''), { lowerBetter: true }),
    mk('cont', 'Kraul am Stück', 0.3, cont, cont != null ? scale(SCALES.swimCont, cont) : null, cont ? Math.round(cont) + ' m' : cont == null ? 'unbekannt' : 'noch nicht'),
    mk('tech', 'Meter pro Zug', 0.25, dps, dps ? scale(SCALES.swimDps, dps) : null, dps ? de(dps, 2) + ' m' + (spl ? ' (' + (Number.isInteger(spl) ? spl : de(spl)) + ' Züge/Bahn)' : '') : '–', { target: '1,6 m' })
  ];
  const latest = swims.map(a => a.date).sort().pop() || null;
  return { evidence, parts, n: swims.length, counted, latest, manualShare: swims.length ? swims.filter(isManual).length / swims.length : 1, levelSource: source === 'CSS' ? (cssEst && !swims.length ? 'Schätzung aus dem Profil' : 'Einheiten und Test') : source === 'Brust' ? 'Brust-Tempo' : 'Schätzung', extra: { css: cssV, dps, spl, cont, canCrawl },
    filter: flt, sub: pts, mainKey: 'css', priorSd: source === 'CSS' ? (cssEst ? 0.1 : 0.04) : 0.12, ignored };
}

/* Auftrag 20: Obergrenze, aber nie unter einem genau bekannten Startwert (Test im Profil, Bestzeit) */
const WEEK_PTS: Record<string, number> = { run: 4, bike: 4, swim: 6 };
function capWith(cap: number | null, prior: { z: number; sd: number }, pts: (z: number) => number): number | null {
  if (cap == null) return null;
  return prior.sd <= 0.07 ? Math.max(cap, pts(prior.z) + 5) : cap;
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
  const prof0 = inp.profile;
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
  return { inp, end, req, need, wish, f: ageSexFactor(inp.profile, end, sport), prof0 };
}
function scoreAt(sport: ScoreSport, inp: ScoreInput, end: string, legacy = false) {
  const c = { ...ctxFor(sport, inp, end), legacy };
  const r = rawFor(sport, c);
  const cb = combine(r.parts);
  // A usable observation supports the estimate; a profile prior by itself is not measured.
  const supported = !!((r.filter?.n || 0) || r.evidence?.length || (sport === 'strength' && r.n) || (sport === 'swim' && c.inp.activities.some(a => a.sport === 'swim' && !a.mergedInto && a.date <= end && (crawlOf(a) || 0) > 0)));
  const measured = supported ? cb.score : null;
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
  const score = Math.round(clamp((cb.score ?? 10) + ((inp.manualAdjust && inp.manualAdjust[sport]) || 0), 1, 120));
  // Auftrag 20: vorläufig, bis mindestens 5 brauchbare Einheiten oder ein Test da sind; dann ist auch der Bereich mindestens ± 5
  const provisional = !legacy && sport !== 'strength' && !(r.filter && r.filter.tested) && ((r.filter && r.filter.usable) || 0) < 5;
  const range = provisional ? Math.max(5, rangeOf(sport, r, effectiveN)) : rangeOf(sport, r, effectiveN);
  return { score, measured: measured == null ? null : Math.round(measured), confidence: provisional ? Math.min(confidence, 0.45) : confidence, raw: r, parts: r.parts, c, ageDays, range, provisional };
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
function rangeTextOf(range: number, provisional = false): string {
  return `± ${range}${provisional ? ', vorläufig' : range >= 6 ? ', wenig Daten' : range <= 2 ? ', gut belegt' : ''}`;
}
/* „Warum?“: die letzten Einheiten mit ihrem Beitrag (+/−) und dem Grund */
const KIND_WHY: Record<string, string> = {
  test: 'Test, zählt stark', effort: 'harte Einheit mit Puls, zählt stark', laps: 'Intervalle mit Puls', hr: 'Tempo bei bekanntem Puls',
  rpe: 'ohne Puls, nur nach Gefühl, zählt wenig', titled: 'Watt einer Intervall-Einheit, zählt wenig', swimset: 'lange Serie, zählt gut', swimpace: 'Tempo der Einheit'
};
const STATUS_WHY: Record<string, string> = {
  counted: 'gezählt', confirmed: 'gezählt', damped: 'gedämpft: weicht stark von den anderen Werten ab, zählt erst voll, wenn ein zweiter ähnlicher Wert kommt',
  limited: 'gezählt, aber begrenzt: ohne Test bewegt sich der Score höchstens etwa 3 Punkte pro Woche',
  capped: 'gezählt, aber gedeckelt: ohne Test nicht über das, was zu deinem Niveau und deiner Erfahrung passt (ein Test zeigt mehr)',
  step: 'gezählt, aber vorläufig: eine einzelne Einheit verschiebt den Wert nur ein Stück'
};
function stepLines(sport: ScoreSport, now: ReturnType<typeof scoreAt>, today: string): string[] {
  const r = now.raw; if (!r.filter || !r.sub) return [];
  const share = shareOf(r, r.mainKey || 'thr');
  const label = SPORT_LABEL[sport];
  const what = { run: 'Laufen', bike: 'Radfahren', swim: 'Schwimmen', strength: 'Kraft' }[sport];
  const v20 = !now.c.legacy;
  const steps = (v20 ? r.filter.steps : r.filter.steps.slice(1)).filter(s => s.date > addDays(today, -42));
  const dd = (d: string) => `${d.slice(8)}.${d.slice(5, 7)}.`;
  // allgemeiner Titel („Schwimmen“, „Lauf“) wiederholt nur die Sportart
  const nmOf = (t: string) => /^(Lauf|Radfahrt|Schwimmen|Kraft|Einheit)$/.test(t) ? '' : ' ' + t;
  const lines: { date: string; t: string }[] = steps.map(s => {
    const d = (r.sub!(s.after) - r.sub!(s.before)) * share;
    const n = Math.round(d);
    const sign = n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '±0';
    if (s.kind === 'pause') return { date: s.date, t: `${sign} ${label}: ${s.days} Tage ohne ${what} bis ${dd(s.date)}, die Form sinkt langsam (etwa 1 % pro Woche)` };
    // Richtung passend zur gezeigten Zahl (nie „±0 … schwächer“)
    const dir = n > 0 ? 'besser als erwartet' : n < 0 ? 'schwächer als erwartet' : 'wie erwartet';
    const extra = [s.extra || '', s.ill ? 'krank, zählt weniger' : '', s.manual ? 'von Hand' : '', s.note || ''].filter(Boolean).join(', ');
    if (!v20) return { date: s.date, t: `${sign} ${label}: ${dd(s.date)}${nmOf(s.title)}, ${s.value}: ${dir} (${KIND_WHY[s.kind] || 'Messung'}${extra ? ', ' + extra : ''})` };
    // Auftrag 20: je Hinweis, ob er gezählt, gedämpft oder begrenzt wurde und warum
    return { date: s.date, t: `${sign} ${label}: ${dd(s.date)}${nmOf(s.title)}, ${s.value}: ${STATUS_WHY[s.status || 'counted']}, ${dir} (${KIND_WHY[s.kind] || 'Messung'}${extra ? ', ' + extra : ''})` };
  });
  const ign = (r.ignored || []).filter(x => x.date > addDays(today, -42)).sort((a, b) => a.date.localeCompare(b.date)).map(x => ({ date: x.date, t: `ignoriert – ${label}: ${dd(x.date)}${nmOf(x.title)}${x.value ? ', ' + x.value : ''}: ${x.why}` }));
  const all = [...lines.slice(-5), ...ign.slice(-3)].sort((a, b) => b.date.localeCompare(a.date));
  return all.map(x => x.t);
}
/* Umstieg auf die neue Rechnung (Version 3.7, Auftrag 20): 4 Wochen lang sagen, was die bisherige Rechnung ergeben hätte und warum */
const NEW_SCORE_FROM = '2026-10-24';
export const SCORE_MODEL = 20;
function switchReason(sport: ScoreSport, r: Raw): string {
  const keys = new Set((r.ignored || []).map(x => x.key));
  const bits: string[] = [];
  if (keys.has('trainer')) bits.push('Watt und Geschwindigkeit von einer Rolle ohne Wattmessung zählen nicht mehr');
  if (keys.has('watts')) bits.push('geschätzte Watt ohne Wattmesser zählen nicht mehr');
  if (keys.has('gps')) bits.push('GPS-Fehler zählen nicht mehr');
  if (keys.has('lowhr')) bits.push('Einheiten mit sehr niedrigem Puls zählen nicht mehr');
  if (!bits.length) bits.push('der Wert startet vorsichtig bei deinen Angaben und bewegt sich mit jeder verlässlichen Einheit');
  return bits.join(', ');
}
function switchLine(sport: ScoreSport, inp: ScoreInput, now: ReturnType<typeof scoreAt>): string | null {
  if (inp.today < NEW_SCORE_FROM || inp.today > addDays(NEW_SCORE_FROM, 28) || sport === 'strength') return null;
  const old = scoreAt(sport, inp, inp.today, true);
  if (Math.abs(old.score - now.score) < 2) return null;
  return `Neu berechnet: Nach der bisherigen Rechnung stünde hier ${old.score}. Jetzt zählen nur verlässliche Werte (${switchReason(sport, now.raw)}), Ausreißer werden gedämpft, und ohne Test bewegt sich der Wert höchstens etwa 3 Punkte pro Woche${now.provisional ? '. Vorläufig, bis mindestens 5 brauchbare Einheiten oder ein Test da sind' : ''}.`;
}
/* Auftrag 20: Hinweis für den Coach, wenn die neue Rechnung einen Score deutlich (ab 3 Punkten) verändert hat */
export function rescoreNotes(inp: ScoreInput, scores: SportScore[]): { sport: ScoreSport; old: number; now: number; text: string }[] {
  const out: { sport: ScoreSport; old: number; now: number; text: string }[] = [];
  for (const s of scores) {
    if (s.sport === 'strength') continue;
    const old = scoreAt(s.sport, inp, inp.today, true);
    if (Math.abs(old.score - s.score) < 3) continue;
    const now = scoreAt(s.sport, inp, inp.today);
    const keys = new Set((now.raw.ignored || []).map(x => x.key));
    const head = s.sport === 'bike' && keys.has('trainer') ? 'Rad-Score neu berechnet: Rollen-Speed zählt nicht mehr' : `${SPORT_LABEL[s.sport]}-Score neu berechnet`;
    out.push({ sport: s.sport, old: old.score, now: s.score, text: `${head} (${old.score} → ${s.score}). ${switchReason(s.sport, now.raw).replace(/^./, c => c.toUpperCase())}.${s.provisional ? ' Der Wert ist vorläufig, bis mindestens 5 brauchbare Einheiten oder ein Test da sind.' : ''} Unter Fortschritt → ${SPORT_LABEL[s.sport]} → „Warum?“ steht je Einheit, ob sie gezählt hat.` });
  }
  return out;
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
      // Auftrag 20: mehr als 12 Schläge in 3 Wochen ist keine echte Veränderung (z. B. Uhr gegen Handeintrag mit Gehpausen)
      if (Math.abs(d) > 12) return;
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
      range: now.range, rangeText: rangeTextOf(now.range, now.provisional), provisional: now.provisional,
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

/* Auftrag 20: Testteil aus den Testfeldern (Rad: Ø-Puls und Tempo der 20 min, Lauf: Ø-Puls und Pace der 30 min) */
function testLap(sport: string, m: any): any[] {
  const n = (v: any) => { if (v == null || v === '') return null; const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) && x > 0 ? x : null; };
  const hr = n(m.testHr); if (!hr) return [];
  if (sport === 'bike' && n(m.testSpeed)) return [{ kind: 'work', sec: 1200, speed: n(m.testSpeed)! / 3.6, avgHr: hr, power: n(m.testPower) }];
  const pm = /^(\d+)[:.,](\d{1,2})$/.exec(String(m.testPace || '').trim());
  if (sport === 'run' && pm) { const sec = +pm[1] * 60 + +pm[2]; return [{ kind: 'work', sec: 1800, speed: 1000 / sec, avgHr: hr, m: Math.round(1800 / sec * 1000) }]; }
  return [];
}
/* Erledigte geplante Einheiten mit Aufzeichnung: der Name der Einheit aus dem Plan (z. B. „Radtest 20 min“), wenn die Uhr keinen hat */
export function namedFromPlan(state: any, weeks: any[], acts: Activity[]): Activity[] {
  const title = new Map<string, string>();
  planDays(weeks).forEach(d => d.sessions.forEach((s: any) => { const st = (state.sessions || {})[s.id]; if (st && st.activityId && s.title) title.set(st.activityId, s.title); }));
  return acts.map(a => a.name || !title.has(a.id) ? a : { ...a, name: title.get(a.id)! });
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
      // Auftrag 20: eingetragene Testwerte (Puls und Tempo im Testteil) zählen wie eine Test-Runde
      laps: testLap(sport, m), intervals: null,
      swim: sport === 'swim' ? { poolLengthM: (profile.skills || {}).poolM === 50 ? 50 : 25, lengths: 0, activeLengths: 0, strokesPerLength: spl, metersPerStroke: dps || (spl ? Math.round(25 / spl * 100) / 100 : null), pace100: p100 ? Math.round(p100) : null, byStroke: {}, longestContinuousM: num(m.longestCrawl), longestCrawlM: num(m.longestCrawl), longestPullM: num(m.longestPull), strokeRate: num(m.rate) } : null,
      rpe: num(s && s.rpe)
    } as Activity);
  };
  planDays(weeks).forEach(d => d.sessions.forEach(s => { const st = (state.sessions || {})[s.id]; if (st && st.completed && !st.activityId) add(s.id, d.date, s.sport, st.metrics || {}, s.title, { ...st, zone: s.zone }, s.plannedMinutes); }));
  Object.entries(effectiveCustomBuckets(state) || {}).forEach(([d, l]) => (l as any[] || []).forEach((w: any) => { if (!w.activityId && w.completed !== false) add(w.id, d, w.sport, actualMetrics(w), w.title, w, null); }));
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
