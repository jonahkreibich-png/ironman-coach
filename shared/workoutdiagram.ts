/* Auftrag 19, Punkt 1c: Ablaufbild einer Einheit als kleines SVG (für Lexikon und Einheiten-Details).
   Jeder Abschnitt ist ein Balken: Breite = Dauer (Schwimmen: Meter), Höhe = Zone (1 ganz locker … 5 sehr hart). Wiederholungen und Pausen
   werden einzeln gezeichnet. Farben über currentColor, damit es hell und dunkel passt. */
import * as W from './workouts';
import { LIB } from './workoutlib';
import { runQualitySpec, runEasyForm, bikeQualitySpec, bikeEasyForm, longFinish, bikeLongBlocks, swimQuality } from './workoutbuild';

interface Bar { w: number; z: number }
export function barsOf(spec: W.Spec): Bar[] {
  const out: Bar[] = [];
  const swim = spec.sport === 'swim';
  for (const s of spec.steps) {
    const reps = Math.max(1, s.reps || 1);
    for (let k = 0; k < reps; k++) {
      const work = swim ? (s.m || 0) / 50 : (s.min || 0);
      if (work > 0) out.push({ w: work, z: s.zone || 2 });
      const rest = swim ? 0 : k < reps - 1 ? (s.restMin || 0) + (s.walkMin || 0) : 0;
      if (rest > 0) out.push({ w: rest, z: 1 });
    }
  }
  return out;
}
export function diagramSvg(spec: W.Spec, o: { width?: number; height?: number; label?: string } = {}): string {
  const W0 = o.width || 300, H = o.height || 56;
  const bars = barsOf(spec); const total = bars.reduce((a, b) => a + b.w, 0) || 1;
  let x = 0; const gap = bars.length > 60 ? 0 : 0.6;
  const rects = bars.map(b => { const w = Math.max(0.8, b.w / total * W0 - gap); const h = Math.round(H * (0.18 + 0.82 * (b.z / 5))); const r = `<rect x="${x.toFixed(1)}" y="${H - h}" width="${w.toFixed(1)}" height="${h}" rx="1.5" fill="currentColor" opacity="${(0.22 + 0.15 * b.z).toFixed(2)}"/>`; x += b.w / total * W0; return r; }).join('');
  return `<svg class="wo-diagram" viewBox="0 0 ${W0} ${H}" width="100%" height="${H}" role="img" aria-label="${(o.label || 'Ablauf der Einheit').replace(/"/g, '')}" preserveAspectRatio="none">${rects}</svg>`;
}
/* Beispiel-Einheit einer Form (für das Lexikon): Stufe 2 der Leiter, typische Dauer */
const CTX: W.PaceCtx = { runThrSec: 300, lthrRun: 170, lthrBike: 165, bikeKmh: 30, css: 110, breast100: 160, pool: 25, gear: ['buoy', 'board'] };
export function exampleSpec(key: string): W.Spec | null {
  const d = LIB[key]; if (!d) return null;
  const st = Math.min(1, d.stages.length - 1);
  try {
    if (d.sport === 'run') {
      if (key === 'run.easy') return W.runEasy(CTX, 45);
      if (key === 'run.long') return W.runLong(CTX, 90);
      if (key === 'run.runwalk') return W.runWalk(CTX, 2);
      if (key === 'run.brick') { const sp = W.runEasy(CTX, 20); return sp; }
      if (key === 'run.longfinish') return longFinish(CTX, 90, st, 'run_half');
      return runEasyForm(key, st, CTX, 50) || runQualitySpec(key, st, CTX, 'run_half');
    }
    if (d.sport === 'bike' || key === 'bike.brickreps') {
      if (key === 'bike.easy') return W.bikeEasy(CTX, 60);
      if (key === 'bike.long') return W.bikeLong(CTX, 150);
      if (key === 'bike.racepaceblocks') return bikeLongBlocks(CTX, 150, st);
      if (key === 'bike.brickreps') return { sport: 'bike', kind: 'brick', ctx: CTX, steps: [{ part: 'warm', min: 15, zone: 1 }, ...[0, 1, 2].flatMap(() => [{ part: 'main' as const, min: 10, zone: 4 }, { part: 'main' as const, min: 5, zone: 4 }, { part: 'main' as const, min: 3, zone: 1 }]), { part: 'cool', min: 10, zone: 1 }] };
      return bikeEasyForm(key, st, CTX, 60) || bikeQualitySpec(key, st, CTX, 'tri_olympic', { total: 75 });
    }
    if (d.sport === 'swim') {
      const base = W.swimNormal({ ...CTX }, 'technique', 45, 'build', 400, 0);
      if (key === 'swim.long') return W.swimSession(CTX, 'endurance', [{ part: 'main', reps: 1, m: 1200, zone: 2, mode: 'crawl' }], 300, 100);
      if (key === 'swim.openwater') return W.swimOpenWater(CTX, 45);
      if (['swim.drills', 'swim.kick', 'swim.pull', 'swim.breath', 'swim.aerobic'].includes(key)) return base;
      return swimQuality(key, st, base, { repMax: 400, learner: key === 'swim.fast', minutes: 50 });
    }
    // Triathlon-Formen: Koppel als Rad + Lauf
    return { sport: 'bike', kind: 'brick', ctx: CTX, steps: [{ part: 'warm', min: 15, zone: 1 }, { part: 'main', min: 90, zone: 2 }, { part: 'main', min: 15, zone: 3 }, { part: 'cool', min: 5, zone: 1 }] };
  } catch { return null; }
}
