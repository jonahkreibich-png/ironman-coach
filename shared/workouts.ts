/* Einheiten aus Bausteinen: Titel, Dauer, Distanz und Beschreibung kommen aus DENSELBEN Zahlen (Auftrag 4 A6/C2).
   Eine Einheit ist eine Liste von Schritten (Aufwärmen, Hauptteil, Ausklang). Daraus werden Minuten und Kilometer
   berechnet und der Text geschrieben: was genau, wie hart (Zonen der Person, Pace, Gefühl), warum, worauf achten.
   Die Bauanleitung (spec) bleibt an der Einheit, damit Anpassungen (z. B. Umfang −10 %) Text und Zahlen gemeinsam ändern.
   Keine Abhängigkeit von core.ts (core importiert dieses Modul). */
import { HR_ZONES, POWER_ZONES } from './sports';

export type WSport = 'run' | 'bike' | 'swim' | 'strength' | 'football';
export type StrokeMode = 'crawl' | 'breast' | 'drill' | 'kick' | 'mixed' | 'easy';
export interface Step {
  part: 'warm' | 'main' | 'cool';
  /** Wiederholungen (1 = durchgehend) */
  reps?: number;
  /** Dauer pro Wiederholung in Minuten (Laufen, Rad) */
  min?: number;
  /** Meter pro Wiederholung (Schwimmen) */
  m?: number;
  zone?: number;
  /** Pause nach jeder Wiederholung: Minuten locker (Laufen/Rad) bzw. Sekunden am Rand (Schwimmen) */
  restMin?: number; restSec?: number;
  /** Lauf-Geh-Wechsel: Minuten Gehen nach jedem Laufstück */
  walkMin?: number;
  /** nur Gehen (Auf- und Abwärmen beim Lauf-Geh-Wechsel) */
  walkOnly?: boolean;
  mode?: StrokeMode;
  /** freier Zusatz (z. B. „4 Steigerungen am Ende“, Übungsnamen) */
  note?: string;
}
export interface Exercise { name: string; sets: number; reps: string; note?: string }
/** Alles, was zum Neuberechnen nötig ist (ohne Profil) */
export interface PaceCtx {
  runThrSec?: number | null; lthrRun?: number | null; lthrBike?: number | null;
  bikeKmh?: number | null; ftp?: number | null; css?: number | null; breast100?: number | null;
  indoor?: boolean; bikeName?: string | null;
}
export type Kind = 'easy' | 'long' | 'intervals' | 'tempo' | 'threshold' | 'steady' | 'runwalk' | 'swimlearn' | 'technique' | 'css' | 'endurance' | 'strength' | 'team' | 'game' | 'test' | 'race' | 'brick' | 'recovery';
export interface Spec {
  sport: WSport; kind: Kind;
  steps: Step[];
  exercises?: Exercise[];
  ctx: PaceCtx;
  /** fester Titel (Wettkampf, Teamsport), sonst aus den Zahlen */
  title?: string;
  why?: string; tip?: string;
  /** Lernstufe (Kraul lernen, Lauf-Geh-Wechsel) */
  stage?: { ladder: 'swim' | 'swimBreast' | 'runwalk'; n: number } | null;
  /** ohne Distanz (Rolle, Kraft, Teamsport) */
  noDistance?: boolean;
  /** Kraft: Körperbereich */
  area?: 'lower' | 'upper' | 'core';
  /** wann (z. B. „Morgens vor der Schule, höchstens 40 min.“) */
  when?: string;
}

/* ---------- Tempo je Zone ---------- */
const RUN_F: Record<number, [number, number]> = { 1: [1.30, 1.40], 2: [1.15, 1.26], 3: [1.06, 1.12], 4: [0.99, 1.04], 5: [0.92, 0.97] };
const BIKE_F: Record<number, number> = { 1: 0.70, 2: 0.80, 3: 0.89, 4: 0.97, 5: 1.03 };
const SWIM_PLUS: Record<number, number> = { 1: 15, 2: 8, 3: 4, 4: 0, 5: -3 };
const WALK_SEC_KM = 600; // 10 min/km
export const FEEL: Record<number, string> = {
  1: 'ganz locker, du könntest dich die ganze Zeit unterhalten',
  2: 'locker, du kannst noch ganze Sätze sprechen',
  3: 'zügig, nur noch kurze Sätze',
  4: 'hart, nur noch einzelne Wörter',
  5: 'sehr hart, sprechen geht nicht mehr'
};
const ZNAME: Record<number, string> = { 1: 'ganz locker', 2: 'locker', 3: 'zügig', 4: 'hart', 5: 'sehr hart' };

