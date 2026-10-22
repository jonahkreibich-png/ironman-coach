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
const BIKE_ORDER: Record<string, string[]> = { base: ['ss', 'ss', 'force'], build: ['thr', 'ou', 'thr'], specShort: ['vo2', 'thr', 'rp'], specLong: ['rp', 'thr', 'rp'],
  // Auftrag 14: Rad-Event mit Schwelle und langen Anstiegen
  buildEvent: ['thr', 'climb', 'thr'], specEvent: ['climb', 'rp', 'thr'] };
const BIKE_LADDER: Record<string, [number, number][]> = {
  ss: [[3, 8], [3, 12], [2, 20], [3, 15], [2, 25], [2, 30], [3, 20], [1, 45]], force: [[3, 8], [3, 10], [4, 10], [3, 15], [4, 12]],
  thr: [[4, 8], [3, 10], [3, 12], [2, 15], [2, 20], [3, 15], [1, 30]], ou: [[3, 6], [3, 8], [4, 8], [3, 10], [4, 10]],
  vo2: [[5, 3], [6, 3], [4, 4], [5, 4], [6, 4]], rpShort: [[4, 5], [3, 8], [2, 12], [3, 10], [2, 15]], rpLong: [[3, 15], [3, 20], [2, 30], [4, 20], [2, 40]],
  climb: [[3, 8], [3, 10], [3, 12], [2, 20], [3, 15], [2, 25]]
};
/* Stufe einer Leiter (Auftrag 14): steigt mit jeder Einheit; oben angekommen wechseln sich die letzten drei Stufen ab,
   damit nie dieselbe Einheit zweimal hintereinander kommt. */
export function ladderStep<T>(lad: T[], lvl: number): T { const n = lad.length; if (lvl < n) return lad[Math.max(0, lvl)]; const k = Math.min(3, n); return lad[n - k + ((lvl - n) % k + 1) % k]; }
/* n: wie viele Schlüsseleinheiten Rad es in dieser Phase schon gab. total: gewünschte Dauer (Ein-/Ausrollen füllen auf).
   o.noZ5: unter 18 und ab 60 kein Zone-5-Block (statt VO2max die Schwelle). */
