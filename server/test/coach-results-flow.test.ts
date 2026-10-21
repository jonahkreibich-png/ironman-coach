import { expect, test } from 'vitest';
import { makeEnv, call } from './multiuser.test';
import { getRecord, putRecords } from '../src/store';
import { onRecordsChanged } from '../src/extensions';
import * as W from '../../shared/workouts';
import * as C from '../../shared/core';

test('echter Sync-Pfad bewertet rückdatierte Korrektur erneut und lässt den gespeicherten Plan bestehen', async () => {
  const env = makeEnv(); await call(env, 'POST', '/api/setup', { name: 'Isolierter Ergebnis-Test' });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
  const date = C.addDays(today, -14);
  const plan = { meta: {}, weeks: [{ startDate: date, days: [{ date, sessions: [{ id: 's', ...W.build(W.swimLearn({}, { ladder: 'swim', n: 4 })) }] }] }] };
  await putRecords(env, 1, [
    { kind: 'plan', key: 'main', data: plan, updatedAt: 1 },
    { kind: 'session', key: 's', data: { completed: true, metrics: { longestCrawl: '50', min: '30' } }, updatedAt: 2 },
    { kind: 'coachMsg', key: 'msg-review-s', data: { id: 'msg-review-s', kind: 'session', date, at: 1, text: '100 m geschafft' }, updatedAt: 1 }
  ]);
  await onRecordsChanged(env, 1, [{ kind: 'session', key: 's', data: { completed: true, metrics: { longestCrawl: '50', min: '30' } }, updatedAt: 2 }], 'sync');
  const message = (await getRecord(env, 1, 'coachMsg', 'msg-review-s'))!.data;
  expect(message.text).toContain('50 m'); expect(message.title).toMatch(/aktualisiert/i);
  expect((await getRecord(env, 1, 'plan', 'main'))!.data).toEqual(plan);
});
