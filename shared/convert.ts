/* Auftrag 35, Punkt 4: Einheit selbst umwandeln – „Lieber Intervalle“, „Lieber locker“, „Lieber länger“, „Lieber kürzer“.
   Schlägt eine passende Einheit derselben Sportart vor, gebaut aus denselben Bausteinen wie der Plan (shared/workouts), mit sinnvoller
   Dauer (gleiche Dauer bei Intervallen/locker, länger +25 %, kürzer −25 %). Tempo/Watt/Puls kommen aus dem Kontext der Einheit (eigene
   Schwellen), die km-Ansicht aus shared/kmview. Für Bedenken gibt es eine leichtere Variante (Intervalle → zügige Abschnitte in Zone 3,
   länger → nur +10 %). Prüfung von Woche, Ampel und nächsten Tagen: web/src/views/convertui.ts (Regel-Engine wie beim Bearbeiten). */
import * as W from './workouts';

export type ConvKind = 'intervals' | 'easy' | 'longer' | 'shorter';
export const CONV_LABEL: Record<ConvKind, string> = { intervals: 'Lieber Intervalle', easy: 'Lieber locker', longer: 'Lieber länger', shorter: 'Lieber kürzer' };
export interface ConvSet { title: string; plannedMinutes: number; plannedKm: number | null; description: string; spec: W.Spec; zone: string | null; hard: boolean }
export interface ConvOption { kind: ConvKind; lighter: boolean; set: ConvSet; what: string }

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
/** Welche Umwandlungen gehen? (Lernstufen, Wettkampf, Teamsport, Kraft: keine) */
export function convertKinds(s: any): ConvKind[] {
  if (!s || !s.spec || s.race || s.fixed || s.cancelled || !['run', 'bike', 'swim'].includes(s.sport)) return [];
  const k = s.spec.kind;
  if (k === 'race' || k === 'test') return [];
  const out: ConvKind[] = [];
  const hard = !!s.hard || ['intervals', 'threshold', 'vo2', 'sweetspot', 'overunder', 'css', 'tempo', 'racepace', 'hills', 'fartlek', 'longq'].includes(k);
  // Lernstufen (Lauf-Geh-Wechsel, Kraul lernen): keine Intervalle, Umfang nur kürzer
  const stage = !!s.stage || !!s.spec.stage || k === 'runwalk' || k === 'swimlearn';
  if (!hard && !stage) out.push('intervals');
  if (hard) out.push('easy');
  if (!stage) out.push('longer');
  out.push('shorter');
  return out;
}
function intervalsSpec(sport: string, ctx: W.PaceCtx, min: number, lighter: boolean, noDistance?: boolean): W.Spec {
  if (sport === 'run') {
    const avail = Math.max(10, min - 25);
    if (lighter) return W.runTempo(ctx, clamp(Math.round(avail * 0.6 / 5) * 5, 10, 25), 3);
    return W.runIntervals(ctx, clamp(Math.round(avail / 5), 3, 6), 3, 2, 4);
  }
  if (sport === 'bike') {
    const avail = Math.max(16, min - 25);
    const sp = lighter ? W.bikeIntervals(ctx, clamp(Math.round(avail / 13), 2, 4), 10, 3, 3) : W.bikeIntervals(ctx, clamp(Math.round(avail / 12), 2, 5), 8, 4, 4);
    return { ...sp, noDistance: !!noDistance || sp.noDistance };
  }
  const mode = (ctx.css || ctx.crawl100 ? 'crawl' : 'breast') as W.StrokeMode;
  // Ein-/Ausschwimmen bleiben, die Zahl der 100er füllt die Dauer
  const set = (reps: number): W.Step => ({ part: 'main', reps, m: 100, zone: lighter ? 3 : 4, mode, restSec: lighter ? 30 : 20 });
  const fixed = W.totals(W.swimSession(ctx, 'css', [])).min;
  const per = (W.totals(W.swimSession(ctx, 'css', [set(8)])).min - fixed) / 8;
  const reps = clamp(Math.round((min - fixed) / Math.max(0.5, per)), 4, 12);
  return W.swimSession(ctx, 'css', [set(reps)]);
}
function easySpec(sport: string, ctx: W.PaceCtx, min: number, noDistance?: boolean): W.Spec {
  if (sport === 'run') return W.runEasy(ctx, min);
  if (sport === 'bike') { const sp = W.bikeEasy(ctx, min); return { ...sp, noDistance: !!noDistance || sp.noDistance }; }
  const mode = (ctx.css || ctx.crawl100 ? 'crawl' : 'breast') as W.StrokeMode;
  const base = W.swimSession(ctx, 'endurance', [{ part: 'main', reps: 4, m: 200, zone: 2, mode, restSec: 30 }]);
  return W.scaleSpec(base, min / Math.max(1, W.totals(base).min));
}
const toSet = (b: any, keepTitle?: string): ConvSet => ({ title: keepTitle || b.title, plannedMinutes: b.plannedMinutes, plannedKm: b.plannedKm ?? null, description: b.description, spec: b.spec, zone: b.zone || null, hard: !!b.hard });

