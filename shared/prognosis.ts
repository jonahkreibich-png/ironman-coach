/* Ziel-Prognose (Auftrag 12): immer eine Prognose, als Bereich mit wahrscheinlichstem Wert, zweimal:
   „Wenn du heute starten würdest“ und „Erwartet am [Renntag]“ (persönlicher Fortschritt der letzten 8-12 Wochen und geplantes Training,
   vorsichtig abgeflacht). Ohne Test breiterer Bereich und Hinweis, welcher Test sie genauer macht.
   Laufen: VDOT aus der Schwellen-Pace; längere Strecken mit Riegel-Exponent je nach Ausdauer (1,06 gut trainiert … 1,15 kaum lange Läufe).
   Rad: Physik-Modell (Leistung → Geschwindigkeit mit Gewicht, Rad und Position, Rollwiderstand, Höhenmetern); ohne Watt wird die
   Schwellen-Geschwindigkeit des eigenen Rads in Leistung umgerechnet. Intensität je Distanz aus Erfahrung und Ausdauer.
   Lauf nach dem Rad: Abschlag nach Rad-Intensität, Distanz und Koppeltraining. Schwimmen: CSS, sonst 25-m-Zeit, Strecke am Stück und Brust.
   Strecke: Höhenmeter, Freiwasser/Becken, Neopren, Temperatur. Persönlicher Korrekturfaktor aus eingetragenen Rennergebnissen.
   Sicherheit des Bereichs: Datenmenge, Aktualität, Uhr oder Hand, Streuung, Abstand zum Wettkampf. */
import type { Goal, GoalType } from './goals';
import { GOALS, legsOf } from './goals';
import type { Estimates } from './scores';
import type { Profile } from './profile';
import { vdot, timeForVdot, riegel, vdotFromThreshold } from './vdot';
import { GRAVEL_F } from './bikespeed';

export { vdot, timeForVdot, riegel };

export interface Prediction { label: string; sport?: 'swim' | 'bike' | 'run' | 'trans'; low: number; high: number; best: number; note?: string }
export interface RaceDay { date: string; total: Prediction; parts: Prediction[] }
export interface Prognosis {
  ok: boolean;
  /** Tests, die die Prognose genauer machen */
  missing?: string[];
  confidence: 'niedrig' | 'mittel' | 'hoch';
  confReasons?: string[];
  /** heute */
  total?: Prediction;
  parts?: Prediction[];
  /** erwartet am Wettkampftag */
  race?: RaceDay | null;
  runDistances?: Prediction[];
  improve?: string;
  /** Annahmen in Worten (Riegel-Exponent, Rad-Modell, Abschläge) */
  assumptions?: string[];
  /** fürs Pacing */
  bike?: { watts: number | null; kmh: number; intensity: number } | null;
}
export interface PlanFacts {
  /** längster geplanter Lauf / längste geplante Fahrt bis zum Rennen (min) */
  longRunPlanned?: number | null; longRidePlanned?: number | null;
  /** Koppeleinheiten: erledigt (letzte 12 Wochen) und geplant bis zum Rennen */
  bricksDone?: number; bricksPlanned?: number;
}
export interface ProgOpts {
  profile?: Partial<Profile> | null;
  today?: string;
  /** Schätzungen vor etwa 8-12 Wochen (Fortschritt) */
  history?: { date: string; est: Estimates }[];
  plan?: PlanFacts | null;
  /** persönlicher Korrekturfaktor je Disziplin (Ist / Prognose aus früheren Rennen) */
  correction?: Partial<Record<'swim' | 'bike' | 'run', number>> | null;
}

const TRANSITIONS: Partial<Record<GoalType, [number, number]>> = {
  tri_supersprint: [90, 60], tri_sprint: [120, 75], tri_olympic: [150, 90], tri_middle: [240, 150], tri_long: [360, 240], duathlon: [90, 60], aquathlon: [90, 0]
};
const RUN_DIST = [{ l: '5 km', m: 5000 }, { l: '10 km', m: 10000 }, { l: 'Halbmarathon', m: 21097.5 }, { l: 'Marathon', m: 42195 }];
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const de = (v: number, d = 1) => (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d).replace('.', ',');
const mmss = (s: number) => { s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);

