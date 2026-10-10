/* Ironman Coach Server: Geräte-Login, Datensatz-Sync, tägliches Backup.
   Ein Nutzer, kein Registrierungssystem. Geheimnisse nur über env (Cloudflare-Secrets). */

const KINDS = new Set(['session', 'trend', 'nutrition', 'custom', 'illness', 'milestone', 'weekNote', 'settings', 'plan']);
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
function berlinDate(ts) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts || Date.now()));
}

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
async function applyChanges(env, changes) {
  const stmts = [];
  for (const c of changes) {
    stmts.push(env.DB.prepare("UPDATE meta SET v = CAST(v AS INTEGER) + 1 WHERE k = 'rev'"));
    stmts.push(env.DB.prepare(
      `INSERT INTO records (kind, key, data, updated_at, deleted, rev)
       VALUES (?1, ?2, ?3, ?4, ?5, (SELECT CAST(v AS INTEGER) FROM meta WHERE k = 'rev'))
       ON CONFLICT (kind, key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted, rev = excluded.rev
       WHERE excluded.updated_at > records.updated_at`
    ).bind(c.kind, c.key, c.deleted ? null : JSON.stringify(c.data), Math.round(c.updatedAt), c.deleted ? 1 : 0));
  }
  // D1 führt einen Batch als Transaktion aus. In Paketen, damit einzelne Batches klein bleiben.
  for (let i = 0; i < stmts.length; i += 200) await env.DB.batch(stmts.slice(i, i + 200));
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
    return { ok: true };
  }

  // Sync: Änderungen hochladen und alles Neue seit cursor zurückgeben
  if (p === '/api/sync' && M === 'POST') {
    const body = await readJson(req);
    const changes = Array.isArray(body.changes) ? body.changes : [];
    if (changes.length > 5000) throw new HttpError(413, 'Zu viele Änderungen auf einmal');
    const bad = changes.find(c => !validChange(c));
    if (bad) throw new HttpError(400, 'Ungültiger Datensatz: ' + String(bad && bad.kind) + '/' + String(bad && bad.key));
    if (changes.length) await applyChanges(env, changes);
    const since = Number.isFinite(body.since) ? body.since : 0;
    const out = await changesSince(env, since, 2000);
    out.time = Date.now();
    out.accepted = changes.length;
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

  throw new HttpError(404, 'Unbekannte Adresse');
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
      if (status === 500) console.error('Fehler:', e && e.message);
      return json({ error: status === 500 ? 'Serverfehler' : e.message }, status, cors);
    }
  },
  async scheduled(event, env, ctx) {
    if (event.cron === '0 2 * * *') ctx.waitUntil(dailyBackup(env));
  }
};
