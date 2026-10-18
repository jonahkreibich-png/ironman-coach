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
import { bikeSpeedsOf, kindOf, powerFracFromHr, thrSpeedFromRide, GRAVEL_F, BIKE_KIND_LABEL, type BikeKind } from './bikespeed';

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
  return ill * (1 - 0.5 * Math.min(1, age / WINDOW));
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
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a.v - b.v);
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
interface Ctx { inp: ScoreInput; end: string; req: Requirement; need: Requirement; wish: Requirement | null; f: number }
interface Raw { parts: ScorePart[]; n: number; counted: Counted[]; latest: string | null; manualShare: number; levelSource: string; extra: any }

function mk(key: string, label: string, weight: number, raw: number | null, sub: number | null, value: string, opts: { lowerBetter?: boolean; target?: string } = {}): ScorePart {
  return { key, label, weight, raw, sub: sub == null ? null : Math.round(sub * 10) / 10, value, target: opts.target || '', lowerBetter: opts.lowerBetter, marks: [] };
}

/* ---------- Laufen ---------- */
function runRaw(c: Ctx): Raw {
  const { inp, end } = c;
  const lthr = inp.profile.thresholds.lthrRun || 170;
  const runs = inp.activities.filter(a => a.sport === 'run' && !a.mergedInto && inWindow(a, end, WINDOW) && a.min && a.min >= 10);
  const easy = runs.filter(a => a.avgHr && a.avgHr <= 0.89 * lthr && !((intervalsOf(a) || { count: 0 }).count >= 2) && (a.speedKmh || a.efficiency));
  const counted: Counted[] = [];
  // Schwelle: harte Einheiten, Intervall-Runden, Profil (Test oder Schätzung); lockere Läufe über den Puls-Anteil
  const thr: Est[] = [];
  runs.forEach(a => {
    if (a.avgHr && a.speedKmh && a.min! >= 15 && a.min! <= 75 && a.avgHr >= 0.92 * lthr) { thr.push({ v: a.speedKmh / 3.6 * flatSpeedFactor(a) * heatFactor(a) * lthr / a.avgHr, w: weightOf(a, inp, end), date: a.date }); counted.push({ date: a.date, title: titleOf(a), value: `${mmss(3600 / a.speedKmh)}/km bei Puls ${a.avgHr} (hart)`, manual: isManual(a) }); }
    (a.laps || []).filter(l => l.kind === 'work' && l.sec >= 180 && l.speed && l.avgHr && l.avgHr >= 0.9 * lthr).forEach(l => thr.push({ v: l.speed! * lthr / l.avgHr! * 0.98, w: 0.8 * weightOf(a, inp, end), date: a.date }));
  });
  const imp: Est[] = [];
  easy.forEach(a => {
    const sp = a.speedKmh ? a.speedKmh / 3.6 : (a.efficiency! * a.avgHr! / 60);
    imp.push({ v: sp * flatSpeedFactor(a) * heatFactor(a) / runFrac(a.avgHr! / lthr), w: weightOf(a, inp, end), date: a.date });
    counted.push({ date: a.date, title: titleOf(a), value: `${mmss(1000 / sp)}/km bei Puls ${a.avgHr}`, manual: isManual(a) });
  });
  const t = inp.profile.thresholds;
  const est = (t.estimated || []).includes('thresholdPaceRunSec');
  if (t.thresholdPaceRunSec > 0) thr.push({ v: 1000 / t.thresholdPaceRunSec, w: est ? 0.3 : 0.7, date: end });
  const impMed = wmedian(imp.filter(x => x.date > addDays(end, -RECENT)));
  if (impMed) thr.push({ v: impMed, w: 0.5, date: end });
  const thrSpeed = wmedian(thr);
  const effSpeed = impMed && thrSpeed ? clamp(impMed, thrSpeed * 0.85, thrSpeed * 1.15) : null;
  const effs = easy.filter(a => inWindow(a, end, RECENT) && a.efficiency).map(a => ({ v: a.efficiency! * heatFactor(a) * flatSpeedFactor(a), w: weightOf(a, inp, end), date: a.date }));
  const eff = wmedian(effs);
  const decs = runs.filter(a => a.decouplingPct != null && a.min! >= 30).map(a => ({ v: a.decouplingPct!, w: weightOf(a, inp, end) * (a.min! >= 45 ? 1 : 0.5), date: a.date }));
  const dec = wmedian(decs);
  const easyMins = runs.filter(a => !a.avgHr || a.avgHr <= 0.9 * lthr).map(a => a.min || 0);
  const skillCont = (inp.profile.skills || {}).runContinuousMin || null;
  const longest = easyMins.length ? Math.max(...easyMins) : skillCont;
  const f = c.f;
  const lvl = (sp: number) => scale(SCALES.runVdot, vdotFromThreshold(sp * f));
  const parts: ScorePart[] = [
    mk('thr', 'Schwellen-Pace', 0.5, thrSpeed ? 1000 / thrSpeed : null, thrSpeed ? lvl(thrSpeed) : null, thrSpeed ? mmss(1000 / thrSpeed) + '/km' : '–', { lowerBetter: true }),
    mk('eff', 'Effizienz locker', 0.15, effSpeed ? 1000 / effSpeed : null, effSpeed ? lvl(effSpeed) : null, eff ? `${de(eff, 2)} m pro Herzschlag${effSpeed ? ` (≈ ${mmss(1000 / effSpeed)}/km an der Schwelle)` : ''}` : '–', { lowerBetter: true }),
    mk('long', easyMins.length ? 'Längster lockerer Lauf' : 'Laufen am Stück (Fragebogen)', 0.2, longest, longest ? scale(SCALES.longRun, longest) : null, longest ? longest + ' min' : '–'),
    mk('dec', 'Aerobe Entkopplung', 0.15, dec, dec != null ? scale(SCALES.dec, dec) : null, dec != null ? de(dec) + ' %' : '–', { lowerBetter: true, target: 'unter 5 %' })
  ];
  const latest = runs.map(a => a.date).sort().pop() || null;
  return { parts, n: runs.length, counted, latest, manualShare: runs.length ? runs.filter(isManual).length / runs.length : 1, levelSource: thr.length > 1 || imp.length ? 'Einheiten' : est ? 'Schätzung aus dem Profil' : t.source || 'Profil', extra: { thrSpeed, eff, dec, longest, impMed } };
}