const mid = (r: [number, number]) => (r[0] + r[1]) / 2;
export function runPace(ctx: PaceCtx, zone: number): number { return Math.round((ctx.runThrSec || 390) * mid(RUN_F[zone] || RUN_F[2])); }
export function bikeKmh(ctx: PaceCtx, zone: number): number { return (ctx.bikeKmh || 24) * (BIKE_F[zone] || BIKE_F[2]); }
export function swimPace(ctx: PaceCtx, zone: number, mode: StrokeMode = 'crawl'): number {
  const breast = ctx.breast100 || 175;
  if (mode === 'breast') return breast + (zone <= 1 ? 10 : 0);
  if (mode === 'drill' || mode === 'kick') return Math.max((ctx.css ? ctx.css + 25 : breast + 15), 120);
  if (mode === 'easy' || mode === 'mixed') return ctx.css ? ctx.css + 15 : breast;
  return ctx.css ? ctx.css + (SWIM_PLUS[zone] ?? 8) : Math.max(breast, 170);
}
const mmss = (sec: number) => { sec = Math.round(sec); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
const de1 = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',');
const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/* ---------- Summen ---------- */
export function stepMinutes(spec: Spec, s: Step): number {
  const reps = s.reps || 1;
  if (spec.sport === 'swim') {
    const p = swimPace(spec.ctx, s.zone || 2, s.mode || 'crawl');
    return (reps * (s.m || 0) / 100 * p + Math.max(0, reps - 1) * (s.restSec || 0)) / 60;
  }
  const work = reps * (s.min || 0);
  const rest = Math.max(0, reps - 1) * (s.restMin || 0) + reps * (s.walkMin || 0);
  return work + rest;
}
export function stepKm(spec: Spec, s: Step): number {
  const reps = s.reps || 1;
  if (spec.sport === 'swim') return reps * (s.m || 0) / 1000;
  if (spec.sport === 'run') {
    if (s.walkOnly) return reps * (s.min || 0) * 60 / WALK_SEC_KM;
    const work = reps * (s.min || 0) * 60 / runPace(spec.ctx, s.zone || 2);
    const rest = Math.max(0, reps - 1) * (s.restMin || 0) * 60 / runPace(spec.ctx, 1);
    const walk = reps * (s.walkMin || 0) * 60 / WALK_SEC_KM;
    return work + rest + walk;
  }
  if (spec.sport === 'bike') return (reps * (s.min || 0) * bikeKmh(spec.ctx, s.zone || 2) + Math.max(0, reps - 1) * (s.restMin || 0) * bikeKmh(spec.ctx, 1)) / 60;
  return 0;
}
export function totals(spec: Spec): { min: number; km: number | null } {
  if (spec.sport === 'strength') { const m = spec.steps.reduce((a, s) => a + stepMinutes(spec, s), 0); return { min: Math.round(m), km: null }; }
  const min = spec.steps.reduce((a, s) => a + stepMinutes(spec, s), 0);
  const km = spec.noDistance ? null : spec.steps.reduce((a, s) => a + stepKm(spec, s), 0);
  return { min: Math.round(min), km: km == null ? null : spec.sport === 'swim' ? Math.round(km * 1000) / 1000 : Math.round(km * 10) / 10 };
}

/* ---------- Text ---------- */
function hrRange(lthr: number, zone: number): string {
  const z = HR_ZONES[zone - 1];
  if (z.low === 0) return `Puls unter ${Math.round(lthr * z.high / 100)}`;
  if (z.high >= 999) return `Puls über ${Math.round(lthr * z.low / 100)}`;
  return `Puls ${Math.round(lthr * z.low / 100)}–${Math.round(lthr * z.high / 100)}`;
}
function intensity(spec: Spec, zone: number, mode?: StrokeMode): string {
  const c = spec.ctx;
  const parts: string[] = [];
  if (spec.sport === 'run') {
    const thr = c.runThrSec || 390; const f = RUN_F[zone] || RUN_F[2];
    parts.push(`${mmss(thr * f[0])}–${mmss(thr * f[1])}/km`);
    if (c.lthrRun) parts.push(hrRange(c.lthrRun, zone));
  } else if (spec.sport === 'bike') {
    if (c.ftp) { const z = POWER_ZONES[zone - 1]; parts.push(`${Math.round(c.ftp * z.low / 100)}–${z.high >= 999 ? Math.round(c.ftp * 1.2) : Math.round(c.ftp * z.high / 100)} W`); }
    if (c.lthrBike) parts.push(hrRange(c.lthrBike, zone));
  } else if (spec.sport === 'swim') {
    parts.push(`etwa ${mmss(swimPace(c, zone, mode))}/100 m`);
  }
  return `Z${zone}${parts.length ? ': ' + parts.join(', ') : ''}`;
}
const STROKE: Record<StrokeMode, string> = { crawl: 'Kraul', breast: 'Brust', drill: 'Technikübungen', kick: 'Beinschlag mit Brett', mixed: 'Lage nach Wahl', easy: 'locker, Lage nach Wahl' };
function stepText(spec: Spec, s: Step): string {
  const reps = s.reps || 1; const z = s.zone || 2;
  if (spec.sport === 'swim') {
    const what = `${reps > 1 ? `${reps}×${s.m} m` : `${s.m} m`} ${STROKE[s.mode || 'crawl']}`;
    return `${what}${s.mode === 'crawl' || s.mode === 'breast' ? ` (${intensity(spec, z, s.mode)})` : ''}${reps > 1 && s.restSec ? `, ${s.restSec} s Pause am Rand` : ''}${s.note ? '. ' + s.note : ''}`;
  }
  if (s.walkOnly) return `${s.min} min ${s.note || 'zügig gehen'}`;
  if (s.walkMin) return `${reps}× (${s.min} min locker laufen + ${s.walkMin} min zügig gehen)${s.note ? ', ' + s.note : ''}`;
  const len = `${reps > 1 ? `${reps}×${s.min} min` : `${s.min} min`}`;
  const rest = reps > 1 && s.restMin ? `, dazwischen ${s.restMin} min ${spec.sport === 'run' ? 'locker traben' : 'locker rollen'}` : '';
  return `${len} ${ZNAME[z]} (${intensity(spec, z)})${rest}${s.note ? ', ' + s.note : ''}`;
}
const PART: Record<Step['part'], string> = { warm: 'Aufwärmen', main: 'Hauptteil', cool: 'Ausklang' };

