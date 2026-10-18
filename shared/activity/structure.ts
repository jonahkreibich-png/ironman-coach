/* Auftrag 16: Aufbau einer Einheit erkennen – Dauerlauf, Intervalle, Fahrtspiel, Hügel, schneller werdend.
   Intervalle gibt es nur, wenn sich harte und lockere Abschnitte deutlich abwechseln (Tempo, Watt oder Puls).
   Automatische Runden der Uhr (z. B. jeder Kilometer) sind keine Intervalle: gleich lange Runden = Dauerlauf.
   Bei automatischen Runden (oder nur einer Runde) wird der Verlauf (Sekunden-Werte) untersucht. */
import type { RawRecord, ActSport } from './types';
import type { LapOut, IntervalOut } from './analyze';

export type PatternType = 'steady' | 'progression' | 'fade' | 'tempo' | 'intervals' | 'fartlek' | 'hills';
export interface Pattern {
  type: PatternType;
  /** woher: Runden der Uhr mit Belastung/Pause, selbst gedrückte Runden, Verlauf */
  from: 'watch' | 'laps' | 'stream' | 'splits' | 'none';
  /** automatische Runden der Uhr erkannt (gleich lang oder Auslöser Distanz/Zeit) */
  autoLaps?: boolean;
  /** schneller bzw. langsamer ab diesem Kilometer (bei progression/fade) */
  fromKm?: number | null;
  /** Ø-Pace (s/km) vorher und nachher bzw. Watt (bei progression/fade) */
  before?: number | null; after?: number | null;
  /** Belastungen: Anzahl und typische Dauer in Sekunden */
  reps?: number; workSec?: number[];
}

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (x: number) => Math.round(x * 10) / 10;
const cv = (a: number[]) => { const m = avg(a); return m ? Math.sqrt(avg(a.map(x => (x - m) ** 2))) / m : 0; };

/* Automatische Runden: Auslöser Distanz/Zeit (FIT lap_trigger 1/2) oder fast alle Runden gleich lang (Meter oder Sekunden).
   Die letzte Runde ist meist kürzer und zählt nicht mit. */
export function isAutoLaps(laps: { sec: number; m: number | null; trigger?: number | null }[]): boolean {
  if (laps.length < 3) return false;
  const body = laps.slice(0, -1);
  if (body.filter(l => l.trigger === 1 || l.trigger === 2).length >= body.length * 0.8) return true;
  const same = (vals: number[], tol: number) => {
    if (vals.length < body.length * 0.8) return false;
    const s = [...vals].sort((a, b) => a - b); const med = s[Math.floor(s.length / 2)];
    return med > 0 && vals.filter(v => Math.abs(v - med) <= med * tol).length >= body.length * 0.8;
  };
  return same(body.map(l => l.m).filter((x): x is number => x != null && x > 0), 0.03) || same(body.map(l => l.sec), 0.03);
}

/* Zwei Gruppen (hart/locker) aus Werten; Ergebnis: Mitte der beiden Gruppen */
function twoMeans(vals: number[], w?: number[]): { lo: number; hi: number } | null {
  if (vals.length < 2) return null;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi <= 0 || hi === lo) return null;
  for (let it = 0; it < 30; it++) {
    const mid = (lo + hi) / 2; let a = 0, aw = 0, b = 0, bw = 0;
    vals.forEach((v, i) => { const ww = w ? w[i] : 1; if (v >= mid) { b += v * ww; bw += ww; } else { a += v * ww; aw += ww; } });
    const nlo = aw ? a / aw : lo, nhi = bw ? b / bw : hi;
    if (Math.abs(nlo - lo) < 1e-6 && Math.abs(nhi - hi) < 1e-6) break;
    lo = nlo; hi = nhi;
  }
  return { lo, hi };
}
/* Mindest-Unterschied zwischen hart und locker: Tempo 12 %, Watt 20 %, nur Puls 12 Schläge */
const MIN_CONTRAST = { speed: 0.12, power: 0.2 };

