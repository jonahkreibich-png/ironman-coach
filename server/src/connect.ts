/* Verbindungen zu Diensten. Jeder Nutzer verbindet seine Dienste selbst („Verbinden“ → Erlaubnis-Bildschirm des Dienstes).
   Tokens liegen nur verschlüsselt in der Datenbank (Schlüssel TOKEN_KEY), App-Schlüssel der Dienste nur als Cloudflare-Secrets.
   Fertig: Dropbox (HealthFit-Dateien), Oura, WHOOP, Polar, Withings, intervals.icu (API-Schlüssel), Kurzbefehl, Datei-Import.
   Vorbereitet bzw. Freischaltung nötig: Fitbit/Google Health, Suunto, COROS, Wahoo, Garmin, TrainingPeaks. */
import { type Env, berlinDate, addDaysStr, putRecords, getRecords } from './store';
import { HttpError, encryptJson, decryptJson, randomToken, sha256, readJson, b64url } from './http';
import type { Auth } from './auth';
import { ingest, type IngestStats, type Protect } from './ingest';
import { parseFit } from '../../shared/activity/fit';
import { parseActivityFile } from '../../shared/activity/xml';
import { upgradeLegacyPoint, bestAuto } from '../../shared/activity/merge';
import type { RawActivity } from '../../shared/activity/types';
import { logError } from './errlog';

export type ProviderId = 'dropbox' | 'oura' | 'whoop' | 'polar' | 'withings' | 'intervals' | 'shortcut' | 'fitbit' | 'suunto' | 'coros' | 'wahoo' | 'garmin' | 'trainingpeaks';
interface OAuthDef {
  label: string; authUrl: string; tokenUrl: string; scope: string; scopeSep?: string;
  idEnv: string; secretEnv: string; tokenAuth: 'body' | 'basic'; extraAuth?: Record<string, string>;
  status: 'ready' | 'prepared';
}
export const OAUTH: Partial<Record<ProviderId, OAuthDef>> = {
  dropbox: { label: 'Dropbox (HealthFit)', authUrl: 'https://www.dropbox.com/oauth2/authorize', tokenUrl: 'https://api.dropboxapi.com/oauth2/token', scope: 'files.metadata.read files.content.read account_info.read', idEnv: 'DROPBOX_APP_KEY', secretEnv: 'DROPBOX_APP_SECRET', tokenAuth: 'body', extraAuth: { token_access_type: 'offline' }, status: 'ready' },
  oura: { label: 'Oura', authUrl: 'https://cloud.ouraring.com/oauth/authorize', tokenUrl: 'https://api.ouraring.com/oauth/token', scope: 'personal daily heartrate session spo2 workout', idEnv: 'OURA_CLIENT_ID', secretEnv: 'OURA_CLIENT_SECRET', tokenAuth: 'body', status: 'ready' },
  whoop: { label: 'WHOOP', authUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth', tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token', scope: 'read:recovery read:sleep read:workout read:cycles offline', idEnv: 'WHOOP_CLIENT_ID', secretEnv: 'WHOOP_CLIENT_SECRET', tokenAuth: 'body', status: 'ready' },
  polar: { label: 'Polar', authUrl: 'https://flow.polar.com/oauth2/authorization', tokenUrl: 'https://polarremote.com/v2/oauth2/token', scope: 'accesslink.read_all', idEnv: 'POLAR_CLIENT_ID', secretEnv: 'POLAR_CLIENT_SECRET', tokenAuth: 'basic', status: 'ready' },
  withings: { label: 'Withings', authUrl: 'https://account.withings.com/oauth2_user/authorize2', tokenUrl: 'https://wbsapi.withings.net/v2/oauth2', scope: 'user.metrics,user.activity', scopeSep: ',', idEnv: 'WITHINGS_CLIENT_ID', secretEnv: 'WITHINGS_CLIENT_SECRET', tokenAuth: 'body', status: 'ready' },
  fitbit: { label: 'Fitbit (Google Health)', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/googlehealth.sleep.readonly', idEnv: 'GOOGLE_HEALTH_CLIENT_ID', secretEnv: 'GOOGLE_HEALTH_CLIENT_SECRET', tokenAuth: 'body', status: 'prepared' }
};
/* Basis-Adressen (in Tests auf einen Mock umleitbar) */
const base = (env: Env, id: string, def: string) => (env[`${id.toUpperCase()}_API_BASE`] as string) || def;
const redirectUri = (env: Env, p: string) => `${String(env.PUBLIC_URL || '').replace(/\/$/, '')}/api/connect/${p}/callback`;

/* ---------- Speicher ---------- */
export interface Conn { user_id: number; provider: string; status: string; token_enc: string | null; expires_at: number | null; account: string | null; cursor: string | null; last_sync_at: number | null; last_ok_at: number | null; last_error: string | null; stats: string | null; scope: string | null; created_at: number }
export async function getConn(env: Env, uid: number, p: string): Promise<Conn | null> {
  return await env.DB.prepare('SELECT * FROM connections WHERE user_id = ? AND provider = ?').bind(uid, p).first();
}
async function saveConn(env: Env, uid: number, p: string, fields: Partial<Conn> & { token?: any }) {
  const cur = await getConn(env, uid, p);
  const token_enc = fields.token !== undefined ? (fields.token ? await encryptJson(env, fields.token) : null) : (cur ? cur.token_enc : null);
  const row = { status: 'connected', expires_at: null, account: null, cursor: null, last_sync_at: null, last_ok_at: null, last_error: null, stats: null, scope: null, ...(cur || {}), ...fields, token_enc };
  await env.DB.prepare(`INSERT INTO connections (user_id, provider, status, token_enc, expires_at, scope, account, cursor, last_sync_at, last_ok_at, last_error, stats, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, provider) DO UPDATE SET status = excluded.status, token_enc = excluded.token_enc, expires_at = excluded.expires_at,
    scope = excluded.scope, account = excluded.account, cursor = excluded.cursor, last_sync_at = excluded.last_sync_at, last_ok_at = excluded.last_ok_at, last_error = excluded.last_error, stats = excluded.stats`)
    .bind(uid, p, row.status, row.token_enc, row.expires_at, row.scope, row.account, row.cursor, row.last_sync_at, row.last_ok_at, row.last_error, row.stats, (cur && cur.created_at) || Date.now()).run();
}

/* Zeitpunkt des Verbindens: was davor war, ändert diese Quelle nicht (siehe ingest) */
async function protectOf(env: Env, uid: number, p: string): Promise<Protect | null> {
  const c = await getConn(env, uid, p);
  if (!c) return null;
  const st = c.stats ? JSON.parse(c.stats) : {};
  const at = st.since || c.created_at;
  return at ? { at, day: berlinDate(at) } : null;
}

/* ---------- OAuth ---------- */
export async function startOAuth(env: Env, a: Auth, p: ProviderId, returnTo?: string): Promise<{ url: string }> {
  const def = OAUTH[p];
  if (!def) throw new HttpError(404, 'Unbekannter Dienst.');
  if (def.status !== 'ready') throw new HttpError(409, `${def.label} braucht noch eine Freischaltung durch den Anbieter.`);
  const clientId = env[def.idEnv];
  if (!clientId || !env[def.secretEnv]) throw new HttpError(503, `${def.label} ist auf dem Server noch nicht eingerichtet: Der Betreiber muss einmal den App-Schlüssel des Anbieters hinterlegen. Bis dahin klappt es über Apple Health (Kurzbefehl) oder intervals.icu.`);
  // Ohne TOKEN_KEY kann der Server die Anmeldung nicht speichern: gleich sagen statt nach dem Erlaubnis-Bildschirm scheitern
  if (!env.TOKEN_KEY || String(env.TOKEN_KEY).trim().length < 16) throw new HttpError(503, friendlyError(new Error('TOKEN_KEY fehlt')).text);
  const state = randomToken(24);
  const verifier = randomToken(32);
  await env.DB.prepare('INSERT INTO oauth_states (state, user_id, provider, verifier, return_to, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(state, a.uid, p, verifier, (returnTo || '').slice(0, 200), Date.now()).run();
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri(env, p), state, scope: def.scope, ...(def.extraAuth || {}) });
  if (p === 'dropbox') { q.set('code_challenge', await pkce(verifier)); q.set('code_challenge_method', 'S256'); }
  return { url: `${def.authUrl}?${q.toString()}` };
}
async function pkce(v: string) { return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))); }

