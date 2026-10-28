/* Einheiten aus Bausteinen: Titel, Dauer, Distanz und Beschreibung kommen aus DENSELBEN Zahlen (Auftrag 4 A6/C2).
   Eine Einheit ist eine Liste von Schritten (Aufwärmen, Hauptteil, Ausklang). Daraus werden Minuten und Kilometer
   berechnet und der Text geschrieben: was genau, wie hart (Zonen der Person, Pace, Gefühl), warum, worauf achten.
   Die Bauanleitung (spec) bleibt an der Einheit, damit Anpassungen (z. B. Umfang −10 %) Text und Zahlen gemeinsam ändern.
   Keine Abhängigkeit von core.ts (core importiert dieses Modul). */
import { HR_ZONES, POWER_ZONES } from './sports';
import { speedRange, SPEED_HINT } from './bikespeed';
import { purposeOf } from './sessiontypes';

export type WSport = 'run' | 'bike' | 'swim' | 'strength' | 'football';
export type StrokeMode = 'crawl' | 'breast' | 'drill' | 'kick' | 'mixed' | 'easy' | 'pull';
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
  /** Schwimmen (Auftrag 14): Hilfsmittel dieser Serie, Technikübung (Schlüssel in DRILLS), Fokus */
  gear?: string[]; drill?: string; focus?: string;
}
export interface Exercise { name: string; sets: number; reps: string; note?: string }
/** Alles, was zum Neuberechnen nötig ist (ohne Profil) */
export interface PaceCtx {
  runThrSec?: number | null; lthrRun?: number | null; lthrBike?: number | null;
  bikeKmh?: number | null; ftp?: number | null; css?: number | null; breast100?: number | null;
  indoor?: boolean; bikeName?: string | null;
  /** Tempo-Zonen Rad anzeigen (Auftrag 12, Standard ja) */
  speedZones?: boolean;
  /** Auftrag 17: tatsächliche Meter pro Minute (mit Pausen) aus den eigenen Schwimmeinheiten; braucht jemand mehr Pause als das Modell,
      wird die Pause länger gerechnet und es werden weniger Meter in derselben Zeit */
  swimMPerMin?: number | null;
  /** Beckenlänge (Auftrag 11): 25 m (auch „beides“) oder 50 m. Stücke gehen immer auf, man endet am Startrand */
  pool?: 25 | 50 | null;
  /** Schwimm-Hilfsmittel, die die Person hat (Auftrag 14): board, buoy, fins, paddles, snorkel. Nur diese werden eingeplant. */
  gear?: string[] | null;
  /** Kraul-Tempo pro 100 m ohne CSS (aus dem Kraul-Check), sonst etwa wie Brust */
  crawl100?: number | null;
}
export type Kind = 'easy' | 'long' | 'intervals' | 'tempo' | 'threshold' | 'steady' | 'runwalk' | 'swimlearn' | 'technique' | 'css' | 'endurance' | 'strength' | 'team' | 'game' | 'test' | 'race' | 'brick' | 'recovery'
  | 'sweetspot' | 'overunder' | 'vo2' | 'racepace' | 'hills' | 'fartlek' | 'longq' | 'force' | 'openwater' | 'climb' | 'progression';