/* Selbst gedrückte Runden (ohne Belastung/Pause von der Uhr): hart nur, wenn sich schnelle und langsame Runden abwechseln.
   Eine einzige schnelle Strecke (Tempolauf mit Ein- und Auslaufen) bleibt ein Block; langsam → schnell ohne Wechsel ist „schneller werdend“. */
export function lapKinds(laps: LapOut[], usePower = false): LapOut[] {
  const steady = laps.map((l, i) => ({ ...l, kind: 'steady' as LapOut['kind'], n: l.n || i + 1 }));
  if (laps.length < 3 || isAutoLaps(laps)) return steady;
  const key = (l: LapOut) => (usePower && l.power ? l.power : l.speed);
  const use = laps.map((l, i) => ({ l, i, v: key(l) })).filter(x => x.v != null && x.v > 0 && x.l.sec >= 10) as { l: LapOut; i: number; v: number }[];
  let hiIdx: Set<number>;
  if (use.length >= 3) {
    const g = twoMeans(use.map(x => x.v), use.map(x => Math.sqrt(x.l.sec)));
    if (!g || g.hi / g.lo - 1 < (usePower ? MIN_CONTRAST.power : MIN_CONTRAST.speed)) return steady;
    const mid = (g.lo + g.hi) / 2;
    hiIdx = new Set(use.filter(x => x.v >= mid && x.l.sec <= 30 * 60).map(x => x.i));
  } else {
    // ohne Tempo und Watt: nur Puls, mit großem Abstand
    const hr = laps.map((l, i) => ({ i, v: l.avgHr })).filter(x => x.v != null) as { i: number; v: number }[];
    const g = twoMeans(hr.map(x => x.v));
    if (!g || g.hi - g.lo < 12) return steady;
    hiIdx = new Set(hr.filter(x => x.v >= (g.lo + g.hi) / 2).map(x => x.i));
  }
  // Blöcke zählen: hart-Blöcke, die durch lockere Runden getrennt sind
  const blocks: number[][] = []; let cur: number[] = [];
  laps.forEach((_, i) => { if (hiIdx.has(i)) cur.push(i); else if (cur.length) { blocks.push(cur); cur = []; } });
  if (cur.length) blocks.push(cur);
  const alternating = blocks.length >= 2;
  if (!alternating) {
    // ein Block: Tempo-/Schwellenlauf mit Ein- und Auslaufen (davor und danach locker) – sonst einfach gleichmäßig bzw. schneller werdend
    const b = blocks[0];
    if (!b || b[0] === 0 || b[b.length - 1] === laps.length - 1) return steady;
  }
  return laps.map((l, i) => {
    let kind: LapOut['kind'] = hiIdx.has(i) ? 'work' : 'rest';
    if (kind !== 'work' && i < blocks[0][0]) kind = 'warmup';
    if (kind !== 'work' && i > blocks[blocks.length - 1][blocks[blocks.length - 1].length - 1]) kind = 'cooldown';
    return { ...l, n: l.n || i + 1, kind };
  });
}