/* ---------- Rad ---------- */
function bikeRaw(c: Ctx): Raw {
  const { inp, end } = c;
  const p = inp.profile;
  const lthr = p.thresholds.lthrBike || 165;
  const rides = inp.activities.filter(a => a.sport === 'bike' && !a.mergedInto && inWindow(a, end, WINDOW) && a.min && a.min >= 15);
  const weight = p.weightKg || 70;
  const counted: Counted[] = [];
  // FTP: harte 20-75-min-Abschnitte, Runden ab 8 min, Sweet-Spot-/Schwellen-Einheiten mit Ø-Watt, Profil
  const ftpEst: Est[] = [];
  let strong = 0, titled = 0;
  rides.forEach(a => {
    const w = weightOf(a, inp, end);
    if (a.avgPower && a.avgHr && a.min! >= 20 && a.min! <= 75 && a.avgHr >= 0.9 * lthr) { ftpEst.push({ v: a.avgPower * 0.95 * lthr / a.avgHr, w, date: a.date }); strong++; }
    (a.laps || []).filter(l => l.kind === 'work' && l.sec >= 480 && l.power).forEach(l => { ftpEst.push({ v: l.power! * (l.sec >= 1200 ? 0.95 : 0.9), w: 0.8 * w, date: a.date }); strong++; });
    const nm = `${a.name || ''}`;
    if (a.avgPower && !(a.laps || []).some(l => l.kind === 'work') && /sweet ?spot/i.test(nm)) { ftpEst.push({ v: a.avgPower / 0.9, w: 0.5 * w, date: a.date }); titled++; }
    else if (a.avgPower && !(a.laps || []).some(l => l.kind === 'work') && /schwelle|threshold|ftp/i.test(nm)) { ftpEst.push({ v: a.avgPower / 0.97, w: 0.5 * w, date: a.date }); titled++; }
    if (a.avgPower) counted.push({ date: a.date, title: titleOf(a), value: `${Math.round(a.avgPower)} W${a.avgHr ? ` bei Puls ${a.avgHr}` : ''}`, manual: isManual(a) });
  });
  // FTP nur aus Test/Profil, harten Abschnitten oder Runden; Titel allein („Sweet Spot“ mit Ø-Watt) erst ab 2 Einheiten
  if (p.thresholds.ftp && p.thresholds.ftp > 0) ftpEst.push({ v: p.thresholds.ftp, w: 0.7, date: end });
  const ftp = (p.thresholds.ftp && p.thresholds.ftp > 0) || strong > 0 || titled >= 2 ? wmedian(ftpEst) : null;
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
  spThr.push({ v: roadEq(bs[bs.main], bs.main), w: speedEst ? 0.3 : 0.7, date: end });
  const impMed = wmedian(imp.filter(x => x.date > addDays(end, -RECENT)));
  if (impMed) spThr.push({ v: impMed, w: 0.5, date: end });
  const thrKmh = wmedian(spThr); // Rennrad-Äquivalent
  // Effizienz: mit Watt Leistung pro Herzschlag bei lockeren Fahrten (in FTP umgerechnet), sonst Tempo pro Herzschlag
  const effP: Est[] = rides.filter(a => a.avgPower && a.avgHr && a.avgHr <= 0.88 * lthr && inWindow(a, end, RECENT)).map(a => ({ v: a.avgPower! / powerFracFromHr(a.avgHr! / lthr), w: weightOf(a, inp, end), date: a.date }));
  const effFtp = wmedian(effP);
  const decs = rides.filter(a => a.decouplingPct != null && a.min! >= 60).map(a => ({ v: a.decouplingPct!, w: 1, date: a.date }));
  const dec = wmedian(decs);
  const skillLong = (p.skills || {}).bikeLongestMin || null;
  const longest = rides.length ? Math.max(...rides.map(a => a.min || 0)) : skillLong;
  const f = c.f;
  const usePower = !!ftp;
  const lvlW = (w: number) => scale(SCALES.bikeWkg, w / weight * f);
  const lvlS = (k: number) => scale(SCALES.bikeKmh, k * Math.cbrt(f));
  const mainLabel = BIKE_KIND_LABEL[bs.main];
  const shownKmh = thrKmh ? (bs.main === 'gravel' ? thrKmh * GRAVEL_F : thrKmh) : null;
  const effVal = usePower ? (effFtp ? clamp(effFtp, ftp! * 0.85, ftp! * 1.15) : null) : (impMed && thrKmh ? clamp(impMed, thrKmh * 0.85, thrKmh * 1.15) : null);
  const parts: ScorePart[] = [
    usePower ? mk('thr', 'FTP', 0.5, ftp! / weight, lvlW(ftp!), `${Math.round(ftp!)} W (${de(ftp! / weight, 1)} W/kg)`)
      : mk('thr', 'Schwellen-Tempo', 0.5, shownKmh, thrKmh ? lvlS(thrKmh) : null, shownKmh ? `${de(shownKmh)} km/h (${mainLabel}, flach)` : '–'),
    mk('eff', 'Effizienz locker', 0.15, effVal, effVal ? (usePower ? lvlW(effVal) : lvlS(effVal)) : null, effVal ? (usePower ? `≈ ${Math.round(effVal)} W an der Schwelle` : `≈ ${de(bs.main === 'gravel' ? effVal * GRAVEL_F : effVal)} km/h an der Schwelle`) + ' (aus lockeren Fahrten)' : '–'),
    mk('long', rides.length ? 'Längste Fahrt' : 'Längste Fahrt (Fragebogen)', 0.2, longest, longest ? scale(SCALES.longRide, longest) : null, longest ? longest + ' min' : '–'),
    mk('dec', 'Aerobe Entkopplung', 0.15, dec, dec != null ? scale(SCALES.dec, dec) : null, dec != null ? de(dec) + ' %' : '–', { lowerBetter: true, target: 'unter 5 %' })
  ];
  const latest = rides.map(a => a.date).sort().pop() || null;
  return { parts, n: rides.length, counted, latest, manualShare: rides.length ? rides.filter(isManual).length / rides.length : 1, levelSource: rides.length ? 'Einheiten' : speedEst ? 'Schätzung aus dem Profil' : 'Profil', extra: { ftp, thrKmh, shownKmh, usePower, dec, longest, weight, mainKind: bs.main } };
}

