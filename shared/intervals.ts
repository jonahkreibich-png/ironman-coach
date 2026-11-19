/* Auftrag 22: Intervalle je Einheit (Laufen, Rad, Schwimmen, Koppel).
   - Soll: aus der Bauanleitung der Einheit (spec.steps) – jede harte Wiederholung ist ein Intervall mit Ziel (Dauer bzw. Strecke, Pace/Watt/Puls).
     Viele sehr kurze Stücke (z. B. 13×30 s) sind ein Intervall-Block. Die Soll-Werte sind nur Platzhalter, nie Ergebnis.
   - Ist: von Hand (metrics.intervals, Quelle „von Hand“) oder automatisch aus der Aufzeichnung: Runden der Uhr (Belastung/Pause),
     selbst gedrückte Runden mit Wechsel schnell/langsam, sonst harte Abschnitte aus dem Verlauf (activity.segments).
     Automatische Runden (z. B. jeder Kilometer) sind keine Intervalle (Auftrag 16). Hand gewinnt immer.
   - Zuordnung Ist → Soll: Reihenfolge bleibt, passende Dauer bzw. Strecke (Ausrichtung wie beim Textvergleich), Ein-/Auslaufen fällt weg,
     zusätzliche harte Stücke werden als „mehr als geplant“ gezeigt, fehlende als nicht gemacht, deutlich kürzere als abgebrochen.
   - Auswertung: je Intervall im Ziel / zu hart / zu locker, Ø der Intervalle (nur harte Teile), Ø der Pausen, Abfall erstes → letztes,
     Pulsanstieg, Erholung in den Pausen. Gesamtwerte der Einheit bleiben unverändert (fieldsOf). */
import * as W from './workouts';
import { HR_ZONES, POWER_ZONES } from './sports';
import type { LapOut, IntervalOut } from './activity/analyze';
import { isAutoLaps, lapKinds } from './activity/structure';

export type IvSport = 'run' | 'bike' | 'swim';
/** Ein eingetragenes bzw. gemessenes Intervall (mit der Pause danach). Alle Werte optional. */
export interface IvRow {
  sec?: number | null; m?: number | null; hr?: number | null; maxHr?: number | null;
  /** Laufen: Pace m:ss pro km */ pace?: string | null;
  /** Rad: Watt und km/h */ power?: number | null; speed?: number | null;
  /** Schwimmen: Pace m:ss pro 100 m, Züge pro Bahn */ pace100?: string | null; spl?: number | null;
  /** Laufen Schritte/min, Rad Umdrehungen/min */ cad?: number | null;
  rpe?: number | null; note?: string | null;
  /** Pause nach dem Intervall: Dauer und Puls am Ende der Pause (Erholung) */
  restSec?: number | null; restHr?: number | null;
  /** von Hand: abgebrochen */ aborted?: boolean;
  /* Auftrag 36: was wirklich gemacht wurde (je Wiederholung; der Satz setzt sie für alle seine Wiederholungen).
     title: eigener Titel; stroke: Lage bzw. Art (Schwimmen); gear: Hilfsmittel ([] = ausdrücklich keine); zone: tatsächliche Zone;
     type: Art (Laufen/Rad: bergauf, Fahrtspiel, Steigerung …); terrain: Untergrund bzw. Gelände.
     set: Satz-Kennung (zusammengehörende Wiederholungen); ti: Index des Soll-Intervalls (null = zusätzlich). Fehlt ti, gilt die Reihenfolge. */
  title?: string | null; stroke?: IvStroke | null; gear?: string[] | null; zone?: number | null; type?: string | null; terrain?: string | null;
  set?: number | null; ti?: number | null;
  /** Auftrag 37: mit „Wie geplant gemacht“ aus dem Soll gefüllt (nicht gemessen) – zählt als gemacht, aber nie als Messwert für Tempo/Scores */
  plan?: boolean;
  /** Auftrag 38: lockerer Teil (aus einem lockeren Hauptteil-Schritt, kein Intervall); full = Liste enthält die ganze Einheit (ab 3.26, auch die lockeren Teile);
      sep = eigener Satz (Frage „Zu Satz X hinzufügen?“ mit Nein beantwortet) */
  steady?: boolean; full?: boolean; sep?: boolean;
}
export type IvStroke = 'crawl' | 'breast' | 'back' | 'fly' | 'im' | 'drill' | 'kick';
export const IV_STROKES: [IvStroke, string][] = [['crawl', 'Kraul'], ['breast', 'Brust'], ['back', 'Rücken'], ['fly', 'Delfin'], ['im', 'Lagen'], ['drill', 'Technikübung'], ['kick', 'Beine']];
export const IV_GEAR: [string, string][] = [['buoy', 'Pull Buoy'], ['board', 'Kickboard'], ['paddles', 'Paddles'], ['fins', 'Flossen']];
export const IV_TYPES: Record<'run' | 'bike', [string, string][]> = {
  run: [['flat', 'normal'], ['hill', 'bergauf'], ['fartlek', 'Fahrtspiel'], ['strides', 'Steigerung'], ['tempo', 'Tempo/Schwelle'], ['race', 'Wettkampftempo']],
  bike: [['flat', 'normal'], ['hill', 'bergauf'], ['sprint', 'Sprint'], ['lowcad', 'niedrige Trittfrequenz'], ['tempo', 'Schwelle/Sweet Spot']]
};
export const IV_TERRAIN: Record<'run' | 'bike', [string, string][]> = {
  run: [['road', 'Straße'], ['track', 'Bahn'], ['trail', 'Gelände/Trail'], ['treadmill', 'Laufband']],
  bike: [['flat', 'flach'], ['hilly', 'hügelig'], ['indoor', 'Rolle']]
};
export const strokeLabel = (k: string | null | undefined): string => (IV_STROKES.find(x => x[0] === k) || [null, ''])[1];
export const gearLabel = (k: string): string => (IV_GEAR.find(x => x[0] === k) || [null, k === 'snorkel' ? 'Schnorchel' : k])[1];
export const typeLabel = (sport: string, k: string | null | undefined): string => ((IV_TYPES as any)[sport] || []).find((x: any) => x[0] === k)?.[1] || '';
export const terrainLabel = (sport: string, k: string | null | undefined): string => ((IV_TERRAIN as any)[sport] || []).find((x: any) => x[0] === k)?.[1] || '';
export interface IvTarget {
  /** fortlaufend 0 … */ i: number;
  /** Satz (Schritt der Einheit) und Wiederholung darin */ set: number; rep: number; reps: number;
  sec: number | null; m: number | null; zone: number; restSec: number | null; mode?: string | null;
  label: string;
  /** Zielbereiche: Pace s/km [schnell, langsam], Watt [lo, hi], km/h [lo, hi], Pace s/100 m [schnell, langsam], Puls [lo, hi] */
  pace?: [number, number] | null; power?: [number, number] | null; speed?: [number, number] | null; pace100?: [number, number] | null; hr?: [number, number | null] | null;
  /** RPE-Ziel */ rpe: [number, number];
  /** Auftrag 36: geplante Lage und Hilfsmittel (Schwimmen) */ stroke?: IvStroke | null; gear?: string[];
  /** Auftrag 38: lockerer Teil des Hauptteils (kein Intervall), Ausführung statt Zahlen (kurz/bergauf), bergauf, eigener Titel */
  steady?: boolean; cue?: string; hill?: boolean; title?: string;
}
export type IvVerdict = 'ok' | 'hard' | 'easy' | 'short' | 'missing' | 'plan' | null;
export interface IvLine { target: IvTarget | null; row: IvRow | null; verdict: IvVerdict; why: string; extra: boolean; done: boolean;
  /** Tempo/Watt außerhalb des Ziels, Puls aber im Ziel: eher stimmen die Zonen nicht (faster = schneller als geplant) */ zone?: 'faster' | 'slower';
  /** Auftrag 36: tatsächlich gemacht (Lage, Hilfsmittel, Zone, Art, Titel) und was davon vom Plan abweicht */ attrs?: IvAttrs; diff?: string[] }
