/* Ironman Coach Server: Geräte-Login, Datensatz-Sync, tägliches Backup, intervals.icu-Abruf.
   Ein Nutzer, kein Registrierungssystem. Geheimnisse nur über env (Cloudflare-Secrets). */
import { berlinDate, berlinParts, putRecords, getMeta } from './store.js';
import { runImport } from './intervals.js';
import { runDaily, runWeekly, loadState } from './coach.js';
import { notifyTick, queueAfterImport, queueAdjustments, queueAchievements, checkAchievements, deliver } from './notify.js';
import { vapidPublicKey } from './webpush.js';
import { logError, recentErrors } from './errlog.js';

const KINDS = new Set(['session', 'trend', 'nutrition', 'custom', 'illness', 'milestone', 'weekNote', 'settings', 'plan', 'adjust']);
const PAIR_TTL_MS = 10 * 60 * 1000;
const MAX_BODY = 6 * 1024 * 1024;
const BACKUP_KEEP_DAYS = 30;

/* ---------- Hilfen ---------- */
function json(data, status, cors) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } });
}
function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
function b64url(bytes) {
  let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomToken(n) { return b64url(crypto.getRandomValues(new Uint8Array(n || 32))); }
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function pairCode() {
  const r = crypto.getRandomValues(new Uint8Array(8));
  const c = [...r].map(x => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
  return c.slice(0, 4) + '-' + c.slice(4);
}
function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
async function readJson(req) {
  const len = parseInt(req.headers.get('Content-Length') || '0', 10);
  if (len > MAX_BODY) throw new HttpError(413, 'Zu groß');
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Zu groß');
  try { return text ? JSON.parse(text) : {}; } catch (e) { throw new HttpError(400, 'Kein gültiges JSON'); }
}
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
function cleanName(n) { return String(n || 'Gerät').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40) || 'Gerät'; }

/* ---------- Geräte ---------- */
async function createDevice(env, name) {
  const token = randomToken(32);
  const id = 'dev-' + randomToken(9);
  await env.DB.prepare('INSERT INTO devices (id, name, token_hash, created_at, last_seen) VALUES (?, ?, ?, ?, ?)')
    .bind(id, cleanName(name), await sha256(token), Date.now(), Date.now()).run();
  return { id, token };
}
async function authDevice(req, env) {
  const h = req.headers.get('Authorization') || '';
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,})$/.exec(h);
  if (!m) throw new HttpError(401, 'Nicht angemeldet');
  const dev = await env.DB.prepare('SELECT id, name, last_seen FROM devices WHERE token_hash = ?').bind(await sha256(m[1])).first();
  if (!dev) throw new HttpError(401, 'Gerät unbekannt oder entfernt');
  if (!dev.last_seen || Date.now() - dev.last_seen > 60000) {
    await env.DB.prepare('UPDATE devices SET last_seen = ? WHERE id = ?').bind(Date.now(), dev.id).run();
  }
  return dev;
}

/* ---------- Sync ---------- */
function validChange(c) {
  return c && KINDS.has(c.kind) && typeof c.key === 'string' && c.key.length > 0 && c.key.length <= 200 &&
    Number.isFinite(c.updatedAt) && c.updatedAt > 0 && (c.deleted ? true : c.data !== undefined);
}
async function changesSince(env, since, limit) {
  const rows = await env.DB.prepare('SELECT kind, key, data, updated_at, deleted, rev FROM records WHERE rev > ? ORDER BY rev LIMIT ?')
    .bind(since, limit + 1).all();
  const list = rows.results || [];
  const more = list.length > limit;
  const page = more ? list.slice(0, limit) : list;
  return {
    more,
    cursor: page.length ? page[page.length - 1].rev : since,
    records: page.map(r => ({ kind: r.kind, key: r.key, data: r.deleted ? null : JSON.parse(r.data), updatedAt: r.updated_at, deleted: !!r.deleted }))
  };
}

