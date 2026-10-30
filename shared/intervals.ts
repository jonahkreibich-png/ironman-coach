/* Auftrag 22: Intervalle je Einheit (Laufen, Rad, Schwimmen, Koppel).
   - Soll: aus der Bauanleitung der Einheit (spec.steps) – jede harte Wiederholung ist ein Intervall mit Ziel (Dauer bzw. Strecke, Pace/Watt/Puls).
     Viele sehr kurze Stücke (z. B. 13×30 s) sind ein Intervall-Block. Die Soll-Werte sind nur Platzhalter, nie Ergebnis.
   - Ist: von Hand (metrics.intervals, Quelle „von Hand“) oder automatisch aus der Aufzeichnung: Runden der Uhr (Belastung/Pause),
     selbst gedrückte Runden mit Wechsel schnell/langsam, sonst harte Abschnitte aus dem Verlauf (activity.segments).
     Automatische Runden (z. B. jeder Kilometer) sind keine Intervalle (Auftrag 16). Hand gewinnt immer.
   - Zuordnung Ist → Soll: Reihenfolge bleibt, passende Dauer bzw. Strecke (Ausrichtung wie beim Textvergleich), Ein-/Auslaufen fällt weg,
     zusätzliche harte Stücke werden als „mehr als geplant“ gezeigt, fehlende als nicht gemacht, deutlich kürzere als abgebrochen.
   - Auswertung: je Intervall im Ziel / zu hart / zu locker, Ø der Intervalle (nur harte Teile), Ø der Pausen, Abfall erstes → letztes,
     Pulsanstieg, Erholung in den Pausen. Gesamtwerte der Einheit bleiben unverändert (fieldsOf). */
import * as W from './workouts';
import { HR_ZONES, POWER_ZONES } from './sports';
import type { LapOut, IntervalOut } from './activity/analyze';
import { isAutoLaps, lapKinds } from './activity/structure';

export type IvSport = 'run' | 'bike' | 'swim';
/** Ein eingetragenes bzw. gemessenes Intervall (mit der Pause danach). Alle Werte optional. */
export interface IvRow {
  sec?: number | null; m?: number | null; hr?: number | null; maxHr?: number | null;
  /** Laufen: Pace m:ss pro km */ pace?: string | null;
  /** Rad: Watt und km/h */ power?: number | null; speed?: number | null;
  /** Schwimmen: Pace m:ss pro 100 m, Züge pro Bahn */ pace100?: string | null; spl?: number | null;
  /** Laufen Schritte/min, Rad Umdrehungen/min */ cad?: number | null;
  rpe?: number | null; note?: string | null;
  /** Pause nach dem Intervall: Dauer und Puls am Ende der Pause (Erholung) */
  restSec?: number | null; restHr?: number | null;
  /** von Hand: abgebrochen */ aborted?: boolean;
}
export interface IvTarget {
  /** fortlaufend 0 … */ i: number;
  /** Satz (Schritt der Einheit) und Wiederholung darin */ set: number; rep: number; reps: number;
  sec: number | null; m: number | null; zone: number; restSec: number | null; mode?: string | null;
  label: string;
  /** Zielbereiche: Pace s/km [schnell, langsam], Watt [lo, hi], km/h [lo, hi], Pace s/100 m [schnell, langsam], Puls [lo, hi] */
  pace?: [number, number] | null; power?: [number, number] | null; speed?: [number, number] | null; pace100?: [number, number] | null; hr?: [number, number | null] | null;
  /** RPE-Ziel */ rpe: [number, number];
}
export type IvVerdict = 'ok' | 'hard' | 'easy' | 'short' | 'missing' | null;
export interface IvLine { target: IvTarget | null; row: IvRow | null; verdict: IvVerdict; why: string; extra: boolean; done: boolean;
  /** Tempo/Watt außerhalb des Ziels, Puls aber im Ziel: eher stimmen die Zonen nicht (faster = schneller als geplant) */ zone?: 'faster' | 'slower' }
