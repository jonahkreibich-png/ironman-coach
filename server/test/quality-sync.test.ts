import { test, expect } from 'vitest';
import { makeEnv, call } from './multiuser.test';

test('Kraftvorlagen und manuelle Belastung inklusive Verlauf überstehen Sync und bleiben privat', async () => {
  const env = makeEnv();
  const owner = (await call(env, 'POST', '/api/setup', { name: 'Qualitätstest' })).data;
  const template = { id: 'upper', name: 'Oberkörper', exercises: [{ name: 'Rudern', sets: 3, reps: '10', kg: 0, restSec: 90 }] };
  const trend = { date: '2026-10-20', ctl: 40, atl: 50, _manual: { ctl: true, atl: true }, _loadHistory: [{ at: 1, action: 'CTL geändert', before: {}, after: {} }] };
  const write = await call(env, 'POST', '/api/sync', { since: 0, changes: [
    { kind: 'strengthTemplate', key: 'upper', data: template, updatedAt: 10 },
    { kind: 'trend', key: trend.date, data: trend, updatedAt: 10 }
  ] }, owner.token);
  expect(write.status).toBe(200);
  const read = (await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, owner.token)).data.records;
  expect(read.find((r: any) => r.kind === 'strengthTemplate').data).toEqual(template);
  expect(read.find((r: any) => r.kind === 'trend').data).toEqual(trend);
  const inv = (await call(env, 'POST', '/api/admin/testusers', { note: 'Zweiter Nutzer' }, owner.token)).data;
  const second = (await call(env, 'POST', '/api/setup', { name: 'Zweites Gerät', invite: inv.code, userName: 'Zweiter' })).data;
  expect((await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, second.token)).data.records).toEqual([]);
  expect((await call(env, 'POST', '/api/sync', { since: 0, changes: [] })).status).toBe(401);
  await call(env, 'POST', '/api/sync', { since: 0, changes: [{ kind: 'strengthTemplate', key: 'upper', deleted: true, updatedAt: 20 }] }, owner.token);
  const deleted = (await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, owner.token)).data.records.find((r: any) => r.kind === 'strengthTemplate');
  expect(deleted.deleted).toBeTruthy();
});