/** Vorschlag für eine Umwandlung (lighter = leichtere Variante bei Bedenken). null, wenn es nicht geht. */
export function convertSession(s: any, kind: ConvKind, o: { lighter?: boolean } = {}): ConvOption | null {
  if (!convertKinds(s).includes(kind)) return null;
  const spec: W.Spec = s.spec; const ctx = spec.ctx || {};
  const min = s.plannedMinutes || W.totals(spec).min;
  const lighter = !!o.lighter;
  let set: ConvSet | null = null;
  if (kind === 'intervals') set = toSet(W.build(intervalsSpec(s.sport, ctx, min, lighter, spec.noDistance)));
  else if (kind === 'easy') set = toSet(W.build(easySpec(s.sport, ctx, min, spec.noDistance)));
  else {
    const f = kind === 'longer' ? (lighter ? 1.1 : 1.25) : 0.75;
    const rb = W.rebuildScaled(s, f);
    if (!rb) return null;
    set = { title: rb.title, plannedMinutes: rb.plannedMinutes, plannedKm: rb.plannedKm ?? null, description: rb.description, spec: rb.spec, zone: rb.zone || s.zone || null, hard: !!s.hard };
    if (kind === 'longer' && set.plannedMinutes <= min) return null;
    if (kind === 'shorter' && set.plannedMinutes >= min) return null;
  }
  const what = `${s.title} → ${set.title}${set.plannedMinutes !== min ? ` (${min} → ${set.plannedMinutes} min)` : ''}`;
  return { kind, lighter, set, what };
}

/* Auftrag 38: „Andere Vorschläge“ – 2-3 weitere passende Varianten derselben Art (gleiche Sportart, sinnvolle Dauer), z. B. statt
   Schwellen-Intervallen kurze schnelle Stücke, Tempowechsel oder zügig am Stück; länger/kürzer in anderen Stufen. Erste = Hauptvorschlag
   (wie convertSession), zweite = leichtere Variante. Gleiche Bausteine wie der Plan (shared/workouts), Tempo aus dem Kontext der Einheit. */
export interface ConvVariant extends ConvOption { label: string }
export function convertVariants(s: any, kind: ConvKind): ConvVariant[] {
  if (!convertKinds(s).includes(kind)) return [];
  const spec: W.Spec = s.spec; const ctx = spec.ctx || {}; const min = s.plannedMinutes || W.totals(spec).min;
  const out: ConvVariant[] = [];
  const add = (label: string, o: ConvOption | null) => { if (o && !out.some(x => x.set.title === o.set.title && x.set.plannedMinutes === o.set.plannedMinutes)) out.push({ ...o, label }); };
  const mk = (sp: W.Spec, lighter = false): ConvOption => { const set = toSet(W.build({ ...sp, noDistance: !!spec.noDistance || sp.noDistance })); return { kind, lighter, set, what: `${s.title} → ${set.title}${set.plannedMinutes !== min ? ` (${min} → ${set.plannedMinutes} min)` : ''}` }; };
  add('Vorschlag', convertSession(s, kind));
  add('Leichter', convertSession(s, kind, { lighter: true }));
  if (kind === 'intervals') {
    if (s.sport === 'run') { const avail = Math.max(10, min - 25); add('Kurz und schnell', mk(W.runIntervals(ctx, clamp(Math.round(avail / 2), 5, 10), 1, 1, 5))); add('Tempowechsel', mk(W.runIntervals(ctx, clamp(Math.round(avail / 3), 4, 8), 2, 1, 3), true)); }
    else if (s.sport === 'bike') { const avail = Math.max(16, min - 25); add('Sweet Spot', mk(W.bikeSweetSpot(ctx, clamp(Math.round(avail / 17), 2, 3), 12, min))); add('Kurz und hart', mk(W.bikeIntervals(ctx, clamp(Math.round(avail / 6), 4, 6), 3, 5, 3))); }
    else { const mode = (ctx.css || ctx.crawl100 ? 'crawl' : 'breast') as W.StrokeMode; const base = W.swimSession(ctx, 'css', [{ part: 'main', reps: 4, m: 200, zone: 3, mode, restSec: 30 }]); add('Längere Stücke', mk(W.scaleSpec(base, min / Math.max(1, W.totals(base).min)))); }
  } else if (kind === 'easy') {
    if (s.sport === 'run') add('Locker mit Steigerungen', mk(W.runEasy(ctx, min, { strides: 4 })));
    else if (s.sport === 'swim') { const base = W.swimSession(ctx, 'technique', [{ part: 'main', reps: 6, m: 50, zone: 1, mode: 'drill', restSec: 20 }, { part: 'main', reps: 4, m: 100, zone: 2, mode: (ctx.css || ctx.crawl100 ? 'crawl' : 'breast') as W.StrokeMode, restSec: 20 }]); add('Technik locker', mk(W.scaleSpec(base, min / Math.max(1, W.totals(base).min)))); }
    else add('Ganz locker (Zone 1)', mk({ ...W.bikeEasy(ctx, min), steps: W.bikeEasy(ctx, min).steps.map(x => ({ ...x, zone: 1 })) }));
  } else {
    for (const [label, f] of (kind === 'longer' ? [['Deutlich länger', 1.4]] : [['Deutlich kürzer', 0.6], ['Etwas kürzer', 0.9]]) as [string, number][]) {
      const rb = W.rebuildScaled(s, f); if (!rb) continue;
      if ((kind === 'longer' && rb.plannedMinutes <= min) || (kind === 'shorter' && rb.plannedMinutes >= min)) continue;
      add(label, { kind, lighter: false, set: { title: rb.title, plannedMinutes: rb.plannedMinutes, plannedKm: rb.plannedKm ?? null, description: rb.description, spec: rb.spec, zone: rb.zone || s.zone || null, hard: !!s.hard }, what: `${s.title} → ${rb.title} (${min} → ${rb.plannedMinutes} min)` });
    }
  }
  return out.slice(0, 4);
}
