/* Schlüsseleinheiten und Abwechslung (Auftrag 10), für alle Nutzer und beide Planwege (freie Verteilung und fester Wochenaufbau).
   - Rad: Grundlage Sweet Spot und Kraftausdauer im Wechsel, Aufbau Schwelle und Over-Unders, spezifisch je Ziel-Distanz
     (kurz: VO2max und Schwelle, lang: Wettkampftempo). Jede Art hat eine eigene Leiter; höchstens 2 gleiche Arten hintereinander.
   - Lauf: Grundlage locker mit Hügelsprints oder Fahrtspiel (nicht hart), Aufbau 1 Schwellenlauf, spezifisch Wettkampftempo
     (Sprint/Olympisch/5-10 km: 10-km-Tempo, Halb: Halbmarathon-Tempo, Marathon/Lang: Marathon-Tempo). Unter 18 nie Zone 5.
   - Abwechslung alle Woche: Variante der langen Ausfahrt (gleichmäßig, hügelig, Kadenz, mit Zone 3), Schwimm-Schwerpunkt
     (Technik, Pull Buoy, zügige Bahnen) und kürzere Pausen über den Block (mehr Meter in gleicher Zeit). */
import * as W from './workouts';
import { DIST_RANK } from './periodize';
import type { GoalType } from './goals';

type Ph = 'base' | 'build' | 'specific' | 'taper' | 'race';
const S = (part: W.Step['part'], o: Omit<W.Step, 'part'>): W.Step => ({ part, ...o });
const r5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);
export const short = (g: GoalType) => (DIST_RANK[g] ?? 4) <= 4 && g !== 'bike_event';

/* Reihenfolge der Arten je Phase (zyklisch) und Leitern je Art [Wiederholungen, Minuten] */
const BIKE_ORDER: Record<string, string[]> = { base: ['ss', 'ss', 'force'], build: ['thr', 'ou', 'thr'], specShort: ['vo2', 'thr', 'rp'], specLong: ['rp', 'thr', 'rp'] };
const BIKE_LADDER: Record<string, [number, number][]> = {
  ss: [[3, 8], [3, 12], [2, 20], [3, 15], [2, 25], [2, 30]], force: [[3, 8], [3, 10], [4, 10], [3, 15]],
  thr: [[4, 8], [3, 10], [3, 12], [2, 15], [2, 20]], ou: [[3, 6], [3, 8], [4, 8], [3, 10]],
  vo2: [[5, 3], [6, 3], [4, 4], [5, 4]], rpShort: [[4, 5], [3, 8], [2, 12], [3, 10]], rpLong: [[3, 15], [3, 20], [2, 30], [4, 20]]
};
/* n: wie viele Schlüsseleinheiten Rad es in dieser Phase schon gab. total: gewünschte Dauer (Ein-/Ausrollen füllen auf) */
export function bikeKey(ctx: W.PaceCtx, phase: Ph, goal: GoalType, n: number, total?: number): W.Spec {
  const ph = phase === 'taper' || phase === 'race' ? 'build' : phase;
  const order = ph === 'specific' ? BIKE_ORDER[short(goal) ? 'specShort' : 'specLong'] : BIKE_ORDER[ph] || BIKE_ORDER.base;
  const type = order[n % order.length];
  const lad = type === 'rp' ? BIKE_LADDER[short(goal) ? 'rpShort' : 'rpLong'] : BIKE_LADDER[type];
  const lvl = Math.max(0, Math.min(lad.length - 1, Math.floor(n / order.length) * 2 + order.slice(0, n % order.length).filter(x => x === type).length - (phase === 'taper' ? 2 : 0)));
  const [reps, min] = lad[lvl];
  const rest = type === 'vo2' ? min : min >= 15 ? 5 : 4;
  const zone = type === 'vo2' ? 5 : type === 'thr' || type === 'ou' ? 4 : type === 'rp' ? (short(goal) ? 4 : 3) : 3;
  const note = { ss: 'gleichmäßig im oberen Bereich von Zone 3 (Sweet Spot), Trittfrequenz 85-95', force: 'niedrige Trittfrequenz 60-70, im Sitzen, Oberkörper ruhig (Kraftausdauer)', thr: 'an der Schwelle, gleichmäßig, nicht zu schnell anfangen', ou: 'je 2 min knapp über und 2 min knapp unter der Schwelle im Wechsel', vo2: 'hart, aber jede Wiederholung gleich stark', rp: short(goal) ? 'Wettkampftempo für die kurze Distanz' : 'Wettkampftempo für die lange Distanz: gleichmäßig, mit Essen und Trinken' }[type];
  const kind: W.Kind = ({ ss: 'sweetspot', force: 'force', thr: 'threshold', ou: 'overunder', vo2: 'vo2', rp: 'racepace' } as Record<string, W.Kind>)[type];
  const core = reps * min + (reps - 1) * rest;
  const extra = total ? Math.max(0, r5(total) - core - 25) : 0;
  const add = Math.round(extra / 2 / 5) * 5;
  const why = { ss: 'Sweet Spot hebt die Schwelle, ohne so müde zu machen wie Schwellen-Intervalle.', force: 'Kraftausdauer auf dem Rad: wichtig für Anstiege und lange Strecken.', thr: 'Schwellen-Intervalle heben das Tempo, das du lange halten kannst.', ou: 'Over-Unders lehren den Körper, Laktat bei Tempo abzubauen: wichtig für Tempowechsel im Rennen.', vo2: 'Kurz und hart: hebt die maximale Sauerstoffaufnahme, gut für kurze Distanzen.', rp: 'Wettkampftempo üben: so fühlt sich das Rennen an.' }[type];
  return { sport: 'bike', kind, ctx, why, noDistance: !!ctx.indoor,
    steps: [S('warm', { min: 15 + add, zone: 1, note: 'mit 3 kurzen Antritten' }), S('main', { reps, min, zone, restMin: rest, note }), S('cool', { min: 10 + Math.max(0, extra - add), zone: extra - add > 5 ? 2 : 1 })] };
}

