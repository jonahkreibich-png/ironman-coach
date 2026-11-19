/* Auftrag 35, Punkt 3: Lauf- und Radeinheiten mit Minuten und km. Auftrag 38: der Umschalter „Minuten | km“ ist entfernt – überall stehen
   beide Angaben („35 min · ca. 4,8 km“, Intervalle „4×3 min (ca. 600 m)“), ein Umschalter änderte nichts Sinnvolles mehr.
   Rechnung: shared/kmview.ts (Gesamtstrecke) und shared/workouts.ts (Strecke je Stück). Eine alte Einstellung settings.planView wird ignoriert. */
import { profile } from './store';
import { kmPlan, totalLine, distTxt, paceEstimated, type KmPlan } from '../../shared/kmview';
import { shortPlan } from '../../shared/workouts';

/** km-Rechnung der Einheit (null: geht nicht in km, z. B. Rolle drinnen, Lauf-Geh-Wechsel, Schwimmen) */
export function kmOf(s: any): KmPlan | null {
  if (!s || !s.spec || s.race || s.cancelled || (s.sport !== 'run' && s.sport !== 'bike')) return null;
  try { return kmPlan(s.spec, { estimated: paceEstimated(profile(), s.sport) }); } catch (_) { return null; }
}
/** kurze Ablauf-Zeile (Plan-Tab) */
export function whatText(s: any): string {
  if (!s || !s.spec) return '';
  return shortPlan(s.spec);
}
/** Dauer/Strecke für Listen: „60 min · ca. 9,5 km“ */
export function amountParts(s: any): string[] | null {
  const k = kmOf(s); if (!k) return null;
  return [`${s.plannedMinutes || k.min} min`, `ca. ${distTxt(k.km)}`];
}
export function totalOf(s: any): string { const k = kmOf(s); return k ? totalLine(s.spec, 'min', s.plannedMinutes, { estimated: k.estimated }) : ''; }
