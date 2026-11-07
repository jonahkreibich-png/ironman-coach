/* Auftrag 28: Korrekturen des Betreibers laufen als normale Änderung mit Zeitstempel über denselben Weg wie der Abgleich.
   Fall von Nutzer 1 (1.11.): Krankheitsphase auf dem Server beendet, das iPhone hatte noch den alten Stand (Phase offen) und eigene,
   noch nicht hochgeladene Änderungen. Ergebnis muss sein: Krankheit bleibt beendet, Eingaben des Geräts bleiben erhalten. */
import { test, expect, describe } from 'vitest';
import { makeEnv, call } from './multiuser.test';
import { getRecords } from '../src/store';

const OPEN = { id: 'ill-1', start: '2026-10-30', end: null, note: '' };
async function setup() {
  const env = makeEnv();
  const owner = (await call(env, 'POST', '/api/setup', { name: 'Synthetisch Betreiber' })).data;
  const sync = (changes: any[], since = 0, token = owner.token) => call(env, 'POST', '/api/sync', { since, changes }, token);
  const fix = (uid: number, changes: any[], token = owner.token) => call(env, 'POST', `/api/admin/users/${uid}/changes`, { changes, reason: 'Test' }, token);
  // Gerät hat die offene Phase hochgeladen und kennt Revision `cursor`
  const first = await sync([{ kind: 'illness', key: 'ill-1', data: OPEN, updatedAt: 1000 }]);
  return { env, owner, sync, fix, cursor: first.data.cursor };
}

describe('Korrektur als normale Änderung', () => {
  test('Server beendet die Phase: Gerät bekommt sie beim nächsten Abgleich als neue Änderung', async () => {
    const { sync, fix, cursor } = await setup();
    const r = await fix(1, [{ kind: 'illness', key: 'ill-1', data: { ...OPEN, end: '2026-10-31' }, base: OPEN }]);
    expect(r.status).toBe(200);
    expect(r.data.changes[0].updatedAt).toBeGreaterThan(1000);
    const pulled = await sync([], cursor);
    expect(pulled.data.records.find((x: any) => x.key === 'ill-1').data.end).toBe('2026-10-31');
  });
  test('altes Gerät ändert die Notiz der noch offenen Phase (Ausgangsstand offen): Ende bleibt, Notiz kommt dazu', async () => {
    const { env, sync, fix, cursor } = await setup();
    await fix(1, [{ kind: 'illness', key: 'ill-1', data: { ...OPEN, end: '2026-10-31' }, base: OPEN }]);
    // Gerät war offline, Uhrzeit seiner Änderung liegt sogar nach der Korrektur
    const r = await sync([{ kind: 'illness', key: 'ill-1', data: { ...OPEN, note: 'Halsweh' }, base: OPEN, updatedAt: Date.now() + 60000 }], cursor);
    const s = (await getRecords(env, 1, 'illness'))['ill-1'];
    expect(s).toMatchObject({ end: '2026-10-31', note: 'Halsweh' });
    expect(r.data.records.find((x: any) => x.key === 'ill-1').data).toMatchObject({ end: '2026-10-31', note: 'Halsweh' });
  });
  test('„Wieder gesund“ noch in der Warteschlange (älter als die Korrektur): Krankheit bleibt beendet', async () => {
    const { env, sync, fix, cursor } = await setup();
    await fix(1, [{ kind: 'illness', key: 'ill-1', data: { ...OPEN, end: '2026-10-31' }, base: OPEN }]);
    await sync([{ kind: 'illness', key: 'ill-1', data: { ...OPEN, end: '2026-10-31' }, base: OPEN, updatedAt: 2000 }], cursor);
    expect((await getRecords(env, 1, 'illness'))['ill-1'].end).toBe('2026-10-31');
  });
  test('alte App ohne Ausgangsstand mit älterem Stand: neueste Änderung gewinnt, Krankheit bleibt beendet', async () => {
    const { env, sync, fix, cursor } = await setup();
    await fix(1, [{ kind: 'illness', key: 'ill-1', data: { ...OPEN, end: '2026-10-31' }, base: OPEN }]);
    await sync([{ kind: 'illness', key: 'ill-1', data: OPEN, updatedAt: 3000 }], cursor);
    expect((await getRecords(env, 1, 'illness'))['ill-1'].end).toBe('2026-10-31');
  });
  test('„Doch noch krank“ nach der Korrektur (Ende bewusst entfernt): Phase ist wieder offen', async () => {
    const { env, sync, fix, cursor } = await setup();
    const ended = { ...OPEN, end: '2026-10-31' };
    await fix(1, [{ kind: 'illness', key: 'ill-1', data: ended, base: OPEN }]);
    await sync([{ kind: 'illness', key: 'ill-1', data: { ...ended, end: null }, base: ended, updatedAt: Date.now() + 60000 }], cursor);
    expect((await getRecords(env, 1, 'illness'))['ill-1'].end).toBeNull();
  });
  test('nur der Betreiber darf korrigieren, ungültige Datensätze werden abgelehnt, Korrektur steht im Protokoll', async () => {
    const { env, owner, fix } = await setup();
    const inv = (await call(env, 'POST', '/api/invites', { note: 'x' }, owner.token)).data;
    const user = (await call(env, 'POST', '/api/setup', { invite: inv.code, name: 'Synthetisch', userName: 'SYNTH' })).data;
    expect((await fix(1, [{ kind: 'illness', key: 'ill-1', data: OPEN }], user.token)).status).toBe(403);
    expect((await fix(user.userId, [{ kind: 'gibtsnicht', key: 'x', data: {} }])).status).toBe(400);
    expect((await fix(999, [{ kind: 'illness', key: 'x', data: {} }])).status).toBe(404);
    const ok = await fix(user.userId, [{ kind: 'illness', key: 'ill-9', data: { id: 'ill-9', start: '2026-10-28', end: '2026-11-05' } }]);
    expect(ok.status).toBe(200);
    expect((await getRecords(env, user.userId, 'illness'))['ill-9'].end).toBe('2026-11-05');
    const log = await env.DB.prepare("SELECT source, msg, user_id FROM error_log WHERE source = 'korrektur'").all();
    expect(log.results.some((r: any) => r.user_id === user.userId && /illness\/ill-9/.test(r.msg))).toBe(true);
  });
});
