/* Auswertung einer Aufzeichnung: Kennzahlen, Zeit in Pulszonen, aerobe Entkopplung, Runden und Intervalle,
   Schwimmbahnen mit Zügen. Ergebnis ist ein kompakter Datensatz (kind "activity"), die Rohverläufe werden verkleinert. */
import type { RawActivity, ActSport } from './types';
import { GENERIC_LTHR } from '../profile';
import { appTz } from '../tz';
import { isAutoLaps, lapKinds, streamStructure, paceTrend, statsOf, type Pattern } from './structure';

export type Source = 'healthfit' | 'file' | 'shortcut' | 'intervals' | 'oura' | 'whoop' | 'polar' | 'withings' | 'fitbit' | 'suunto' | 'coros' | 'wahoo' | 'zepp' | 'healthkit' | 'manual';

export interface LapOut { n: number; sec: number; m: number | null; avgHr: number | null; maxHr: number | null; speed: number | null; power: number | null; kind: 'work' | 'rest' | 'warmup' | 'cooldown' | 'steady';
  /** Auftrag 22: Puls am Ende der Runde (Erholung in Pausen), Kadenz, Züge pro Bahn (Schwimmen) */ endHr?: number | null; cad?: number | null; spl?: number | null }
export interface IntervalOut {
  count: number; workSec: number; avgHrWork: number | null;
  /** Puls-Anstieg vom ersten zum letzten Intervall in % (bei gleicher Leistung = Ermüdung) */
  hrDriftPct: number | null;
  /** Tempo- oder Leistungsabfall vom ersten zum letzten Intervall in % (positiv = langsamer) */
  dropPct: number | null;
  /** wie viele Schläge der Puls in den Pausen im Schnitt fällt */
  recoveryHrDrop: number | null;
  lapsHr: (number | null)[];
}
export interface SwimOut {
  poolLengthM: number | null; lengths: number; activeLengths: number;
  strokesPerLength: number | null; metersPerStroke: number | null; pace100: number | null;
  byStroke: Record<string, number>; longestContinuousM: number | null; longestCrawlM?: number | null; strokeRate: number | null;
  /** Auftrag 21: Pace je Lage (s/100 m, aus den Bahnen) und SWOLF (Sekunden + Züge pro Bahn) */
  crawlPace100?: number | null; breastPace100?: number | null; swolf?: number | null;
}
export interface Activity {
  id: string;
  source: Source;
  sources: Source[];
  sport: ActSport;
  date: string;
  startMs: number;
  name?: string;
  indoor: boolean;
  openWater?: boolean;
  min: number | null; elapsedMin: number | null;
  km: number | null;
  avgHr: number | null; maxHr: number | null; avgPower: number | null;
  /** Auftrag 21: Normalized Power (Rad) */ np?: number | null;
  speedKmh: number | null; paceSecKm: number | null;
  ascentM: number | null; kcal: number | null; tempC: number | null;
  /** Sekunden in Pulszonen 1-5 (nach Schwellenpuls) */
  hrZones: number[] | null;
  /** aerobe Entkopplung in % (Tempo bzw. Leistung pro Herzschlag, 2. gegen 1. Hälfte) */
  decouplingPct: number | null;
  /** Effizienz: Meter pro Herzschlag (bzw. Watt pro Schlag beim Rad mit Leistung) */
  efficiency: number | null;
  /** längstes Stück am Stück im lockeren Bereich (Minuten) */
  laps: LapOut[];
  intervals: IntervalOut | null;
  /** Auftrag 16: Aufbau der Einheit (gleichmäßig, Intervalle, Fahrtspiel, Hügel, schneller werdend) */
  pattern?: Pattern | null;
  /** Auftrag 22: harte und lockere Abschnitte aus dem Verlauf (wenn die Runden nichts sagen) */
  segments?: LapOut[];
  swim: SwimOut | null;
  rpe?: number | null;
  /** Kadenz (Laufen: Schritte pro Minute, Rad: Umdrehungen), max. Leistung, Splits je km (Auftrag 7) */
  avgCadence?: number | null; maxCadence?: number | null; maxPower?: number | null;
  splits?: { km: number; pace: string; hr: number | null }[];
  /** Herkunft einzelner Werte und Korrekturen von Hand */
  manual?: Record<string, any>;
  /** Zuordnung zur geplanten Einheit */
  sessionId?: string | null;
  /** wird nach dem Zusammenführen ersetzt durch die Aktivität mit Vorrang */
  mergedInto?: string | null;
  hasStreams?: boolean;
  /** Rad-Art (road, gravel, mtb …), falls bekannt (Feld der Einheit oder Name) */
  bikeType?: string | null;
  createdAt?: number;
}