export function describe(spec: Spec): string {
  const L: string[] = spec.when ? [spec.when] : [];
  if (spec.sport === 'strength') {
    const w = spec.steps.find(s => s.part === 'warm');
    if (w) L.push(`Aufwärmen: ${w.min} min ${w.note || 'locker bewegen (Seilspringen, Kniebeugen ohne Gewicht, Armkreisen)'}`);
    L.push('Übungen:');
    (spec.exercises || []).forEach(e => L.push(`• ${e.name}: ${e.sets}×${e.reps}${e.note ? ` (${e.note})` : ''}`));
    L.push('Pause zwischen den Sätzen 60-90 s. Saubere Technik vor Gewicht, die letzte Wiederholung muss sauber gehen.');
  } else if (spec.kind === 'team' || spec.kind === 'game' || spec.kind === 'race') {
    spec.steps.filter(s => s.note).forEach(s => L.push(s.note!));
  } else {
    for (const part of ['warm', 'main', 'cool'] as const) {
      const steps = spec.steps.filter(s => s.part === part);
      if (steps.length) L.push(`${PART[part]}: ${steps.map(s => stepText(spec, s)).join('; dann ')}`);
    }
    const t = totals(spec);
    L.push(`Gesamt: ${t.min} min${t.km ? spec.sport === 'swim' ? `, ${thousands(t.km * 1000)} m` : `, ca. ${de1(t.km)} km` : ''}`);
    const zmax = Math.max(...spec.steps.filter(s => s.part === 'main').map(s => s.zone || 2), 1);
    L.push(`Wie hart: ${FEEL[zmax]}.`);
  }
  if (spec.why) L.push(`Warum: ${spec.why}`);
  if (spec.tip) L.push(`Achte auf: ${spec.tip}`);
  return L.join('\n');
}
export function title(spec: Spec): string {
  if (spec.title) return spec.title;
  const t = totals(spec);
  const main = spec.steps.filter(s => s.part === 'main');
  const m0 = main[0] || ({} as Step);
  const where = spec.sport === 'bike' && spec.ctx.indoor ? ' (Rolle)' : spec.sport === 'bike' && spec.ctx.bikeName ? ` (${spec.ctx.bikeName})` : '';
  switch (spec.kind) {
    case 'runwalk': return `Lauf-Geh-Wechsel ${m0.reps}× (${m0.min} + ${m0.walkMin} min)`;
    case 'swimlearn': return spec.stage && spec.stage.ladder === 'swimBreast' ? `Schwimmen: Brust und Kraul-Technik (${thousands((t.km || 0) * 1000)} m)` : `Schwimmen: Kraul lernen, Stufe ${(spec.stage?.n ?? 0) + 1} (${thousands((t.km || 0) * 1000)} m)`;
    case 'technique': return `Schwimmen Technik ${thousands((t.km || 0) * 1000)} m`;
    case 'css': return `Schwimmen ${m0.reps}×${m0.m} m zügig`;
    case 'endurance': return spec.sport === 'swim' ? `Schwimmen Ausdauer ${thousands((t.km || 0) * 1000)} m` : `Ausdauer ${t.min} min`;
    case 'intervals': return `${spec.sport === 'run' ? 'Lauf' : 'Rad'}-Intervalle ${m0.reps}×${m0.min} min${where}`;
    case 'threshold': return `${spec.sport === 'run' ? 'Schwellenlauf' : 'Rad Schwelle'} ${m0.reps && m0.reps > 1 ? `${m0.reps}×${m0.min}` : m0.min} min${where}`;
    case 'tempo': return `${spec.sport === 'run' ? 'Tempolauf' : 'Rad Tempo'} ${m0.reps && m0.reps > 1 ? `${m0.reps}×${m0.min}` : m0.min} min${where}`;
    case 'long': return spec.sport === 'run' ? `Langer Lauf ${t.min} min` : `Lange Ausfahrt ${t.min} min${where}`;
    case 'brick': return `Koppeltraining Rad + Lauf ${t.min} min`;
    case 'recovery': return spec.sport === 'run' ? `Lockerer Lauf ${t.min} min` : `Lockere Runde ${t.min} min${where}`;
    case 'test': return spec.title || 'Test';
    case 'strength': return spec.area ? `Kraft ${AREA_LABEL[spec.area]} ${t.min} min` : `Kraft ${t.min} min`;
    default: return spec.sport === 'run' ? `Lockerer Lauf ${t.min} min` : spec.sport === 'bike' ? `Lockere Ausfahrt ${t.min} min${where}` : `${t.min} min`;
  }
}
const zoneLabel = (spec: Spec) => { const z = Math.max(...spec.steps.filter(s => s.part === 'main').map(s => s.zone || 0), 0); return z ? `Zone ${z}` : undefined; };