/* ---------- Rad-Physik ---------- */
const G = 9.81, RHO = 1.2, DRIVE = 0.97;
export interface BikeSetup { cda: number; crr: number; bikeKg: number; label: string }
const SETUPS: Record<string, BikeSetup> = {
  tt: { cda: 0.26, crr: 0.0045, bikeKg: 9, label: 'Zeitfahrrad' },
  road: { cda: 0.31, crr: 0.0045, bikeKg: 8.5, label: 'Rennrad (Unterlenker/Aufsatz)' },
  gravel: { cda: 0.37, crr: 0.0055, bikeKg: 10, label: 'Gravelbike' },
  mtb: { cda: 0.45, crr: 0.008, bikeKg: 12.5, label: 'Mountainbike' },
  trekking: { cda: 0.5, crr: 0.007, bikeKg: 15, label: 'Trekkingrad' }
};
export function raceSetup(bikes: string[] | undefined): BikeSetup {
  const b = bikes || [];
  return SETUPS[['tt', 'road', 'gravel', 'trekking', 'mtb'].find(k => b.includes(k)) || 'road'];
}
/* Leistung (W) für Geschwindigkeit v (m/s) auf flacher Strecke */
export function powerAt(v: number, massKg: number, s: BikeSetup): number { return (s.crr * massKg * G * v + 0.5 * RHO * s.cda * v * v * v) / DRIVE; }
/* Geschwindigkeit (m/s) für Leistung P auf flacher Strecke (Bisektion) */
export function speedAt(P: number, massKg: number, s: BikeSetup): number {
  let lo = 0.5, hi = 25;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (powerAt(m, massKg, s) > P) hi = m; else lo = m; }
  return (lo + hi) / 2;
}
/* Fahrzeit (s) für Strecke (km) mit Leistung P und Höhenmetern: Steigungs-Energie wird bergab nur zum Teil zurückgewonnen (45 % gehen verloren) */
export function bikeTime(km: number, P: number, massKg: number, s: BikeSetup, ascentM = 0): number {
  const v = speedAt(P, massKg, s);
  return km * 1000 / v + (ascentM > 0 ? massKg * G * ascentM * 0.45 / P : 0);
}
/* Ohne Watt: Renntempo direkt aus der Schwellen-Geschwindigkeit (Alltagsfahrten enthalten Wind, Ampeln, Untergrund, deshalb
   nicht über eine ideale Physik umrechnen). Rennrad-Äquivalent → Rad im Rennen, Intensität mit der dritten Wurzel, Rennbedingungen +2 %.
   Höhenmeter über die Leistung, die dieses Tempo auf dem Rad braucht. */
function bikeTimeBySpeed(km: number, roadKmh: number, ifac: number, massKg: number, s: BikeSetup, ascentM = 0): { t: number; kmh: number } {
  const kindF = s === SETUPS.tt ? 1.04 : s === SETUPS.gravel ? GRAVEL_F : s === SETUPS.mtb || s === SETUPS.trekking ? 0.85 : 1;
  const kmh = roadKmh * kindF * Math.cbrt(ifac) * 1.02;
  const P = powerAt(kmh / 3.6, massKg, s);
  return { t: km / kmh * 3600 + (ascentM > 0 ? massKg * G * ascentM * 0.45 / P : 0), kmh };
}