/* Lauf: Qualität je Phase. n: Anzahl Qualitätsläufe in dieser Phase. minor: unter 18 (nie Zone 5). */
const RUN_LADDER: Record<string, [number, number][]> = { thr: [[3, 8], [3, 10], [2, 12], [2, 15], [3, 12]], rp10: [[5, 4], [4, 6], [5, 5], [3, 8]], rpHalf: [[2, 15], [2, 20], [3, 15]], rpLong: [[2, 20], [3, 20], [2, 30]] };
export function runQualityStep(phase: Ph, goal: GoalType, n: number, minor: boolean): { reps: number; min: number; zone: number; rest: number; label: string; why: string } | null {
  if (phase === 'base' || phase === 'race') return null;
  if (phase === 'build' || phase === 'taper') { const [reps, min] = RUN_LADDER.thr[Math.max(0, Math.min(4, n - (phase === 'taper' ? 2 : 0)))]; return { reps, min, zone: 4, rest: 2, label: 'Schwelle', why: 'Schwellenläufe heben das Tempo, das du lange halten kannst.' }; }
  const kind = /half|middle/.test(goal) ? 'rpHalf' : /marathon|long/.test(goal) ? 'rpLong' : 'rp10';
  const lad = RUN_LADDER[kind]; const [reps, min] = lad[Math.min(lad.length - 1, n)];
  const zone = kind === 'rp10' ? 4 : 3;
  return { reps, min, zone: minor ? Math.min(zone, 4) : zone, rest: kind === 'rp10' ? 2 : 3, label: kind === 'rp10' ? '10-km-Tempo' : kind === 'rpHalf' ? 'Halbmarathon-Tempo' : 'Marathon-Tempo', why: 'Wettkampftempo üben: so fühlt sich das Rennen an.' };
}
/* Qualitätslauf als eigene Einheit (Ein-/Auslaufen dazu) */
export function runQuality(ctx: W.PaceCtx, q: NonNullable<ReturnType<typeof runQualityStep>>): W.Spec {
  return { sport: 'run', kind: q.zone >= 4 ? 'threshold' : 'racepace', ctx, why: q.why, steps: [S('warm', { min: 15, zone: 1, note: 'mit 3 Steigerungen' }), S('main', { reps: q.reps, min: q.min, zone: q.zone, restMin: q.rest, note: q.label }), S('cool', { min: 10, zone: 1 })] };
}
/* Qualität im langen Lauf (wenn unter der Woche kein Tag zwischen zwei harten Tagen frei ist) */
export function longRunWithQuality(ctx: W.PaceCtx, min: number, q: NonNullable<ReturnType<typeof runQualityStep>>): W.Spec {
  const qMin = q.reps * q.min + (q.reps - 1) * q.rest;
  // genau auf die Dauer: der lockere Teil davor in 5er-Schritten, der Rest am Ende
  const easy = Math.max(10, min - 10 - qMin);
  const before = Math.max(5, r5(easy * 0.6)), after = Math.max(5, easy - before);
  return { sport: 'run', kind: 'longq', ctx, why: q.why + ' Im langen Lauf: erst locker, dann der Qualitätsteil, locker auslaufen.',
    steps: [S('warm', { min: 10, zone: 1 }), S('main', { min: before, zone: 2 }), S('main', { reps: q.reps, min: q.min, zone: q.zone, restMin: q.rest, note: q.label }), S('main', { min: after, zone: 2, note: 'locker auslaufen' })] };
}
/* Grundlage: lockerer Lauf mit Hügelsprints, Fahrtspiel oder Steigerungen (zählt nicht als harte Einheit) */
export function runBaseVariant(ctx: W.PaceCtx, min: number, k: number): W.Spec {
  const v = k % 3;
  if (v === 0) return { sport: 'run', kind: 'hills', ctx, why: 'Hügelsprints machen kräftig und ökonomisch, ohne müde zu machen.', steps: [S('main', { min: r5(min - 8), zone: 2 }), S('main', { reps: 8, min: 0.25, zone: 3, restMin: 0.75, note: '10-15 s zügig bergauf, langsam zurückgehen' })] };
  if (v === 1) return { sport: 'run', kind: 'fartlek', ctx, why: 'Fahrtspiel: spielerische Tempowechsel nach Gefühl, locker bleiben.', steps: [S('warm', { min: 10, zone: 1 }), S('main', { reps: 6, min: 1, zone: 3, restMin: 2, note: 'locker-zügig, nicht hart' }), S('cool', { min: Math.max(5, r5(min - 10 - 6 - 10)), zone: 2 })] };
  return W.runEasy(ctx, min, { strides: 6 });
}
/* Variante der langen Ausfahrt je Woche (Grundlage und Aufbau) */
export const BIKE_LONG_VARIANTS = ['gleichmäßig', 'hügelig', 'mit Kadenz-Blöcken', 'mit Zone-3-Blöcken'];
export function bikeLongVariant(spec: W.Spec, k: number, phase: Ph): W.Spec {
  if (phase === 'taper' || phase === 'race') return spec;
  const v = BIKE_LONG_VARIANTS[k % BIKE_LONG_VARIANTS.length];
  const note = { 'gleichmäßig': 'gleichmäßig in Zone 2, alle 20-30 min essen und trinken', 'hügelig': 'hügelige Strecke: Anstiege im Sitzen mit ruhiger Trittfrequenz, bergab locker', 'mit Kadenz-Blöcken': 'darin 5×5 min mit hoher Trittfrequenz (100+), dazwischen normal', 'mit Zone-3-Blöcken': 'darin 3×10 min in Zone 3, dazwischen Zone 2' }[v];
  const out: W.Spec = JSON.parse(JSON.stringify(spec));
  const main = out.steps.find(s => s.part === 'main'); if (main) main.note = note;
  out.variant = v;
  return out;
}
/* Schwimmen: Schwerpunkt je Woche und kürzere Pausen im Block (mehr Meter in gleicher Zeit) */
export const SWIM_VARIANTS = ['Technik', 'Pull Buoy', 'zügige Bahnen'];
export function swimVariant(spec: W.Spec, k: number, weekInBlock: number, phase: Ph): W.Spec {
  const out: W.Spec = JSON.parse(JSON.stringify(spec));
  const v = SWIM_VARIANTS[k % SWIM_VARIANTS.length];
  const rest = Math.max(15, 30 - 5 * weekInBlock);
  out.steps.forEach(s => { if (s.part === 'main' && (s.reps || 1) > 1 && s.restSec && s.restSec >= 20 && s.mode !== 'drill') s.restSec = rest; });
  if (v === 'Technik') { const d = out.steps.find(s => s.mode === 'drill'); if (d) d.reps = (d.reps || 1) + 2; }
  if (v === 'Pull Buoy') { const p = out.steps.find(s => s.mode === 'pull'); if (p) p.reps = (p.reps || 1) + 2; }
  if (v === 'zügige Bahnen') { const c = out.steps.find(s => s.mode === 'crawl' && s.part === 'main'); if (c) out.steps.splice(out.steps.indexOf(c) + 1, 0, S('main', { reps: 4, m: Math.min(c.m || 25, 50), zone: 3, mode: 'crawl', restSec: 30, note: 'zügig, Technik sauber halten' })); }
  if (phase === 'specific') out.steps.splice(out.steps.length - 1, 0, S('main', { reps: 4, m: 50, zone: 2, mode: out.stage && out.stage.ladder === 'swimBreast' ? 'breast' : 'crawl', restSec: 30, note: 'Freiwasser-Technik: alle 6 Züge nach vorn orientieren; letzte Bahn als Start mit schnellem Antritt' }));
  out.variant = phase === 'specific' ? v + ', Freiwasser' : v;
  return out;
}

/* Schwimmeinheit nach der Variante wieder auf die Zieldauer bringen (Brust- bzw. Kraul-Wiederholungen anpassen) */
export function fitSwim(spec: W.Spec, minutes: number): W.Spec {
  const reps = spec.steps.filter(s => s.part === 'main' && (s.mode === 'breast' || s.mode === 'crawl' || s.mode === 'pull') && (s.reps || 1) > 1 && (s.zone || 2) <= 2);
  if (!reps.length || !minutes) return spec;
  for (let k = 0; k < 30 && W.totals(spec).min > minutes + 3; k++) { const x = reps.filter(s => (s.reps || 1) > 2).sort((a, b) => (b.reps || 1) - (a.reps || 1))[0]; if (!x) break; x.reps = (x.reps || 1) - 1; }
  for (let k = 0; k < 30 && W.totals(spec).min + 3 <= minutes; k++) { const x = reps[k % reps.length]; x.reps = (x.reps || 1) + 1; }
  return spec;
}
