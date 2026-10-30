import { localDate } from './tz';
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
import { wkgFromKmh } from './sports';

export { vdot, timeForVdot, riegel };

export interface Prediction { label: string; sport?: 'swim' | 'bike' | 'run' | 'trans'; low: number; high: number; best: number; note?: string }
export interface RaceDay {
  date: string; total: Prediction; parts: Prediction[];
  /** Auftrag 23: Abstand in Wochen, kurz (bis 4 Monate) / mittel (bis 1 Jahr) / lang, Sicherheit am Renntag, gerundeter Bereich für weite Ziele */
  weeks?: number; horizon?: 'kurz' | 'mittel' | 'lang'; confidence?: 'niedrig' | 'mittel' | 'hoch'; approx?: string | null;
  /** erwartete Entwicklung je Sportart bis zum Rennen */
  growth?: Growth[];
  /** Laufziele: andere Distanzen am Renntag */
  runDistances?: Prediction[];
  /** fürs Pacing am Renntag */
  bike?: Prognosis['bike'];
  /** Annahmen nur für den Renntag (z. B. Kraul gelernt) */
  notes?: string[];
}
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
  // Auftrag 23: Marathon und länger mindestens 1,07 (Hobbyläufer verlieren auf den letzten 10 km mehr als auf kürzeren Strecken)
  const b = km >= 40 ? 1.07 : 1.06;
  let k = b + (1.15 - b) * clamp((1 - r) / 0.7, 0, 1);
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
        // Koppeltraining verkleinert den Abschlag um bis zu ein Viertel (Auftrag 23: vorher ein Drittel, Ironman-Marathon war zu schnell)
        const brickF = 1 - 0.25 * Math.min(1, sd.bricks / 8);
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

/* ---------- Entwicklung bis zum Wettkampf (Auftrag 23) ----------
   Vorher: Trend der letzten 10 Wochen, nach 16 Wochen abgeflacht, danach +2-4 % pro Jahr. Für Ziele in 2-3 Jahren war das viel zu wenig
   (Ironman 2029 bei Jonah: Schwimmen 2:41 → 2:21/100 m in 3 Jahren, obwohl er gerade Kraulen lernt).
   Jetzt: jede Sportart nähert sich einer persönlichen Leistungsgrenze, die vom geplanten Umfang in dieser Sportart, Alter und Geschlecht
   abhängt. Pro Jahr wird ein fester Anteil des Abstands geschlossen (Laufen 25 %, Rad 28 %, Schwimmen 40 % wegen der Technik);
   Jugendliche schneller, Ältere langsamer. Wer weit weg ist (Einsteiger), macht große Sprünge; wer nah dran ist, kleine.
   „Wenn du den Plan durchziehst“: Pausen, Krankheit und Verletzungen stecken im breiteren Bereich (nach oben mehr als nach unten). */