/* Intensität (Anteil FTP) je Distanz, angepasst an Ausdauer (längste Fahrt im Verhältnis zur Renndauer) und Erfahrung */
function bikeIntensity(type: GoalType, raceMin: number, longestMin: number | null, years: number | null): number {
  let f = ({ tri_supersprint: 0.92, tri_sprint: 0.9, tri_olympic: 0.85, tri_middle: 0.77, tri_long: 0.7, duathlon: 0.87 } as any)[type];
  if (f == null) f = raceMin <= 120 ? 0.82 : raceMin <= 240 ? 0.75 : 0.68;
  const r = longestMin ? longestMin / raceMin : 0.3;
  f -= clamp((0.8 - r) * 0.1, 0, 0.07);
  if (years != null && years >= 3) f += 0.01;
  if (years != null && years < 1) f -= 0.03;
  return Math.round(f * 1000) / 1000;
}
/* Riegel-Exponent aus der Ausdauer: längster Lauf im Verhältnis zu dem, was die Distanz braucht, und Entkopplung */
function runExponent(km: number, longestMin: number | null, dec: number | null): number {
  const need = km >= 40 ? 150 : km >= 20 ? 100 : km >= 10 ? 70 : 45;
  const r = longestMin ? longestMin / need : 0.3;
  let k = 1.06 + 0.09 * clamp((1 - r) / 0.7, 0, 1);
  if (dec != null && dec > 5) k += Math.min(0.02, (dec - 5) * 0.004);
  return Math.round(k * 1000) / 1000;
}
function runTimeSec(km: number, thrSpeed: number, longestMin: number | null, dec: number | null): { sec: number; k: number } {
  const V = vdotFromThreshold(thrSpeed);
  if (km <= 10) return { sec: timeForVdot(km * 1000, V) * 60, k: 1.06 };
  const k = runExponent(km, longestMin, dec);
  return { sec: riegel(timeForVdot(10000, V) * 60, 10, km, k), k };
}

interface Side { thrSpeed: number; ftp: number | null; bikeKmh: number; bikeKind: 'road' | 'gravel'; css: number | null; breast: number; canCrawl: boolean; contM: number; longRun: number | null; runDec: number | null; longRide: number | null; bricks: number }
interface Model { parts: Prediction[]; total: Prediction; bike: Prognosis['bike']; assumptions: string[]; runK: number | null; ifac: number | null; swimMix: number }