export function bikeKey(ctx: W.PaceCtx, phase: Ph, goal: GoalType, n: number, total?: number, o: { noZ5?: boolean } = {}): W.Spec {
  const ph = phase === 'taper' || phase === 'race' ? 'build' : phase;
  const ev = goal === 'bike_event';
  const order = ph === 'specific' ? BIKE_ORDER[ev ? 'specEvent' : short(goal) ? 'specShort' : 'specLong'] : ph === 'build' && ev ? BIKE_ORDER.buildEvent : BIKE_ORDER[ph] || BIKE_ORDER.base;
  let type = order[n % order.length];
  if (type === 'vo2' && o.noZ5) type = 'thr';
  const lad = type === 'rp' ? BIKE_LADDER[short(goal) ? 'rpShort' : 'rpLong'] : BIKE_LADDER[type];
  const lvl0 = Math.floor(n / order.length) * 2 + order.slice(0, n % order.length).filter(x => x === type).length;
  // Tapering: kurze, scharfe Reize (niedrige Stufe)
  let [reps, min] = phase === 'taper' ? lad[Math.max(0, Math.min(1, lvl0 - 2))] : ladderStep(lad, lvl0);
  // Auftrag 15: passt die Stufe nicht in die verfügbare Dauer (z. B. längste Fahrt bisher 30 min), weniger bzw. kürzere Stücke
  const restOf = (m: number) => type === 'vo2' ? m : m >= 15 ? 5 : 4;
  if (total) { while (reps > 1 && reps * min + (reps - 1) * restOf(min) + 25 > total) reps--; while (min > 5 && reps * min + (reps - 1) * restOf(min) + 25 > total) min -= type === 'vo2' ? 1 : 2; }
  const rest = restOf(min);
  const zone = type === 'vo2' ? 5 : type === 'thr' || type === 'ou' || type === 'climb' ? 4 : type === 'rp' ? (short(goal) ? 4 : 3) : 3;
  const note = { ss: 'gleichmäßig im oberen Bereich von Zone 3 (Sweet Spot), Trittfrequenz 85-95', force: 'niedrige Trittfrequenz 60-70, im Sitzen, Oberkörper ruhig (Kraftausdauer)', thr: 'an der Schwelle, gleichmäßig, nicht zu schnell anfangen', ou: 'je 2 min knapp über und 2 min knapp unter der Schwelle im Wechsel', vo2: 'hart, aber jede Wiederholung gleich stark', rp: short(goal) ? 'Wettkampftempo für die kurze Distanz' : 'Wettkampftempo für die lange Distanz: gleichmäßig, mit Essen und Trinken', climb: 'am Anstieg (oder auf der Rolle mit Steigung) knapp unter der Schwelle, Trittfrequenz 70-80, im Sitzen; bergab locker zurück' }[type];
  const kind: W.Kind = ({ ss: 'sweetspot', force: 'force', thr: 'threshold', ou: 'overunder', vo2: 'vo2', rp: 'racepace', climb: 'climb' } as Record<string, W.Kind>)[type];
  const core = reps * min + (reps - 1) * rest;
  const extra = total ? Math.max(0, r5(total) - core - 25) : 0;
  const add = Math.round(extra / 2 / 5) * 5;
  const why = { climb: 'Lange Anstiege üben: Kraft und Tempo an der Schwelle, so wie am Berg im Rennen.', ss: 'Sweet Spot hebt die Schwelle, ohne so müde zu machen wie Schwellen-Intervalle.', force: 'Kraftausdauer auf dem Rad: wichtig für Anstiege und lange Strecken.', thr: 'Schwellen-Intervalle heben das Tempo, das du lange halten kannst.', ou: 'Over-Unders lehren den Körper, Laktat bei Tempo abzubauen: wichtig für Tempowechsel im Rennen.', vo2: 'Kurz und hart: hebt die maximale Sauerstoffaufnahme, gut für kurze Distanzen.', rp: 'Wettkampftempo üben: so fühlt sich das Rennen an.' }[type];
  return { sport: 'bike', kind, ctx, why, noDistance: !!ctx.indoor,
    steps: [S('warm', { min: 15 + add, zone: 1, note: 'mit 3 kurzen Antritten' }), S('main', { reps, min, zone, restMin: rest, note }), S('cool', { min: 10 + Math.max(0, extra - add), zone: extra - add > 5 ? 2 : 1 })] };
}

/* Lauf: Qualität je Phase. n: Anzahl Qualitätsläufe in dieser Phase. minor: unter 18 (nie Zone 5). */
const RUN_LADDER: Record<string, [number, number][]> = { thr: [[3, 8], [3, 10], [2, 12], [2, 15], [3, 12], [4, 10], [2, 20]], rp10: [[5, 4], [4, 6], [5, 5], [3, 8], [4, 8]], rpHalf: [[2, 15], [2, 20], [3, 15], [2, 25]], rpLong: [[2, 20], [3, 20], [2, 30], [3, 25]],
  vo2: [[5, 3], [6, 3], [5, 4], [6, 4], [4, 5]], tempo: [[2, 8], [3, 8], [2, 12], [3, 10], [2, 15], [1, 25]] };
export interface RunQ { reps: number; min: number; zone: number; rest: number; label: string; why: string; kind?: 'threshold' | 'racepace' | 'vo2' | 'tempo' }
/* Lauf-Qualität je Phase, Ziel und Niveau (Auftrag 14):
   Grundlage: ab der 5. Grundlagenwoche ein Tempolauf (Zone 3, Erfahrene jede Woche, Fortgeschrittene jede zweite), sonst nichts Hartes
   (dafür Hügelsprints, Fahrtspiel, Steigerungen); Aufbau: Schwelle (3×8 → 2×15 min), für 5/10 km im Wechsel mit VO2max (5×3 min);
   spezifisch: Wettkampftempo der Zieldistanz (5/10 km im Wechsel mit VO2max); Tapering: kurze Stücke im Wettkampftempo.
   minor/o.noZ5: unter 18 und ab 60 keine Zone 5. */