/* ---------- Verlauf: Abschnitte aus Sekunden-Werten ---------- */
interface Seg { hi: boolean; t0: number; t1: number; hr: number | null; grade: number | null; v: number; d0: number | null }
const BIN = 5;
export interface StreamResult { pattern: Pattern; intervals: IntervalOut | null }
/* Signal: Watt (wenn vorhanden), sonst Tempo – bergauf/bergab ausgeglichen, wenn Höhe da ist (Hügel sollen nicht wie Tempowechsel aussehen) */
export function streamStructure(recs: RawRecord[], sport: ActSport): StreamResult | null {
  if (!(sport === 'run' || sport === 'bike') || recs.length < 60) return null;
  const powerN = recs.filter(r => r.power != null && r.power > 0).length;
  const usePower = powerN > recs.length * 0.5;
  const hasAlt = recs.filter(r => r.alt != null).length > recs.length * 0.5 && recs.some(r => r.dist != null);
  const end = recs[recs.length - 1].t; if (end < 10 * 60) return null;
  // 5-s-Fächer
  const n = Math.floor(end / BIN) + 1;
  const sum = new Array(n).fill(0), cnt = new Array(n).fill(0), hrS = new Array(n).fill(0), hrC = new Array(n).fill(0), spd = new Array(n).fill(0), spdC = new Array(n).fill(0);
  const alt: (number | null)[] = new Array(n).fill(null), dist: (number | null)[] = new Array(n).fill(null);
  for (const r of recs) {
    const k = Math.min(n - 1, Math.floor(r.t / BIN));
    const v = usePower ? r.power : r.speed;
    if (v != null && v >= 0) { sum[k] += v; cnt[k]++; }
    if (r.speed != null) { spd[k] += r.speed; spdC[k]++; }
    if (r.hr != null && r.hr > 30) { hrS[k] += r.hr; hrC[k]++; }
    if (r.alt != null) alt[k] = r.alt;
    if (r.dist != null) dist[k] = r.dist;
  }
  // Lücken füllen
  for (let k = 1; k < n; k++) { if (alt[k] == null) alt[k] = alt[k - 1]; if (dist[k] == null) dist[k] = dist[k - 1]; }
  const speedOf = (k: number) => spdC[k] ? spd[k] / spdC[k] : null;
  const stop = (k: number) => { const s = speedOf(k); return s != null && s < (sport === 'run' ? 0.8 : 1.5); };
  // Steigung über ±30 s
  const grade = (k: number) => {
    if (!hasAlt) return null;
    const a = Math.max(0, k - 6), b = Math.min(n - 1, k + 6);
    const da = (alt[b] ?? 0) - (alt[a] ?? 0), dd = (dist[b] ?? 0) - (dist[a] ?? 0);
    return dd > 20 ? Math.max(-15, Math.min(15, da / dd * 100)) : null;
  };
  const raw = new Array(n).fill(null).map((_, k) => {
    if (!cnt[k]) return null;
    let v = sum[k] / cnt[k];
    if (!usePower && sport === 'run') { const g = grade(k); if (g != null) v = v * (1 + (g > 0 ? 0.033 : 0.018) * g); }
    return v;
  });
  // 30 s glätten
  const sm: (number | null)[] = raw.map((_, k) => { const w = raw.slice(Math.max(0, k - 3), k + 4).filter((x): x is number => x != null); return w.length ? avg(w) : null; });
  const ok = sm.map((v, k) => v != null && !stop(k));
  const vals = sm.filter((v, k) => ok[k]) as number[];
  if (vals.length < 60) return null;
  const g = twoMeans(vals);
  const contrast = g ? g.hi / g.lo - 1 : 0;
  const minC = usePower ? MIN_CONTRAST.power : MIN_CONTRAST.speed + 0.03;
  // Abschnitte mit Hysterese, Stopps gelten als locker
  const mid = g ? (g.lo + g.hi) / 2 : 0, band = g ? (g.hi - g.lo) * 0.15 : 0;
  let state = false; const lab: boolean[] = [];
  for (let k = 0; k < n; k++) {
    const v = sm[k];
    if (!ok[k] || v == null) { state = false; lab.push(false); continue; }
    if (!state && v > mid + band) state = true; else if (state && v < mid - band) state = false;
    lab.push(state);
  }
  let segs: Seg[] = [];
  const close = (hi: boolean, k0: number, k1: number) => {
    const hrs: number[] = []; const vs: number[] = []; const gs: number[] = [];
    // Puls reagiert verzögert: 15 s später messen
    for (let k = k0; k <= k1; k++) { const kk = Math.min(n - 1, k + 3); if (hrC[kk]) hrs.push(hrS[kk] / hrC[kk]); if (sm[k] != null) vs.push(sm[k]!); const gg = grade(k); if (gg != null) gs.push(gg); }
    segs.push({ hi, t0: k0 * BIN, t1: (k1 + 1) * BIN, hr: hrs.length ? avg(hrs) : null, grade: gs.length ? avg(gs) : null, v: vs.length ? avg(vs) : 0, d0: dist[k0] });
  };
  let s0 = 0;
  for (let k = 1; k <= n; k++) if (k === n || lab[k] !== lab[s0]) { close(lab[s0], s0, k - 1); s0 = k; }
  // sehr kurze Abschnitte (< 20 s) dem Nachbarn zuschlagen
  for (let guard = 0; guard < 200; guard++) {
    const i = segs.findIndex(s => s.t1 - s.t0 < 20);
    if (i < 0 || segs.length < 2) break;
    const j = i === 0 ? 1 : i - 1; const a = segs[Math.min(i, j)], b = segs[Math.max(i, j)];
    const keep = segs[j];
    const merged: Seg = { ...keep, t0: a.t0, t1: b.t1, d0: a.d0 };
    segs.splice(Math.min(i, j), 2, merged);
    // gleiche Nachbarn verbinden
    segs = segs.reduce((acc: Seg[], s) => { const p = acc[acc.length - 1]; if (p && p.hi === s.hi) { acc[acc.length - 1] = { ...p, t1: s.t1, hr: p.hr != null && s.hr != null ? (p.hr * (p.t1 - p.t0) + s.hr * (s.t1 - s.t0)) / (s.t1 - p.t0) : p.hr ?? s.hr, v: (p.v * (p.t1 - p.t0) + s.v * (s.t1 - s.t0)) / (s.t1 - p.t0) }; } else acc.push(s); return acc; }, []);
  }
  const his = segs.filter(s => s.hi);
  const los = segs.filter(s => !s.hi);
  const total = end || 1;
  const hiShare = his.reduce((a, s) => a + s.t1 - s.t0, 0) / total;
  const hrHi = avg(his.map(s => s.hr).filter((x): x is number => x != null)), hrLo = avg(los.map(s => s.hr).filter((x): x is number => x != null));
  const hrOk = !hrHi || !hrLo || hrHi - hrLo >= 3;
  const inner = his.filter((s, i) => s.t1 - s.t0 <= 30 * 60 && (i > 0 || s.t0 > 0 || his.length > 1));
  const isIv = !!g && contrast >= minC && inner.length >= 3 && hiShare >= 0.05 && hiShare <= 0.7 && hrOk;
  if (isIv) {
    const work = inner.map(s => s.t1 - s.t0);
    const rests = segs.filter((s, i) => !s.hi && i > 0 && i < segs.length - 1).map(s => s.t1 - s.t0);
    const upHi = avg(inner.map(s => s.grade).filter((x): x is number => x != null));
    const hills = hasAlt && upHi >= 3;
    const type: PatternType = hills ? 'hills' : cv(work) > 0.35 || cv(rests) > 0.5 ? 'fartlek' : 'intervals';
    const first = inner[0], last = inner[inner.length - 1];
    const drops: number[] = [];
    segs.forEach((s, i) => { const nx = segs[i + 1]; if (s.hi && nx && !nx.hi && s.hr != null && nx.hr != null) drops.push(s.hr - nx.hr); });
    const hrs = inner.map(s => s.hr).filter((x): x is number => x != null);
    const intervals: IntervalOut = {
      count: inner.length, workSec: Math.round(work.reduce((a, x) => a + x, 0)),
      avgHrWork: hrs.length ? Math.round(avg(hrs)) : null,
      hrDriftPct: first.hr && last.hr ? r1((last.hr / first.hr - 1) * 100) : null,
      dropPct: first.v && last.v ? r1((1 - last.v / first.v) * 100) : null,
      recoveryHrDrop: drops.length ? Math.round(avg(drops)) : null,
      lapsHr: inner.map(s => (s.hr != null ? Math.round(s.hr) : null))
    };
    return { pattern: { type, from: 'stream', reps: inner.length, workSec: work.map(Math.round) }, intervals };
  }
  // ohne Watt und Höhe: Hügel oder Tempowechsel zeigen sich oft nur im Puls (bergauf langsamer, aber Puls hoch)
  if (!usePower && !hasAlt) { const h = hrStructure(hrS, hrC, n, sm); if (h) return h; }
  return { pattern: { type: 'steady', from: 'stream' }, intervals: null };
}
/* Puls-Wechsel: mindestens 15 Schläge zwischen hart und locker, mindestens 3 harte Abschnitte von 30 s bis 30 min mit lockeren dazwischen.
   Ein langsam steigender Puls (Drift) ist ein einziger Block und zählt nicht. */