async function tokenRequest(env: Env, p: ProviderId, params: Record<string, string>): Promise<any> {
  const def = OAUTH[p]!;
  const id = env[def.idEnv], secret = env[def.secretEnv];
  const body = new URLSearchParams(params);
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  if (p === 'withings') { body.set('action', 'requesttoken'); body.set('client_id', id); body.set('client_secret', secret); }
  else if (def.tokenAuth === 'basic') headers.Authorization = 'Basic ' + btoa(`${id}:${secret}`);
  else { body.set('client_id', id); body.set('client_secret', secret); }
  const res = await fetch(base(env, p + '_token', def.tokenUrl), { method: 'POST', headers, body: body.toString() });
  const data: any = await res.json().catch(() => null);
  if (!res.ok || !data) throw new HttpError(502, `${def.label} hat die Anmeldung abgelehnt (${res.status}).`);
  const tok = p === 'withings' ? data.body : data;
  if (!tok || !tok.access_token) throw new HttpError(502, `${def.label} hat kein Zugangs-Token geliefert.`);
  return tok;
}

/* Rückkehr vom Erlaubnis-Bildschirm des Dienstes */
export async function oauthCallback(env: Env, p: ProviderId, url: URL): Promise<Response> {
  const app = String(env.PUBLIC_URL || '').replace(/\/$/, '') + '/';
  // Zurück an die Stelle, von der aus verbunden wurde (Verbindungen oder Fragebogen)
  let rt = 'verbindungen';
  const back = (q: string) => Response.redirect(`${app}?go=mehr&open=${rt}&${q}`, 302);
  const state = url.searchParams.get('state') || '';
  const row = await env.DB.prepare('SELECT * FROM oauth_states WHERE state = ? AND provider = ?').bind(state, p).first();
  if (row && row.return_to === 'onboarding') rt = 'onboarding';
  if (!row || Date.now() - row.created_at > 15 * 60000) return back('fehler=' + encodeURIComponent('Anmeldung abgelaufen, bitte nochmal verbinden.'));
  await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
  if (url.searchParams.get('error')) return back('fehler=' + encodeURIComponent('Verbindung abgebrochen.'));
  const code = url.searchParams.get('code') || '';
  try {
    const params: Record<string, string> = { grant_type: 'authorization_code', code, redirect_uri: redirectUri(env, p) };
    if (p === 'dropbox') params.code_verifier = row.verifier;
    const tok = await tokenRequest(env, p, params);
    let account = tok.account_id || tok.x_user_id || tok.userid || tok.user_id || null;
    if (p === 'polar') await polarRegister(env, tok, row.user_id);
    const prev = await getConn(env, row.user_id, p);
    const prevStats = prev && prev.stats ? JSON.parse(prev.stats) : {};
    const since = prev && prev.status !== 'disconnected' && prevStats.since ? prevStats.since : Date.now();
    await saveConn(env, row.user_id, p, { stats: JSON.stringify({ ...prevStats, since }), status: 'connected', token: tok, expires_at: tok.expires_in ? Date.now() + tok.expires_in * 1000 : null, account: account != null ? String(account) : null, last_error: null, scope: tok.scope || null });
    try { await syncProvider(env, row.user_id, p, { initial: true }); } catch (e) { /* erster Abruf darf scheitern, Status zeigt es */ }
    return back('verbunden=' + p);
  } catch (e) { return back('fehler=' + encodeURIComponent((e as Error).message)); }
}

/* Gültiges Token holen, abgelaufene erneuern. Bei Ablehnung: Status „neu verbinden“. */
async function accessToken(env: Env, uid: number, p: ProviderId): Promise<string> {
  const c = await getConn(env, uid, p);
  if (!c || c.status === 'disconnected') throw new HttpError(409, 'Nicht verbunden.');
  const tok = await decryptJson(env, c.token_enc);
  if (!tok) throw new HttpError(409, 'Nicht verbunden.');
  if (p === 'intervals') return tok;
  if (c.expires_at && c.expires_at < Date.now() + 60000 && tok.refresh_token) {
    try {
      const n = await tokenRequest(env, p, { grant_type: 'refresh_token', refresh_token: tok.refresh_token });
      const merged = { ...tok, ...n, refresh_token: n.refresh_token || tok.refresh_token };
      await saveConn(env, uid, p, { token: merged, expires_at: n.expires_in ? Date.now() + n.expires_in * 1000 : null, status: 'connected' });
      return merged.access_token;
    } catch (e) { await saveConn(env, uid, p, { status: 'reauth', last_error: 'Anmeldung abgelaufen. Bitte neu verbinden.' }); throw new HttpError(401, 'Anmeldung abgelaufen. Bitte neu verbinden.'); }
  }
  return tok.access_token;
}
async function api(env: Env, uid: number, p: ProviderId, url: string, init: RequestInit = {}): Promise<Response> {
  const t = await accessToken(env, uid, p);
  const res = await fetch(url, { ...init, headers: { Accept: 'application/json', ...(init.headers || {}), Authorization: 'Bearer ' + t } });
  if (res.status === 401) { await saveConn(env, uid, p, { status: 'reauth', last_error: 'Zugriff abgelehnt. Bitte neu verbinden.' }); throw new HttpError(401, 'Zugriff abgelehnt. Bitte neu verbinden.'); }
  return res;
}
/* Netzfehler einzelner Abfragen ignorieren, aber eine abgelehnte Anmeldung immer melden */
const rethrowAuth = <T>(fallback: T) => (e: any): T => { if (e instanceof HttpError) throw e; return fallback; };
const jsonOf = async (r: Response) => { if (!r.ok) throw new Error(`Fehler ${r.status}`); return r.json() as any; };