/* ---------- Backup ---------- */
export async function dailyBackup(env) {
  const day = berlinDate();
  const rows = await env.DB.prepare('SELECT kind, key, data, updated_at FROM records WHERE deleted = 0').all();
  const records = (rows.results || []).map(r => ({ kind: r.kind, key: r.key, data: JSON.parse(r.data), updatedAt: r.updated_at }));
  if (!records.length) return { day, count: 0 };
  await env.DB.prepare('INSERT OR REPLACE INTO backups (day, created_at, data) VALUES (?, ?, ?)').bind(day, Date.now(), JSON.stringify(records)).run();
  const cutoff = berlinDate(Date.now() - BACKUP_KEEP_DAYS * 86400000);
  await env.DB.prepare('DELETE FROM backups WHERE day < ?').bind(cutoff).run();
  await env.DB.prepare('DELETE FROM pair_codes WHERE expires_at < ?').bind(Date.now()).run();
  await env.DB.prepare('DELETE FROM pair_attempts WHERE ts < ?').bind(Date.now() - 86400000).run();
  await env.DB.prepare('DELETE FROM push_log WHERE day < ?').bind(berlinDate(Date.now() - 14 * 86400000)).run();
  return { day, count: records.length };
}

/* ---------- Routen ---------- */
async function route(req, env, url) {
  const p = url.pathname.replace(/\/+$/, '');
  const M = req.method;

  if (p === '/api/health' && M === 'GET') {
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM devices').first();
    return { ok: true, setup: (n && n.n) > 0, time: Date.now() };
  }
  // Öffentlicher VAPID-Schlüssel (kein Geheimnis)
  if (p === '/api/push/key' && M === 'GET') {
    if (!env.VAPID_PRIVATE_JWK) throw new HttpError(503, 'Mitteilungen sind auf dem Server noch nicht eingerichtet.');
    return { key: vapidPublicKey(env) };
  }

  // Erstes Gerät einrichten. Geht nur, solange noch kein Gerät existiert.
  if (p === '/api/setup' && M === 'POST') {
    const body = await readJson(req);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM devices').first();
    if (n && n.n > 0) throw new HttpError(409, 'Der Server ist schon eingerichtet. Kopple dieses Gerät mit einem Code.');
    const d = await createDevice(env, body.name);
    return { deviceId: d.id, token: d.token, time: Date.now() };
  }

  // Kopplungscode einlösen (neues Gerät)
  if (p === '/api/pair/redeem' && M === 'POST') {
    const body = await readJson(req);
    const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM pair_attempts WHERE ts > ?').bind(Date.now() - PAIR_TTL_MS).first();
    if (recent && recent.n >= 20) throw new HttpError(429, 'Zu viele Versuche. Warte 10 Minuten.');
    const code = normCode(body.code);
    const row = code.length === 8 ? await env.DB.prepare('SELECT code_hash, expires_at FROM pair_codes WHERE code_hash = ?').bind(await sha256(code)).first() : null;
    if (!row || row.expires_at < Date.now()) {
      await env.DB.prepare('INSERT INTO pair_attempts (ts) VALUES (?)').bind(Date.now()).run();
      throw new HttpError(403, 'Der Code stimmt nicht oder ist abgelaufen.');
    }
    await env.DB.prepare('DELETE FROM pair_codes WHERE code_hash = ?').bind(row.code_hash).run();
    const d = await createDevice(env, body.name);
    return { deviceId: d.id, token: d.token, time: Date.now() };
  }

  // Ab hier nur mit Geräte-Schlüssel
  const dev = await authDevice(req, env);

  // Fehlerprotokoll der App (ohne Gesundheitsdaten)
  if (p === '/api/log' && M === 'POST') {
    const body = await readJson(req);
    const list = Array.isArray(body.errors) ? body.errors.slice(0, 10) : [];
    for (const e of list) await logError(env, 'app', e && e.msg, e && e.where, { version: e && e.version, view: e && e.view });
    return { ok: true, logged: list.length };
  }
  if (p === '/api/log' && M === 'GET') return { errors: await recentErrors(env, 50) };

  if (p === '/api/me' && M === 'GET') return { deviceId: dev.id, name: dev.name, time: Date.now() };

  if (p === '/api/pair/create' && M === 'POST') {
    const code = pairCode();
    const expires = Date.now() + PAIR_TTL_MS;
    await env.DB.prepare('DELETE FROM pair_codes WHERE expires_at < ?').bind(Date.now()).run();
    await env.DB.prepare('INSERT INTO pair_codes (code_hash, created_by, expires_at) VALUES (?, ?, ?)').bind(await sha256(normCode(code)), dev.id, expires).run();
    return { code, expiresAt: expires };
  }

  if (p === '/api/devices' && M === 'GET') {
    const rows = await env.DB.prepare('SELECT id, name, created_at, last_seen FROM devices ORDER BY created_at').all();
    return { devices: (rows.results || []).map(r => ({ id: r.id, name: r.name, createdAt: r.created_at, lastSeen: r.last_seen, self: r.id === dev.id })) };
  }
  const delDev = /^\/api\/devices\/([A-Za-z0-9_-]+)$/.exec(p);
  if (delDev && M === 'DELETE') {
    if (delDev[1] === dev.id) throw new HttpError(400, 'Dieses Gerät kann sich nicht selbst entfernen.');
    await env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(delDev[1]).run();
    await env.DB.prepare('DELETE FROM push_subs WHERE device_id = ?').bind(delDev[1]).run();
    return { ok: true };
  }

  // Sync: Änderungen hochladen und alles Neue seit cursor zurückgeben
  if (p === '/api/sync' && M === 'POST') {
    const body = await readJson(req);
    const changes = Array.isArray(body.changes) ? body.changes : [];
    if (changes.length > 5000) throw new HttpError(413, 'Zu viele Änderungen auf einmal');
    const bad = changes.find(c => !validChange(c));
    if (bad) throw new HttpError(400, 'Ungültiger Datensatz: ' + String(bad && bad.kind) + '/' + String(bad && bad.key));
    if (changes.length) await putRecords(env, changes);
    const since = Number.isFinite(body.since) ? body.since : 0;
    const out = await changesSince(env, since, 2000);
    out.time = Date.now();
    out.accepted = changes.length;
    out.intervals = { configured: !!(env.INTERVALS_API_KEY && env.INTERVALS_ATHLETE_ID), last: await getMeta(env, 'intervals_last') };
    return out;
  }

  if (p === '/api/backups' && M === 'GET') {
    const rows = await env.DB.prepare('SELECT day, created_at, length(data) AS size FROM backups ORDER BY day DESC').all();
    return { backups: (rows.results || []).map(r => ({ day: r.day, createdAt: r.created_at, size: r.size })) };
  }
  if (p === '/api/backups/now' && M === 'POST') return await dailyBackup(env);
  const bk = /^\/api\/backups\/(\d{4}-\d{2}-\d{2})$/.exec(p);
  if (bk && M === 'GET') {
    const row = await env.DB.prepare('SELECT day, data FROM backups WHERE day = ?').bind(bk[1]).first();
    if (!row) throw new HttpError(404, 'Kein Backup für diesen Tag');
    return { day: row.day, records: JSON.parse(row.data) };
  }

  // intervals.icu
  if (p === '/api/intervals/import' && M === 'POST') {
    const st = await runImport(env, { days: 14 });
    return Object.assign({ configured: !!(env.INTERVALS_API_KEY && env.INTERVALS_ATHLETE_ID) }, st);
  }
  if (p === '/api/intervals/status' && M === 'GET') {
    return { configured: !!(env.INTERVALS_API_KEY && env.INTERVALS_ATHLETE_ID), last: await getMeta(env, 'intervals_last') };
  }

  // Push-Abo dieses Geräts speichern / löschen / testen
  if (p === '/api/push/subscribe' && M === 'POST') {
    const body = await readJson(req);
    const s = body.subscription || {};
    const keys = s.keys || {};
    const okEndpoint = /^https:\/\//.test(s.endpoint || '') || (env.ALLOW_TEST_ROUTES === '1' && /^http:\/\/127\.0\.0\.1:/.test(s.endpoint || ''));
    if (!okEndpoint || !keys.p256dh || !keys.auth) throw new HttpError(400, 'Ungültiges Abo');
    await env.DB.prepare('DELETE FROM push_subs WHERE device_id = ? OR endpoint = ?').bind(dev.id, s.endpoint).run();
    await env.DB.prepare('INSERT INTO push_subs (id, device_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind('sub-' + randomToken(9), dev.id, s.endpoint, keys.p256dh, keys.auth, Date.now()).run();
    return { ok: true };
  }
  if (p === '/api/push/unsubscribe' && M === 'POST') {
    await env.DB.prepare('DELETE FROM push_subs WHERE device_id = ?').bind(dev.id).run();
    return { ok: true };
  }
  if (p === '/api/push/status' && M === 'GET') {
    const me = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE device_id = ?').bind(dev.id).first();
    const all = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs').first();
    return { configured: !!env.VAPID_PRIVATE_JWK, thisDevice: !!(me && me.n), devices: (all && all.n) || 0 };
  }
  if (p === '/api/push/test' && M === 'POST') {
    if (!env.VAPID_PRIVATE_JWK) throw new HttpError(503, 'Mitteilungen sind auf dem Server noch nicht eingerichtet.');
    const n = await deliver(env, { title: 'Ironman Coach', body: 'Mitteilungen funktionieren. 💪', url: './?go=heute', tag: 'test' });
    return { delivered: n };
  }

  // Nur für lokale Tests: einen 5-Minuten-Lauf zu einer bestimmten Uhrzeit simulieren
  if (p === '/api/test/tick' && M === 'POST' && env.ALLOW_TEST_ROUTES === '1') {
    const body = await readJson(req);
    return await everyFive(env, { date: body.date, hour: body.hour, minute: body.minute, dow: body.dow });
  }

  // Plan-Anpassungen (Phase 4) von Hand auslösen
  if (p === '/api/coach/daily' && M === 'POST') return await runDaily(env, { force: true });
  if (p === '/api/coach/weekly' && M === 'POST') {
    const body = await readJson(req);
    return await runWeekly(env, { force: true, date: /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : undefined });
  }

  throw new HttpError(404, 'Unbekannte Adresse');
}

/* Alle 5 Minuten. Abruf und Anpassungen alle 30 Minuten zwischen 6 und 23 Uhr deutscher Zeit, Mitteilungen bei jedem Lauf. */
export async function everyFive(env, b) {
  b = b || berlinParts();
  let L = null;
  if (b.hour >= 6 && b.hour <= 23 && b.minute % 30 < 5) {
    if (env.INTERVALS_API_KEY && env.INTERVALS_ATHLETE_ID) { try { await runImport(env); } catch (e) { console.error('Abruf:', e && e.message); } }
    let daily = null;
    // Morgens nach dem Abruf: Tagesampel → Plan anpassen (einmal pro Tag)
    try { daily = await runDaily(env); } catch (e) { console.error('Tagesanpassung:', e && e.message); }
    // Sonntag ab 18 Uhr: nächste Woche planen (einmal)
    if (b.dow === 0 && b.hour >= 18) { try { await runWeekly(env); } catch (e) { console.error('Wochenanpassung:', e && e.message); } }
    if (env.VAPID_PRIVATE_JWK) {
      try {
        L = await loadState(env);
        if (L.plan) {
          await queueAfterImport(env, L, b.date);
          if (daily && daily.adjustments) await queueAdjustments(env, daily.adjustments, b.date);
          await queueAchievements(env, await checkAchievements(env, L, b.date));
        }
      } catch (e) { console.error('Warnungen:', e && e.message); }
    }
  }
  try { return await notifyTick(env, { berlin: b, state: L }); } catch (e) { console.error('Mitteilungen:', e && e.message); return { error: e.message }; }
}

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    try {
      const out = await route(req, env, url);
      return json(out, 200, cors);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      // Keine Datensätze oder Schlüssel loggen, nur die Meldung
      if (status === 500) { console.error('Fehler:', e && e.message); await logError(env, 'server', e && e.message, req.method + ' ' + url.pathname); }
      return json({ error: status === 500 ? 'Serverfehler' : e.message }, status, cors);
    }
  },
  async scheduled(event, env, ctx) {
    // Nachts das Backup, jeder andere Zeitplan (auch ein alter, noch nicht umgestellter) löst den normalen Lauf aus
    if (event.cron === '0 2 * * *') ctx.waitUntil(dailyBackup(env));
    else ctx.waitUntil(everyFive(env));
  }
};
