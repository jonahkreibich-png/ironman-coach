import { entitlements, type Entitlements } from '../../shared/features';
/* Datenbank-Hilfen (D1). Alles ist pro Nutzer (user_id) getrennt. */

export interface Env {
  DB: any;
  ALLOWED_ORIGINS?: string;
  PUBLIC_URL?: string;
  ENVIRONMENT?: string;
  ALLOW_TEST_ROUTES?: string;
  TOKEN_KEY?: string;
  VAPID_PRIVATE_JWK?: string;
  VAPID_SUBJECT?: string;
  INTERVALS_BASE?: string;
  INTERVALS_API_KEY?: string;
  INTERVALS_ATHLETE_ID?: string;
  [k: string]: any;
}

export function berlinDate(ts?: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts == null ? Date.now() : ts));
}
export interface BerlinParts { date: string; hour: number; minute: number; dow: number }
export function berlinParts(ts?: number): BerlinParts {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(new Date(ts == null ? Date.now() : ts));
  const get = (t: string) => (parts.find(p => p.type === t) || ({} as any)).value;
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { date: berlinDate(ts), hour: parseInt(get('hour'), 10), minute: parseInt(get('minute'), 10), dow };
}
export function addDaysStr(s: string, n: number): string {
  const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function getRecord(env: Env, uid: number, kind: string, key: string): Promise<{ data: any; updatedAt: number } | null> {
  const r = await env.DB.prepare('SELECT data, updated_at FROM records WHERE user_id = ? AND kind = ? AND key = ? AND deleted = 0').bind(uid, kind, key).first();
  return r ? { data: JSON.parse(r.data), updatedAt: r.updated_at } : null;
}
/* Liefert { key: data } für die angegebenen Schlüssel (oder alle, wenn keys fehlt). */
export async function getRecords(env: Env, uid: number, kind: string, keys?: (string | null | undefined)[]): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  if (!keys) {
    const rows = await env.DB.prepare('SELECT key, data FROM records WHERE user_id = ? AND kind = ? AND deleted = 0').bind(uid, kind).all();
    (rows.results || []).forEach((r: any) => { out[r.key] = JSON.parse(r.data); });
    return out;
  }
  const uniq = [...new Set(keys.filter(k => k != null).map(String))];
  for (let i = 0; i < uniq.length; i += 80) {
    const chunk = uniq.slice(i, i + 80);
    const rows = await env.DB.prepare(`SELECT key, data FROM records WHERE user_id = ? AND kind = ? AND deleted = 0 AND key IN (${chunk.map(() => '?').join(',')})`)
      .bind(uid, kind, ...chunk).all();
    (rows.results || []).forEach((r: any) => { out[r.key] = JSON.parse(r.data); });
  }
  return out;
}

/** Vorhandene revisionsbasierte Datenhaltung: inklusive Tombstones, pro Nutzer. */
export async function recordsRevision(env: Env, uid: number): Promise<number> {
  const row = await env.DB.prepare('SELECT COALESCE(MAX(rev),0) AS rev FROM records WHERE user_id = ?').bind(uid).first();
  return Number(row?.rev || 0);
}
export class RecordsChangedError extends Error {
  constructor() { super('Records changed during analysis'); this.name = 'RecordsChangedError'; }
}
export interface Change { kind: string; key: string; data?: any; updatedAt: number; deleted?: boolean }
/* Schreibt Datensätze. Die neueste Änderung pro Datensatz gewinnt (updatedAt). */
export async function putRecords(env: Env, uid: number, changes: Change[], expectedRevision?: number): Promise<void> {
  const stmts: any[] = [];
  // Im selben atomaren Batch pruefen. Der vorhandene PK 'rev' ist garantiert belegt;
  // bei Konflikt bricht sein INSERT den gesamten Batch ab, bevor ein Write erfolgt.
  // Ein separater SELECT vor batch() liesse wieder eine Read/Write-Luecke offen.
  if (expectedRevision !== undefined) stmts.push(env.DB.prepare(
    "INSERT INTO meta(k,v) SELECT 'rev','0' WHERE COALESCE((SELECT MAX(rev) FROM records WHERE user_id = ?),0) <> ?"
  ).bind(uid, expectedRevision));
  for (const c of changes) {
    stmts.push(env.DB.prepare("UPDATE meta SET v = CAST(v AS INTEGER) + 1 WHERE k = 'rev'"));
    stmts.push(env.DB.prepare(
      `INSERT INTO records (user_id, kind, key, data, updated_at, deleted, rev)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, (SELECT CAST(v AS INTEGER) FROM meta WHERE k = 'rev'))
       ON CONFLICT (user_id, kind, key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted, rev = excluded.rev
       WHERE excluded.updated_at > records.updated_at`
    ).bind(uid, c.kind, c.key, c.deleted ? null : JSON.stringify(c.data), Math.round(c.updatedAt), c.deleted ? 1 : 0));
  }
  // Auftrag 21: ändert sich eine Einheit/Aufzeichnung, steigt der Datenstand-Zähler des Nutzers (statt bei jedem Zeitplan alle Datensätze zu zählen)
  if (changes.some(c => c.kind === 'session' || c.kind === 'custom' || c.kind === 'activity')) stmts.push(env.DB.prepare(
    "INSERT INTO user_meta (user_id, k, v) VALUES (?, 'data_rev', '1') ON CONFLICT (user_id, k) DO UPDATE SET v = CAST(CAST(v AS INTEGER) + 1 AS TEXT)").bind(uid));
  // Ein Batch ist eine D1-Transaktion: Aenderungen und Revisionen muessen
  // auch oberhalb von 100 Datensaetzen bei einem Fehler gemeinsam zurueckrollen.
  if (stmts.length) try { await env.DB.batch(stmts); }
  catch (e) {
    const message = String(e) + ' ' + String((e as any)?.cause || '');
    if (expectedRevision !== undefined && /UNIQUE constraint failed: meta\.k/i.test(message)) throw new RecordsChangedError();
    throw e;
  }
}

