/* Auftrag 4 A2/A3: jeder OAuth-Ablauf von Anfang bis Ende mit einem simulierten Anbieter:
   Verbinden, Rückkehr in die App (auch an dieselbe Stelle im Fragebogen), erster Abruf, Token erneuern, Trennen. */
import { test, expect, describe, beforeEach, afterEach, vi } from 'vitest';
import { makeEnv, call } from './multiuser.test';
import worker from '../src/index';

const SECRETS = { PUBLIC_URL: 'https://app.test', OURA_CLIENT_ID: 'oid', OURA_CLIENT_SECRET: 'osec', DROPBOX_APP_KEY: 'dk', DROPBOX_APP_SECRET: 'dsec', WHOOP_CLIENT_ID: 'wid', WHOOP_CLIENT_SECRET: 'wsec', WITHINGS_CLIENT_ID: 'xid', WITHINGS_CLIENT_SECRET: 'xsec', POLAR_CLIENT_ID: 'pid', POLAR_CLIENT_SECRET: 'psec' };
const TOKEN_URL: Record<string, RegExp> = { oura: /api\.ouraring\.com\/oauth\/token/, dropbox: /api\.dropboxapi\.com\/oauth2\/token/, whoop: /prod\.whoop\.com\/oauth\/oauth2\/token/, withings: /wbsapi\.withings\.net\/v2\/oauth2/, polar: /polarremote\.com\/v2\/oauth2\/token/ };
const AUTH_HOST: Record<string, string> = { oura: 'cloud.ouraring.com', dropbox: 'www.dropbox.com', whoop: 'api.prod.whoop.com', withings: 'account.withings.com', polar: 'flow.polar.com' };

let tokenCalls: { p: string; body: string }[] = [];
let dataCalls: string[] = [];
const realFetch = globalThis.fetch;
beforeEach(() => {
  tokenCalls = []; dataCalls = [];
  vi.stubGlobal('fetch', async (input: any, init: any = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const body = String(init.body || '');
    for (const [p, re] of Object.entries(TOKEN_URL)) if (re.test(url.href)) {
      tokenCalls.push({ p, body });
      const refresh = body.includes('grant_type=refresh_token');
      const tok = { access_token: refresh ? 'AT2' : 'AT1', refresh_token: 'RT', expires_in: refresh ? 86400 : 1, ...(p === 'dropbox' ? { account_id: 'dbid:1' } : {}) };
      return json(p === 'withings' ? { status: 0, body: tok } : tok);
    }
    dataCalls.push(url.host + url.pathname);
    // einfache, leere Antworten der Dienste
    if (/withings/.test(url.host)) return json({ status: 0, body: { measuregrps: [], series: [] } });
    if (/dropboxapi/.test(url.host)) return json({ entries: [], cursor: 'c1', has_more: false });
    if (/polaraccesslink/.test(url.host)) return /\/v3\/users$/.test(url.pathname) ? json({}) : json(/exercises/.test(url.pathname) ? [] : {});
    return json({ data: [], records: [] });
  });
});
afterEach(() => { vi.unstubAllGlobals(); globalThis.fetch = realFetch; });
const json = (o: any) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe.each(['oura', 'dropbox', 'whoop', 'withings', 'polar'])('%s', p => {
  test('Verbinden aus dem Fragebogen → Rückkehr in den Fragebogen → erster Abruf → Token erneuern → Trennen', async () => {
    const env = makeEnv(SECRETS);
    const { token } = (await call(env, 'POST', '/api/setup', { name: 'iPhone' })).data;
    // 1) Verbinden: Adresse des Erlaubnis-Bildschirms mit richtiger Rückkehr-Adresse
    const s = await call(env, 'POST', `/api/connect/${p}/start`, { returnTo: 'onboarding' }, token);
    expect(s.status).toBe(200);
    const u = new URL(s.data.url);
    expect(u.host).toBe(AUTH_HOST[p]);
    expect(u.searchParams.get('redirect_uri')).toBe(`https://app.test/api/connect/${p}/callback`);
    expect(u.searchParams.get('client_id')).toBeTruthy();
    // 2) Rückkehr: zurück an dieselbe Stelle im Fragebogen, Status verbunden
    const res = await worker.fetch(new Request(`https://app.test/api/connect/${p}/callback?code=abc&state=${u.searchParams.get('state')}`), env as any, { waitUntil() {} });
    expect(res.status).toBe(302);
    const loc = res.headers.get('Location')!;
    expect(loc).toContain('open=onboarding');
    expect(loc).toContain('verbunden=' + p);
    expect(tokenCalls.filter(c => c.p === p && c.body.includes('authorization_code')).length).toBe(1);
    // 3) erster Abruf ist gelaufen
    expect(dataCalls.length).toBeGreaterThan(0);
    let st = (await call(env, 'GET', '/api/connections', null, token)).data.connections.find((c: any) => c.id === p);
    expect(st.status).toBe('connected'); expect(st.configured).toBe(true);
    expect(st.secrets.every((x: any) => x.set)).toBe(true);
    // 4) Token ist abgelaufen (expires_in 1 s) → nächster Abruf erneuert es
    const r = await call(env, 'POST', `/api/connect/${p}/sync`, {}, token);
    expect(r.status).toBe(200);
    expect(tokenCalls.some(c => c.p === p && c.body.includes('grant_type=refresh_token'))).toBe(true);
    // 5) Trennen: Status getrennt, Token gelöscht
    expect((await call(env, 'POST', `/api/connect/${p}/disconnect`, { deleteData: true }, token)).status).toBe(200);
    st = (await call(env, 'GET', '/api/connections', null, token)).data.connections.find((c: any) => c.id === p);
    expect(st.status).toBe('disconnected');
    expect(env.DB.db.prepare('SELECT token_enc FROM connections WHERE provider = ?').get(p).token_enc).toBeNull();
    expect((await call(env, 'POST', `/api/connect/${p}/sync`, {}, token)).status).toBe(409);
  });
});