export type IvSource = 'manual' | 'watch' | 'laps' | 'stream' | 'icu' | 'none';
export interface IvEval {
  sport: IvSport; source: IvSource; planned: number; done: number; extra: number; missing: number; short: number;
  inTarget: number; tooHard: number; tooEasy: number; judged: number;
  /** Intervalle mit Tempo/Watt neben dem Ziel bei passendem Puls */ zoneFaster: number; zoneSlower: number;
  lines: IvLine[];
  /** Ø nur über die harten Teile */ work: { sec: number | null; hr: number | null; maxHr: number | null; paceSec: number | null; power: number | null; speed: number | null; pace100: number | null; cad: number | null; rpe: number | null };
  /** Ø der Pausen */ rest: { sec: number | null; hr: number | null };
  /** Leistung letztes gegen erstes Intervall in % (positiv = schwächer) */ fadePct: number | null;
  /** Puls letztes gegen erstes Intervall (Schläge) */ hrRise: number | null;
  /** Puls fällt in den Pausen um … Schläge (Ø) */ recovery: number | null;
}

const RPE_ZONE: Record<number, [number, number]> = { 1: [1, 3], 2: [2, 4], 3: [5, 6], 4: [7, 8], 5: [8, 10] };
const num = (v: any): number | null => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
export const paceToSec = (v: any): number | null => { const m = /^(\d{1,2})[:.,](\d{2})$/.exec(String(v == null ? '' : v).trim()); return m && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
export const secToPace = (s: number | null | undefined): string => s == null || !Number.isFinite(s) ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`.replace(/:60$/, ':59');
const avg = (a: (number | null | undefined)[]): number | null => { const v = a.filter((x): x is number => x != null && Number.isFinite(x)); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
const wavg = (a: { v: number | null | undefined; w: number }[]): number | null => { const v = a.filter(x => x.v != null && Number.isFinite(x.v) && x.w > 0) as { v: number; w: number }[]; const sw = v.reduce((s, x) => s + x.w, 0); return sw ? v.reduce((s, x) => s + x.v * x.w, 0) / sw : null; };
const r0 = (x: number | null) => (x == null ? null : Math.round(x));
const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);
const minTxt = (sec: number) => sec < 60 ? `${Math.round(sec)} s` : sec % 60 ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')} min` : `${sec / 60} min`;

/* ---------- Soll aus dem Plan ---------- */
export interface IvThresholds { lthrRun?: number | null; lthrBike?: number | null; ftp?: number | null; runThrSec?: number | null; css?: number | null; powerMeter?: boolean }
const SWIM_SET_MODES = new Set(['crawl', 'pull', 'breast', 'mixed']);
/** Ist ein Schritt ein Intervall? Laufen/Rad: Hauptteil ab Zone 3. Schwimmen: Hauptteil-Serien (Kraul, Pull, Brust) mit Wiederholungen oder ab Zone 3. */
function isIvStep(spec: W.Spec, s: W.Step): boolean {
  if (s.part !== 'main' || s.walkOnly) return false;
  if (spec.sport === 'swim') return !!s.m && SWIM_SET_MODES.has(s.mode || 'crawl') && ((s.reps || 1) >= 2 || (s.zone || 2) >= 3);
  if (spec.sport !== 'run' && spec.sport !== 'bike') return false;
  return !!s.min && (s.zone || 2) >= 3;
}
export function plannedIntervals(session: any, thr: IvThresholds = {}): IvTarget[] {
  const spec: W.Spec | null = session && session.spec;
  if (!spec || !Array.isArray(spec.steps) || !(spec.sport === 'run' || spec.sport === 'bike' || spec.sport === 'swim')) return [];
  if (spec.kind === 'runwalk' || spec.kind === 'race') return [];
  const ctx: W.PaceCtx = { ...(spec.ctx || {}) };
  const lthr = spec.sport === 'bike' ? thr.lthrBike || ctx.lthrBike : thr.lthrRun || ctx.lthrRun;
  const ftp = thr.ftp || ctx.ftp;
  if (thr.runThrSec) ctx.runThrSec = thr.runThrSec;
  if (thr.css) ctx.css = thr.css;
  const out: IvTarget[] = [];
  spec.steps.forEach((s, si) => {
    if (!isIvStep(spec, s)) return;
    const zone = Math.max(1, Math.min(5, s.zone || 3));
    const reps = Math.max(1, s.reps || 1);
    const hrZ = HR_ZONES[zone - 1];
    const hr: [number, number | null] | null = lthr && spec.sport !== 'swim' ? [Math.round(lthr * hrZ.low / 100), hrZ.high >= 999 ? null : Math.round(lthr * hrZ.high / 100)] : null;
    let pace: [number, number] | null = null, power: [number, number] | null = null, speed: [number, number] | null = null, pace100: [number, number] | null = null;
    if (spec.sport === 'run' && ctx.runThrSec) pace = W.runPaceRange(ctx, zone);
    if (spec.sport === 'bike') {
      if (ftp) {
        if (spec.kind === 'sweetspot' && zone === 3) power = [Math.round(ftp * 0.88), Math.round(ftp * 0.94)];
        else { const pz = POWER_ZONES[zone - 1]; power = [Math.round(ftp * pz.low / 100), Math.round(ftp * (pz.high >= 999 ? 130 : pz.high) / 100)]; }
      }
      if (ctx.bikeKmh && !ctx.indoor) { const v = W.bikeKmh(ctx, zone); speed = [Math.round(v * 0.95 * 10) / 10, Math.round(v * 1.05 * 10) / 10]; }
    }
    if (spec.sport === 'swim') { const p = W.swimPace(ctx, zone, (s.mode || 'crawl') as W.StrokeMode, s.gear || []); pace100 = [p - 4, p + 4]; }
    const base = { set: si, zone, mode: s.mode || null, pace, power, speed, pace100, hr, rpe: RPE_ZONE[zone] };
    // viele sehr kurze Stücke (30/15, 20×25 m): ein Block statt vieler Zeilen
    const micro = spec.sport === 'swim' ? reps > 10 && (s.m || 0) <= 50 : reps > 8 && (s.min || 0) < 1;
    if (micro) {
      const sec = spec.sport === 'swim' ? null : Math.round(reps * (s.min || 0) * 60 + (reps - 1) * (s.restMin || 0) * 60);
      out.push({ ...base, i: out.length, rep: 0, reps: 1, sec, m: spec.sport === 'swim' ? reps * (s.m || 0) : null, restSec: null,
        label: spec.sport === 'swim' ? `${reps}×${s.m} m` : `${reps}×${minTxt((s.min || 0) * 60)}${s.restMin ? ` / ${minTxt(s.restMin * 60)}` : ''}` });
      return;
    }
    for (let k = 0; k < reps; k++) {
      const last = k === reps - 1;
      const restSec = spec.sport === 'swim' ? (last ? null : s.restSec || null) : last ? null : Math.round(((s.restMin || 0) + (s.walkMin || 0)) * 60) || null;
      out.push({ ...base, i: out.length, rep: k, reps, sec: spec.sport === 'swim' ? null : Math.round((s.min || 0) * 60), m: spec.sport === 'swim' ? s.m || null : null, restSec,
        label: spec.sport === 'swim' ? `${s.m} m${s.mode === 'pull' ? ' Pull Buoy' : s.mode === 'breast' ? ' Brust' : ''}` : minTxt((s.min || 0) * 60) });
    }
  });
  return out.slice(0, 40);
}

/* ---------- Ist aus der Aufzeichnung ---------- */
/** Ein Abschnitt einer Aufzeichnung (Runde oder erkannter Abschnitt) mit optionalen Zusatzwerten. */
export type Seg = LapOut & { endHr?: number | null; cad?: number | null; spl?: number | null };
/** Harte Abschnitte mit den Pausen dazwischen: Runden der Uhr, sonst Abschnitte aus dem Verlauf. */
export function detectedSegments(a: any): { segs: Seg[]; from: IvSource } {
  if (!a) return { segs: [], from: 'none' };
  const laps: Seg[] = Array.isArray(a.laps) ? a.laps : [];
  const sport = a.sport;
  if (laps.length >= 2 && !isAutoLaps(laps as any)) {
    let k: Seg[] = laps;
    if (sport === 'swim') {
      // Schwimmen: jede geschwommene Runde ist eine Serie (die Uhr setzt pro Serie eine Runde), Pausen-Runden trennen
      k = laps.map(l => (l.kind === 'steady' || l.kind === 'warmup' || l.kind === 'cooldown' ? { ...l, kind: 'work' as const } : l));
      if (k.some(l => l.kind === 'work')) return { segs: k, from: a.source === 'intervals' ? 'icu' : 'watch' };
    }
    if (!k.some(l => l.kind === 'work') && (sport === 'run' || sport === 'bike')) {
      const usePower = sport === 'bike' && laps.filter(l => l.power).length > laps.length * 0.5;
      k = lapKinds(laps, usePower) as Seg[];
    }
    if (k.some(l => l.kind === 'work')) {
      const pf = a.pattern && a.pattern.from;
      const watch = pf ? pf === 'watch' : laps.some(l => l.kind === 'rest' || l.kind === 'warmup' || l.kind === 'cooldown');
      return { segs: k, from: a.source === 'intervals' ? 'icu' : watch ? 'watch' : 'laps' };
    }
  }
  const segs: Seg[] = Array.isArray(a.segments) ? a.segments : [];
  if (segs.some(s => s.kind === 'work')) return { segs, from: 'stream' };
  return { segs: [], from: 'none' };
}
/** Abschnitte → Intervall-Zeilen (Pause = folgende lockere Abschnitte bis zum nächsten harten) */
export function rowsFromSegments(segs: Seg[], sport: string): IvRow[] {
  const rows: IvRow[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]; if (s.kind !== 'work') continue;
    const row: IvRow = { sec: s.sec ? Math.round(s.sec) : null, m: s.m != null ? Math.round(s.m) : null, hr: s.avgHr ?? null, maxHr: s.maxHr ?? null, cad: s.cad ?? null };
    if (sport === 'run' && s.speed) row.pace = secToPace(1000 / s.speed);
    if (sport === 'bike') { if (s.power) row.power = Math.round(s.power); if (s.speed) row.speed = Math.round(s.speed * 36) / 10; }
    if (sport === 'swim') { if (s.speed) row.pace100 = secToPace(100 / s.speed); else if (s.m && s.sec) row.pace100 = secToPace(s.sec / (s.m / 100)); if (s.spl) row.spl = s.spl; }
    let rest = 0, restHr: number | null = null, j = i + 1;
    while (j < segs.length && segs[j].kind === 'rest') { rest += segs[j].sec || 0; const h = segs[j].endHr ?? segs[j].avgHr ?? null; if (h != null) restHr = restHr == null ? h : Math.min(restHr, h); j++; }
    // nach dem letzten harten Abschnitt ist es Ausfahren/Auslaufen, keine Pause
    if (!segs.slice(j).some(x => x.kind === 'work')) rest = 0;
    if (rest > 0) { row.restSec = Math.round(rest); row.restHr = restHr != null ? Math.round(restHr) : null; }
    rows.push(row);
  }
  return rows;
}

