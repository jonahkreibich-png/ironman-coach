/* Leistungs-Scores 0-100 je Sportart aus gemessener Leistung (nicht aus Gefühl).
   100 = das Niveau, das für das aktuelle Ziel in der geplanten Zeit nötig ist (Bezug steht dabei).
   Bedingungen werden herausgerechnet: Hitze über 22 °C, Höhenmeter, Rollentrainer. Werte unter Krankheit oder
   großer Müdigkeit zählen weniger. Die alte Kalibrierung dient als Startwert, bis genug Messdaten da sind. */
import type { Activity } from './activity/analyze';
import type { Profile } from './profile';
import type { Goal } from './goals';
import { requirementFor, type Requirement } from './sports';
import { addDays, illnessAt, planDays, isIntervals } from './core';

export type ScoreSport = 'run' | 'bike' | 'swim' | 'strength';
export interface ScorePart { key: string; label: string; sub: number | null; weight: number; value: string; target: string }
export interface SportScore {
  sport: ScoreSport; score: number; measured: number | null; confidence: number;
  parts: ScorePart[]; trend: { date: string; score: number }[]; why: string[]; basis: string;
}
export interface FormScore { ctl: number | null; target: number; score: number; bySport: Partial<Record<ScoreSport, { ctl: number; target: number }>> }
export interface ScoreInput {
  today: string;
  activities: Activity[];
  trend: any[];
  illness: any[];
  profile: Profile;
  goal: Goal | null;
  calibration?: { date: string; scores: Record<string, number> } | null;
  manualAdjust?: Record<string, number>;
  /** Tagesbelastung je Sport (für CTL je Sport) */
  loadsBySport?: Record<string, Record<string, number>>;
}

const clamp = (x: number, a = 0, b = 100) => Math.max(a, Math.min(b, x));
const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mmss = (s: number) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
const de = (v: number, d = 1) => v.toFixed(d).replace('.', ',');
const WINDOW = 42, RECENT = 21;