export interface Spec {
  sport: WSport; kind: Kind;
  steps: Step[];
  exercises?: Exercise[];
  ctx: PaceCtx;
  /** fester Titel (Wettkampf, Teamsport), sonst aus den Zahlen */
  title?: string;
  why?: string; tip?: string;
  /** Lernstufe (Kraul lernen, Lauf-Geh-Wechsel) */
  stage?: { ladder: 'swim' | 'swimBreast' | 'runwalk'; n: number; breast?: boolean; pull?: number | null } | null;
  /** ohne Distanz (Rolle, Kraft, Teamsport) */
  noDistance?: boolean;
  /** Kraft: Körperbereich */
  area?: 'lower' | 'upper' | 'core';
  /** wann (z. B. „Morgens vor der Schule, höchstens 40 min.“) */
  when?: string;
  /** Lernstufe mit Brust-Ausdauer bis zu dieser Dauer aufgefüllt (bleibt beim Stufenwechsel) */
  fillMin?: number;
  /** Variante der Woche (z. B. „hügelig“, „Kadenz“, „Pull Buoy“): steht im Titel, damit sich Wochen unterscheiden */
  variant?: string;
  /** Auftrag 18: kurze Hinweise (Verpflegung, Hitze, Technik …), je eine Zeile */
  notes?: string[];
  /** Auftrag 19: Form aus der Einheiten-Bibliothek (shared/workoutlib.ts) und Stufe der Leiter; label z. B. „Halbmarathon-Tempo“ */
  lib?: { key: string; stage: number; label?: string } | null;
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
/* Pace-Bereich (s/km, schnell … langsam) einer Zone, für Bewertungen (Auftrag 12) */
export function runPaceRange(ctx: PaceCtx, zone: number): [number, number] { const thr = ctx.runThrSec || 390; const f = RUN_F[zone] || RUN_F[2]; return [Math.round(thr * f[0]), Math.round(thr * f[1])]; }
export function bikeKmh(ctx: PaceCtx, zone: number): number { return (ctx.bikeKmh || 24) * (BIKE_F[zone] || BIKE_F[2]); }
/* Persönliche Pace je Lage (s/100 m, Auftrag 14): Kraul aus der Schwimm-Schwelle (CSS), ohne gemessene CSS etwa wie Brust;
   Brust aus der Brust-Zeit; Technikübungen 25 s langsamer als Kraul; Beinschlag mit Brett deutlich langsamer (mindestens 3:00/100 m),
   mit Flossen schneller; Pull Buoy wie Kraul, mit Paddles etwas schneller. */
export function swimPace(ctx: PaceCtx, zone: number, mode: StrokeMode = 'crawl', gear: string[] = []): number {
  const breast = ctx.breast100 || 175;
  const base = ctx.crawl100 && ctx.crawl100 > 60 ? ctx.crawl100 : Math.max(breast, 170);
  const noCss = base + (SWIM_PLUS[zone] ?? 8) - 8;
  const crawl2 = ctx.css ? ctx.css + 8 : base;
  if (mode === 'breast') return breast + (zone <= 1 ? 10 : 0);
  if (mode === 'kick') return gear.includes('fins') ? crawl2 + 10 : Math.max(crawl2 + 60, 180);
  if (mode === 'drill') return Math.max(crawl2 + 25, 130) - (gear.includes('fins') ? 15 : 0);
  if (mode === 'easy' || mode === 'mixed') return ctx.css ? ctx.css + 15 : breast;
  if (mode === 'pull') return (ctx.css ? ctx.css + (SWIM_PLUS[zone] ?? 8) + 3 : noCss + 3) - (gear.includes('paddles') ? 4 : 0);
  return ctx.css ? ctx.css + (SWIM_PLUS[zone] ?? 8) : noCss;
}
/* Technikübungen (Auftrag 14): Name und ein Satz, was man macht und warum */
export const DRILLS: Record<string, { name: string; what: string; focus: string }> = {
  blubber: { name: 'Ausatmen ins Wasser', what: 'Unter Wasser durch Mund und Nase ausatmen (Blubbern), seitlich kurz einatmen – die Grundlage jeder Kraul-Atmung.', focus: 'ganz ausatmen' },
  glide: { name: 'Gleiten in Bauchlage', what: 'Vom Rand abstoßen und gestreckt gleiten, Blick zum Boden – für eine flache, ruhige Wasserlage.', focus: 'Körper lang und flach' },
  kick: { name: 'Kraul-Beinschlag', what: 'Lockere, fast gestreckte Beine, der Schlag kommt aus der Hüfte, nicht aus dem Knie – hebt die Beine an die Oberfläche.', focus: 'Beine aus der Hüfte' },
  sidekick: { name: 'Seitlage-Beinschlag', what: 'Auf der Seite liegen, unterer Arm vorn, zum Atmen nur den Kopf drehen – übt Wasserlage und Seitatmung ohne Hilfsmittel.', focus: 'Kopf ruhig, nur drehen' },
  catchup: { name: 'Abschlagschwimmen', what: 'Eine Hand wartet vorn, bis die andere ankommt – macht den Zug lang und die Wasserlage ruhig.', focus: 'lange Arme, eine Hand wartet vorn' },
  fingertip: { name: 'Fingerspitzen-Schleifen', what: 'Beim Vorbringen ziehen die Fingerspitzen locker über das Wasser – hält den Ellbogen hoch und die Schulter entspannt.', focus: 'Ellbogen hoch, Schulter locker' },
  onearm: { name: 'Einarmig kraulen', what: 'Ein Arm bleibt vorn, der andere zieht, nach jeder Bahn wechseln – übt den Zug und das Rollen um die Längsachse.', focus: 'Hüfte dreht mit' },
  fist: { name: 'Faustschwimmen', what: 'Mit geschlossener Faust kraulen – du spürst, wie viel der Unterarm zieht; danach greift die offene Hand besser.', focus: 'mit dem Unterarm ziehen' },
  count: { name: 'Züge zählen', what: 'Züge pro Bahn zählen und mit jeder Bahn einen weniger versuchen – für einen langen, effizienten Zug.', focus: 'ein Zug weniger pro Bahn' },
  breath3: { name: 'Dreier-Atmung', what: 'Alle 3 Züge atmen, abwechselnd links und rechts – für einen gleichmäßigen Zug und Orientierung im Freiwasser.', focus: 'beide Seiten gleich' },
  six36: { name: '6-3-6', what: '6 Beinschläge in Seitlage, 3 Kraulzüge, 6 Beinschläge auf der anderen Seite – übt Rollen, Wasserlage und Atmung nach beiden Seiten.', focus: 'ruhig rollen, Kopf bleibt unten' },
  scull: { name: 'Wriggen', what: 'Hände vor dem Kopf ziehen kleine Achten, die Beine ruhig – für Wassergefühl beim Greifen.', focus: 'Druck an den Handflächen spüren' }
};
const DRILL_ROT = ['catchup', 'fingertip', 'sidekick', 'onearm', 'fist', 'count', 'breath3', 'scull'];
/* Übung für eine Technik-Serie: aus dem Schritt, sonst aus der Notiz, sonst im Wechsel nach Woche */
export function drillOf(s: Step, k = 0): string {
  if (s.drill && DRILLS[s.drill]) return s.drill;
  if (s.mode === 'kick') return 'kick';
  const n = (s.note || '').toLowerCase();
  if (/blubber|ausatmen/.test(n)) return 'blubber';
  if (/gleit/.test(n)) return 'glide';
  if (/abschlag|catch/.test(n)) return 'catchup';
  if (/fingerspitz/.test(n)) return 'fingertip';
  if (/seitlage/.test(n)) return 'sidekick';
  return DRILL_ROT[k % DRILL_ROT.length];
}
const mmss = (sec: number) => { sec = Math.round(sec); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
const de1 = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',');
const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/* ---------- Summen ---------- */
export function stepMinutes(spec: Spec, s: Step): number {
  const reps = s.reps || 1;
  if (spec.sport === 'swim') {
    const p = swimPace(spec.ctx, s.zone || 2, s.mode || 'crawl', s.gear || []);
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
/* Schwimmen ehrlich gerechnet (Auftrag 14): Meter × persönliche Pace je Lage, Pausen zwischen den Wiederholungen und
   30 s je Serienwechsel (Brett holen, kurz durchatmen). */
export const SWIM_SET_CHANGE_SEC = 30;
export function swimSums(spec: Spec): { meters: number; swimMin: number; restMin: number; min: number } {
  let swim = 0, rest = 0, m = 0;
  for (const s of spec.steps) {
    const reps = s.reps || 1;
    m += reps * (s.m || 0);
    swim += reps * (s.m || 0) / 100 * swimPace(spec.ctx, s.zone || 2, s.mode || 'crawl', s.gear || []) / 60;
    rest += Math.max(0, reps - 1) * (s.restSec || 0) / 60;
  }
  rest += Math.max(0, spec.steps.filter(s => s.m).length - 1) * SWIM_SET_CHANGE_SEC / 60;
  // eigene Pace mit Pausen (Auftrag 17): wer bisher mehr Pause brauchte, bekommt etwas mehr Pause. Auftrag 20: höchstens ein Viertel mehr
  // als die geplanten Pausen plus 2 min (vorher bis zum 2,5-Fachen: 1.200 m standen dann mit 75 min im Plan statt etwa 50).
  const real = spec.ctx && spec.ctx.swimMPerMin && spec.ctx.swimMPerMin > 0 ? m / spec.ctx.swimMPerMin : 0;
  if (real > swim + rest) rest = Math.min(real - swim, rest * 1.25 + 2);
  return { meters: m, swimMin: swim, restMin: rest, min: swim + rest };
}
export function totals(spec: Spec): { min: number; km: number | null } {
  if (spec.sport === 'strength') { const m = spec.steps.reduce((a, s) => a + stepMinutes(spec, s), 0); return { min: Math.round(m), km: null }; }
  if (spec.sport === 'swim') { const S = swimSums(spec); return { min: Math.round(S.min), km: Math.round(S.meters) / 1000 }; }
  const min = spec.steps.reduce((a, s) => a + stepMinutes(spec, s), 0);
  const km = spec.noDistance ? null : spec.steps.reduce((a, s) => a + stepKm(spec, s), 0);
  return { min: Math.round(min), km: km == null ? null : Math.round(km * 10) / 10 };
}

/* ---------- Text ---------- */
function hrRange(lthr: number, zone: number): string {
  const z = HR_ZONES[zone - 1];
  if (z.low === 0) return `Puls unter ${Math.round(lthr * z.high / 100)}`;
  if (z.high >= 999) return `Puls über ${Math.round(lthr * z.low / 100)}`;
  return `Puls ${Math.round(lthr * z.low / 100)}–${Math.round(lthr * z.high / 100)}`;
}
export function intensity(spec: Spec, zone: number, mode?: StrokeMode): string {
  const c = spec.ctx;
  const parts: string[] = [];
  if (spec.sport === 'run') {
    const thr = c.runThrSec || 390; const f = RUN_F[zone] || RUN_F[2];
    parts.push(`${mmss(thr * f[0])}–${mmss(thr * f[1])}/km`);
    if (c.lthrRun) parts.push(hrRange(c.lthrRun, zone));
  } else if (spec.sport === 'bike') {
    if (c.ftp) { const z = POWER_ZONES[zone - 1]; parts.push(`${Math.round(c.ftp * z.low / 100)}–${z.high >= 999 ? Math.round(c.ftp * 1.2) : Math.round(c.ftp * z.high / 100)} W`); }
    if (c.lthrBike) parts.push(hrRange(c.lthrBike, zone));
    // Auftrag 12: Tempo als Anhalt (flach, ohne Wind), drinnen die virtuelle Geschwindigkeit; Puls und Watt bleiben die Vorgabe
    if (c.bikeKmh && c.speedZones !== false) parts.push(`ca. ${speedRange(c.bikeKmh, zone)}${c.indoor ? ' (virtuell)' : ' flach'}`);
  } else if (spec.sport === 'swim') {
    parts.push(`etwa ${mmss(swimPace(c, zone, mode))}/100 m`);
  }
  return `Z${zone}${parts.length ? ': ' + parts.join(', ') : ''}`;
}
const STROKE: Record<StrokeMode, string> = { crawl: 'Kraul', breast: 'Brust', drill: 'Kraul-Technik', kick: 'Kraul-Beinschlag', mixed: 'Lage nach Wahl', easy: 'locker, Lage nach Wahl', pull: 'Kraul mit Pull Buoy' };
export const GEAR_TXT: Record<string, string> = { board: 'Kickbrett', buoy: 'Pull Buoy', fins: 'Flossen', paddles: 'Paddles', snorkel: 'Frontschnorchel' };
/* Auftrag 21: welche Hilfsmittel eine Schwimmeinheit braucht (aus den Bausteinen, nur was die Person hat), für Titel und Karte */
export function swimAids(s: any): string[] {
  const spec = s && s.spec; if (!s || s.sport !== 'swim' || !spec || !Array.isArray(spec.steps)) return [];
  const have = new Set<string>((spec.ctx && spec.ctx.gear) || []);
  const used = new Set<string>();
  spec.steps.forEach((x: any) => { (x.gear || []).forEach((g: string) => used.add(g)); if (x.mode === 'pull') used.add('buoy'); if (x.mode === 'kick' && have.has('board') && !(x.gear || []).includes('fins')) used.add('board'); });
  return ['board', 'buoy', 'fins', 'paddles', 'snorkel'].filter(g => used.has(g) && have.has(g));
}
export const SWIM_GEAR = ['board', 'buoy', 'fins', 'paddles', 'snorkel'] as const;
/* Fokus je Serie: aus der Übung, sonst nach Lage und Zone */
function swimFocus(spec: Spec, s: Step): string {
  if (s.focus) return s.focus;
  if (s.mode === 'drill' || s.mode === 'kick') return DRILLS[drillOf(s)].focus;
  if (s.mode === 'pull') return 'lange Züge, Beine ruhig';
  if (s.mode === 'breast') return (s.zone || 2) >= 3 ? 'zügig, Gesicht ins Wasser' : 'ruhig, Gesicht ins Wasser, lang gleiten';
  if (s.mode === 'easy' || s.mode === 'mixed') return 'ruhig, Atmung beruhigen';
  const z = s.zone || 2;
  return z >= 4 ? 'jede Wiederholung gleich schnell' : z === 3 ? 'zügig, Technik sauber halten' : (s.m || 0) <= 50 ? 'ruhig ausatmen, nach jeder Strecke durchatmen' : 'gleichmäßig, lange Züge';
}
/* Eine Zeile je Serie: „4×25 m Kraul-Beinschlag mit Kickbrett, 30 s Pause – Fokus: Beine aus der Hüfte“ */
export function stepText(spec: Spec, s: Step): string {
  const reps = s.reps || 1; const z = s.zone || 2;
  if (spec.sport === 'swim') {
    const gear = (s.gear || []).filter(g => !(s.mode === 'pull' && g === 'buoy'));
    const drill = s.mode === 'drill' ? DRILLS[drillOf(s)].name : s.mode === 'kick' && !(s.gear || []).includes('board') && !(s.gear || []).includes('fins') ? 'in Seitlage, unterer Arm vorn' : '';
    const lage = s.mode === 'drill' ? `Kraul-Technik: ${drill}` : `${STROKE[s.mode || 'crawl']}${drill ? ' ' + drill : ''}`;
    const pace = s.mode === 'crawl' || s.mode === 'breast' || s.mode === 'pull' ? ` (${intensity(spec, z, s.mode)})` : '';
    const rest = reps > 1 && s.restSec ? `, ${s.restSec} s Pause${spec.kind === 'openwater' ? ' (locker Brust oder auf der Stelle)' : ''}` : '';
    const extra = s.note && !(s.mode === 'drill' || s.mode === 'kick') ? ` (${s.note})` : '';
    return `${reps > 1 ? `${reps}×${s.m} m` : `${s.m} m`} ${lage}${gear.length ? ' mit ' + gear.map(g => GEAR_TXT[g] || g).join(' und ') : ''}${pace}${rest}${extra} – Fokus: ${swimFocus(spec, s)}`;
  }
  if (s.walkOnly) return `${s.min} min ${s.note || 'zügig gehen'}`;
  if (s.walkMin) return `${reps}× (${s.min} min locker laufen + ${s.walkMin} min zügig gehen), laufen ${intensity(spec, z)}${s.note ? ', ' + s.note : ''}`;
  const len = `${reps > 1 ? `${reps}×${minTxt(s.min)}` : minTxt(s.min)}`;
  const rest = reps > 1 && s.restMin ? `, dazwischen ${minTxt(s.restMin)} ${spec.sport === 'run' ? (s.restMin < 1 ? 'locker zurück' : 'locker traben') : 'locker rollen'}` : '';
  return `${len} ${ZNAME[z]} (${intensity(spec, z)})${rest}${s.note ? ', ' + s.note : ''}`;
}
/* Teile einer Schwimmeinheit: Technik = Übungen und Beinschlag im Hauptteil (auch Wassergewöhnung) */
export function swimParts(spec: Spec): { part: 'warm' | 'tech' | 'main' | 'cool'; label: string; steps: Step[] }[] {
  const isTech = (s: Step) => s.part === 'main' && (s.mode === 'drill' || s.mode === 'kick');
  const out = [
    { part: 'warm' as const, label: 'Einschwimmen', steps: spec.steps.filter(s => s.part === 'warm') },
    { part: 'tech' as const, label: 'Technik', steps: spec.steps.filter(isTech) },
    { part: 'main' as const, label: 'Hauptteil', steps: spec.steps.filter(s => s.part === 'main' && !isTech(s)) },
    { part: 'cool' as const, label: 'Ausschwimmen', steps: spec.steps.filter(s => s.part === 'cool') }
  ];
  return out.filter(p => p.steps.length);
}
export function swimDrillNotes(spec: Spec): string[] {
  const keys = [...new Set(spec.steps.filter(s => s.mode === 'drill' || s.mode === 'kick').map(s => drillOf(s)))];
  return keys.map(k => `${DRILLS[k].name}: ${DRILLS[k].what}`);
}
export function swimSumLine(spec: Spec): string {
  const S = swimSums(spec);
  return `Summe: ${thousands(S.meters)} m · ca. ${Math.round(S.min)} min (schwimmen ${Math.round(S.swimMin)} min, Pausen ${Math.round(S.restMin)} min)`;
}
/* „0.25 min“ → „15 s“, „1.5 min“ → „1,5 min“ */
export const minTxt = (m: number | undefined) => { const v = m || 0; return v > 0 && v < 1 ? `${Math.round(v * 60)} s` : `${String(Math.round(v * 10) / 10).replace('.', ',')} min`; };
const PART: Record<Step['part'], string> = { warm: 'Aufwärmen', main: 'Hauptteil', cool: 'Ausklang' };

/* Auftrag 19: eine kurze Zeile, was man tun soll (Plan-Tab, aufgeklappter Tag), z. B.
   „15 min einlaufen · 3×8 min an der Schwelle, 2 min locker dazwischen · 10 min auslaufen“ */
const ZWORD: Record<number, string> = { 1: 'ganz locker', 2: 'locker', 3: 'zügig', 4: 'an der Schwelle', 5: 'sehr hart' };
const SWIM_WORD: Record<string, string> = { drill: 'Technik-Übungen', kick: 'Beinschlag', breast: 'Brust', pull: 'Kraul mit Pull Buoy', easy: 'locker', crawl: 'Kraul' };
export function shortPlan(spec: Spec | null | undefined): string {
  if (!spec || !Array.isArray(spec.steps)) return '';
  if (spec.sport === 'strength') { const ex = (spec.exercises || []).map(e => e.name); return ex.length ? ex.slice(0, 4).join(', ') + (ex.length > 4 ? ' …' : '') : ''; }
  if (spec.sport === 'swim') {
    const main = spec.steps.filter(s => s.part === 'main').map(s => {
      const z = s.zone || 2; const hard = z >= 3 && s.mode !== 'drill' && s.mode !== 'kick';
      return `${(s.reps || 1) > 1 ? `${s.reps}×${s.m} m` : `${s.m} m`} ${SWIM_WORD[s.mode || 'crawl'] || 'Kraul'}${hard ? ' ' + ZWORD[z] : ''}`;
    });
    return [`${thousands(swimSums(spec).meters)} m`, ...main].join(' · ');
  }
  const run = spec.sport === 'run';
  return spec.steps.map(s => {
    const reps = s.reps || 1; const z = s.zone || 2;
    if (s.part === 'warm') return `${minTxt(s.min)} ${run ? 'einlaufen' : 'einrollen'}`;
    if (s.part === 'cool') return `${minTxt(s.min)} ${run ? 'auslaufen' : 'ausrollen'}`;
    if (s.walkOnly) return `${minTxt(s.min)} gehen`;
    if (s.walkMin) return `${reps}× (${minTxt(s.min)} laufen + ${minTxt(s.walkMin)} gehen)`;
    const rest = reps > 1 && s.restMin ? `, ${minTxt(s.restMin)} locker dazwischen` : '';
    return `${reps > 1 ? `${reps}×${minTxt(s.min)}` : minTxt(s.min)} ${ZWORD[z] || 'locker'}${rest}`;
  }).join(' · ');
}

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
  } else if (spec.sport === 'swim') {
    // Auftrag 14: Liste Einschwimmen, Technik, Hauptteil, Ausschwimmen; Übungen erklärt; Summe Meter und Dauer
    for (const p of swimParts(spec)) { L.push(`${p.label}:`); p.steps.forEach(s => L.push('• ' + stepText(spec, s))); }
    const ex = swimDrillNotes(spec);
    if (ex.length) { L.push('Übungen:'); ex.forEach(x => L.push('• ' + x)); }
    L.push(swimSumLine(spec));
    const zmax = Math.max(...spec.steps.filter(s => s.part === 'main').map(s => s.zone || 2), 1);
    L.push(`Wie hart: ${FEEL[zmax]}.`);
  } else {
    for (const part of ['warm', 'main', 'cool'] as const) {
      const steps = spec.steps.filter(s => s.part === part);
      if (steps.length) L.push(`${PART[part]}: ${steps.map(s => stepText(spec, s)).join('; dann ')}`);
    }
    const t = totals(spec);
    L.push(`Gesamt: ${t.min} min${t.km ? `, ca. ${de1(t.km)} km` : ''}`);
    const zmax = Math.max(...spec.steps.filter(s => s.part === 'main').map(s => s.zone || 2), 1);
    L.push(`Wie hart: ${FEEL[zmax]}.`);
    if (spec.sport === 'bike' && spec.ctx.bikeKmh && spec.ctx.speedZones !== false && !spec.ctx.indoor) L.push(SPEED_HINT);
  }
  // Auftrag 17: jede Einheit hat einen Satz „Warum“ (sonst der Zweck aus der zentralen Liste der Einheitstypen)
  const why = spec.why || (spec.sport !== 'football' ? purposeOf({ sport: spec.sport, spec, title: spec.title || '', area: spec.area, stage: spec.stage }) : null);
  if (why) L.push(`Warum: ${why}`);
  if (spec.tip) L.push(`Achte auf: ${spec.tip}`);
  (spec.notes || []).forEach(n => L.push(n));
  // Auftrag 15: Fachbegriffe (Sweet Spot, Schwelle, CSS, VO2max …) mit kurzer Erklärung
  return L.join('\n');
}
/* Auftrag 19: Titel der Formen aus der Einheiten-Bibliothek (klar und einheitlich, Zahlen aus den Schritten) */
const secTxt = (m: number | undefined) => { const v = m || 0; return v < 1 ? `${Math.round(v * 60)} s` : minTxt(v); };
function libTitle(spec: Spec, min: number, main: Step[], where: string): string | null {
  const k = spec.lib!.key; const q = main.find(x => (x.zone || 0) >= 3 && (x.reps || 1) > 1) || main.find(x => (x.zone || 0) >= 3) || main[0] || ({} as Step);
  const n = q.reps || 1; const dist = (q.note || '').match(/^(\d+) m\b/);
  const piece = dist ? `${dist[1]} m` : secTxt(q.min);
  switch (k) {
    case 'run.strides': return `Lockerer Lauf ${min} min mit Steigerungen`;
    case 'run.abc': return `Lockerer Lauf ${min} min mit Lauf-ABC`;
    case 'run.hillreps': return `Berg-Intervalle ${n}×${piece}`;
    case 'run.longhills': return `Lange Hügel ${n}×${piece}`;
    case 'run.fartlek': return `Tempowechsel-Lauf ${n}×${piece} zügig`;
    case 'run.progression': return `Progressionslauf ${min} min`;
    case 'run.tempo': return `Tempodauerlauf ${minTxt(q.min)} an der Schwelle`;
    case 'run.threshold': return n > 1 ? `Schwellen-Intervalle ${n}×${piece}` : `Tempodauerlauf ${minTxt(q.min)} an der Schwelle`;
    case 'run.vo2': return `Lauf-Intervalle ${n}×${piece} sehr hart`;
    case 'run.pyramid': return `Lauf-Pyramide ${main.filter(x => (x.zone || 0) >= 4).map(x => Math.round(x.min || 0)).join('-')} min`;
    case 'run.3030': return `Lauf-Intervalle ${n}×30 s schnell (30/30)`;
    case 'run.speed': return `Schnelligkeit ${n}×${piece}`;
    case 'run.racepace': return `${n > 1 ? `Lauf-Intervalle ${n}×${piece}` : `Lauf ${piece}`} im ${spec.lib!.label || 'Wettkampftempo'}`;
    case 'run.longfinish': return `Langer Lauf ${min} min mit ${minTxt(q.min)} Endbeschleunigung`;
    case 'bike.cadence': return `Lockere Ausfahrt ${min} min mit Kadenz-Übungen${where}`;
    case 'bike.sprints': return `Lockere Ausfahrt ${min} min mit ${n} Sprints${where}`;
    case 'bike.3015': return `Rad-Intervalle ${main.filter(x => (x.zone || 0) >= 5).length}×${n}×30/15 s${where}`;
    case 'bike.tempolong': return `Rad im Renntempo ${n}×${minTxt(q.min)}${where}`;
    case 'bike.racepaceblocks': return spec.kind === 'longq' ? `Lange Ausfahrt ${min} min mit ${n > 1 ? `${n}×${minTxt(q.min)}` : minTxt(q.min)} im Renntempo${where}` : `Rad im Renntempo ${n > 1 ? `${n}×${minTxt(q.min)}` : minTxt(q.min)}${where}`;
    case 'bike.tt': return `Zeitfahr-Simulation ${minTxt(q.min)}${where}`;
    case 'bike.morning': return `Lockeres Rad am Morgen ${min} min${where}`;
    case 'strength.full': return `Kraft Ganzkörper ${min} min`;
    default: return null;
  }
}
export function title(spec: Spec): string {
  if (spec.title) return spec.title;
  const t = totals(spec);
  const main = spec.steps.filter(s => s.part === 'main');
  const m0 = main[0] || ({} as Step);
  const where = spec.sport === 'bike' && spec.ctx.indoor ? ' (Rolle)' : spec.sport === 'bike' && spec.ctx.bikeName ? ` (${spec.ctx.bikeName})` : '';
  if (spec.lib) { const lt = libTitle(spec, t.min, main, where); if (lt) return lt; }
  switch (spec.kind) {
    case 'runwalk': return `Lauf-Geh-Wechsel ${m0.reps}× (${m0.min} + ${m0.walkMin} min)`;
    case 'swimlearn': return spec.stage && spec.stage.ladder === 'swimBreast' ? `Schwimmen: Brust und Kraul-Technik${spec.variant ? ' · ' + spec.variant : ''} (${thousands((t.km || 0) * 1000)} m)` : `Schwimmen: Kraul lernen, Stufe ${(spec.stage?.n ?? 0) + 1}: ${SWIM_LADDER[Math.min(spec.stage?.n ?? 0, SWIM_LADDER.length - 1)].label}${spec.variant ? ' · ' + spec.variant : ''} (${thousands((t.km || 0) * 1000)} m)`;
    // Auftrag 11: verständliche Titel für alle, die schon kraulen („Kraul lernen“ nur für echte Anfänger)
    case 'technique': return `Schwimmen: Technik + Ausdauer${spec.variant && !/^Technik/.test(spec.variant) ? ' · ' + spec.variant : ''} (${thousands((t.km || 0) * 1000)} m)`;
    case 'css': { const q = main.find(x => (x.zone || 0) >= 3 && (x.mode === 'crawl' || x.mode === 'pull')) || m0; return `Schwimmen: Intervalle ${q.reps}×${q.m} m${spec.ctx.css && (q.zone || 0) >= 4 && (q.m || 0) >= 100 ? ' (CSS)' : ''}${spec.variant ? ' · ' + spec.variant : ''}`; }
    case 'endurance': return spec.sport === 'swim' ? `Schwimmen: Grundlage${spec.variant ? ' · ' + spec.variant : ''} (${thousands((t.km || 0) * 1000)} m)` : `Ausdauer ${t.min} min`;
    case 'openwater': return `Freiwasser: Sichten, Orientierung, Start (${thousands((t.km || 0) * 1000)} m)`;
    case 'intervals': return `${spec.sport === 'run' ? 'Lauf' : 'Rad'}-Intervalle ${m0.reps}×${m0.min} min${where}`;
    // Auftrag 17: strukturierte Intervalle heißen „Intervalle“ (Namen aus shared/sessiontypes.ts)
    case 'threshold': return m0.reps && m0.reps > 1 ? `${spec.sport === 'run' ? 'Lauf' : 'Rad'}-Intervalle ${m0.reps}×${m0.min} min an der Schwelle${where}` : `${spec.sport === 'run' ? 'Schwellenlauf' : 'Rad an der Schwelle'} ${m0.min} min${where}`;
    case 'tempo': return m0.reps && m0.reps > 1 ? `${spec.sport === 'run' ? 'Lauf' : 'Rad'}-Intervalle ${m0.reps}×${m0.min} min zügig (Tempo)${where}` : `${spec.sport === 'run' ? 'Tempolauf' : 'Rad Tempo'} ${m0.min} min${where}`;
    // kurze „lange“ Einheiten heißen nicht „lang“ (Auftrag 11: „Lange Ausfahrt 35 min“, „Langer Lauf 30 min“)
    // „Locker“ nur, wenn auch alles locker ist (Auftrag 17: kein „locker“ mit Zone-3-Blöcken)
    case 'long': { const q = main.some(x => (x.zone || 2) >= 3); return (spec.sport === 'run' ? `${t.min >= 50 ? 'Langer' : q ? '' : 'Lockerer'} Lauf ${t.min} min`.trim() : `${t.min >= 75 ? 'Lange' : q ? '' : 'Lockere'} Ausfahrt ${t.min} min${where}`.trim()).replace(/^(w)/, c => c.toUpperCase()) + (spec.variant ? `, ${spec.variant}` : ''); }
    case 'sweetspot': return `Rad-Intervalle ${m0.reps}×${m0.min} min Sweet Spot${where}`;
    case 'overunder': return `Rad-Intervalle ${m0.reps}×${m0.min} min Over-Unders${where}`;
    case 'vo2': return `${spec.sport === 'run' ? 'Lauf' : 'Rad'}-Intervalle ${m0.reps}×${m0.min} min sehr hart${where}`;
    case 'force': return `Rad-Intervalle ${m0.reps}×${m0.min} min Kraftausdauer${where}`;
    case 'climb': return `Rad-Intervalle ${m0.reps}×${m0.min} min am Anstieg${where}`;
    case 'racepace': return m0.reps && m0.reps > 1 ? `${spec.sport === 'run' ? 'Lauf' : 'Rad'}-Intervalle ${m0.reps}×${m0.min} min im Wettkampftempo${where}` : `${spec.sport === 'run' ? 'Lauf' : 'Rad'} ${m0.min} min im Wettkampftempo${where}`;
    case 'hills': return `Lockerer Lauf ${t.min} min mit Hügelsprints`;
    case 'progression': return `Progressionslauf ${t.min} min`;
    case 'fartlek': { const q = main.find(s => (s.reps || 0) > 1) || m0; return `Lauf-Intervalle ${q.reps}×${q.min} min zügig`; }
    case 'longq': { const q = spec.steps.find(x => x.part === 'main' && (x.zone || 2) >= 3) || m0; if (spec.sport === 'bike') return `${t.min >= 75 ? 'Lange Ausfahrt' : 'Ausfahrt'} ${t.min} min mit ${q.reps && q.reps > 1 ? `${q.reps}×${q.min}` : q.min} min ${(q.zone || 3) >= 5 ? 'VO2max' : (q.zone || 3) >= 4 ? 'Schwelle' : 'Sweet Spot'}${where}`; return `${t.min >= 60 ? 'Langer Lauf' : 'Lauf'} ${t.min} min mit ${q.reps && q.reps > 1 ? `${q.reps}×${q.min}` : q.min} min ${/^(Tempo|Schwelle|VO2max|\d+-km-Tempo|Halbmarathon-Tempo|Marathon-Tempo)$/.test(q.note || '') ? q.note : (q.zone || 3) >= 4 ? 'Schwelle' : 'Wettkampftempo'}`; }
    case 'brick': return `Koppeltraining Rad + Lauf ${t.min} min`;
    case 'recovery': return spec.sport === 'run' ? `Lockerer Lauf ${t.min} min` : `Lockere Runde ${t.min} min${where}`;
    case 'test': return spec.title || 'Test';
    case 'strength': return spec.area ? `Kraft ${AREA_LABEL[spec.area]} ${t.min} min` : `Kraft ${t.min} min`;
    default: return (spec.sport === 'run' ? `Lockerer Lauf ${t.min} min${/Steigerung/.test(JSON.stringify(spec.steps)) ? ' mit Steigerungen' : ''}` : spec.sport === 'bike' ? `Lockere Ausfahrt ${t.min} min${where}` : `${t.min} min`) + (spec.variant ? `, ${spec.variant}` : '');
  }
}
/* Zone der Einheit (Auftrag 14): kurze Stücke (Hügelsprints, Steigerungen, Fahrtspiel bis 1 min, zusammen unter 20 % des Hauptteils)
   ändern die Grundzone nicht – „Lockerer Lauf mit Hügelsprints“ ist Zone 2. Sonst gilt die höchste Zone des Hauptteils. */
export function mainZone(spec: Spec): number {
  const main = spec.steps.filter(s => s.part === 'main');
  const zmax = Math.max(...main.map(s => s.zone || 0), 0);
  if (!zmax || spec.sport === 'swim') return zmax;
  const dur = (s: Step) => (s.reps || 1) * (s.min || 0);
  const total = main.reduce((a, s) => a + dur(s), 0);
  const hard = main.filter(s => (s.zone || 0) >= 3);
  const shortPieces = hard.length > 0 && hard.every(s => (s.min || 0) <= 1) && hard.reduce((a, s) => a + dur(s), 0) < 0.2 * total;
  if (!shortPieces) return zmax;
  const base = main.filter(s => (s.zone || 0) < 3);
  return base.length ? Math.max(...base.map(s => s.zone || 2)) : zmax;
}
const zoneLabel = (spec: Spec) => { const z = mainZone(spec); return z ? `Zone ${z}` : undefined; };

/* Einheit im Plan-Format. id und Extras (fixed, race …) setzt der Aufrufer. */
export function build(spec: Spec): any {
  spec = gearFit(poolFit(spec));
  // Auftrag 20: Hügelsprints in einem Lauf unter 30 min (z. B. nach dem Kürzen) wären ein zu großer Teil: dann lockerer Lauf mit Steigerungen
  if (spec.sport === 'run' && spec.kind === 'hills' && totals(spec).min < 30) spec = { ...runEasy(spec.ctx, totals(spec).min, { strides: 4 }), why: 'Kurze Steigerungen halten die Beine schnell, ohne müde zu machen.', ...(spec.notes ? { notes: spec.notes.filter(n => !/Hügel/.test(n)) } : {}) };
  const t = totals(spec);
  const s: any = { sport: spec.sport, title: title(spec), plannedMinutes: t.min, description: describe(spec), spec };
  if (t.km != null && t.km > 0) s.plannedKm = t.km;
  const z = zoneLabel(spec); if (z && spec.sport !== 'strength' && spec.sport !== 'swim') s.zone = z;
  if (spec.sport === 'swim') { const zs = Math.max(...spec.steps.filter(x => x.part === 'main').map(x => x.zone || 2)); s.zone = `Zone ${zs}`; }
  if (['intervals', 'threshold', 'test', 'css', 'game', 'race', 'sweetspot', 'overunder', 'vo2', 'racepace', 'longq', 'force', 'climb'].includes(spec.kind) || (spec.kind === 'tempo' && spec.sport === 'run')) s.hard = true;
  if (spec.stage) s.stage = spec.stage;
  if (spec.area) s.area = spec.area;
  // Freiwasser: nicht im Schwimmbad (Schwimmbad-Regeln gelten nicht)
  if (spec.kind === 'openwater') s.place = 'outdoor';
  return s;
}

/* Stücke passend zur Beckenlänge (Auftrag 11): Im 25-m-Becken gehen einzelne Bahnen (25 m), sonst nur gerade Bahnzahlen
   (50, 100, 150 …), damit man am Startrand ankommt – keine 75-m-Stücke. Im 50-m-Becken alles in 50-m-Schritten; wer erst
   25 m Kraul schafft, krault die halbe Bahn und schwimmt den Rest locker Brust. Gerundet wird nach unten (nie länger als das Können). */
export function poolFit(spec: Spec): Spec {
  const pool = spec.sport === 'swim' && spec.kind !== 'openwater' ? spec.ctx && spec.ctx.pool : null;
  if (!pool) return spec;
  const fit = (s: Step): Partial<Step> | null => {
    const m = s.m || 0; if (!m) return null;
    if (pool === 50) {
      if (m >= 50 && m % 50 === 0) return null;
      // Kraul-Stücke unter 50 m (auch bei „kann kraulen, aber erst 25 m“): halbe Bahn Kraul, Rest locker Brust
      if (m < 50) return s.mode === 'crawl' || s.mode === 'pull' ? { m: 50, mode: 'mixed', note: [`${m} m ${s.mode === 'pull' ? 'Kraul mit Pull Buoy' : 'Kraul'}, den Rest der Bahn locker Brust`, s.note].filter(Boolean).join('. ') } : { m: 50 };
      return { m: Math.max(50, Math.floor(m / 50) * 50) };
    }
    if (m === 25 || (m % 50 === 0)) return null;
    return { m: m < 50 ? 25 : Math.floor(m / 50) * 50 };
  };
  if (!spec.steps.some(s => fit(s))) return spec;
  const out: Spec = JSON.parse(JSON.stringify(spec));
  out.steps = out.steps.map(s => { const f = fit(s); return f ? { ...s, ...f } : s; });
  return out;
}

/* Hilfsmittel (Auftrag 14): nur, was die Person hat. Beinschlag mit Kickbrett, sonst in Seitlage; Pull Buoy sonst normales Kraul
   (Lernende: die Pull-Buoy-Serie entfällt, weil sie länger ist als das, was ohne geht); Flossen für Anfänger bei Beinschlag und Übungen;
   Frontschnorchel bei der ersten Kraul-Übung; Paddles nur für Geübte in Pull-Buoy-Serien. Ohne Angabe: keine Hilfsmittel. */
export function gearFit(spec: Spec): Spec {
  if (spec.sport !== 'swim' || spec.kind === 'openwater' || spec.kind === 'test') return spec;
  const have = new Set((spec.ctx && spec.ctx.gear) || []);
  const learner = !!spec.stage && spec.stage.ladder === 'swim' && spec.stage.n <= 2;
  const out: Spec = JSON.parse(JSON.stringify(spec));
  let snorkel = have.has('snorkel');
  out.steps = out.steps.flatMap(s => {
    const x = { ...s };
    if (x.mode === 'kick') x.gear = [...(have.has('board') ? ['board'] : []), ...(have.has('fins') && (learner || !have.has('board')) ? ['fins'] : [])];
    else if (x.mode === 'pull') {
      if (!have.has('buoy')) { if (out.stage) return []; x.mode = 'crawl'; x.gear = []; x.focus = 'Arme lang, Beine ruhig'; }
      else x.gear = ['buoy', ...(have.has('paddles') && !out.stage && (x.m || 0) >= 100 ? ['paddles'] : [])];
    } else if (x.mode === 'drill') {
      x.gear = [...(have.has('fins') && learner ? ['fins'] : []), ...(snorkel && !learner ? ['snorkel'] : [])];
      if (snorkel && !learner) snorkel = false;
    } else if (x.gear) x.gear = x.gear.filter(g => have.has(g));
    return [x];
  });
  if (/Pull Buoy/.test(out.variant || '') && !have.has('buoy')) out.variant = (out.variant || '').replace('Pull Buoy', 'Technik');
  return out;
}

/* Umfang einer Einheit ändern (Faktor), Text und Zahlen bleiben gleich erzeugt. Der Hauptteil wird verlängert/gekürzt. */
export function scaleSpec(spec: Spec, f: number): Spec {
  const out: Spec = JSON.parse(JSON.stringify(spec));
  if (out.sport === 'strength') { (out.exercises || []).forEach(e => { e.sets = Math.max(1, Math.round(e.sets * Math.min(1, f + 0.15))); }); out.steps.forEach(s => { if (s.part === 'main') s.min = Math.max(10, Math.round((s.min || 20) * f / 5) * 5); }); return out; }
  if (out.stage) {
    // Lernstufen ändern sich nur mit der Stufe. Schwimmen (Auftrag 15): kürzer geht trotzdem – der Kraul-Teil der Stufe bleibt,
    // Ein-/Ausschwimmen, Brust und Übungen werden weniger (z. B. in der Erholungswoche)
    if (out.sport !== 'swim' || f >= 1) return out;
    out.steps.forEach(st => {
      if (st.part !== 'main' && st.m) st.m = Math.max(st.part === 'warm' ? 100 : 50, Math.floor(st.m * f / 50) * 50);
      else if (st.part === 'main' && ['breast', 'drill', 'kick', 'easy'].includes(st.mode || '')) { if ((st.reps || 1) > 1) st.reps = Math.max(1, Math.round((st.reps || 1) * f)); else if (st.m) st.m = Math.max(50, Math.floor(st.m * f / 50) * 50); }
    });
    return out;
  }
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
      // Auftrag 19: ein einzelnes Kraul-Stück wird nie länger als vorher (Können), auch nicht beim Runden auf 100 m
      if (reps > 1) s.reps = Math.max(2, Math.round(reps * g)); else { const lim = s.mode === 'crawl' || s.mode === 'pull' ? (s.m || 0) : Infinity; s.m = Math.min(lim, Math.max(Math.min(100, s.m || 0), Math.round((s.m || 0) * g / 50) * 50)); }
    } else if ((s.min || 0) <= 1 && (s.zone || 0) >= 3) {
      // Auftrag 19: kurze Stücke (Steigerungen, Hügelsprints) bleiben kurz; weniger Wiederholungen, aber mindestens 4
      if (reps > 1) s.reps = Math.min(reps, Math.max(4, Math.round(reps * g)));
    } else if (reps > 1 && !s.walkMin && (out.kind === 'intervals' || out.kind === 'threshold' || out.kind === 'tempo')) {
      // Auftrag 19: bei 2 Stücken werden die Stücke kürzer (z. B. 2×15 → 2×12 min), sonst ließe sich die Einheit nie kürzen
      if (Math.round(reps * g) < 2 && (s.min || 0) >= 6) { s.reps = 2; s.min = Math.max(5, Math.round((s.min || 0) * reps * g / 2)); }
      else s.reps = Math.max(2, Math.round(reps * g));
    }
    else if (reps > 1) s.reps = Math.max(1, Math.round(reps * g));
    else if ((s.min || 0) >= 5) s.min = Math.max(5, Math.round((s.min || 0) * g / 5) * 5);
  }
  // Ein-/Ausrollen kürzen, wenn der Hauptteil schon minimal ist
  // Auftrag 18: harte Einheiten behalten mindestens 10 min Aufwärmen
  const hardSpec = mains.some(m => (m.zone || 0) >= 3 && (m.reps || 1) * (m.min || 0) >= 5);
  if (f < 1 && totals(out).min > target + 5) out.steps.forEach(s => { if (s.part !== 'main' && s.min && s.min > 5) s.min = Math.max(s.part === 'warm' && hardSpec ? 10 : 5, Math.round(s.min * f / 5) * 5); });
  // Schwimmen (Auftrag 15): Ein-/Ausschwimmen in Metern und Technik-Serien mitkürzen
  if (out.sport === 'swim' && f < 1 && totals(out).min > target + 3) {
    out.steps.forEach(s => { if (s.part !== 'main' && s.m) s.m = Math.max(s.part === 'warm' ? 100 : 50, Math.floor(s.m * f / 50) * 50); });
    out.steps.forEach(s => { if (s.part === 'main' && (s.mode === 'drill' || s.mode === 'kick') && (s.reps || 1) > 2 && totals(out).min > target + 3) s.reps = Math.max(2, Math.round((s.reps || 1) * f)); });
  }
  return out;
}
export function rebuildScaled(session: any, f: number): any {
  if (!session || !session.spec) return null;
  let b = build(scaleSpec(session.spec, f));
  // Auftrag 17: eine harte Einheit (kein Test) wird nicht kürzer als 25 min gekürzt, sonst bleibt vom Hauptteil nur ein Stück übrig
  if (b.hard && session.spec.kind !== 'test' && session.sport !== 'swim' && b.plannedMinutes < 25 && (session.plannedMinutes || 0) >= 25) {
    for (let g = f; g < 1 && b.plannedMinutes < 25; g = Math.min(1, g + 0.05)) b = build(scaleSpec(session.spec, g));
  }
  // Auftrag 20: die Zone kommt mit (sonst bleibt nach dem Kürzen die alte Zone stehen, z. B. „Zone 3“ bei einem lockeren Lauf)
  return { title: b.title, plannedMinutes: b.plannedMinutes, plannedKm: b.plannedKm ?? null, description: b.description, spec: b.spec, ...(b.zone ? { zone: b.zone } : {}) };
}