/* Auftrag 18: Datensatz erneut ausliefern (neue Revision), z. B. wenn eine Änderung eines alten Geräts nicht angenommen wurde */
export async function touchRecord(env: Env, uid: number, kind: string, key: string): Promise<void> {
  await env.DB.batch([env.DB.prepare("UPDATE meta SET v = CAST(v AS INTEGER) + 1 WHERE k = 'rev'"),
    env.DB.prepare("UPDATE records SET rev = (SELECT CAST(v AS INTEGER) FROM meta WHERE k = 'rev') WHERE user_id = ? AND kind = ? AND key = ?").bind(uid, kind, key)]);
}
/* Versionen vergleichen („3.4.0“ < „3.5.0“); unbekannt gilt als alt */
export function cmpVersion(a: string, b: string): number {
  const p = (v: string) => String(v || '0').split(/[.+-]/).slice(0, 3).map(x => parseInt(x, 10) || 0);
  const x = p(a), y = p(b);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}
/* Auftrag 18: Nach einem Einspielen durch den Betreiber (user_meta min_client_version = { version, kinds }) nimmt der Server Änderungen
   dieser Arten nur noch von Geräten mit mindestens dieser App-Version an. Ältere Geräte bekommen stattdessen den Stand vom Server. */
export function gateChanges<T extends { kind: string }>(changes: T[], gate: any, clientVersion: string): { keep: T[]; dropped: T[] } {
  if (!gate || !gate.version || cmpVersion(clientVersion, gate.version) >= 0) return { keep: changes, dropped: [] };
  const kinds = new Set<string>(Array.isArray(gate.kinds) && gate.kinds.length ? gate.kinds : ['plan', 'profile']);
  return { keep: changes.filter(c => !kinds.has(c.kind)), dropped: changes.filter(c => kinds.has(c.kind)) };
}
export async function getMeta(env: Env, uid: number, k: string): Promise<any> {
  const r = await env.DB.prepare('SELECT v FROM user_meta WHERE user_id = ? AND k = ?').bind(uid, k).first();
  if (!r) return null;
  try { return JSON.parse(r.v); } catch (e) { return r.v; }
}
export async function setMeta(env: Env, uid: number, k: string, v: any): Promise<void> {
  await env.DB.prepare('INSERT INTO user_meta (user_id, k, v) VALUES (?, ?, ?) ON CONFLICT (user_id, k) DO UPDATE SET v = excluded.v').bind(uid, k, JSON.stringify(v)).run();
}

/* Alle Nutzer mit mindestens einem Gerät (für Zeitpläne) */
export async function activeUsers(env: Env): Promise<number[]> {
  const rows = await env.DB.prepare('SELECT DISTINCT user_id FROM devices').all();
  return (rows.results || []).map((r: any) => r.user_id);
}

export async function userEntitlements(env: Env, uid: number): Promise<Entitlements> {
  const r = await env.DB.prepare('SELECT role, features FROM users WHERE id = ?').bind(uid).first();
  let f: any = {}; try { f = r ? JSON.parse(r.features || '{}') : {}; } catch (e) {}
  return entitlements(r ? r.role : null, f);
}
export async function userFeatures(env: Env, uid: number): Promise<Record<string, any>> {
  const r = await env.DB.prepare('SELECT features FROM users WHERE id = ?').bind(uid).first();
  try { return r ? JSON.parse(r.features || '{}') : {}; } catch (e) { return {}; }
}
