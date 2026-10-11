/* Ziel-Prognose aus aktuellen Leistungen, immer als Bereich mit Vertrauens-Angabe.
   Laufen: VDOT (Daniels) aus der Schwellen-Pace, Umrechnung auf andere Distanzen.
   Triathlon: je Disziplin plus Wechselzeiten, Lauf mit Abschlag nach dem Rad. Ohne genug Daten: welcher Test fehlt. */
import type { Goal, GoalType } from './goals';
import { GOALS, legsOf } from './goals';
import type { Estimates } from './scores';

/* VDOT aus Distanz (m) und Zeit (min) nach Daniels/Gilbert */
export function vdot(meters: number, minutes: number): number {
  const v = meters / minutes;
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);
  return vo2 / pct;
}
/* Zeit (min) für eine Distanz bei gegebenem VDOT (Newton-Verfahren) */
export function timeForVdot(meters: number, target: number): number {
  let t = meters / 200; // Startwert
  for (let i = 0; i < 40; i++) {
    const f = vdot(meters, t) - target;
    const d = (vdot(meters, t + 0.01) - vdot(meters, t - 0.01)) / 0.02;
    if (!d) break;
    t -= f / d;
    if (Math.abs(f) < 1e-6) break;
  }
  return t;
}
/* Riegel als Gegenprobe: T2 = T1 × (D2/D1)^1,06 */
export function riegel(t1: number, d1: number, d2: number, exp = 1.06) { return t1 * Math.pow(d2 / d1, exp); }

export interface Prediction { label: string; low: number; high: number; best: number }
export interface Prognosis {
  ok: boolean;
  missing?: string[];
  confidence: 'niedrig' | 'mittel' | 'hoch';
  total?: Prediction;
  parts?: Prediction[];
  runDistances?: Prediction[];
  improve?: string;
}
const TRANSITIONS: Partial<Record<GoalType, [number, number]>> = {
  tri_supersprint: [90, 60], tri_sprint: [120, 75], tri_olympic: [150, 90], tri_middle: [240, 150], tri_long: [360, 240], duathlon: [90, 60], aquathlon: [90, 0]
};
const RUN_DIST = [{ l: '5 km', m: 5000 }, { l: '10 km', m: 10000 }, { l: 'Halbmarathon', m: 21097.5 }, { l: 'Marathon', m: 42195 }];

export function prognosis(goal: Goal | null, est: Estimates): Prognosis {
  const type: GoalType = (goal && goal.type) || 'run_10k';
  const legs = goal ? legsOf(goal) : GOALS.run_10k.legs;
  const need = new Set(legs.map(l => l.sport));
  const missing: string[] = [];
  if (need.has('run') && !est.runThrSpeed) missing.push('Lauftest 30 min (oder ein paar Läufe mit Puls)');
  if (need.has('bike') && !est.bikeThrKmh && !est.ftp) missing.push('Radtest 20 min (oder Ausfahrten mit Puls)');
  if (need.has('swim') && !est.swimCss) missing.push('Schwimmtest 400/200 m');
  if (missing.length) return { ok: false, missing, confidence: 'niedrig' };
  const nData = (need.has('run') ? est.nRun : 99) + (need.has('bike') ? est.nBike : 99) + (need.has('swim') ? est.nSwim : 99);
  const minN = Math.min(need.has('run') ? est.nRun : 99, need.has('bike') ? est.nBike : 99, need.has('swim') ? est.nSwim : 99);
  const confidence = minN >= 8 ? 'hoch' : minN >= 3 ? 'mittel' : 'niedrig';
  const spread = confidence === 'hoch' ? 0.03 : confidence === 'mittel' ? 0.05 : 0.08;
  void nData;
  // Laufen: Schwelle ≈ Tempo, das man etwa 60 min halten kann
  const v = est.runThrSpeed ? vdot(est.runThrSpeed * 60 * 60, 60) : null;
  const runPred = (m: number) => (v ? timeForVdot(m, v) * 60 : null);
  const runDistances = v ? RUN_DIST.map(d => { const t = runPred(d.m)!; return { label: d.l, best: t, low: t * (1 - spread), high: t * (1 + spread) }; }) : undefined;
  const def = GOALS[type];
  const parts: Prediction[] = [];
  const offBike = def.group === 'tri' && need.has('bike');
  const longRace = def.hours[1] >= 4;
  for (const l of legs) {
    let t = 0;
    if (l.sport === 'swim') { const p100 = (est.swimCss || 130) + (l.km >= 1.9 ? 8 : 4); t = p100 * l.km * 10 * (def.group === 'tri' ? 1.03 : 1); }
    if (l.sport === 'bike') {
      const thr = est.bikeThrKmh || (est.ftp ? est.ftp / 7 : 25);
      const f = ({ tri_supersprint: 0.98, tri_sprint: 0.96, tri_olympic: 0.93, tri_middle: 0.86, tri_long: 0.78, duathlon: 0.95, bike_event: 0.82 } as any)[type] || 0.85;
      t = l.km / (thr * f) * 3600;
    }
    if (l.sport === 'run') {
      let rt = runPred(l.km * 1000)!;
      if (offBike) rt *= longRace ? 1.12 : 1.05; // Abschlag nach dem Rad
      if (type === 'tri_long') rt *= 1.05;
      t = rt;
    }
    parts.push({ label: ({ swim: 'Schwimmen', bike: 'Rad', run: 'Laufen' } as any)[l.sport] + (legs.filter(x => x.sport === l.sport).length > 1 ? ` (${String(l.km).replace('.', ',')} km)` : ''), best: t, low: t * (1 - spread), high: t * (1 + spread * 1.4) });
  }
  const tr = TRANSITIONS[type];
  if (tr) parts.push({ label: 'Wechsel', best: tr[0] + tr[1], low: (tr[0] + tr[1]) * 0.8, high: (tr[0] + tr[1]) * 1.3 });
  const sum = (k: keyof Prediction) => parts.reduce((a, p) => a + (p[k] as number), 0);
  const total = { label: goal ? goal.name : '10 km', best: sum('best'), low: sum('low'), high: sum('high') };
  // Was würde am meisten bringen? Jede Disziplin um 5 % verbessern und die Ersparnis vergleichen
  let improve = '';
  const gains = parts.filter(p => p.label !== 'Wechsel').map(p => ({ l: p.label, s: p.best * 0.05 / 1.05 }));
  if (gains.length) {
    gains.sort((a, b) => b.s - a.s);
    const g = gains[0];
    const what = /Rad/.test(g.l) ? 'eine um 5 % höhere Radschwelle' : /Laufen/.test(g.l) ? 'eine um 5 % schnellere Lauf-Schwelle' : '5 % schnelleres Schwimmen (Technik!)';
    improve = `Am meisten bringt dir ${what}: etwa ${Math.round(g.s / 60)} min schneller.`;
  }
  return { ok: true, confidence, total, parts, runDistances, improve };
}
export function fmtDuration(sec: number): string {
  sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
