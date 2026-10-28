import { actualMetrics } from './results';
/** Current, read-only day projection shared by compact rows, details and bars.
 * Legacy custom records without completed:false are historical completed workouts.
 * Prescribed minutes and actual minutes are independent; missing duration is explicit.
 */
export interface SummaryRow {
  id: string; source: 'planned' | 'custom'; session: any;
  completed: boolean; cancelled: boolean; plannedMinutes: number | null; actualMinutes: number | null;
}
const minutes = (value: any): number | null => {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
export function daySummary(day: any, state: any) {
  const seenIds = new Set<string>(), seenActivities = new Set<string>();
  const canonical = (id: string) => {
    const visited = new Set<string>();
    while (id && state.activities?.[id]?.mergedInto && !visited.has(id)) {
      visited.add(id); id = state.activities[id].mergedInto;
    }
    return id;
  };
  const project = (session: any, source: SummaryRow['source']): SummaryRow | null => {
    if (!session || session.sport === 'rest' || session.removed || (session.movedTo && session.movedTo !== day.date)) return null;
    const st = source === 'planned' ? (state.sessions?.[session.id] || {}) : session;
    const aid = st.activityId && canonical(st.activityId);
    if (seenIds.has(session.id) || (aid && seenActivities.has(aid))) return null;
    seenIds.add(session.id); if (aid) seenActivities.add(aid);
    const completed = source === 'custom' ? st.completed !== false : !!st.completed;
    const cancelled = !completed && !!(session.cancelled || session.skipped || st.skipped);
    const activity = aid ? state.activities?.[aid] : null;
    return { id: session.id, source, session: { ...session, date: day.date }, completed, cancelled,
      plannedMinutes: minutes(session.plannedMinutes),
      actualMinutes: completed ? minutes(actualMetrics(st, activity).min) : null };
  };
  const planned = (day.sessions || []).map((s: any) => project(s, 'planned')).filter(Boolean) as SummaryRow[];
  const extras = (state.customWorkouts?.[day.date] || []).map((s: any) => project(s, 'custom')).filter(Boolean) as SummaryRow[];
  const rows = [...planned, ...extras];
  const active = rows.filter(s => !s.cancelled), completed = rows.filter(s => s.completed);
  return { planned, extras, rows, active, upcoming: active.filter(s => !s.completed), completed,
    cancelled: rows.filter(s => s.cancelled),
    plannedMinutes: active.reduce((n, s) => n + (s.plannedMinutes ?? 0), 0),
    actualMinutes: completed.reduce((n, s) => n + (s.actualMinutes ?? 0), 0),
    unknownPlannedMinutes: active.filter(s => s.plannedMinutes == null).length,
    unknownActualMinutes: completed.filter(s => s.actualMinutes == null).length };
}

/** Week displays aggregate the identical day projections, including custom entries. */
export function weekSummary(week: any, state: any) {
 const days = (week?.days || []).map((d: any) => daySummary(d, state));
 const active: SummaryRow[] = days.flatMap((d: ReturnType<typeof daySummary>) => d.active);
 return { days, active, total: active.length, done: active.filter(s => s.completed).length,
  plannedMinutes: days.reduce((n: number, d: ReturnType<typeof daySummary>) => n + d.plannedMinutes, 0),
  actualMinutes: days.reduce((n: number, d: ReturnType<typeof daySummary>) => n + d.actualMinutes, 0),
  unknownPlannedMinutes: days.reduce((n: number, d: ReturnType<typeof daySummary>) => n + d.unknownPlannedMinutes, 0),
  unknownActualMinutes: days.reduce((n: number, d: ReturnType<typeof daySummary>) => n + d.unknownActualMinutes, 0),
  ownPlannedMinutes: active.filter(s => s.session.sport !== 'football' && !s.session.race).reduce((n, s) => n + (s.plannedMinutes ?? 0), 0)
 };
}
