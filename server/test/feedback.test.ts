/* Auftrag 5 B: „Fehler melden / Idee“ kommt beim Betreiber an (Server, Mitteilung, Status, Antwort, Screenshot, Fehler je Tester). */
import { test, expect, afterEach } from 'vitest';
import { makeEnv, call } from './multiuser.test';
import { setPushOverride } from '../src/notify';

afterEach(() => setPushOverride(null));
async function two() {
  const env = makeEnv({ VAPID_PRIVATE_JWK: '{}' });
  const A = (await call(env, 'POST', '/api/setup', { name: 'iPhone Jonah' })).data.token;
  const inv = (await call(env, 'POST', '/api/admin/testusers', { note: 'Papa' }, A)).data;
  const B = (await call(env, 'POST', '/api/setup', { name: 'iPhone Papa', invite: inv.code, userName: 'Papa' }, undefined)).data.token;
  // Betreiber-Gerät mit Mitteilungen
  await env.DB.prepare("INSERT INTO push_subs (id, device_id, endpoint, p256dh, auth, created_at, user_id) VALUES ('s-a', 'dev-a', 'https://push.example/a', 'p', 'x', 1, 1)").run();
  await env.DB.prepare("INSERT INTO push_subs (id, device_id, endpoint, p256dh, auth, created_at, user_id) VALUES ('s-b', 'dev-b', 'https://push.example/b', 'p', 'x', 1, 2)").run();
  return { env, A, B };
}
const SHOT = 'data:image/jpeg;base64,' + 'A'.repeat(4000);

test('Nutzer B meldet → Betreiber A sieht die Meldung mit Version, Bildschirm, Gerät, Screenshot und bekommt eine Mitteilung', async () => {
  const sent: any[] = []; setPushOverride(async (sub: any, msg: any) => { sent.push({ sub: sub.endpoint, msg }); return { ok: true }; });
  const { env, A, B } = await two();
  const r = await call(env, 'POST', '/api/feedback', { kind: 'bug', text: 'Der Plan legt den Lauf auf Montag', screen: 'plan', version: '2026101118', device: 'iPhone iOS 26.0, Safari', errors: [], screenshot: SHOT }, B);
  expect(r.status).toBe(200); expect(r.data.ok).toBe(true);
  const list = (await call(env, 'GET', '/api/admin/feedback', undefined, A)).data.feedback;
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ user: 'Papa', text: 'Der Plan legt den Lauf auf Montag', version: '2026101118', screen: 'plan', status: 'neu', hasScreenshot: true });
  const shot = (await call(env, 'GET', `/api/admin/feedback/${list[0].id}/screenshot`, undefined, A)).data;
  expect(shot.screenshot).toBe(SHOT);
  // Mitteilung nur an den Betreiber, mit Link zur Meldung
  expect(sent.map(s => s.sub)).toEqual(['https://push.example/a']);
  expect(sent[0].msg.title).toBe('Neue Meldung von Papa');
  expect(sent[0].msg.body).toContain('Der Plan legt den Lauf');
  expect(sent[0].msg.url).toBe(`/?go=feedback&fb=${list[0].id}`);
  // andere Nutzer sehen fremde Meldungen nicht
  expect((await call(env, 'GET', '/api/admin/feedback', undefined, B)).status).toBe(403);
});

test('Status und Antwort: der Nutzer sieht die Antwort in der App (Coach-Nachricht und eigene Liste)', async () => {
  setPushOverride(async () => ({ ok: true }));
  const { env, A, B } = await two();
  await call(env, 'POST', '/api/feedback', { kind: 'idea', text: 'Dunkles Design heller', version: 'x' }, B);
  const id = (await call(env, 'GET', '/api/admin/feedback', undefined, A)).data.feedback[0].id;
  await call(env, 'POST', `/api/admin/feedback/${id}`, { status: 'arbeit' }, A);
  await call(env, 'POST', `/api/admin/feedback/${id}`, { reply: 'Danke! Ist in der nächsten Version drin.' }, A);
  const mine = (await call(env, 'GET', '/api/feedback/mine', undefined, B)).data.feedback;
  expect(mine[0]).toMatchObject({ text: 'Dunkles Design heller', status: 'arbeit', reply: 'Danke! Ist in der nächsten Version drin.', replySeen: false });
  const recs = (await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, B)).data.records;
  const msg = recs.find((r: any) => r.kind === 'coachMsg');
  expect(msg.data.text).toContain('Danke! Ist in der nächsten Version drin.');
  expect(msg.data.title).toBe('Antwort auf deine Meldung');
  await call(env, 'POST', '/api/feedback/mine/seen', {}, B);
  expect((await call(env, 'GET', '/api/feedback/mine', undefined, B)).data.feedback[0].replySeen).toBe(true);
});