function hrStructure(hrS: number[], hrC: number[], n: number, sm: (number | null)[]): StreamResult | null {
  const hr = new Array(n).fill(null).map((_, k) => (hrC[k] ? hrS[k] / hrC[k] : null));
  const vals = hr.filter((x): x is number => x != null);
  if (vals.length < 60) return null;
  const g = twoMeans(vals); if (!g || g.hi - g.lo < 15) return null;
  const mid = (g.lo + g.hi) / 2, band = (g.hi - g.lo) * 0.15;
  let st = false; const lab = hr.map(v => { if (v == null) return st; if (!st && v > mid + band) st = true; else if (st && v < mid - band) st = false; return st; });
  const segs: { hi: boolean; k0: number; k1: number }[] = []; let s0 = 0;
  for (let k = 1; k <= n; k++) if (k === n || lab[k] !== lab[s0]) { segs.push({ hi: lab[s0], k0: s0, k1: k - 1 }); s0 = k; }
  const his = segs.filter((x, i) => x.hi && i > 0 && (x.k1 - x.k0 + 1) * BIN >= 30 && (x.k1 - x.k0 + 1) * BIN <= 30 * 60);
  if (his.length < 3) return null;
  const work = his.map(x => (x.k1 - x.k0 + 1) * BIN);
  const sp = (x: { k0: number; k1: number }) => avg(sm.slice(x.k0, x.k1 + 1).filter((v): v is number => v != null));
  const slowUp = avg(his.map(sp)) < avg(segs.filter(x => !x.hi).map(sp));
  const hrOf = (x: { k0: number; k1: number }) => avg(hr.slice(x.k0, x.k1 + 1).filter((v): v is number => v != null));
  const first = his[0], last = his[his.length - 1];
  return {
    pattern: { type: slowUp ? 'hills' : cv(work) > 0.35 ? 'fartlek' : 'intervals', from: 'stream', reps: his.length, workSec: work },
    intervals: { count: his.length, workSec: work.reduce((a, x) => a + x, 0), avgHrWork: Math.round(avg(his.map(hrOf))), hrDriftPct: r1((hrOf(last) / hrOf(first) - 1) * 100), dropPct: null, recoveryHrDrop: null, lapsHr: his.map(x => Math.round(hrOf(x))) }
  };
}