export type IvSource = 'manual' | 'plan' | 'watch' | 'laps' | 'stream' | 'icu' | 'none';
export interface IvEval {
  sport: IvSport; source: IvSource; planned: number; done: number; extra: number; missing: number; short: number;
  inTarget: number; tooHard: number; tooEasy: number; judged: number;
  /** Auftrag 37: „wie geplant“ eingetragen (ohne Messwerte) */ asPlanned: number;
  /** Intervalle mit Tempo/Watt neben dem Ziel bei passendem Puls */ zoneFaster: number; zoneSlower: number;
  lines: IvLine[];
  /** Ø nur über die harten Teile */ work: { sec: number | null; hr: number | null; maxHr: number | null; paceSec: number | null; power: number | null; speed: number | null; pace100: number | null; cad: number | null; rpe: number | null };
  /** Ø der Pausen */ rest: { sec: number | null; hr: number | null };
  /** Leistung letztes gegen erstes Intervall in % (positiv = schwächer) */ fadePct: number | null;
  /** Puls letztes gegen erstes Intervall (Schläge) */ hrRise: number | null;
  /** Puls fällt in den Pausen um … Schläge (Ø) */ recovery: number | null;
}

const RPE_ZONE: Record<number, [number, number]> = { 1: [1, 3], 2: [2, 4], 3: [5, 6], 4: [7, 8], 5: [8, 10] };
const num = (v: any): number | null => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
export const paceToSec = (v: any): number | null => { const m = /^(\d{1,2})[:.,](\d{2})$/.exec(String(v == null ? '' : v).trim()); return m && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
export const secToPace = (s: number | null | undefined): string => s == null || !Number.isFinite(s) ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`.replace(/:60$/, ':59');
const avg = (a: (number | null | undefined)[]): number | null => { const v = a.filter((x): x is number => x != null && Number.isFinite(x)); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
const wavg = (a: { v: number | null | undefined; w: number }[]): number | null => { const v = a.filter(x => x.v != null && Number.isFinite(x.v) && x.w > 0) as { v: number; w: number }[]; const sw = v.reduce((s, x) => s + x.w, 0); return sw ? v.reduce((s, x) => s + x.v * x.w, 0) / sw : null; };
const r0 = (x: number | null) => (x == null ? null : Math.round(x));
const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);
const minTxt = (sec: number) => sec < 60 ? `${Math.round(sec)} s` : sec % 60 ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')} min` : `${sec / 60} min`;

/* ---------- Soll aus dem Plan ---------- */
export interface IvThresholds { lthrRun?: number | null; lthrBike?: number | null; ftp?: number | null; runThrSec?: number | null; css?: number | null; powerMeter?: boolean }
const SWIM_SET_MODES = new Set(['crawl', 'pull', 'breast', 'mixed']);
/** Ist ein Schritt ein Intervall? Laufen/Rad: Hauptteil ab Zone 3. Schwimmen: Hauptteil-Serien (Kraul, Pull, Brust) mit Wiederholungen oder ab Zone 3. */
function isIvStep(spec: W.Spec, s: W.Step): boolean {
  if (s.part !== 'main' || s.walkOnly) return false;
  if (spec.sport === 'swim') return !!s.m && SWIM_SET_MODES.has(s.mode || 'crawl') && ((s.reps || 1) >= 2 || (s.zone || 2) >= 3);
  if (spec.sport !== 'run' && spec.sport !== 'bike') return false;
  return !!s.min && (s.zone || 2) >= 3;
}
/* Auftrag 38: „Ablauf enthält die ganze Einheit“. Vorher fehlten lockere Hauptteile (z. B. „20 min locker Z2“ vor den Hügelsprints) im
   Ablauf, weil nur Schritte ab Zone 3 Intervalle wurden – die Summe stimmte nicht. Jetzt wird jeder Hauptteil-Schritt ein Ziel, sobald der
   Hauptteil aus mehr als einem Schritt besteht (gleichmäßige Einheiten mit genau einem Hauptteil bleiben der Abschnitt „Hauptteil“ mit der
   Erkennung aus der Uhr). Lockere Teile tragen steady: true – sie werden gegen ihre eigene Zone bewertet, zählen aber nicht als „Intervall“
   (Ø der Intervalle, Abfall, Anzahl im Ziel, Scores). Schwimm-Technik (Übungen, Beine) bleibt im Abschnitt „Technik“.
   Damit gespeicherte Zuordnungen (ti) gültig bleiben, stehen die neuen lockeren Ziele HINTER den bisherigen; die Reihenfolge der Einheit
   liefert stepOrder(). */
function isSteadyStep(spec: W.Spec, s: W.Step): boolean {
  if (s.part !== 'main' || s.walkOnly || s.walkMin || isIvStep(spec, s)) return false;
  if (spec.sport === 'swim') return !!s.m && (SWIM_SET_MODES.has(s.mode || 'crawl') || s.mode === 'easy');
  return (spec.sport === 'run' || spec.sport === 'bike') && !!s.min;
}
/** Ziele in der Reihenfolge der Einheit (Schritt, dann Wiederholung) */
export function stepOrder(targets: IvTarget[]): IvTarget[] { return [...targets].sort((a, b) => a.set - b.set || a.rep - b.rep); }
/** nur die harten Wiederholungen (Intervalle im engeren Sinn) */
export const hardTargets = (targets: IvTarget[]) => targets.filter(t => !t.steady);
/** Titel eines lockeren Teils aus der Notiz („Lauf-ABC“) */
function steadyTitle(s: W.Step): string | null {
  const n = String(s.note || '');
  if (/^lauf-abc/i.test(n)) return 'Lauf-ABC';
  return null;
}
export function plannedIntervals(session: any, thr: IvThresholds = {}): IvTarget[] {
  const spec: W.Spec | null = session && session.spec;
  if (!spec || !Array.isArray(spec.steps) || !(spec.sport === 'run' || spec.sport === 'bike' || spec.sport === 'swim')) return [];
  if (spec.kind === 'runwalk' || spec.kind === 'race') return [];
  const ctx: W.PaceCtx = { ...(spec.ctx || {}) };
  const lthr = spec.sport === 'bike' ? thr.lthrBike || ctx.lthrBike : thr.lthrRun || ctx.lthrRun;
  const ftp = thr.ftp || ctx.ftp;
  if (thr.runThrSec) ctx.runThrSec = thr.runThrSec;
  if (thr.css) ctx.css = thr.css;
  const out: IvTarget[] = [];
  // Hauptteil aus mehreren Schritten (ohne Schwimm-Technik): dann gehören auch die lockeren Schritte in den Ablauf
  const withSteady = spec.steps.filter(s => isIvStep(spec, s) || isSteadyStep(spec, s)).length >= 2;
  const mk = (s: W.Step, si: number, steady: boolean) => {
    const zone = Math.max(1, Math.min(5, s.zone || (steady ? 2 : 3)));
    const reps = Math.max(1, s.reps || 1);
    const hrZ = HR_ZONES[zone - 1];
    // Auftrag 38: kurze Wiederholungen ohne Puls-Ziel, bergauf ohne Tempo-Ziel, dafür Ausführung und Gefühl
    const short = W.isShortRep(spec, s), hill = W.isHillStep(spec, s);
    const cue = W.repCue(spec, s); const cueRpe = W.repCueRpe(spec, s); const ttl = steadyTitle(s);
    const hr: [number, number | null] | null = lthr && spec.sport !== 'swim' && !short ? [Math.round(lthr * hrZ.low / 100), hrZ.high >= 999 ? null : Math.round(lthr * hrZ.high / 100)] : null;
    let pace: [number, number] | null = null, power: [number, number] | null = null, speed: [number, number] | null = null, pace100: [number, number] | null = null;
    if (spec.sport === 'run' && ctx.runThrSec && !hill) pace = W.runPaceRange(ctx, zone);
    if (spec.sport === 'bike') {
      if (ftp) {
        if (spec.kind === 'sweetspot' && zone === 3) power = [Math.round(ftp * 0.88), Math.round(ftp * 0.94)];
        else { const pz = POWER_ZONES[zone - 1]; power = [Math.round(ftp * pz.low / 100), Math.round(ftp * (pz.high >= 999 ? 130 : pz.high) / 100)]; }
      }
      if (ctx.bikeKmh && !ctx.indoor && !hill) { const v = W.bikeKmh(ctx, zone); speed = [Math.round(v * 0.95 * 10) / 10, Math.round(v * 1.05 * 10) / 10]; }
    }
    if (spec.sport === 'swim') { const p = W.swimPace(ctx, zone, (s.mode === 'easy' ? 'crawl' : s.mode || 'crawl') as W.StrokeMode, s.gear || []); pace100 = [p - 4, p + 4]; }
    const gearP = spec.sport === 'swim' ? [...new Set([...(s.gear || []), ...(s.mode === 'pull' ? ['buoy'] : [])])] : [];
    const base = { set: si, zone, mode: s.mode || null, pace, power, speed, pace100, hr, rpe: cueRpe || RPE_ZONE[zone], ...(spec.sport === 'swim' ? { stroke: modeToStroke(s.mode), gear: gearP } : {}),
      ...(steady ? { steady: true } : {}), ...(cue ? { cue } : {}), ...(hill ? { hill: true } : {}), ...(ttl ? { title: ttl } : {}) };
    // viele sehr kurze Stücke (30/15, 20×25 m): ein Block statt vieler Zeilen
    const micro = spec.sport === 'swim' ? reps > 10 && (s.m || 0) <= 50 : reps > 8 && (s.min || 0) < 1;
    if (micro) {
      const sec = spec.sport === 'swim' ? null : Math.round(reps * (s.min || 0) * 60 + (reps - 1) * (s.restMin || 0) * 60);
      out.push({ ...base, i: out.length, rep: 0, reps: 1, sec, m: spec.sport === 'swim' ? reps * (s.m || 0) : null, restSec: null,
        label: spec.sport === 'swim' ? `${reps}×${s.m} m` : `${reps}×${minTxt((s.min || 0) * 60)}${s.restMin ? ` / ${minTxt(s.restMin * 60)}` : ''}` });
      return;
    }
    for (let k = 0; k < reps; k++) {
      const last = k === reps - 1;
      const restSec = spec.sport === 'swim' ? (last ? null : s.restSec || null) : last ? null : Math.round(((s.restMin || 0) + (s.walkMin || 0)) * 60) || null;
      out.push({ ...base, i: out.length, rep: k, reps, sec: spec.sport === 'swim' ? null : Math.round((s.min || 0) * 60), m: spec.sport === 'swim' ? s.m || null : null, restSec,
        label: spec.sport === 'swim' ? `${s.m} m${s.mode === 'pull' ? ' Pull Buoy' : s.mode === 'breast' ? ' Brust' : ''}` : minTxt((s.min || 0) * 60) });
    }
  };
  spec.steps.forEach((s, si) => { if (isIvStep(spec, s)) mk(s, si, false); });
  if (out.length > 40) out.length = 40;
  if (withSteady) spec.steps.forEach((s, si) => { if (isSteadyStep(spec, s)) mk(s, si, true); });
  return out;
}

/* ---------- Auftrag 36: tatsächlich gemachte Art, Lage, Hilfsmittel ---------- */
export function modeToStroke(mode: string | null | undefined): IvStroke {
  return mode === 'breast' ? 'breast' : mode === 'kick' ? 'kick' : mode === 'drill' ? 'drill' : mode === 'mixed' ? 'im' : 'crawl';
}
/** Lage + Hilfsmittel → Schwimm-Art der Pace-Rechnung (W.swimPace) */
export function strokeToMode(stroke: IvStroke | null | undefined, gear: string[]): W.StrokeMode {
  if (stroke === 'crawl' || !stroke) return gear.includes('buoy') ? 'pull' : 'crawl';
  return stroke === 'breast' ? 'breast' : stroke === 'kick' ? 'kick' : stroke === 'drill' ? 'drill' : 'mixed';
}
export interface IvAttrs { title: string; stroke: IvStroke | null; gear: string[]; zone: number | null; type: string | null; terrain: string | null; known: boolean; ownTitle: boolean }
const sizeTxt = (x: { sec?: number | null; m?: number | null } | null | undefined, swim: boolean) => !x ? '' : swim ? (x.m ? x.m + ' m' : '') : x.sec ? minTxt(x.sec) : x.m ? x.m + ' m' : '';
/** Was wurde in dieser Wiederholung gemacht? Eigene Angaben zuerst, sonst der Plan. known = Lage ist bekannt (eingetragen oder geplant). */
export function ivAttrs(row: IvRow | null | undefined, t: IvTarget | null | undefined, sport: string): IvAttrs {
  const r: IvRow = row || {};
  const swim = sport === 'swim';
  const stroke = swim ? ((r.stroke as IvStroke) || (t && t.stroke) || null) : null;
  const gear = swim ? (Array.isArray(r.gear) ? r.gear.filter(Boolean) : (t && t.gear) || []) : [];
  const zone = r.zone != null && r.zone >= 1 && r.zone <= 5 ? r.zone : t ? t.zone : null;
  const type = !swim ? (r.type || (t && t.hill ? "hill" : null)) : null, terrain = !swim ? (r.terrain || null) : null;
  const known = !swim || !!stroke;
  const size = sizeTxt(swim ? (r.m ? r : t) : (r.sec || r.m ? r : t), swim);
  const auto = swim ? [size, strokeLabel(stroke), gear.length ? 'mit ' + gear.map(gearLabel).join(' und ') : ''].filter(Boolean).join(' ')
    : [size, t && t.title && !r.type && (r.zone == null || r.zone === t.zone) ? t.title : '', type && type !== 'flat' ? typeLabel(sport, type) : '', zone ? 'Zone ' + zone : ''].filter(Boolean).join(' ');
  const own = !!(r.title && String(r.title).trim());
  return { title: own ? String(r.title).trim() : auto || (t ? t.label : ''), stroke, gear, zone, type, terrain, known, ownTitle: own };
}
/** Was weicht vom Plan ab („mit Pull Buoy statt ohne Hilfsmittel“, „Brust statt Kraul“, „Zone 3 statt 4“, „bergauf“) */
export function ivDiff(a: IvAttrs, t: IvTarget | null, sport: string): string[] {
  if (!t) return [];
  const out: string[] = [];
  if (sport === 'swim') {
    if (a.stroke && t.stroke && a.stroke !== t.stroke) out.push(`${strokeLabel(a.stroke)} statt ${strokeLabel(t.stroke)}`);
    const g0 = [...(t.gear || [])].sort().join(','), g1 = [...a.gear].sort().join(',');
    if (g0 !== g1) out.push(a.gear.length ? `mit ${a.gear.map(gearLabel).join(' und ')}${t.gear && t.gear.length ? ` statt ${t.gear.map(gearLabel).join(' und ')}` : ' statt ohne Hilfsmittel'}` : `ohne Hilfsmittel statt mit ${(t.gear || []).map(gearLabel).join(' und ')}`);
  }
  if (a.zone && a.zone !== t.zone) out.push(`Zone ${a.zone} statt ${t.zone}`);
  if (a.type && a.type !== 'flat' && !(t.hill && a.type === 'hill')) out.push(typeLabel(sport, a.type) || a.type);
  if (a.terrain && sport !== 'swim') out.push(terrainLabel(sport, a.terrain) || a.terrain);
  return out;
}
/** Soll an das tatsächlich Gemachte anpassen (andere Lage, Hilfsmittel oder Zone → anderes Ziel; bergauf/Gelände → kein Tempo-Ziel). */
function retarget(t: IvTarget, a: IvAttrs, sport: string, ctx: W.PaceCtx | null): IvTarget {
  let out = t;
  const zoneChanged = a.zone != null && a.zone !== t.zone;
  if (sport === 'swim') {
    const gearChanged = [...(t.gear || [])].sort().join(',') !== [...a.gear].sort().join(',');
    if (ctx && (zoneChanged || gearChanged || (a.stroke && a.stroke !== t.stroke))) { const z = a.zone || t.zone; const p = W.swimPace(ctx, z, strokeToMode(a.stroke, a.gear), a.gear); out = { ...out, zone: z, pace100: [p - 4, p + 4], rpe: RPE_ZONE[z] }; }
  } else if (zoneChanged) {
    const z = a.zone!; const hrZ = HR_ZONES[z - 1]; const lthr = ctx ? (sport === 'bike' ? ctx.lthrBike : ctx.lthrRun) : null;
    const pz = POWER_ZONES[z - 1];
    out = { ...out, zone: z, rpe: RPE_ZONE[z], hr: lthr ? [Math.round(lthr * hrZ.low / 100), hrZ.high >= 999 ? null : Math.round(lthr * hrZ.high / 100)] : out.hr,
      pace: sport === 'run' && ctx && ctx.runThrSec ? W.runPaceRange(ctx, z) : out.pace,
      power: sport === 'bike' && ctx && ctx.ftp ? [Math.round(ctx.ftp * pz.low / 100), Math.round(ctx.ftp * (pz.high >= 999 ? 130 : pz.high) / 100)] : out.power };
  }
  // bergauf, Gelände, Steigerungen: das Tempo sagt nichts (Hügel, Untergrund), bewertet werden Puls, Watt und Gefühl
  if ((sport === 'run' && (a.type === 'hill' || a.type === 'strides' || a.terrain === 'trail')) || (sport === 'bike' && (a.type === 'hill' || a.terrain === 'hilly'))) out = { ...out, pace: null, speed: null };
  return out;
}
/** Tempo-Rahmen der Einheit (wie plannedIntervals), für das Neu-Rechnen bei anderer Lage oder Zone */
export function ivPaceCtx(session: any, thr: IvThresholds = {}): W.PaceCtx | null {
  const spec: W.Spec | null = session && session.spec; if (!spec) return null;
  const ctx: W.PaceCtx = { ...(spec.ctx || {}) };
  if (thr.runThrSec) ctx.runThrSec = thr.runThrSec;
  if (thr.css) ctx.css = thr.css;
  if (thr.ftp) ctx.ftp = thr.ftp;
  if (thr.lthrRun) ctx.lthrRun = thr.lthrRun;
  if (thr.lthrBike) ctx.lthrBike = thr.lthrBike;
  return ctx;
}
/** Soll-Intervall einer Zeile: über ti, sonst (ältere Listen ohne ti) über die Reihenfolge */
export function targetOfRow(rows: IvRow[], targets: IvTarget[], i: number): IvTarget | null {
  const r = rows[i] || {};
  if (r.ti != null) return targets[r.ti] || null;
  return rows.some(x => x && x.ti != null) ? null : targets[i] || null;
}
/* Sätze: zusammengehörende Wiederholungen (gleiche Satz-Kennung bzw. derselbe Schritt im Plan; ohne beides gleiche Länge und Art) */
export interface IvGroup { key: string; idx: number[]; label: string; attrs: IvAttrs; reps: number; target: IvTarget | null }
function groupLabel(n: number, a: IvAttrs, r: IvRow, t: IvTarget | null, sport: string): string {
  const swim = sport === 'swim';
  const size = sizeTxt(swim ? (r.m ? r : t) : (r.sec || r.m ? r : t), swim);
  const what = swim ? [strokeLabel(a.stroke), a.gear.length ? a.gear.map(gearLabel).join(' + ') : ''].filter(Boolean).join(' · ')
    : [t && t.title && !a.ownTitle && a.zone === t.zone ? t.title : '', a.type && a.type !== 'flat' ? typeLabel(sport, a.type) : '', a.zone && !(t && (t.hill || t.title) && a.zone === t.zone) ? 'Zone ' + a.zone : ''].filter(Boolean).join(' · ');
  const base = `${n > 1 ? n + ' × ' : ''}${size || 'Intervall'}`;
  if (a.ownTitle) return /\d\s*[×x]\s*\d/.test(a.title) || n < 2 ? a.title : `${a.title} (${base})`;
  return [base, what].filter(Boolean).join(' ');
}
export function ivGroups(rows: IvRow[], targets: IvTarget[], sport: string): IvGroup[] {
  const keyOf = (r: IvRow, i: number) => {
    if (r.set != null) return 's' + r.set;
    const t = targetOfRow(rows, targets, i); if (t) return 'p' + t.set;
    const a = ivAttrs(r, null, sport); return 'x' + [sizeOf(r, sport === 'swim'), a.stroke, a.gear.join('+'), a.type, r.zone, r.title || ''].join('|');
  };
  const out: IvGroup[] = [];
  rows.forEach((r0, i) => { const k = keyOf(r0 || {}, i); const last = out[out.length - 1]; if (last && last.key === k) last.idx.push(i); else out.push({ key: k, idx: [i], label: '', attrs: null as any, reps: 0, target: null }); });
  // Satz-Angaben: die häufigste Lage/Hilfsmittel/Zone im Satz (eine abweichende Wiederholung ändert den Satz-Namen nicht)
  out.forEach(g => {
    const sig = (i: number) => { const x = ivAttrs(rows[i], targetOfRow(rows, targets, i), sport); return [x.stroke, x.gear.slice().sort().join('+'), x.zone, x.type, x.terrain, x.ownTitle ? x.title : ''].join('|'); };
    const cnt = new Map<string, number>(); g.idx.forEach(i => cnt.set(sig(i), (cnt.get(sig(i)) || 0) + 1));
    const best = [...cnt.entries()].sort((p, q) => q[1] - p[1])[0][0];
    const i = g.idx.find(k => sig(k) === best) ?? g.idx[0];
    const r = rows[i] || {}; const t = targetOfRow(rows, targets, i);
    g.reps = g.idx.length; g.target = targetOfRow(rows, targets, g.idx[0]) || t; g.attrs = ivAttrs(r, t, sport); g.label = groupLabel(g.reps, g.attrs, r, t, sport);
  });
  return out;
}
/* Schwimmen: was die Wiederholungen über Kraul ohne Hilfsmittel, Pull Buoy und Beinarbeit sagen (Kraul am Stück, CSS, Coach).
   Nur Wiederholungen mit eigenen Werten und bekannter Lage. Kickboard bzw. „Beine“ ist Beinarbeit, nie Kraul; Flossen zählen nicht als Pull. */
export interface SwimIvFacts { crawlMaxM: number | null; pullMaxM: number | null; kickM: number; crawlPace: number | null; crawlPaceM: number; pullPace: number | null; byStroke: Record<string, number>; gear: string[]; aided: boolean; unknown: number }
export function swimIvFacts(rows: IvRow[] | null | undefined, targets: IvTarget[] = []): SwimIvFacts | null {
  const all = rows || [];
  const out: SwimIvFacts = { crawlMaxM: null, pullMaxM: null, kickM: 0, crawlPace: null, crawlPaceM: 0, pullPace: null, byStroke: {}, gear: [], aided: false, unknown: 0 };
  const cp: { v: number; w: number }[] = [], pp: { v: number; w: number }[] = [];
  let any = false;
  all.forEach((r, i) => {
    if (!r || !hasIst(r) || r.aborted) return;
    any = true;
    const t = targetOfRow(all, targets, i);
    const a = ivAttrs(r, t, 'swim');
    const m = num(r.m) ?? (t && t.m) ?? null;
    if (!a.known || !m) { out.unknown++; return; }
    const kick = a.stroke === 'kick' || a.gear.includes('board');
    const key = kick ? 'kick' : a.stroke === 'crawl' && a.gear.includes('buoy') ? 'pull' : a.stroke || 'crawl';
    out.byStroke[key] = (out.byStroke[key] || 0) + m;
    a.gear.forEach(g => { if (!out.gear.includes(g)) out.gear.push(g); });
    if (a.gear.length) out.aided = true;
    const p = r.plan ? null : paceToSec(r.pace100) ?? (num(r.sec) && m ? num(r.sec)! / (m / 100) : null);
    if (kick) { out.kickM += m; return; }
    if (a.stroke !== 'crawl') return;
    if (!a.gear.length) { out.crawlMaxM = Math.max(out.crawlMaxM || 0, m); if (p && m >= 100) cp.push({ v: p, w: m }); }
    else if (a.gear.includes('buoy') && !a.gear.includes('fins')) { out.pullMaxM = Math.max(out.pullMaxM || 0, m); if (p && m >= 100) pp.push({ v: p, w: m }); }
  });
  if (!any) return null;
  out.crawlPace = r0(wavg(cp)); out.crawlPaceM = cp.reduce((s, x) => s + x.w, 0); out.pullPace = r0(wavg(pp));
  return out;
}
/** Auftrag 36: Sätze, die anders gemacht wurden als geplant, in Worten für den Coach
    („Die 4 × 100 m Kraul hast du mit Pull Buoy statt ohne Hilfsmittel geschwommen – …“). Nie „ohne“ behaupten, wenn mit. */
export function ivDiffNotes(e: IvEval | null): string[] {
  if (!e) return [];
  const sport = e.sport; const out: string[] = [];
  const groups: { key: string; lines: IvLine[] }[] = [];
  e.lines.filter(l => l.done && l.diff && l.diff.length && l.target).forEach(l => {
    const key = `${l.target!.set}|${l.diff!.join('|')}`; const g = groups[groups.length - 1];
    if (g && g.key === key) g.lines.push(l); else groups.push({ key, lines: [l] });
  });
  const verb = sport === 'swim' ? 'geschwommen' : sport === 'run' ? 'gelaufen' : 'gefahren';
  for (const g of groups) {
    const t = g.lines[0].target!; const a = g.lines[0].attrs!; const n = g.lines.length;
    const size = sport === 'swim' ? (t.m ? `${t.m} m` : t.label) : t.sec ? minTxt(t.sec) : t.label;
    const what = `${n > 1 ? `${n} × ` : ''}${size}${sport === 'swim' && t.stroke ? ' ' + strokeLabel(t.stroke) : ''}`;
    const conseq: string[] = [];
    if (sport === 'swim') {
      const kick = a.stroke === 'kick' || a.gear.includes('board');
      if (kick) conseq.push('zählt als Beinarbeit, nicht als Kraul');
      else if (a.stroke === 'crawl' && a.gear.includes('buoy')) conseq.push('zählt nicht als Kraul am Stück ohne Hilfsmittel und nur abgeschwächt fürs Kraul-Tempo');
      else if (a.stroke === 'crawl' && a.gear.includes('fins')) conseq.push('mit Flossen zählt es nicht fürs Kraul-Tempo');
      else if (a.stroke && a.stroke !== 'crawl' && t.stroke === 'crawl') conseq.push('zählt nicht als Kraul');
      else if (a.stroke === 'crawl' && !a.gear.length && (t.gear || []).length) conseq.push('das zählt als Kraul ohne Hilfsmittel');
    } else {
      if (a.type === 'hill' || a.terrain === 'trail' || a.terrain === 'hilly') conseq.push('das Tempo zählt dort nicht, bewertet werden Puls' + (sport === 'bike' ? ', Watt' : '') + ' und Gefühl');
      if (a.terrain === 'treadmill') conseq.push('auf dem Laufband zählt das Tempo etwas weniger');
    }
    if (a.zone && a.zone !== t.zone) conseq.push(`bewertet gegen Zone ${a.zone}`);
    out.push(`Die ${what} hast du ${g.lines[0].diff!.join(', ')} ${verb}${conseq.length ? ' – ' + conseq.join('; ') : ''}.`);
  }
  // eigene Titel (z. B. „Bergsprints“) nur erwähnen, wenn nichts anderes dazu gesagt wurde
  return out.slice(0, 4);
}
/** Beim Speichern: Wiederholungen mit Werten bekommen Lage/Hilfsmittel und Strecke bzw. Dauer aus dem Plan, falls nicht selbst angegeben –
    so wissen alle Stellen (auch ohne Plan), was gemacht wurde. */
export function stampRows(rows: IvRow[], targets: IvTarget[], sport: string): IvRow[] {
  return rows.map((r0, i) => {
    const r: IvRow = { ...(r0 || {}) }; const t = targetOfRow(rows, targets, i);
    if (r.ti === undefined) r.ti = rows.some(x => x && x.ti != null) ? null : (targets[i] ? i : null);
    if (r.set == null && t) r.set = t.set;
    // Auftrag 38: lockere Teile kennzeichnen (Scores/Trends zählen sie nicht als Intervall), Liste enthält ab jetzt die ganze Einheit
    if (t && t.steady) r.steady = true; else if (t) delete r.steady;
    r.full = true;
    if (hasIst(r) && t) {
      if (sport === 'swim') { if (r.m == null && t.m) r.m = t.m; if (!r.stroke && t.stroke) r.stroke = t.stroke; if (!Array.isArray(r.gear)) r.gear = [...(t.gear || [])]; }
      else if (r.sec == null && r.m == null && t.sec) r.sec = t.sec;
    }
    return r;
  });
}

/* ---------- Ist aus der Aufzeichnung ---------- */
/** Ein Abschnitt einer Aufzeichnung (Runde oder erkannter Abschnitt) mit optionalen Zusatzwerten. */
export type Seg = LapOut & { endHr?: number | null; cad?: number | null; spl?: number | null };
/** Harte Abschnitte mit den Pausen dazwischen: Runden der Uhr, sonst Abschnitte aus dem Verlauf. */
export function detectedSegments(a: any): { segs: Seg[]; from: IvSource } {
  if (!a) return { segs: [], from: 'none' };
  const laps: Seg[] = Array.isArray(a.laps) ? a.laps : [];
  const sport = a.sport;
  if (laps.length >= 2 && !isAutoLaps(laps as any)) {
    let k: Seg[] = laps;
    if (sport === 'swim') {
      // Schwimmen: jede geschwommene Runde ist eine Serie (die Uhr setzt pro Serie eine Runde), Pausen-Runden trennen
      k = laps.map(l => (l.m === 0 ? { ...l, kind: 'rest' as const } : l.kind === 'steady' || l.kind === 'warmup' || l.kind === 'cooldown' ? { ...l, kind: 'work' as const } : l)); // 0 m = Pause (Auftrag 37)
      if (k.some(l => l.kind === 'work')) return { segs: k, from: a.source === 'intervals' ? 'icu' : 'watch' };
    }
    if (!k.some(l => l.kind === 'work') && (sport === 'run' || sport === 'bike')) {
      const usePower = sport === 'bike' && laps.filter(l => l.power).length > laps.length * 0.5;
      k = lapKinds(laps, usePower) as Seg[];
    }
    if (k.some(l => l.kind === 'work')) {
      const pf = a.pattern && a.pattern.from;
      const watch = pf ? pf === 'watch' : laps.some(l => l.kind === 'rest' || l.kind === 'warmup' || l.kind === 'cooldown');
      return { segs: k, from: a.source === 'intervals' ? 'icu' : watch ? 'watch' : 'laps' };
    }
  }
  const segs: Seg[] = Array.isArray(a.segments) ? a.segments : [];
  if (segs.some(s => s.kind === 'work')) return { segs, from: 'stream' };
  return { segs: [], from: 'none' };
}
/** Abschnitte → Intervall-Zeilen (Pause = folgende lockere Abschnitte bis zum nächsten harten) */
export function rowsFromSegments(segs: Seg[], sport: string): IvRow[] {
  const rows: IvRow[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]; if (s.kind !== 'work') continue;
    const row: IvRow = { sec: s.sec ? Math.round(s.sec) : null, m: s.m != null ? Math.round(s.m) : null, hr: s.avgHr ?? null, maxHr: s.maxHr ?? null, cad: s.cad ?? null };
    if (sport === 'run' && s.speed) row.pace = secToPace(1000 / s.speed);
    if (sport === 'bike') { if (s.power) row.power = Math.round(s.power); if (s.speed) row.speed = Math.round(s.speed * 36) / 10; }
    if (sport === 'swim') { if (s.speed) row.pace100 = secToPace(100 / s.speed); else if (s.m && s.sec) row.pace100 = secToPace(s.sec / (s.m / 100)); if (s.spl) row.spl = s.spl; }
    let rest = 0, restHr: number | null = null, j = i + 1;
    while (j < segs.length && segs[j].kind === 'rest') { rest += segs[j].sec || 0; const h = segs[j].endHr ?? segs[j].avgHr ?? null; if (h != null) restHr = restHr == null ? h : Math.min(restHr, h); j++; }
    // nach dem letzten harten Abschnitt ist es Ausfahren/Auslaufen, keine Pause
    if (!segs.slice(j).some(x => x.kind === 'work')) rest = 0;
    if (rest > 0) { row.restSec = Math.round(rest); row.restHr = restHr != null ? Math.round(restHr) : null; }
    rows.push(row);
  }
  return rows;
}