export function runQualityStep(phase: Ph, goal: GoalType, n: number, minor: boolean, o: { noZ5?: boolean; baseWeek?: number; level?: 'beginner' | 'advanced' | 'experienced' } = {}): RunQ | null {
  const noZ5 = minor || !!o.noZ5;
  const fast = goal === 'run_5k' || goal === 'run_10k';
  if (phase === 'race') return null;
  if (phase === 'base') {
    const bw = o.baseWeek ?? 0;
    // Erfahrene jede Woche, Fortgeschrittene jede zweite Woche
    if (!o.level || o.level === 'beginner' || minor || bw < 4 || (o.level === 'advanced' && bw % 2 === 1)) return null;
    const [reps, min] = ladderStep(RUN_LADDER.tempo, n);
    return { reps, min, zone: 3, rest: 2, label: 'Tempo', kind: 'tempo', why: 'Tempoläufe in der späten Grundlage bereiten auf die Schwelle vor: zügig, aber kontrolliert.' };
  }
  if (phase === 'taper') { const sh = fast || short(goal); return { reps: 4, min: sh ? 2 : 3, zone: sh ? 4 : 3, rest: 2, label: 'Wettkampftempo, kurz', kind: 'racepace', why: 'Kurze Reize im Wettkampftempo halten die Beine wach, ohne müde zu machen.' }; }
  const vo2 = (k: number): RunQ => { const [reps, min] = ladderStep(RUN_LADDER.vo2, k); return { reps, min, zone: 5, rest: min, label: 'VO2max', kind: 'vo2', why: 'Kurz und hart: hebt die maximale Sauerstoffaufnahme, wichtig für 5 und 10 km.' }; };
  if (phase === 'build') {
    if (fast && n % 2 === 1 && !noZ5) return vo2(Math.floor(n / 2));
    const [reps, min] = ladderStep(RUN_LADDER.thr, fast ? Math.ceil(n / 2) : n);
    return { reps, min, zone: 4, rest: 2, label: 'Schwelle', kind: 'threshold', why: 'Schwellenläufe heben das Tempo, das du lange halten kannst.' };
  }
  if (fast && n % 2 === 1 && !noZ5) return vo2(2 + Math.floor(n / 2));
  const kind = /half|middle/.test(goal) ? 'rpHalf' : /marathon|long/.test(goal) ? 'rpLong' : 'rp10';
  const [reps, min] = ladderStep(RUN_LADDER[kind], fast ? Math.ceil(n / 2) : n);
  const zone = kind === 'rp10' ? 4 : 3;
  return { reps, min, zone: noZ5 ? Math.min(zone, 4) : zone, rest: kind === 'rp10' ? 2 : 3, label: kind === 'rp10' ? (goal === 'run_5k' ? '5-km-Tempo' : '10-km-Tempo') : kind === 'rpHalf' ? 'Halbmarathon-Tempo' : 'Marathon-Tempo', kind: 'racepace', why: 'Wettkampftempo üben: so fühlt sich das Rennen an.' };
}
/* Qualitätslauf als eigene Einheit (Ein-/Auslaufen dazu) */
export function runQuality(ctx: W.PaceCtx, q: NonNullable<ReturnType<typeof runQualityStep>>, o: { short?: boolean } = {}): W.Spec {
  const kind: W.Kind = q.kind === 'vo2' ? 'vo2' : q.kind === 'tempo' ? 'tempo' : q.kind === 'racepace' ? 'racepace' : q.zone >= 4 ? 'threshold' : 'racepace';
  return { sport: 'run', kind, ctx, why: q.why, steps: [S('warm', { min: o.short ? 10 : 15, zone: 1, note: 'mit 3 Steigerungen' }), S('main', { reps: q.reps, min: q.min, zone: q.zone, restMin: q.rest, note: q.label }), S('cool', { min: o.short ? 5 : 10, zone: 1 })] };
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
  // Auftrag 17: mit Einlaufen und Auslaufen
  if (v === 0) {
    const hills = S('main', { reps: 8, min: 0.25, zone: 3, restMin: 0.75, note: '10-15 s zügig bergauf, langsam zurückgehen' });
    const why = 'Hügelsprints machen kräftig und ökonomisch, ohne müde zu machen.';
    if (min < 30) return { sport: 'run', kind: 'hills', ctx, why, steps: [S('main', { min: r5(min - 8), zone: 2 }), hills] };
    const wu = min >= 40 ? 10 : 5;
    return { sport: 'run', kind: 'hills', ctx, why, steps: [S('warm', { min: wu, zone: 1, note: 'ganz locker einlaufen' }), S('main', { min: Math.max(10, r5(min - 13 - wu)), zone: 2 }), hills, S('cool', { min: 5, zone: 1, note: 'locker auslaufen' })] };
  }
  if (v === 1) return { sport: 'run', kind: 'fartlek', ctx, why: 'Kurze, kontrollierte Intervalle: locker-zügig laufen, dazwischen vollständig erholen.', steps: [S('warm', { min: 10, zone: 1 }), S('main', { reps: 6, min: 1, zone: 3, restMin: 2, note: 'locker-zügig, nicht hart' }), S('cool', { min: Math.max(5, r5(min - 10 - 6 - 10)), zone: 2 })] };
  return W.runEasy(ctx, min, { strides: 6 });
}
/* Variante der langen Ausfahrt je Woche (Grundlage und Aufbau) */
export const BIKE_LONG_VARIANTS = ['gleichmäßig', 'hügelig', 'mit Kadenz-Blöcken', 'mit Zone-3-Blöcken'];
export function bikeLongVariant(spec: W.Spec, k: number, phase: Ph, easyOnly = false): W.Spec {
  if (phase === 'taper' || phase === 'race') return spec;
  let v = BIKE_LONG_VARIANTS[k % BIKE_LONG_VARIANTS.length];
  const out: W.Spec = JSON.parse(JSON.stringify(spec));
  const main = out.steps.find(s => s.part === 'main');
  // Auftrag 17: „locker“ und Zone 3 passen nicht zusammen. Zügige Blöcke nur in längeren Ausfahrten und als echte Abschnitte
  // (dann stimmen Titel, Zone und „Wie hart“), sonst gleichmäßig.
  if (v === 'mit Zone-3-Blöcken' && (easyOnly || !main || (main.min || 0) < 60)) v = 'gleichmäßig';
  const note = { 'gleichmäßig': 'gleichmäßig in Zone 2, alle 20-30 min essen und trinken', 'hügelig': 'hügelige Strecke: Anstiege im Sitzen mit ruhiger Trittfrequenz, bergab locker', 'mit Kadenz-Blöcken': 'darin 5×5 min mit hoher Trittfrequenz (100+), dazwischen normal', 'mit Zone-3-Blöcken': 'locker in Zone 2, alle 20-30 min essen und trinken' }[v];
  if (main) main.note = note;
  if (v === 'mit Zone-3-Blöcken' && main) {
    const rest = (main.min || 0) - 40; const before = Math.max(5, r5(rest * 0.5)), after = Math.max(5, rest - before);
    out.steps.splice(out.steps.indexOf(main), 1, { ...main, min: before }, S('main', { reps: 3, min: 10, zone: 3, restMin: 5, note: 'zügig, aber gleichmäßig (Zone 3), dazwischen 5 min locker' }), S('main', { min: after, zone: 2, note: 'locker zu Ende fahren' }));
    out.variant = 'mit 3 zügigen Blöcken';
    return out;
  }
  out.variant = v;
  return out;
}
/* Schwimmen: Schwerpunkt je Woche und kürzere Pausen im Block (mehr Meter in gleicher Zeit) */
export const SWIM_VARIANTS = ['Technik', 'Pull Buoy', 'zügige Bahnen'];
/* Auftrag 17: Schwerpunkte je Einheit nach vorhandener Ausrüstung (nie Ausrüstung voraussetzen, die fehlt, und nicht alles in jeder
   Einheit): Technik (Übungen; Flossen für Lernende, Schnorchel für Kraulende), Beinschlag (Kickbrett), Zug und Wasserlage (Pull Buoy),
   zügige Bahnen (erst, wenn Kraul-Stücke geschwommen werden). */