/* ---------- Zuordnung Ist → Soll ---------- */
const sizeOf = (x: { sec?: number | null; m?: number | null }, swim: boolean) => (swim ? x.m || null : x.sec || null);
/** Ausrichtung in Reihenfolge: jedes Soll höchstens ein Ist; Ist ohne Soll vorne/hinten = Ein-/Auslaufen, dazwischen = zusätzlich. */
export function alignRows(targets: IvTarget[], rows: IvRow[], sport: string): { pairs: (number | null)[]; extra: number[] } {
  const swim = sport === 'swim';
  const n = targets.length, m = rows.length;
  if (!n) return { pairs: [], extra: rows.map((_, j) => j) };
  const cost = (i: number, j: number) => {
    const a = sizeOf(targets[i], swim), b = sizeOf(rows[j], swim) ?? (swim ? null : null);
    if (!a || !b) return 0.3;
    return Math.min(1.5, Math.abs(Math.log(b / a)));
  };
  const SKIP_T = 0.75, SKIP_R = 0.55;
  const D: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const P: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) { D[i][0] = i * SKIP_T; P[i][0] = 1; }
  for (let j = 1; j <= m; j++) { D[0][j] = j * SKIP_R; P[0][j] = 2; }
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const a = D[i - 1][j - 1] + cost(i - 1, j - 1), b = D[i - 1][j] + SKIP_T, c = D[i][j - 1] + SKIP_R;
    if (a <= b && a <= c) { D[i][j] = a; P[i][j] = 0; } else if (b <= c) { D[i][j] = b; P[i][j] = 1; } else { D[i][j] = c; P[i][j] = 2; }
  }
  const pairs: (number | null)[] = new Array(n).fill(null);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const p = i === 0 ? 2 : j === 0 ? 1 : P[i][j];
    if (p === 0) { pairs[i - 1] = j - 1; i--; j--; } else if (p === 1) i--; else j--;
  }
  // nicht zugeordnete Ist-Abschnitte: zusätzlich, wenn sie wie ein Intervall aussehen (Größe wie die geplanten, ±50 %)
  const used = new Set(pairs.filter((x): x is number => x != null));
  const sizes = targets.map(t => sizeOf(t, swim)).filter((x): x is number => !!x).sort((a, b) => a - b);
  const med = sizes.length ? sizes[Math.floor(sizes.length / 2)] : null;
  const extra = rows.map((_, k) => k).filter(k => !used.has(k) && (() => { const b = sizeOf(rows[k], swim); return !med || !b ? false : b >= med * 0.5 && b <= med * 1.5; })());
  return { pairs, extra };
}