/* ---------- Zuordnung Ist → Soll ---------- */
const sizeOf = (x: { sec?: number | null; m?: number | null }, swim: boolean) => (swim ? x.m || null : x.sec || null);
/** Ausrichtung in Reihenfolge: jedes Soll höchstens ein Ist; Ist ohne Soll vorne/hinten = Ein-/Auslaufen, dazwischen = zusätzlich. */
export function alignRows(targets: IvTarget[], rows: IvRow[], sport: string): { pairs: (number | null)[]; extra: number[] } {
  const swim = sport === 'swim';
  const n = targets.length, m = rows.length;
  if (!n) return { pairs: [], extra: rows.map((_, j) => j) };
  const cost = (i: number, j: number) => {
    const a = sizeOf(targets[i], swim), b = sizeOf(rows[j], swim) ?? (swim ? null : null);
    if (!a || !b) return 0.3;
    return Math.min(1.5, Math.abs(Math.log(b / a)));
  };
  const SKIP_T = 0.75, SKIP_R = 0.55;
  const D: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const P: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) { D[i][0] = i * SKIP_T; P[i][0] = 1; }
  for (let j = 1; j <= m; j++) { D[0][j] = j * SKIP_R; P[0][j] = 2; }
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const a = D[i - 1][j - 1] + cost(i - 1, j - 1), b = D[i - 1][j] + SKIP_T, c = D[i][j - 1] + SKIP_R;
    if (a <= b && a <= c) { D[i][j] = a; P[i][j] = 0; } else if (b <= c) { D[i][j] = b; P[i][j] = 1; } else { D[i][j] = c; P[i][j] = 2; }
  }
  const pairs: (number | null)[] = new Array(n).fill(null);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const p = i === 0 ? 2 : j === 0 ? 1 : P[i][j];
    if (p === 0) { pairs[i - 1] = j - 1; i--; j--; } else if (p === 1) i--; else j--;
  }
  // nicht zugeordnete Ist-Abschnitte: zusätzlich, wenn sie wie ein Intervall aussehen (Größe wie die geplanten, ±50 %)
  const used = new Set(pairs.filter((x): x is number => x != null));
  const sizes = targets.map(t => sizeOf(t, swim)).filter((x): x is number => !!x).sort((a, b) => a - b);
  const med = sizes.length ? sizes[Math.floor(sizes.length / 2)] : null;
  const extra = rows.map((_, k) => k).filter(k => !used.has(k) && (() => { const b = sizeOf(rows[k], swim); return !med || !b ? false : b >= med * 0.5 && b <= med * 1.5; })());
  return { pairs, extra };
}