test('Fehler bei Testern ohne Meldung: Betreiber sieht sie je Nutzer (ohne Gesundheitsdaten)', async () => {
  const { env, A, B } = await two();
  await call(env, 'POST', '/api/log', { errors: [{ msg: 'TypeError: x is undefined', where: 'plan.ts:12', version: '20261011', view: 'plan' }] }, B);
  const r = (await call(env, 'GET', '/api/admin/errors', undefined, A)).data;
  expect(r.groups).toEqual([expect.objectContaining({ users: ['Papa'], count: 1, text: expect.stringContaining('x is undefined') })]);
});

test('Auftrag 14: gleiche Fehler als eine Zeile („9× …“), kurzer Text, „Erledigt“ blendet sie aus, Dropbox-App-Ordner ist ein Betreiber-Hinweis', async () => {
  const { env, A, B } = await two();
  const long = 'dropbox: Die Dropbox-App des Servers sieht nur ihren eigenen, leeren Ordner („App folder“). HealthFit speichert aber in /Apps/HealthFit. Der Betreiber muss eine Dropbox-App mit Full Dropbox anlegen. [folder, TOKEN_KEY ok]';
  for (let i = 0; i < 9; i++) await env.DB.prepare('INSERT INTO error_log (at, source, msg, place, user_id) VALUES (?, ?, ?, ?, ?)').bind(Date.now() - i * 1000, 'server', long, 'sync-dropbox', A.userId ?? 1).run();
  for (let i = 0; i < 3; i++) await call(env, 'POST', '/api/log', { errors: [{ msg: `TypeError: Zeile ${i} kaputt`, where: 'plan.ts:12', version: '3.0.0', view: 'plan' }] }, B);
  let r = (await call(env, 'GET', '/api/admin/errors', undefined, A)).data;
  expect(r.operator).toEqual([expect.objectContaining({ key: 'op-dropbox-appfolder', count: 9, text: expect.stringContaining('App folder') })]);
  expect(r.groups.some((g: any) => /Dropbox/.test(g.label))).toBe(false);
  expect(r.groups).toHaveLength(1);
  expect(r.groups[0]).toMatchObject({ count: 3, users: ['Papa'] });
  expect(r.groups[0].text.length).toBeLessThanOrEqual(92);
  await call(env, 'POST', '/api/admin/errors/ack', { key: r.groups[0].key }, A);
  await call(env, 'POST', '/api/admin/errors/ack', { key: 'op-dropbox-appfolder' }, A);
  r = (await call(env, 'GET', '/api/admin/errors', undefined, A)).data;
  expect(r.groups).toEqual([]); expect(r.operator).toEqual([]);
  // tritt der Fehler wieder auf, ist er wieder da
  await call(env, 'POST', '/api/log', { errors: [{ msg: 'TypeError: Zeile 7 kaputt', where: 'plan.ts:12', version: '3.0.0', view: 'plan' }] }, B);
  r = (await call(env, 'GET', '/api/admin/errors', undefined, A)).data;
  expect(r.groups).toEqual([expect.objectContaining({ count: 1 })]);
  expect((await call(env, 'POST', '/api/admin/errors/ack', { key: 'x' }, B)).status).toBe(403);
});

test('Auftrag 14: Status neu → in Arbeit → erledigt oder verworfen; Zähler „neu“ zählt nur offene, Melder sieht den Status, auch eigene Meldungen', async () => {
  const { env, A, B } = await two();
  const id1 = (await call(env, 'POST', '/api/feedback', { kind: 'bug', text: 'A' }, B)).data.id;
  const id2 = (await call(env, 'POST', '/api/feedback', { kind: 'idea', text: 'B' }, B)).data.id;
  const own = (await call(env, 'POST', '/api/feedback', { kind: 'idea', text: 'eigene Idee' }, A)).data.id;
  expect((await call(env, 'GET', '/api/me', undefined, A)).data.feedbackNew).toBe(3);
  await call(env, 'POST', `/api/admin/feedback/${id1}`, { status: 'arbeit' }, A);
  await call(env, 'POST', `/api/admin/feedback/${id2}`, { status: 'verworfen' }, A);
  await call(env, 'POST', `/api/admin/feedback/${own}`, { status: 'erledigt' }, A);
  expect((await call(env, 'GET', '/api/me', undefined, A)).data.feedbackNew).toBe(0);
  const mine = (await call(env, 'GET', '/api/feedback/mine', undefined, B)).data.feedback;
  expect(Object.fromEntries(mine.map((f: any) => [f.text, f.status]))).toEqual({ A: 'arbeit', B: 'verworfen' });
  expect((await call(env, 'GET', '/api/feedback/mine', undefined, A)).data.feedback[0].status).toBe('erledigt');
  const all = (await call(env, 'GET', '/api/admin/feedback', undefined, A)).data.feedback;
  expect(all.find((f: any) => f.id === id2).done).toBe(true);
});