function model(goal: Goal, sd: Side, prof: Partial<Profile>, spreads: Record<string, number>, corr: ProgOpts['correction']): Model {
  const type: GoalType = goal.type;
  const def = GOALS[type];
  const legs = legsOf(goal);
  const course = goal.course || {};
  const years = prof.experienceYears ?? null;
  const weight = prof.weightKg || 72;
  const tri = def.group === 'tri';
  const assumptions: string[] = [];
  const parts: Prediction[] = [];
  const heat = course.tempC != null && course.tempC > 20 ? course.tempC - 20 : 0;
  let bikeOut: Prognosis['bike'] = null; let runK: number | null = null; let ifac: number | null = null; let swimMix = 1;
  // Rad zuerst (Intensität bestimmt den Abschlag beim Laufen)
  const setup = raceSetup(prof.bikes as string[]);
  const mass = weight + setup.bikeKg;
  const bikeKm = legs.filter(l => l.sport === 'bike').reduce((a, l) => a + l.km, 0);
  const legTime = (km: number, ascent: number, f: number) => sd.ftp ? bikeTime(km, sd.ftp * f, mass, setup, ascent) : bikeTimeBySpeed(km, sd.bikeKmh, f, mass, setup, ascent).t;
  if (bikeKm) {
    let t = legTime(bikeKm, course.bikeAscentM || 0, 0.8);
    for (let i = 0; i < 2; i++) { ifac = bikeIntensity(type, t / 60, sd.longRide, years); t = legTime(bikeKm, course.bikeAscentM || 0, ifac); }
    if (heat) t *= 1 + 0.001 * heat;
    t *= (corr && corr.bike) || 1;
    bikeOut = { watts: sd.ftp ? Math.round(sd.ftp * ifac!) : null, kmh: Math.round(bikeKm / (t / 3600) * 10) / 10, intensity: ifac! };
    assumptions.push(sd.ftp ? `Rad: FTP ${Math.round(sd.ftp)} W, im Rennen ${Math.round(ifac! * 100)} % davon (${Math.round(sd.ftp * ifac!)} W) auf dem ${setup.label}, ${Math.round(mass)} kg mit Rad${course.bikeAscentM ? `, ${course.bikeAscentM} Höhenmeter` : ', flach gerechnet'}.`
      : `Rad ohne Watt: Schwellen-Tempo ${de(sd.bikeKind === 'gravel' ? sd.bikeKmh * GRAVEL_F : sd.bikeKmh)} km/h (${sd.bikeKind === 'gravel' ? 'Gravel' : 'Rennrad'}, flach), im Rennen ${Math.round(ifac! * 100)} % der Schwellen-Leistung auf dem ${setup.label}${course.bikeAscentM ? `, ${course.bikeAscentM} Höhenmeter` : ', flach gerechnet'}.`);
  }
  for (const l of legs) {
    let t = 0; let note = '';
    if (l.sport === 'swim') {
      const raceM = l.km * 1000;
      const add = l.km <= 0.75 ? 3 : l.km <= 1.5 ? 5 : l.km <= 2 ? 7 : 10;
      const breastP = sd.breast + 5;
      let p100: number;
      if (sd.canCrawl && sd.css) {
        const crawlP = sd.css + add;
        swimMix = sd.contM >= raceM ? 1 : clamp(sd.contM * 3 / raceM, 0.2, 1);
        p100 = swimMix * crawlP + (1 - swimMix) * Math.max(breastP, crawlP);
        if (swimMix < 1) note = `etwa ${Math.round(swimMix * 100)} % Kraul, Rest Brust`;
      } else { p100 = breastP; swimMix = 0; note = 'Brust'; }
      const open = course.swimVenue ? course.swimVenue === 'open' : tri;
      if (open) p100 *= 1.03;
      if (course.wetsuit && swimMix > 0) p100 *= sd.css && sd.css < 110 ? 0.96 : 0.94;
      t = p100 * l.km * 10 * ((corr && corr.swim) || 1);
      assumptions.push(`Schwimmen: ${note || 'Kraul'} mit ${mmss(p100)}/100 m${open ? ' im Freiwasser (ohne Wenden, mit Orientieren)' : ' im Becken'}${course.wetsuit ? ', mit Neopren' : ''}.`);
    }
    if (l.sport === 'bike') t = legTime(l.km, (course.bikeAscentM || 0) * (l.km / bikeKm), ifac!) * (heat ? 1 + 0.001 * heat : 1) * ((corr && corr.bike) || 1);
    if (l.sport === 'run') {
      const r = runTimeSec(l.km, sd.thrSpeed, sd.longRun, sd.runDec);
      runK = r.k; let rt = r.sec;
      const offBike = tri && legs.findIndex(x => x.sport === 'bike') >= 0 && legs.findIndex(x => x.sport === 'bike') < legs.indexOf(l);
      if (offBike) {
        const base = ({ tri_supersprint: 0.03, tri_sprint: 0.04, tri_olympic: 0.06, tri_middle: 0.09, tri_long: 0.13, duathlon: 0.05 } as any)[type] ?? 0.05;
        const typical = ({ tri_supersprint: 0.92, tri_sprint: 0.9, tri_olympic: 0.85, tri_middle: 0.77, tri_long: 0.7, duathlon: 0.87 } as any)[type] ?? 0.85;
        const brickF = 1 - 0.35 * Math.min(1, sd.bricks / 8);
        const pen = base * ((ifac || typical) / typical) * brickF;
        rt *= 1 + pen;
        note = `Abschlag nach dem Rad ${de(pen * 100, 0)}\u00a0%`;
        assumptions.push(`Laufen nach dem Rad: ${de(pen * 100, 0)} % langsamer (${sd.bricks} Koppeleinheiten${sd.bricks >= 8 ? ', gut vorbereitet' : ', mehr Koppeltraining verkleinert den Abschlag'}).`);
      }
      if (course.runAscentM) rt += course.runAscentM * 5 / (l.km * 1000 / rt);
      if (heat) rt *= 1 + 0.004 * heat * (def.hours[1] >= 4 ? 1.5 : 1);
      t = rt * ((corr && corr.run) || 1);
      if (l.km > 10) assumptions.push(`Laufen ${de(l.km)} km: Riegel-Exponent ${de(r.k, 2)} (${r.k <= 1.07 ? 'gute Ausdauer' : sd.longRun ? `längster Lauf ${sd.longRun} min` : 'noch keine langen Läufe'}).`);
    }
    const sp = spreads[l.sport] || 0.06;
    const n = legs.filter(x => x.sport === l.sport).length;
    parts.push({ label: ({ swim: 'Schwimmen', bike: 'Rad', run: 'Laufen' } as any)[l.sport] + (n > 1 ? ` (${String(l.km).replace('.', ',')} km)` : ''), sport: l.sport as any, best: t, low: t * (1 - sp * 0.8), high: t * (1 + sp * 1.2), note: note || undefined });
  }
  const tr = TRANSITIONS[type];
  if (tr) { const f = years != null && years < 1 ? 1.3 : years != null && years >= 3 ? 0.85 : 1; const b = (tr[0] + tr[1]) * f; parts.push({ label: 'Wechsel', sport: 'trans', best: b, low: b * 0.8, high: b * 1.35 }); }
  if (heat) assumptions.push(`Hitze: ${course.tempC} °C macht vor allem beim Laufen langsamer.`);
  const sum = (k: 'best' | 'low' | 'high') => parts.reduce((a, p) => a + p[k], 0);
  return { parts, total: { label: goal.name, best: sum('best'), low: sum('low'), high: sum('high') }, bike: bikeOut, assumptions, runK, ifac, swimMix };
}

