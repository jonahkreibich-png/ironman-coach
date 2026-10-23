/* Auftrag 19: laufende Fitness-Schätzung je Sport (wie ein Kalman-Filter).
   Zustand = Logarithmus der Schwellen-Leistung (Lauf-Tempo, FTP oder Rad-Tempo, Schwimm-CSS als −ln). Jede Einheit ist eine Messung
   mit eigener Unsicherheit (Test genau, harte Einheit mit Puls gut, lockere mit Puls mittel, nur Gefühl grob). Zwischen den Messungen
   wird die Schätzung unsicherer; ohne Training in dieser Sportart (Pause, Krankheit) sinkt sie langsam (Formverlust).
   Fehlende Werte sind unbekannt: Sie ändern nichts am Wert, nur die Unsicherheit wächst. */
import { addDays, illnessAt } from './core';

export type ObsKind = 'test' | 'effort' | 'laps' | 'hr' | 'rpe' | 'titled' | 'swimset' | 'swimpace';
export interface FObs { id: string; date: string; z: number; sd: number; kind: ObsKind; title: string; value: string; ill?: boolean; manual?: boolean }
export interface FStep { date: string; kind: ObsKind | 'pause'; title: string; value: string; before: number; after: number; days?: number; ill?: boolean; manual?: boolean }
export interface FResult { z: number; sd: number; steps: FStep[]; n: number }

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
  /** Startwert aus dem Profil, nur wenn es noch keine Messung gibt */
  prior: { z: number; sd: number } | null;
}

export function runFilter(o: FilterIn): FResult | null {
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
