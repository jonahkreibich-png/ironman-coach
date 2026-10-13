/* Echte Daten für Tests auf dem eigenen Rechner (Auftrag 7): lokale Kopie der Datenbank (data-export/, nicht im Repository)
   plus die vorbereitete Wiederherstellung. Fehlen die Dateien (z. B. in der CI), werden diese Tests übersprungen. */
import fs from 'node:fs';
import { mergeProfile, profileFromLegacy } from '../../shared/profile';
import { migrateNotes } from '../../shared/fields';

export const REAL_DB = process.env.REAL_DB || 'data-export/prod-2026-10-13-vor-auftrag7.sqlite';
export const REAL_RESTORE = process.env.REAL_RESTORE || 'data-export/restore-auftrag7.json';
export const hasRealData = () => fs.existsSync(REAL_DB) && fs.existsSync(REAL_RESTORE);

let cache: any[] | null = null;
function records(): any[] {
  if (cache) return cache;
  // node:sqlite erst hier laden, damit die Datei ohne echte Daten nichts braucht
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(REAL_DB, { readOnly: true });
  const recs = (db.prepare('SELECT kind, key, data FROM records WHERE user_id = 1 AND deleted = 0').all() as any[]).map(r => ({ kind: r.kind, key: r.key, data: JSON.parse(r.data) }));
  db.close();
  for (const r of JSON.parse(fs.readFileSync(REAL_RESTORE, 'utf8'))) { const i = recs.findIndex(x => x.kind === r.kind && x.key === r.key); if (i >= 0) recs[i] = r; else recs.push(r); }
  return (cache = recs);
}
/* Engine-Zustand an einem Tag (tief kopiert, Tests dürfen ihn verändern) */
export function realCtx(today: string): any {
  const recs = JSON.parse(JSON.stringify(records()));
  const dict = (k: string) => Object.fromEntries(recs.filter((r: any) => r.kind === k).map((r: any) => [r.key, r.data]));
  const customWorkouts: any = {}; recs.filter((r: any) => r.kind === 'custom').forEach((r: any) => { (customWorkouts[r.data.date] = customWorkouts[r.data.date] || []).push(r.data); });
  const plan = recs.find((r: any) => r.kind === 'plan').data; const set = recs.find((r: any) => r.kind === 'settings').data;
  const state: any = { sessions: dict('session'), customWorkouts, adjustments: dict('adjust'), activities: dict('activity'), coachMsgs: {}, weekNotes: {}, nutrition: {},
    trend: recs.filter((r: any) => r.kind === 'trend').map((r: any) => r.data).sort((a: any, b: any) => a.date.localeCompare(b.date)), illnessPeriods: recs.filter((r: any) => r.kind === 'illness').map((r: any) => r.data), settings: set.settings };
  migrateNotes(state, plan.weeks);
  const profile = mergeProfile(recs.find((r: any) => r.kind === 'profile').data, profileFromLegacy({ ...state, planWeeks: plan.weeks }, today), today);
  state.profile = profile;
  return { today, now: Date.parse(today + 'T07:00:00Z'), state, baseWeeks: plan.weeks, planMeta: plan.meta, profile, goals: Object.values(dict('goal')) };
}
