/* Auftrag 18: Ein eingespielter Plan wurde 2 Minuten später vom Handy (alte App-Version, alter Plan auf dem Gerät) überschrieben.
   Nach einem Einspielen (user_meta min_client_version) nimmt der Server Plan und Profil nur noch von Geräten mit mindestens dieser Version an;
   ältere Geräte bekommen den Stand vom Server (neue Revision), andere Arten (Einheiten, Werte) laufen normal weiter. */
import { test, expect } from 'vitest';
import worker from '../src/index';
import { makeEnv } from './multiuser.test';
import { cmpVersion, gateChanges } from '../src/store';

async function callV(env: any, p: string, body: any, token: string, ver: string) {
  const res = await worker.fetch(new Request('http://x' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, 'X-App-Version': ver }, body: JSON.stringify(body) }), env, { waitUntil() {} } as any);
  return { status: res.status, data: await res.json().catch(() => null) as any };
}

test('Versionen vergleichen', () => {
  expect(cmpVersion('3.4.0', '3.5.0')).toBeLessThan(0);
  expect(cmpVersion('3.5.0', '3.5.0')).toBe(0);
  expect(cmpVersion('3.10.1', '3.5.0')).toBeGreaterThan(0);
  expect(cmpVersion('', '3.5.0')).toBeLessThan(0);
  expect(gateChanges([{ kind: 'plan' }, { kind: 'session' }], { version: '3.5.0' }, '3.4.0').keep.map(c => c.kind)).toEqual(['session']);
  expect(gateChanges([{ kind: 'plan' }], null, '3.4.0').keep.length).toBe(1);
});

test('nach dem Einspielen: altes Gerät überschreibt den Plan nicht, bekommt den neuen Plan, Einheiten gehen durch', async () => {
  const env = makeEnv();
  const owner = (await callV(env, '/api/setup', { name: 'Test' }, '', '3.4.0')).data;
  // Einspielen durch den Betreiber (wie scripts/plan-auftrag18.ts): neuer Plan, Sperre für ältere Versionen
  const newPlan = { meta: { generatedAt: '2026-10-22', v: 'neu' }, weeks: [] };
  await callV(env, '/api/sync', { since: 0, changes: [{ kind: 'plan', key: 'main', data: newPlan, updatedAt: 1000 }] }, owner.token, '3.5.0');
  env.DB.db.exec(`INSERT INTO user_meta (user_id, k, v) VALUES (1, 'min_client_version', '{"version":"3.5.0","kinds":["plan","profile"]}')`);
  // Handy mit alter Version schickt seinen alten Plan mit neuem Zeitstempel und eine erledigte Einheit
  const cursor = (await callV(env, '/api/sync', { since: 0, changes: [] }, owner.token, '3.4.0')).data.cursor;
  const r = await callV(env, '/api/sync', { since: cursor, changes: [
    { kind: 'plan', key: 'main', data: { meta: { generatedAt: '2026-10-20', v: 'alt' }, weeks: [] }, updatedAt: 2000 },
    { kind: 'session', key: 's1', data: { completed: true }, updatedAt: 2000 }] }, owner.token, '3.4.0');
  expect(r.status).toBe(200);
  // der Server liefert ihm den neuen Plan erneut aus
  expect(r.data.records.find((x: any) => x.kind === 'plan').data.meta.v).toBe('neu');
  const all = (await callV(env, '/api/sync', { since: 0, changes: [] }, owner.token, '3.5.0')).data.records;
  expect(all.find((x: any) => x.kind === 'plan').data.meta.v).toBe('neu');
  expect(all.find((x: any) => x.kind === 'session' && x.key === 's1').data.completed).toBe(true);
  // neue Version darf den Plan wieder ändern
  await callV(env, '/api/sync', { since: 0, changes: [{ kind: 'plan', key: 'main', data: { meta: { v: 'neuer' }, weeks: [] }, updatedAt: 3000 }] }, owner.token, '3.5.0');
  expect((await callV(env, '/api/sync', { since: 0, changes: [] }, owner.token, '3.5.0')).data.records.find((x: any) => x.kind === 'plan').data.meta.v).toBe('neuer');
});