/* ---------- Welche Ist-Werte gelten? ---------- */
const hasIst = (r: IvRow | null | undefined) => !!r && ['sec', 'm', 'hr', 'maxHr', 'pace', 'power', 'speed', 'pace100', 'cad', 'spl', 'rpe'].some(k => (r as any)[k] != null && (r as any)[k] !== '');
/** Liste von Hand (metrics.intervals mit Quelle „von Hand“) oder automatisch aus der Aufzeichnung bzw. von intervals.icu. */
export function actualRows(st: any, act: any): { rows: IvRow[]; source: IvSource; aligned: boolean } {
  const m = (st && st.metrics) || {};
  const manual = !!(st && ((st.metricsSrc || {}).intervals === 'manual' || (st.metricsManual || {}).intervals));
  if (manual) return { rows: Array.isArray(m.intervals) ? m.intervals : [], source: 'manual', aligned: true };
  if (act) {
    const d = detectedSegments(act);
    if (d.segs.length) return { rows: rowsFromSegments(d.segs, act.sport), source: d.from, aligned: false };
  }
  if (Array.isArray(m.intervals) && m.intervals.length) return { rows: m.intervals, source: (st.metricsSrc || {}).intervals === 'intervals' ? 'icu' : 'watch', aligned: false };
  return { rows: [], source: 'none', aligned: true };
}