describe('Ohne Server-Schlüssel und für Partner-Dienste', () => {
  test('fehlender Schlüssel: klare Meldung mit Ausweg, Status zeigt welche Secrets fehlen', async () => {
    const env = makeEnv({ PUBLIC_URL: 'https://app.test' });
    const { token } = (await call(env, 'POST', '/api/setup', { name: 'iPhone' })).data;
    const r = await call(env, 'POST', '/api/connect/oura/start', {}, token);
    expect(r.status).toBe(503);
    expect(r.data.error).toMatch(/Apple Health|intervals\.icu/);
    const list = (await call(env, 'GET', '/api/connections', null, token)).data.connections;
    expect(list.find((c: any) => c.id === 'oura').secrets).toEqual([{ name: 'OURA_CLIENT_ID', set: false }, { name: 'OURA_CLIENT_SECRET', set: false }]);
    for (const id of ['garmin', 'coros', 'suunto', 'wahoo']) expect(list.find((c: any) => c.id === id)).toMatchObject({ availability: 'partner', via: 'intervals', status: 'none' });
  });
  test('Abbruch auf dem Erlaubnis-Bildschirm: zurück in den Fragebogen mit Hinweis', async () => {
    const env = makeEnv(SECRETS);
    const { token } = (await call(env, 'POST', '/api/setup', { name: 'iPhone' })).data;
    const s = await call(env, 'POST', '/api/connect/oura/start', { returnTo: 'onboarding' }, token);
    const state = new URL(s.data.url).searchParams.get('state');
    const res = await worker.fetch(new Request(`https://app.test/api/connect/oura/callback?error=access_denied&state=${state}`), env as any, { waitUntil() {} });
    expect(res.headers.get('Location')).toMatch(/open=onboarding&fehler=/);
  });
});
