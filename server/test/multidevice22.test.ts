/* Auftrag 22: Mehrere Geräte und offline – nichts darf verloren gehen oder doppelt erscheinen.
   Vorher galt pro Datensatz „neuester Stand gewinnt“: RPE vom iPhone (offline) und Puls vom PC an derselben Einheit → eins ging verloren. */
import { test, expect, describe } from 'vitest';
import { makeEnv, call } from './multiuser.test';
import { getRecords, putRecords } from '../src/store';
import { mergeVersions } from '../../shared/merge3';
import { applyToSession } from '../../shared/activity/merge';

async function setup() {
  const env = makeEnv();
  const owner = (await call(env, 'POST', '/api/setup', { name: 'Synthetisch Geräte' })).data;
  const sync = (changes: any[], since = 0) => call(env, 'POST', '/api/sync', { since, changes }, owner.token);
  return { env, sync };
}
const B0 = { completed: true, metrics: { min: '45' }, metricsSrc: { min: 'manual' } };

describe('gleichzeitige Änderungen', () => {
  test('iPhone offline (RPE) und PC (Puls) an derselben Einheit: beide Werte bleiben', async () => {
    const { env, sync } = await setup();
    await sync([{ kind: 'session', key: 's1', data: B0, updatedAt: 10 }]);
    // PC: Puls, gleich hochgeladen
    await sync([{ kind: 'session', key: 's1', data: { ...B0, metrics: { ...B0.metrics, hr: '150' }, metricsSrc: { ...B0.metricsSrc, hr: 'manual' } }, base: B0, updatedAt: 200 }]);
    // iPhone war offline, hat vorher (Zeit 100) die RPE eingetragen und lädt jetzt hoch
    const r = await sync([{ kind: 'session', key: 's1', data: { ...B0, rpe: '7' }, base: B0, updatedAt: 100 }]);
    const s = (await getRecords(env, 1, 'session')).s1;
    expect(s).toMatchObject({ rpe: '7', metrics: { min: '45', hr: '150' } });
    // das iPhone bekommt den zusammengeführten Stand zurück
    expect(r.data.records.find((x: any) => x.key === 's1').data).toMatchObject({ rpe: '7', metrics: { hr: '150' } });
  });
  test('dasselbe Feld auf beiden Geräten: die neuere Eingabe gewinnt', async () => {
    const { env, sync } = await setup();
    await sync([{ kind: 'session', key: 's1', data: B0, updatedAt: 10 }]);
    await sync([{ kind: 'session', key: 's1', data: { ...B0, rpe: '6' }, base: B0, updatedAt: 300 }]);
    await sync([{ kind: 'session', key: 's1', data: { ...B0, rpe: '8' }, base: B0, updatedAt: 200 }]);
    expect((await getRecords(env, 1, 'session')).s1.rpe).toBe('6');
  });
  test('Import (Uhr) während der Eingabe: Werte der Uhr und von Hand bleiben', async () => {
    const { env, sync } = await setup();
    await sync([{ kind: 'session', key: 's1', data: { completed: false, notes: '' }, updatedAt: 10 }]);
    const base = { completed: false, notes: '' };
    // Server übernimmt die Aufzeichnung (HealthFit) – während der Nutzer am Handy tippt
    const imported = applyToSession(base, { id: 'hf-1', source: 'healthfit', sources: ['healthfit'] } as any, { min: '41', hr: '152' });
    await putRecords(env, 1, [{ kind: 'session', key: 's1', data: imported, updatedAt: 150 }]);
    await sync([{ kind: 'session', key: 's1', data: { ...base, completed: true, rpe: '5', notes: 'windig' }, base, updatedAt: 120 }]);
    const s = (await getRecords(env, 1, 'session')).s1;
    expect(s).toMatchObject({ completed: true, rpe: '5', notes: 'windig', activityId: 'hf-1', metrics: { min: '41', hr: '152' } });
  });
  test('nach Offline zweimal gesendet (Wiederholung): nichts doppelt, nichts verloren', async () => {
    const { env, sync } = await setup();
    await sync([{ kind: 'session', key: 's1', data: B0, updatedAt: 10 }]);
    await sync([{ kind: 'session', key: 's1', data: { ...B0, metrics: { ...B0.metrics, hr: '150' } }, base: B0, updatedAt: 200 }]);
    const ch = { kind: 'session', key: 's1', data: { ...B0, rpe: '7' }, base: B0, updatedAt: 100 };
    await sync([ch]); await sync([{ ...ch }]);
    expect((await getRecords(env, 1, 'session')).s1).toMatchObject({ rpe: '7', metrics: { hr: '150' } });
    // offline auf zwei Geräten angelegte Extra-Einheiten: beide da, je einmal
    await sync([{ kind: 'custom', key: 'c-iphone', data: { id: 'c-iphone', date: '2026-10-28', sport: 'run' }, updatedAt: 300 }, { kind: 'custom', key: 'c-iphone', data: { id: 'c-iphone', date: '2026-10-28', sport: 'run' }, updatedAt: 300 }]);
    await sync([{ kind: 'custom', key: 'c-pc', data: { id: 'c-pc', date: '2026-10-28', sport: 'bike' }, updatedAt: 301 }]);
    expect(Object.keys(await getRecords(env, 1, 'custom')).sort()).toEqual(['c-iphone', 'c-pc']);
  });
  test('Gelöschtes bleibt gelöscht, auch wenn ein altes Gerät mit Ausgangsstand ändert', async () => {
    const { env, sync } = await setup();
    await sync([{ kind: 'custom', key: 'c1', data: { id: 'c1', date: '2026-10-28', sport: 'run' }, updatedAt: 10 }]);
    await sync([{ kind: 'custom', key: 'c1', deleted: true, updatedAt: 200 }]);
    await sync([{ kind: 'custom', key: 'c1', data: { id: 'c1', date: '2026-10-28', sport: 'run', rpe: '4' }, base: { id: 'c1', date: '2026-10-28', sport: 'run' }, updatedAt: 100 }]);
    expect(await getRecords(env, 1, 'custom')).toEqual({});
  });
  test('ohne Ausgangsstand (alte App-Version): wie bisher, die neuere Änderung gewinnt', async () => {
    const { env, sync } = await setup();
    await sync([{ kind: 'session', key: 's1', data: { rpe: '6' }, updatedAt: 300 }]);
    await sync([{ kind: 'session', key: 's1', data: { rpe: '8' }, updatedAt: 200 }]);
    expect((await getRecords(env, 1, 'session')).s1.rpe).toBe('6');
  });
});
describe('Zusammenführen (rein)', () => {
  test('Felder, Listen mit Kennung und Konflikte', () => {
    const base = { metrics: { intervals: [{ sec: 600 }] }, rpe: null };
    const a = mergeVersions(base, { ...base, rpe: '7' }, 100, { metrics: { intervals: [{ sec: 600, hr: 150 }] }, rpe: null }, 200);
    expect(a.data).toEqual({ metrics: { intervals: [{ sec: 600, hr: 150 }] }, rpe: '7' }); expect(a.merged).toBe(true); expect(a.updatedAt).toBe(201);
    expect(mergeVersions(undefined, { x: 1 }, 100, { x: 2 }, 200).data).toEqual({ x: 1 });
  });
});