/* ---------- Schwimmen ---------- */
function swimRaw(c: Ctx): Raw {
  const { inp, end } = c;
  const p = inp.profile; const sk = p.skills || {}; const th = p.thresholds;
  const swims = inp.activities.filter(a => a.sport === 'swim' && !a.mergedInto && inWindow(a, end, WINDOW) && (a.km || a.min));
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
  if (th.cssSec) css.push({ v: th.cssSec, w: cssEst ? 0.3 : 0.8, date: end });
  if (th.crawl25Sec) css.push({ v: th.crawl25Sec * 4 * 1.12, w: 0.6, date: end });
  if (!css.length) { const br = th.breast100Sec || 170 + (p.sex === 'f' ? 5 : 0); css.push({ v: br + (canCrawl ? 0 : 5), w: 0.3, date: end }); source = canCrawl ? 'geschätzt' : 'Brust'; }
  const s = [...css].sort((a, b) => a.v - b.v);
  // nicht der einzelne Ausreißer: gewichteter Median
  const cssV = wmedian(s)!;
  const conts = swims.map(a => (a.swim && a.swim.longestContinuousM) || 0).filter(x => x > 0);
  const cont = Math.max(0, ...conts, sk.swimCrawlM || 0);
  const pool = (a: Activity) => (a.swim && a.swim.poolLengthM) || 25;
  const dpsVals = swims.filter(a => inWindow(a, end, RECENT) && a.swim && (a.swim.strokesPerLength || a.swim.metersPerStroke)).map(a => ({ v: a.swim!.strokesPerLength ? (pool(a) - 5) / a.swim!.strokesPerLength! : a.swim!.metersPerStroke!, w: 1, date: a.date }));
  const dps = wmedian(dpsVals);
  const spl = wmedian(swims.filter(a => inWindow(a, end, RECENT) && a.swim && a.swim.strokesPerLength).map(a => ({ v: a.swim!.strokesPerLength!, w: 1, date: a.date })));
  const f = c.f;
  const parts: ScorePart[] = [
    mk('css', canCrawl ? 'CSS (Schwellen-Pace)' : 'Brust-Tempo', 0.45, cssV, scale(SCALES.swimCss, cssV / f), mmss(cssV) + '/100 m' + (source === 'Brust' ? ' Brust' : ''), { lowerBetter: true }),
    mk('cont', 'Kraul am Stück', 0.3, cont, scale(SCALES.swimCont, cont), cont ? Math.round(cont) + ' m' : 'noch nicht'),
    mk('tech', 'Meter pro Zug', 0.25, dps, dps ? scale(SCALES.swimDps, dps) : null, dps ? de(dps, 2) + ' m' + (spl ? ' (' + (Number.isInteger(spl) ? spl : de(spl)) + ' Züge/Bahn)' : '') : '–', { target: '1,6 m' })
  ];
  const latest = swims.map(a => a.date).sort().pop() || null;
  return { parts, n: swims.length, counted, latest, manualShare: swims.length ? swims.filter(isManual).length / swims.length : 1, levelSource: source === 'CSS' ? (cssEst && !swims.length ? 'Schätzung aus dem Profil' : 'Einheiten und Test') : source === 'Brust' ? 'Brust-Tempo' : 'Schätzung', extra: { css: cssV, dps, spl, cont, canCrawl } };
}

