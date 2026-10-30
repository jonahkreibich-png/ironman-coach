/* Auftrag 22: täglicher Daten-Check auf dem Server – sichere Fälle repariert, Rest gemeldet (nur neue Befunde), nichts bei
   gleichzeitiger Änderung, Abschnitte älterer Aufzeichnungen aus dem gespeicherten Verlauf ergänzt. */
import { test, expect } from 'vitest';
import { makeEnv } from './multiuser.test';
import { putRecords, getRecords, getMeta } from '../src/store';
import { runDataCheck } from '../src/datacheck';
import * as W from '../../shared/workouts';

async function seed(env: any) {
  const ss = { id: 's1', sport: 'bike', ...W.build(W.bikeSweetSpot({ lthrBike: 165 }, 2, 10, 75)) };
  const plan = { weeks: [{ weekNumber: 1, startDate: '2026-10-26', endDate: '2026-11-01', days: [{ date: '2026-10-28', sessions: [ss] }] }], meta: {} };
  const msg = (id: string) => ({ id, kind: 'warning', title: 'Schwimmen: bitte prüfen', text: 'Gleich', date: '2026-10-28', at: 1 });
  // Herzfrequenz-Verlauf wie Jonahs Sweet Spot 28.10. (Rolle ohne Watt): 10 min einrollen, 2×10 min hart, 4 min Pause, 6 min ausrollen
  const t: number[] = [], hr: number[] = [];
  for (let s = 0; s <= 2400; s += 5) { t.push(s); hr.push(s < 600 ? 125 : s < 1200 ? 150 : s < 1440 ? 128 : s < 2040 ? 152 : 132); }
  await putRecords(env, 1, [
    { kind: 'plan', key: 'main', data: plan, updatedAt: 1 },
    { kind: 'session', key: 's1', data: { completed: true, activityId: 'hf-1', metrics: { min: '40', hr: '140' } }, updatedAt: 1 },
    { kind: 'activity', key: 'hf-1', data: { id: 'hf-1', source: 'healthfit', sport: 'bike', date: '2026-10-28', startMs: 1, indoor: true, min: 40, avgHr: 140, laps: [{ n: 1, sec: 2400, kind: 'steady' }], hasStreams: true, sessionId: 's1' }, updatedAt: 1 },
    { kind: 'coachMsg', key: 'm1', data: msg('m1'), updatedAt: 1 }, { kind: 'coachMsg', key: 'm2', data: msg('m2'), updatedAt: 1 },
    { kind: 'custom', key: 'c1', data: { id: 'c1', date: '2026-10-28', sport: 'run', title: 'Lauf', metrics: { min: '30', hr: '172', maxHr: '160' }, metricsSrc: { hr: 'manual', maxHr: 'manual' }, completed: true }, updatedAt: 1 }
  ]);
  await env.DB.prepare("INSERT INTO blobs (user_id, id, kind, data, created_at) VALUES (1, 'hf-1', 'streams', ?, 1)").bind(JSON.stringify({ t, hr, speed: t.map(() => null), alt: t.map(() => null), power: t.map(() => null) })).run();
}
test('Daten-Check: doppelte Meldung entfernt, Widerspruch gemeldet (ohne Werte), Abschnitte ergänzt; zweiter Lauf meldet nichts Neues', async () => {
  const env = makeEnv(); await seed(env);
  const r = await runDataCheck(env, 1, '2026-10-29');
  expect(r.fixed).toBe(1); expect(r.segments).toBe(1);
  const msgs = await getRecords(env, 1, 'coachMsg'); expect(Object.keys(msgs)).toHaveLength(1);
  const act = (await getRecords(env, 1, 'activity'))['hf-1'];
  expect(act.segments.filter((s: any) => s.kind === 'work')).toHaveLength(2);
  const log = await env.DB.prepare("SELECT msg, place, user_id FROM error_log WHERE source = 'datacheck'").all();
  expect(log.results.some((x: any) => /Ø Puls über max. Puls/.test(x.msg) && x.place === 'datacheck:values' && x.user_id === 1)).toBe(true);
  expect(log.results.every((x: any) => !/172|160/.test(x.msg))).toBe(true);
  const n = log.results.length;
  await runDataCheck(env, 1, '2026-10-30');
  expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM error_log WHERE source = 'datacheck'").first()).n).toBe(n);
  expect((await getMeta(env, 1, 'datacheck_last')).groups.length).toBeGreaterThan(0);
});
test('Daten-Check schreibt nichts, wenn sich die Daten währenddessen ändern (z. B. Eingabe am iPhone)', async () => {
  const env = makeEnv(); await seed(env);
  const orig = env.DB.prepare.bind(env.DB); let bumped = false;
  // gleich nach dem Lesen speichert ein anderes Gerät etwas (Revision steigt)
  env.DB.prepare = (sql: string) => { if (!bumped && /FROM blobs/.test(sql)) { bumped = true; env.DB.db.exec("UPDATE records SET rev = rev + 1000 WHERE user_id = 1 AND key = 's1'"); } return orig(sql); };
  const r = await runDataCheck(env, 1, '2026-10-29');
  env.DB.prepare = orig;
  expect(r.skippedWrite).toBe(true); expect(r.fixed).toBe(0);
  expect(Object.keys(await getRecords(env, 1, 'coachMsg'))).toHaveLength(2);
});
test('Betreiber kann den Daten-Check sofort starten; andere nicht', async () => {
  const { call } = await import('./multiuser.test');
  const env = makeEnv();
  const A = (await call(env, 'POST', '/api/setup', { name: 'Betreiber' })).data;
  await seed(env);
  const r = await call(env, 'POST', '/api/admin/datacheck', {}, A.token);
  expect(r.status).toBe(200); expect(r.data.users[0]).toMatchObject({ user: 1, fixed: 1 });
  const inv = (await call(env, 'POST', '/api/admin/testusers', { note: 'T' }, A.token)).data;
  const B = (await call(env, 'POST', '/api/setup', { name: 'Tester', invite: inv.code, userName: 'T' })).data;
  expect((await call(env, 'POST', '/api/admin/datacheck', {}, B.token)).status).toBe(403);
});