export type DevSport = 'run' | 'bike' | 'swim';
export interface DevCtx { age: number | null; sex: 'f' | 'm' | 'd' | null | undefined; weeklyHours: number; shares: Record<DevSport, number> }
export interface Growth { sport: DevSport; level: 'Einsteiger' | 'Fortgeschritten' | 'Erfahren'; gain: number; from: number; to: number; ceiling: number; years: number }
const CLOSE_PER_YEAR: Record<DevSport, number> = { run: 0.25, bike: 0.28, swim: 0.4 };
/* Alter: Jugendliche entwickeln sich schneller, ab 30 langsamer (Faktor auf den Anteil, der pro Jahr geschlossen wird) */
export function ageFactor(age: number | null): number {
  if (age == null) return 1;
  return age < 20 ? 1.25 : age < 30 ? 1 : age < 40 ? 0.9 : age < 50 ? 0.75 : age < 60 ? 0.6 : 0.45;
}
/* Leistungsgrenze in der Einheit der Sportart: Laufen Schwellen-Tempo (m/s), Rad W/kg, Schwimmen Tempo (m/s an der CSS). Mit Umfang je Sportart (h/Woche). */
export function ceilingOf(sport: DevSport, ctx: DevCtx): number {
  const hs = Math.max(0, ctx.weeklyHours * (ctx.shares[sport] || 0));
  const u = (a: number, b: number) => clamp((hs - a) / (b - a), 0, 1);
  let c = sport === 'run' ? 3.51 + (4.1 - 3.51) * u(1, 7)       // 4:45/km … 4:04/km
    : sport === 'bike' ? 2.6 + (4.0 - 2.6) * u(1.5, 8)            // W/kg
      : 100 / (125 - 30 * u(0.5, 4));                                // 2:05 … 1:35/100 m
  if (ctx.sex === 'f') c *= sport === 'run' ? 0.9 : sport === 'bike' ? 0.87 : 0.95;
  if (ctx.age != null && ctx.age > 35) c /= 1 + 0.007 * (ctx.age - 35);
  if (ctx.age != null && ctx.age < 16) c *= 0.92 + 0.02 * Math.max(0, ctx.age - 12);
  return c;
}
/* Erwartete Verbesserung (Anteil, 0,1 = 10 % schneller bzw. stärker) nach `years` Jahren bei aktuellem Wert `cur` */
export function growthOf(sport: DevSport, cur: number, ctx: DevCtx, years: number): Growth {
  const C = ceilingOf(sport, ctx);
  const f = clamp(CLOSE_PER_YEAR[sport] * ageFactor(ctx.age), 0.05, 0.6);
  const gap = (C - cur) / C;
  const level: Growth['level'] = gap > 0.2 ? 'Einsteiger' : gap > 0.07 ? 'Fortgeschritten' : 'Erfahren';
  let to: number;
  if (cur < C * 0.98) to = C - (C - cur) * Math.pow(1 - f, years);
  else {
    // an oder über der eigenen Grenze: Jugendliche legen noch etwas zu, ab 45 geht es leicht zurück
    const a = ctx.age ?? 30;
    const rate = a < 20 ? 0.015 : a < 35 ? 0.006 : a < 45 ? 0 : -0.006;
    to = cur * (1 + rate * years);
  }
  return { sport, level, gain: to / cur - 1, from: cur, to, ceiling: C, years };
}
/* Anteile der Sportarten am Umfang (für die Grenze je Sportart) */
export function sportShares(sports: string[]): Record<DevSport, number> {
  const has = (s: DevSport) => sports.includes(s);
  const n = (['swim', 'bike', 'run'] as DevSport[]).filter(has);
  if (n.length <= 1) return { run: has('run') || !n.length ? 1 : 0, bike: has('bike') ? 1 : 0, swim: has('swim') ? 1 : 0 };
  const w: Record<DevSport, number> = { swim: has('swim') ? 0.2 : 0, bike: has('bike') ? 0.45 : 0, run: has('run') ? 0.35 : 0 };
  const s = w.swim + w.bike + w.run;
  return { swim: w.swim / s, bike: w.bike / s, run: w.run / s };
}
/* Unsicherheit nach Abstand: wächst mit der Wurzel der Zeit und mit der Größe des erwarteten Sprungs */
/* Unabhängige Quellen addieren sich quadratisch: Datenlage heute, Zeit bis zum Rennen und wie stark man auf Training anspricht
   (±30 % des erwarteten Sprungs). Ergibt bei 3 Jahren etwa ±8-10 % auf die Gesamtzeit. */
export function horizonSpread(base: number, weeks: number, gain: number): number {
  const t = 0.015 * Math.sqrt(Math.max(0, weeks) / 13), r = 0.3 * Math.max(0, gain);
  return Math.sqrt(base * base + t * t + r * r);
}
export function horizonOf(weeks: number): 'kurz' | 'mittel' | 'lang' { return weeks <= 16 ? 'kurz' : weeks <= 52 ? 'mittel' : 'lang'; }
/* Gerundeter Bereich für weite Ziele: über 4 h auf halbe Stunden, über 1,5 h auf 5 min, sonst auf Minuten */
export function approxRange(low: number, high: number): string {
  const step = high > 4 * 3600 ? 1800 : high > 5400 ? 300 : 60;
  const lo = Math.round(low / step) * step, hi = Math.max(lo + step, Math.round(high / step) * step);
  const f = (s: number) => { const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? (m ? `${h}:${String(m).padStart(2, '0')}` : String(h)) : String(m); };
  return high > 3600 ? `${f(lo)}–${f(hi)} h` : `${f(lo)}–${f(hi)} min`;
}