/* ---------- Bausteine ---------- */
const S = (part: Step['part'], o: Omit<Step, 'part'>): Step => ({ part, ...o });
const r5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);
export function runEasy(ctx: PaceCtx, min: number, o: { strides?: boolean | number; kind?: Kind } = {}): Spec {
  const n = o.strides === true ? 4 : o.strides || 0;
  const note = n ? (o.strides === true ? 'am Ende 4 kurze Steigerungen über 15 s' : `am Ende ${n} Steigerungsläufe über 15-20 s, dazwischen locker gehen`) : undefined;
  // Auftrag 17: ab 30 min mit Ein- und Auslaufen (Aufwärmen, Hauptteil, Auslaufen)
  const m = r5(min);
  if (m < 25) return { sport: 'run', kind: o.kind || 'easy', ctx, steps: [S('main', { min: m, zone: 2, note })] };
  const wu = m >= 35 ? 10 : 5;
  return { sport: 'run', kind: o.kind || 'easy', ctx, steps: [S('warm', { min: wu, zone: 1, note: 'ganz locker einlaufen' }), S('main', { min: m - wu - 5, zone: 2, note }), S('cool', { min: 5, zone: 1, note: 'locker auslaufen, ein paar Minuten gehen' })] };
}
export function runLong(ctx: PaceCtx, min: number): Spec { return { sport: 'run', kind: 'long', ctx, steps: [S('warm', { min: 10, zone: 1 }), S('main', { min: Math.max(5, r5(min - 15)), zone: 2, note: min >= 75 ? 'ab 75 min etwas trinken und essen' : undefined }), S('cool', { min: 5, zone: 1, note: 'ruhig auslaufen' })] }; }
export function runIntervals(ctx: PaceCtx, reps: number, min: number, rest: number, zone = 4): Spec {
  return { sport: 'run', kind: 'intervals', ctx, steps: [S('warm', { min: 15, zone: 1, note: 'mit 3 kurzen Steigerungen' }), S('main', { reps, min, zone, restMin: rest }), S('cool', { min: 10, zone: 1 })] };
}
export function runTempo(ctx: PaceCtx, min: number, zone = 3): Spec {
  return { sport: 'run', kind: zone >= 4 ? 'threshold' : 'tempo', ctx, steps: [S('warm', { min: 15, zone: 1 }), S('main', { min, zone }), S('cool', { min: 10, zone: 1 })] };
}
export function bikeEasy(ctx: PaceCtx, min: number, kind: Kind = 'easy'): Spec {
  const m = r5(min);
  // Auftrag 17: ab 40 min mit Ein- und Ausrollen
  if (m < 25) return { sport: 'bike', kind, ctx, steps: [S('main', { min: m, zone: 2, note: 'hohe Trittfrequenz, 85-95 Umdrehungen' })], noDistance: !!ctx.indoor };
  const wu = m >= 40 ? 10 : 5;
  return { sport: 'bike', kind, ctx, steps: [S('warm', { min: wu, zone: 1, note: 'locker einrollen' }), S('main', { min: m - wu - 5, zone: 2, note: 'hohe Trittfrequenz, 85-95 Umdrehungen' }), S('cool', { min: 5, zone: 1, note: 'locker ausrollen' })], noDistance: !!ctx.indoor };
}
export function bikeLong(ctx: PaceCtx, min: number): Spec { return { sport: 'bike', kind: 'long', ctx, steps: [S('warm', { min: 15, zone: 1 }), S('main', { min: Math.max(5, r5(min - 25)), zone: 2, note: 'alle 20-30 min essen und trinken' }), S('cool', { min: 10, zone: 1, note: 'locker ausrollen' })], noDistance: !!ctx.indoor }; }
export function bikeIntervals(ctx: PaceCtx, reps: number, min: number, zone: number, rest: number): Spec {
  return { sport: 'bike', kind: zone >= 4 ? 'threshold' : zone === 3 ? 'tempo' : 'intervals', ctx, steps: [S('warm', { min: 15, zone: 1, note: 'mit 3 kurzen Antritten' }), S('main', { reps, min, zone, restMin: rest }), S('cool', { min: 10, zone: 1 })], noDistance: !!ctx.indoor };
}
/* Sweet Spot (Zone 3, knapp unter der Schwelle): Ein- und Ausrollen füllen bis zur gewünschten Dauer */
export function bikeSweetSpot(ctx: PaceCtx, reps: number, min: number, total?: number): Spec {
  const rest = min >= 15 ? 5 : 4;
  const core = reps * min + (reps - 1) * rest;
  const extra = total ? Math.max(0, r5(total) - core - 25) : 0;
  const addWarm = Math.round(extra / 2 / 5) * 5;
  const warm = 15 + addWarm, cool = 10 + Math.max(0, extra - addWarm);
  return { sport: 'bike', kind: 'sweetspot', ctx, noDistance: !!ctx.indoor,
    steps: [S('warm', { min: warm, zone: 1, note: 'mit 3 kurzen Antritten' }), S('main', { reps, min, zone: 3, restMin: rest, note: 'gleichmäßig im oberen Bereich von Zone 3 (Sweet Spot), Trittfrequenz 85-95' }), S('cool', { min: cool, zone: cool > 15 ? 2 : 1, note: cool > 15 ? 'locker in Zone 2 ausfahren' : undefined })] };
}
export function swimSession(ctx: PaceCtx, kind: Kind, mainSets: Step[], warmM = 200, coolM = 100, warmMode: StrokeMode = 'easy'): Spec {
  return { sport: 'swim', kind, ctx, steps: [S('warm', { m: warmM, zone: 1, mode: warmMode }), ...mainSets, S('cool', { m: coolM, zone: 1, mode: 'easy' })] };
}

