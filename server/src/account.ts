/* Konto (Auftrag 5 E): „Meine Daten als Datei“, „Konto löschen“ (alle Daten sofort, Server-Backups nach 30 Tagen),
   Wiederherstellungscode (ein verlorenes Gerät kostet nicht das Konto). Nur Hashes von Codes werden gespeichert. */
import { type Env } from './store';
import type { Auth } from './auth';
import { createDevice, guardAttempts, failedAttempt } from './auth';
import { HttpError, readJson, randomToken, sha256, cleanName } from './http';

export const BACKUP_PURGE_DAYS = 30;
const RC_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newRecoveryCode(): string {
  const r = crypto.getRandomValues(new Uint8Array(16));
  const c = [...r].map(x => RC_ALPHABET[x % RC_ALPHABET.length]).join('');
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}-${c.slice(12, 16)}`;
}
const normRc = (c: unknown) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/* Neuer Code (ersetzt den alten). Wird genau einmal angezeigt. */
export async function makeRecovery(env: Env, uid: number): Promise<string> {
  const code = newRecoveryCode();
  await env.DB.prepare('INSERT INTO recovery (user_id, code_hash, created_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET code_hash = excluded.code_hash, created_at = excluded.created_at')
    .bind(uid, await sha256('rc:' + normRc(code)), Date.now()).run();
  return code;
}
/* Ohne Anmeldung: mit dem Code ein neues Gerät für das eigene Konto */
export async function recover(env: Env, body: any) {
  await guardAttempts(env);
  const code = normRc(body.code);
  const row = code.length === 16 ? await env.DB.prepare('SELECT user_id FROM recovery WHERE code_hash = ?').bind(await sha256('rc:' + code)).first() : null;
  if (!row) { await failedAttempt(env); throw new HttpError(403, 'Der Wiederherstellungscode stimmt nicht.'); }
  const uid = (row as any).user_id;
  const d = await createDevice(env, uid, cleanName(body.name) || 'Neues Gerät');
  return { deviceId: d.id, token: d.token, userId: uid, time: Date.now(), recovered: true };
}

/* Alle Daten des Nutzers auf dem Server (keine anderer Nutzer, keine Schlüssel) */
export async function exportAll(env: Env, uid: number) {
  const recs = await env.DB.prepare('SELECT kind, key, data, updated_at FROM records WHERE user_id = ? AND deleted = 0 ORDER BY kind, key').bind(uid).all();
  const fb = await env.DB.prepare('SELECT at, kind, text, status, reply, reply_at FROM feedback WHERE user_id = ? ORDER BY at').bind(uid).all();
  const dev = await env.DB.prepare('SELECT name, created_at, last_seen FROM devices WHERE user_id = ?').bind(uid).all();
  const con = await env.DB.prepare('SELECT provider, status, created_at FROM connections WHERE user_id = ?').bind(uid).all().catch(() => ({ results: [] }));
  const u = await env.DB.prepare('SELECT name, created_at FROM users WHERE id = ?').bind(uid).first();
  return {
    format: 'stamio-export', version: 1, exportedAt: new Date().toISOString(), user: { name: u ? (u as any).name : '', createdAt: u ? (u as any).created_at : null },
    records: (recs.results || []).map((r: any) => ({ kind: r.kind, key: r.key, updatedAt: r.updated_at, data: JSON.parse(r.data) })),
    feedback: fb.results || [], devices: dev.results || [], connections: (con as any).results || []
  };
}
/* Konto löschen: sofort alles außer den nächtlichen Server-Backups; die werden nach 30 Tagen endgültig entfernt */
export async function deleteAccount(env: Env, uid: number): Promise<{ purgeAfter: number }> {
  for (const tbl of ['records', 'connections', 'ingest_keys', 'blobs', 'push_log', 'push_queue', 'push_subs', 'ai_usage', 'oauth_states', 'user_meta', 'devices', 'pair_codes', 'feedback', 'recovery']) await env.DB.prepare('DELETE FROM ' + tbl + ' WHERE user_id = ?').bind(uid).run();
  await env.DB.prepare('UPDATE error_log SET user_id = NULL WHERE user_id = ?').bind(uid).run();
  await env.DB.prepare("DELETE FROM users WHERE id = ? AND role <> 'admin'").bind(uid).run();
  const purgeAfter = Date.now() + BACKUP_PURGE_DAYS * 86400000;
  await env.DB.prepare('INSERT INTO deleted_users (user_id, deleted_at, purge_after) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET purge_after = excluded.purge_after').bind(uid, Date.now(), purgeAfter).run();
  return { purgeAfter };
}
/* Nachts: Backups gelöschter Konten nach Ablauf der Frist entfernen */
export async function purgeDeleted(env: Env, now = Date.now()): Promise<number> {
  const rows = await env.DB.prepare('SELECT user_id FROM deleted_users WHERE purge_after < ?').bind(now).all();
  for (const r of rows.results || []) {
    await env.DB.prepare('DELETE FROM backups WHERE user_id = ?').bind((r as any).user_id).run();
    await env.DB.prepare('DELETE FROM deleted_users WHERE user_id = ?').bind((r as any).user_id).run();
  }
  return (rows.results || []).length;
}

export async function accountRoutes(req: Request, env: Env, p: string, a: Auth): Promise<any> {
  const M = req.method;
  if (p === '/api/me/export' && M === 'GET') return exportAll(env, a.uid);
  if (p === '/api/me' && M === 'DELETE') {
    const b = await readJson(req);
    if (String(b.confirm || '').trim().toUpperCase() !== 'LÖSCHEN') throw new HttpError(400, 'Zur Sicherheit bitte „LÖSCHEN“ eintippen.');
    if (a.role === 'admin') throw new HttpError(400, 'Das Betreiber-Konto kann hier nicht gelöscht werden.');
    return { ok: true, ...(await deleteAccount(env, a.uid)) };
  }
  if (p === '/api/recovery' && M === 'POST') return { code: await makeRecovery(env, a.uid) };
  if (p === '/api/recovery' && M === 'GET') { const r = await env.DB.prepare('SELECT created_at FROM recovery WHERE user_id = ?').bind(a.uid).first(); return { exists: !!r, createdAt: r ? (r as any).created_at : null }; }
  return undefined;
}
void randomToken;