function runPred(d: { l: string; m: number }, thr: number, longRun: number | null, dec: number | null, sp: number, corr: ProgOpts['correction']): Prediction {
  const t = runTimeSec(d.m / 1000, thr, longRun, dec).sec * ((corr && corr.run) || 1);
  return { label: d.l, sport: 'run', best: t, low: t * (1 - sp * 0.8), high: t * (1 + sp * 1.2) };
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
  const today = opts.today || localDate();
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

  // Erwartet am Renntag (Auftrag 23): Entwicklungsmodell je Sportart (Abstand zur eigenen Grenze, Alter, Umfang), in den ersten Monaten
  // zur Hälfte mit dem eigenen Trend der letzten 10 Wochen gemischt (der Anteil des Trends nimmt mit dem Abstand ab).
  let race: RaceDay | null = null;
  const W = g.date ? Math.max(0, daysBetween(today, g.date) / 7) : 0;
  if (g.date && W >= 1) {
    const h = (opts.history || []).filter(x => x.est).sort((a, b) => a.date.localeCompare(b.date))[0];
    const wk = h ? daysBetween(h.date, today) / 7 : 0;
    const yrs = W / 52.18;
    const age = prof.birthYear ? (Date.parse(today + 'T12:00:00Z') - Date.parse(prof.birthYear + '-07-01T12:00:00Z')) / (365.25 * 86400000) + yrs / 2 : null;
    const dctx: DevCtx = { age, sex: prof.sex, weeklyHours: prof.weeklyHours || 6, shares: sportShares(((prof.sports as string[]) || []).length ? prof.sports as string[] : [...need]) };
    const weight = prof.weightKg || 72;
    const wkgNow = sideNow.ftp ? sideNow.ftp / weight : wkgFromKmh(sideNow.bikeKmh);
    // Wer noch nicht krault, lernt es mit dem Plan (Schwimm-Stufen): bei mindestens 6 Monaten bis zum Rennen gilt Kraul ab etwa einem halben
    // Jahr, zuerst etwa im Brust-Tempo; danach entwickelt es sich wie bei Einsteigern. Vorher blieb es bis zum Rennen bei Brust.
    const learn = !canCrawl && need.has('swim') && W >= 26 && sk.swimCrawl !== 'never';
    const cssBase = sideNow.css || (learn ? breast + 5 : null);
    const grow: Partial<Record<DevSport, Growth>> = {
      run: growthOf('run', sideNow.thrSpeed, dctx, yrs),
      bike: growthOf('bike', wkgNow, dctx, yrs),
      ...(cssBase ? { swim: growthOf('swim', 100 / cssBase, dctx, learn ? Math.max(0, yrs - 0.5) : yrs) } : {})
    };
    const proj = (rate: number | null, model: number, cap: number) => {
      if (rate == null) return clamp(model, -0.05, cap);
      const tau = 16; const trend = Math.max(rate, 0) * tau * (1 - Math.exp(-W / tau));
      const w = 0.5 * Math.exp(-W / 20);
      return clamp(w * trend + (1 - w) * model, 0, cap);
    };
    const rRun = h ? trendRate(est.runThrSpeed, h.est.runThrSpeed, wk) : null;
    const rBike = h ? trendRate(est.ftp || est.bikeThrKmh, h.est.ftp || h.est.bikeThrKmh, wk) : null;
    const rSwim = h ? trendRate(est.swimCss, h.est.swimCss, wk, true) : null;
    const iRun = proj(rRun, grow.run!.gain, 0.45), iBike = proj(rBike, grow.bike!.gain, 0.6), iSwim = proj(rSwim, grow.swim ? grow.swim.gain : 0, 0.8);
    const runKm = legs.filter(l => l.sport === 'run').reduce((a, l) => Math.max(a, l.km), 0);
    const bikeKm0 = legs.filter(l => l.sport === 'bike').reduce((a, l) => a + l.km, 0);
    // Plan durchziehen: lange Einheiten wachsen Schritt für Schritt auf das, was die Distanz braucht (voll erst nach der idealen
    // Vorbereitungszeit), mindestens bis zum geplanten; Koppeleinheiten etwa jede 3. Woche
    const ramp = clamp(W / GOALS[type].prepWeeks[1], 0, 1);
    const grown = (cur: number | null, need: number) => (cur || 0) + Math.max(0, need - (cur || 0)) * ramp;
    const needRun = runKm >= 40 ? 150 : runKm >= 20 ? 100 : runKm >= 10 ? 70 : 45;
    const longRun = Math.max(sideNow.longRun || 0, plan.longRunPlanned || 0, runKm ? grown(sideNow.longRun, needRun) : 0) || null;
    const bikeMinRace = bikeKm0 ? bikeKm0 / (sideNow.bikeKmh * 0.9) * 60 : 0;
    const longRide = Math.max(sideNow.longRide || 0, plan.longRidePlanned || 0, bikeKm0 ? grown(sideNow.longRide, Math.min(330, bikeMinRace * 0.8)) : 0) || null;
    const raceM = legs.filter(l => l.sport === 'swim').reduce((a, l) => a + l.km * 1000, 0);
    const contRace = canCrawl ? Math.min(Math.max(raceM, 25), (sideNow.contM || 25) * Math.pow(2, W / 8)) : learn ? Math.min(Math.max(raceM, 25), 25 * Math.pow(2, (W - 26) / 8)) : 0;
    const bricks = Math.max((plan.bricksDone || 0) + (plan.bricksPlanned || 0), GOALS[type].group === 'tri' ? Math.min(8, Math.floor(Math.min(W, GOALS[type].prepWeeks[1]) / 3)) : 0);
    const sideRace: Side = { ...sideNow, thrSpeed: sideNow.thrSpeed * (1 + iRun), ftp: sideNow.ftp ? sideNow.ftp * (1 + iBike) : null, bikeKmh: sideNow.bikeKmh * Math.cbrt(1 + iBike), css: cssBase ? cssBase / (1 + iSwim) : null, canCrawl: canCrawl || learn, contM: contRace, longRun, longRide, bricks };
    const gainOf: Record<string, number> = { run: iRun, bike: Math.cbrt(1 + iBike) - 1, swim: iSwim };
    const wider: Record<string, number> = {}; Object.entries(spreads).forEach(([k, v]) => { wider[k] = horizonSpread(v, W, gainOf[k] || 0); });
    const rm = model(g, sideRace, prof, wider, opts.correction);
    const horizon = horizonOf(W);
    const growth = (Object.values(grow) as Growth[]).filter(x => need.has(x.sport)).map(x => ({ ...x, gain: x.sport === 'run' ? iRun : x.sport === 'bike' ? iBike : iSwim }));
    const rconf: Prognosis['confidence'] = horizon === 'lang' ? 'niedrig' : horizon === 'mittel' && confidence === 'hoch' ? 'mittel' : confidence;
    race = { date: g.date, total: rm.total, parts: rm.parts, bike: rm.bike, notes: learn ? ['Schwimmen: Kraulen lernst du mit dem Plan (Schwimm-Stufen). Gerechnet ab etwa einem halben Jahr, zuerst etwa im Brust-Tempo, danach wie bei Einsteigern.'] : [], weeks: Math.round(W), horizon, confidence: rconf, approx: horizon === 'lang' ? approxRange(rm.total.low, rm.total.high) : null, growth,
      runDistances: need.has('run') && GOALS[type].group === 'run' ? RUN_DIST.map(d => runPred(d, sideRace.thrSpeed, sideRace.longRun, sideNow.runDec, wider.run || 0.06, opts.correction)) : undefined };
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
  const runDistances = RUN_DIST.map(d => runPred(d, thrSpeed, sideNow.longRun, sideNow.runDec, spreads.run || 0.06, opts.correction));
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

/* ---------- Auftrag 23: Prognose für jedes Ziel ---------- */
/* Geplantes Training bis zum Rennen (vorher nur in der App): längster Lauf und längste Fahrt, Koppeleinheiten erledigt (letzte 12 Wochen)
   und geplant. sessions: Einheiten des Plans mit Datum; done: erledigt?; extra: eigene Einheiten je Tag; skip: Tests und Wettkämpfe.
   Auftrag 23: vorher zählten nur „nicht harte“ Einheiten – „hart“ schließt in core.ts aber jeden langen Lauf ein (isKey = Intervalle oder lang),
   so wurde genau der lange Lauf übersehen (Jonah: 105 min am 28.2. → gerechnet mit 50 min). */
export function planFactsOf(sessions: any[], done: (s: any) => boolean, extra: Record<string, any[]>, goal: Goal | null, today: string, skip: (s: any) => boolean): PlanFacts {
  const out: PlanFacts = { longRunPlanned: null, longRidePlanned: null, bricksDone: 0, bricksPlanned: 0 };
  const brick = (s: any) => /koppel|brick/i.test(s.title || '') || (s.spec && s.spec.kind === 'brick');
  const end = goal && goal.date ? goal.date : today;
  const from = addDaysP(today, -84);
  for (const s of sessions || []) {
    if (!s || s.cancelled || s.sport === 'rest' || s.race) continue;
    if (s.date < today) { if (s.date >= from && brick(s) && done(s)) out.bricksDone!++; continue; }
    if (s.date >= end) continue;
    if (brick(s)) out.bricksPlanned!++;
    if (skip(s)) continue;
    if (s.sport === 'run') out.longRunPlanned = Math.max(out.longRunPlanned || 0, s.plannedMinutes || 0);
    if (s.sport === 'bike' && !s.indoor) out.longRidePlanned = Math.max(out.longRidePlanned || 0, s.plannedMinutes || 0);
  }
  Object.entries(extra || {}).forEach(([d, l]) => (l || []).forEach((w: any) => { if (d >= from && d < today && w && /koppel|brick/i.test(w.title || '')) out.bricksDone!++; }));
  return out;
}
function addDaysP(s: string, n: number): string { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

export interface GoalProg { goal: Goal; placeholder: boolean; p: Prognosis }
/* Alle künftigen Ziele mit Datum oder Platzhalter-Termin (aus dem Plan), nach Datum, das nächste zuerst. Fitness-Ziele haben keine Zeit. */
export function goalsWithDates(goals: Goal[], planMeta: any, today: string): { goal: Goal; placeholder: boolean }[] {
  const ph: { id: string; date: string }[] = (planMeta && planMeta.placeholders) || [];
  return (goals || []).filter(g => g && g.type !== 'fitness' && !g.result && legsOf(g).length).map(g => {
    if (g.date) return { goal: g, placeholder: false };
    const p = ph.find(x => x && x.id === g.id);
    const date = p ? p.date : planMeta && planMeta.goalId === g.id && planMeta.eventDate ? planMeta.eventDate : null;
    return date ? { goal: { ...g, date }, placeholder: true } : null;
  }).filter((x): x is { goal: Goal; placeholder: boolean } => !!x && x.goal.date! >= today)
    .sort((a, b) => a.goal.date!.localeCompare(b.goal.date!) || (a.goal.priority || 'C').localeCompare(b.goal.priority || 'C'));
}
export function goalPrognoses(goals: Goal[], planMeta: any, today: string, est: Estimates, opts: Omit<ProgOpts, 'plan' | 'today'> & { planFor?: (g: Goal) => PlanFacts }): GoalProg[] {
  return goalsWithDates(goals, planMeta, today).map(x => {
    try { return { ...x, p: prognosis(x.goal, est, { ...opts, today, plan: opts.planFor ? opts.planFor(x.goal) : null }) }; } catch (e) { return null; }
  }).filter((x): x is GoalProg => !!x && x.p.ok);
}

/* Was hat die Prognose zuletzt bewegt? Für jeden Tag mit neuen Daten (Einheit, Test, Wettkampf), vom neuesten rückwärts: Prognose mit
   den Werten bis zum Vortag gegen die mit den Werten bis zu diesem Tag (gleicher Abstand zum Rennen). Der erste Tag, der sie um mehr als
   0,2 % verschiebt, ist „zuletzt aktualisiert“. */
export interface Move { date: string; delta: number; why: string[] }
const paceTxt = (ms: number | null | undefined) => ms ? mmss(1000 / ms) + '/km' : '–';
export function moveReasons(a: Estimates, b: Estimates, ca?: ProgOpts['correction'], cb?: ProgOpts['correction']): string[] {
  const out: string[] = [];
  const rel = (x: number | null | undefined, y: number | null | undefined) => x && y ? Math.abs(y / x - 1) : x || y ? 1 : 0;
  if (rel(a.runThrSpeed, b.runThrSpeed) > 0.003) out.push(`Lauf-Schwelle ${paceTxt(a.runThrSpeed)} → ${paceTxt(b.runThrSpeed)}`);
  if ((b.runLongMin || 0) !== (a.runLongMin || 0)) out.push(`längster Lauf ${a.runLongMin || 0} → ${b.runLongMin || 0} min`);
  if (b.ftp && rel(a.ftp, b.ftp) > 0.005) out.push(`FTP ${Math.round(a.ftp || 0)} → ${Math.round(b.ftp)} W`);
  else if (rel(a.bikeThrKmh, b.bikeThrKmh) > 0.003) out.push(`Rad-Schwelle ${de(a.bikeThrKmh || 0)} → ${de(b.bikeThrKmh || 0)} km/h`);
  if ((b.bikeLongMin || 0) !== (a.bikeLongMin || 0)) out.push(`längste Fahrt ${a.bikeLongMin || 0} → ${b.bikeLongMin || 0} min`);
  if (rel(a.swimCss, b.swimCss) > 0.003) out.push(`Schwimm-Tempo (CSS) ${a.swimCss ? mmss(a.swimCss) : '–'} → ${b.swimCss ? mmss(b.swimCss) : '–'}/100 m`);
  if ((b.swimContM || 0) !== (a.swimContM || 0)) out.push(`Kraul am Stück ${a.swimContM || 0} → ${b.swimContM || 0} m`);
  if (JSON.stringify(ca || null) !== JSON.stringify(cb || null)) out.push('Wettkampf-Ergebnis eingetragen (persönlicher Korrekturfaktor)');
  if ((b.runDec ?? null) !== (a.runDec ?? null) && !out.length) out.push('Ausdauer beim Laufen (Puls-Drift)');
  return out;
}
export function lastMove(goal: Goal, estAt: (d: string) => Estimates, dates: string[], opts: Omit<ProgOpts, 'history'> & { corrAt?: (d: string) => ProgOpts['correction'] }): Move | null {
  const today = opts.today || localDate();
  const prev = (d: string) => addDaysP(d, -1);
  const total = (e: Estimates, c: ProgOpts['correction']) => { const p = prognosis(goal, e, { ...opts, correction: c }); return p.race ? p.race.total.best : p.total ? p.total.best : 0; };
  const list = [...new Set(dates)].filter(d => d && d <= today).sort().reverse().slice(0, 10);
  for (const d of list) {
    const ea = estAt(prev(d)), eb = estAt(d);
    const ca = opts.corrAt ? opts.corrAt(prev(d)) : opts.correction, cb = opts.corrAt ? opts.corrAt(d) : opts.correction;
    const ta = total(ea, ca), tb = total(eb, cb);
    if (!ta || !tb || Math.abs(tb / ta - 1) < 0.002) continue;
    return { date: d, delta: tb - ta, why: moveReasons(ea, eb, ca, cb) };
  }
  return null;
}