export function swimFocusList(gear: string[] | null | undefined, stage?: { ladder: string; n: number } | null): string[] {
  const g = gear || [];
  const crawling = !stage || (stage.ladder === 'swim' && stage.n >= 2);
  return ['Technik', ...(g.includes('board') ? ['Beinschlag'] : []), ...(g.includes('buoy') && crawling ? ['Pull Buoy'] : []), ...(crawling ? ['zügige Bahnen'] : [])];
}
/* Schwerpunkt einer neu gebauten Einheit wie bisher behalten (z. B. nach einer Stufenänderung) */
export function swimFocusIndex(oldVariant: string | null | undefined, gear: string[] | null | undefined, stage?: { ladder: string; n: number } | null): number {
  const list = swimFocusList(gear, stage); const i = list.indexOf(String(oldVariant || '').split(',')[0].trim());
  return i >= 0 ? i : 0;
}
export function swimVariant(spec: W.Spec, k: number, weekInBlock: number, phase: Ph): W.Spec {
  const out: W.Spec = JSON.parse(JSON.stringify(spec));
  const gear = (out.ctx && out.ctx.gear) || [];
  const list = swimFocusList(gear, out.stage as any);
  let v = list[((k % list.length) + list.length) % list.length];
  const rest = Math.max(15, 30 - 5 * weekInBlock);
  out.steps.forEach(s => { if (s.part === 'main' && (s.reps || 1) > 1 && s.restSec && s.restSec >= 20 && s.mode !== 'drill') s.restSec = rest; });
  const learnLen = out.stage && out.stage.ladder === 'swim' ? (W.SWIM_STAGE_M[out.stage.n] || 25) : 0;
  const crawlMain = () => out.steps.find(s => s.part === 'main' && s.mode === 'crawl' && (s.zone || 2) <= 2 && (s.reps || 1) >= 2);
  // Pull Buoy: Zug und Wasserlage. Kraulende: die Hälfte der lockeren Kraul-Stücke mit Pull Buoy. Lernende: Stücke so lang wie die Stufe.
  if (v === 'Pull Buoy' && !out.steps.some(s => s.mode === 'pull')) {
    const c = crawlMain();
    if (c && !out.stage) { const half = Math.floor((c.reps || 1) / 2); c.reps = (c.reps || 1) - half; out.steps.splice(out.steps.indexOf(c) + 1, 0, S('main', { reps: half, m: c.m, zone: 2, mode: 'pull', restSec: c.restSec, note: 'Beine ruhig, lange Züge' })); }
    else if (c && learnLen) out.steps.splice(out.steps.indexOf(c) + 1, 0, S('main', { reps: 4, m: Math.min(learnLen, c.m || learnLen), zone: 2, mode: 'pull', restSec: 30, note: 'Beine ruhig, lange Züge, gleichmäßig ausatmen', focus: 'Zug und Wasserlage, Beine locker lassen' }));
    else v = 'Technik';
  }
  // Beinschlag mit Kickbrett: eigener Block nach dem Einschwimmen (vorhandener Beinschlag wird länger)
  if (v === 'Beinschlag') {
    const kk = out.steps.find(s => s.mode === 'kick');
    if (kk) kk.reps = (kk.reps || 1) + 2;
    else { const i = out.steps.findIndex(s => s.part !== 'warm'); out.steps.splice(Math.max(1, i), 0, S('main', { reps: 6, m: out.stage ? 25 : 50, zone: 1, mode: 'kick', restSec: 30, focus: 'Beine aus der Hüfte, Knie locker, Wasserlage ruhig halten' })); }
  }
  if (v === 'Technik') { const d = out.steps.find(s => s.mode === 'drill'); if (d) d.reps = (d.reps || 1) + 2; }
  if (v === 'Pull Buoy') { const p = out.steps.find(s => s.mode === 'pull'); if (p) p.reps = (p.reps || 1) + 2; }
  if (v === 'zügige Bahnen') { const c = out.steps.find(s => s.mode === 'crawl' && s.part === 'main'); if (c) out.steps.splice(out.steps.indexOf(c) + 1, 0, S('main', { reps: 4, m: Math.min(c.m || 25, 50), zone: 3, mode: 'crawl', restSec: 30, note: 'zügig, Technik sauber halten' })); }
  // Freiwasser-Technik im Becken in der spezifischen Phase (Lernende nur in Stücken, die sie schon schaffen)
  const owM = out.stage && out.stage.ladder === 'swim' ? Math.min(50, W.SWIM_STAGE_M[out.stage.n] || 25) : 50;
  const ow = phase === 'specific' && !(out.stage && out.stage.ladder === 'swim' && out.stage.n < 2);
  if (ow) out.steps.splice(out.steps.length - 1, 0, S('main', { reps: 4, m: owM, zone: 2, mode: out.stage && out.stage.ladder === 'swimBreast' ? 'breast' : 'crawl', restSec: 30, note: 'Freiwasser-Technik: alle 6 Züge nach vorn orientieren; letzte Bahn als Start mit schnellem Antritt' }));
  out.variant = ow ? v + ', Freiwasser-Technik' : v;
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
