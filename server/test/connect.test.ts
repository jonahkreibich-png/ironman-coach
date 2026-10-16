/* Verbindungen mit simulierten Diensten (keine echten Aufrufe). */
import { test, expect, describe, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import { makeEnv, call } from './multiuser.test';
import { swimFit, intervalFit } from '../../tests/helpers/fit-encode';
import { shortcutPayload, looseNum } from '../src/connect';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
const add = (s: string, n: number) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const yday = add(today, -1);
const SECRETS = { PUBLIC_URL: 'https://app.test', OURA_CLIENT_ID: 'oid', OURA_CLIENT_SECRET: 'osec', DROPBOX_APP_KEY: 'dk', DROPBOX_APP_SECRET: 'dsec', WHOOP_CLIENT_ID: 'wid', WHOOP_CLIENT_SECRET: 'wsec', WITHINGS_CLIENT_ID: 'xid', WITHINGS_CLIENT_SECRET: 'xsec', POLAR_CLIENT_ID: 'pid', POLAR_CLIENT_SECRET: 'psec' };

type Handler = (url: URL, init: any) => any;
let routes: [RegExp, Handler][] = [];
const calls: string[] = [];
const realFetch = globalThis.fetch;
beforeEach(() => {
  routes = []; calls.length = 0;
  vi.stubGlobal('fetch', async (input: any, init: any = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    calls.push(url.host + url.pathname);
    for (const [re, h] of routes) if (re.test(url.href)) { const r = await h(url, init); return r instanceof Response ? r : new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
    return new Response('not mocked: ' + url.href, { status: 599 });
  });
});
afterEach(() => { vi.unstubAllGlobals(); globalThis.fetch = realFetch; });

async function setupUser(extra: any = {}) {
  const env = makeEnv({ ...SECRETS, ...extra });
  const A = (await call(env, 'POST', '/api/setup', { name: 'iPhone' })).data;
  const days = [-1, 0].map(i => ({ date: add(today, i), sessions: [{ id: 'swim' + i, sport: 'swim', title: 'Schwimmen Technik', plannedMinutes: 45 }, { id: 'run' + i, sport: 'run', title: 'Lauf-Intervalle 5×3 min', zone: 'Zone 4', plannedMinutes: 50 }] }));
  await call(env, 'POST', '/api/sync', { since: 0, changes: [
    { kind: 'plan', key: 'main', data: { meta: { runIntervalsAllowed: true }, weeks: [{ weekNumber: 1, startDate: days[0].date, days }] }, updatedAt: 1 },
    { kind: 'trend', key: yday, data: { date: yday, sleepHours: 6.5 }, updatedAt: 1 }
  ] }, A.token);
  return { env, token: A.token };
}
/* since: seit wann die Verbindung besteht. Standard: schon länger (erneutes Anmelden), damit die Daten der letzten Tage übernommen werden.
   null = ganz neu verbinden (dann bleibt alles vor dem Verbinden, wie es war). */
async function connectViaOAuth(env: any, token: string, p: string, tokenBody: any, since: number | null = Date.now() - 3 * 86400000) {
  if (since != null) env.DB.db.prepare("INSERT INTO connections (user_id, provider, status, stats, created_at) VALUES (1, ?, 'reauth', ?, ?)").run(p, JSON.stringify({ since }), since);
  routes.push([new RegExp(p === 'oura' ? 'api.ouraring.com/oauth/token' : p === 'dropbox' ? 'api.dropboxapi.com/oauth2/token' : p === 'whoop' ? 'oauth2/token' : p === 'withings' ? 'wbsapi.withings.net/v2/oauth2' : 'polarremote.com'), () => tokenBody]);
  const s = await call(env, 'POST', `/api/connect/${p}/start`, {}, token);
  expect(s.status).toBe(200);
  const u = new URL(s.data.url);
  expect(u.searchParams.get('redirect_uri')).toBe(`https://app.test/api/connect/${p}/callback`);
  const res = await (await import('../src/index')).default.fetch(new Request(`https://app.test/api/connect/${p}/callback?code=abc&state=${u.searchParams.get('state')}`), env, { waitUntil() {} });
  expect(res.status).toBe(302);
  return res.headers.get('Location')!;
}
const records = async (env: any, token: string) => (await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, token)).data.records;

describe('Oura', () => {
  test('Verbinden, Werte übernehmen (Schlaf, HFV, Ruhepuls, Temperatur, SpO2), Quelle gespeichert', async () => {
    const { env, token } = await setupUser();
    routes.push([/usercollection\/sleep/, () => ({ data: [{ day: today, type: 'long_sleep', total_sleep_duration: 27900, rem_sleep_duration: 5400, deep_sleep_duration: 4800, latency: 600, average_hrv: 58, lowest_heart_rate: 52, average_breath: 14.6 }, { day: today, type: 'rest', total_sleep_duration: 1200 }] })]);
    routes.push([/daily_readiness/, () => ({ data: [{ day: today, temperature_deviation: 0.12 }] })]);
    routes.push([/daily_spo2/, () => ({ data: [{ day: today, spo2_percentage: { average: 97.1 } }] })]);
    routes.push([/daily_sleep/, () => ({ data: [{ day: today, score: 81 }] })]);
    const loc = await connectViaOAuth(env, token, 'oura', { access_token: 'AT', refresh_token: 'RT', expires_in: 86400 });
    expect(loc).toContain('verbunden=oura');
    const p = (await records(env, token)).find((r: any) => r.kind === 'trend' && r.key === today).data;
    expect(p).toMatchObject({ sleepHours: 7.8, remSleep: 90, deepSleep: 80, sleepLatency: 10, hrv: 58, restingHR: 52, breathingRate: 14.6, bodyTemp: 0.12, spo2: 97.1, sleepQuality: 8 });
    expect(p._src.hrv).toBe('oura');
    const st = (await call(env, 'GET', '/api/connections', null, token)).data.connections.find((c: any) => c.id === 'oura');
    expect(st.status).toBe('connected'); expect(st.lastOkAt).toBeGreaterThan(0);
    // Tokens liegen nur verschlüsselt in der Datenbank
    const row = env.DB.db.prepare("SELECT token_enc FROM connections WHERE provider = 'oura'").get();
    // (vorher: not.toContain('AT') – schlug zufällig fehl, wenn der verschlüsselte Text „AT“ enthielt)
    expect(row.token_enc).not.toContain('"AT"'); expect(row.token_enc).not.toContain('access_token');
  });
  test('Abgelaufenes Token wird erneuert, abgelehntes führt zu „neu verbinden“', async () => {
    const { env, token } = await setupUser();
    routes.push([/usercollection/, () => ({ data: [] })]);
    await connectViaOAuth(env, token, 'oura', { access_token: 'AT', refresh_token: 'RT', expires_in: 1 });
    routes.unshift([/api.ouraring.com\/oauth\/token/, (_u, init) => String(init.body).includes('refresh_token') ? { access_token: 'AT2', expires_in: 86400 } : { access_token: 'AT' }]);
    expect((await call(env, 'POST', '/api/connect/oura/sync', {}, token)).status).toBe(200);
    routes.unshift([/usercollection/, () => new Response('nope', { status: 401 })]);
    env.DB.db.prepare("UPDATE connections SET expires_at = ? WHERE provider = 'oura'").run(Date.now() + 3600000);
    expect((await call(env, 'POST', '/api/connect/oura/sync', {}, token)).status).toBe(401);
    const st = (await call(env, 'GET', '/api/connections', null, token)).data.connections.find((c: any) => c.id === 'oura');
    expect(st.status).toBe('reauth');
  });
  test('Trennen mit Löschen entfernt alle Oura-Werte, von Hand eingetragene bleiben', async () => {
    const { env, token } = await setupUser();
    routes.push([/usercollection\/sleep/, () => ({ data: [{ day: yday, type: 'long_sleep', total_sleep_duration: 28800, average_hrv: 61 }] })]);
    routes.push([/usercollection/, () => ({ data: [] })]);
    await connectViaOAuth(env, token, 'oura', { access_token: 'AT', expires_in: 86400 });
    let p = (await records(env, token)).find((r: any) => r.key === yday && r.kind === 'trend').data;
    expect(p.sleepHours).toBe(6.5); // von Hand eingetragen, bleibt
    expect(p.hrv).toBe(61);
    await call(env, 'POST', '/api/connect/oura/disconnect', { deleteData: true }, token);
    p = (await records(env, token)).find((r: any) => r.key === yday && r.kind === 'trend').data;
    expect(p.hrv).toBeNull(); expect(p.sleepHours).toBe(6.5);
  });
});

describe('Dropbox (HealthFit)', () => {
  test('neue .fit-Datei wird geladen, ausgewertet, der Einheit zugeordnet und abgehakt', async () => {
    const { env, token } = await setupUser();
    const fit = swimFit(`${today}T15:00:00Z`, [{ lengths: 16, secPerLength: 30, strokes: 19, restSec: 30 }, { lengths: 16, secPerLength: 29, strokes: 18, restSec: 0 }]);
    routes.push([/files\/get_metadata/, () => ({ '.tag': 'folder', path_display: '/Apps/HealthFit' })]);
    routes.push([/files\/list_folder$/, () => ({ entries: [{ '.tag': 'file', name: 'Schwimmen.fit', path_lower: '/apps/healthfit/schwimmen.fit', client_modified: new Date().toISOString() }, { '.tag': 'file', name: 'notiz.txt', path_lower: '/apps/healthfit/notiz.txt' }], cursor: 'C1', has_more: false })]);
    routes.push([/files\/list_folder\/continue/, () => ({ entries: [], cursor: 'C2', has_more: false })]);
    routes.push([/files\/download/, () => new Response(fit, { status: 200 })]);
    await connectViaOAuth(env, token, 'dropbox', { access_token: 'DT', refresh_token: 'DR', expires_in: 14400, account_id: 'dbid:AAA' });
    const recs = await records(env, token);
    const s = recs.find((r: any) => r.kind === 'session' && r.key === 'swim0').data;
    expect(s.completed).toBe(true); expect(s.source).toBe('healthfit');
    expect(s.metrics).toMatchObject({ meters: '800', spl: '18.5' });
    const act = recs.find((r: any) => r.kind === 'activity').data;
    expect(act.swim.longestContinuousM).toBe(400);
    // Verlauf ist abrufbar, aber nicht im Sync
    expect((await call(env, 'GET', `/api/activity/${act.id}/streams`, null, token)).status).toBe(404); // Schwimmen hat keine Messpunkte
    // Coach-Bewertung zur Einheit (Auftrag 12: msg-review-<Einheit>)
    expect(recs.some((r: any) => r.kind === 'coachMsg' && r.key === 'msg-review-' + (act.sessionId || act.id))).toBe(true);
    // Webhook: Signatur nötig, dann Abruf mit Cursor
    const idx = (await import('../src/index')).default;
    const body = JSON.stringify({ list_folder: { accounts: ['dbid:AAA'] } });
    const bad = await idx.fetch(new Request('https://app.test/api/hooks/dropbox', { method: 'POST', body, headers: { 'X-Dropbox-Signature': 'falsch' } }), env, { waitUntil() {} });
    expect(bad.status).toBe(403);
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode('dsec'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body)))].map(b => b.toString(16).padStart(2, '0')).join('');
    calls.length = 0;
    const ok = await idx.fetch(new Request('https://app.test/api/hooks/dropbox', { method: 'POST', body, headers: { 'X-Dropbox-Signature': sig } }), env, {});
    expect(ok.status).toBe(200);
    expect(calls.some(c => c.endsWith('/list_folder/continue'))).toBe(true);
    const ch = await idx.fetch(new Request('https://app.test/api/hooks/dropbox?challenge=xyz'), env, {});
    expect(await ch.text()).toBe('xyz');
  });
});