/* Gewicht einer Messung: krank oder kurz danach zählt halb */
function weightOf(a: Activity, inp: ScoreInput): number {
  if (illnessAt(inp.illness, a.date) || illnessAt(inp.illness, addDays(a.date, -2))) return 0.5;
  return 1;
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

/* ---------- Laufen ---------- */
interface Est { v: number; w: number; date: string }
function runParts(inp: ScoreInput, req: Requirement, end: string) {
  const lthr = inp.profile.thresholds.lthrRun;
  const runs = inp.activities.filter(a => a.sport === 'run' && !a.mergedInto && inWindow(a, end, WINDOW) && a.min && a.min >= 10);
  const easy = runs.filter(a => a.avgHr && a.avgHr <= 0.89 * lthr && !(a.intervals && a.intervals.count >= 2) && a.efficiency);
  const effs: Est[] = easy.filter(a => inWindow(a, end, RECENT)).map(a => ({ v: a.efficiency! * heatFactor(a) * flatSpeedFactor(a), w: weightOf(a, inp), date: a.date }));
  const eff = wmedian(effs);
  // Schwelle schätzen: harte Einheiten (Puls nahe Schwelle) und Intervall-Runden, sonst aus der lockeren Effizienz
  const thr: Est[] = [];
  runs.forEach(a => {
    if (a.avgHr && a.speedKmh && a.min! >= 15 && a.min! <= 75 && a.avgHr >= 0.92 * lthr) thr.push({ v: a.speedKmh / 3.6 * flatSpeedFactor(a) * heatFactor(a) * lthr / a.avgHr, w: weightOf(a, inp), date: a.date });
    (a.laps || []).filter(l => l.kind === 'work' && l.sec >= 180 && l.speed && l.avgHr && l.avgHr >= 0.9 * lthr).forEach(l => thr.push({ v: l.speed! * lthr / l.avgHr! * 0.98, w: 0.8 * weightOf(a, inp), date: a.date }));
  });
  if (eff) thr.push({ v: eff * 1.12 * lthr / 60, w: 0.5, date: end });
  const t = inp.profile.thresholds;
  if (t.thresholdPaceRunSec) thr.push({ v: 1000 / t.thresholdPaceRunSec, w: 0.6, date: end });
  const thrSpeed = wmedian(thr); // m/s
  const longs = runs.filter(a => a.decouplingPct != null && a.min! >= 50).map(a => ({ v: Math.max(0, a.decouplingPct!), w: weightOf(a, inp), date: a.date }));
  const dec = wmedian(longs);
  const longest = Math.max(0, ...runs.filter(a => !a.avgHr || a.avgHr <= 0.9 * lthr).map(a => a.min || 0));
  const reqSpeed = req.runThresholdSecKm ? 1000 / req.runThresholdSecKm : null;
  const parts: ScorePart[] = [
    { key: 'thr', label: 'Schwellen-Pace', weight: 0.35, sub: thrSpeed && reqSpeed ? clamp(thrSpeed / reqSpeed * 100) : null, value: thrSpeed ? mmss(1000 / thrSpeed) + '/km' : '–', target: req.runThresholdSecKm ? mmss(req.runThresholdSecKm) + '/km' : '–' },
    { key: 'eff', label: 'Effizienz locker', weight: 0.25, sub: eff && reqSpeed ? clamp(eff * 1.12 * lthr / 60 / reqSpeed * 100) : null, value: eff ? de(eff, 2) + ' m/Schlag' : '–', target: reqSpeed ? de(reqSpeed * 60 / 1.12 / lthr, 2) + ' m/Schlag' : '–' },
    { key: 'long', label: 'Längster lockerer Lauf', weight: 0.25, sub: longest && req.longRunMin ? clamp(longest / req.longRunMin * 100) : null, value: longest ? longest + ' min' : '–', target: req.longRunMin ? req.longRunMin + ' min' : '–' },
    { key: 'dec', label: 'Aerobe Entkopplung', weight: 0.15, sub: dec != null ? clamp(100 - Math.max(0, dec - 3) * 7) : null, value: dec != null ? de(dec) + ' %' : '–', target: 'unter 5 %' }
  ];
  return { parts, n: runs.length, eff, thrSpeed, longest, dec };
}

/* ---------- Rad ---------- */
function bikeParts(inp: ScoreInput, req: Requirement, end: string) {
  const lthr = inp.profile.thresholds.lthrBike;
  const rides = inp.activities.filter(a => a.sport === 'bike' && !a.mergedInto && inWindow(a, end, WINDOW) && a.min && a.min >= 15);
  const weight = inp.profile.weightKg || 70;
  // Mit Leistungsmessung: FTP aus harten 20-60-min-Abschnitten; sonst Geschwindigkeit pro Herzschlag draußen
  const ftpEst: Est[] = [];
  rides.forEach(a => {
    if (a.avgPower && a.avgHr && a.min! >= 20 && a.min! <= 75 && a.avgHr >= 0.9 * lthr) ftpEst.push({ v: a.avgPower * 0.95 * lthr / a.avgHr, w: weightOf(a, inp), date: a.date });
    (a.laps || []).filter(l => l.kind === 'work' && l.sec >= 480 && l.power).forEach(l => ftpEst.push({ v: l.power! * (l.sec >= 1200 ? 0.95 : 0.9), w: 0.8, date: a.date }));
  });
  if (inp.profile.thresholds.ftp) ftpEst.push({ v: inp.profile.thresholds.ftp, w: 0.6, date: end });
  const ftp = wmedian(ftpEst);
  const outdoor = rides.filter(a => !a.indoor && a.speedKmh && a.avgHr);
  const easy = outdoor.filter(a => a.avgHr! <= 0.86 * lthr);
  const effs: Est[] = easy.filter(a => inWindow(a, end, RECENT)).map(a => ({ v: a.speedKmh! * flatSpeedFactor(a) * heatFactor(a) / a.avgHr!, w: weightOf(a, inp), date: a.date }));
  const eff = wmedian(effs); // km/h pro Schlag
  const spThr: Est[] = outdoor.filter(a => a.avgHr! >= 0.9 * lthr && a.min! >= 20).map(a => ({ v: a.speedKmh! * flatSpeedFactor(a) * lthr / a.avgHr!, w: weightOf(a, inp), date: a.date }));
  if (eff) spThr.push({ v: eff * lthr * 1.08, w: 0.5, date: end });
  if (inp.profile.thresholds.thresholdSpeedBikeKmh) spThr.push({ v: inp.profile.thresholds.thresholdSpeedBikeKmh, w: 0.5, date: end });
  const thrKmh = wmedian(spThr);
  const decs = rides.filter(a => a.decouplingPct != null && a.min! >= 60).map(a => ({ v: Math.max(0, a.decouplingPct!), w: 1, date: a.date }));
  const dec = wmedian(decs);
  const longest = Math.max(0, ...rides.map(a => a.min || 0));
  const thrSub = ftp && req.bikeFtpWkg ? clamp(ftp / weight / req.bikeFtpWkg * 100) : thrKmh && req.bikeThresholdKmh ? clamp(thrKmh / req.bikeThresholdKmh * 100) : null;
  const parts: ScorePart[] = [
    { key: 'thr', label: ftp ? 'FTP' : 'Schwelle (Tempo)', weight: 0.35, sub: thrSub, value: ftp ? Math.round(ftp) + ' W (' + de(ftp / weight, 1) + ' W/kg)' : thrKmh ? de(thrKmh) + ' km/h' : '–', target: ftp && req.bikeFtpWkg ? de(req.bikeFtpWkg, 1) + ' W/kg' : req.bikeThresholdKmh ? de(req.bikeThresholdKmh) + ' km/h' : '–' },
    { key: 'eff', label: 'Effizienz locker', weight: 0.25, sub: eff && req.bikeThresholdKmh ? clamp(eff * lthr * 1.08 / req.bikeThresholdKmh * 100) : null, value: eff ? de(eff * 100, 1) + ' m/h pro Schlag' : '–', target: req.bikeThresholdKmh ? de(req.bikeThresholdKmh / lthr / 1.08 * 100, 1) + ' m/h pro Schlag' : '–' },
    { key: 'long', label: 'Längste Fahrt', weight: 0.25, sub: longest && req.longRideMin ? clamp(longest / req.longRideMin * 100) : null, value: longest ? longest + ' min' : '–', target: req.longRideMin ? req.longRideMin + ' min' : '–' },
    { key: 'dec', label: 'Aerobe Entkopplung', weight: 0.15, sub: dec != null ? clamp(100 - Math.max(0, dec - 3) * 7) : null, value: dec != null ? de(dec) + ' %' : '–', target: 'unter 5 %' }
  ];
  return { parts, n: rides.length, eff, thrKmh, ftp, longest, dec };
}

/* ---------- Schwimmen ---------- */
function swimParts(inp: ScoreInput, req: Requirement, end: string) {
  const swims = inp.activities.filter(a => a.sport === 'swim' && !a.mergedInto && inWindow(a, end, WINDOW) && a.km);
  // CSS-Schätzung: schnellste Pace über Strecken ab 400 m am Stück (+3 s), sonst Pace der Einheit (+6 s)
  const css: Est[] = [];
  swims.forEach(a => {
    const p = a.swim && a.swim.pace100;
    if (!p) return;
    const cont = a.swim!.longestContinuousM || 0;
    css.push({ v: cont >= 400 ? p + 3 : p - 4, w: (cont >= 400 ? 1 : 0.6) * weightOf(a, inp), date: a.date });
  });
  if (inp.profile.thresholds.cssSec) css.push({ v: inp.profile.thresholds.cssSec, w: 0.6, date: end });
  const cssV = wmin(css);
  const dpsVals = swims.filter(a => inWindow(a, end, RECENT) && a.swim && a.swim.metersPerStroke).map(a => ({ v: a.swim!.metersPerStroke!, w: 1, date: a.date }));
  const dps = wmedian(dpsVals);
  const splVals = swims.filter(a => inWindow(a, end, RECENT) && a.swim && a.swim.strokesPerLength).map(a => ({ v: a.swim!.strokesPerLength!, w: 1, date: a.date }));
  const spl = wmedian(splVals);
  const longest = Math.max(0, ...swims.map(a => (a.swim && a.swim.longestContinuousM) || (a.km ? a.km * 1000 : 0)));
  const parts: ScorePart[] = [
    { key: 'css', label: 'CSS (Schwellen-Pace)', weight: 0.45, sub: cssV && req.swimCss100 ? clamp(req.swimCss100 / cssV * 100) : null, value: cssV ? mmss(cssV) + '/100 m' : '–', target: req.swimCss100 ? mmss(req.swimCss100) + '/100 m' : '–' },
    { key: 'tech', label: 'Meter pro Zug', weight: 0.25, sub: dps ? clamp(dps / 1.6 * 100) : null, value: dps ? de(dps, 2) + ' m' + (spl ? ' (' + de(spl) + ' Züge/Bahn)' : '') : '–', target: '1,6 m' },
    { key: 'long', label: 'Längste Strecke am Stück', weight: 0.3, sub: longest && req.longSwimM ? clamp(longest / req.longSwimM * 100) : null, value: longest ? Math.round(longest) + ' m' : '–', target: req.longSwimM ? req.longSwimM + ' m' : '–' }
  ];
  return { parts, n: swims.length, css: cssV, dps, spl, longest };
}

/* ---------- Kraft: Regelmäßigkeit und Steigerung ---------- */
function strengthParts(inp: ScoreInput, end: string) {
  const list = inp.activities.filter(a => a.sport === 'strength' && !a.mergedInto && inWindow(a, end, WINDOW));
  const perWeek = list.length / 6;
  const target = 1.5;
  const weights = list.map(a => (a as any).liftKg).filter((x: any) => typeof x === 'number');
  const prog = weights.length >= 2 ? (weights[weights.length - 1] - weights[0]) / Math.max(1, weights[0]) : null;
  const parts: ScorePart[] = [
    { key: 'reg', label: 'Regelmäßigkeit', weight: prog != null ? 0.75 : 1, sub: clamp(perWeek / target * 100), value: de(perWeek) + ' pro Woche', target: '1,5 pro Woche' },
    ...(prog != null ? [{ key: 'prog', label: 'Steigerung der Gewichte', weight: 0.25, sub: clamp(50 + prog * 250), value: (prog >= 0 ? '+' : '') + Math.round(prog * 100) + ' %', target: '+10 % in 6 Wochen' }] : [])
  ];
  return { parts, n: list.length, perWeek };
}

function wmedian(list: Est[]): number | null {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a.v - b.v);
  const tot = s.reduce((a, x) => a + x.w, 0);
  let acc = 0;
  for (const x of s) { acc += x.w; if (acc >= tot / 2) return x.v; }
  return s[s.length - 1].v;
}
function wmin(list: Est[]): number | null {
  if (!list.length) return null;
  // nicht der einzelne Ausreißer, sondern der Durchschnitt der besten zwei
  const s = [...list].sort((a, b) => a.v - b.v).slice(0, 2);
  return s.reduce((a, x) => a + x.v, 0) / s.length;
}
function combine(parts: ScorePart[]): { score: number | null; coverage: number } {
  const have = parts.filter(p => p.sub != null);
  const wsum = have.reduce((a, p) => a + p.weight, 0);
  if (!wsum) return { score: null, coverage: 0 };
  return { score: have.reduce((a, p) => a + p.sub! * p.weight, 0) / wsum, coverage: wsum / parts.reduce((a, p) => a + p.weight, 0) };
}