/* Einheit im Plan-Format. id und Extras (fixed, race …) setzt der Aufrufer. */
export function build(spec: Spec): any {
  const t = totals(spec);
  const s: any = { sport: spec.sport, title: title(spec), plannedMinutes: t.min, description: describe(spec), spec };
  if (t.km != null && t.km > 0) s.plannedKm = t.km;
  const z = zoneLabel(spec); if (z && spec.sport !== 'strength' && spec.sport !== 'swim') s.zone = z;
  if (spec.sport === 'swim') { const zs = Math.max(...spec.steps.filter(x => x.part === 'main').map(x => x.zone || 2)); s.zone = `Zone ${zs}`; }
  if (spec.kind === 'intervals' || spec.kind === 'threshold' || spec.kind === 'test' || spec.kind === 'css' || spec.kind === 'game' || spec.kind === 'race') s.hard = true;
  if (spec.stage) s.stage = spec.stage;
  if (spec.area) s.area = spec.area;
  return s;
}

/* Umfang einer Einheit ändern (Faktor), Text und Zahlen bleiben gleich erzeugt. Der Hauptteil wird verlängert/gekürzt. */
export function scaleSpec(spec: Spec, f: number): Spec {
  const out: Spec = JSON.parse(JSON.stringify(spec));
  if (out.sport === 'strength') { (out.exercises || []).forEach(e => { e.sets = Math.max(1, Math.round(e.sets * Math.min(1, f + 0.15))); }); out.steps.forEach(s => { if (s.part === 'main') s.min = Math.max(10, Math.round((s.min || 20) * f / 5) * 5); }); return out; }
  if (out.stage) return out; // Lernstufen ändern sich nur mit der Stufe
  const before = totals(out).min;
  const target = before * f;
  const fixedMin = out.steps.filter(s => s.part !== 'main').reduce((a, s) => a + stepMinutes(out, s), 0);
  const mains = out.steps.filter(s => s.part === 'main');
  const mainMin = mains.reduce((a, s) => a + stepMinutes(out, s), 0);
  const want = Math.max(mainMin * 0.3, target - fixedMin);
  const g = mainMin ? want / mainMin : 1;
  for (const s of mains) {
    const reps = s.reps || 1;
    if (out.sport === 'swim') {
      if (reps > 1) s.reps = Math.max(2, Math.round(reps * g)); else s.m = Math.max(100, Math.round((s.m || 0) * g / 50) * 50);
    } else if (reps > 1 && !s.walkMin && (out.kind === 'intervals' || out.kind === 'threshold' || out.kind === 'tempo')) s.reps = Math.max(2, Math.round(reps * g));
    else if (reps > 1) s.reps = Math.max(1, Math.round(reps * g));
    else s.min = Math.max(5, Math.round((s.min || 0) * g / 5) * 5);
  }
  // Ein-/Ausrollen kürzen, wenn der Hauptteil schon minimal ist
  if (f < 1 && totals(out).min > target + 5) out.steps.forEach(s => { if (s.part !== 'main' && s.min && s.min > 5) s.min = Math.max(5, Math.round(s.min * f / 5) * 5); });
  return out;
}
export function rebuildScaled(session: any, f: number): any {
  if (!session || !session.spec) return null;
  const b = build(scaleSpec(session.spec, f));
  return { title: b.title, plannedMinutes: b.plannedMinutes, plannedKm: b.plannedKm ?? null, description: b.description, spec: b.spec };
}