/* Splits je km: deutlich schneller (bzw. langsamer) ab einem Kilometer bis zum Ende.
   „Deutlich“ = mindestens 5 % gegenüber dem Mittel davor, für mindestens 2 km (eine Ausnahme erlaubt). */
export function paceTrend(splits: { km: number; pace: string }[] | null | undefined): Pattern | null {
  const sec = (x: string) => { const m = /^(\d+):(\d{2})$/.exec(x || ''); return m ? +m[1] * 60 + +m[2] : null; };
  const ps = (splits || []).map(s => ({ km: s.km, p: sec(s.pace) })).filter(x => x.p != null && x.p > 0) as { km: number; p: number }[];
  if (ps.length < 5) return null;
  // erst ohne Ausnahme suchen (genauer Kilometer), dann mit einer Ausnahme
  for (const allow of [0, 1]) for (const dir of [1, -1] as const) {
    for (let k = 2; k <= ps.length - 2; k++) {
      const before = avg(ps.slice(0, k).map(x => x.p)); const rest = ps.slice(k);
      const hits = rest.filter(x => dir === 1 ? x.p <= before * 0.95 : x.p >= before * 1.05).length;
      if (hits >= rest.length - (allow && rest.length >= 4 ? 1 : 0) && hits >= 2) {
        const after = avg(rest.map(x => x.p));
        return { type: dir === 1 ? 'progression' : 'fade', from: 'splits', fromKm: ps[k - 1].km, before: Math.round(before), after: Math.round(after) };
      }
    }
  }
  return null;
}