/* ---------- Kraft: Regelmäßigkeit und Steigerung ---------- */
function strengthRaw(c: Ctx): Raw {
  const { inp, end } = c;
  const list = inp.activities.filter(a => a.sport === 'strength' && !a.mergedInto && inWindow(a, end, WINDOW));
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
  const req = requirementFor(inp.goal, inp.profile);
  const need = inp.goal ? requirementFor({ ...inp.goal, targetTimeSec: null, splits: null }, inp.profile) : req;
  const wish = inp.goal && (inp.goal.targetTimeSec || (inp.goal.splits && Object.keys(inp.goal.splits).length)) ? req : null;
  return { inp, end, req, need, wish, f: ageSexFactor(inp.profile, inp.today, sport) };
}
function scoreAt(sport: ScoreSport, inp: ScoreInput, end: string) {
  const c = ctxFor(sport, inp, end);
  const r = rawFor(sport, c);
  const cb = combine(r.parts);
  const measured = cb.score;
  // Vertrauen: Menge, Aktualität, Uhr statt Hand, Anteil gemessener Teile
  const nF = Math.min(1, r.n / (sport === 'strength' ? 4 : 6));
  const ageDays = r.latest ? (Date.parse(end) - Date.parse(r.latest)) / 86400000 : 99;
  const recF = ageDays <= 7 ? 1 : ageDays <= 21 ? 0.75 : 0.5;
  const qF = 0.75 + 0.25 * (1 - r.manualShare);
  const confidence = Math.round(Math.max(r.n ? 0 : 0.05, nF * recF * qF * cb.coverage) * 100) / 100;
  const score = Math.round(clamp((measured ?? 10) + ((inp.manualAdjust && inp.manualAdjust[sport]) || 0), 1, 120));
  return { score, measured: measured == null ? null : Math.round(measured), confidence, raw: r, parts: r.parts, c, ageDays };
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
  const bits = [r.n ? `${r.n} ${what} in 6 Wochen${sport !== 'strength' ? `, ${watch ? `davon ${watch} von der Uhr` : 'alle von Hand eingetragen'}` : ''}` : `noch keine ${what} in den letzten 6 Wochen`];
  if (r.latest && s.ageDays > 10) bits.push(`letzte vor ${Math.round(s.ageDays)} Tagen`);
  if (/Schätzung/.test(r.levelSource)) bits.push('Hauptwert nur aus dem Profil geschätzt (ein Test macht ihn genau)');
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
    return { sport, score: now.score, measured: now.measured, confidence: now.confidence, confText: confTextOf(sport, now), level: levelLabel(now.score), parts: now.parts, trend,
      why: whyTexts(sport, now, then, now.score - then.score), basis: inp.goal ? inp.goal.name : 'allgemeine Fitness', counted, gains: gainsOf(sport, now), stages: marks.stages, reached: marks.reached };
  });
}

