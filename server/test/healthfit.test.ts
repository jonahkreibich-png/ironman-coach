/* Auftrag 13: HealthFit über Dropbox Ende zu Ende mit einer echten FIT-Datei (Garmin-Lauf aus fixtures/fit),
   verständliche Fehler (Ordner fehlt, TOKEN_KEY fehlt, Datei kaputt) und Zuordnung zu selbst hinzugefügten Einheiten ohne Dubletten. */
import { test, expect, describe, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import { makeEnv, call } from './multiuser.test';

const DAY = '2015-08-15'; // Datum der Beispieldatei (Lauf 16:45 Uhr, 47 min, 9 km)
const FIT = new Uint8Array(fs.readFileSync('fixtures/fit/activity-small-fenix2-run.fit'));
const SECRETS = { PUBLIC_URL: 'https://app.test', DROPBOX_APP_KEY: 'dk', DROPBOX_APP_SECRET: 'dsec', INTERVALS_API_KEY: 'k'.repeat(20), INTERVALS_ATHLETE_ID: 'i1', INTERVALS_BASE: 'https://icu.test' };

type Handler = (url: URL, init: any) => any;
let routes: [RegExp, Handler][] = [];
const calls: string[] = [];
const realFetch = globalThis.fetch;
beforeEach(() => {
  routes = []; calls.length = 0;
  vi.stubGlobal('fetch', async (input: any, init: any = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    calls.push(url.host + url.pathname + (init.body && /get_metadata|list_folder$/.test(url.pathname) ? ' ' + init.body : ''));
    for (const [re, h] of routes) if (re.test(url.href)) { const r = await h(url, init); return r instanceof Response ? r : new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
    return new Response('not mocked: ' + url.href, { status: 599 });
  });
});
afterEach(() => { vi.unstubAllGlobals(); globalThis.fetch = realFetch; });
const jres = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

async function setup(extra: any = {}, customs: any[] = []) {
  const env = makeEnv({ ...SECRETS, ...extra });
  const { token } = (await call(env, 'POST', '/api/setup', { name: 'iPhone' })).data;
  // Plan an dem Tag ohne Lauf (nur Rad), dazu selbst hinzugefügte Einheiten
  const days = [{ date: DAY, sessions: [{ id: 'bike1', sport: 'bike', title: 'Rad locker', plannedMinutes: 60 }] }];
  await call(env, 'POST', '/api/sync', { since: 0, changes: [
    { kind: 'plan', key: 'main', data: { meta: {}, weeks: [{ weekNumber: 1, startDate: DAY, days }] }, updatedAt: 1 },
    ...customs.map(c => ({ kind: 'custom', key: c.id, data: c, updatedAt: 1 }))
  ] }, token);
  return { env, token };
}
/* Dropbox verbinden (schon länger verbunden, damit die Datei von 2015 nicht als „vor dem Verbinden“ gilt) */
async function connectDropbox(env: any, token: string) {
  env.DB.db.prepare("INSERT INTO connections (user_id, provider, status, stats, created_at) VALUES (1, 'dropbox', 'reauth', ?, ?)").run(JSON.stringify({ since: Date.parse('2015-08-01') }), Date.parse('2015-08-01'));
  routes.push([/api\.dropboxapi\.com\/oauth2\/token/, () => ({ access_token: 'DT', refresh_token: 'DR', expires_in: 14400, account_id: 'dbid:J' })]);
  const s = await call(env, 'POST', '/api/connect/dropbox/start', {}, token);
  expect(s.status).toBe(200);
  const state = new URL(s.data.url).searchParams.get('state');
  const res = await (await import('../src/index')).default.fetch(new Request(`https://app.test/api/connect/dropbox/callback?code=abc&state=${state}`), env, { waitUntil() {} });
  return res.headers.get('Location')!;
}
const healthFitFolder = (files: { name: string; data?: Uint8Array | null }[]) => {
  routes.push([/files\/get_metadata/, (_u, init) => JSON.parse(init.body).path === '/Apps/HealthFit' ? { '.tag': 'folder', path_display: '/Apps/HealthFit' } : jres({ error_summary: 'path/not_found/' }, 409)]);
  routes.push([/files\/list_folder$/, () => ({ entries: [{ '.tag': 'folder', name: '2015' }, ...files.map(f => ({ '.tag': 'file', name: f.name, path_lower: '/apps/healthfit/2015/' + f.name.toLowerCase(), client_modified: new Date().toISOString() }))], cursor: 'C1', has_more: false })]);
  routes.push([/files\/list_folder\/continue/, () => ({ entries: [], cursor: 'C2', has_more: false })]);
  routes.push([/files\/download/, (_u, init) => { const p = JSON.parse(init.headers['Dropbox-API-Arg']).path; const f = files.find(x => p.endsWith(x.name.toLowerCase())); return f && f.data ? new Response(f.data) : new Response('weg', { status: 409 }); }]);
};
const records = async (env: any, token: string) => (await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, token)).data.records as any[];
const conn = async (env: any, token: string, id = 'dropbox') => (await call(env, 'GET', '/api/connections', null, token)).data.connections.find((c: any) => c.id === id);

describe('HealthFit über Dropbox, echte FIT-Datei', () => {
  test('Datei → App → selbst hinzugefügte Einheit bekommt die Felder mit Quelle, keine Extra-Einheit, Status zeigt letzte Datei', async () => {
    const mine = { id: `custom-${DAY}-1`, date: DAY, sport: 'run', title: 'Abendlauf', description: '', plannedMinutes: 40, plannedKm: 8, metrics: { min: '40', km: '8' } };
    const { env, token } = await setup({}, [mine]);
    healthFitFolder([{ name: '2015-08-15-Laufen.fit', data: FIT }]);
    const loc = await connectDropbox(env, token);
    expect(loc).toContain('verbunden=dropbox');
    const recs = await records(env, token);
    const c = recs.find(r => r.kind === 'custom' && r.key === mine.id).data;
    expect(c.activityId).toBeTruthy();
    expect(c.metrics).toMatchObject({ min: '47', km: '9.01', hr: '154' });
    expect(c.metrics.pace).toMatch(/^5:\d\d$/);
    expect(c.metricsSrc).toMatchObject({ min: 'healthfit', km: 'healthfit', hr: 'healthfit' });
    expect(c.title).toBe('Abendlauf'); // eigener Titel bleibt
    expect(recs.filter(r => r.kind === 'custom').length).toBe(1); // keine zusätzliche Extra-Einheit
    expect(recs.find(r => r.kind === 'activity').data).toMatchObject({ source: 'healthfit', sport: 'run', date: DAY });
    const st = await conn(env, token);
    expect(st.status).toBe('connected');
    expect(st.stats.lastFile.name).toBe('2015-08-15-Laufen.fit');
    expect(st.stats.folder).toBe('/Apps/HealthFit');
    expect(st.lastSyncAt).toBeGreaterThan(0);
    // änderbar: von Hand korrigiert bleibt beim nächsten Abruf
    const edited = { ...c, metrics: { ...c.metrics, hr: '150' }, metricsSrc: { ...c.metricsSrc, hr: 'manual' }, metricsManual: { hr: true } };
    await call(env, 'POST', '/api/sync', { since: 0, changes: [{ kind: 'custom', key: c.id, data: edited, updatedAt: Date.now() }] }, token);
    env.DB.db.prepare("UPDATE connections SET cursor = NULL WHERE provider = 'dropbox'").run();
    expect((await call(env, 'POST', '/api/connect/dropbox/sync', {}, token)).status).toBe(200);
    const again = (await records(env, token)).filter(r => r.kind === 'custom');
    expect(again.length).toBe(1);
    expect(again[0].data.metrics.hr).toBe('150');
  });

  test('ohne passende Einheit: Extra-Einheit; dieselbe Einheit aus intervals.icu und als Datei ergibt keine Dublette', async () => {
    const { env, token } = await setup();
    healthFitFolder([{ name: 'Lauf.fit', data: FIT }]);
    await connectDropbox(env, token);
    let recs = await records(env, token);
    const extra = recs.filter(r => r.kind === 'custom');
    expect(extra.length).toBe(1);
    expect(extra[0].data).toMatchObject({ auto: true, sport: 'run', date: DAY, source: 'healthfit' });
    // dieselbe Datei noch einmal von Hand hochladen
    const up = await (await import('../src/index')).default.fetch(new Request('http://x/api/import/file?name=Lauf.fit', { method: 'POST', body: FIT, headers: { Authorization: 'Bearer ' + token } }), env, { waitUntil() {} });
    expect(up.status).toBe(200);
    // intervals.icu meldet denselben Lauf (Start 16:45 Uhr deutscher Zeit, 47 min)
    routes.push([/icu\.test\/api\/v1\/athlete\/i1\/wellness/, () => []]);
    routes.push([/icu\.test\/api\/v1\/athlete\/i1\/activities/, () => [{ id: 'A77', type: 'Run', start_date_local: `${DAY}T16:45:08`, start_date: `${DAY}T14:45:08Z`, moving_time: 2820, distance: 9010, average_heartrate: 154, icu_training_load: 61 }]]);
    expect((await call(env, 'POST', '/api/intervals/import', {}, token)).status).toBe(200);
    recs = await records(env, token);
    const customs = recs.filter(r => r.kind === 'custom');
    expect(customs.length).toBe(1);
    expect(customs[0].data.icuId).toBe('A77');
    expect(customs[0].data.metricsSrc.hr).toBe('healthfit'); // HealthFit hat Vorrang, intervals.icu füllt nur Lücken
    expect(recs.filter(r => r.kind === 'activity' && !r.data.mergedInto).length).toBe(1);
  });

  test('intervals.icu zuerst, HealthFit danach: die Datei füllt dieselbe Extra-Einheit', async () => {
    const { env, token } = await setup();
    routes.push([/icu\.test\/api\/v1\/athlete\/i1\/wellness/, () => []]);
    routes.push([/icu\.test\/api\/v1\/athlete\/i1\/activities/, () => [{ id: 'A78', type: 'Run', start_date_local: `${DAY}T16:45:08`, start_date: `${DAY}T14:45:08Z`, moving_time: 2820, distance: 9010, average_heartrate: 153 }]]);
    await call(env, 'POST', '/api/intervals/import', {}, token);
    expect((await records(env, token)).filter(r => r.kind === 'custom').map(r => r.key)).toEqual(['icu-A78']);
    healthFitFolder([{ name: 'Lauf.fit', data: FIT }]);
    await connectDropbox(env, token);
    const customs = (await records(env, token)).filter(r => r.kind === 'custom');
    expect(customs.length).toBe(1);
    expect(customs[0].data).toMatchObject({ id: 'icu-A78', source: 'healthfit' });
    expect(customs[0].data.metrics.hr).toBe('154');
  });
});

describe('Verständliche Fehler', () => {
  test('Dropbox-App mit „App folder“: HealthFit-Ordner unsichtbar → Status „Fehler“ mit Grund, Verbindung bleibt', async () => {
    const { env, token } = await setup();
    routes.push([/files\/get_metadata/, () => jres({ error_summary: 'path/not_found/..' }, 409)]);
    routes.push([/files\/list_folder$/, (_u, init) => JSON.parse(init.body).path === '' ? { entries: [], cursor: 'X', has_more: false } : jres({ error_summary: 'path/not_found/' }, 409)]);
    const loc = await connectDropbox(env, token);
    expect(loc).toContain('verbunden=dropbox'); // Anmeldung selbst klappt
    const st = await conn(env, token);
    expect(st.status).toBe('error');
    expect(st.error).toMatch(/nur ihren eigenen, leeren Ordner/);
    expect(st.error).toMatch(/Full Dropbox/);
    expect(st.stats.errorCode).toBe('appfolder') // Auftrag 14: eigener Code für den Betreiber-Hinweis;
    expect(st.stats.diag).toEqual({ root: 0, apps: false });
    expect(calls.filter(c => c.includes('get_metadata')).length).toBeGreaterThanOrEqual(3); // übliche Orte durchsucht
    // Jetzt abrufen: gleicher, klarer Grund
    const r = await call(env, 'POST', '/api/connect/dropbox/sync', {}, token);
    expect(r.status).toBe(404);
    expect(r.data.error).toMatch(/App folder/);
  });

  test('volle Dropbox, aber HealthFit hat noch nichts exportiert → Hinweis auf den Export in HealthFit', async () => {
    const { env, token } = await setup();
    routes.push([/files\/get_metadata/, () => jres({ error_summary: 'path/not_found/..' }, 409)]);
    routes.push([/files\/list_folder$/, (_u, init) => JSON.parse(init.body).path === '' ? { entries: [{ '.tag': 'folder', name: 'Apps' }, { '.tag': 'folder', name: 'Fotos' }], cursor: 'X', has_more: false } : { entries: [{ '.tag': 'folder', name: 'Strava' }], cursor: 'Y', has_more: false }]);
    await connectDropbox(env, token);
    const st = await conn(env, token);
    expect(st.error).toMatch(/HealthFit-Ordner ist in deiner Dropbox nicht zu finden/);
    expect(st.stats.diag).toEqual({ root: 2, apps: true });
  });

  test('Ordner liegt woanders (z. B. /HealthFit): wird gefunden', async () => {
    const { env, token } = await setup();
    routes.push([/files\/get_metadata/, (_u, init) => JSON.parse(init.body).path === '/HealthFit' ? { '.tag': 'folder', path_display: '/HealthFit' } : jres({ error_summary: 'path/not_found/' }, 409)]);
    routes.push([/files\/list_folder$/, () => ({ entries: [], cursor: 'C', has_more: false })]);
    await connectDropbox(env, token);
    const st = await conn(env, token);
    expect(st.status).toBe('connected');
    expect(st.stats.folder).toBe('/HealthFit');
  });

  test('fehlende Berechtigung (missing_scope) ist kein „neu anmelden“, sondern sagt, was anzuhaken ist', async () => {
    const { env, token } = await setup();
    routes.push([/files\//, () => jres({ error: { '.tag': 'missing_scope', required_scope: 'files.metadata.read' } }, 401)]);
    await connectDropbox(env, token);
    const st = await conn(env, token);
    expect(st.status).toBe('error');
    expect(st.error).toMatch(/files\.content\.read/);
    expect(st.stats.errorCode).toBe('scope');
  });

  test('kaputte Datei: Grund im Status, die anderen Dateien kommen trotzdem an; fehlgeschlagener Download wird wiederholt', async () => {
    const { env, token } = await setup();
    healthFitFolder([{ name: 'kaputt.fit', data: new Uint8Array([1, 2, 3, 4]) }, { name: 'weg.fit', data: null }, { name: 'gut.fit', data: FIT }]);
    await connectDropbox(env, token);
    for (let i = 0; i < 8 && ((await conn(env, token)).stats.queue || []).length; i++) await call(env, 'POST', '/api/connect/dropbox/sync', {}, token);
    const st = await conn(env, token);
    expect(st.status).toBe('connected');
    expect(st.stats.queue).toEqual([]);
    expect([...new Set(st.stats.errors.map((e: any) => e.name))]).toEqual(['kaputt.fit', 'weg.fit']);
    expect(st.stats.errors[0].why).toMatch(/nicht lesbar/);
    expect(calls.filter(c => c.endsWith('/files/download')).length).toBe(5); // kaputt 1×, gut 1×, weg 3 Versuche
    expect((await records(env, token)).filter(r => r.kind === 'activity').length).toBe(1);
  });

  test('CPU-Grenze: eine Datei pro Aufruf, die übrigen warten; der Zeitplan holt alle 5 min die nächste', async () => {
    const { env, token } = await setup();
    healthFitFolder([{ name: 'a.fit', data: FIT }, { name: 'b.fit', data: FIT }, { name: 'c.fit', data: FIT }]);
    await connectDropbox(env, token);
    let st = await conn(env, token);
    expect(st.stats.queue.map((q: any) => q.name)).toEqual(['b.fit', 'c.fit']);
    expect(st.stats.lastFile.name).toBe('a.fit');
    const r = await call(env, 'POST', '/api/connect/dropbox/sync', {}, token);
    expect(r.data.stats.queued).toBe(1);
    // Zeitplan: nach 5 min ist die nächste Datei dran (ohne Warteschlange erst nach 15 min)
    env.DB.db.prepare("UPDATE connections SET last_sync_at = ? WHERE provider = 'dropbox'").run(Date.now() - 5 * 60000);
    const { scheduledSync } = await import('../src/connect');
    await scheduledSync(env, [1]);
    st = await conn(env, token);
    expect(st.stats.queue).toEqual([]);
    // dieselbe Datei dreimal: nur eine Einheit (Dubletten erkannt)
    expect((await records(env, token)).filter(r => r.kind === 'custom').length).toBe(1);
  });

  test('TOKEN_KEY fehlt auf dem Server: Verbinden sagt es sofort, bestehende Verbindung zeigt den Grund, Betreiber sieht das Secret', async () => {
    const { env, token } = await setup();
    healthFitFolder([]);
    await connectDropbox(env, token);
    delete env.TOKEN_KEY;
    const r = await call(env, 'POST', '/api/connect/dropbox/sync', {}, token);
    expect(r.status).toBe(503);
    const st = await conn(env, token);
    expect(st.status).toBe('error');
    expect(st.error).toMatch(/TOKEN_KEY/);
    expect(st.stats.errorCode).toBe('token_key');
    const s = await call(env, 'POST', '/api/connect/dropbox/start', {}, token);
    expect(s.status).toBe(503); expect(s.data.error).toMatch(/TOKEN_KEY/);
    const server = await conn(env, token, 'server');
    expect(server.secrets.find((x: any) => x.name === 'TOKEN_KEY').set).toBe(false);
  });
});

describe('Auftrag 14: Dropbox-Abruf', () => {
  test('neu aufgelisteter Ordner: schon übernommene Datei wird nicht noch einmal ausgewertet; alter Fehlercode verschwindet', async () => {
    const { env, token } = await setup();
    healthFitFolder([{ name: '2015-08-15-Laufen.fit', data: FIT }]);
    await connectDropbox(env, token);
    env.DB.db.prepare("UPDATE connections SET stats = json_set(stats, '$.errorCode', 'folder') WHERE provider = 'dropbox'").run();
    const downloads = () => calls.filter(c => c.includes('files/download')).length;
    const before = downloads();
    // Cursor ungültig → Ordner wird komplett neu aufgelistet
    env.DB.db.prepare("UPDATE connections SET cursor = NULL WHERE provider = 'dropbox'").run();
    expect((await call(env, 'POST', '/api/connect/dropbox/sync', {}, token)).status).toBe(200);
    expect(downloads()).toBe(before);
    const st = await conn(env, token);
    expect(st.stats.errorCode).toBeUndefined();
    expect(Object.keys(st.stats.done)).toEqual(['/apps/healthfit/2015/2015-08-15-laufen.fit']);
  });
  test('kommt lange nichts: Suche nach FIT-Dateien findet neuere HealthFit-Dateien in einem anderen Ordner und wechselt dorthin', async () => {
    const { env, token } = await setup();
    healthFitFolder([]);
    await connectDropbox(env, token);
    routes.unshift([/files\/search_v2/, () => ({ matches: [
      { metadata: { metadata: { '.tag': 'file', name: 'alt.fit', path_display: '/Apps/HealthFit/alt.fit', server_modified: '2015-08-01T10:00:00Z' } } },
      { metadata: { metadata: { '.tag': 'file', name: '2015-08-15-Laufen.fit', path_display: '/Apps/HealthFit Exporter/2015/2015-08-15-Laufen.fit', client_modified: '2015-08-15T17:00:00Z' } } },
      { metadata: { metadata: { '.tag': 'file', name: 'x.fit', path_display: '/Garmin/x.fit', client_modified: '2015-08-10T17:00:00Z' } } }
    ] })]);
    routes.unshift([/files\/list_folder$/, (_u, init) => JSON.parse(init.body).path === '/Apps/HealthFit Exporter'
      ? { entries: [{ '.tag': 'file', name: '2015-08-15-Laufen.fit', path_lower: '/apps/healthfit exporter/2015/2015-08-15-laufen.fit', client_modified: new Date().toISOString() }], cursor: 'E1', has_more: false }
      : { entries: [], cursor: 'C1', has_more: false }]);
    routes.unshift([/files\/get_metadata/, (_u, init) => { const p = JSON.parse(init.body).path; return p === '/Apps/HealthFit' || p === '/Apps/HealthFit Exporter' ? { '.tag': 'folder', path_display: p } : jres({ error_summary: 'path/not_found/' }, 409); }]);
    routes.unshift([/files\/download/, () => new Response(FIT)]);
    expect((await call(env, 'POST', '/api/connect/dropbox/sync', {}, token)).status).toBe(200);
    const st = await conn(env, token);
    expect(st.stats.folder).toBe('/Apps/HealthFit Exporter');
    expect(st.stats.fit.map((g: any) => g.folder)).toEqual(['/Apps/HealthFit Exporter', '/Garmin', '/Apps/HealthFit']);
    expect(st.stats.lastFile.name).toBe('2015-08-15-Laufen.fit');
    expect((await records(env, token)).some(r => r.kind === 'activity' && r.data.source === 'healthfit')).toBe(true);
  });
});
