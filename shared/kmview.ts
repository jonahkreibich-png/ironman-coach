/* Auftrag 35, Punkt 3: Lauf- und Radeinheiten wahlweise in Minuten oder km (Plan, Heute, Einheit geöffnet), auch Intervalle:
   „4 × 600 m in ca. 2:50, dazwischen 300 m traben“ statt „4 × 3 min“. Zieltempo je Abschnitt bzw. Zone aus den eigenen Werten
   (Schwellen-Tempo, Zonen; shared/workouts runPace/bikeKmh mit dem Kontext der Einheit), dazu die Zeit pro Wiederholung.
   Ohne gemessene Schwelle steht „geschätzt“ und das Gefühl (RPE) dabei.
   Eine Quelle für beide Ansichten: kmPlan() rundet die Strecken je Stück und rechnet daraus die Zeit. Die Minuten-Ansicht nennt als
   „ca. … km“ genau diese Summe, die km-Ansicht als „ca. … min“ die Zeit – so passen Gesamtstrecke und -dauer in beiden Ansichten. */
import * as W from './workouts';

export type PlanView = 'min' | 'km';
export interface KmLine { part: W.Step['part']; text: string; km: number; min: number }
export interface KmPlan { lines: KmLine[]; km: number; min: number; estimated: boolean }
const RPE: Record<number, string> = { 1: '2-3', 2: '3-4', 3: '5-6', 4: '7-8', 5: '9' };
const ZWORD: Record<number, string> = { 1: 'ganz locker', 2: 'locker', 3: 'zügig', 4: 'an der Schwelle', 5: 'sehr hart' };
const mmss = (s: number) => { const r = Math.round(s / 5) * 5; return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
const de = (x: number, d = 1) => String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ',');

/* Auftrag 38: Runden und Text der Strecke kommen aus shared/workouts (eine Stelle, auch für die Zeilen „4×3 min (ca. 600 m)“) */
export const roundKm = W.roundKm;
export const distTxt = W.distTxt;
/** Sekunden pro km (Laufen) bzw. km/h (Rad) einer Zone aus dem Kontext der Einheit */
function speedOf(spec: W.Spec, zone: number): number | null {
  if (spec.sport === 'run') return W.runPace(spec.ctx, zone);
  if (spec.sport === 'bike') return spec.ctx && !spec.ctx.indoor && !spec.noDistance ? W.bikeKmh(spec.ctx, zone) : null;
  return null;
}
const secForKm = (spec: W.Spec, zone: number, km: number) => { const v = speedOf(spec, zone)!; return spec.sport === 'run' ? km * v : km / v * 3600; };
const kmForMin = (spec: W.Spec, zone: number, min: number) => { const v = speedOf(spec, zone)!; return spec.sport === 'run' ? min * 60 / v : min / 60 * v; };
function target(spec: W.Spec, zone: number, est: boolean): string {
  let t = '';
  if (spec.sport === 'run') { const r = W.runPaceRange(spec.ctx, zone); t = `${mmss(r[0])}–${mmss(r[1])}/km`; }
  else { const v = W.bikeKmh(spec.ctx, zone); t = `ca. ${de(v * 0.95, 0)}–${de(v * 1.05, 0)} km/h flach`; }
  return est ? `${t}, geschätzt – nach Gefühl ${RPE[zone] || '3-4'}/10` : t;
}

/** km-Ansicht einer Einheit; null, wenn sie nicht in km geht (Rolle drinnen, Lauf-Geh-Wechsel, Schwimmen, Kraft) */
export function kmPlan(spec: W.Spec | null | undefined, o: { estimated?: boolean } = {}): KmPlan | null {
  if (!spec || !Array.isArray(spec.steps) || (spec.sport !== 'run' && spec.sport !== 'bike')) return null;
  if (spec.kind === 'race' || spec.kind === 'runwalk' || spec.steps.some(s => s.walkMin || s.walkOnly || !s.min)) return null;
  if (speedOf(spec, 2) == null) return null;
  const est = !!o.estimated; const run = spec.sport === 'run';
  const lines: KmLine[] = [];
  for (const s of spec.steps) {
    const z = s.zone || 2; const reps = s.reps || 1;
    const d = roundKm(spec.sport, kmForMin(spec, z, s.min || 0));
    const sec = secForKm(spec, z, d);
    let km = reps * d, t = reps * sec;
    let rest = '';
    if (reps > 1 && s.restMin) {
      const rk = roundKm(spec.sport, kmForMin(spec, 1, s.restMin));
      if (rk >= (run ? 0.2 : 0.5)) { km += (reps - 1) * rk; t += (reps - 1) * secForKm(spec, 1, rk); rest = `, dazwischen ${distTxt(rk)} ${run ? 'traben' : 'locker rollen'}`; }
      else { t += (reps - 1) * s.restMin * 60; km += (reps - 1) * kmForMin(spec, 1, s.restMin); rest = `, dazwischen ${W.minTxt(s.restMin)} ${run ? 'locker zurück' : 'locker rollen'}`; }
    }
    const word = s.part === 'warm' ? (run ? 'einlaufen' : 'einrollen') : s.part === 'cool' ? (run ? 'auslaufen' : 'ausrollen') : ZWORD[z] || 'locker';
    const each = reps > 1 ? ` in ca. ${mmss(sec)}` : (s.part === 'main' && d >= (run ? 0.4 : 2)) ? ` (ca. ${Math.round(sec / 60)} min)` : '';
    const text = `${reps > 1 ? `${reps} × ${distTxt(d)}` : distTxt(d)} ${word}${each} (${target(spec, z, est && s.part === 'main')})${rest}${s.note ? ', ' + s.note : ''}`;
    lines.push({ part: s.part, text, km, min: t / 60 });
  }
  return { lines, km: Math.round(lines.reduce((a, l) => a + l.km, 0) * 10) / 10, min: Math.round(lines.reduce((a, l) => a + l.min, 0)), estimated: est };
}
/** Gesamtzeile je Ansicht: Minuten „60 min, ca. 9,5 km“ bzw. km „9,5 km, ca. 59 min“ (dieselben Zahlen) */
export function totalLine(spec: W.Spec | null | undefined, view: PlanView, plannedMin?: number | null, o: { estimated?: boolean } = {}): string {
  const k = kmPlan(spec, o); if (!k) return '';
  return view === 'km' ? `${de(k.km)} km, ca. ${k.min} min` : `${plannedMin || W.totals(spec!).min} min, ca. ${de(k.km)} km`;
}
/** Sind die Tempo-Vorgaben geschätzt (keine gemessene Schwelle)? */
export function paceEstimated(profile: any, sport: string): boolean {
  const est: string[] = (profile && profile.thresholds && profile.thresholds.estimated) || [];
  return sport === 'run' ? est.includes('thresholdPaceRunSec') : sport === 'bike' ? est.includes('thresholdSpeedBikeKmh') : false;
}
