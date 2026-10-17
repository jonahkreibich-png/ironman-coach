/* Auftrag 15: Jeder Nutzer kann verbinden. Konto ohne Einladung beim ersten „Verbinden“ (mit Grenzen gegen Missbrauch),
   Liste der Dienste ohne Konto, normale Nutzer sehen nie Server, Schlüssel oder Secrets, Anbieter-Grenze im Entwicklermodus. */
import { test, expect, describe } from 'vitest';
import worker from '../src/index';
import { makeEnv, call } from './multiuser.test';

const SECRETS = { PUBLIC_URL: 'https://app.test', OURA_CLIENT_ID: 'oid', OURA_CLIENT_SECRET: 'osec', DROPBOX_APP_KEY: 'dk', DROPBOX_APP_SECRET: 'dsec' };
async function from(env: any, ip: string, body: any) {
  const res = await worker.fetch(new Request('http://x/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(body) }), env, { waitUntil() {} });
  return { status: res.status, data: await res.json().catch(() => null) as any };
}
async function withOperator(extra: any = {}) {
  const env = makeEnv({ ...SECRETS, ...extra });
  const op = (await call(env, 'POST', '/api/setup', { name: 'iPhone' })).data; // Nutzer 1 = Betreiber
  return { env, op };
}
const TECH = /Server|Secret|TOKEN_KEY|_CLIENT_|APP_KEY|APP_SECRET|Betreiber|callback/i;

describe('Konto ohne Einladung', () => {
  test('neuer Nutzer bekommt ein eigenes Konto (kein Betreiber), mit Wiederherstellungscode', async () => {
    const { env } = await withOperator();
    const r = await from(env, '1.2.3.4', { signup: true, name: 'iPhone', userName: 'Mama' });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ newUser: true, signup: true }); expect(r.data.userId).toBeGreaterThan(1);
    expect(r.data.recoveryCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const me = (await call(env, 'GET', '/api/me', null, r.data.token)).data;
    expect(me.role).toBe('user'); expect(me.userId).toBe(r.data.userId);
  });
  test('Grenzen: 3 Konten pro Tag und Adresse, abschaltbar, nicht vor der Einrichtung', async () => {
    const { env } = await withOperator();
    for (let i = 0; i < 3; i++) expect((await from(env, '5.5.5.5', { signup: true, name: 'iPhone' })).status).toBe(200);
    const r4 = await from(env, '5.5.5.5', { signup: true, name: 'iPhone' });
    expect(r4.status).toBe(429); expect(r4.data.error).not.toMatch(TECH);
    expect((await from(env, '6.6.6.6', { signup: true, name: 'iPhone' })).status).toBe(200);
    const off = await withOperator({ OPEN_SIGNUP: '0' });
    expect((await from(off.env, '7.7.7.7', { signup: true })).status).toBe(403);
    const empty = makeEnv(SECRETS);
    expect((await from(empty, '8.8.8.8', { signup: true })).status).toBe(409);
    const full = await withOperator({ SIGNUP_MAX: '1' });
    const rf = await from(full.env, '9.9.9.9', { signup: true }); expect(rf.status).toBe(503); expect(rf.data.error).not.toMatch(TECH);
  });
});

describe('Sicht für normale Nutzer', () => {
  test('Dienste-Liste ohne Konto: nur Name, Art, verfügbar – keine Schlüsselnamen, keine Server-Zeile', async () => {
    const { env } = await withOperator();
    const r = await call(env, 'GET', '/api/connect/catalog');
    expect(r.status).toBe(200);
    const list = r.data.connections;
    expect(list.find((c: any) => c.id === 'oura')).toMatchObject({ configured: true, availability: 'ready' });
    expect(list.find((c: any) => c.id === 'whoop')).toMatchObject({ configured: false });
    expect(list.some((c: any) => c.kind === 'server')).toBe(false);
    expect(JSON.stringify(list)).not.toMatch(TECH);
  });
  test('/api/connections: Betreiber sieht Schlüssel-Status, normale Nutzer nicht; Einstellungsfehler als ruhiger Satz', async () => {
    const { env, op } = await withOperator();
    const u = (await from(env, '1.1.1.1', { signup: true, name: 'iPhone' })).data;
    const adm = (await call(env, 'GET', '/api/connections', null, op.token)).data;
    expect(adm.connections.some((c: any) => c.kind === 'server')).toBe(true);
    expect(adm.connections.find((c: any) => c.id === 'oura').secrets.length).toBe(2);
    // Einstellungsfehler (TOKEN_KEY) in der Verbindung des Nutzers
    await env.DB.prepare("INSERT INTO connections (user_id, provider, status, token_enc, last_error, stats, created_at) VALUES (?, 'dropbox', 'error', NULL, ?, ?, ?)").bind(u.userId, 'Der Server ist nicht vollständig eingerichtet (Schlüssel TOKEN_KEY fehlt). Das kann nur der Betreiber beheben, danach einmal neu verbinden.', JSON.stringify({ errorCode: 'token_key' }), Date.now()).run();
    const usr = (await call(env, 'GET', '/api/connections', null, u.token)).data;
    expect(usr.callbackBase).toBeUndefined();
    expect(JSON.stringify(usr.connections)).not.toMatch(TECH);
    expect(usr.connections.find((c: any) => c.id === 'dropbox').error).toMatch(/gerade nicht verfügbar.*du musst nichts tun/);
  });
  test('fehlender App-Schlüssel: Nutzer liest „gerade nicht verfügbar“, nichts Technisches', async () => {
    const { env } = await withOperator({ OURA_CLIENT_ID: '' });
    const u = (await from(env, '2.2.2.2', { signup: true, name: 'iPhone' })).data;
    const r = await call(env, 'POST', '/api/connect/oura/start', {}, u.token);
    expect(r.status).toBe(503); expect(r.data.error).toMatch(/gerade nicht verfügbar/); expect(r.data.error).not.toMatch(TECH);
  });
  test('Anbieter im Entwicklermodus voll (z. B. Oura 10 Nutzer): neue Nutzer bekommen „gerade nicht verfügbar“, Verbundene bleiben', async () => {
    const { env, op } = await withOperator({ OURA_MAX_USERS: '1' });
    await env.DB.prepare("INSERT INTO connections (user_id, provider, status, created_at) VALUES (1, 'oura', 'connected', ?)").bind(Date.now()).run();
    const u = (await from(env, '3.3.3.3', { signup: true, name: 'iPhone' })).data;
    const r = await call(env, 'POST', '/api/connect/oura/start', {}, u.token);
    expect(r.status).toBe(503); expect(r.data.error).toMatch(/gerade nicht verfügbar/);
    expect((await call(env, 'GET', '/api/connections', null, u.token)).data.connections.find((c: any) => c.id === 'oura').full).toBe(true);
    // wer schon verbunden ist, kann neu verbinden
    expect((await call(env, 'POST', '/api/connect/oura/start', {}, op.token)).status).toBe(200);
    // Dropbox ist nicht voll: Verbinden führt zum Erlaubnis-Bildschirm
    const d = await call(env, 'POST', '/api/connect/dropbox/start', {}, u.token);
    expect(d.status).toBe(200); expect(d.data.url).toMatch(/^https:\/\/www\.dropbox\.com\/oauth2\/authorize/);
  });
});
