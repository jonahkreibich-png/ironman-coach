/* Auftrag 22: Täglicher Daten-Check (nachts, für alle Nutzer). Prüft mit shared/datacheck.ts, repariert nur sichere Fälle
   (eindeutig doppelte Meldungen und Extra-Einheiten), ergänzt bei älteren Aufzeichnungen die harten Abschnitte aus dem gespeicherten
   Verlauf (nur hinzufügen, nichts ändern) und meldet neue Befunde gruppiert im Betreiber-Posteingang (ohne Gesundheitswerte).
   Hat sich der Datenstand während der Prüfung geändert (z. B. Eingabe am iPhone), wird nichts geschrieben – nächste Nacht wieder. */
import { type Env, berlinDate, putRecords, getMeta, setMeta, recordsRevision, RecordsChangedError, type Change } from './store';
import { loadState } from './coach';
import { logError } from './errlog';
import { dataCheck, summarize } from '../../shared/datacheck';
import { segmentsFromStreams } from '../../shared/activity/structure';
import { plannedIntervals } from '../../shared/intervals';
import * as C from '../../shared/core';

export async function runDataCheck(env: Env, uid: number, today = berlinDate()): Promise<any> {
  const revision = await recordsRevision(env, uid);
  const L = await loadState(env, uid);
  if (!L.plan && !Object.keys(L.state.activities || {}).length) return { skipped: 'keine Daten' };
  const r = dataCheck({ state: L.state, baseWeeks: L.baseWeeks, profile: L.profile, goals: L.goals, today });
  const now = Date.now();
  const changes: Change[] = r.fixes.map(f => ({ kind: f.kind, key: f.key, deleted: true, updatedAt: now }));
  // ältere Aufzeichnungen: harte Abschnitte aus dem Verlauf, wenn die Einheit Intervalle vorsieht (einmal je Aufzeichnung)
  let segAdded = 0;
  const checked: string[] = (await getMeta(env, uid, 'seg_checked')) || [];
  const planById = new Map<string, any>(); C.planDays(C.applyAdjustments(L.baseWeeks, L.state.adjustments || {})).forEach((d: any) => d.sessions.forEach((s: any) => planById.set(s.id, s)));
  for (const a of Object.values(L.state.activities || {}) as any[]) {
    if (segAdded >= 10 || !a || a.mergedInto || a.segments || !a.hasStreams || checked.includes(a.id) || !(a.sport === 'run' || a.sport === 'bike')) continue;
    const s = a.sessionId ? planById.get(a.sessionId) : null; if (!s || !plannedIntervals(s).length) continue;
    if ((a.laps || []).some((l: any) => l.kind === 'work')) continue;
    checked.push(a.id);
    const row: any = await env.DB.prepare("SELECT data FROM blobs WHERE user_id = ? AND id = ? AND kind = 'streams'").bind(uid, a.id).first();
    if (!row) continue;
    let segs = null; try { segs = segmentsFromStreams(JSON.parse(String(row.data)), a.sport); } catch (e) { segs = null; }
    if (segs) { changes.push({ kind: 'activity', key: a.id, data: { ...a, segments: segs }, updatedAt: now }); segAdded++; }
  }
  let written = false;
  if (changes.length) {
    try { await putRecords(env, uid, changes, revision); written = true; }
    catch (e) { if (!(e instanceof RecordsChangedError)) throw e; }
  }
  await setMeta(env, uid, 'seg_checked', checked.slice(-500));
  // nur neue Befunde melden (sonst stünde derselbe Befund jede Nacht neu im Posteingang)
  const prev = (await getMeta(env, uid, 'datacheck_last')) || {};
  const known = new Set<string>(prev.keys || []);
  const fresh = r.findings.filter(f => !known.has(f.key) && (!f.fixed || written));
  for (const f of fresh) await logError(env, 'datacheck', f.text, 'datacheck:' + f.group, { uid });
  const out = { at: now, day: today, keys: r.findings.map(f => f.key), groups: summarize(r.findings), fixed: written ? r.fixes.length : 0, segments: written ? segAdded : 0, skippedWrite: !!changes.length && !written };
  await setMeta(env, uid, 'datacheck_last', out);
  return out;
}
