/* Auftrag 4 A1/F4/F5/F1: zwei Nutzer auf demselben Server bekommen nie die Daten des anderen.
   Neue Nutzer sehen keinen fremden Plan, keine fremden Schwellen, keine fremden Notizen. */
import { test, expect, describe } from 'vitest';
import { makeEnv, call } from './multiuser.test';
import { loadState } from '../src/coach';

const OWNER_PROFILE = { name: 'Betreiber', birthYear: 2009, sports: ['swim', 'bike', 'run', 'football'], thresholds: { lthrRun: 170, lthrBike: 162, thresholdPaceRunSec: 339, thresholdSpeedBikeKmh: 28 } };
const OWNER_PLAN = { meta: { event: 'Block 1', eventDate: '2027-07-01', runIntervalsAllowed: false }, weeks: [{ weekNumber: 1, startDate: '2026-10-12', days: [{ date: '2026-10-12', sessions: [{ id: 'w1-mo-1', sport: 'football', title: 'Fußballtraining', plannedMinutes: 90 }] }] }] };

async function twoUsers() {
  const env = makeEnv();
  const admin = (await call(env, 'POST', '/api/setup', { name: 'iPhone Betreiber' })).data;
  await call(env, 'POST', '/api/sync', { since: 0, changes: [
    { kind: 'profile', key: 'main', data: OWNER_PROFILE, updatedAt: 10 },
    { kind: 'plan', key: 'main', data: OWNER_PLAN, updatedAt: 10 },
    { kind: 'settings', key: 'main', data: { settings: { lthrRun: 170, lthrBike: 162, readiness: { rhrMax: 56, hrvMin: 65 } } }, updatedAt: 10 },
    { kind: 'illness', key: 'ill-1', data: { id: 'ill-1', start: '2026-09-01', end: '2026-09-05', note: 'Erkältung' }, updatedAt: 10 },
    { kind: 'milestone', key: 'ms-1', data: { id: 'ms-1', text: 'Erster Freiwasser-Kilometer' }, updatedAt: 10 },
    { kind: 'coachNote', key: 'note-1', data: { id: 'note-1', text: 'Leiste rechts empfindlich' }, updatedAt: 10 }
  ] }, admin.token);
  const inv = (await call(env, 'POST', '/api/admin/testusers', { note: 'Test: Vater' }, admin.token)).data;
  const user = (await call(env, 'POST', '/api/setup', { name: 'iPhone Vater', invite: inv.code, userName: 'Vater' })).data;
  return { env, admin, user };
}

describe('Zwei Nutzer, ein Server', () => {
  test('neuer Nutzer bekommt keinen einzigen Datensatz des Betreibers', async () => {
    const { env, user } = await twoUsers();
    expect(user.userId).toBe(2);
    const r = await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, user.token);
    expect(r.status).toBe(200);
    expect(r.data.records).toEqual([]);
    const me = (await call(env, 'GET', '/api/me', null, user.token)).data;
    expect(me).toMatchObject({ userId: 2, role: 'user', test: true });
  });

  test('Server-Zustand des neuen Nutzers: kein Plan, geschätzte Schwellen statt fremder Werte', async () => {
    const { env } = await twoUsers();
    const L = await loadState(env as any, 2);
    expect(L.plan).toBeNull();
    expect(L.goals).toEqual([]);
    expect(L.state.illnessPeriods).toEqual([]);
    const th = L.profile.thresholds;
    expect([th.lthrRun, th.lthrBike, th.thresholdPaceRunSec, th.thresholdSpeedBikeKmh]).not.toEqual([170, 162, 339, 28]);
    expect(th.lthrRun).not.toBe(170); expect(th.thresholdPaceRunSec).not.toBe(339);
    expect(th.estimated).toEqual(expect.arrayContaining(['lthrRun', 'lthrBike', 'thresholdPaceRunSec']));
    expect(JSON.stringify(L)).not.toMatch(/Fußball|Leiste|Block 1|Freiwasser/);
  });

  test('Daten des neuen Nutzers landen nur bei ihm', async () => {
    const { env, admin, user } = await twoUsers();
    await call(env, 'POST', '/api/sync', { since: 0, changes: [{ kind: 'session', key: 'g1-mo-1', data: { completed: true }, updatedAt: 20 }] }, user.token);
    const a = (await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, admin.token)).data.records;
    expect(a.some((x: any) => x.key === 'g1-mo-1')).toBe(false);
    expect(a.length).toBe(6);
  });

  test('Betreiber setzt Test-Nutzer zurück: alles weg, Gerät bleibt angemeldet, App erfährt es über /api/me', async () => {
    const { env, admin, user } = await twoUsers();
    await call(env, 'POST', '/api/sync', { since: 0, changes: [{ kind: 'profile', key: 'main', data: { name: 'Vater' }, updatedAt: 20 }, { kind: 'plan', key: 'main', data: { weeks: [] }, updatedAt: 20 }] }, user.token);
    const r = await call(env, 'POST', '/api/admin/users/2/reset', {}, admin.token);
    expect(r.data).toMatchObject({ ok: true, removed: 2 });
    const recs = (await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, user.token)).data.records;
    expect(recs.every((x: any) => x.deleted)).toBe(true);
    const me = (await call(env, 'GET', '/api/me', null, user.token)).data;
    expect(me.resetAt).toBeGreaterThan(0);
    // Betreiber bleibt unberührt
    expect((await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, admin.token)).data.records.filter((x: any) => !x.deleted).length).toBe(6);
    // nur der Betreiber darf das
    expect((await call(env, 'POST', '/api/admin/users/1/reset', {}, user.token)).status).toBe(403);
    expect((await call(env, 'POST', '/api/admin/users/1/reset', {}, admin.token)).status).toBe(400);
  });

  test('Test-Nutzer löschen entfernt Konto und Geräte', async () => {
    const { env, admin, user } = await twoUsers();
    expect((await call(env, 'DELETE', '/api/admin/users/2', null, admin.token)).status).toBe(200);
    expect((await call(env, 'GET', '/api/me', null, user.token)).status).toBe(401);
    const users = (await call(env, 'GET', '/api/admin/users', null, admin.token)).data.users;
    expect(users.map((u: any) => u.id)).toEqual([1]);
  });

  test('Abmelden entfernt nur dieses Gerät', async () => {
    const { env, user } = await twoUsers();
    expect((await call(env, 'POST', '/api/devices/self/logout', {}, user.token)).status).toBe(200);
    expect((await call(env, 'GET', '/api/me', null, user.token)).status).toBe(401);
  });

  test('Fehler melden: Meldung mit Bildschirm, Version, Gerät; nur der Betreiber sieht die Liste', async () => {
    const { env, admin, user } = await twoUsers();
    const r = await call(env, 'POST', '/api/feedback', { kind: 'bug', text: 'Verbinden-Knopf tut nichts', screen: 'onboarding', version: '2.1.0', device: 'iPhone Safari', errors: [{ msg: 'TypeError: x is undefined', where: 'click', at: 1 }] }, user.token);
    expect(r.status).toBe(200);
    expect((await call(env, 'POST', '/api/feedback', { text: '  ' }, user.token)).status).toBe(400);
    expect((await call(env, 'GET', '/api/admin/feedback', null, user.token)).status).toBe(403);
    const list = (await call(env, 'GET', '/api/admin/feedback', null, admin.token)).data.feedback;
    expect(list[0]).toMatchObject({ user: 'Vater', kind: 'bug', text: 'Verbinden-Knopf tut nichts', screen: 'onboarding', version: '2.1.0' });
    expect(list[0].errors[0].msg).toContain('TypeError');
  });
});