/* ---------- Abruf je Dienst ---------- */
const r1 = (x: number) => Math.round(x * 10) / 10;
const dayOf = (iso: string) => berlinDate(Date.parse(iso));

async function syncOura(env: Env, uid: number, days: number): Promise<IngestStats> {
  const B = base(env, 'oura', 'https://api.ouraring.com');
  const end = berlinDate(), start = addDaysStr(end, -days);
  const q = `start_date=${start}&end_date=${addDaysStr(end, 1)}`;
  const [sleep, readiness, spo2, daily] = await Promise.all(['sleep', 'daily_readiness', 'daily_spo2', 'daily_sleep'].map(c => api(env, uid, 'oura', `${B}/v2/usercollection/${c}?${q}`).then(jsonOf).then(j => j.data || []).catch(rethrowAuth([]))));
  const trend: Record<string, any> = {};
  const T = (d: string) => (trend[d] = trend[d] || {});
  // Hauptschlaf pro Tag (längste Periode)
  const best: Record<string, any> = {};
  for (const s of sleep) { if (!s.day) continue; if (s.type && s.type !== 'long_sleep' && s.type !== 'sleep') continue; if (!best[s.day] || (s.total_sleep_duration || 0) > (best[s.day].total_sleep_duration || 0)) best[s.day] = s; }
  for (const [d, s] of Object.entries(best) as [string, any][]) {
    const t = T(d);
    if (s.total_sleep_duration) t.sleepHours = r1(s.total_sleep_duration / 3600);
    if (s.rem_sleep_duration != null) t.remSleep = Math.round(s.rem_sleep_duration / 60);
    if (s.deep_sleep_duration != null) t.deepSleep = Math.round(s.deep_sleep_duration / 60);
    if (s.latency != null) t.sleepLatency = Math.round(s.latency / 60);
    if (s.average_hrv) t.hrv = Math.round(s.average_hrv);
    if (s.lowest_heart_rate) t.restingHR = s.lowest_heart_rate;
    if (s.average_breath) t.breathingRate = r1(s.average_breath);
  }
  for (const r of readiness) if (r.day && r.temperature_deviation != null) T(r.day).bodyTemp = Math.round(r.temperature_deviation * 100) / 100;
  for (const r of spo2) if (r.day && r.spo2_percentage && r.spo2_percentage.average) T(r.day).spo2 = r1(r.spo2_percentage.average);
  for (const r of daily) if (r.day && r.score) T(r.day).sleepQuality = Math.round(r.score / 10);
  return ingest(env, uid, { source: 'oura', trend }, { protect: await protectOf(env, uid, 'oura') });
}

const WHOOP_SPORT: Record<string, string> = { running: 'run', cycling: 'bike', swimming: 'swim', 'weightlifting': 'strength', 'functional fitness': 'strength', soccer: 'football', walking: 'walk', 'spin': 'bike' };
async function syncWhoop(env: Env, uid: number, days: number): Promise<IngestStats> {
  const B = base(env, 'whoop', 'https://api.prod.whoop.com/developer');
  const start = new Date(Date.now() - days * 86400000).toISOString();
  const get = (path: string) => api(env, uid, 'whoop', `${B}${path}?start=${encodeURIComponent(start)}&limit=25`).then(jsonOf).then(j => j.records || []).catch(rethrowAuth([]));
  const [rec, sleep, work] = await Promise.all([get('/v2/recovery'), get('/v2/activity/sleep'), get('/v2/activity/workout')]);
  const trend: Record<string, any> = {};
  const sleepDay: Record<string, string> = {};
  for (const s of sleep) {
    if (s.nap || !s.end || s.score_state !== 'SCORED' || !s.score) continue;
    const d = dayOf(s.end); sleepDay[s.id] = d;
    const st = s.score.stage_summary || {};
    const t = trend[d] = trend[d] || {};
    const asleep = (st.total_in_bed_time_milli || 0) - (st.total_awake_time_milli || 0);
    if (asleep > 0) t.sleepHours = r1(asleep / 3600000);
    if (st.total_rem_sleep_time_milli != null) t.remSleep = Math.round(st.total_rem_sleep_time_milli / 60000);
    if (st.total_slow_wave_sleep_time_milli != null) t.deepSleep = Math.round(st.total_slow_wave_sleep_time_milli / 60000);
    if (s.score.respiratory_rate) t.breathingRate = r1(s.score.respiratory_rate);
    if (s.score.sleep_performance_percentage) t.sleepQuality = Math.round(s.score.sleep_performance_percentage / 10);
  }
  for (const r of rec) {
    if (r.score_state !== 'SCORED' || !r.score) continue;
    const d = sleepDay[r.sleep_id] || dayOf(r.created_at || r.updated_at);
    const t = trend[d] = trend[d] || {};
    if (r.score.resting_heart_rate) t.restingHR = Math.round(r.score.resting_heart_rate);
    if (r.score.hrv_rmssd_milli) t.hrv = Math.round(r.score.hrv_rmssd_milli);
    if (r.score.spo2_percentage) t.spo2 = r1(r.score.spo2_percentage);
  }
  const raw: RawActivity[] = work.filter((w: any) => w.score_state === 'SCORED' && w.start && w.end).map((w: any) => simpleRaw(WHOOP_SPORT[String(w.sport_name || '').toLowerCase()] || 'other', Date.parse(w.start), (Date.parse(w.end) - Date.parse(w.start)) / 1000, w.score.distance_meter, w.score.average_heart_rate, w.score.max_heart_rate, w.score.altitude_gain_meter, w.score.kilojoule ? Math.round(w.score.kilojoule / 4.184) : null, 'api'));
  return ingest(env, uid, { source: 'whoop', trend, raw }, { protect: await protectOf(env, uid, 'whoop') });
}

/* Aufzeichnung ohne Verlauf (nur Summen) */
export function simpleRaw(sport: string, startMs: number, sec: number, distM: number | null, avgHr: number | null, maxHr: number | null, ascent: number | null, kcal: number | null, format: RawActivity['format'] = 'api', name?: string): RawActivity {
  return { format, sport: sport as any, name, startMs, indoor: false, totals: { elapsedSec: sec, movingSec: sec, distanceM: distM ?? null, ascentM: ascent ?? null, kcal: kcal ?? null, avgHr: avgHr ? Math.round(avgHr) : null, maxHr: maxHr ? Math.round(maxHr) : null, avgPower: null, avgSpeed: distM && sec ? distM / sec : null }, records: [], laps: [], lengths: [] };
}