function trendRate(now: number | null, then: number | null, weeks: number, lowerBetter = false): number | null {
  if (!now || !then || weeks < 4) return null;
  const r = lowerBetter ? then / now - 1 : now / then - 1;
  return clamp(r / weeks, -0.01, 0.012);
}

export function prognosis(goal: Goal | null, est: Estimates, opts: ProgOpts = {}): Prognosis {
  const type: GoalType = (goal && goal.type) || 'run_10k';
  const g: Goal = goal || { id: 'g', type: 'run_10k', name: '10 km', date: null, priority: 'A' };
  const legs = legsOf(g);
  if (!legs.length) return { ok: false, missing: [], confidence: 'niedrig' };
  const prof: Partial<Profile> = opts.profile || {};
  const th: any = prof.thresholds || {};
  const estd: string[] = th.estimated || [];
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const need = new Set(legs.map(l => l.sport));
  const sk: any = prof.skills || {};
  // Werte heute (fehlt etwas, Schätzung aus dem Profil oder vorsichtiger Standard)
  const thrSpeed = est.runThrSpeed || (th.thresholdPaceRunSec ? 1000 / th.thresholdPaceRunSec : 1000 / 400);
  const bikeKind: 'road' | 'gravel' = est.bikeMainKind || 'road';
  const bikeKmh = est.bikeThrKmh || (th.thresholdSpeedBikeKmh ? (bikeKind === 'gravel' ? th.thresholdSpeedBikeKmh / GRAVEL_F : th.thresholdSpeedBikeKmh) : 27);
  const canCrawl = est.swimCanCrawl ?? (sk.swimCrawl === 'yes' || sk.swimCrawl === 'some' || !!est.swimCss);
  const breast = th.breast100Sec || 170;
  const css = est.swimCss && canCrawl ? est.swimCss : th.crawl25Sec ? th.crawl25Sec * 4 * 1.12 : canCrawl ? (th.cssSec || 150) : null;
  const plan = opts.plan || {};
  const sideNow: Side = { thrSpeed, ftp: est.ftp, bikeKmh, bikeKind, css, breast, canCrawl, contM: est.swimContM ?? sk.swimCrawlM ?? 0, longRun: est.runLongMin ?? sk.runContinuousMin ?? null, runDec: est.runDec ?? null, longRide: est.bikeLongMin ?? sk.bikeLongestMin ?? null, bricks: plan.bricksDone || 0 };

  // Sicherheit je Disziplin: Datenmenge, Schätzung statt Messung, Aktualität, Uhr oder Hand, Streuung
  const reasons: string[] = []; const missing: string[] = [];
  const spreadOf = (sport: 'run' | 'bike' | 'swim'): number => {
    const n = sport === 'run' ? est.nRun : sport === 'bike' ? est.nBike : est.nSwim;
    const latest = sport === 'run' ? est.runLatest : sport === 'bike' ? est.bikeLatest : est.swimLatest;
    const man = sport === 'run' ? est.runManual : sport === 'bike' ? est.bikeManual : est.swimManual;
    const cv = sport === 'run' ? est.runSpread : sport === 'bike' ? est.bikeSpread : null;
    const key = sport === 'run' ? 'thresholdPaceRunSec' : sport === 'bike' ? 'thresholdSpeedBikeKmh' : 'cssSec';
    let s = 0.025;
    if (n < 3) s += 0.04; else if (n < 8) s += 0.02;
    const guessed = estd.includes(key) && (sport !== 'bike' || !est.ftp);
    if (guessed) s += 0.05;
    if (sport === 'swim' && !canCrawl) s += 0.03;
    if (latest && daysBetween(latest, today) > 28) s += 0.02;
    s += 0.015 * (man ?? 1);
    if (cv) s += Math.min(0.04, cv);
    const name = { run: 'Laufen', bike: 'Rad', swim: 'Schwimmen' }[sport];
    if (guessed) missing.push(sport === 'run' ? 'Ein 30-min-Lauftest macht die Lauf-Prognose genauer.' : sport === 'bike' ? 'Ein 20-min-Radtest (mit Tempo auf flacher Strecke oder Watt) macht die Rad-Prognose genauer.' : canCrawl ? ((sk.swimCrawlM || 0) >= 400 ? 'Ein Schwimmtest (400 m und 200 m Kraul) macht die Schwimm-Prognose genauer.' : 'Der Kraul-Check (25 m auf Zeit, Strecke am Stück) macht die Schwimm-Prognose genauer.') : 'Ein Brust-Test (200 m auf Zeit) macht die Schwimm-Prognose genauer.');
    if (n < 3) reasons.push(`${name}: erst ${n} Einheit${n === 1 ? '' : 'en'} in 6 Wochen`);
    else if ((man ?? 1) > 0.7) reasons.push(`${name}: Werte von Hand eingetragen`);
    return s;
  };
  const spreads: Record<string, number> = {};
  (['swim', 'bike', 'run'] as const).forEach(s => { if (need.has(s)) spreads[s] = spreadOf(s); });
  const avgSpread = Object.values(spreads).reduce((a, x) => a + x, 0) / Math.max(1, Object.values(spreads).length);
  const confidence: Prognosis['confidence'] = avgSpread <= 0.05 ? 'hoch' : avgSpread <= 0.09 ? 'mittel' : 'niedrig';

  const nowM = model(g, sideNow, prof, spreads, opts.correction);

  // Erwartet am Renntag: Fortschritt der letzten 8-12 Wochen, sonst vorsichtiger Standard; abgeflacht (τ = 16 Wochen)
  let race: RaceDay | null = null;
  const W = g.date ? Math.max(0, daysBetween(today, g.date) / 7) : 0;
  if (g.date && W >= 1) {
    const h = (opts.history || []).filter(x => x.est).sort((a, b) => a.date.localeCompare(b.date))[0];
    const wk = h ? daysBetween(h.date, today) / 7 : 0;
    const years = prof.experienceYears ?? null;
    const def0 = years != null && years < 2 ? 0.004 : 0.002;
    const yearly = years != null && years < 2 ? 0.04 : 0.02;
    const proj = (rate: number | null, cap: number) => { const r = Math.max(rate ?? def0, def0 * 0.5); const tau = 16; return clamp(r * tau * (1 - Math.exp(-W / tau)) + Math.max(0, W - 26) / 52 * yearly, 0, cap); };
    const rRun = h ? trendRate(est.runThrSpeed, h.est.runThrSpeed, wk) : null;
    const rBike = h ? trendRate(est.ftp || est.bikeThrKmh, h.est.ftp || h.est.bikeThrKmh, wk) : null;
    const rSwim = h ? trendRate(est.swimCss, h.est.swimCss, wk, true) : null;
    const iRun = proj(rRun, 0.15), iBike = proj(rBike, 0.18), iSwim = proj(rSwim, canCrawl && (sideNow.contM || 0) < 400 ? 0.25 : 0.15);
    const longRun = Math.max(sideNow.longRun || 0, plan.longRunPlanned || 0) || null;
    const longRide = Math.max(sideNow.longRide || 0, plan.longRidePlanned || 0) || null;
    const raceM = legs.filter(l => l.sport === 'swim').reduce((a, l) => a + l.km * 1000, 0);
    const contRace = canCrawl ? Math.min(Math.max(raceM, 25), (sideNow.contM || 25) * Math.pow(2, W / 8)) : 0;
    const sideRace: Side = { ...sideNow, thrSpeed: sideNow.thrSpeed * (1 + iRun), ftp: sideNow.ftp ? sideNow.ftp * (1 + iBike) : null, bikeKmh: sideNow.bikeKmh * Math.cbrt(1 + iBike), css: sideNow.css ? sideNow.css / (1 + iSwim) : null, contM: contRace, longRun, longRide, bricks: (plan.bricksDone || 0) + (plan.bricksPlanned || 0) };
    const wider: Record<string, number> = {}; Object.entries(spreads).forEach(([k, v]) => { wider[k] = v + Math.min(0.08, 0.003 * W); });
    const rm = model(g, sideRace, prof, wider, opts.correction);
    race = { date: g.date, total: rm.total, parts: rm.parts };
  }

  // Was bringt am meisten? Jede Stellschraube einzeln verbessern und die Ersparnis vergleichen
  const tests: { what: string; s: number }[] = [];
  const base = nowM.total.best;
  const tryWith = (o: Partial<Side>) => base - model(g, { ...sideNow, ...o }, prof, spreads, opts.correction).total.best;
  if (need.has('run')) {
    tests.push({ what: 'eine 5 % schnellere Lauf-Schwelle (1× pro Woche Schwellenlauf, z. B. 3×10 min)', s: tryWith({ thrSpeed: sideNow.thrSpeed * 1.05 }) });
    const km = legs.filter(l => l.sport === 'run').reduce((a, l) => Math.max(a, l.km), 0);
    if (km > 10 && (nowM.runK || 1.06) > 1.075) tests.push({ what: `längere lockere Läufe (langer Lauf Schritt für Schritt bis ${km >= 40 ? 150 : 100} min)`, s: tryWith({ longRun: km >= 40 ? 150 : 100 }) });
  }
  if (need.has('bike')) {
    tests.push({ what: 'eine 5 % höhere Radschwelle (1× pro Woche Sweet Spot, z. B. 3×12 min)', s: tryWith({ ftp: sideNow.ftp ? sideNow.ftp * 1.05 : null, bikeKmh: sideNow.bikeKmh * Math.cbrt(1.05) }) });
    const bikeMin = (nowM.parts.find(p => p.sport === 'bike') || { best: 0 }).best / 60;
    if (bikeMin > 60 && (sideNow.longRide || 0) < bikeMin * 0.8) tests.push({ what: `längere Ausfahrten (lange Ausfahrt bis ${Math.round(bikeMin * 0.8 / 15) * 15} min)`, s: tryWith({ longRide: Math.round(bikeMin * 0.8) }) });
  }
  if (need.has('swim')) {
    const raceM = legs.filter(l => l.sport === 'swim').reduce((a, l) => a + l.km * 1000, 0);
    if (canCrawl && (sideNow.contM || 0) < raceM) tests.push({ what: `länger am Stück kraulen (Technik-Einheiten, Ziel ${Math.min(raceM, Math.max(100, (sideNow.contM || 25) * 2))} m am Stück)`, s: tryWith({ contM: Math.min(raceM, Math.max(100, (sideNow.contM || 25) * 2)) }) });
    else if (canCrawl && sideNow.css) tests.push({ what: '5 % schnelleres Schwimmen (CSS-Intervalle, z. B. 8×100 m, und Technik)', s: tryWith({ css: sideNow.css / 1.05 }) });
    else tests.push({ what: 'Kraulen lernen (der Plan baut es in Stufen auf)', s: tryWith({ canCrawl: true, css: breast - 10, contM: 100 }) });
  }
  if (need.has('bike') && need.has('run') && GOALS[type].group === 'tri' && sideNow.bricks < 8) tests.push({ what: 'mehr Koppeltraining (kurzer Lauf direkt nach der Ausfahrt)', s: tryWith({ bricks: 8 }) });
  tests.sort((a, b) => b.s - a.s);
  const best = tests[0];
  const improve = best && best.s > 20 ? `Am meisten bringt dir ${best.what}: etwa ${best.s >= 90 ? Math.round(best.s / 60) + ' min' : Math.round(best.s) + ' s'} schneller.` : '';

  // Laufziele: andere Distanzen mit demselben Ausdauer-Modell
  const runDistances = RUN_DIST.map(d => { const r = runTimeSec(d.m / 1000, thrSpeed, sideNow.longRun, sideNow.runDec); const t = r.sec * ((opts.correction && opts.correction.run) || 1); const sp = spreads.run || 0.06; return { label: d.l, sport: 'run' as const, best: t, low: t * (1 - sp * 0.8), high: t * (1 + sp * 1.2) }; });
  if (W > 0 && g.date) reasons.push(`Wettkampf in ${Math.round(W)} Wochen: bis dahin kann sich viel ändern`);
  return { ok: true, missing: [...new Set(missing)], confidence, confReasons: reasons, total: nowM.total, parts: nowM.parts, race, runDistances: need.has('run') ? runDistances : undefined, improve, assumptions: nowM.assumptions, bike: nowM.bike };
}

