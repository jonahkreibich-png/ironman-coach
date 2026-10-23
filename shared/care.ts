/* Auftrag 18, Punkt 6: freiwillige Hinweise – Zyklus (nur wenn eingetragen, Hinweise statt Regeln) und Laufschuh-Kilometer (ab 600 km). */
import * as C from './core';

export interface CycleSetting { on?: boolean; start?: string | null; length?: number | null }
export interface ShoeSetting { name?: string; since?: string | null; km0?: number | null }
const dayDiff = (a: string, b: string) => Math.round((+new Date(b + 'T12:00:00Z') - +new Date(a + 'T12:00:00Z')) / 86400000);

/* Tag im Zyklus (1 = erster Tag der Periode) oder null */
export function cycleDay(c: CycleSetting | null | undefined, today: string): number | null {
  if (!c || !c.on || !c.start || today < c.start) return null;
  const len = Math.max(20, Math.min(40, Math.round(c.length || 28)));
  return (dayDiff(c.start, today) % len) + 1;
}
export function cycleHint(c: CycleSetting | null | undefined, today: string): string | null {
  const n = cycleDay(c, today); if (n == null) return null;
  const len = Math.max(20, Math.min(40, Math.round((c && c.length) || 28)));
  if (n <= 3) return `Tag ${n} deines Zyklus: Fühlst du dich schlapp oder hast Beschwerden, mach lieber locker oder kürzer – kein Muss. Genug trinken und essen.`;
  if (n > len - 3) return 'Kurz vor der Periode fühlen sich manche schwerer oder schlafen schlechter. Hör auf dein Gefühl, das ist kein Rückschritt.';
  return null;
}

/* Laufkilometer seit dem Schuhkauf (eingetragen oder gemessen) plus Startwert */
export function shoeKm(state: any, weeks: any[], s: ShoeSetting | null | undefined, today: string): number | null {
  if (!s || !s.since) return null;
  let km = +(s.km0 || 0);
  const used = new Set<string>();
  C.planDays(weeks || []).forEach((d: any) => { if (d.date < s.since! || d.date > today) return; (d.sessions || []).forEach((x: any) => {
    const st = (state.sessions || {})[x.id]; if (!st || !st.completed || x.sport !== 'run') return;
    const a = st.activityId ? (state.activities || {})[st.activityId] : null; if (a) used.add(a.id);
    const v = parseFloat(String(((st.metrics || {}).km) ?? (a && a.km) ?? '').replace(',', '.')); if (v > 0) km += v; else if (x.plannedKm) km += x.plannedKm;
  }); });
  Object.entries(state.customWorkouts || {}).forEach(([d, l]: any) => { if (d >= s.since! && d <= today) (l || []).forEach((c: any) => { if (c && c.sport === 'run' && c.completed !== false) { const v = parseFloat(String((c.metrics || {}).km || '').replace(',', '.')); if (v > 0) km += v; } }); });
  C.recordedActivities(state).forEach((a: any) => { if (a && a.sport === 'run' && !a.sessionId && !used.has(a.id) && a.date >= s.since! && a.date <= today && a.km > 0) km += a.km; });
  return Math.round(km);
}
export function shoeHint(state: any, weeks: any[], s: ShoeSetting | null | undefined, today: string): string | null {
  const km = shoeKm(state, weeks, s, today); if (km == null || km < 600) return null;
  return `Deine Laufschuhe${s && s.name ? ` (${s.name})` : ''} haben etwa ${km} km. Ab 600-800 km dämpfen sie spürbar weniger: Zeit, neue zu prüfen.`;
}
void dayDiff;
