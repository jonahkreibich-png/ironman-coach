/* Auftrag 19: laufende Fitness-Schätzung je Sport (wie ein Kalman-Filter).
   Zustand = Logarithmus der Schwellen-Leistung (Lauf-Tempo, FTP oder Rad-Tempo, Schwimm-CSS als −ln). Jede Einheit ist eine Messung
   mit eigener Unsicherheit (Test genau, harte Einheit mit Puls gut, lockere mit Puls mittel, nur Gefühl grob). Zwischen den Messungen
   wird die Schätzung unsicherer; ohne Training in dieser Sportart (Pause, Krankheit) sinkt sie langsam (Formverlust).
   Fehlende Werte sind unbekannt: Sie ändern nichts am Wert, nur die Unsicherheit wächst. */
import { addDays, illnessAt } from './core';

export type ObsKind = 'test' | 'effort' | 'laps' | 'hr' | 'rpe' | 'titled' | 'swimset' | 'swimpace';
export interface FObs { id: string; date: string; z: number; sd: number; kind: ObsKind; title: string; value: string; ill?: boolean; manual?: boolean; /** Auftrag 20: Zusatz zur Genauigkeit („Laufband, zählt weniger“) */ extra?: string }
/** Auftrag 20: was mit der Messung passiert ist (gezählt, gedämpft, bestätigt, begrenzt auf ±3 Punkte pro Woche, gedeckelt) */
export type FStatus = 'counted' | 'damped' | 'confirmed' | 'limited' | 'capped' | 'step';
export interface FStep { date: string; kind: ObsKind | 'pause'; title: string; value: string; before: number; after: number; days?: number; ill?: boolean; manual?: boolean; status?: FStatus; note?: string; extra?: string }
export interface FResult { z: number; sd: number; steps: FStep[]; n: number; /** Auftrag 20: brauchbare (nicht gedämpfte) Messungen und ob ein Test dabei war */ usable?: number; tested?: boolean }
/** Auftrag 20: Punkte des Hauptteils je Zustand, Wochengrenze ohne Test, Obergrenze ohne Test */
export interface FOpts20 { pts: (z: number) => number; weekPts: number; capZ: number | null }

/* Unsicherheit wächst um 0,35 % pro Tag (Standardabweichung, über die Wurzel der Tage) */
const Q = 0.0035 * 0.0035;
/* Formverlust ohne Training dieser Sportart: die ersten 10 Tage nichts, bis Tag 42 0,15 % pro Tag, danach 0,08 % pro Tag,
   höchstens 15 %. Wer in der Zeit andere Ausdauer trainiert, verliert halb so viel. */
export function decayPerDay(gap: number, cross: boolean): number {
  const r = gap <= 10 ? 0 : gap <= 42 ? 0.0015 : 0.0008;
  return cross ? r / 2 : r;
}
const MAX_LOSS = 0.15;
const STRONG = new Set<ObsKind>(['test', 'effort', 'laps', 'swimset']);
const days = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);

export interface FilterIn {
  obs: FObs[];
  /** Tage mit Training dieser Sportart (auch ohne Messwerte) */
  trained: string[];
  /** Tage mit anderem Ausdauertraining */
  cross: string[];
  illness: any[];
  end: string;
  /** Startwert aus dem Profil: bis Auftrag 19 nur ohne Messung, ab Auftrag 20 (mit v20) immer der Ausgangspunkt */
  prior: { z: number; sd: number } | null;
  v20?: FOpts20 | null;
}