/* ---------- Welche Ist-Werte gelten? ---------- */
const hasIst = (r: IvRow | null | undefined) => !!r && ['sec', 'm', 'hr', 'maxHr', 'pace', 'power', 'speed', 'pace100', 'cad', 'spl', 'rpe'].some(k => (r as any)[k] != null && (r as any)[k] !== '');
/** Liste von Hand (metrics.intervals mit Quelle „von Hand“) oder automatisch aus der Aufzeichnung bzw. von intervals.icu. */
/** Auftrag 37 (Release-Fund): Zeile mit 0 m ist keine geschwommene Wiederholung. Die Uhr meldet Bahnen ohne Strecke (Abstoßen, Stehen am
   Rand) manchmal als aktiv; solche Zeilen zählen beim Schwimmen zur Pause der Wiederholung davor. Bei Laufen/Rad heißt 0 m „nicht gemessen“.
   Gilt beim Lesen, gespeicherte Daten bleiben unverändert (beim nächsten Speichern im Ablauf sind sie sauber). */
export function cleanIvRows(rows: IvRow[], sport?: string | null): IvRow[] {
  if (!Array.isArray(rows) || !rows.some(r => r && r.m === 0 && !(r as any).plan)) return rows;
  const out: IvRow[] = [];
  for (const r of rows) {
    if (!r || r.m !== 0 || (r as any).plan) { out.push(r); continue; }
    if (sport !== 'swim') { out.push({ ...r, m: null }); continue; }
    const prev = out[out.length - 1];
    const add = (num(r.sec) || 0) + (num(r.restSec) || 0);
    if (prev && add > 0) out[out.length - 1] = { ...prev, restSec: Math.round((num(prev.restSec) || 0) + add), restHr: prev.restHr ?? (r.restHr ?? r.hr ?? null) };
  }
  return out;
}
export function actualRows(st: any, act: any, sportIn?: string | null): { rows: IvRow[]; source: IvSource; aligned: boolean } {
  const sport = sportIn || (act && act.sport) || (st && st.sport) || null;
  const r = actualRowsRaw(st, act);
  return { ...r, rows: cleanIvRows(r.rows, sport) };
}
function actualRowsRaw(st: any, act: any): { rows: IvRow[]; source: IvSource; aligned: boolean } {
  const m = (st && st.metrics) || {};
  const manual = !!(st && ((st.metricsSrc || {}).intervals === 'manual' || (st.metricsManual || {}).intervals));
  if (manual) return { rows: Array.isArray(m.intervals) ? m.intervals : [], source: 'manual', aligned: true };
  if (act) {
    const d = detectedSegments(act);
    if (d.segs.length) return { rows: rowsFromSegments(d.segs, act.sport), source: d.from, aligned: false };
  }
  // Auftrag 37: „wie geplant“ – nur solange die Uhr nichts gemessen hat (Uhrdaten haben Vorrang)
  if (((st && st.metricsSrc) || {}).intervals === 'plan' && Array.isArray(m.intervals)) return { rows: m.intervals, source: 'plan', aligned: true };
  if (Array.isArray(m.intervals) && m.intervals.length) return { rows: m.intervals, source: (st.metricsSrc || {}).intervals === 'intervals' ? 'icu' : 'watch', aligned: false };
  return { rows: [], source: 'none', aligned: true };
}