async function polarRegister(env: Env, tok: any, uid: number) {
  const B = base(env, 'polar', 'https://www.polaraccesslink.com');
  const res = await fetch(`${B}/v3/users`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ 'member-id': `u${uid}-${randomToken(6)}` }) });
  if (!res.ok && res.status !== 409) throw new HttpError(502, `Polar: Registrierung fehlgeschlagen (${res.status}).`);
}
function isoDur(s: string): number { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/.exec(s || ''); return m ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) : 0; }
async function syncPolar(env: Env, uid: number): Promise<IngestStats> {
  const B = base(env, 'polar', 'https://www.polaraccesslink.com');
  const exs = await api(env, uid, 'polar', `${B}/v3/exercises`).then(jsonOf).catch(rethrowAuth([]));
  const conn = await getConn(env, uid, 'polar');
  const seen = new Set<string>(JSON.parse((conn && conn.cursor) || '[]'));
  const raw: RawActivity[] = [];
  for (const e of (Array.isArray(exs) ? exs : []).slice(-20)) {
    if (!e.id || seen.has(String(e.id))) continue;
    const fit = await api(env, uid, 'polar', `${B}/v3/exercises/${e.id}/fit`, { headers: { Accept: '*/*' } }).catch(() => null);
    try { if (fit && fit.ok) { raw.push(parseFit(new Uint8Array(await fit.arrayBuffer()))); seen.add(String(e.id)); continue; } } catch (x) { /* fällt auf Summen zurück */ }
    const sp = /run/i.test(e.sport || '') ? 'run' : /cycl|bik|rid/i.test(e.sport || '') ? 'bike' : /swim/i.test(e.sport || '') ? 'swim' : /strength|gym/i.test(e.sport || '') ? 'strength' : 'other';
    raw.push(simpleRaw(sp, Date.parse(e.start_time + (/[zZ+]/.test(e.start_time.slice(-6)) ? '' : 'Z')), isoDur(e.duration), e.distance ?? null, e.heart_rate && e.heart_rate.average, e.heart_rate && e.heart_rate.maximum, null, e.calories ?? null));
    seen.add(String(e.id));
  }
  const trend: Record<string, any> = {};
  const nights = await api(env, uid, 'polar', `${B}/v3/users/nightly-recharge`).then(jsonOf).then(j => j.recharges || []).catch(rethrowAuth([]));
  for (const n of nights) { const t = trend[n.date] = trend[n.date] || {}; if (n.heart_rate_avg) t.restingHR = Math.round(n.heart_rate_avg); if (n.heart_rate_variability_avg) t.hrv = Math.round(n.heart_rate_variability_avg); if (n.breathing_rate_avg) t.breathingRate = r1(n.breathing_rate_avg); }
  const sl = await api(env, uid, 'polar', `${B}/v3/users/sleep`).then(jsonOf).then(j => j.nights || []).catch(rethrowAuth([]));
  for (const s of sl) { const t = trend[s.date] = trend[s.date] || {}; const tot = (s.light_sleep || 0) + (s.deep_sleep || 0) + (s.rem_sleep || 0); if (tot) t.sleepHours = r1(tot / 3600); if (s.deep_sleep != null) t.deepSleep = Math.round(s.deep_sleep / 60); if (s.rem_sleep != null) t.remSleep = Math.round(s.rem_sleep / 60); if (s.sleep_score) t.sleepQuality = Math.round(s.sleep_score / 10); }
  await saveConn(env, uid, 'polar', { cursor: JSON.stringify([...seen].slice(-200)) });
  return ingest(env, uid, { source: 'polar', trend, raw }, { protect: await protectOf(env, uid, 'polar') });
}