/* Persönlicher Korrekturfaktor: Ist-Zeit / Prognose je Disziplin, gleitend über die Rennen (je Rennen halbes Gewicht), 0,85-1,15 */
export function updateCorrection(cur: Partial<Record<'swim' | 'bike' | 'run', number>> | null | undefined, predicted: Record<string, number>, actual: Record<string, number>): Partial<Record<'swim' | 'bike' | 'run', number>> {
  const out: Partial<Record<'swim' | 'bike' | 'run', number>> = { ...(cur || {}) };
  (['swim', 'bike', 'run'] as const).forEach(k => {
    if (!predicted[k] || !actual[k]) return;
    const ratio = clamp(actual[k] / predicted[k], 0.8, 1.25);
    const old = out[k] || 1;
    out[k] = Math.round(clamp(old * 0.5 + old * ratio * 0.5, 0.85, 1.15) * 1000) / 1000;
  });
  return out;
}
export function fmtDuration(sec: number): string {
  sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
/* Korrekturfaktor aus allen eingetragenen Rennen (nach Datum), je Disziplin. Ein Rennen zählt, wenn beim Eintragen die Prognose gespeichert wurde. */
export function correctionFromGoals(goals: Goal[]): Partial<Record<'swim' | 'bike' | 'run', number>> | null {
  let c: Partial<Record<'swim' | 'bike' | 'run', number>> = {};
  const done = (goals || []).filter(g => g && g.result && g.result.predicted && g.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const g of done) {
    const r = g.result!; const pr = r.predicted!;
    const legs = legsOf(g); const single = new Set(legs.map(l => l.sport)).size === 1 ? legs[0].sport : null;
    const actual: Record<string, number> = { ...(r.splits || {}) };
    if (single && r.timeSec && !actual[single]) actual[single] = r.timeSec;
    c = updateCorrection(c, pr, actual);
  }
  return Object.keys(c).length ? c : null;
}