/* ---------- Bausteine ---------- */
const S = (part: Step['part'], o: Omit<Step, 'part'>): Step => ({ part, ...o });
const r5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);
export function runEasy(ctx: PaceCtx, min: number, o: { strides?: boolean; kind?: Kind } = {}): Spec {
  return { sport: 'run', kind: o.kind || 'easy', ctx, steps: [S('main', { min: r5(min), zone: 2, note: o.strides ? 'am Ende 4 kurze Steigerungen über 15 s' : undefined })] };
}
export function runLong(ctx: PaceCtx, min: number): Spec { return { sport: 'run', kind: 'long', ctx, steps: [S('warm', { min: 10, zone: 1 }), S('main', { min: r5(min - 10), zone: 2 })] }; }
export function runIntervals(ctx: PaceCtx, reps: number, min: number, rest: number, zone = 4): Spec {
  return { sport: 'run', kind: 'intervals', ctx, steps: [S('warm', { min: 15, zone: 1, note: 'mit 3 kurzen Steigerungen' }), S('main', { reps, min, zone, restMin: rest }), S('cool', { min: 10, zone: 1 })] };
}
export function runTempo(ctx: PaceCtx, min: number, zone = 3): Spec {
  return { sport: 'run', kind: zone >= 4 ? 'threshold' : 'tempo', ctx, steps: [S('warm', { min: 15, zone: 1 }), S('main', { min, zone }), S('cool', { min: 10, zone: 1 })] };
}
export function bikeEasy(ctx: PaceCtx, min: number, kind: Kind = 'easy'): Spec { return { sport: 'bike', kind, ctx, steps: [S('main', { min: r5(min), zone: 2, note: 'hohe Trittfrequenz, 85-95 Umdrehungen' })], noDistance: !!ctx.indoor }; }
export function bikeLong(ctx: PaceCtx, min: number): Spec { return { sport: 'bike', kind: 'long', ctx, steps: [S('warm', { min: 15, zone: 1 }), S('main', { min: r5(min - 15), zone: 2, note: 'alle 20-30 min essen und trinken' })], noDistance: !!ctx.indoor }; }
export function bikeIntervals(ctx: PaceCtx, reps: number, min: number, zone: number, rest: number): Spec {
  return { sport: 'bike', kind: zone >= 4 ? 'threshold' : zone === 3 ? 'tempo' : 'intervals', ctx, steps: [S('warm', { min: 15, zone: 1, note: 'mit 3 kurzen Antritten' }), S('main', { reps, min, zone, restMin: rest }), S('cool', { min: 10, zone: 1 })], noDistance: !!ctx.indoor };
}
export function swimSession(ctx: PaceCtx, kind: Kind, mainSets: Step[], warmM = 200, coolM = 100, warmMode: StrokeMode = 'easy'): Spec {
  return { sport: 'swim', kind, ctx, steps: [S('warm', { m: warmM, zone: 1, mode: warmMode }), ...mainSets, S('cool', { m: coolM, zone: 1, mode: 'easy' })] };
}

