/* Übernahme neuer Daten aus allen Quellen (Dateien, Dropbox/HealthFit, Oura, Kurzbefehl, WHOOP, Polar, Withings, intervals.icu):
   Tageswerte mit Quelle und Vorrang zusammenführen, Aufzeichnungen auswerten, Doppelte zusammenführen, der geplanten Einheit
   zuordnen und abhaken. Danach läuft die Coach-Engine. */
import * as C from '../../shared/core';
import { type Env, getRecords, putRecords, getRecord, type Change } from './store';
import { analyze, streamsOf, type Activity, type Source } from '../../shared/activity/analyze';
import type { RawActivity } from '../../shared/activity/types';
import { mergeTrendValues, ingestActivity } from '../../shared/activity/merge';
import { loadState, runEngineFor } from './coach';

export interface IngestInput {
  source: Source;
  trend?: Record<string, Record<string, number | null | undefined>>;
  raw?: RawActivity[];
  activities?: Activity[];
  weights?: Record<string, number>;
}
export interface IngestStats { days: number; activities: number; matched: number; extras: number; merged: number; duplicates: number; kept?: number; /** Dropbox: Dateien, die noch warten */ queued?: number }
/* Neue Verbindung ändert nichts Vergangenes: Tage vor dem Verbinden bleiben, wie sie waren; am Tag des Verbindens werden nur leere Werte
   gefüllt; Einheiten zählen erst ab dem Zeitpunkt des Verbindens. */
export interface Protect { at: number; day: string }

export async function ingest(env: Env, uid: number, inp: IngestInput, opts: { runEngine?: boolean; protect?: Protect | null } = {}): Promise<IngestStats> {
  const stats: IngestStats = { days: 0, activities: 0, matched: 0, extras: 0, merged: 0, duplicates: 0 };
  const P = opts.protect || null;
  if (P) inp = keepPast(inp, P, stats);
  const t = Date.now();
  const changes: Change[] = [];
  const settingsRec = await getRecord(env, uid, 'settings', 'main');
  const settings = (settingsRec && settingsRec.data && settingsRec.data.settings) || {};
  const profileRec = await getRecord(env, uid, 'profile', 'main');
  const thr = (profileRec && profileRec.data && profileRec.data.thresholds) || settings;
  const trendDates: string[] = [];

  // Tageswerte
  if (inp.trend && Object.keys(inp.trend).length) {
    const existing = await getRecords(env, uid, 'trend', Object.keys(inp.trend));
    for (const [date, vals] of Object.entries(inp.trend)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const v = P && date === P.day && existing[date] ? Object.fromEntries(Object.entries(vals).filter(([k]) => existing[date][k] == null)) : vals;
      if (!Object.keys(v).length) continue;
      const { point, changed } = mergeTrendValues(existing[date], date, inp.source, v, settings);
      if (changed) { changes.push({ kind: 'trend', key: date, data: point, updatedAt: t }); stats.days++; trendDates.push(date); }
    }
  }
  // Gewicht → Ernährungstag (dort lebt das Gewicht in der App)
  if (inp.weights && Object.keys(inp.weights).length) {
    const nut = await getRecords(env, uid, 'nutrition', Object.keys(inp.weights));
    for (const [date, kg] of Object.entries(inp.weights)) {
      const n = nut[date] || {};
      if (n.weightManual || (P && date === P.day && n.weight != null)) continue;
      if (n.weight !== kg) changes.push({ kind: 'nutrition', key: date, data: { ...n, weight: kg, weightSource: inp.source }, updatedAt: t });
    }
  }

  // Aufzeichnungen
  const acts: Activity[] = [...(inp.activities || [])];
  for (const r of inp.raw || []) {
    const a = analyze(r, { source: inp.source, lthr: { run: thr.lthrRun, bike: thr.lthrBike } });
    acts.push(a);
    if (r.records.length) changes.push({ kind: '__blob', key: a.id, data: streamsOf(r), updatedAt: t } as any);
  }
  if (acts.length) {
    const L = await loadState(env, uid);
    const weeks = C.applyAdjustments(L.baseWeeks, L.state.adjustments);
    const ctx = {
      planDays: C.planDays(weeks), sessions: { ...L.state.sessions }, settings,
      customs: Object.fromEntries(Object.values(L.state.customWorkouts).flat().map((c: any) => [c.id, c])),
      activities: { ...L.state.activities } as Record<string, Activity>
    };
    for (const a of acts.sort((x, y) => x.startMs - y.startMs)) {
      if (ctx.activities[a.id] && JSON.stringify(ctx.activities[a.id].laps) === JSON.stringify(a.laps) && ctx.activities[a.id].min === a.min) { stats.duplicates++; continue; }
      const r = ingestActivity(ctx, a);
      stats.activities++;
      if (r.matched === 'session') stats.matched++; else if (r.matched === 'custom') stats.extras++; else if (r.matched === 'merged') stats.merged++;
      r.activities.forEach(x => { ctx.activities[x.id] = x; changes.push({ kind: 'activity', key: x.id, data: x, updatedAt: t }); });
      Object.entries(r.sessions).forEach(([id, st]) => { ctx.sessions[id] = st; changes.push({ kind: 'session', key: id, data: st, updatedAt: t }); });
      r.customs.forEach(c => { ctx.customs[c.id] = c; changes.push({ kind: 'custom', key: c.id, data: c, updatedAt: t }); });
    }
  }

  // Verläufe getrennt speichern (werden nicht an alle Geräte synchronisiert)
  const blobs = changes.filter(c => c.kind === '__blob');
  for (const b of blobs) await env.DB.prepare('INSERT OR REPLACE INTO blobs (user_id, id, kind, data, created_at) VALUES (?, ?, ?, ?, ?)').bind(uid, b.key, 'streams', JSON.stringify(b.data), t).run();
  // Pro Datensatz nur die letzte Änderung schreiben
  const last = new Map<string, Change>();
  changes.filter(c => c.kind !== '__blob').forEach((c, i) => last.set(c.kind + '|' + c.key, { ...c, updatedAt: t + i }));
  if (last.size) await putRecords(env, uid, [...last.values()]);

  if (opts.runEngine !== false && (stats.activities || trendDates.length)) {
    try {
      if (stats.activities) await runEngineFor(env, uid, { type: 'activity' });
      if (trendDates.length) await runEngineFor(env, uid, { type: 'trend', dates: trendDates });
    } catch (e) { /* Engine-Fehler dürfen die Übernahme nicht verlieren */ }
  }
  return stats;
}

function keepPast(inp: IngestInput, P: Protect, stats: IngestStats): IngestInput {
  const before = (d: string) => d < P.day;
  const out: IngestInput = { ...inp };
  let kept = 0;
  if (inp.trend) out.trend = Object.fromEntries(Object.entries(inp.trend).filter(([d]) => { const k = before(d); if (k) kept++; return !k; }));
  if (inp.weights) out.weights = Object.fromEntries(Object.entries(inp.weights).filter(([d]) => !before(d)));
  if (inp.raw) out.raw = inp.raw.filter(r => { const k = r.startMs < P.at; if (k) kept++; return !k; });
  if (inp.activities) out.activities = inp.activities.filter(a => { const k = a.startMs < P.at; if (k) kept++; return !k; });
  stats.kept = kept;
  return out;
}