/* ---------- Bewertung je Intervall ---------- */
function judge(t: IvTarget | null, r: IvRow, sport: IvSport): { v: IvVerdict; why: string; zone?: 'faster' | 'slower' } {
  const j = judge0(t, r, sport);
  // Leistung neben dem Ziel, aber Puls (ab 3 min aussagekräftig) im Zielbereich: nicht zu hart/zu locker, sondern Zonen-Hinweis
  if (t && t.hr && r.hr && (j.v === 'hard' || j.v === 'easy') && (sizeOf(r, sport === 'swim') || sizeOf(t, sport === 'swim') || 0) >= 180 && sport !== 'swim') {
    const hi = t.hr[1] ?? 999;
    if (r.hr >= t.hr[0] - 3 && r.hr <= hi + 3) return { v: 'ok', why: `${j.why}, Puls ${Math.round(r.hr)} im Ziel`, zone: j.v === 'hard' ? 'faster' : 'slower' };
  }
  return j;
}
function judge0(t: IvTarget | null, r: IvRow, sport: IvSport): { v: IvVerdict; why: string } {
  if (!t) return { v: null, why: '' };
  const size = sizeOf(t, sport === 'swim'), got = sizeOf(r, sport === 'swim');
  if (r.aborted || (size && got && got < size * 0.8)) return { v: 'short', why: got ? `${sport === 'swim' ? got + ' m' : minTxt(got)} statt ${sport === 'swim' ? size + ' m' : minTxt(size!)}` : 'abgebrochen' };
  const between = (x: number, lo: number, hi: number, tol: number) => (x < lo * (1 - tol) ? -1 : x > hi * (1 + tol) ? 1 : 0);
  // Reihenfolge: Leistung (Pace/Watt), dann Puls (nicht bei sehr kurzen Stücken, der Puls kommt zu spät), dann RPE
  // Auftrag 36: ohne eingetragene Pace aus Dauer und Strecke (z. B. „ganzer Satz in 1:50“)
  const runP = paceToSec(r.pace) ?? (num(r.sec) && num(r.m) ? num(r.sec)! / (num(r.m)! / 1000) : null);
  const swimP = paceToSec(r.pace100) ?? (num(r.sec) && (num(r.m) || t.m) ? num(r.sec)! / ((num(r.m) || t.m)! / 100) : null);
  if (sport === 'run' && t.pace && runP != null) {
    const p = runP; const c = between(p, t.pace[0], t.pace[1], 0.02);
    return { v: c < 0 ? 'hard' : c > 0 ? 'easy' : 'ok', why: `${secToPace(p)}/km (Ziel ${secToPace(t.pace[0])}-${secToPace(t.pace[1])})` };
  }
  if (sport === 'bike' && t.power && r.power) {
    const c = between(r.power, t.power[0], t.power[1], 0.02);
    return { v: c > 0 ? 'hard' : c < 0 ? 'easy' : 'ok', why: `${Math.round(r.power)} W (Ziel ${t.power[0]}-${t.power[1]} W)` };
  }
  if (sport === 'swim' && t.pace100 && swimP != null) {
    const p = swimP; const c = p < t.pace100[0] - 2 ? -1 : p > t.pace100[1] + 2 ? 1 : 0;
    return { v: c < 0 ? 'hard' : c > 0 ? 'easy' : 'ok', why: `${secToPace(p)}/100 m (Ziel ${secToPace(t.pace100[0])}-${secToPace(t.pace100[1])})` };
  }
  const longEnough = (got || size || 0) >= (sport === 'swim' ? 200 : 180);
  if (t.hr && r.hr && longEnough) {
    const hi = t.hr[1] ?? 999; const c = r.hr < t.hr[0] - 3 ? -1 : r.hr > hi + 3 ? 1 : 0;
    return { v: c > 0 ? 'hard' : c < 0 ? 'easy' : 'ok', why: `Puls ${Math.round(r.hr)} (Ziel ${t.hr[0]}${t.hr[1] ? `-${t.hr[1]}` : '+'})` };
  }
  if (r.rpe != null) { const c = r.rpe < t.rpe[0] ? -1 : r.rpe > t.rpe[1] ? 1 : 0; return { v: c > 0 ? 'hard' : c < 0 ? 'easy' : 'ok', why: `Gefühl ${r.rpe}/10 (Ziel ${t.rpe[0]}-${t.rpe[1]})` }; }
  return { v: null, why: '' };
}
/** Leistungswert eines Intervalls für Vergleiche (höher = stärker): Laufen/Schwimmen Tempo (m/s), Rad Watt, sonst km/h */
function perf(r: IvRow, sport: IvSport): number | null {
  if (sport === 'run') { const p = paceToSec(r.pace) ?? (r.m && r.sec ? r.sec / (r.m / 1000) : null); return p ? 1000 / p : null; }
  if (sport === 'bike') return num(r.power) ?? num(r.speed);
  const p = paceToSec(r.pace100) ?? (r.m && r.sec ? r.sec / (r.m / 100) : null); return p ? 100 / p : null;
}

