/* Auftrag 5 E1/E2/E4: Daten exportieren, Konto löschen (Backups nach Frist), Wiederherstellungscode, Privatsphäre gegenüber dem Betreiber. */
import { test, expect } from 'vitest';
import { makeEnv, call } from './multiuser.test';
import { purgeDeleted, BACKUP_PURGE_DAYS } from '../src/account';
import { dailyBackup } from '../src/index';

async function two() {
  const env = makeEnv({});
  const A = (await call(env, 'POST', '/api/setup', { name: 'iPhone Jonah' })).data;
  const inv = (await call(env, 'POST', '/api/admin/testusers', { note: 'Papa' }, A.token)).data;
  const B = (await call(env, 'POST', '/api/setup', { name: 'iPhone Papa', invite: inv.code, userName: 'Papa' })).data;
  await call(env, 'POST', '/api/sync', { since: 0, changes: [
    { kind: 'trend', key: '2026-10-20', data: { date: '2026-10-20', hrv: 61, restingHR: 52, sleepHours: 7.1 }, updatedAt: 1 },
    { kind: 'session', key: 's1', data: { completed: true, rpe: 6 }, updatedAt: 1 },
    { kind: 'profile', key: 'main', data: { name: 'Papa', birthYear: 1975, weightKg: 82, notes: ['Knie'] }, updatedAt: 1 }] }, B.token);
  return { env, A, B };
}

test('neues Konto bekommt einen Wiederherstellungscode; damit bekommt ein neues Gerät alle Daten zurück', async () => {
  const { env, B } = await two();
  expect(B.recoveryCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  // Handy weg, Safari-Daten gelöscht: neues Gerät mit dem Code
  const bad = await call(env, 'POST', '/api/recover', { code: 'AAAA-BBBB-CCCC-DDDD', name: 'Neues iPhone' });
  expect(bad.status).toBe(403);
  const r = (await call(env, 'POST', '/api/recover', { code: B.recoveryCode.toLowerCase(), name: 'Neues iPhone' })).data;
  expect(r.userId).toBe(B.userId);
  const recs = (await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, r.token)).data.records;
  expect(recs.map((x: any) => x.kind).sort()).toEqual(['profile', 'session', 'trend']);
  // neuer Code ersetzt den alten
  const fresh = (await call(env, 'POST', '/api/recovery', {}, r.token)).data.code;
  expect((await call(env, 'POST', '/api/recover', { code: B.recoveryCode, name: 'x' })).status).toBe(403);
  expect((await call(env, 'POST', '/api/recover', { code: fresh, name: 'x' })).status).toBe(200);
});

test('E1: Meine Daten als Datei enthält alles Eigene und nichts Fremdes', async () => {
  const { env, A, B } = await two();
  const ex = (await call(env, 'GET', '/api/me/export', undefined, B.token)).data;
  expect(ex.format).toBe('stamio-export');
  expect(ex.records.find((r: any) => r.kind === 'trend').data.hrv).toBe(61);
  expect(ex.devices.map((d: any) => d.name)).toEqual(['iPhone Papa']);
  const exA = (await call(env, 'GET', '/api/me/export', undefined, A.token)).data;
  expect(JSON.stringify(exA)).not.toContain('"hrv":61');
});

test('E1: Konto löschen entfernt alle Daten sofort, Server-Backups erst nach Frist', async () => {
  const { env, A, B } = await two();
  await dailyBackup(env, B.userId);
  expect((await call(env, 'DELETE', '/api/me', { confirm: 'ja' }, B.token)).status).toBe(400);
  expect((await call(env, 'DELETE', '/api/me', { confirm: 'LÖSCHEN' }, A.token)).status).toBe(400); // Betreiber nicht
  const r = await call(env, 'DELETE', '/api/me', { confirm: 'LÖSCHEN' }, B.token);
  expect(r.status).toBe(200);
  expect((await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, B.token)).status).toBe(401);
  for (const tbl of ['records', 'devices', 'feedback', 'recovery', 'connections']) expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${tbl} WHERE user_id = ?`).bind(B.userId).first()).n).toBe(0);
  expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').bind(B.userId).first()).n).toBe(0);
  expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM backups WHERE user_id = ?').bind(B.userId).first()).n).toBe(1);
  expect(await purgeDeleted(env)).toBe(0);
  expect(await purgeDeleted(env, Date.now() + (BACKUP_PURGE_DAYS + 1) * 86400000)).toBe(1);
  expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM backups WHERE user_id = ?').bind(B.userId).first()).n).toBe(0);
});

test('E2: Der Betreiber sieht von anderen nur Name, Status, Version, Geräte und Meldungen – keine Gesundheits- oder Trainingsdaten', async () => {
  const { env, A, B } = await two();
  const users = (await call(env, 'GET', '/api/admin/users', undefined, A.token)).data.users;
  const papa = users.find((u: any) => u.name === 'Papa');
  expect(Object.keys(papa).sort()).toEqual(['createdAt', 'devices', 'entitlements', 'features', 'id', 'lastSeen', 'name', 'reports', 'role', 'self', 'test', 'version']);
  // kein Weg zu fremden Datensätzen: alle Lese-Endpunkte liefern nur die eigenen
  const s = JSON.stringify([
    (await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, A.token)).data,
    (await call(env, 'GET', `/api/backups?user=${B.userId}`, undefined, A.token)).data,
    (await call(env, 'GET', `/api/me/export?user=${B.userId}`, undefined, A.token)).data,
    (await call(env, 'GET', '/api/admin/feedback', undefined, A.token)).data,
    (await call(env, 'GET', '/api/admin/errors', undefined, A.token)).data,
    (await call(env, 'GET', '/api/log', undefined, A.token)).data
  ]);
  for (const leak of ['"hrv"', 'restingHR', 'sleepHours', 'weightKg', '"rpe"', 'Knie']) expect(s).not.toContain(leak);
});