/* ---------- Lernstufen ---------- */
/* Kraul lernen: von Wassergewöhnung bis 800 m am Stück. Eine Stufe weiter nur, wenn die letzte geklappt hat. */
export const SWIM_LADDER: { label: string; main: Step[]; warm?: number; tip: string }[] = [
  { label: 'Wassergewöhnung und Atmung', warm: 100, main: [S('main', { reps: 6, m: 25, zone: 1, mode: 'drill', restSec: 30, drill: 'blubber' }), S('main', { reps: 4, m: 25, zone: 1, mode: 'drill', restSec: 30, drill: 'glide' }), S('main', { reps: 4, m: 25, zone: 1, mode: 'kick', restSec: 30 })], tip: 'Ins Wasser ausatmen, nur kurz seitlich einatmen. Lieber langsam und ruhig als schnell.' },
  { label: 'Kraul-Technik', main: [S('main', { reps: 6, m: 25, zone: 1, mode: 'kick', restSec: 30 }), S('main', { reps: 6, m: 25, zone: 1, mode: 'drill', restSec: 30, drill: 'sidekick' }), S('main', { reps: 4, m: 25, zone: 1, mode: 'drill', restSec: 30, drill: 'catchup' })], tip: 'Kopf ruhig, Blick zum Boden, gleichmäßig ausatmen.' },
  { label: '25-m-Stücke Kraul', main: [S('main', { reps: 4, m: 25, zone: 1, mode: 'kick', restSec: 30 }), S('main', { reps: 4, m: 25, zone: 1, mode: 'drill', restSec: 20, drill: 'catchup' }), S('main', { reps: 8, m: 25, zone: 2, mode: 'crawl', restSec: 30 })], tip: 'Nach jeder Bahn Pause, bis der Atem ruhig ist.' },
  { label: '50-m-Stücke Kraul', main: [S('main', { reps: 4, m: 25, zone: 1, mode: 'drill', restSec: 20, drill: 'catchup' }), S('main', { reps: 2, m: 25, zone: 1, mode: 'drill', restSec: 20, drill: 'breath3' }), S('main', { reps: 6, m: 50, zone: 2, mode: 'crawl', restSec: 30 })], tip: 'Alle 3 Züge atmen, beide Seiten üben.' },
  { label: '100-m-Stücke Kraul', main: [S('main', { reps: 4, m: 25, zone: 1, mode: 'drill', restSec: 20, drill: 'fingertip' }), S('main', { reps: 5, m: 100, zone: 2, mode: 'crawl', restSec: 30 })], tip: 'Gleichmäßig bleiben, nicht schneller werden.' },
  { label: '200-m-Stücke Kraul', main: [S('main', { reps: 4, m: 50, zone: 1, mode: 'drill', restSec: 20, drill: 'count' }), S('main', { reps: 3, m: 200, zone: 2, mode: 'crawl', restSec: 30 })], tip: 'Lange Arme, ruhig ausatmen.' },
  { label: '400 m am Stück', main: [S('main', { reps: 4, m: 50, zone: 1, mode: 'drill', restSec: 20, drill: 'breath3' }), S('main', { reps: 2, m: 400, zone: 2, mode: 'crawl', restSec: 60 })], tip: 'Ruhiges Tempo, du sollst ohne Pause durchkommen.' },
  { label: '800 m am Stück', main: [S('main', { reps: 4, m: 50, zone: 1, mode: 'drill', restSec: 20, drill: 'count' }), S('main', { reps: 1, m: 800, zone: 2, mode: 'crawl' }), S('main', { reps: 4, m: 50, zone: 3, mode: 'crawl', restSec: 20 })], tip: 'Jetzt zählt Ausdauer: gleichmäßig durchschwimmen.' }
];
/* Nur Brust: zuerst Brust plus Kraul-Technik */
export const SWIM_BREAST_LADDER: { label: string; main: Step[]; tip: string }[] = [
  { label: 'Brust und Kraul-Beinschlag', main: [S('main', { reps: 6, m: 25, zone: 1, mode: 'kick', restSec: 30 }), S('main', { reps: 4, m: 25, zone: 1, mode: 'drill', restSec: 30, drill: 'blubber' }), S('main', { reps: 3, m: 100, zone: 2, mode: 'breast', restSec: 30 })], tip: 'Bei Brust das Gesicht ins Wasser, dann ist es leichter.' },
  { label: 'Brust und Kraul-Technik', main: [S('main', { reps: 4, m: 25, zone: 1, mode: 'drill', restSec: 30, drill: 'sidekick' }), S('main', { reps: 4, m: 25, zone: 1, mode: 'drill', restSec: 30, drill: 'catchup' }), S('main', { reps: 3, m: 100, zone: 2, mode: 'breast', restSec: 30 })], tip: 'Kraul langsam üben, die Technik kommt vor dem Tempo.' },
  { label: 'Brust und kurze Kraul-Strecken', main: [S('main', { reps: 4, m: 25, zone: 1, mode: 'drill', restSec: 30, drill: 'catchup' }), S('main', { reps: 6, m: 25, zone: 2, mode: 'crawl', restSec: 30 }), S('main', { reps: 2, m: 200, zone: 2, mode: 'breast', restSec: 30 })], tip: 'Jede Kraul-Bahn ruhig, danach Pause.' }
];
/* Lauf-Geh-Wechsel bis 30 min am Stück */
export const RUNWALK_LADDER: { reps: number; run: number; walk: number }[] = [
  { reps: 8, run: 1, walk: 2 }, { reps: 8, run: 2, walk: 1 }, { reps: 6, run: 3, walk: 1 }, { reps: 5, run: 5, walk: 1 },
  { reps: 3, run: 8, walk: 1 }, { reps: 2, run: 12, walk: 1 }, { reps: 1, run: 20, walk: 0 }, { reps: 1, run: 30, walk: 0 }
];
/* Einstufung (Auftrag 11, für alle):
   - „nein“: Technik von Anfang an (mit Brust: Brust und Kraul-Technik, sonst Wassergewöhnung).
   - „ein bisschen“: Lern-Stufen, kein Stück länger als das, was schon am Stück geht.
   - „ja“ (Auftrag 14): immer normales Schwimmtraining, nie „Kraul lernen“; die Stücke richten sich nach der Strecke am Stück (auch 25 m).
   - ab 200 m am Stück ist es immer normales Training mit Technik-Anteil (auch bei „ein bisschen“). */