/** Auftrag 38: lockerer Teil statt Intervall (Ziel steady bzw. ohne Ziel in Zone 1-2) */
export const steadyRow = (r: IvRow | null | undefined) => !!r && (!!r.steady || (r.zone != null && r.zone <= 2));
const steadyLine = (l: IvLine) => (l.target ? !!l.target.steady && !(l.row && l.row.zone != null && l.row.zone >= 3) : steadyRow(l.row));
/* ---------- Alles zusammen ---------- */
export function evaluateIntervals(session: any, st: any, act: any, thr: IvThresholds = {}, sportIn?: string): IvEval | null {
  const sport = (sportIn || (session && session.sport) || (act && act.sport)) as IvSport;
  if (sport !== 'run' && sport !== 'bike' && sport !== 'swim') return null;
  const targets = plannedIntervals(session, thr);
  const ar = actualRows(st, act, sport);
  if (!targets.length && !ar.rows.some(hasIst)) return null;
  // ohne Plan zählen Abschnitte aus dem Verlauf nur bei erkanntem Intervalltraining (sonst z. B. zwei Stopps an der Ampel)
  if (!targets.length && ar.source === 'stream' && !(act && act.pattern && ['intervals', 'fartlek', 'hills'].includes(act.pattern.type))) return null;
  const lines: IvLine[] = [];
  // Auftrag 36: bewertet wird, was wirklich gemacht wurde (andere Lage, Hilfsmittel, Zone, bergauf → passendes Ziel); die Abweichung bleibt sichtbar
  const pctx = ivPaceCtx(session, thr);
  const doneLine = (t: IvTarget | null, r: IvRow): IvLine => {
    const a = ivAttrs(r, t, sport); const diff = ivDiff(a, t, sport);
    // Auftrag 37: „wie geplant“ eingetragen – kein Messwert, also kein Urteil über Tempo oder Puls
    const j: { v: IvVerdict; why: string; zone?: 'faster' | 'slower' } = r.plan ? { v: t ? 'plan' : null, why: 'wie geplant eingetragen (nicht gemessen)' } : judge(t ? retarget(t, a, sport, pctx) : null, r, sport);
    return { target: t, row: r, verdict: j.v, why: j.why, extra: !t, done: true, ...(j.zone ? { zone: j.zone } : {}), attrs: a, ...(diff.length ? { diff } : {}) };
  };
  // Auftrag 38: Reihenfolge der Einheit (lockere Teile stehen in targets hinten, im Ablauf an ihrer Stelle)
  const ord = stepOrder(targets); const posOf = new Map(ord.map((t, k) => [t.i, k]));
  if (ar.aligned && ar.rows.some(r => r && r.ti != null)) {
    // von Hand mit Zuordnung (ti): Reihenfolge der Liste, nicht eingetragene Soll-Intervalle an ihrer Stelle
    const used = new Set(ar.rows.filter(r => r && hasIst(r) && r.ti != null).map(r => r.ti!));
    let next = 0;
    const flush = (upto: number) => { for (; next < upto; next++) { const t = ord[next]; if (!used.has(t.i)) lines.push({ target: t, row: null, verdict: 'missing', why: 'nicht eingetragen', extra: false, done: false }); } };
    ar.rows.forEach(r => {
      if (!r || !hasIst(r)) return;
      const t = r.ti != null ? targets[r.ti] || null : null;
      if (t) { const p = posOf.get(t.i)!; flush(p); if (next <= p) next = p + 1; }
      lines.push(doneLine(t, r));
    });
    flush(ord.length);
  } else if (ar.aligned) {
    // von Hand (ältere Listen ohne Zuordnung): Zeile i gehört zum i-ten Intervall, weitere Zeilen sind zusätzlich
    const hard = hardTargets(targets); const hIdx = new Map(hard.map((t, k) => [t.i, k]));
    ord.forEach(t => {
      const r = t.steady ? null : ar.rows[hIdx.get(t.i)!] || null;
      if (r && hasIst(r)) lines.push(doneLine(t, r));
      else lines.push({ target: t, row: r, verdict: 'missing', why: 'nicht eingetragen', extra: false, done: false });
    });
    for (let k = hard.length; k < ar.rows.length; k++) { const r = ar.rows[k]; if (r && hasIst(r)) lines.push(doneLine(null, r)); }
  } else {
    // aus der Uhr: nur die harten Wiederholungen werden den Runden zugeordnet; lockere Teile bleiben ohne eigenes Urteil
    const hard = hardTargets(targets);
    const { pairs, extra } = alignRows(hard, ar.rows, sport);
    const pairOf = new Map(hard.map((t, k) => [t.i, pairs[k]]));
    const items: { at: number; line: IvLine }[] = [];
    let lastAt = -1;
    ord.forEach(t => {
      if (t.steady) { lastAt += 0.001; items.push({ at: lastAt, line: { target: t, row: null, verdict: null, why: '', extra: false, done: false } }); return; }
      const j = pairOf.get(t.i); const r = j == null ? null : ar.rows[j];
      if (r && hasIst(r)) { const v = judge(t, r, sport); lastAt = j!; items.push({ at: j!, line: { target: t, row: r, verdict: v.v, why: v.why, extra: false, done: true, ...(v.zone ? { zone: v.zone } : {}) } }); }
      else { lastAt += 0.001; items.push({ at: lastAt, line: { target: t, row: null, verdict: 'missing', why: 'nicht gefunden', extra: false, done: false } }); }
    });
    extra.forEach(j => items.push({ at: j, line: { target: null, row: ar.rows[j], verdict: null, why: '', extra: true, done: true } }));
    items.sort((a, b) => a.at - b.at).forEach(x => lines.push(x.line));
  }
  // Auftrag 38: lockere Teile (aus lockeren Hauptteil-Schritten bzw. selbst eingetragen in Zone 1-2) zählen nicht als Intervall
  const IL = lines.filter(l => !steadyLine(l));
  const doneLines = IL.filter(l => l.done && l.row);
  // Auftrag 37: Durchschnitte und Verlauf nur aus echten Werten (nicht aus „wie geplant“)
  const measured = doneLines.filter(l => !l.row!.plan);
  const full = measured.filter(l => l.verdict !== 'short');
  const work = measured.map(l => l.row!);
  const w = (k: keyof IvRow) => r1(wavg(work.map(r => ({ v: num(r[k]), w: num(r.sec) || num(r.m) || 1 }))));
  const paces = work.map(r => ({ v: paceToSec(r.pace) ?? (r.m && r.sec && sport === 'run' ? r.sec / (r.m / 1000) : null), w: num(r.sec) || 1 }));
  const p100 = work.map(r => ({ v: paceToSec(r.pace100) ?? (r.m && r.sec && sport === 'swim' ? r.sec / (r.m / 100) : null), w: num(r.m) || 1 }));
  const perfs = full.map(l => perf(l.row!, sport));
  const p1 = perfs.find(x => x != null) ?? null, pN = [...perfs].reverse().find(x => x != null) ?? null;
  const hrs = full.map(l => num(l.row!.hr)).filter((x): x is number => x != null);
  const rec = measured.map(l => { const r = l.row!; const top = num(r.maxHr) ?? num(r.hr); return top != null && num(r.restHr) != null && r.restSec ? top - num(r.restHr)! : null; }).filter((x): x is number => x != null);
  const restRows = work.filter(r => num(r.restSec));
  return {
    sport, source: ar.source, planned: hardTargets(targets).length, done: doneLines.filter(l => !l.extra).length, extra: IL.filter(l => l.extra).length,
    missing: IL.filter(l => l.verdict === 'missing').length, short: IL.filter(l => l.verdict === 'short').length,
    inTarget: IL.filter(l => l.verdict === 'ok').length, tooHard: IL.filter(l => l.verdict === 'hard').length, tooEasy: IL.filter(l => l.verdict === 'easy').length,
    judged: IL.filter(l => l.verdict === 'ok' || l.verdict === 'hard' || l.verdict === 'easy').length, asPlanned: IL.filter(l => l.verdict === 'plan').length,
    zoneFaster: IL.filter(l => l.zone === 'faster').length, zoneSlower: IL.filter(l => l.zone === 'slower').length,
    lines,
    work: { sec: r0(avg(work.map(r => num(r.sec)))), hr: r0(w('hr')), maxHr: r0(avg(work.map(r => num(r.maxHr)))), paceSec: r0(wavg(paces)), power: r0(w('power')), speed: w('speed'), pace100: r0(wavg(p100)), cad: r0(w('cad')), rpe: r1(avg(work.map(r => num(r.rpe)))) },
    rest: { sec: r0(avg(restRows.map(r => num(r.restSec)))), hr: r0(avg(restRows.map(r => num(r.restHr)))) },
    fadePct: full.length >= 2 && p1 && pN ? r1((1 - pN / p1) * 100) : null,
    hrRise: hrs.length >= 2 ? Math.round(hrs[hrs.length - 1] - hrs[0]) : null,
    recovery: rec.length ? Math.round(avg(rec)!) : null
  };
}

