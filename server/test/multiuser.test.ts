/* Migration auf Mehrbenutzer (an einer Kopie mit Altdaten) und Trennung der Nutzer. */
import { test, expect, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore
import { D1Shim } from './d1-shim.mjs';
import worker from '../src/index';

const MIG = path.resolve(__dirname, '../migrations');
const sql = (f: string) => fs.readFileSync(path.join(MIG, f), 'utf8');
export function freshDb() {
  const db = new D1Shim();
  fs.readdirSync(MIG).filter(f => f.endsWith('.sql')).sort().forEach(f => db.db.exec(sql(f)));
  return db;
}
export function makeEnv(extra: any = {}) { return { DB: freshDb(), TOKEN_KEY: 'test-token-key-0123456789abcdef', ALLOWED_ORIGINS: '', ...extra }; }
export async function call(env: any, method: string, p: string, body?: any, token?: string) {
  const res = await worker.fetch(new Request('http://x' + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });
  return { status: res.status, data: await res.json().catch(() => null) as any };
}

describe('Migration 0002 an einer Kopie mit Altdaten', () => {
  test('Daten landen bei Nutzer 1, nichts geht verloren', async () => {
    const db = new D1Shim();
    db.db.exec(sql('0001_initial.sql'));
    db.db.exec(`INSERT INTO devices (id, name, token_hash, created_at, last_seen) VALUES ('dev-a', 'iPhone', 'h1', 1, 1);
      INSERT INTO records (kind, key, data, updated_at, deleted, rev) VALUES ('plan', 'main', '{"weeks":[]}', 5, 0, 1), ('session', 's1', '{"completed":true}', 6, 0, 2), ('trend', '2026-10-01', NULL, 7, 1, 3);
      UPDATE meta SET v = '3' WHERE k = 'rev';
      INSERT INTO meta (k, v) VALUES ('intervals_last', '{"ok":true}'), ('daily_done', '"2026-10-10"');
      INSERT INTO backups (day, created_at, data) VALUES ('2026-10-09', 1, '[]');
      INSERT INTO push_subs (id, device_id, endpoint, p256dh, auth, created_at) VALUES ('sub-1', 'dev-a', 'https://e', 'p', 'a', 1);
      INSERT INTO push_log (key, day, type, sent_at) VALUES ('morning', '2026-10-10', 'morning', 1);
      INSERT INTO push_queue (key, type, payload, created_at) VALUES ('warn', 'warnings', '{}', 1);`);
    const before = db.db.prepare('SELECT COUNT(*) AS n FROM records').get().n;
    db.db.exec(sql('0002_multiuser.sql'));
    const recs = db.db.prepare('SELECT user_id, kind, key, deleted, rev FROM records ORDER BY rev').all();
    expect(recs.length).toBe(before);
    expect(recs.every((r: any) => r.user_id === 1)).toBe(true);
    expect(recs[2].deleted).toBe(1);
    expect(db.db.prepare("SELECT v FROM meta WHERE k = 'rev'").get().v).toBe('3');
    expect(db.db.prepare('SELECT COUNT(*) AS n FROM meta').get().n).toBe(1);
    expect(db.db.prepare("SELECT v FROM user_meta WHERE user_id = 1 AND k = 'daily_done'").get().v).toBe('"2026-10-10"');
    expect(db.db.prepare('SELECT user_id FROM devices').get().user_id).toBe(1);
    expect(db.db.prepare('SELECT user_id FROM backups').get().user_id).toBe(1);
    expect(db.db.prepare('SELECT user_id FROM push_subs').get().user_id).toBe(1);
    expect(db.db.prepare('SELECT user_id FROM push_log').get().user_id).toBe(1);
    expect(db.db.prepare('SELECT role FROM users WHERE id = 1').get().role).toBe('admin');
    // Der alte Geräteschlüssel funktioniert weiter (Hash unverändert), Sync liefert die Altdaten
    const env = { DB: db, TOKEN_KEY: 'x'.repeat(32) };
    const tok = 'A'.repeat(43);
    const { createHash } = await import('node:crypto');
    db.db.prepare("UPDATE devices SET token_hash = ? WHERE id = 'dev-a'").run(createHash('sha256').update(tok).digest('hex'));
    const r = await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, tok);
    expect(r.status).toBe(200);
    expect(r.data.records.map((x: any) => x.key).sort()).toEqual(['2026-10-01', 'main', 's1']);
  });
});