/* ---------- Bewertung je Intervall ---------- */
function judge(t: IvTarget | null, r: IvRow, sport: IvSport): { v: IvVerdict; why: string; zone?: 'faster' | 'slower' } {
  const j = judge0(t, r, sport);
  // Leistung neben dem Ziel, aber Puls (ab 3 min aussagekräftig) im Zielbereich: nicht zu hart/zu locker, sondern Zonen-Hinweis
  if (t && t.hr && r.hr && (j.v === 'hard' || j.v === 'easy') && (sizeOf(r, sport === 'swim') || sizeOf(t, sport === 'swim') || 0) >= 180 && sport !== 'swim') {
    const hi = t.hr[1] ?? 999;
    if (r.hr >= t.hr[0] - 3 && r.hr <= hi + 3) return { v: 'ok', why: `${j.why}, Puls ${Math.round(r.hr)} im Ziel`, zone: j.v === 'hard' ? 'faster' : 'slower' };
  }
  return j;
}
function judge0(t: IvTarget | null, r: IvRow, sport: IvSport): { v: IvVerdict; why: string } {
  if (!t) return { v: null, why: '' };
  const size = sizeOf(t, sport === 'swim'), got = sizeOf(r, sport === 'swim');
  if (r.aborted || (size && got && got < size * 0.8)) return { v: 'short', why: got ? `${sport === 'swim' ? got + ' m' : minTxt(got)} statt ${sport === 'swim' ? size + ' m' : minTxt(size!)}` : 'abgebrochen' };
  const between = (x: number, lo: number, hi: number, tol: number) => (x < lo * (1 - tol) ? -1 : x > hi * (1 + tol) ? 1 : 0);
  // Reihenfolge: Leistung (Pace/Watt), dann Puls (nicht bei sehr kurzen Stücken, der Puls kommt zu spät), dann RPE
  if (sport === 'run' && t.pace && paceToSec(r.pace) != null) {
    const p = paceToSec(r.pace)!; const c = between(p, t.pace[0], t.pace[1], 0.02);
    return { v: c < 0 ? 'hard' : c > 0 ? 'easy' : 'ok', why: `${secToPace(p)}/km (Ziel ${secToPace(t.pace[0])}-${secToPace(t.pace[1])})` };
  }
  if (sport === 'bike' && t.power && r.power) {
    const c = between(r.power, t.power[0], t.power[1], 0.02);
    return { v: c > 0 ? 'hard' : c < 0 ? 'easy' : 'ok', why: `${Math.round(r.power)} W (Ziel ${t.power[0]}-${t.power[1]} W)` };
  }
  if (sport === 'swim' && t.pace100 && paceToSec(r.pace100) != null) {
    const p = paceToSec(r.pace100)!; const c = p < t.pace100[0] - 2 ? -1 : p > t.pace100[1] + 2 ? 1 : 0;
    return { v: c < 0 ? 'hard' : c > 0 ? 'easy' : 'ok', why: `${secToPace(p)}/100 m (Ziel ${secToPace(t.pace100[0])}-${secToPace(t.pace100[1])})` };
  }
  const longEnough = (got || size || 0) >= (sport === 'swim' ? 200 : 180);
  if (t.hr && r.hr && longEnough) {
    const hi = t.hr[1] ?? 999; const c = r.hr < t.hr[0] - 3 ? -1 : r.hr > hi + 3 ? 1 : 0;
    return { v: c > 0 ? 'hard' : c < 0 ? 'easy' : 'ok', why: `Puls ${Math.round(r.hr)} (Ziel ${t.hr[0]}${t.hr[1] ? `-${t.hr[1]}` : '+'})` };
  }
  if (r.rpe != null) { const c = r.rpe < t.rpe[0] ? -1 : r.rpe > t.rpe[1] ? 1 : 0; return { v: c > 0 ? 'hard' : c < 0 ? 'easy' : 'ok', why: `Gefühl ${r.rpe}/10 (Ziel ${t.rpe[0]}-${t.rpe[1]})` }; }
  return { v: null, why: '' };
}
/** Leistungswert eines Intervalls für Vergleiche (höher = stärker): Laufen/Schwimmen Tempo (m/s), Rad Watt, sonst km/h */
function perf(r: IvRow, sport: IvSport): number | null {
  if (sport === 'run') { const p = paceToSec(r.pace) ?? (r.m && r.sec ? r.sec / (r.m / 1000) : null); return p ? 1000 / p : null; }
  if (sport === 'bike') return num(r.power) ?? num(r.speed);
  const p = paceToSec(r.pace100) ?? (r.m && r.sec ? r.sec / (r.m / 100) : null); return p ? 100 / p : null;
}