/* Gesamt-Form: Fitness (CTL) je Sport im Verhältnis zu dem, was das Ziel braucht */
export function formScore(inp: ScoreInput): FormScore {
  const req = requirementFor(inp.goal, inp.profile);
  const ctlOf = (loads: Record<string, number>) => {
    const dates = Object.keys(loads).sort(); if (!dates.length) return 0;
    let c = 0; for (let d = dates[0]; d <= inp.today; d = addDays(d, 1)) c += ((loads[d] || 0) - c) / 42;
    return Math.round(c * 10) / 10;
  };
  const bySport: FormScore['bySport'] = {};
  const all: Record<string, number> = {};
  Object.entries(inp.loadsBySport || {}).forEach(([sp, loads]) => {
    Object.entries(loads).forEach(([d, v]) => { all[d] = (all[d] || 0) + v; });
    const target = (req.ctlBySport as any)[sp];
    if (target) bySport[sp as ScoreSport] = { ctl: ctlOf(loads), target };
  });
  const total = ctlOf(all);
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
    const effMin = min ?? (km && paceSec ? Math.round(km * paceSec / 60) : km && speed ? Math.round(km / speed * 60) : plannedMin || (sport === 'strength' ? 30 : null));
    out.push({
      id: 'sess-' + id, source: (s && s.source) || 'manual', sources: [(s && s.source) || 'manual'], sport: sport as any, date, startMs: Date.parse(date + 'T12:00:00Z'), name: title,
      indoor, bikeType: m.bikeType || null, min: effMin != null ? Math.round(effMin) : null, elapsedMin: null, km: sport === 'swim' ? (meters ? meters / 1000 : null) : km,
      avgHr: hr, maxHr: num(m.maxHr), avgPower: num(m.power), avgCadence: num(m.cadence), speedKmh: sp && sport !== 'swim' ? Math.round(sp * 36) / 10 : null, paceSecKm: sport === 'run' ? paceSec : null,
      ascentM: null, kcal: null, tempC: num(s && s.temp), hrZones: null, decouplingPct: num(m.decoupling),
      efficiency: sp && hr ? Math.round(sp * 60 / hr * 100) / 100 : null,
      laps: [], intervals: isIntervals({ sport, title, zone: (s && s.zone) || '' }) ? { count: 2, workSec: 0, avgHrWork: null, hrDriftPct: null, dropPct: null, recoveryHrDrop: null, lapsHr: [] } : null,
      swim: sport === 'swim' ? { poolLengthM: (profile.skills || {}).poolM === 50 ? 50 : 25, lengths: 0, activeLengths: 0, strokesPerLength: spl, metersPerStroke: dps || (spl ? Math.round(25 / spl * 100) / 100 : null), pace100: p100 ? Math.round(p100) : null, byStroke: {}, longestContinuousM: num(m.longestCrawl), strokeRate: num(m.rate) } : null,
      rpe: num(s && s.rpe)
    } as Activity);
  };
  planDays(weeks).forEach(d => d.sessions.forEach(s => { const st = (state.sessions || {})[s.id]; if (st && st.completed && !st.activityId) add(s.id, d.date, s.sport, st.metrics || {}, s.title, { ...st, zone: s.zone }, s.plannedMinutes); }));
  Object.entries(state.customWorkouts || {}).forEach(([d, l]) => (l as any[] || []).forEach((w: any) => { if (!w.activityId) add(w.id, d, w.sport, w.metrics && Object.keys(w.metrics).length ? w.metrics : { min: w.plannedMinutes, km: w.plannedKm }, w.title, w, w.plannedMinutes); }));
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