/* ---------- Lernstufen ---------- */
/* Kraul lernen: von Wassergewöhnung bis 800 m am Stück. Eine Stufe weiter nur, wenn die letzte geklappt hat. */
export const SWIM_LADDER: { label: string; main: Step[]; warm?: number; tip: string }[] = [
  { label: 'Wassergewöhnung und Atmung', warm: 100, main: [S('main', { reps: 10, m: 25, zone: 1, mode: 'drill', restSec: 30, note: 'Gleiten in Bauchlage, ins Wasser ausatmen (Blubbern), seitlich einatmen' }), S('main', { reps: 4, m: 25, zone: 1, mode: 'kick', restSec: 30 })], tip: 'Ins Wasser ausatmen, nur kurz seitlich einatmen. Lieber langsam und ruhig als schnell.' },
  { label: 'Kraul-Technik mit Brett', main: [S('main', { reps: 8, m: 25, zone: 1, mode: 'kick', restSec: 30, note: 'Beinschlag aus der Hüfte' }), S('main', { reps: 8, m: 25, zone: 1, mode: 'drill', restSec: 30, note: 'Abschlagschwimmen mit Brett, Seitatmung' })], tip: 'Kopf ruhig, Blick zum Boden, gleichmäßig ausatmen.' },
  { label: 'Kurze Kraul-Strecken', main: [S('main', { reps: 6, m: 25, zone: 1, mode: 'drill', restSec: 20 }), S('main', { reps: 10, m: 25, zone: 2, mode: 'crawl', restSec: 30 })], tip: 'Nach jeder Bahn Pause, bis der Atem ruhig ist.' },
  { label: '50-m-Stücke Kraul', main: [S('main', { reps: 4, m: 25, zone: 1, mode: 'drill', restSec: 20 }), S('main', { reps: 8, m: 50, zone: 2, mode: 'crawl', restSec: 30 })], tip: 'Alle 3 Züge atmen, beide Seiten üben.' },
  { label: '100-m-Stücke Kraul', main: [S('main', { reps: 4, m: 25, zone: 1, mode: 'drill', restSec: 20 }), S('main', { reps: 6, m: 100, zone: 2, mode: 'crawl', restSec: 30 })], tip: 'Gleichmäßig bleiben, nicht schneller werden.' },
  { label: '200-m-Stücke Kraul', main: [S('main', { reps: 4, m: 200, zone: 2, mode: 'crawl', restSec: 30 })], tip: 'Lange Arme, ruhig ausatmen.' },
  { label: '400 m am Stück', main: [S('main', { reps: 2, m: 400, zone: 2, mode: 'crawl', restSec: 60 })], tip: 'Ruhiges Tempo, du sollst ohne Pause durchkommen.' },
  { label: '800 m am Stück', main: [S('main', { reps: 1, m: 800, zone: 2, mode: 'crawl' }), S('main', { reps: 4, m: 50, zone: 3, mode: 'crawl', restSec: 20 })], tip: 'Jetzt zählt Ausdauer: gleichmäßig durchschwimmen.' }
];
/* Nur Brust: zuerst Brust plus Kraul-Technik */
export const SWIM_BREAST_LADDER: { label: string; main: Step[]; tip: string }[] = [
  { label: 'Brust und Kraul-Beinschlag', main: [S('main', { reps: 4, m: 100, zone: 2, mode: 'breast', restSec: 30 }), S('main', { reps: 6, m: 25, zone: 1, mode: 'kick', restSec: 30 })], tip: 'Bei Brust das Gesicht ins Wasser, dann ist es leichter.' },
  { label: 'Brust und Kraul-Technik', main: [S('main', { reps: 3, m: 100, zone: 2, mode: 'breast', restSec: 30 }), S('main', { reps: 8, m: 25, zone: 1, mode: 'drill', restSec: 30, note: 'Abschlagschwimmen, Seitatmung' })], tip: 'Kraul langsam üben, die Technik kommt vor dem Tempo.' },
  { label: 'Brust und kurze Kraul-Strecken', main: [S('main', { reps: 2, m: 200, zone: 2, mode: 'breast', restSec: 30 }), S('main', { reps: 8, m: 25, zone: 2, mode: 'crawl', restSec: 30 })], tip: 'Jede Kraul-Bahn ruhig, danach Pause.' }
];
/* Lauf-Geh-Wechsel bis 30 min am Stück */
export const RUNWALK_LADDER: { reps: number; run: number; walk: number }[] = [
  { reps: 8, run: 1, walk: 2 }, { reps: 8, run: 2, walk: 1 }, { reps: 6, run: 3, walk: 1 }, { reps: 5, run: 5, walk: 1 },
  { reps: 3, run: 8, walk: 1 }, { reps: 2, run: 12, walk: 1 }, { reps: 1, run: 20, walk: 0 }, { reps: 1, run: 30, walk: 0 }
];
export function swimLadderStart(sk: { swimCrawl?: string | null; swimCrawlM?: number | null; swimBreast?: boolean }): { ladder: 'swim' | 'swimBreast'; n: number } | null {
  const c = sk.swimCrawl, m = sk.swimCrawlM ?? 0;
  if (c === 'yes' && m >= 800) return null;
  if (c === 'yes' && !m) return null; // kann kraulen, Strecke unbekannt: normaler Plan
  if (c === 'yes' || c === 'some') {
    // Stufe so wählen, dass kein Stück länger ist als das, was schon am Stück geht
    const n = m >= 400 ? 6 : m >= 200 ? 5 : m >= 100 ? 4 : m >= 50 ? 3 : m >= 25 ? 2 : 1;
    return { ladder: 'swim', n };
  }
  if (c === 'no') return sk.swimBreast ? { ladder: 'swimBreast', n: 0 } : { ladder: 'swim', n: 0 };
  return null;
}
export function runLadderStart(continuousMin: number | null | undefined): number | null {
  if (continuousMin == null || continuousMin >= 30) return null;
  return continuousMin < 3 ? 0 : continuousMin < 5 ? 1 : continuousMin < 8 ? 2 : continuousMin < 12 ? 3 : continuousMin < 15 ? 4 : continuousMin < 20 ? 5 : 6;
}
export function swimLearn(ctx: PaceCtx, stage: { ladder: 'swim' | 'swimBreast'; n: number; breast?: boolean }, why?: string): Spec {
  const L = stage.ladder === 'swimBreast' ? SWIM_BREAST_LADDER : SWIM_LADDER;
  const st = L[Math.min(stage.n, L.length - 1)] as any;
  // wer Brust kann: Brust zum Einschwimmen und zwischendurch für die Ausdauer, Kraul in kurzen Stücken mit Technik
  const br = stage.ladder === 'swim' && stage.breast && stage.n <= 4;
  return { sport: 'swim', kind: 'swimlearn', ctx, stage, why, tip: st.tip + ' Die nächste Stufe kommt, sobald diese klappt.',
    steps: [S('warm', { m: br ? 200 : st.warm || 100, zone: 1, mode: stage.ladder === 'swimBreast' || br ? 'breast' : 'easy' }), ...st.main.map((x: Step) => ({ ...x })), ...(br ? [S('main', { reps: 2, m: 100, zone: 2, mode: 'breast', restSec: 30, note: 'ruhig, für die Ausdauer im Wasser' })] : []), S('cool', { m: 100, zone: 1, mode: br ? 'breast' : 'easy' })] };
}
export function runWalk(ctx: PaceCtx, n: number, why?: string): Spec {
  const st = RUNWALK_LADDER[Math.min(n, RUNWALK_LADDER.length - 1)];
  const steps = st.walk ? [S('warm', { min: 5, zone: 1, walkOnly: true, note: 'zügig gehen' }), S('main', { reps: st.reps, min: st.run, walkMin: st.walk, zone: 2 }), S('cool', { min: 5, zone: 1, walkOnly: true, note: 'locker gehen' })]
    : [S('warm', { min: 5, zone: 1, walkOnly: true, note: 'zügig gehen' }), S('main', { min: st.run, zone: 2 })];
  return { sport: 'run', kind: st.walk ? 'runwalk' : 'easy', ctx, stage: { ladder: 'runwalk', n }, why, tip: 'So langsam, dass du dich unterhalten kannst. Die nächste Stufe kommt, sobald diese klappt.', steps };
}

