/* Gemeinsame Datenbank-Hilfen (D1). */

export function berlinDate(ts) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts == null ? Date.now() : ts));
}
export function berlinParts(ts) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(new Date(ts == null ? Date.now() : ts));
  const get = t => (parts.find(p => p.type === t) || {}).value;
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { date: berlinDate(ts), hour: parseInt(get('hour'), 10), minute: parseInt(get('minute'), 10), dow };
}
export function addDaysStr(s, n) {
  const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function getRecord(env, kind, key) {
  const r = await env.DB.prepare('SELECT data, updated_at FROM records WHERE kind = ? AND key = ? AND deleted = 0').bind(kind, key).first();
  return r ? { data: JSON.parse(r.data), updatedAt: r.updated_at } : null;
}
/* Liefert { key: data } für die angegebenen Schlüssel (oder alle, wenn keys fehlt). */
export async function getRecords(env, kind, keys) {
  const out = {};
  if (!keys) {
    const rows = await env.DB.prepare('SELECT key, data FROM records WHERE kind = ? AND deleted = 0').bind(kind).all();
    (rows.results || []).forEach(r => { out[r.key] = JSON.parse(r.data); });
    return out;
  }
  const uniq = [...new Set(keys.filter(k => k != null).map(String))];
  for (let i = 0; i < uniq.length; i += 80) {
    const chunk = uniq.slice(i, i + 80);
    const rows = await env.DB.prepare(`SELECT key, data FROM records WHERE kind = ? AND deleted = 0 AND key IN (${chunk.map(() => '?').join(',')})`)
      .bind(kind, ...chunk).all();
    (rows.results || []).forEach(r => { out[r.key] = JSON.parse(r.data); });
  }
  return out;
}

/* Schreibt Datensätze. Die neueste Änderung pro Datensatz gewinnt (updatedAt). */
export async function putRecords(env, changes) {
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

export async function getMeta(env, k) {
  const r = await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind(k).first();
  if (!r) return null;
  try { return JSON.parse(r.v); } catch (e) { return r.v; }
}
export async function setMeta(env, k, v) {
  await env.DB.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v').bind(k, JSON.stringify(v)).run();
}