export function runFilter(o: FilterIn): FResult | null {
  if (o.v20 && o.prior) return runFilter20(o);
  const obs = [...o.obs].filter(x => x.date <= o.end && Number.isFinite(x.z) && x.sd > 0).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  if (!obs.length) return o.prior ? { z: o.prior.z, sd: o.prior.sd, steps: [], n: 0 } : null;
  const trained = new Set(o.trained.filter(d => d <= o.end));
  const cross = new Set(o.cross.filter(d => d <= o.end));
  const steps: FStep[] = [];
  // ohne Messung vorher: erste Messung ist der Startwert (das Profil überstimmt gemessene Einheiten nicht)
  let x = obs[0].z, P = obs[0].sd * obs[0].sd, at = obs[0].date, peak = x;
  let lastTrain = obs[0].date;
  steps.push({ date: obs[0].date, kind: obs[0].kind, title: obs[0].title, value: obs[0].value, before: x, after: x, ill: obs[0].ill, manual: obs[0].manual });
  const advance = (to: string) => {
    const n = days(at, to);
    if (n <= 0) return;
    let loss = 0, pauseFrom: string | null = null, gapMax = 0;
    for (let k = 1; k <= n; k++) {
      const d = addDays(at, k);
      if (trained.has(d)) { lastTrain = d; continue; }
      const gap = days(lastTrain, d);
      if (gap > 10) {
        let cr = false; for (let j = 0; j < 7 && !cr; j++) cr = cross.has(addDays(d, -j));
        loss += decayPerDay(gap, cr);
        if (!pauseFrom) pauseFrom = addDays(lastTrain, 1);
        gapMax = Math.max(gapMax, gap);
      }
    }
    P += Q * n;
    if (loss > 0) {
      const nx = Math.max(peak - MAX_LOSS, x - loss);
      if (nx < x - 0.003) steps.push({ date: to, kind: 'pause', title: '', value: '', before: x, after: nx, days: gapMax });
      x = nx;
    }
    at = to;
  };
  for (let i = 1; i < obs.length; i++) {
    const m = obs[i];
    advance(m.date);
    let R = m.sd * m.sd;
    // Lockere Einheiten haben gemeinsame Fehler (Puls-Modell): sie machen die Schätzung höchstens auf etwa 3 % sicher.
    // Ein Test oder eine harte Einheit setzt sich deshalb gegen viele lockere Läufe durch.
    if (STRONG.has(m.kind)) P = Math.max(P, 0.03 * 0.03);
    P = Math.max(P, 0.012 * 0.012);
    const e = m.z - x;
    const S = P + R;
    // Ausreißer zählen weniger (robust): weit weg von der Erwartung → größere Messunsicherheit; ein gesunder Test nicht
    if (e * e > 6.25 * S && !(m.kind === 'test' && !m.ill)) R *= e * e / (6.25 * S);
    const K = P / (P + R);
    const before = x;
    x = x + K * e;
    P = (1 - K) * P;
    // eine Messung ist immer auch ein Trainingstag
    if (m.date > lastTrain) lastTrain = m.date;
    peak = x; // Formverlust höchstens 15 % seit der letzten Messung
    steps.push({ date: m.date, kind: m.kind, title: m.title, value: m.value, before, after: x, ill: m.ill, manual: m.manual });
  }
  advance(o.end);
  return { z: x, sd: Math.sqrt(P), steps, n: obs.length };
}

/* Messung mit Krankheit und Handeintrag: unsicherer */
export function obsSd(base: number, a: { date: string; source?: string; sources?: string[] }, illness: any[]): { sd: number; ill: boolean; manual: boolean } {
  const ill = !!(illnessAt(illness, a.date) || illnessAt(illness, addDays(a.date, -2)) || illnessAt(illness, addDays(a.date, -3)));
  const manual = a.source === 'manual' || (a.sources || []).every(s => s === 'manual');
  return { sd: base * (ill ? 1.7 : 1) * (manual ? 1.25 : 1), ill, manual };
}

/* Gefühl (RPE 1-10) → Anteil der Schwellen-Intensität (nur wenn kein Puls da ist) */
export function rpeFrac(rpe: number): number | null {
  if (!Number.isFinite(rpe) || rpe < 2 || rpe > 9) return null;
  return Math.min(1.02, 0.6 + rpe * 0.05);
}

/* ---------- Auftrag 20: zuverlässige Schätzung ----------
   Start: vorsichtiger Startwert aus dem Profil (Fragebogen, Bestzeiten, Alter, Erfahrung) mit großer Unsicherheit; jede Messung verschiebt
   ihn nach ihrer Genauigkeit, wenig Daten = kleiner Schritt.
   Ausreißer: weicht eine Messung stark von der Erwartung ab (mehr als 2,5 Standardabweichungen), zählt sie stark gedämpft, bis eine zweite
   ähnliche Messung sie bestätigt. Tests (gesund) zählen immer voll und heben die Obergrenze auf.
   Ohne Test (sobald belegt) höchstens ±weekPts Punkte im Hauptteil in 7 Tagen; Hochrechnungen aus lockeren Einheiten nie über die Obergrenze
   (Niveau der anderen Sportarten, Erfahrung). */