describe('Mehrere Nutzer', () => {
  test('Einladung, getrennte Daten, Kopplung bleibt beim eigenen Nutzer', async () => {
    const env = makeEnv();
    const A = (await call(env, 'POST', '/api/setup', { name: 'iPhone' })).data;
    expect(A.userId).toBe(1);
    // Ohne Einladung keine weitere Registrierung
    expect((await call(env, 'POST', '/api/setup', { name: 'Fremd' })).status).toBe(409);
    expect((await call(env, 'POST', '/api/setup', { name: 'Fremd', invite: 'AAAA-BBBB' })).status).toBe(403);
    const inv = (await call(env, 'POST', '/api/invites', { note: 'Tester Max' }, A.token)).data;
    expect(inv.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const B = (await call(env, 'POST', '/api/setup', { name: 'Pixel', invite: inv.code.toLowerCase() })).data;
    expect(B.userId).toBe(2);
    expect((await call(env, 'POST', '/api/setup', { name: 'Noch einer', invite: inv.code })).status).toBe(403);
    // Tester darf keine Einladungen erzeugen
    expect((await call(env, 'POST', '/api/invites', {}, B.token)).status).toBe(403);
    // Gleicher Schlüssel bei zwei Nutzern stört sich nicht
    await call(env, 'POST', '/api/sync', { since: 0, changes: [{ kind: 'session', key: 's1', data: { who: 'A' }, updatedAt: 10 }] }, A.token);
    await call(env, 'POST', '/api/sync', { since: 0, changes: [{ kind: 'session', key: 's1', data: { who: 'B' }, updatedAt: 5 }] }, B.token);
    const ra = (await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, A.token)).data.records;
    const rb = (await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, B.token)).data.records;
    expect(ra).toHaveLength(1); expect(ra[0].data.who).toBe('A');
    expect(rb).toHaveLength(1); expect(rb[0].data.who).toBe('B');
    // Geräteliste nur eigene, fremdes Gerät nicht löschbar
    const devB = (await call(env, 'GET', '/api/devices', null, B.token)).data.devices;
    expect(devB).toHaveLength(1);
    await call(env, 'DELETE', '/api/devices/' + A.deviceId, null, B.token);
    expect((await call(env, 'GET', '/api/me', null, A.token)).status).toBe(200);
    // Kopplungscode von B koppelt ein zweites Gerät für B
    const pc = (await call(env, 'POST', '/api/pair/create', null, B.token)).data;
    const B2 = (await call(env, 'POST', '/api/pair/redeem', { code: pc.code, name: 'Tablet' })).data;
    expect(B2.userId).toBe(2);
    expect((await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, B2.token)).data.records[0].data.who).toBe('B');
    // Backups getrennt
    await call(env, 'POST', '/api/backups/now', null, A.token);
    expect((await call(env, 'GET', '/api/backups', null, B.token)).data.backups).toHaveLength(0);
  });
});

describe('Einrichtungscode', () => {
  test('ohne Code keine Erst-Einrichtung, mit Code Zugang als Nutzer 1', async () => {
    const env = makeEnv({ SETUP_CODE: 'geheim-1234-abcd' });
    expect((await call(env, 'POST', '/api/setup', { name: 'Fremd' })).status).toBe(403);
    expect((await call(env, 'POST', '/api/setup', { name: 'Fremd', setupCode: 'falsch' })).status).toBe(403);
    const a = await call(env, 'POST', '/api/setup', { name: 'iPhone', setupCode: 'geheim-1234-abcd' });
    expect(a.data.userId).toBe(1);
    const b = await call(env, 'POST', '/api/setup', { name: 'PC', setupCode: 'geheim-1234-abcd' });
    expect(b.data.userId).toBe(1);
    expect((await call(env, 'GET', '/api/devices', null, a.data.token)).data.devices).toHaveLength(2);
  });
});