export interface AnalyzeOpts { source: Source; tz?: string; lthr?: { run?: number; bike?: number }; id?: string }

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export function localDate(ms: number, tz = appTz()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
/* Stabile Kennung: gleicher Start und Sport ergibt dieselbe ID, so wird eine Datei nie doppelt angelegt */
export function activityId(source: string, startMs: number, sport: string): string {
  return `${source}-${sport}-${Math.round(startMs / 1000)}`;
}
const ZONE_BOUNDS = [0.81, 0.89, 0.93, 1.0]; // Anteil vom Schwellenpuls: Z1 < 81 %, Z2 bis 89 %, Z3 bis 93 %, Z4 bis 100 %, Z5 darüber

export function analyze(raw: RawActivity, o: AnalyzeOpts): Activity {
  const T = raw.totals;
  const sport = raw.sport;
  const recs = raw.records;
  const lthr = sport === 'bike' ? (o.lthr && o.lthr.bike) || GENERIC_LTHR.bike : (o.lthr && o.lthr.run) || GENERIC_LTHR.run;
  const movingSec = T.movingSec ?? T.elapsedSec ?? null;
  const dist = T.distanceM ?? null;
  const hrVals = recs.map(r => r.hr).filter((x): x is number => x != null && x > 30);
  const avgHr = T.avgHr ?? (hrVals.length ? Math.round(avg(hrVals)!) : null);
  const maxHr = T.maxHr ?? (hrVals.length ? Math.max(...hrVals) : null);
  const speed = T.avgSpeed ?? (dist && movingSec ? dist / movingSec : null);
  const temps = recs.map(r => r.temp).filter((x): x is number => x != null);

  // Zeit in Zonen
  let hrZones: number[] | null = null;
  if (hrVals.length > 10 && (sport === 'run' || sport === 'bike' || sport === 'football' || sport === 'walk')) {
    hrZones = [0, 0, 0, 0, 0];
    for (let i = 1; i < recs.length; i++) {
      const hr = recs[i].hr; const dt = recs[i].t - recs[i - 1].t;
      if (hr == null || dt <= 0 || dt > 30) continue;
      const f = hr / lthr;
      const z = f < ZONE_BOUNDS[0] ? 0 : f < ZONE_BOUNDS[1] ? 1 : f < ZONE_BOUNDS[2] ? 2 : f <= ZONE_BOUNDS[3] ? 3 : 4;
      hrZones[z] += dt;
    }
    hrZones = hrZones.map(Math.round);
  }

  // Entkopplung und Effizienz (nur Lauf/Rad mit Puls, ab 20 min)
  let decouplingPct: number | null = null, efficiency: number | null = null;
  const usePower = sport === 'bike' && recs.filter(r => r.power != null && r.power > 0).length > recs.length * 0.5;
  if ((sport === 'run' || sport === 'bike') && hrVals.length > 30 && movingSec && movingSec >= 20 * 60) {
    const pts = recs.filter(r => r.hr != null && r.hr > 60 && (usePower ? r.power != null && r.power > 0 : r.speed != null && r.speed > (sport === 'run' ? 1.5 : 3)));
    if (pts.length > 30) {
      const skip = pts.filter(p => p.t >= 300); // Einlaufen/Einrollen (5 min) zählt nicht
      const use = skip.length > 30 ? skip : pts;
      const mid = use[0].t + (use[use.length - 1].t - use[0].t) / 2;
      const ratio = (arr: typeof use) => { const out = avg(arr.map(p => usePower ? p.power! : p.speed!)); const hr = avg(arr.map(p => p.hr!)); return out && hr ? out / hr : null; };
      const a = ratio(use.filter(p => p.t < mid)), b = ratio(use.filter(p => p.t >= mid));
      if (a && b) decouplingPct = r1((1 - b / a) * 100);
      const all = ratio(use);
      if (all) efficiency = usePower ? r2(all) : r2(all * 60); // m pro Herzschlag (m/s · 60 / Schläge pro Minute)
    }
  } else if ((sport === 'run' || sport === 'bike') && avgHr && speed) {
    efficiency = r2(speed * 60 / avgHr);
  }

  // Runden
  const laps = classifyLaps(raw, usePower);
  let intervals = intervalStats(laps, sport, usePower);
  // Auftrag 16: Aufbau erkennen. Automatische Runden (oder keine) sagen nichts über Intervalle, dann zählt der Verlauf.
  let pattern: Pattern | null = null;
  let segments: LapOut[] | undefined;
  if (sport === 'run' || sport === 'bike') {
    const auto = isAutoLaps(raw.laps.filter(l => l.sec > 5).map(l => ({ sec: l.sec, m: l.dist, trigger: l.trigger })));
    const watch = laps.some(l => l.kind === 'rest' || l.kind === 'warmup' || l.kind === 'cooldown') && raw.laps.some(l => l.intensity && l.intensity !== 'active');
    if (intervals && intervals.count >= 2) pattern = { type: 'intervals', from: watch ? 'watch' : 'laps', reps: intervals.count, workSec: laps.filter(l => l.kind === 'work').map(l => Math.round(l.sec)), autoLaps: false };
    else if (laps.filter(l => l.kind === 'work').length === 1 && !auto) pattern = { type: 'tempo', from: watch ? 'watch' : 'laps', reps: 1, workSec: laps.filter(l => l.kind === 'work').map(l => Math.round(l.sec)), autoLaps: false };
    else {
      const st = streamStructure(recs, sport);
      if (st && st.segments && st.segments.length) segments = st.segments;
      if (st && st.intervals) { intervals = st.intervals; pattern = { ...st.pattern, autoLaps: auto }; }
      else pattern = { type: 'steady', from: st ? 'stream' : laps.length >= 2 ? 'laps' : 'none', autoLaps: auto };
    }
  }

  // Schwimmen
  const swim = sport === 'swim' ? swimStats(raw) : null;

  // Auftrag 22: Distanz 0 (z. B. Teamsport ohne GPS) ist „nicht gemessen“
  const km = dist != null && dist > 0 ? r2(dist / 1000) : null;
  // Kadenz: Laufuhren speichern Schritte eines Fußes, also doppelt
  const cads = recs.map(r => r.cad).filter((x): x is number => x != null && x > 0);
  const cadF = sport === 'run' && cads.length && avg(cads)! < 120 ? 2 : 1;
  const avgCadence = cads.length ? Math.round(avg(cads)! * cadF) : null;
  const maxCadence = cads.length ? Math.round(Math.max(...cads) * cadF) : null;
  const pw = recs.map(r => r.power).filter((x): x is number => x != null && x > 0);
  const maxPower = sport === 'bike' && pw.length ? Math.max(...pw) : null;
  // Auftrag 21: Normalized Power (30-s-Mittel hoch 4, Mittel, 4. Wurzel), ab 20 min Wattdaten
  const np = sport === 'bike' ? normalizedPower(recs) : null;
  // Splits je km aus der Strecke (Pace und Ø-Puls je Kilometer)
  const splits: { km: number; pace: string; hr: number | null }[] = [];
  if (sport === 'run' && recs.some(r => r.dist != null)) {
    let next = 1000, startT = recs[0].t, hrs: number[] = [];
    for (const r of recs) {
      if (r.hr != null && r.hr > 30) hrs.push(r.hr);
      if (r.dist != null && r.dist >= next) { const sec = r.t - startT; splits.push({ km: next / 1000, pace: Math.floor(sec / 60) + ':' + String(Math.round(sec % 60)).padStart(2, '0'), hr: hrs.length ? Math.round(avg(hrs)!) : null }); startT = r.t; hrs = []; next += 1000; if (splits.length >= 50) break; }
    }
  }
  return {
    id: o.id || activityId(o.source, raw.startMs, sport),
    source: o.source, sources: [o.source],
    sport, date: localDate(raw.startMs, o.tz), startMs: raw.startMs, name: raw.name,
    indoor: raw.indoor, openWater: raw.openWater,
    min: movingSec != null ? Math.round(movingSec / 60) : null,
    elapsedMin: T.elapsedSec != null ? Math.round(T.elapsedSec / 60) : null,
    km,
    avgHr, maxHr, avgPower: T.avgPower ?? (usePower ? Math.round(avg(recs.map(r => r.power).filter((x): x is number => x != null && x > 0))!) : null),
    speedKmh: speed != null && sport !== 'swim' ? r1(speed * 3.6) : null,
    paceSecKm: speed && sport === 'run' ? Math.round(1000 / speed) : null,
    ascentM: T.ascentM, kcal: T.kcal, np,
    tempC: temps.length ? r1(avg(temps)!) : null,
    hrZones, decouplingPct, efficiency,
    avgCadence, maxCadence, maxPower, splits: splits.length ? splits : undefined,
    laps, intervals, swim, ...(segments ? { segments } : {}),
    pattern: withTrend(pattern, sport === 'run' ? paceTrend(splits) : null),
    hasStreams: recs.length > 0,
    createdAt: Date.now()
  };
}

/* Runden einordnen: Belastung, Pause, Ein- und Auslaufen. Nutzt die Angabe der Uhr (Workout mit Belastung/Pause).
   Sonst (Auftrag 16): nur bei deutlichem Wechsel schnell/langsam; automatische Runden der Uhr sind gleichmäßig. Schwimmen wie bisher. */
export function classifyLaps(raw: RawActivity, usePower = false): LapOut[] {
  const L = raw.laps.filter(l => l.sec > 5);
  return lapsBase(raw, L, usePower).map((o, i) => ({ ...o, ...lapExtra(raw, L[i]) }));
}
/* Auftrag 22: Puls am Ende der Runde, Ø-Kadenz und Züge pro Bahn aus Verlauf bzw. Bahnen (nur, was es gibt) */
function lapExtra(raw: RawActivity, l: RawActivity['laps'][number] | undefined): Partial<LapOut> {
  if (!l || !(l.start >= 0)) return {};
  const t0 = l.start, t1 = l.start + (l.elapsed || l.sec);
  const out: Partial<LapOut> = {};
  const inLap = raw.records.filter(r => r.t >= t0 && r.t <= t1);
  const endHr = [...inLap].reverse().find(r => r.hr != null && r.hr > 30 && r.t >= t1 - 15);
  if (endHr) out.endHr = endHr.hr;
  const cads = inLap.map(r => r.cad).filter((x): x is number => x != null && x > 0);
  if (cads.length >= 5 && (raw.sport === 'run' || raw.sport === 'bike')) { const c = avg(cads)!; out.cad = Math.round(raw.sport === 'run' && c < 120 ? c * 2 : c); }
  if (raw.sport === 'swim') { const ls = raw.lengths.filter(x => x.active && x.start >= t0 - 1 && x.start < t1 && x.strokes != null && x.strokes > 0); if (ls.length) out.spl = r1(avg(ls.map(x => x.strokes!))!); }
  return out;
}
function lapsBase(raw: RawActivity, L: RawActivity['laps'], usePower: boolean): LapOut[] {
  if (L.length < 2) return L.map((l, i) => lapOut(l, i, 'steady'));
  const fromWatch = L.some(l => l.intensity && l.intensity !== 'active');
  if (fromWatch) {
    return L.map((l, i) => lapOut(l, i, l.intensity === 'rest' || l.intensity === 'recovery' ? 'rest' : l.intensity === 'warmup' ? 'warmup' : l.intensity === 'cooldown' ? 'cooldown' : 'work'));
  }
  if (raw.sport !== 'swim') return lapKinds(L.map((l, i) => lapOut(l, i, 'steady')), usePower);
  // Schwimmen ohne Angabe: deutlich schneller oder höherer Puls als der Median = Belastung, deutlich langsamer = Pause
  const key = (l: typeof L[number]) => (l.avgPower ?? (l.avgSpeed != null ? l.avgSpeed * 100 : null));
  const vals = L.map(key).filter((x): x is number => x != null).sort((a, b) => a - b);
  const med = vals.length ? vals[Math.floor(vals.length / 2)] : null;
  const hrs = L.map(l => l.avgHr).filter((x): x is number => x != null).sort((a, b) => a - b);
  const medHr = hrs.length ? hrs[Math.floor(hrs.length / 2)] : null;
  const allSimilar = vals.length && med ? vals.every(v => Math.abs(v - med) / med < 0.08) : true;
  return L.map((l, i) => {
    if (allSimilar) return lapOut(l, i, 'steady');
    const k = key(l);
    const fast = (k != null && med != null && k > med * 1.08) || (l.avgHr != null && medHr != null && l.avgHr > medHr + 8);
    const slow = (k != null && med != null && k < med * 0.85) || (l.avgHr != null && medHr != null && l.avgHr < medHr - 12);
    let kind: LapOut['kind'] = fast && l.sec <= 30 * 60 ? 'work' : slow ? 'rest' : 'steady';
    if (i === 0 && kind !== 'work') kind = 'warmup';
    if (i === L.length - 1 && kind !== 'work') kind = 'cooldown';
    return lapOut(l, i, kind);
  });
}
function lapOut(l: RawActivity['laps'][number], i: number, kind: LapOut['kind']): LapOut {
  return { n: i + 1, sec: Math.round(l.sec), m: l.dist != null ? Math.round(l.dist) : null, avgHr: l.avgHr, maxHr: l.maxHr, speed: l.avgSpeed != null ? r2(l.avgSpeed) : null, power: l.avgPower, kind };
}

/* gleichmäßig + Splits deutlich schneller/langsamer ab km X → schneller werdend bzw. nachlassend */
const withTrend = (p: Pattern | null, tr: Pattern | null): Pattern | null => p && p.type === 'steady' && tr ? { ...tr, autoLaps: p.autoLaps } : p;
export function intervalStats(laps: LapOut[], sport: ActSport, usePower = false): IntervalOut | null {
  const work = laps.filter(l => l.kind === 'work');
  if (work.length < 2 || !(sport === 'run' || sport === 'bike' || sport === 'swim')) return null;
  if (sport !== 'swim') return statsOf(laps, usePower);
  const first = work[0], last = work[work.length - 1];
  const out = (l: LapOut) => (usePower && l.power ? l.power : l.speed);
  const hrDriftPct = first.avgHr && last.avgHr ? r1((last.avgHr / first.avgHr - 1) * 100) : null;
  const o1 = out(first), o2 = out(last);
  const dropPct = o1 && o2 ? r1((1 - o2 / o1) * 100) : null;
  // Erholung: maximaler Puls der Belastung minus Durchschnittspuls der folgenden Pause
  const drops: number[] = [];
  laps.forEach((l, i) => { const nx = laps[i + 1]; if (l.kind === 'work' && nx && nx.kind === 'rest' && (l.maxHr || l.avgHr) && nx.avgHr) drops.push((l.maxHr || l.avgHr!) - nx.avgHr); });
  const hrs = work.map(l => l.avgHr).filter((x): x is number => x != null);
  return {
    count: work.length, workSec: work.reduce((a, l) => a + l.sec, 0),
    avgHrWork: hrs.length ? Math.round(avg(hrs)!) : null,
    hrDriftPct, dropPct,
    recoveryHrDrop: drops.length ? Math.round(avg(drops)!) : null,
    lapsHr: work.map(l => l.avgHr)
  };
}

export function normalizedPower(recs: { t: number; power: number | null }[]): number | null {
  const p = recs.filter(r => r.power != null && r.power >= 0);
  if (p.length < 60 || p[p.length - 1].t - p[0].t < 1200) return null;
  const roll: number[] = []; let j = 0, sum = 0;
  for (let i = 0; i < p.length; i++) { sum += p[i].power!; while (p[i].t - p[j].t >= 30) { sum -= p[j].power!; j++; } if (p[i].t - p[0].t >= 30) roll.push(sum / (i - j + 1)); }
  if (!roll.length) return null;
  return Math.round(Math.pow(roll.reduce((a, x) => a + Math.pow(x, 4), 0) / roll.length, 0.25));
}

export function swimStats(raw: RawActivity): SwimOut {
  const pool = raw.poolLengthM ?? null;
  const act = raw.lengths.filter(l => l.active && l.sec > 0);
  const strokes = act.map(l => l.strokes).filter((x): x is number => x != null && x > 0);
  const spl = strokes.length ? r1(avg(strokes)!) : null;
  const byStroke: Record<string, number> = {};
    act.forEach(l => { const k = l.stroke || 'unknown'; byStroke[k] = (byStroke[k] || 0) + (pool || 0); });
  // längste Strecke am Stück: Bahnen ohne Pause (Abstand < 10 s)
  let best = 0, cur = 0, crawlBest = 0, crawl = 0, prevEnd: number | null = null;
  for (const l of raw.lengths) {
    if (!l.active) { best = Math.max(best, cur); crawlBest = Math.max(crawlBest, crawl); cur = 0; crawl = 0; prevEnd = null; continue; }
    if (prevEnd != null && l.start - prevEnd > 10) { best = Math.max(best, cur); crawlBest = Math.max(crawlBest, crawl); cur = 0; crawl = 0; }
    if (/^(freestyle|crawl|front_crawl)$/i.test(l.stroke || '')) crawl += pool || 0;
    else { crawlBest = Math.max(crawlBest, crawl); crawl = 0; }
    cur += pool || 0; prevEnd = l.start + l.sec;
  }
  best = Math.max(best, cur);
  crawlBest = Math.max(crawlBest, crawl);
  const swimSec = act.reduce((a, l) => a + l.sec, 0);
  const meters = act.length * (pool || 0);
  const cad = act.map(l => l.cadence).filter((x): x is number => x != null && x > 0);
  // Auftrag 21: Pace je Lage aus mindestens 4 Bahnen dieser Lage
  const strokePace = (re: RegExp) => { const ls = act.filter(l => re.test(l.stroke || '')); return pool && ls.length >= 4 ? Math.round(ls.reduce((a, l) => a + l.sec, 0) / (ls.length * pool / 100)) : null; };
  const sw = act.filter(l => l.strokes != null && l.strokes > 0);
  return {
    crawlPace100: strokePace(/^(freestyle|crawl|front_crawl)$/i), breastPace100: strokePace(/^breaststroke$/i),
    swolf: sw.length ? Math.round(sw.reduce((a, l) => a + l.sec + (l.strokes || 0), 0) / sw.length) : null,
    poolLengthM: pool, lengths: raw.lengths.length, activeLengths: act.length,
    strokesPerLength: spl,
    metersPerStroke: spl && pool ? r2(pool / spl) : null,
    pace100: meters && swimSec ? Math.round(swimSec / (meters / 100)) : (raw.totals.distanceM && raw.totals.movingSec ? Math.round(raw.totals.movingSec / (raw.totals.distanceM / 100)) : null),
    byStroke, longestContinuousM: best || null, longestCrawlM: crawlBest || null,
    strokeRate: cad.length ? Math.round(avg(cad)!) : null
  };
}

/* Verkleinerte Verläufe für Diagramme (höchstens ~600 Punkte), gespeichert getrennt vom Datensatz */
export function streamsOf(raw: RawActivity, maxPts = 600): { t: number[]; hr: (number | null)[]; speed: (number | null)[]; alt: (number | null)[]; power: (number | null)[] } {
  const step = Math.max(1, Math.ceil(raw.records.length / maxPts));
  const pick = raw.records.filter((_, i) => i % step === 0);
  return { t: pick.map(r => Math.round(r.t)), hr: pick.map(r => r.hr), speed: pick.map(r => (r.speed != null ? r2(r.speed) : null)), alt: pick.map(r => (r.alt != null ? Math.round(r.alt) : null)), power: pick.map(r => r.power) };
}