const SIMILAR = 0.03;
const STEP_PTS = 8;
function runFilter20(o: FilterIn): FResult {
  const v = o.v20!; const prior = o.prior!;
  const obs = [...o.obs].filter(x => x.date <= o.end && Number.isFinite(x.z) && x.sd > 0).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const trained = new Set(o.trained.filter(d => d <= o.end));
  const cross = new Set(o.cross.filter(d => d <= o.end));
  const steps: FStep[] = [];
  let x = prior.z, P = prior.sd * prior.sd;
  let at = obs.length ? obs[0].date : o.end, peak = x, lastTrain = at;
  let cap = v.capZ; let tested = false; let usable = 0;
  // Startwert über der Obergrenze (z. B. alter Profilwert aus falschen Watt): auf die Grenze
  if (cap != null && x > cap) { x = cap; peak = x; }
  const hist: { date: string; x: number }[] = [{ date: '0000-00-00', x }];
  const pending: FObs[] = [];
  const advance = (to: string) => {
    const n = days(at, to);
    if (n <= 0) return;
    let loss = 0, gapMax = 0;
    for (let k = 1; k <= n; k++) {
      const d = addDays(at, k);
      if (trained.has(d)) { lastTrain = d; continue; }
      const gap = days(lastTrain, d);
      if (gap > 10) {
        let cr = false; for (let j = 0; j < 7 && !cr; j++) cr = cross.has(addDays(d, -j));
        loss += decayPerDay(gap, cr);
        gapMax = Math.max(gapMax, gap);
      }
    }
    P += Q * n;
    if (loss > 0) {
      const nx = Math.max(peak - MAX_LOSS, x - loss);
      if (nx < x - 0.003) steps.push({ date: to, kind: 'pause', title: '', value: '', before: x, after: nx, days: gapMax });
      x = nx; hist.push({ date: to, x });
    }
    at = to;
  };
  // Wert vor 7 Tagen (Bezug für die Wochengrenze)
  // Beobachtungen und Verlauf sind chronologisch. Der Bezug wandert nur vorwärts,
  // statt für jede Messung die gesamte mehrjährige Historie erneut zu durchlaufen.
  let refIndex = 0;
  const ref = (date: string) => { const lim = addDays(date, -7); while (refIndex + 1 < hist.length && hist[refIndex + 1].date <= lim) refIndex++; return hist[refIndex].x; };
  for (const m of obs) {
    advance(m.date);
    let R = m.sd * m.sd;
    const isTest = m.kind === 'test' && !m.ill;
    if (STRONG.has(m.kind)) P = Math.max(P, 0.03 * 0.03);
    P = Math.max(P, 0.012 * 0.012);
    const e = m.z - x; const S = P + R;
    let status: FStatus = 'counted'; let note = '';
    if (!isTest && e * e > 6.25 * S) {
      // eine zweite ähnliche Messung bestätigt den Ausreißer: beide zählen jetzt
      const pi = pending.findIndex(p => Math.abs(p.z - m.z) <= Math.max(SIMILAR, 1.5 * m.sd) && days(p.date, m.date) <= 42);
      if (pi >= 0) { status = 'confirmed'; R = R / 2; note = `bestätigt den Wert vom ${pending[pi].date.slice(8)}.${pending[pi].date.slice(5, 7)}.`; pending.splice(pi, 1); }
      else { status = 'damped'; R *= 4 * e * e / (6.25 * S); pending.push(m); }
    }
    const K = P / (P + R);
    const before = x;
    let nx = x + K * e;
    P = (1 - K) * P;
    if (isTest) { tested = true; cap = null; }
    else {
      // höchstens ±weekPts Punkte in 7 Tagen (ein schon erreichter Wert wird dabei nie zurückgenommen). Gilt, sobald der Wert belegt ist
      // (5 brauchbare Messungen oder ein genauer Startwert); vorher findet die Schätzung erst ihr Niveau (dafür steht „vorläufig“ dabei).
      const limitOn = usable >= 5 || prior.sd <= 0.05;
      const r0 = v.pts(ref(m.date)), b0 = v.pts(before), n0 = v.pts(nx);
      const lo = Math.min(b0, r0 - v.weekPts), hi = Math.max(b0, r0 + v.weekPts);
      if (limitOn && (n0 > hi + 0.05 || n0 < lo - 0.05)) { nx = invert(v.pts, Math.max(lo, Math.min(hi, n0)), before, nx); if (status === 'counted') status = 'limited'; }
      // solange vorläufig: eine einzelne Einheit verschiebt den Hauptteil höchstens um STEP_PTS Punkte (wenig Daten = kleiner Schritt)
      if (!limitOn && Math.abs(n0 - b0) > STEP_PTS) { nx = invert(v.pts, b0 + Math.sign(n0 - b0) * STEP_PTS, before, nx); if (status === 'counted') status = 'step'; }
      // Obergrenze nur für Hochrechnungen aus lockeren Einheiten (Puls-Modell, Gefühl, Titel); harte Einheiten an der Schwelle messen direkt
      if (cap != null && !STRONG.has(m.kind) && nx > cap && nx > before) { nx = Math.max(before, cap); if (status !== 'damped') status = 'capped'; }
    }
    x = nx;
    if (status !== 'damped') usable++;
    if (m.date > lastTrain) lastTrain = m.date;
    peak = x; hist.push({ date: m.date, x });
    steps.push({ date: m.date, kind: m.kind, title: m.title, value: m.value, before, after: x, ill: m.ill, manual: m.manual, status, note: note || undefined, extra: m.extra });
  }
  advance(o.end);
  return { z: x, sd: Math.sqrt(P), steps, n: obs.length, usable, tested };
}
/* z zwischen a und b, bei dem pts(z) = target (pts ist monoton) */
function invert(pts: (z: number) => number, target: number, a: number, b: number): number {
  let lo = Math.min(a, b), hi = Math.max(a, b);
  const up = pts(hi) >= pts(lo);
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; const val = pts(mid); if ((val < target) === up) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
/* z, bei dem pts(z) = target (für die Obergrenze in Punkten); Suche ±2 um z0 */
export function zForPts(pts: (z: number) => number, target: number, z0: number): number { return invert(pts, target, z0 - 2, z0 + 2); }