export const SWIM_NORMAL_M = 200;
export const SWIM_YES_DEFAULT_M = 100;
export function swimLadderStart(sk: { swimCrawl?: string | null; swimCrawlM?: number | null; swimBreast?: boolean }): { ladder: 'swim' | 'swimBreast'; n: number } | null {
  const c = sk.swimCrawl, m = sk.swimCrawlM != null && sk.swimCrawlM > 0 ? sk.swimCrawlM : null;
  if (c === 'no') return sk.swimBreast ? { ladder: 'swimBreast', n: 0 } : { ladder: 'swim', n: 0 };
  if (m != null && m >= SWIM_NORMAL_M) return null;
  if (c === 'yes') return null;
  if (c === 'some') {
    // Stufe so wählen, dass kein Stück länger ist als das, was schon am Stück geht (ohne Angabe: 25 m)
    const mm = m ?? 25;
    return { ladder: 'swim', n: mm >= 100 ? 4 : mm >= 50 ? 3 : mm >= 25 ? 2 : 1 };
  }
  return null;
}
/* Längstes Stück im normalen Training: nie länger als die Strecke am Stück (50 → 25-50 m, 100 → 50-100 m, 200 → bis 200 m, ab 400 → bis 400 m) */
export function swimRepMax(sk: { swimCrawl?: string | null; swimCrawlM?: number | null } | null | undefined): number {
  const m = sk && sk.swimCrawlM != null && sk.swimCrawlM > 0 ? sk.swimCrawlM : SWIM_YES_DEFAULT_M;
  return m >= 400 ? 400 : m >= 200 ? 200 : m >= 100 ? 100 : m >= 50 ? 50 : 25;
}
/* Normales Schwimmtraining (kann kraulen) mit Zieldauer (Auftrag 14: immer mit Technik-Block, Pausen und Serienwechsel ehrlich gerechnet).
   technique: zwei Übungen + Kraul-Stücke; endurance: Grundlage in gleichmäßigen Stücken (unter 100 m am Stück im Wechsel mit Brust);
   css: Intervalle an der Schwimm-Schwelle, je Einheit eine andere Form (100er, 200er, 50er schnell), unter 400 m am Stück kurze zügige Stücke.
   n: wie viele solche Einheiten es in der Phase schon gab (Abwechslung, Übungen im Wechsel). */