/* ---------- Alles zusammen ---------- */
export function evaluateIntervals(session: any, st: any, act: any, thr: IvThresholds = {}, sportIn?: string): IvEval | null {
  const sport = (sportIn || (session && session.sport) || (act && act.sport)) as IvSport;
  if (sport !== 'run' && sport !== 'bike' && sport !== 'swim') return null;
  const targets = plannedIntervals(session, thr);
  const ar = actualRows(st, act);
  if (!targets.length && !ar.rows.some(hasIst)) return null;
  // ohne Plan zählen Abschnitte aus dem Verlauf nur bei erkanntem Intervalltraining (sonst z. B. zwei Stopps an der Ampel)
  if (!targets.length && ar.source === 'stream' && !(act && act.pattern && ['intervals', 'fartlek', 'hills'].includes(act.pattern.type))) return null;
  const lines: IvLine[] = [];
  if (ar.aligned) {
    // von Hand: Zeile i gehört zu Soll i, weitere Zeilen sind zusätzlich
    const n = Math.max(targets.length, ar.rows.length);
    for (let i = 0; i < n; i++) {
      const t = targets[i] || null, r = ar.rows[i] || null;
      if (r && hasIst(r)) { const j = judge(t, r, sport); lines.push({ target: t, row: r, verdict: j.v, why: j.why, extra: !t, done: true, ...(j.zone ? { zone: j.zone } : {}) }); }
      else if (t) lines.push({ target: t, row: r, verdict: 'missing', why: 'nicht eingetragen', extra: false, done: false });
    }
  } else {
    const { pairs, extra } = alignRows(targets, ar.rows, sport);
    const items: { at: number; line: IvLine }[] = [];
    let lastAt = -1;
    targets.forEach((t, i) => {
      const j = pairs[i]; const r = j == null ? null : ar.rows[j];
      if (r && hasIst(r)) { const v = judge(t, r, sport); lastAt = j!; items.push({ at: j!, line: { target: t, row: r, verdict: v.v, why: v.why, extra: false, done: true, ...(v.zone ? { zone: v.zone } : {}) } }); }
      else { lastAt += 0.001; items.push({ at: lastAt, line: { target: t, row: null, verdict: 'missing', why: 'nicht gefunden', extra: false, done: false } }); }
    });
    extra.forEach(j => items.push({ at: j, line: { target: null, row: ar.rows[j], verdict: null, why: '', extra: true, done: true } }));
    items.sort((a, b) => a.at - b.at).forEach(x => lines.push(x.line));
  }
  const doneLines = lines.filter(l => l.done && l.row);
  const full = doneLines.filter(l => l.verdict !== 'short');
  const work = doneLines.map(l => l.row!);
  const w = (k: keyof IvRow) => r1(wavg(work.map(r => ({ v: num(r[k]), w: num(r.sec) || num(r.m) || 1 }))));
  const paces = work.map(r => ({ v: paceToSec(r.pace) ?? (r.m && r.sec && sport === 'run' ? r.sec / (r.m / 1000) : null), w: num(r.sec) || 1 }));
  const p100 = work.map(r => ({ v: paceToSec(r.pace100) ?? (r.m && r.sec && sport === 'swim' ? r.sec / (r.m / 100) : null), w: num(r.m) || 1 }));
  const perfs = full.map(l => perf(l.row!, sport));
  const p1 = perfs.find(x => x != null) ?? null, pN = [...perfs].reverse().find(x => x != null) ?? null;
  const hrs = full.map(l => num(l.row!.hr)).filter((x): x is number => x != null);
  const rec = doneLines.map(l => { const r = l.row!; const top = num(r.maxHr) ?? num(r.hr); return top != null && num(r.restHr) != null && r.restSec ? top - num(r.restHr)! : null; }).filter((x): x is number => x != null);
  const restRows = work.filter(r => num(r.restSec));
  return {
    sport, source: ar.source, planned: targets.length, done: doneLines.filter(l => !l.extra).length, extra: lines.filter(l => l.extra).length,
    missing: lines.filter(l => l.verdict === 'missing').length, short: lines.filter(l => l.verdict === 'short').length,
    inTarget: lines.filter(l => l.verdict === 'ok').length, tooHard: lines.filter(l => l.verdict === 'hard').length, tooEasy: lines.filter(l => l.verdict === 'easy').length,
    judged: lines.filter(l => l.verdict === 'ok' || l.verdict === 'hard' || l.verdict === 'easy').length,
    zoneFaster: lines.filter(l => l.zone === 'faster').length, zoneSlower: lines.filter(l => l.zone === 'slower').length,
    lines,
    work: { sec: r0(avg(work.map(r => num(r.sec)))), hr: r0(w('hr')), maxHr: r0(avg(work.map(r => num(r.maxHr)))), paceSec: r0(wavg(paces)), power: r0(w('power')), speed: w('speed'), pace100: r0(wavg(p100)), cad: r0(w('cad')), rpe: r1(avg(work.map(r => num(r.rpe)))) },
    rest: { sec: r0(avg(restRows.map(r => num(r.restSec)))), hr: r0(avg(restRows.map(r => num(r.restHr)))) },
    fadePct: full.length >= 2 && p1 && pN ? r1((1 - pN / p1) * 100) : null,
    hrRise: hrs.length >= 2 ? Math.round(hrs[hrs.length - 1] - hrs[0]) : null,
    recovery: rec.length ? Math.round(avg(rec)!) : null
  };
}

