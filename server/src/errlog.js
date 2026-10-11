/* Fehlerprotokoll: kurze Meldungen ohne Gesundheitsdaten. Zahlen und Adressen werden entfernt. */
const MAX_ROWS = 500;
export function scrub(s, n) {
  return String(s == null ? '' : s).replace(/https?:\/\/\S+/g, '<url>').replace(/\b\d{2,}(?:[.,]\d+)?\b/g, '#').replace(/[\u0000-\u001f]/g, ' ').slice(0, n || 300);
}
export async function logError(env, source, msg, place, extra) {
  try {
    await env.DB.prepare('INSERT INTO error_log (at, source, msg, place, version, view) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(Date.now(), source, scrub(msg), scrub(place, 160), scrub((extra && extra.version) || '', 40), scrub((extra && extra.view) || '', 40)).run();
    await env.DB.prepare('DELETE FROM error_log WHERE id <= (SELECT MAX(id) FROM error_log) - ?').bind(MAX_ROWS).run();
  } catch (e) { /* Protokoll darf nie selbst Fehler werfen */ }
}
export async function recentErrors(env, limit) {
  const rows = await env.DB.prepare('SELECT at, source, msg, place, version, view FROM error_log ORDER BY id DESC LIMIT ?').bind(limit || 50).all();
  return rows.results || [];
}
