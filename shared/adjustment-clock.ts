/* Lokale Aktionsreihenfolge bleibt auch bei gleicher/zurueckgestellter Uhr stabil. */
export function nextAdjustmentTime(adjustments: Record<string, any>, now: number): number {
  let next = now;
  for (const a of Object.values(adjustments || {})) if (Number.isFinite(a?.createdAt)) next = Math.max(next, a.createdAt + 1);
  return next;
}