/* ---------- Kraft ---------- */
type Focus = 'run' | 'bike' | 'swim' | 'team' | 'general';
const LIB: Record<Focus, Exercise[]> = {
  run: [{ name: 'Kniebeuge', sets: 3, reps: '10' }, { name: 'Ausfallschritte', sets: 3, reps: '8 je Bein' }, { name: 'Wadenheben einbeinig', sets: 3, reps: '12 je Bein', note: 'langsam ablassen' }, { name: 'Hüftbrücke einbeinig', sets: 3, reps: '10 je Bein' }, { name: 'Seitstütz', sets: 3, reps: '30 s je Seite' }, { name: 'Unterarmstütz', sets: 3, reps: '40 s' }],
  bike: [{ name: 'Kniebeuge', sets: 3, reps: '10' }, { name: 'Bulgarische Kniebeuge', sets: 3, reps: '8 je Bein' }, { name: 'Kreuzheben einbeinig', sets: 3, reps: '8 je Bein' }, { name: 'Hüftbrücke', sets: 3, reps: '12' }, { name: 'Unterarmstütz', sets: 3, reps: '40 s' }, { name: 'Superman (Rückenstrecker)', sets: 3, reps: '12' }],
  swim: [{ name: 'Liegestütz', sets: 3, reps: '8-12' }, { name: 'Rudern mit Band', sets: 3, reps: '12' }, { name: 'Außenrotation mit Band', sets: 3, reps: '15', note: 'Schulter schützen' }, { name: 'Y-T-W auf dem Bauch', sets: 2, reps: '8' }, { name: 'Unterarmstütz', sets: 3, reps: '40 s' }],
  team: [{ name: 'Kopenhagen-Adduktoren', sets: 3, reps: '20-30 s je Seite', note: 'schützt die Leiste' }, { name: 'Nordic Hamstring (mit Partner oder Fußhalt)', sets: 3, reps: '5' }],
  general: [{ name: 'Kniebeuge', sets: 3, reps: '10' }, { name: 'Liegestütz', sets: 3, reps: '8-12' }, { name: 'Rudern mit Band', sets: 3, reps: '12' }, { name: 'Hüftbrücke', sets: 3, reps: '12' }, { name: 'Unterarmstütz', sets: 3, reps: '40 s' }]
};
/* Kraft nach Körperbereich (Ober-/Unterkörper an festen Tagen) */
const AREA: Record<'lower' | 'upper' | 'core', Exercise[]> = {
  lower: [{ name: 'Kniebeuge', sets: 3, reps: '10' }, { name: 'Ausfallschritte', sets: 3, reps: '8 je Bein' }, { name: 'Hüftbrücke einbeinig', sets: 3, reps: '10 je Bein' }, { name: 'Wadenheben einbeinig', sets: 3, reps: '12 je Bein', note: 'langsam ablassen' }, { name: 'Kopenhagen-Adduktoren', sets: 3, reps: '20-30 s je Seite', note: 'schützt die Leiste' }, { name: 'Nordic Hamstring (mit Fußhalt)', sets: 2, reps: '5' }],
  upper: [{ name: 'Liegestütz', sets: 3, reps: '8-12' }, { name: 'Rudern mit Band oder Kurzhantel', sets: 3, reps: '12' }, { name: 'Klimmzug (mit Band) oder Latzug', sets: 3, reps: '5-8' }, { name: 'Außenrotation mit Band', sets: 3, reps: '15', note: 'Schulter schützen, wichtig fürs Kraulen' }, { name: 'Y-T-W auf dem Bauch', sets: 2, reps: '8' }, { name: 'Unterarmstütz', sets: 3, reps: '40 s' }],
  core: [{ name: 'Unterarmstütz', sets: 3, reps: '40 s' }, { name: 'Seitstütz', sets: 3, reps: '30 s je Seite' }, { name: 'Dead Bug', sets: 3, reps: '10 je Seite' }, { name: 'Superman (Rückenstrecker)', sets: 3, reps: '12' }]
};
export const AREA_LABEL: Record<'lower' | 'upper' | 'core', string> = { lower: 'Unterkörper', upper: 'Oberkörper', core: 'Rumpf' };
export function strengthArea(area: 'lower' | 'upper' | 'core', o: { light?: boolean; knee?: boolean; back?: boolean; shoulder?: boolean; why?: string } = {}): Spec {
  let ex = AREA[area].map(e => ({ ...e }));
  if (o.knee) ex = ex.map(e => /Kniebeuge|Ausfallschritt/.test(e.name) ? { ...e, name: e.name + ' (nur so tief, wie es schmerzfrei geht)' } : e);
  if (o.back) ex = ex.filter(e => !/Kreuzheben|Nordic/.test(e.name));
  if (o.shoulder) ex = ex.filter(e => !/Liegestütz|Y-T-W|Klimmzug/.test(e.name));
  if (o.light) ex = ex.map(e => ({ ...e, sets: Math.max(1, e.sets - 1), note: [e.note, 'leichter als sonst'].filter(Boolean).join(', ') }));
  const sets = ex.reduce((a, e) => a + e.sets, 0);
  const mainMin = Math.max(15, Math.min(40, Math.round(sets * 1.3 / 5) * 5));
  return { sport: 'strength', kind: 'strength', ctx: {}, exercises: ex, why: o.why, area, steps: [S('warm', { min: 5 }), S('main', { min: mainMin })] } as Spec;
}
/* Krafteinheit passend zu den Sportarten. light: Erholungswoche oder Tapering (weniger Sätze). */
export function strengthSession(sports: string[], o: { light?: boolean; minutes?: number; back?: boolean; knee?: boolean; shoulder?: boolean; why?: string; variant?: number } = {}): Spec {
  const pick: Exercise[] = [];
  const add = (f: Focus, n: number) => LIB[f].forEach(e => { if (pick.length < 7 && !pick.some(x => x.name === e.name) && n-- > 0) pick.push({ ...e }); });
  const main = sports.includes('run') ? 'run' : sports.includes('bike') ? 'bike' : sports.includes('swim') ? 'swim' : 'general';
  // Variante A/B: unterschiedliche Reihenfolge, damit zwei Einheiten pro Woche nicht gleich sind
  if (o.variant === 1 && sports.includes('swim')) { add('swim', 3); add(main as Focus, 3); } else { add(main as Focus, 4); if (sports.includes('swim') && main !== 'swim') add('swim', 2); else if (sports.includes('bike') && main !== 'bike') add('bike', 2); }
  if (sports.includes('football')) add('team', 2);
  let ex = pick;
  if (o.knee) ex = ex.map(e => /Kniebeuge|Ausfallschritt/.test(e.name) ? { ...e, name: e.name + ' (nur so tief, wie es schmerzfrei geht)' } : e);
  if (o.back) ex = ex.filter(e => !/Kreuzheben/.test(e.name));
  if (o.shoulder) ex = ex.filter(e => !/Liegestütz|Y-T-W/.test(e.name));
  if (o.light) ex = ex.map(e => ({ ...e, sets: Math.max(1, e.sets - 1), note: [e.note, 'leichter als sonst'].filter(Boolean).join(', ') }));
  const sets = ex.reduce((a, e) => a + e.sets, 0);
  const mainMin = Math.min(o.minutes ? o.minutes - 5 : 50, Math.max(15, Math.round(sets * 1.3 / 5) * 5));
  return { sport: 'strength', kind: 'strength', ctx: {}, exercises: ex, why: o.why, steps: [S('warm', { min: 5 }), S('main', { min: mainMin })] };
}