/* Muster einer gespeicherten Aktivität. Neue Aktivitäten tragen es selbst (pattern); bei älteren wird es aus Runden und Splits
   neu berechnet – so werden auch früher falsch gezählte automatische Runden richtig. */
export function patternOf(a: any): Pattern | null {
  if (!a) return null;
  if (a.pattern) return a.pattern;
  if (a.sport !== 'run' && a.sport !== 'bike') return null;
  const laps: LapOut[] = a.laps || [];
  const fromWatch = laps.some(l => l.kind === 'rest' || l.kind === 'warmup' || l.kind === 'cooldown') && !isAutoLaps(laps) && laps.some(l => l.kind === 'work');
  const iv = intervalsOf(a);
  if (iv && iv.count >= 2) return { type: 'intervals', from: fromWatch ? 'watch' : 'laps', reps: iv.count };
  const tr = paceTrend(a.splits);
  if (tr) return { ...tr, autoLaps: isAutoLaps(laps) };
  return { type: 'steady', from: laps.length >= 2 ? 'laps' : 'none', autoLaps: isAutoLaps(laps) };
}
/* Intervalle einer gespeicherten Aktivität: neue Aktivitäten haben sie richtig gespeichert, ältere werden aus den Runden neu geprüft */
export function intervalsOf(a: any): IntervalOut | null {
  if (!a) return null;
  if (a.pattern || a.sport === 'swim' || !a.intervals) return a.intervals || null;
  const laps: LapOut[] = a.laps || [];
  if (!laps.length) return a.intervals; // ohne Runden (z. B. von Hand): wie gespeichert
  if (isAutoLaps(laps)) return null;
  const usePower = a.sport === 'bike' && laps.filter(l => l.power).length > laps.length * 0.5;
  const k = lapKinds(laps, usePower);
  return statsOf(k, usePower);
}
export function statsOf(laps: LapOut[], usePower = false): IntervalOut | null {
  const work = laps.filter(l => l.kind === 'work');
  if (work.length < 2) return null;
  const first = work[0], last = work[work.length - 1];
  const out = (l: LapOut) => (usePower && l.power ? l.power : l.speed);
  const o1 = out(first), o2 = out(last);
  const drops: number[] = [];
  laps.forEach((l, i) => { const nx = laps[i + 1]; if (l.kind === 'work' && nx && nx.kind === 'rest' && (l.maxHr || l.avgHr) && nx.avgHr) drops.push((l.maxHr || l.avgHr!) - nx.avgHr); });
  const hrs = work.map(l => l.avgHr).filter((x): x is number => x != null);
  return {
    count: work.length, workSec: work.reduce((a, l) => a + l.sec, 0),
    avgHrWork: hrs.length ? Math.round(avg(hrs)) : null,
    hrDriftPct: first.avgHr && last.avgHr ? r1((last.avgHr / first.avgHr - 1) * 100) : null,
    dropPct: o1 && o2 ? r1((1 - o2 / o1) * 100) : null,
    recoveryHrDrop: drops.length ? Math.round(avg(drops)) : null,
    lapsHr: work.map(l => l.avgHr)
  };
}