describe('Neue Verbindung ändert nichts Vergangenes', () => {
  test('Oura und Dropbox neu verbinden: Tage davor bleiben wie sie waren, heute nur Lücken füllen, neue Einheiten kommen an, Werte von Hand bleiben', async () => {
    const { env, token } = await setupUser();
    const old = add(today, -10);
    await call(env, 'POST', '/api/sync', { since: 0, changes: [
      { kind: 'trend', key: old, data: { date: old, hrv: 70, restingHR: 50, _src: { hrv: 'intervals', restingHR: 'intervals' }, _auto: { hrv: { intervals: 70 }, restingHR: { intervals: 50 } }, _manual: {} }, updatedAt: 2 },
      { kind: 'trend', key: today, data: { date: today, hrv: 65, _src: { hrv: 'intervals' }, _auto: { hrv: { intervals: 65 } }, _manual: {} }, updatedAt: 2 },
      { kind: 'session', key: 'run-1', data: { completed: true, metrics: { min: '50', hr: '150', pace: '5:40' }, metricsSrc: { min: 'intervals', hr: 'intervals', pace: 'manual' } }, updatedAt: 2 }
    ] }, token);
    const before = Object.fromEntries((await records(env, token)).map((r: any) => [r.kind + '|' + r.key, JSON.stringify(r.data)]));
    // Oura liefert die letzten 4 Wochen, Dropbox eine alte Datei von gestern
    routes.push([/usercollection\/sleep/, () => ({ data: [old, yday, today].map(day => ({ day, type: 'long_sleep', total_sleep_duration: 28800, average_hrv: 40, lowest_heart_rate: 60 })) })]);
    routes.push([/usercollection/, () => ({ data: [] })]);
    await connectViaOAuth(env, token, 'oura', { access_token: 'AT', expires_in: 86400 }, null);
    const yFit = intervalFit(`${yday}T16:00:00Z`, 'run', { warm: 300, reps: [{ sec: 120, speed: 4, hr: 170, restSec: 60, restHr: 130 }], cool: 300, easySpeed: 3, easyHr: 140 });
    routes.push([/files\/get_metadata/, () => ({ '.tag': 'folder', path_display: '/Apps/HealthFit' })]);
    routes.push([/files\/list_folder$/, () => ({ entries: [{ '.tag': 'file', name: 'Lauf.fit', path_lower: '/apps/healthfit/lauf.fit', client_modified: `${yday}T17:00:00Z` }], cursor: 'C1', has_more: false })]);
    routes.push([/files\/download/, () => new Response(yFit)]);
    await connectViaOAuth(env, token, 'dropbox', { access_token: 'DT', expires_in: 14400, account_id: 'dbid:B' }, null);
    let recs = await records(env, token);
    const after = Object.fromEntries(recs.map((r: any) => [r.kind + '|' + r.key, r.data]));
    for (const k of [`trend|${old}`, `trend|${yday}`, 'session|run-1', 'session|swim-1']) expect(JSON.stringify(after[k])).toBe(before[k]);
    expect(recs.some((r: any) => r.kind === 'activity')).toBe(false);
    expect(calls.some(c => c.endsWith('/files/download'))).toBe(false);
    // heute: vorhandener Wert bleibt, leere Werte werden gefüllt
    expect(after[`trend|${today}`]).toMatchObject({ hrv: 65, restingHR: 60, sleepHours: 8 });
    // nach dem Verbinden: neue Einheit kommt an
    const now = Date.now();
    env.DB.db.prepare("UPDATE connections SET stats = ?, cursor = NULL WHERE provider = 'dropbox'").run(JSON.stringify({ since: now - 2 * 3600000 }));
    const tFit = intervalFit(new Date(now - 3600000).toISOString(), 'run', { warm: 300, reps: [{ sec: 120, speed: 4, hr: 170, restSec: 60, restHr: 130 }], cool: 300, easySpeed: 3, easyHr: 140 });
    routes.unshift([/files\/list_folder$/, () => ({ entries: [{ '.tag': 'file', name: 'Neu.fit', path_lower: '/apps/healthfit/neu.fit', client_modified: new Date(now).toISOString() }], cursor: 'C2', has_more: false })]);
    routes.unshift([/files\/download/, () => new Response(tFit)]);
    expect((await call(env, 'POST', '/api/connect/dropbox/sync', {}, token)).status).toBe(200);
    recs = await records(env, token);
    expect(recs.filter((r: any) => r.kind === 'activity').length).toBe(1);
  });
  test('Einheit mit Werten von Hand: neue Aufzeichnung überschreibt sie nicht', async () => {
    const { applyToSession } = await import('../../shared/activity/merge');
    const st = applyToSession({ completed: true, metrics: { pace: '5:40', hr: '150' }, metricsSrc: { pace: 'manual', hr: 'intervals' } }, { id: 'a', source: 'healthfit', sources: ['healthfit'] } as any, { pace: '5:20', hr: '155' });
    expect(st.metrics).toMatchObject({ pace: '5:40', hr: '155' });
  });
});