/* ---------- Tests ---------- */
export function runTest(ctx: PaceCtx): Spec { return { sport: 'run', kind: 'test', title: 'Lauftest 30 min', ctx, why: 'Daraus berechnet die App deine echten Zonen statt der Schätzung.', steps: [S('warm', { min: 15, zone: 1, note: 'mit 3 Steigerungen' }), S('main', { min: 30, zone: 4, note: 'so schnell, wie du es gleichmäßig 30 min halten kannst. Ø-Puls der letzten 20 min = Schwellenpuls, Pace = Schwellen-Pace' }), S('cool', { min: 10, zone: 1 })] }; }
export function bikeTest(ctx: PaceCtx): Spec { return { sport: 'bike', kind: 'test', title: 'Radtest 20 min', ctx, noDistance: true, why: 'Daraus berechnet die App deine echten Zonen statt der Schätzung.', steps: [S('warm', { min: 20, zone: 1, note: 'mit 3 kurzen Antritten' }), S('main', { min: 20, zone: 4, note: 'volle, gleichmäßige Leistung. 95 % der Ø-Leistung = FTP, Ø-Puls ≈ Schwellenpuls' }), S('cool', { min: 10, zone: 1 })] }; }
export function swimTest(ctx: PaceCtx): Spec { return { sport: 'swim', kind: 'test', title: 'Schwimmtest 400/200 m', ctx, why: 'Daraus berechnet die App deine Schwimm-Schwelle (CSS).', steps: [S('warm', { m: 300, zone: 1, mode: 'easy' }), S('main', { reps: 1, m: 400, zone: 4, mode: 'crawl', note: 'so schnell wie gleichmäßig möglich' }), S('main', { reps: 1, m: 200, zone: 4, mode: 'crawl', note: 'nach 5 min Pause, wieder voll' }), S('cool', { m: 100, zone: 1, mode: 'easy' })] }; }