function partsFor(sport: ScoreSport, inp: ScoreInput, req: Requirement, end: string) {
  if (sport === 'run') return runParts(inp, req, end);
  if (sport === 'bike') return bikeParts(inp, req, end);
  if (sport === 'swim') return swimParts(inp, req, end);
  return strengthParts(inp, end);
}

/* Score eines Sports zu einem Stichtag */
function scoreAt(sport: ScoreSport, inp: ScoreInput, req: Requirement, end: string) {
  const r: any = partsFor(sport, inp, req, end);
  const c = combine(r.parts);
  // Vertrauen: wie viele Messungen und wie viel vom Score gemessen ist
  const confidence = Math.min(1, (r.n || 0) / (sport === 'strength' ? 4 : 6)) * c.coverage;
  const cal = inp.calibration && inp.calibration.scores && inp.calibration.scores[sport];
  const start = typeof cal === 'number' ? cal : 25;
  const measured = c.score;
  const blended = measured == null ? start : start * (1 - confidence) + measured * confidence;
  const score = clamp(Math.round(blended + ((inp.manualAdjust && inp.manualAdjust[sport]) || 0)), 1, 100);
  return { score, measured: measured == null ? null : Math.round(measured), confidence: Math.round(confidence * 100) / 100, raw: r, parts: r.parts as ScorePart[] };
}

