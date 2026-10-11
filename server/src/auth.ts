/* Geräte-Login, Kopplung, Einladungen. Nur SHA-256-Hashes von Schlüsseln und Codes werden gespeichert. */
import type { Env } from './store';
import { HttpError, randomToken, sha256, cleanName } from './http';

export const PAIR_TTL_MS = 10 * 60 * 1000;
export const INVITE_TTL_MS = 14 * 24 * 3600 * 1000;
export interface Auth { uid: number; deviceId: string; deviceName: string; role: string }

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newCode(): string {
  const r = crypto.getRandomValues(new Uint8Array(8));
  const c = [...r].map(x => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
  return c.slice(0, 4) + '-' + c.slice(4);
}
export function normCode(c: unknown): string { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

export async function createDevice(env: Env, uid: number, name: unknown) {
  const token = randomToken(32);
  const id = 'dev-' + randomToken(9);
  await env.DB.prepare('INSERT INTO devices (id, name, token_hash, created_at, last_seen, user_id) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, cleanName(name) || 'Gerät', await sha256(token), Date.now(), Date.now(), uid).run();
  return { id, token };
}
export async function authDevice(req: Request, env: Env): Promise<Auth> {
  const h = req.headers.get('Authorization') || '';
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,})$/.exec(h);
  if (!m) throw new HttpError(401, 'Nicht angemeldet');
  const dev = await env.DB.prepare('SELECT d.id, d.name, d.last_seen, d.user_id, u.role FROM devices d JOIN users u ON u.id = d.user_id WHERE d.token_hash = ?').bind(await sha256(m[1])).first();
  if (!dev) throw new HttpError(401, 'Gerät unbekannt oder entfernt');
  if (!dev.last_seen || Date.now() - dev.last_seen > 60000) {
    await env.DB.prepare('UPDATE devices SET last_seen = ? WHERE id = ?').bind(Date.now(), dev.id).run();
  }
  return { uid: dev.user_id, deviceId: dev.id, deviceName: dev.name, role: dev.role };
}

/* Vergleich über Hashes, damit die Laufzeit nichts über den Code verrät */
async function sameSecret(a: string, b: string): Promise<boolean> { return (await sha256('s:' + a)) === (await sha256('s:' + b)); }
async function guardAttempts(env: Env) {
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM pair_attempts WHERE ts > ?').bind(Date.now() - PAIR_TTL_MS).first();
  if (recent && recent.n >= 20) throw new HttpError(429, 'Zu viele Versuche. Warte 10 Minuten.');
}
async function failedAttempt(env: Env) { await env.DB.prepare('INSERT INTO pair_attempts (ts) VALUES (?)').bind(Date.now()).run(); }

/* Erstes Gerät: ohne Einladung nur, solange der Server noch kein einziges Gerät hat (wird Nutzer 1, Admin).
   Mit Einladungscode: ein neuer Nutzer. Eine offene Registrierung gibt es nicht. */
export async function setup(env: Env, body: any) {
  const inviteCode = normCode(body.invite);
  // Einrichtungscode (Secret SETUP_CODE): verbindet ein Gerät mit Nutzer 1, auch wenn schon Geräte da sind (Admin-Zugang).
  if (body.setupCode != null && String(body.setupCode).trim()) {
    await guardAttempts(env);
    const want = String(env.SETUP_CODE || '').trim();
    if (!want || !(await sameSecret(String(body.setupCode).trim(), want))) { await failedAttempt(env); throw new HttpError(403, 'Der Einrichtungscode stimmt nicht.'); }
    await env.DB.prepare("INSERT OR IGNORE INTO users (id, name, role, features, created_at) VALUES (1, '', 'admin', '{}', ?)").bind(Date.now()).run();
    const d = await createDevice(env, 1, body.name);
    return { deviceId: d.id, token: d.token, userId: 1, time: Date.now() };
  }
  if (!inviteCode) {
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM devices').first();
    if (n && n.n > 0) throw new HttpError(409, 'Der Server ist schon eingerichtet. Kopple dieses Gerät mit einem Code oder nutze eine Einladung.');
    if (env.SETUP_CODE) throw new HttpError(403, 'Für die erste Einrichtung braucht dieser Server den Einrichtungscode.');
    await env.DB.prepare("INSERT OR IGNORE INTO users (id, name, role, features, created_at) VALUES (1, '', 'admin', '{}', ?)").bind(Date.now()).run();
    const d = await createDevice(env, 1, body.name);
    return { deviceId: d.id, token: d.token, userId: 1, time: Date.now() };
  }
  await guardAttempts(env);
  const row = inviteCode.length === 8 ? await env.DB.prepare('SELECT code_hash, expires_at, used_by, created_by, test FROM invites WHERE code_hash = ?').bind(await sha256(inviteCode)).first() : null;
  if (!row || row.used_by || row.expires_at < Date.now()) {
    await failedAttempt(env);
    throw new HttpError(403, 'Die Einladung stimmt nicht, ist abgelaufen oder wurde schon benutzt.');
  }
  const res = await env.DB.prepare("INSERT INTO users (name, role, features, invited_by, created_at, test) VALUES (?, 'user', '{}', ?, ?, ?)").bind(cleanName(body.userName), row.created_by, Date.now(), row.test ? 1 : 0).run();
  const uid = res.meta.last_row_id;
  await env.DB.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE code_hash = ?').bind(uid, Date.now(), row.code_hash).run();
  const d = await createDevice(env, uid, body.name);
  return { deviceId: d.id, token: d.token, userId: uid, time: Date.now(), newUser: true };
}

export async function createPairCode(env: Env, a: Auth) {
  const code = newCode();
  const expires = Date.now() + PAIR_TTL_MS;
  await env.DB.prepare('DELETE FROM pair_codes WHERE expires_at < ?').bind(Date.now()).run();
  await env.DB.prepare('INSERT INTO pair_codes (code_hash, created_by, expires_at, user_id) VALUES (?, ?, ?, ?)').bind(await sha256(normCode(code)), a.deviceId, expires, a.uid).run();
  return { code, expiresAt: expires };
}
export async function redeemPairCode(env: Env, body: any) {
  await guardAttempts(env);
  const code = normCode(body.code);
  const row = code.length === 8 ? await env.DB.prepare('SELECT code_hash, expires_at, user_id FROM pair_codes WHERE code_hash = ?').bind(await sha256(code)).first() : null;
  if (!row || row.expires_at < Date.now()) {
    await failedAttempt(env);
    throw new HttpError(403, 'Der Code stimmt nicht oder ist abgelaufen.');
  }
  await env.DB.prepare('DELETE FROM pair_codes WHERE code_hash = ?').bind(row.code_hash).run();
  const d = await createDevice(env, row.user_id, body.name);
  return { deviceId: d.id, token: d.token, userId: row.user_id, time: Date.now() };
}

/* Einladungen: nur der Admin */
export async function createInvite(env: Env, a: Auth, note: unknown, test = false) {
  if (a.role !== 'admin') throw new HttpError(403, 'Nur der Admin kann Einladungen erzeugen.');
  const code = newCode();
  const expires = Date.now() + INVITE_TTL_MS;
  await env.DB.prepare('INSERT INTO invites (code_hash, created_by, note, created_at, expires_at, test) VALUES (?, ?, ?, ?, ?, ?)').bind(await sha256(normCode(code)), a.uid, cleanName(note, 60), Date.now(), expires, test ? 1 : 0).run();
  return { code, expiresAt: expires };
}
export async function listInvites(env: Env, a: Auth) {
  if (a.role !== 'admin') throw new HttpError(403, 'Nur der Admin sieht Einladungen.');
  const rows = await env.DB.prepare('SELECT note, created_at, expires_at, used_by, used_at, test FROM invites WHERE created_by = ? ORDER BY created_at DESC LIMIT 50').bind(a.uid).all();
  return { invites: (rows.results || []).map((r: any) => ({ note: r.note, createdAt: r.created_at, expiresAt: r.expires_at, used: !!r.used_by, usedAt: r.used_at, test: !!r.test, userId: r.used_by || null })) };
}