/* Zeilen als Runden (für Scores, Trends und die bestehende Intervall-Statistik): harte Teile „work“, Pausen „rest“ */
export function rowsToLaps(rows: IvRow[], sport: string): LapOut[] {
  const out: LapOut[] = []; let n = 1;
  for (const r of rows || []) {
    if (!hasIst(r) || r.plan) continue;
    const sec = num(r.sec), m = num(r.m);
    let speed: number | null = null;
    if (sport === 'run') { const p = paceToSec(r.pace); speed = p ? 1000 / p : m && sec ? m / sec : null; }
    else if (sport === 'bike') speed = num(r.speed) != null ? num(r.speed)! / 3.6 : m && sec ? m / sec : null;
    else { const p = paceToSec(r.pace100); speed = p ? 100 / p : m && sec ? m / sec : null; }
    const s = sec ?? (m && speed ? m / speed : null);
    out.push({ n: n++, sec: s != null ? Math.round(s) : 0, m: m ?? (s && speed ? Math.round(s * speed) : null), avgHr: num(r.hr), maxHr: num(r.maxHr), speed: speed != null ? Math.round(speed * 100) / 100 : null, power: num(r.power), kind: steadyRow(r) ? 'steady' : 'work' });
    if (num(r.restSec)) out.push({ n: n++, sec: Math.round(num(r.restSec)!), m: null, avgHr: num(r.restHr), maxHr: null, speed: null, power: null, kind: 'rest' });
  }
  return out;
}
/** Kurzform (wie IntervalOut aus der Aufzeichnung) für Stellen, die nur die Zusammenfassung brauchen */
export function evalToIntervalOut(e: IvEval | null): IntervalOut | null {
  if (!e || e.done + e.extra < 1) return null;
  const work = e.lines.filter(l => l.done && l.row && !l.row.plan && !steadyLine(l)); if (!work.length) return null;
  const hr1 = num(work[0]?.row?.hr), hrN = num(work[work.length - 1]?.row?.hr);
  return { count: work.length, workSec: Math.round(work.reduce((a, l) => a + (num(l.row!.sec) || 0), 0)), avgHrWork: e.work.hr, hrDriftPct: hr1 && hrN && work.length >= 2 ? r1((hrN / hr1 - 1) * 100) : null, dropPct: e.fadePct, recoveryHrDrop: e.recovery, lapsHr: work.map(l => num(l.row!.hr)) };
}
/** Hat diese Einheit von Hand eingetragene Intervalle? */
export const manualIntervals = (st: any): IvRow[] | null => (st && ((st.metricsSrc || {}).intervals === 'manual' || (st.metricsManual || {}).intervals) && Array.isArray((st.metrics || {}).intervals) ? st.metrics.intervals.filter(hasIst) : null);
export { hasIst as rowHasValues };

