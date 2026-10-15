/* Wochenraster (Auftrag 11, Punkt 4): Zeit nur einmal abfragen. Ein Bildschirm: Zeit pro Tag und Sportart × Tag
   (geht / lieber nicht / geht nicht). Stunden pro Woche, längster Tag und Häufigkeit je Sportart werden daraus berechnet und nur als
   änderbare Zusammenfassung gezeigt. Änderungen sind immer begrenzt, damit nichts widersprüchlich wird
   (z. B. nicht mehr Stunden als Zeit im Raster, nicht öfter Laufen als Tage, an denen Laufen geht). */
import { rulesOf, cellOf, GRID_DAYS, type Rule, type RuleSport } from './constraints';
import { DAYLOAD_MIN } from './profile';
import { parseFor } from './ruleparse';

export interface WeekInput { dayLoad?: Record<number, number>; rules?: Rule[]; notes?: string[]; sports?: string[];
  weeklyHours?: number | null; weeklyHoursSet?: boolean; maxDayHours?: number | null; freq?: Record<string, [number, number]> }
export interface WeekSummary {
  /** Minuten je Wochentag (0=So) */ dayMin: Record<number, number>;
  /** Zeit im Raster pro Woche (h) und gewähltes Limit (h, höchstens die Zeit im Raster) */ capH: number; weeklyHours: number; auto: boolean;
  /** längster Tag (h), nur änderbar, wenn es „lange“ Tage gibt */ maxDayHours: number; hasLong: boolean;
  /** je Sportart: Tage, an denen sie geht (mit Zeit), und Häufigkeit [min, max] */ sports: { sport: RuleSport; days: number; freq: [number, number]; auto: boolean }[];
}
const FREQ_SPORTS: RuleSport[] = ['swim', 'bike', 'run', 'strength'];
/* Standard-Häufigkeit (wie der Plan-Generator, wenn nichts gewählt ist) */
export function defaultFreq(sport: string, weeklyHours: number): [number, number] {
  const h = weeklyHours || 5;
  if (sport === 'strength') return [1, 2];
  if (sport === 'run') return h < 4 ? [2, 3] : [2, 4];
  return h < 4 ? [1, 2] : [1, 3];
}
const half = (x: number) => Math.round(x * 2) / 2;
export const longDayMin = (maxDayHours: number | null | undefined) => Math.max(120, (maxDayHours || 2.5) * 60);
export function weekSummary(a: WeekInput, today: string): WeekSummary {
  const dl = a.dayLoad || {};
  const maxDayHours = Math.max(2, Math.min(8, a.maxDayHours || 2.5));
  const dayMin: Record<number, number> = {};
  GRID_DAYS.forEach(d => { const v = +((dl as any)[d] || 0); dayMin[d] = v === 3 ? longDayMin(maxDayHours) : DAYLOAD_MIN[v as 0 | 1 | 2] || 0; });
  const capH = half(Object.values(dayMin).reduce((x, y) => x + y, 0) / 60);
  // ohne eigene Angabe: die Zeit im Raster (alte Antworten mit Stundenzahl gelten als eigene Angabe)
  const auto = a.weeklyHoursSet === false || !(a.weeklyHours! > 0);
  const weeklyHours = capH ? (auto ? capH : Math.max(1, Math.min(capH, half(a.weeklyHours!)))) : Math.max(1, a.weeklyHours || 5);
  const rules = rulesOf({ notes: a.notes || [], rules: a.rules || [] } as any, parseFor(today));
  const sports = FREQ_SPORTS.filter(s => (a.sports || []).includes(s)).map(sport => {
    const days = GRID_DAYS.filter(d => dayMin[d] > 0 && cellOf(rules, sport, d, dl as any).state !== 'no').length;
    const f = a.freq && a.freq[sport];
    const base: [number, number] = f && f.length === 2 ? [f[0], f[1]] : defaultFreq(sport, weeklyHours);
    const lim = Object.keys(dl).length ? days : 7;
    return { sport, days, freq: [Math.min(base[0], lim), Math.min(base[1], lim)] as [number, number], auto: !f };
  });
  return { dayMin, capH, weeklyHours, auto, maxDayHours, hasLong: Object.values(dl).some(v => +v === 3), sports };
}