describe('Kurzbefehl (Apple Health)', () => {
  test('Zahlen im Kurzbefehl-Format werden verstanden', () => {
    expect(looseNum('62,5')).toBe(62.5); expect(looseNum('51 bpm')).toBe(51); expect(looseNum('7:45')).toBe(7.75);
    expect(looseNum('60\n64')).toBe(62); expect(looseNum('')).toBeNull();
    const p = shortcutPayload({ date: '14.10.2026', hrv: '58 ms', restingHR: '50', sleepMinutes: '465', weight: '70,4', workouts: [{ type: 'Laufen', start: '2026-10-14T05:15:00Z', duration: '2460', distance: '6420', avgHr: '144' }] }, today);
    expect(p.trend['2026-10-14']).toMatchObject({ hrv: 58, restingHR: 50, sleepHours: 7.8 });
    expect(p.weights['2026-10-14']).toBe(70.4);
    expect(p.raw[0]).toMatchObject({ sport: 'run' }); expect(p.raw[0].totals.movingSec).toBe(2460); expect(p.raw[0].totals.distanceM).toBeCloseTo(6420, 0);
  });
  test('eigener, widerrufbarer Schlüssel; Werte und Training kommen an', async () => {
    const { env, token } = await setupUser();
    const k = (await call(env, 'POST', '/api/ingest/keys', { label: 'iPhone Kurzbefehl' }, token)).data;
    expect(k.key).toMatch(/^sk_/);
    const idx = (await import('../src/index')).default;
    const send = (key: string, body: any) => idx.fetch(new Request('https://app.test/api/ingest/shortcut', { method: 'POST', headers: { 'X-Ingest-Key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env, { waitUntil() {} });
    let r = await send(k.key, { hrv: '63', restingHR: 49, sleepHours: '8,1', workouts: [{ type: 'Running', start: `${today}T05:20:00Z`, durationMin: 41, distanceKm: 6.4, avgHr: 146 }] });
    expect(r.status).toBe(200);
    const res: any = await r.json();
    expect(res.text).toMatch(/1 Einheit/);
    const recs = await records(env, token);
    expect(recs.find((x: any) => x.kind === 'session' && x.key === 'run0').data.completed).toBe(true);
    expect(recs.find((x: any) => x.kind === 'trend' && x.key === today).data._src.hrv).toBe('shortcut');
    // derselbe Lauf von HealthFit 10 min später: zusammengeführt, kein zweiter Eintrag
    const fit = intervalFit(`${today}T05:30:00Z`, 'run', { warm: 600, reps: [0, 1, 2, 3, 4].map(() => ({ sec: 180, speed: 4.1, hr: 168, restSec: 120, restHr: 130 })), cool: 300, easySpeed: 2.9, easyHr: 140 });
    const up = await call(env, 'POST', '/api/import/file?name=lauf.fit&source=healthfit', undefined, token);
    void up;
    const res2 = await idx.fetch(new Request('https://app.test/api/import/file?name=lauf.fit&source=healthfit', { method: 'POST', headers: { 'X-Ingest-Key': k.key, 'Content-Type': 'application/octet-stream' }, body: fit }), env, { waitUntil() {} });
    expect(res2.status).toBe(200);
    const st2: any = await res2.json();
    expect(st2.merged).toBe(1);
    const acts = (await records(env, token)).filter((x: any) => x.kind === 'activity' && !x.deleted);
    expect(acts.filter((a: any) => !a.data.mergedInto)).toHaveLength(1);
    expect(acts.find((a: any) => !a.data.mergedInto).data.sources.sort()).toEqual(['healthfit', 'shortcut']);
    // Widerrufen: Schlüssel geht nicht mehr
    await call(env, 'DELETE', '/api/ingest/keys/' + k.id, null, token);
    r = await send(k.key, { hrv: 60 });
    expect(r.status).toBe(401);
  });
  test('Datei-Import aus der App (.fit und .gpx)', async () => {
    const { env, token } = await setupUser();
    const idx = (await import('../src/index')).default;
    const fd = new FormData();
    fd.append('file', new Blob([fs.readFileSync('fixtures/fit/garmin-fenix-5-run.fit')]), 'garmin.fit');
    const r = await idx.fetch(new Request('https://app.test/api/import/file', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd }), env, { waitUntil() {} });
    expect(r.status).toBe(200);
    const j: any = await r.json();
    expect(j.activities).toBe(1); expect(j.extras).toBe(1); // 2017, kein Plan an dem Tag → Extra-Einheit
    const bad = await idx.fetch(new Request('https://app.test/api/import/file?name=x.txt', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: 'hallo' }), env, { waitUntil() {} });
    expect(bad.status).toBe(400);
  });
});

describe('WHOOP, Withings, Polar', () => {
  test('WHOOP: Erholung, Schlaf und Training', async () => {
    const { env, token } = await setupUser();
    routes.push([/v2\/activity\/sleep/, () => ({ records: [{ id: 'S1', nap: false, end: `${today}T05:30:00Z`, score_state: 'SCORED', score: { stage_summary: { total_in_bed_time_milli: 30000000, total_awake_time_milli: 2000000, total_rem_sleep_time_milli: 6000000, total_slow_wave_sleep_time_milli: 5400000 }, respiratory_rate: 15.2, sleep_performance_percentage: 88 } }] })]);
    routes.push([/v2\/recovery/, () => ({ records: [{ sleep_id: 'S1', score_state: 'SCORED', score: { resting_heart_rate: 48, hrv_rmssd_milli: 72.4, spo2_percentage: 96.5 } }] })]);
    routes.push([/v2\/activity\/workout/, () => ({ records: [{ start: `${today}T16:00:00Z`, end: `${today}T16:45:00Z`, sport_name: 'Swimming', score_state: 'SCORED', score: { average_heart_rate: 130, max_heart_rate: 150, distance_meter: 1800 } }] })]);
    await connectViaOAuth(env, token, 'whoop', { access_token: 'W', refresh_token: 'WR', expires_in: 3600, user_id: 77 });
    const recs = await records(env, token);
    expect(recs.find((x: any) => x.kind === 'trend' && x.key === today).data).toMatchObject({ hrv: 72, restingHR: 48, sleepHours: 7.8, breathingRate: 15.2, spo2: 96.5 });
    expect(recs.find((x: any) => x.kind === 'session' && x.key === 'swim0').data.completed).toBe(true);
  });
  test('Withings: Gewicht und Schlaf', async () => {
    const { env, token } = await setupUser();
    const ts = Math.floor(Date.parse(`${today}T06:00:00Z`) / 1000);
    routes.push([/wbsapi.withings.net\/measure/, () => ({ status: 0, body: { measuregrps: [{ date: ts, measures: [{ type: 1, value: 70350, unit: -3 }] }] } })]);
    routes.push([/wbsapi.withings.net\/v2\/sleep/, () => ({ status: 0, body: { series: [{ date: today, data: { total_sleep_time: 27000, hr_min: 50, rr_average: 14 } }] } })]);
    await connectViaOAuth(env, token, 'withings', { status: 0, body: { access_token: 'X', refresh_token: 'XR', expires_in: 10800, userid: 5 } });
    const recs = await records(env, token);
    expect(recs.find((x: any) => x.kind === 'nutrition' && x.key === today).data.weight).toBe(70.4);
    expect(recs.find((x: any) => x.kind === 'trend' && x.key === today).data.sleepHours).toBe(7.5);
  });
  test('Polar: Registrierung, Training als FIT, Nacht-Erholung', async () => {
    const { env, token } = await setupUser();
    const fit = intervalFit(`${today}T05:00:00Z`, 'run', { warm: 300, reps: [0, 1].map(() => ({ sec: 120, speed: 4, hr: 165, restSec: 60, restHr: 130 })), cool: 300, easySpeed: 3, easyHr: 140 });
    routes.push([/v3\/users$/, () => ({ 'polar-user-id': 1 })]);
    routes.push([/v3\/exercises$/, () => [{ id: 'E1', start_time: `${today}T05:00:00`, duration: 'PT20M', sport: 'RUNNING' }]]);
    routes.push([/v3\/exercises\/E1\/fit/, () => new Response(fit)]);
    routes.push([/nightly-recharge/, () => ({ recharges: [{ date: today, heart_rate_avg: 51, heart_rate_variability_avg: 66 }] })]);
    routes.push([/v3\/users\/sleep/, () => ({ nights: [] })]);
    await connectViaOAuth(env, token, 'polar', { access_token: 'P', expires_in: 315360000, x_user_id: 9 });
    const recs = await records(env, token);
    expect(recs.find((x: any) => x.kind === 'session' && x.key === 'run0').data.source).toBe('polar');
    expect(recs.find((x: any) => x.kind === 'trend' && x.key === today).data.hrv).toBe(66);
  });
  test('Dienste mit Partner-Pflicht lassen sich nicht starten, fehlende App-Schlüssel klar gemeldet', async () => {
    const { env, token } = await setupUser({ OURA_CLIENT_ID: '' });
    expect((await call(env, 'POST', '/api/connect/fitbit/start', {}, token)).status).toBe(409);
    const r = await call(env, 'POST', '/api/connect/oura/start', {}, token);
    expect(r.status).toBe(503); expect(r.data.error).toMatch(/App-Schlüssel des Anbieters/);
    const list = (await call(env, 'GET', '/api/connections', null, token)).data.connections;
    expect(list.find((c: any) => c.id === 'garmin').availability).toBe('partner');
  });
});