/* Die 2-3 Kennzahlen, die den Score zuletzt am meisten bewegt haben */
function whyTexts(sport: ScoreSport, now: any, then: any, inp: ScoreInput, delta: number): string[] {
  const label = { run: 'Laufen', bike: 'Rad', swim: 'Schwimmen', strength: 'Kraft' }[sport];
  const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
  const out: { w: number; t: string }[] = [];
  const nowP = now.parts as ScorePart[], thenP = then.parts as ScorePart[];
  nowP.forEach(p => {
    const q = thenP.find(x => x.key === p.key);
    if (p.sub == null || !q || q.sub == null) return;
    const contrib = Math.round((p.sub - q.sub) * p.weight * (now.confidence || 0.5));
    const capped = !contrib && p.sub >= 100 && q.sub >= 100;
    if (!contrib && !(capped && p.key === 'eff')) return;
    let t = '';
    if (sport === 'run' && p.key === 'eff' && now.raw.eff && then.raw.eff) {
      const refSpeed = 1000 / 360; // Bezug: 6:00/km
      const hrNow = refSpeed * 60 / now.raw.eff, hrThen = refSpeed * 60 / then.raw.eff;
      const d = Math.round(hrThen - hrNow);
      if (Math.abs(d) < 2 && !contrib) return;
      t = d > 0 ? `${d} Schläge weniger Puls bei gleicher Pace wie vor 3 Wochen` : `${-d} Schläge mehr Puls bei gleicher Pace als vor 3 Wochen`;
      if (capped) t += ' (schon auf Ziel-Niveau)';
    } else if (p.key === 'long') t = `${p.label} jetzt ${p.value} (vor 3 Wochen ${q.value})`;
    else if (p.key === 'dec') t = `${p.label} ${p.value} (vor 3 Wochen ${q.value})`;
    else t = `${p.label} ${p.value} (vor 3 Wochen ${q.value})`;
    out.push({ w: Math.abs(contrib) || 0.5, t: contrib ? `${sign(contrib)} ${label}: ${t}` : `${label}: ${t}` });
  });
  out.sort((a, b) => b.w - a.w);
  const list = out.slice(0, 3).map(x => x.t);
  if (!list.length) list.push(delta === 0 ? 'Zu wenig neue Messungen für eine Veränderung. Der Score bewegt sich, sobald Einheiten mit Puls und Tempo dazukommen.' : 'Mehr gemessene Einheiten, dadurch weniger Gewicht auf dem Startwert.');
  return list;
}