export function swimNormal(ctx: PaceCtx, kind: 'technique' | 'endurance' | 'css', minutes: number, phase: string, repMax: number, n = 0): Spec {
  const drillM = repMax >= 100 ? 50 : 25;
  const d1 = DRILL_ROT[(n * 2) % DRILL_ROT.length], d2 = DRILL_ROT[(n * 2 + 1) % DRILL_ROT.length];
  // Auftrag 17: Hilfsmittel nicht in jeder Einheit; Kickbrett und Pull Buoy kommen gezielt über den Schwerpunkt (keysessions.swimVariant)
  const tech = (reps: number): Step[] => [{ part: 'main', reps, m: drillM, zone: 1, mode: 'drill', restSec: 20, drill: d1 }];
  const mk = (k: number): Spec => {
    if (kind === 'css') {
      if (repMax >= 400 && ctx.css) {
        const v = n % 3;
        const main: Step[] = v === 1 ? [{ part: 'main', reps: Math.max(2, Math.round(k / 2)), m: 200, zone: 4, mode: 'crawl', restSec: 20 }]
          : v === 2 ? [{ part: 'main', reps: k + 2, m: 50, zone: 4, mode: 'crawl', restSec: 15, focus: 'schnell, aber sauber' }, { part: 'main', reps: 4, m: 100, zone: 3, mode: 'crawl', restSec: 20 }]
          : [{ part: 'main', reps: k, m: 100, zone: 4, mode: 'crawl', restSec: 15 }];
        return swimSession(ctx, 'css', [...tech(4), ...main, { part: 'main', reps: 2, m: 200, zone: 2, mode: 'crawl', restSec: 20, focus: 'locker, lange Züge' }], 400, 200);
      }
      const m = repMax >= 100 ? (n % 2 ? 50 : 100) : repMax >= 50 ? 50 : 25;
      // kurze Stücke (unter 100 m am Stück): im Wechsel zügig mit langer Pause oder etwas ruhiger mit kurzer Pause
      const alt = repMax < 100 && n % 2 === 1;
      return swimSession(ctx, 'css', [...tech(4), { part: 'main', reps: alt ? k + 2 : k, m, zone: alt ? 3 : 4, mode: 'crawl', restSec: m >= 100 ? 20 : alt ? 20 : 30 }], 300, 200);
    }
    if (kind === 'technique') return swimSession(ctx, 'technique', [...tech(4), { part: 'main', reps: 4, m: drillM, zone: 1, mode: 'drill', restSec: 20, drill: d2 }, { part: 'main', reps: k, m: Math.min(100, repMax), zone: 2, mode: 'crawl', restSec: 20 }]);
    const len = repMax >= 400 && phase === 'specific' ? 400 : Math.min(200, repMax);
    // unter 100 m am Stück: Kraul-Stücke im Wechsel mit Brust (Ausdauer ohne Stücke über dem Können)
    const breast: Step[] = repMax < 100 ? [{ part: 'main', reps: Math.max(1, Math.round(k / 4)), m: 100, zone: 2, mode: 'breast', restSec: 20 }] : [];
    return swimSession(ctx, 'endurance', [...tech(4), { part: 'main', reps: k, m: len, zone: 2, mode: 'crawl', restSec: len >= 200 || len <= 50 ? 30 : 20 }, ...breast], repMax < 100 ? 100 : 200, 100, repMax < 100 ? 'breast' : 'easy');
  };
  let k = kind === 'css' && repMax >= 400 && ctx.css ? 4 : 2;
  while (k < 40 && totals(mk(k + 1)).min <= minutes) k++;
  return mk(k);
}
/* Freiwasser (Auftrag 11): Sichten, Orientierung, Start, mit Neopren üben. Nur für alle ab 200 m Kraul am Stück. */
export function swimOpenWater(ctx: PaceCtx, minutes: number, why?: string): Spec {
  const mk = (k: number): Spec => ({ sport: 'swim', kind: 'openwater', ctx, why: why || 'Im Freiwasser gibt es keine Linie am Boden und keinen Rand: Sichten, gerade schwimmen und der Start wollen geübt sein.',
    tip: 'Nie allein: mit Begleitung, auffälliger Badekappe und Schwimmboje. Ist das Wasser kühl oder der Neoprenanzug im Wettkampf erlaubt, schwimm mit Neopren und übe An- und Ausziehen gleich mit.',
    steps: [S('warm', { m: 200, zone: 1, mode: 'easy', note: 'ruhig einschwimmen, an das Wasser gewöhnen' }),
      S('main', { reps: 4, m: 100, zone: 2, mode: 'crawl', restSec: 20, note: 'Sichten: alle 6-8 Züge kurz nach vorn schauen (Augen über Wasser), dann normal weiteratmen' }),
      S('main', { reps: k, m: 200, zone: 2, mode: 'crawl', restSec: 30, note: 'Orientierung: eine Boje oder einen Punkt am Ufer anpeilen und gerade darauf zuschwimmen' }),
      S('main', { reps: 4, m: 50, zone: 3, mode: 'crawl', restSec: 30, note: 'Start üben: aus dem Stand im Wasser schnell antreten, nach 50 m in den Rhythmus finden' }),
      S('cool', { m: 100, zone: 1, mode: 'easy' })] });
  let k = 1; while (k < 12 && totals(mk(k + 1)).min <= minutes) k++;
  return mk(k);
}
export function runLadderStart(continuousMin: number | null | undefined): number | null {
  if (continuousMin == null || continuousMin >= 30) return null;
  return continuousMin < 3 ? 0 : continuousMin < 5 ? 1 : continuousMin < 8 ? 2 : continuousMin < 12 ? 3 : continuousMin < 15 ? 4 : continuousMin < 20 ? 5 : 6;
}
/* Anteil Brust beim Auffüllen je Stufe (Kraul-Weg): je weiter, desto mehr Kraul */
const BREAST_SHARE = [0.8, 0.7, 0.6, 0.5, 0.35, 0.2, 0, 0];
export const SWIM_STAGE_M = [0, 0, 25, 50, 100, 200, 400, 800];
export function swimLearn(ctx: PaceCtx, stage: { ladder: 'swim' | 'swimBreast'; n: number; breast?: boolean; pull?: number | null }, why?: string, fillMin?: number): Spec {
  const L = stage.ladder === 'swimBreast' ? SWIM_BREAST_LADDER : SWIM_LADDER;
  const n = Math.min(stage.n, L.length - 1);
  const st = L[n] as any;
  // wer Brust kann: Brust zum Einschwimmen und für die Ausdauer, Kraul in Stücken so lang wie die Stufe
  const br = !!(stage.ladder === 'swim' && stage.breast && stage.n <= 5) || (!!fillMin && stage.ladder === 'swimBreast');
  const endu = S('main', { reps: 2, m: 100, zone: 2, mode: 'breast', restSec: 30, note: 'ruhig, für die Ausdauer im Wasser' });
  const crawlStep = st.main.find((x: Step) => x.mode === 'crawl');
  // Pull Buoy über die Stufe nur mit bestätigter längerer Pull-Strecke (höchstens doppelt so lang wie die Stufe); sonst gezielt über den
  // Schwerpunkt der Einheit (keysessions.swimVariant). Nie ohne Pull Buoy in der Ausrüstung.
  const stageLen = SWIM_STAGE_M[n] || 25;
  const haveBuoy = (ctx.gear || []).includes('buoy');
  const pullM = haveBuoy && stage.ladder === 'swim' && stage.pull && stage.pull > stageLen && n >= 2 && n <= 5 ? Math.min(Math.floor(stage.pull / 25) * 25, stageLen * 2) : 0;
  const pull = pullM ? S('main', { reps: 4, m: pullM, zone: 2, mode: 'pull', restSec: 30, note: 'Beine ruhig, lange Züge, gleichmäßig ausatmen' }) : null;
  const kick: Step[] = [];
  const spec: Spec = { sport: 'swim', kind: 'swimlearn', ctx, stage: { ...stage }, why,
    tip: st.tip + ` Am Ende trägst du die längste Strecke Kraul am Stück ein${haveBuoy ? ' (und getrennt mit Pull Buoy)' : ''}: Danach stuft die App dich passend ein.`,
    steps: [S('warm', { m: br ? 200 : st.warm || 100, zone: 1, mode: stage.ladder === 'swimBreast' || br ? 'breast' : 'easy' }), ...kick, ...st.main.map((x: Step) => ({ ...x })), ...(pull ? [pull] : []), ...(br ? [endu] : []), S('cool', { m: 100, zone: 1, mode: br ? 'breast' : 'easy' })] };
  // länger schwimmen: auffüllen mit Brust und Kraul/Pull Buoy im Verhältnis der Stufe (Kraul-Stücke so lang wie die Stufe)
  if (fillMin) {
    spec.fillMin = fillMin;
    const share = stage.ladder === 'swimBreast' ? 0.7 : br ? BREAST_SHARE[n] : 0;
    const crawlFill = pull || (spec.steps.find(x => x.part === 'main' && x.mode === 'crawl' && x !== crawlStep) as Step) || crawlStep;
    const meters = (mode: StrokeMode[]) => spec.steps.filter(x => x.part === 'main' && mode.includes(x.mode || 'crawl')).reduce((a, x) => a + (x.reps || 1) * (x.m || 0), 0);
    for (let k = 0; k < 40 && totals(spec).min + 3 <= fillMin; k++) {
      const b = meters(['breast']), c = meters(['crawl', 'pull']);
      if (share > 0 && (b / Math.max(1, b + c) < share || !crawlFill)) { if (!spec.steps.includes(endu)) spec.steps.splice(spec.steps.length - 1, 0, endu); else endu.reps = (endu.reps || 1) + 1; }
      else if (crawlFill) crawlFill.reps = (crawlFill.reps || 1) + 1;
      else break;
    }
  }
  return spec;
}
/* Schwimmtest (Kraul-Check) zu Beginn der Einheit, danach Technik wie gewohnt. Ab 400 m Kraul am Stück: CSS-Test (swimTest). */
export function swimCheck(ctx: PaceCtx, stage: { ladder: 'swim' | 'swimBreast'; n: number; breast?: boolean } | null, fillMin?: number, maxRep = 50): Spec {
  // Auftrag 15: der Versuch „so weit wie möglich“ nie länger als das Können (wer 25 m schafft, versucht 25 m)
  const tryM = Math.max(25, Math.min(50, maxRep || 50));
  const tech = stage ? swimLearn(ctx, { ...stage, breast: true }).steps.filter(x => x.part === 'main' && x.mode !== 'breast') : [S('main', { reps: 6, m: 25, zone: 1, mode: 'drill', restSec: 20 })];
  const spec: Spec = { sport: 'swim', kind: 'test', title: 'Schwimmtest: Kraul-Check', ctx,
    why: 'Zeigt, wie weit du am Stück kraulen kannst und wie effizient. Daraus kommen Schwimm-Score und Technik-Stufe.',
    tip: 'Werte direkt nach dem Test eintragen: längste Strecke Kraul am Stück, Ø Zeit und Züge pro Bahn, deine Brust-Zeit.',
    steps: [S('warm', { m: 200, zone: 1, mode: 'breast', note: 'einschwimmen' }),
      S('main', { reps: 1, m: tryM, zone: 2, mode: 'crawl', note: '(a) Kraul so weit wie möglich am Stück, ruhig atmen. Strecke merken' }),
      S('main', { reps: 4, m: 25, zone: 3, mode: 'crawl', restSec: 30, note: '(b) locker-zügig, Zeit und Züge pro Bahn merken' }),
      S('main', { reps: 1, m: 200, zone: 3, mode: 'breast', note: '(c) auf Zeit, Zeit merken' }),
      ...tech.map(x => ({ ...x, note: x.note ? 'danach Technik: ' + x.note : 'danach Technik' })), S('cool', { m: 100, zone: 1, mode: 'breast' })] };
  // Auffüllen als eine Serie („4×100 m Brust“) statt viermal „100 m Brust“ hintereinander
  if (fillMin) { const f = S('main', { reps: 0, m: 100, zone: 2, mode: 'breast', restSec: 20, note: 'ruhig' }); for (let k = 0; k < 10 && totals({ ...spec, steps: [...spec.steps, { ...f, reps: (f.reps || 0) + 1 }] }).min <= fillMin - 1; k++) f.reps = (f.reps || 0) + 1; if (f.reps) spec.steps.splice(spec.steps.length - 1, 0, f); }
  return spec;
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
export function strengthArea(area: 'lower' | 'upper' | 'core', o: { light?: boolean; knee?: boolean; back?: boolean; shoulder?: boolean; why?: string; minutes?: number; easy?: boolean } = {}): Spec {
  let ex = AREA[area].map(e => ({ ...e }));
  // am Tag vor einem Test: 2 Sätze, nichts Explosives
  if (o.easy) ex = ex.filter(e => !/Nordic|Sprung/.test(e.name)).map(e => ({ ...e, sets: Math.min(2, e.sets), note: [e.note, 'leicht, nichts Explosives'].filter(Boolean).join(', ') }));
  if (o.knee) ex = ex.map(e => /Kniebeuge|Ausfallschritt/.test(e.name) ? { ...e, name: e.name + ' (nur so tief, wie es schmerzfrei geht)' } : e);
  if (o.back) ex = ex.filter(e => !/Kreuzheben|Nordic/.test(e.name));
  if (o.shoulder) ex = ex.filter(e => !/Liegestütz|Y-T-W|Klimmzug/.test(e.name));
  if (o.light) ex = ex.map(e => ({ ...e, sets: Math.max(1, e.sets - 1), note: [e.note, 'leichter als sonst'].filter(Boolean).join(', ') }));
  const sets = ex.reduce((a, e) => a + e.sets, 0);
  const mainMin = o.minutes ? Math.max(10, r5(o.minutes - 5)) : Math.max(15, Math.min(40, Math.round(sets * 1.3 / 5) * 5));
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
export function runTest(ctx: PaceCtx): Spec { return { sport: 'run', kind: 'test', title: 'Lauftest 30 min', ctx, why: 'Daraus berechnet die App deine echten Zonen statt der Schätzung.', tip: 'Möglichst flache Strecke ohne Ampeln. Liefert die Uhr keine Runde für die 30 min, Ø-Puls der letzten 20 min und Ø-Pace selbst eintragen.', steps: [S('warm', { min: 15, zone: 1, note: 'einlaufen, mit 3 Steigerungen' }), S('main', { min: 30, zone: 4, note: 'so schnell, wie du es gleichmäßig 30 min halten kannst. Ø-Puls der letzten 20 min = Schwellenpuls, Ø-Pace = Schwellen-Pace' }), S('cool', { min: 10, zone: 1, note: 'auslaufen' })] }; }
export function bikeTest(ctx: PaceCtx): Spec { return { sport: 'bike', kind: 'test', title: 'Radtest 20 min', ctx, noDistance: true, why: 'Daraus berechnet die App deine Rad-Zonen: Ø-Puls der 20 min = Schwellenpuls Rad, mit Wattmessung FTP = 95 % der Ø-Watt.',
  tip: 'Drinnen oder draußen, wie du willst. Draußen eine gleichmäßige Strecke ohne Stopps (flach oder ein langer Anstieg). Ohne Wattmessung zählt nur der Puls.',
  steps: [S('warm', { min: 20, zone: 1, note: 'einfahren mit 3×1 min zügig' }), S('warm', { min: 5, zone: 1, note: 'locker' }), S('warm', { min: 5, zone: 4, note: 'hart' }), S('warm', { min: 10, zone: 1, note: 'locker' }),
    S('main', { min: 20, zone: 4, note: 'maximal gleichmäßig, nicht zu schnell anfangen' }), S('cool', { min: 10, zone: 1, note: 'ausfahren' })] }; }
export function swimTest(ctx: PaceCtx): Spec { return { sport: 'swim', kind: 'test', title: 'Schwimmtest 400/200 m', ctx, why: 'Daraus berechnet die App deine Schwimm-Schwelle (CSS).', steps: [S('warm', { m: 300, zone: 1, mode: 'easy' }), S('main', { reps: 1, m: 400, zone: 4, mode: 'crawl', note: 'so schnell wie gleichmäßig möglich' }), S('main', { reps: 1, m: 200, zone: 4, mode: 'crawl', note: 'nach 5 min Pause, wieder voll' }), S('cool', { m: 100, zone: 1, mode: 'easy' })] }; }
