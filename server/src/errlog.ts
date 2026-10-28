/* Fehlerprotokoll: kurze Meldungen ohne Gesundheitsdaten. Zahlen und Adressen werden entfernt. */
import type { Env } from './store';

const MAX_ROWS = 500;
export function scrub(s: unknown, n?: number): string {
  return String(s == null ? '' : s)
    .replace(/https?:\/\/\S+/gi, '<url>')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]+/gi, '$1 <secret>')
    .replace(/(["']?\b(?:api[ _-]?key|access[ _-]?token|refresh[ _-]?token|client[ _-]?secret|token|secret|password|authorization)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1<secret>')
    .replace(/\b\d{2,}(?:[.,]\d+)?\b/g, '#').replace(/[\u0000-\u001f]/g, ' ').slice(0, n || 300);
}
export async function logError(env: Env, source: string, msg: unknown, place?: unknown, extra?: { version?: unknown; view?: unknown; uid?: number | null }): Promise<void> {
  try {
    await env.DB.prepare('INSERT INTO error_log (at, source, msg, place, version, view, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(Date.now(), source, scrub(msg), scrub(place, 160), scrub((extra && extra.version) || '', 40), scrub((extra && extra.view) || '', 40), (extra && extra.uid) || null).run();
    await env.DB.prepare('DELETE FROM error_log WHERE id <= (SELECT MAX(id) FROM error_log) - ?').bind(MAX_ROWS).run();
  } catch (e) { /* Protokoll darf nie selbst Fehler werfen */ }
}
export async function recentErrors(env: Env, uid: number | null, limit?: number): Promise<any[]> {
  const rows = uid == null
    ? await env.DB.prepare('SELECT at, source, msg, place, version, view FROM error_log ORDER BY id DESC LIMIT ?').bind(limit || 50).all()
    : await env.DB.prepare('SELECT at, source, msg, place, version, view FROM error_log WHERE user_id = ? ORDER BY id DESC LIMIT ?').bind(uid, limit || 50).all();
  return rows.results || [];
}