/* ---------- Eingabe prüfen (eine Zeile) ---------- */
export const IV_LIMITS: Record<string, [number, number]> = { sec: [5, 4 * 3600], m: [10, 100000], hr: [30, 230], maxHr: [30, 230], restHr: [30, 230], power: [20, 2000], speed: [3, 80], cad: [20, 230], spl: [4, 80], rpe: [1, 10], restSec: [0, 3600] };
/* Auftrag 34: Grenzen je Sportart. Schwimm-Zugfrequenz liegt oft bei 15–40 Zügen/min (Brust, ruhiges Kraul); die Lauf-/Rad-Grenze ab 20
   meldete echte Schwimm-Abschnitte (16 Züge/min) als „widersprüchlich“. */
export const ivLimit = (k: string, sport?: string | null): [number, number] | undefined => k === 'cad' && sport === 'swim' ? [5, 80] : IV_LIMITS[k];

/* ---------- intervals.icu: erkannte Abschnitte (icu_intervals) ----------
   Typ WORK = hart, RECOVERY/REST = Pause, sonst Ein-/Auslaufen. Gleich lange „harte“ Abschnitte ohne Pausen (automatische Runden) zählen nicht. */
export function segmentsFromIcu(list: any[], sport: string): Seg[] {
  const ok = (v: any) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  const segs: Seg[] = (Array.isArray(list) ? list : []).filter(x => x && (ok(x.moving_time) || ok(x.elapsed_time))).map((x: any, i: number) => {
    const ty = String(x.type || '').toUpperCase();
    const kind: LapOut['kind'] = ty === 'WORK' ? 'work' : ty === 'RECOVERY' || ty === 'REST' ? 'rest' : ty === 'WARMUP' ? 'warmup' : ty === 'COOLDOWN' ? 'cooldown' : 'steady';
    const sec = ok(x.moving_time) || ok(x.elapsed_time)!;
    const cad = ok(x.average_cadence);
    return { n: i + 1, sec: Math.round(sec), m: ok(x.distance) != null ? Math.round(x.distance) : null, avgHr: ok(x.average_heartrate) != null ? Math.round(x.average_heartrate) : null, maxHr: ok(x.max_heartrate) != null ? Math.round(x.max_heartrate) : null,
      speed: ok(x.average_speed), power: ok(x.average_watts) != null ? Math.round(x.average_watts) : null, kind,
      ...(cad ? { cad: Math.round(sport === 'run' && cad < 120 ? cad * 2 : cad) } : {}) };
  });
  const work = segs.filter(s => s.kind === 'work');
  if (!work.length || (!segs.some(s => s.kind === 'rest') && isAutoLaps(work as any))) return [];
  return segs;
}