/* Zeilen als Runden (für Scores, Trends und die bestehende Intervall-Statistik): harte Teile „work“, Pausen „rest“ */
export function rowsToLaps(rows: IvRow[], sport: string): LapOut[] {
  const out: LapOut[] = []; let n = 1;
  for (const r of rows || []) {
    if (!hasIst(r)) continue;
    const sec = num(r.sec), m = num(r.m);
    let speed: number | null = null;
    if (sport === 'run') { const p = paceToSec(r.pace); speed = p ? 1000 / p : m && sec ? m / sec : null; }
    else if (sport === 'bike') speed = num(r.speed) != null ? num(r.speed)! / 3.6 : m && sec ? m / sec : null;
    else { const p = paceToSec(r.pace100); speed = p ? 100 / p : m && sec ? m / sec : null; }
    const s = sec ?? (m && speed ? m / speed : null);
    out.push({ n: n++, sec: s != null ? Math.round(s) : 0, m: m ?? (s && speed ? Math.round(s * speed) : null), avgHr: num(r.hr), maxHr: num(r.maxHr), speed: speed != null ? Math.round(speed * 100) / 100 : null, power: num(r.power), kind: 'work' });
    if (num(r.restSec)) out.push({ n: n++, sec: Math.round(num(r.restSec)!), m: null, avgHr: num(r.restHr), maxHr: null, speed: null, power: null, kind: 'rest' });
  }
  return out;
}
/** Kurzform (wie IntervalOut aus der Aufzeichnung) für Stellen, die nur die Zusammenfassung brauchen */
export function evalToIntervalOut(e: IvEval | null): IntervalOut | null {
  if (!e || e.done + e.extra < 1) return null;
  const work = e.lines.filter(l => l.done && l.row);
  const hr1 = num(work[0]?.row?.hr), hrN = num(work[work.length - 1]?.row?.hr);
  return { count: work.length, workSec: Math.round(work.reduce((a, l) => a + (num(l.row!.sec) || 0), 0)), avgHrWork: e.work.hr, hrDriftPct: hr1 && hrN && work.length >= 2 ? r1((hrN / hr1 - 1) * 100) : null, dropPct: e.fadePct, recoveryHrDrop: e.recovery, lapsHr: work.map(l => num(l.row!.hr)) };
}
/** Hat diese Einheit von Hand eingetragene Intervalle? */
export const manualIntervals = (st: any): IvRow[] | null => (st && ((st.metricsSrc || {}).intervals === 'manual' || (st.metricsManual || {}).intervals) && Array.isArray((st.metrics || {}).intervals) ? st.metrics.intervals.filter(hasIst) : null);
export { hasIst as rowHasValues };