async function syncWithings(env: Env, uid: number, days: number): Promise<IngestStats> {
  const B = base(env, 'withings', 'https://wbsapi.withings.net');
  const now = Math.floor(Date.now() / 1000);
  const post = (path: string, params: Record<string, string>) => api(env, uid, 'withings', `${B}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() }).then(jsonOf).then(j => { if (j.status !== 0) throw new Error('Withings Status ' + j.status); return j.body || {}; });
  const meas = await post('/measure', { action: 'getmeas', meastypes: '1', category: '1', startdate: String(now - days * 86400), enddate: String(now) }).catch(rethrowAuth({ measuregrps: [] }));
  const weights: Record<string, number> = {};
  for (const g of meas.measuregrps || []) for (const m of g.measures || []) if (m.type === 1) weights[berlinDate(g.date * 1000)] = r1(m.value * Math.pow(10, m.unit));
  const sleep = await post('/v2/sleep', { action: 'getsummary', startdateymd: addDaysStr(berlinDate(), -days), enddateymd: berlinDate(), data_fields: 'total_sleep_time,hr_min,rr_average,deepsleepduration,remsleepduration,sleep_latency,sleep_score' }).catch(rethrowAuth({ series: [] }));
  const trend: Record<string, any> = {};
  for (const s of sleep.series || []) {
    const d = s.date || (s.enddate ? berlinDate(s.enddate * 1000) : null); if (!d) continue;
    const x = s.data || {}; const t = trend[d] = trend[d] || {};
    if (x.total_sleep_time) t.sleepHours = r1(x.total_sleep_time / 3600);
    if (x.hr_min) t.restingHR = x.hr_min;
    if (x.rr_average) t.breathingRate = r1(x.rr_average);
    if (x.deepsleepduration != null) t.deepSleep = Math.round(x.deepsleepduration / 60);
    if (x.remsleepduration != null) t.remSleep = Math.round(x.remsleepduration / 60);
    if (x.sleep_latency != null) t.sleepLatency = Math.round(x.sleep_latency / 60);
    if (x.sleep_score) t.sleepQuality = Math.round(x.sleep_score / 10);
  }
  return ingest(env, uid, { source: 'withings', trend, weights }, { protect: await protectOf(env, uid, 'withings') });
}

/* Dropbox: neue .fit/.gpx/.tcx-Dateien im HealthFit-Ordner (über Cursor nur Neues).
   Auftrag 13: HealthFit speichert in /Apps/HealthFit. Eine Dropbox-App mit „App folder“-Zugriff sieht diesen Ordner nicht
   (sie sieht nur /Apps/<eigener Name>) – das war der Grund, warum nie eine Datei ankam. Deshalb: Ordner suchen, verständliche
   Fehler mit Code (für die App), fehlgeschlagene Dateien beim nächsten Abruf wiederholen, letzte Datei und Abruf merken. */
export const DROPBOX_FOLDERS = ['/Apps/HealthFit', '/HealthFit', '/Apps/Health Fit'];
export class DbxError extends HttpError { constructor(status: number, msg: string, public code: string) { super(status, msg); } }
async function dbxFetch(env: Env, uid: number, url: string, init: RequestInit): Promise<Response> {
  const t = await accessToken(env, uid, 'dropbox');
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: 'Bearer ' + t } });
  if (res.status === 401) {
    const txt = await res.text().catch(() => '');
    // Fehlende Berechtigung ist kein abgelaufenes Login: neu verbinden hilft erst, wenn die Berechtigung in der Dropbox-App angehakt ist
    if (/missing_scope/.test(txt)) throw new DbxError(403, 'Dropbox erlaubt das Lesen der Dateien nicht. In der Dropbox-App unter „Permissions“ files.content.read und files.metadata.read anhaken, dann hier neu verbinden.', 'scope');
    await saveConn(env, uid, 'dropbox', { status: 'reauth', last_error: 'Dropbox-Anmeldung abgelaufen. Bitte neu verbinden.' });
    throw new DbxError(401, 'Dropbox-Anmeldung abgelaufen. Bitte neu verbinden.', 'reauth');
  }
  return res;
}
async function dbxJson(env: Env, uid: number, B: string, path: string, body: any): Promise<{ status: number; data: any }> {
  const res = await dbxFetch(env, uid, `${B}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  if (res.status === 429) throw new DbxError(503, 'Dropbox bremst gerade (zu viele Abrufe). Der nächste Abruf in 15 min klappt meist.', 'rate');
  if (res.status >= 500) throw new DbxError(502, `Dropbox antwortet gerade nicht (Fehler ${res.status}). Der nächste Abruf versucht es wieder.`, 'down');
  return { status: res.status, data };
}
/* Ordner finden: eingestellter Ordner, sonst die üblichen HealthFit-Orte, sonst ein Ordner „HealthFit“ in /Apps oder ganz oben */
async function findDropboxFolder(env: Env, uid: number, B: string, wanted: string | null): Promise<string | null> {
  const isFolder = async (p: string) => { const r = await dbxJson(env, uid, B, '/2/files/get_metadata', { path: p }); return r.status === 200 && r.data && r.data['.tag'] === 'folder' ? (r.data.path_display || p) : null; };
  for (const p of [...(wanted ? [wanted] : []), ...DROPBOX_FOLDERS.filter(x => x !== wanted)]) { if (p === '/') return '/'; const f = await isFolder(p); if (f) return f; }
  for (const parent of ['/Apps', '']) {
    const r = await dbxJson(env, uid, B, '/2/files/list_folder', { path: parent, recursive: false, limit: 200 });
    const hit = r.status === 200 && (r.data.entries || []).find((e: any) => e['.tag'] === 'folder' && /health\s*fit/i.test(e.name));
    if (hit) return hit.path_display || hit.path_lower;
  }
  return null;
}
async function syncDropbox(env: Env, uid: number, maxFiles = 1): Promise<IngestStats> {
  const B = base(env, 'dropbox', 'https://api.dropboxapi.com'), CB = base(env, 'dropboxcontent', 'https://content.dropboxapi.com');
  const conn = await getConn(env, uid, 'dropbox');
  const meta = conn && conn.stats ? JSON.parse(conn.stats) : {};
  const list = async (path: string, body: any) => {
    const r = await dbxJson(env, uid, B, path, body);
    if (r.status === 200) return r.data;
    if (r.status === 409 && /reset/.test(JSON.stringify(r.data))) return null; // Cursor veraltet: neu auflisten
    throw new DbxError(502, `Dropbox: Ordner konnte nicht gelesen werden (${(r.data && r.data.error_summary) || 'Fehler ' + r.status}).`, 'list');
  };
  let folder: string | null = meta.folder || null;
  let res: any = conn && conn.cursor && folder ? await list('/2/files/list_folder/continue', { cursor: conn.cursor }).catch(e => { if (e instanceof DbxError && (e.code === 'reauth' || e.code === 'scope')) throw e; return null; }) : null;
  if (!res) {
    const found = await findDropboxFolder(env, uid, B, meta.folderSet ? folder : null);
    if (!found) {
      await saveConn(env, uid, 'dropbox', { stats: JSON.stringify({ ...meta, folder: null }) });
      throw new DbxError(404, 'Der HealthFit-Ordner ist in deiner Dropbox nicht zu finden. Entweder hat HealthFit noch nichts exportiert (in HealthFit: Automatischer Export → Dropbox einschalten), oder die Dropbox-App des Servers hat nur Zugriff auf ihren eigenen Ordner („App folder“) statt auf die ganze Dropbox.', 'folder');
    }
    folder = found;
    res = await list('/2/files/list_folder', { path: folder === '/' ? '' : folder, recursive: true, limit: 500 });
  }
  const files: any[] = [];
  for (let guard = 0; guard < 20; guard++) {
    files.push(...(res.entries || []).filter((e: any) => e['.tag'] === 'file' && /\.(fit|gpx|tcx)$/i.test(e.name)));
    if (!res.has_more) break;
    res = await list('/2/files/list_folder/continue', { cursor: res.cursor });
  }
  // Beim ersten Mal nur die letzten 6 Wochen ansehen, und nie Dateien von vor dem Verbinden (die Tage davor bleiben, wie sie waren)
  const prot = await protectOf(env, uid, 'dropbox');
  const since = Math.max(Date.now() - 42 * 86400000, prot ? prot.at - 6 * 3600000 : 0);
  const fileTime = (f: any) => Date.parse(f.client_modified || f.server_modified || '') || 0;
  // Warteschlange: neue Dateien erst merken (mit Cursor sofort speichern), dann höchstens maxFiles pro Aufruf auswerten.
  // Grund (Auftrag 13): Der kostenlose Cloudflare-Tarif erlaubt 10 ms CPU pro Aufruf, eine FIT-Datei braucht 5-40 ms.
  // Viele Dateien auf einmal brachen den Aufruf ab, bevor etwas gespeichert war – bei jedem Versuch wieder.
  const queue: any[] = [...(meta.queue || []), ...(meta.retry || []).map((r: any) => ({ ...r }))].filter((q: any) => q && q.path && (q.n || 0) < 3);
  for (const f of files.filter(f => fileTime(f) >= since).sort((x, y) => fileTime(x) - fileTime(y))) {
    if (!queue.some(q => q.path === f.path_lower)) queue.push({ path: f.path_lower, name: f.name, at: f.client_modified || f.server_modified || null, n: 0 });
  }
  const errors: { name: string; why: string }[] = (meta.errors || []).filter((e: any) => e && typeof e === 'object').slice(-4);
  let lastFile = meta.lastFile || null;
  let st: any = { ...meta, folder, filesInFolder: files.length || meta.filesInFolder || 0, queue: queue.slice(-60), errors, lastFile };
  delete st.retry;
  await saveConn(env, uid, 'dropbox', { cursor: res.cursor || null, stats: JSON.stringify(st) });
  const total: IngestStats = { days: 0, activities: 0, matched: 0, extras: 0, merged: 0, duplicates: 0 };
  for (let k = 0; k < maxFiles && st.queue.length; k++) {
    const f = st.queue[0];
    const r = await dbxFetch(env, uid, `${CB}/2/files/download`, { method: 'POST', headers: { 'Dropbox-API-Arg': JSON.stringify({ path: f.path }), Accept: '*/*' } });
    let raw: RawActivity | null = null;
    if (!r.ok) {
      st.errors = [...st.errors, { name: f.name, why: `Download fehlgeschlagen (${r.status})` }].slice(-5);
      st.queue = [...st.queue.slice(1), ...((f.n || 0) + 1 < 3 ? [{ ...f, n: (f.n || 0) + 1 }] : [])];
    } else {
      try { raw = parseActivityFile(f.name, new Uint8Array(await r.arrayBuffer()), parseFit); }
      catch (e) { st.errors = [...st.errors, { name: f.name, why: 'Datei nicht lesbar: ' + String((e as Error).message || e).slice(0, 80) }].slice(-5); }
      st.queue = st.queue.slice(1);
    }
    if (raw) {
      if (!lastFile || !lastFile.at || Date.parse(f.at || '') >= Date.parse(lastFile.at)) lastFile = { name: f.name, at: f.at || null, importedAt: Date.now() };
      st.lastFile = lastFile;
    }
    // Fortschritt vor der Auswertung speichern: bricht der Aufruf ab, ist die Datei trotzdem aus der Warteschlange
    await saveConn(env, uid, 'dropbox', { stats: JSON.stringify(st) });
    if (raw) {
      const one = await ingest(env, uid, { source: 'healthfit', raw: [raw] }, { protect: await protectOf(env, uid, 'dropbox') });
      for (const key of Object.keys(total) as (keyof IngestStats)[]) (total as any)[key] = ((total as any)[key] || 0) + ((one as any)[key] || 0);
    }
  }
  return { ...total, queued: st.queue.length };
}

export async function syncProvider(env: Env, uid: number, p: ProviderId, opts: { initial?: boolean; maxFiles?: number } = {}): Promise<IngestStats> {
  const days = opts.initial ? 28 : 3;
  let stats: IngestStats;
  try {
    if (p === 'oura') stats = await syncOura(env, uid, days);
    else if (p === 'whoop') stats = await syncWhoop(env, uid, opts.initial ? 28 : 4);
    else if (p === 'polar') stats = await syncPolar(env, uid);
    else if (p === 'withings') stats = await syncWithings(env, uid, days);
    else if (p === 'dropbox') stats = await syncDropbox(env, uid, opts.maxFiles || 1);
    else throw new HttpError(400, 'Dieser Dienst wird anders abgerufen.');
    const c = await getConn(env, uid, p);
    const old = c && c.stats ? JSON.parse(c.stats) : {};
    await saveConn(env, uid, p, { last_sync_at: Date.now(), last_ok_at: Date.now(), last_error: null, status: 'connected', stats: JSON.stringify({ ...old, last: stats }) });
    return stats;
  } catch (e) {
    const c = await getConn(env, uid, p);
    const f = friendlyError(e);
    const old = c && c.stats ? JSON.parse(c.stats) : {};
    await saveConn(env, uid, p, { last_sync_at: Date.now(), last_error: f.text.slice(0, 300), status: f.reauth || (c && c.status === 'reauth') ? 'reauth' : 'error', stats: JSON.stringify({ ...old, errorCode: f.code }) }).catch(() => {});
    // Protokoll für den Betreiber (ohne Werte): echte Meldung, Code und ob TOKEN_KEY an dieser Stelle vorhanden war
    await logError(env, 'server', `${p}: ${String((e as Error).message || e).slice(0, 160)} [${f.code}, TOKEN_KEY ${env.TOKEN_KEY ? (String(env.TOKEN_KEY).trim().length >= 16 ? 'ok' : 'zu kurz') : 'fehlt'}]`, 'sync-' + p, { uid }).catch(() => {});
    throw f.reauth && !(e instanceof HttpError) ? new HttpError(401, f.text) : e;
  }
}
/* Fehler in einen Satz für die App übersetzen (Code für passende Hilfe in der App) */
export function friendlyError(e: any): { text: string; code: string; reauth?: boolean } {
  const m = String((e && e.message) || e || '');
  if (e instanceof DbxError) return { text: m, code: e.code, reauth: e.code === 'reauth' };
  if (/TOKEN_KEY fehlt/.test(m)) return { text: 'Der Server ist nicht vollständig eingerichtet (Schlüssel TOKEN_KEY fehlt). Das kann nur der Betreiber beheben, danach einmal neu verbinden.', code: 'token_key' };
  if (/operation-specific|OperationError|decrypt/i.test(m)) return { text: 'Die gespeicherte Anmeldung passt nicht mehr zum Server (Schlüssel geändert). Bitte einmal neu verbinden.', code: 'token_mismatch', reauth: true };
  if (/abgelaufen|abgelehnt|neu verbinden/i.test(m)) return { text: m, code: 'reauth', reauth: true };
  return { text: m || 'Unbekannter Fehler beim Abruf.', code: 'other' };
}

/* Trennen. deleteData: alle automatisch übernommenen Werte dieser Quelle entfernen (Oura verlangt Löschung auf Wunsch binnen 72 h). */
export async function disconnect(env: Env, uid: number, p: string, deleteData: boolean): Promise<{ removed: number }> {
  await env.DB.prepare("UPDATE connections SET status = 'disconnected', token_enc = NULL, cursor = NULL WHERE user_id = ? AND provider = ?").bind(uid, p).run();
  if (!deleteData) return { removed: 0 };
  const source = p === 'dropbox' ? 'healthfit' : p;
  return { removed: await removeSourceData(env, uid, source) };
}
export async function removeSourceData(env: Env, uid: number, source: string): Promise<number> {
  const trend = await getRecords(env, uid, 'trend');
  const settings = null;
  const t = Date.now(); const changes: any[] = [];
  for (const [d, p0] of Object.entries(trend)) {
    const p = upgradeLegacyPoint({ ...p0 });
    let changed = false;
    for (const f of Object.keys(p._auto || {})) {
      if (!p._auto[f] || p._auto[f][source] == null) continue;
      p._auto = { ...p._auto, [f]: { ...p._auto[f] } }; delete p._auto[f][source]; changed = true;
      if (p._src && p._src[f] === source) { const b = bestAuto(p, f, settings); p[f] = b ? b.value : null; p._src = { ...p._src }; if (b) p._src[f] = b.source; else delete p._src[f]; }
    }
    if (changed) changes.push({ kind: 'trend', key: d, data: p, updatedAt: t + changes.length });
  }
  const acts = await getRecords(env, uid, 'activity');
  for (const [id, a] of Object.entries(acts)) if (a && a.source === source && (a.sources || []).length <= 1) changes.push({ kind: 'activity', key: id, deleted: true, updatedAt: t + changes.length });
  if (changes.length) await putRecords(env, uid, changes);
  return changes.length;
}

export async function connectionsStatus(env: Env, uid: number): Promise<any[]> {
  const rows = await env.DB.prepare('SELECT * FROM connections WHERE user_id = ?').bind(uid).all();
  const by: Record<string, Conn> = {}; (rows.results || []).forEach((r: Conn) => { by[r.provider] = r; });
  const keys = await env.DB.prepare('SELECT id, label, created_at, last_used, revoked FROM ingest_keys WHERE user_id = ? AND revoked = 0').bind(uid).all();
  const list: any[] = [];
  const pub = (p: string, label: string, kind: string, status: string, configured: boolean, secrets?: { name: string; set: boolean }[]) => {
    const c = by[p];
    list.push({ id: p, label, kind, availability: status, configured, secrets, status: c ? c.status : 'none', lastSyncAt: c ? c.last_sync_at : null, lastOkAt: c ? c.last_ok_at : null, error: c ? c.last_error : null, stats: c && c.stats ? JSON.parse(c.stats) : null });
  };
  // Grundlagen des Servers (nur ob gesetzt, nie Werte): TOKEN_KEY fehlte in der echten App (Auftrag 13)
  list.push({ id: 'server', label: 'Server', kind: 'server', availability: 'internal', configured: !!(env.TOKEN_KEY && String(env.TOKEN_KEY).trim().length >= 16), status: 'none', secrets: ['TOKEN_KEY', 'SETUP_CODE', 'VAPID_PRIVATE_JWK'].map(name => ({ name, set: !!env[name] })) });
  for (const [p, d] of Object.entries(OAUTH) as [ProviderId, OAuthDef][]) pub(p, d.label, 'oauth', d.status, !!(env[d.idEnv] && env[d.secretEnv]), [{ name: d.idEnv, set: !!env[d.idEnv] }, { name: d.secretEnv, set: !!env[d.secretEnv] }]);
  pub('intervals', 'intervals.icu', 'apikey', 'ready', true);
  list.push({ id: 'shortcut', label: 'Apple Health (Kurzbefehl)', kind: 'key', availability: 'ready', configured: true, status: (keys.results || []).length ? 'connected' : 'none', keys: (keys.results || []).map((k: any) => ({ id: k.id, label: k.label, createdAt: k.created_at, lastUsed: k.last_used })) });
  // Partner nötig: geführter Weg über intervals.icu (kostenlos, offizielle Verbindungen zu diesen Diensten)
  const icu = by.intervals && by.intervals.status === 'connected';
  for (const [p, l] of [['garmin', 'Garmin'], ['coros', 'COROS'], ['suunto', 'Suunto'], ['wahoo', 'Wahoo'], ['trainingpeaks', 'TrainingPeaks']]) list.push({ id: p, label: l, kind: 'partner', availability: 'partner', via: 'intervals', configured: true, status: icu ? 'via' : 'none' });
  return list;
}

/* ---------- intervals.icu als Verbindung (eigener API-Schlüssel pro Nutzer) ---------- */
export async function connectIntervals(env: Env, uid: number, body: any): Promise<any> {
  const apiKey = String(body.apiKey || '').trim(), athleteId = String(body.athleteId || '').trim();
  if (apiKey.length < 15 || !/^i\d+$/.test(athleteId)) throw new HttpError(400, 'Bitte API-Schlüssel und Athleten-ID (z. B. i123456) aus intervals.icu → Einstellungen → Developer Settings eintragen.');
  const res = await fetch(`${env.INTERVALS_BASE || 'https://intervals.icu'}/api/v1/athlete/${encodeURIComponent(athleteId)}`, { headers: { Authorization: 'Basic ' + btoa('API_KEY:' + apiKey), Accept: 'application/json' } });
  if (res.status === 401 || res.status === 403 || res.status === 404) throw new HttpError(400, 'intervals.icu lehnt Schlüssel oder ID ab. Bitte prüfen.');
  await saveConn(env, uid, 'intervals', { status: 'connected', token: { apiKey, athleteId }, account: athleteId, last_error: null });
  return { ok: true };
}

/* ---------- Kurzbefehl (Apple Health) ---------- */
export async function createIngestKey(env: Env, uid: number, label: unknown) {
  const key = 'sk_' + randomToken(24);
  const id = 'ik-' + randomToken(6);
  await env.DB.prepare('INSERT INTO ingest_keys (id, user_id, key_hash, label, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, uid, await sha256(key), String(label || 'Kurzbefehl').slice(0, 40), Date.now()).run();
  return { id, key };
}
export async function revokeIngestKey(env: Env, uid: number, id: string) {
  await env.DB.prepare('UPDATE ingest_keys SET revoked = 1 WHERE id = ? AND user_id = ?').bind(id, uid).run();
  return { ok: true };
}
export async function authIngest(req: Request, env: Env, url: URL): Promise<number> {
  const key = req.headers.get('X-Ingest-Key') || url.searchParams.get('key') || (/^Bearer\s+(sk_[\w-]+)$/.exec(req.headers.get('Authorization') || '') || [])[1] || '';
  if (!/^sk_[\w-]{20,}$/.test(key)) throw new HttpError(401, 'Schlüssel fehlt oder ist falsch.');
  const row = await env.DB.prepare('SELECT id, user_id FROM ingest_keys WHERE key_hash = ? AND revoked = 0').bind(await sha256(key)).first();
  if (!row) throw new HttpError(401, 'Schlüssel ungültig oder widerrufen.');
  await env.DB.prepare('UPDATE ingest_keys SET last_used = ? WHERE id = ?').bind(Date.now(), row.id).run();
  return row.user_id;
}

/* Zahlen aus Kurzbefehlen: „62,5“, „62 ms“, „7:45“ (Stunden:Minuten), Listen → Mittelwert */
export function looseNum(v: any): number | null {
  if (v == null || v === '') return null;
  if (Array.isArray(v)) { const n = v.map(looseNum).filter((x): x is number => x != null); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null; }
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = String(v).trim();
  const hm = /^(\d{1,2}):(\d{2})$/.exec(s); if (hm) return +hm[1] + +hm[2] / 60;
  const lines = s.split(/\n/).map(x => x.trim()).filter(Boolean);
  if (lines.length > 1) return looseNum(lines);
  const m = /-?\d+(?:[.,]\d+)?/.exec(s.replace(/\s/g, ''));
  return m ? parseFloat(m[0].replace(',', '.')) : null;
}
export function looseDate(v: any, fallback: string): string {
  const s = String(v || '').trim();
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const t = Date.parse(s); return isFinite(t) ? berlinDate(t) : fallback;
}
const SPORT_WORDS: [RegExp, string][] = [[/lauf|run|jog/i, 'run'], [/rad|cycl|bik|velo/i, 'bike'], [/schwimm|swim/i, 'swim'], [/kraft|strength|functional|weight|hiit/i, 'strength'], [/fußball|fussball|soccer|football/i, 'football'], [/geh|walk|wander|hik/i, 'walk']];
export function shortcutPayload(body: any, today: string): { trend: Record<string, any>; weights: Record<string, number>; raw: RawActivity[] } {
  const days = Array.isArray(body.days) ? body.days : [body];
  const trend: Record<string, any> = {}, weights: Record<string, number> = {}; const raw: RawActivity[] = [];
  for (const d of days) {
    const date = looseDate(d.date, today);
    const t: any = {};
    const hrv = looseNum(d.hrv ?? d.HRV ?? d.hfv); if (hrv && hrv > 5 && hrv < 300) t.hrv = Math.round(hrv);
    const rhr = looseNum(d.restingHR ?? d.ruhepuls ?? d.restingHeartRate); if (rhr && rhr > 25 && rhr < 120) t.restingHR = Math.round(rhr);
    let sl = looseNum(d.sleepHours ?? d.schlaf);
    if (sl == null && d.sleepMinutes != null) { const m = looseNum(d.sleepMinutes); sl = m != null ? m / 60 : null; }
    if (sl != null && sl > 24) sl = sl / 60; // Minuten statt Stunden
    if (sl && sl > 0 && sl < 16) t.sleepHours = r1(sl);
    const br = looseNum(d.breathingRate ?? d.atemfrequenz); if (br && br > 5 && br < 40) t.breathingRate = r1(br);
    const sp = looseNum(d.spo2 ?? d.sauerstoff); if (sp) t.spo2 = r1(sp <= 1 ? sp * 100 : sp);
    if (Object.keys(t).length) trend[date] = t;
    const w = looseNum(d.weight ?? d.gewicht); if (w && w > 25 && w < 250) weights[date] = r1(w);
    for (const wo of Array.isArray(d.workouts) ? d.workouts : []) {
      const sport = (SPORT_WORDS.find(([re]) => re.test(String(wo.type || wo.sport || ''))) || [null, 'other'])[1];
      const start = Date.parse(String(wo.start || '')) || Date.parse(date + 'T12:00:00Z');
      let dur = looseNum(wo.durationMin ?? wo.duration ?? wo.dauer);
      if (dur == null) continue;
      if (dur > 400) dur = dur / 60; // Sekunden
      let dist = looseNum(wo.distanceKm ?? wo.distance ?? wo.strecke);
      if (dist != null && dist > 300) dist = dist / 1000;
      raw.push(simpleRaw(sport, start, dur * 60, dist != null ? (sport === 'swim' && dist > 20 ? dist : dist * 1000) : null, looseNum(wo.avgHr ?? wo.puls), looseNum(wo.maxHr), looseNum(wo.ascent), looseNum(wo.calories ?? wo.kcal), 'shortcut', wo.name ? String(wo.name).slice(0, 60) : undefined));
    }
  }
  return { trend, weights, raw };
}
export async function shortcutIngest(env: Env, uid: number, body: any): Promise<any> {
  const p = shortcutPayload(body || {}, berlinDate());
  const stats = await ingest(env, uid, { source: 'shortcut', trend: p.trend, weights: p.weights, raw: p.raw });
  return { ok: true, ...stats, text: `Übernommen: ${stats.days} Tag(e) Werte, ${stats.activities} Einheit(en).` };
}

/* ---------- Datei-Import (.fit, .gpx, .tcx) ---------- */
export async function importFiles(env: Env, uid: number, req: Request, url: URL, source: 'file' | 'healthfit' = 'file'): Promise<any> {
  const files: { name: string; data: Uint8Array }[] = [];
  const ct = req.headers.get('Content-Type') || '';
  if (/multipart\/form-data/i.test(ct)) {
    const fd = await req.formData();
    for (const [, v] of fd.entries()) if (typeof v === 'object' && v && 'arrayBuffer' in v) files.push({ name: (v as any).name || 'datei.fit', data: new Uint8Array(await (v as any).arrayBuffer()) });
  } else {
    const buf = new Uint8Array(await req.arrayBuffer());
    if (buf.length) files.push({ name: url.searchParams.get('name') || 'datei.fit', data: buf });
  }
  if (!files.length) throw new HttpError(400, 'Keine Datei empfangen.');
  if (files.some(f => f.data.length > 15 * 1024 * 1024)) throw new HttpError(413, 'Datei zu groß (höchstens 15 MB).');
  const raw: RawActivity[] = []; const errors: string[] = [];
  for (const f of files.slice(0, 20)) { try { raw.push(parseActivityFile(f.name, f.data, parseFit)); } catch (e) { errors.push(`${f.name}: ${(e as Error).message}`); } }
  if (!raw.length) throw new HttpError(400, errors.join(' ') || 'Datei konnte nicht gelesen werden.');
  const stats = await ingest(env, uid, { source: url.searchParams.get('source') === 'healthfit' ? 'healthfit' : source, raw });
  return { ok: true, ...stats, errors };
}

/* ---------- Webhooks ---------- */
async function hmacHex(secret: string, body: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function dropboxWebhook(env: Env, req: Request, url: URL, ctx: any): Promise<Response> {
  if (req.method === 'GET') return new Response(url.searchParams.get('challenge') || '', { headers: { 'Content-Type': 'text/plain', 'X-Content-Type-Options': 'nosniff' } });
  const body = await req.text();
  const sig = req.headers.get('X-Dropbox-Signature') || '';
  if (!env.DROPBOX_APP_SECRET || sig !== await hmacHex(String(env.DROPBOX_APP_SECRET), body)) return new Response('bad signature', { status: 403 });
  let accounts: string[] = [];
  try { accounts = (JSON.parse(body).list_folder || {}).accounts || []; } catch (e) {}
  const job = (async () => {
    for (const acc of accounts.slice(0, 50)) {
      const rows = await env.DB.prepare("SELECT user_id FROM connections WHERE provider = 'dropbox' AND account = ? AND status <> 'disconnected'").bind(acc).all();
      for (const r of rows.results || []) { try { await syncProvider(env, r.user_id, 'dropbox'); } catch (e) {} }
    }
  })();
  if (ctx && ctx.waitUntil) ctx.waitUntil(job); else await job;
  return new Response('ok');
}
export async function whoopWebhook(env: Env, req: Request, ctx: any): Promise<Response> {
  const body = await req.text();
  const ts = req.headers.get('X-WHOOP-Signature-Timestamp') || '';
  const sig = req.headers.get('X-WHOOP-Signature') || '';
  if (!env.WHOOP_CLIENT_SECRET) return new Response('no', { status: 403 });
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(env.WHOOP_CLIENT_SECRET)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expect = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(ts + body)))));
  if (sig !== expect) return new Response('bad signature', { status: 403 });
  let user = '';
  try { user = String(JSON.parse(body).user_id || ''); } catch (e) {}
  const job = (async () => {
    const rows = await env.DB.prepare("SELECT user_id FROM connections WHERE provider = 'whoop' AND account = ? AND status <> 'disconnected'").bind(user).all();
    for (const r of rows.results || []) { try { await syncProvider(env, r.user_id, 'whoop'); } catch (e) {} }
  })();
  if (ctx && ctx.waitUntil) ctx.waitUntil(job); else await job;
  return new Response('ok');
}

/* Zeitplan: Dienste regelmäßig abrufen (Dropbox alle 15 min als Ersatz für den Webhook, die anderen alle 30 min) */
export async function scheduledSync(env: Env, users: number[]): Promise<void> {
  const now = Date.now();
  for (const uid of users) {
    const rows = await env.DB.prepare("SELECT provider, last_sync_at, stats FROM connections WHERE user_id = ? AND status IN ('connected', 'error')").bind(uid).all();
    for (const r of rows.results || []) {
      const waiting = r.provider === 'dropbox' && r.stats && (JSON.parse(r.stats).queue || []).length > 0;
      const every = r.provider === 'dropbox' ? (waiting ? 5 : 15) : 30;
      if (r.provider === 'intervals' || (r.last_sync_at && now - r.last_sync_at < every * 60000 - 30000)) continue;
      try { await syncProvider(env, uid, r.provider as ProviderId); } catch (e) { /* Status steht in der Verbindung */ }
    }
  }
}
void readJson;