export function sportScores(inp: ScoreInput, sports: ScoreSport[] = ['swim', 'bike', 'run', 'strength']): SportScore[] {
  const req = requirementFor(inp.goal, inp.profile);
  return sports.map(sport => {
    const now = scoreAt(sport, inp, req, inp.today);
    const then = scoreAt(sport, inp, req, addDays(inp.today, -21));
    const trend = [35, 28, 21, 14, 7, 0].map(d => ({ date: addDays(inp.today, -d), score: d === 0 ? now.score : scoreAt(sport, inp, req, addDays(inp.today, -d)).score }));
    return { sport, score: now.score, measured: now.measured, confidence: now.confidence, parts: now.parts, trend, why: whyTexts(sport, now, then, inp, now.score - then.score), basis: req.basis };
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
  let total = 0;
  const all: Record<string, number> = {};
  Object.entries(inp.loadsBySport || {}).forEach(([sp, loads]) => {
    Object.entries(loads).forEach(([d, v]) => { all[d] = (all[d] || 0) + v; });
    const target = (req.ctlBySport as any)[sp];
    if (target) bySport[sp as ScoreSport] = { ctl: ctlOf(loads), target };
  });
  total = ctlOf(all);
  return { ctl: total || null, target: req.ctl, score: clamp(Math.round(total / req.ctl * 100)), bySport };
}

/* Alte Einträge ohne Aufzeichnung (Werte von Hand oder von intervals.icu) als einfache Aktivitäten, damit sie zählen */
export function legacyActivities(state: any, weeks: any[], profile: Profile): Activity[] {
  const out: Activity[] = [];
  const lthr = (sp: string) => (sp === 'bike' ? profile.thresholds.lthrBike : profile.thresholds.lthrRun);
  const num = (v: any) => { if (v == null || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
  const pace = (v: any) => { const m = /^(\d+)[:.,](\d{1,2})$/.exec(String(v || '').trim()); return m ? +m[1] * 60 + +m[2] : null; };
  const add = (id: string, date: string, sport: string, m: any, title: string, s: any) => {
    if (!m) return;
    const min = num(m.min), km = num(m.km), hr = num(m.hr), meters = num(m.meters);
    if (!min && !km && !meters) return;
    let paceSec = pace(m.pace); if (!paceSec && km && min && sport === 'run') paceSec = min * 60 / km;
    let speed = num(m.speed); if (!speed && km && min && sport === 'bike') speed = km / (min / 60);
    const sp = sport === 'run' && paceSec ? 1000 / paceSec : sport === 'bike' && speed ? speed / 3.6 : null;
    const p100 = pace(m.pace100) || (meters && min ? min * 60 / (meters / 100) : null);
    const spl = num(m.spl), dps = num(m.dps);
    out.push({
      id: 'sess-' + id, source: (s && s.source) || 'manual', sources: [(s && s.source) || 'manual'], sport: sport as any, date, startMs: Date.parse(date + 'T12:00:00Z'),
      indoor: false, min: min != null ? Math.round(min) : null, elapsedMin: null, km: sport === 'swim' ? (meters ? meters / 1000 : null) : km,
      avgHr: hr, maxHr: null, avgPower: num(m.power), speedKmh: sp && sport !== 'swim' ? Math.round(sp * 36) / 10 : null, paceSecKm: sport === 'run' ? paceSec : null,
      ascentM: null, kcal: null, tempC: num(s && s.temp), hrZones: null, decouplingPct: null,
      efficiency: sp && hr ? Math.round(sp * 60 / hr * 100) / 100 : null,
      laps: [], intervals: isIntervals({ sport, title, zone: (s && s.zone) || '' }) ? { count: 2, workSec: 0, avgHrWork: null, hrDriftPct: null, dropPct: null, recoveryHrDrop: null, lapsHr: [] } : null,
      swim: sport === 'swim' ? { poolLengthM: 25, lengths: 0, activeLengths: 0, strokesPerLength: spl, metersPerStroke: dps || (spl ? Math.round(25 / spl * 100) / 100 : null), pace100: p100 ? Math.round(p100) : null, byStroke: {}, longestContinuousM: null, strokeRate: num(m.rate) } : null
    } as Activity);
    void lthr;
  };
  planDays(weeks).forEach(d => d.sessions.forEach(s => { const st = (state.sessions || {})[s.id]; if (st && st.completed && !st.activityId) add(s.id, d.date, s.sport, st.metrics, s.title, { ...st, zone: s.zone }); }));
  Object.entries(state.customWorkouts || {}).forEach(([d, l]) => (l || []).forEach((w: any) => { if (!w.activityId) add(w.id, d, w.sport, w.metrics || { min: w.plannedMinutes, km: w.plannedKm }, w.title, w); }));
  return out;
}