/* ---------- Eingabe prüfen (eine Zeile) ---------- */
export const IV_LIMITS: Record<string, [number, number]> = { sec: [5, 4 * 3600], m: [10, 100000], hr: [30, 230], maxHr: [30, 230], restHr: [30, 230], power: [20, 2000], speed: [3, 80], cad: [20, 230], spl: [4, 80], rpe: [1, 10], restSec: [0, 3600] };

/* ---------- intervals.icu: erkannte Abschnitte (icu_intervals) ----------
   Typ WORK = hart, RECOVERY/REST = Pause, sonst Ein-/Auslaufen. Gleich lange „harte“ Abschnitte ohne Pausen (automatische Runden) zählen nicht. */
export function segmentsFromIcu(list: any[], sport: string): Seg[] {
  const ok = (v: any) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  const segs: Seg[] = (Array.isArray(list) ? list : []).filter(x => x && (ok(x.moving_time) || ok(x.elapsed_time))).map((x: any, i: number) => {
    const ty = String(x.type || '').toUpperCase();
    const kind: LapOut['kind'] = ty === 'WORK' ? 'work' : ty === 'RECOVERY' || ty === 'REST' ? 'rest' : ty === 'WARMUP' ? 'warmup' : ty === 'COOLDOWN' ? 'cooldown' : 'steady';
    const sec = ok(x.moving_time) || ok(x.elapsed_time)!;
    const cad = ok(x.average_cadence);
    return { n: i + 1, sec: Math.round(sec), m: ok(x.distance) != null ? Math.round(x.distance) : null, avgHr: ok(x.average_heartrate) != null ? Math.round(x.average_heartrate) : null, maxHr: ok(x.max_heartrate) != null ? Math.round(x.max_heartrate) : null,
      speed: ok(x.average_speed), power: ok(x.average_watts) != null ? Math.round(x.average_watts) : null, kind,
      ...(cad ? { cad: Math.round(sport === 'run' && cad < 120 ? cad * 2 : cad) } : {}) };
  });
  const work = segs.filter(s => s.kind === 'work');
  if (!work.length || (!segs.some(s => s.kind === 'rest') && isAutoLaps(work as any))) return [];
  return segs;
}
