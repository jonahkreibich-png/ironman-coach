import { entitlements, FEATURE_KEYS } from '../../shared/features';
/* Server: Geräte-Login, Datensatz-Sync, Backup, Datenabruf, Coach, Mitteilungen.
   Mehrere Nutzer, aber keine offene Registrierung: neue Nutzer nur mit Einladungscode.
   Geheimnisse nur über env (Cloudflare-Secrets). */
import { type Env, berlinDate, berlinParts, putRecords, getMeta, setMeta, activeUsers, type Change } from './store';
import { HttpError, json, corsHeaders, readJson } from './http';
import { type Auth, authDevice, setup, createPairCode, redeemPairCode, createInvite, listInvites } from './auth';
import { runImport, intervalsCreds } from './intervals';
import { runDaily, runWeekly, loadState } from './coach';
import { notifyTick, queueAfterImport, queueAdjustments, queueAchievements, checkAchievements, deliver } from './notify';
import { vapidPublicKey } from './webpush';
import { logError, recentErrors, scrub } from './errlog';
import { extraRoutes, publicRoutes, scheduledExtras, onRecordsChanged } from './extensions';
import { BRAND } from '../../shared/brand';
import { feedbackRoutes } from './feedback';
import { accountRoutes, makeRecovery, recover, purgeDeleted } from './account';
import { SYNC_KINDS } from '../../shared/kinds';

const KINDS = new Set(SYNC_KINDS);
const BACKUP_KEEP_DAYS = 30;

/* ---------- Sync ---------- */
function validChange(c: any): boolean {
  return c && KINDS.has(c.kind) && typeof c.key === 'string' && c.key.length > 0 && c.key.length <= 200 &&
    Number.isFinite(c.updatedAt) && c.updatedAt > 0 && (c.deleted ? true : c.data !== undefined);
}
async function changesSince(env: Env, uid: number, since: number, limit: number) {
  const rows = await env.DB.prepare('SELECT kind, key, data, updated_at, deleted, rev FROM records WHERE user_id = ? AND rev > ? ORDER BY rev LIMIT ?')
    .bind(uid, since, limit + 1).all();
  const list = rows.results || [];
  const more = list.length > limit;
  const page = more ? list.slice(0, limit) : list;
  return {
    more,
    cursor: page.length ? page[page.length - 1].rev : since,
    records: page.map((r: any) => ({ kind: r.kind, key: r.key, data: r.deleted ? null : JSON.parse(r.data), updatedAt: r.updated_at, deleted: !!r.deleted }))
  };
}

/* ---------- Test-Nutzer zurücksetzen oder löschen (nur Betreiber) ---------- */
/* Zurücksetzen: alle Datensätze als gelöscht markieren (die Geräte löschen sie beim nächsten Sync), Verbindungen und Schlüssel
   entfernen, Zeitpunkt merken. Die Geräte bleiben angemeldet und starten danach mit dem Fragebogen. */
export async function resetUser(env: Env, uid: number): Promise<number> {
  const rows = await env.DB.prepare('SELECT kind, key FROM records WHERE user_id = ? AND deleted = 0').bind(uid).all();
  const t = Date.now();
  const changes: Change[] = (rows.results || []).map((r: any, i: number) => ({ kind: r.kind, key: r.key, deleted: true, updatedAt: t + i }));
  if (changes.length) await putRecords(env, uid, changes);
  for (const tbl of ['connections', 'ingest_keys', 'blobs', 'backups', 'push_log', 'push_queue', 'ai_usage', 'oauth_states']) await env.DB.prepare('DELETE FROM ' + tbl + ' WHERE user_id = ?').bind(uid).run();
  await env.DB.prepare("DELETE FROM user_meta WHERE user_id = ? AND k <> 'reset_at'").bind(uid).run();
  await setMeta(env, uid, 'reset_at', t);
  return changes.length;
}
export async function deleteUser(env: Env, uid: number): Promise<void> {
  for (const tbl of ['records', 'connections', 'ingest_keys', 'blobs', 'backups', 'push_log', 'push_queue', 'push_subs', 'ai_usage', 'oauth_states', 'user_meta', 'devices', 'pair_codes', 'feedback']) await env.DB.prepare('DELETE FROM ' + tbl + ' WHERE user_id = ?').bind(uid).run();
  await env.DB.prepare("DELETE FROM users WHERE id = ? AND role <> 'admin'").bind(uid).run();
}

/* ---------- Backup ---------- */
export async function dailyBackup(env: Env, uid: number) {
  const day = berlinDate();
  const rows = await env.DB.prepare('SELECT kind, key, data, updated_at FROM records WHERE user_id = ? AND deleted = 0').bind(uid).all();
  const records = (rows.results || []).map((r: any) => ({ kind: r.kind, key: r.key, data: JSON.parse(r.data), updatedAt: r.updated_at }));
  if (!records.length) return { day, count: 0 };
  await env.DB.prepare('INSERT OR REPLACE INTO backups (user_id, day, created_at, data) VALUES (?, ?, ?, ?)').bind(uid, day, Date.now(), JSON.stringify(records)).run();
  const cutoff = berlinDate(Date.now() - BACKUP_KEEP_DAYS * 86400000);
  await env.DB.prepare('DELETE FROM backups WHERE user_id = ? AND day < ?').bind(uid, cutoff).run();
  return { day, count: records.length };
}
async function nightly(env: Env) {
  for (const uid of await activeUsers(env)) { try { await dailyBackup(env, uid); } catch (e) { await logError(env, 'server', (e as Error).message, 'backup', { uid }); } }
  await env.DB.prepare('DELETE FROM pair_codes WHERE expires_at < ?').bind(Date.now()).run();
  await env.DB.prepare('DELETE FROM pair_attempts WHERE ts < ?').bind(Date.now() - 86400000).run();
  await env.DB.prepare('DELETE FROM push_log WHERE day < ?').bind(berlinDate(Date.now() - 14 * 86400000)).run();
  await env.DB.prepare('DELETE FROM oauth_states WHERE created_at < ?').bind(Date.now() - 3600000).run();
  await purgeDeleted(env);
}

/* ---------- Routen ---------- */
async function route(req: Request, env: Env, url: URL, ctx: any): Promise<any> {
  const p = url.pathname.replace(/\/+$/, '');
  const M = req.method;

  if (p === '/api/health' && M === 'GET') {
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM devices').first();
    return { ok: true, setup: (n && n.n) > 0, time: Date.now(), app: BRAND.name, env: env.ENVIRONMENT || 'production' };
  }
  // Öffentlicher VAPID-Schlüssel (kein Geheimnis)
  if (p === '/api/push/key' && M === 'GET') {
    if (!env.VAPID_PRIVATE_JWK) throw new HttpError(503, 'Mitteilungen sind auf dem Server noch nicht eingerichtet.');
    return { key: vapidPublicKey(env) };
  }
  if (p === '/api/setup' && M === 'POST') {
    const r: any = await setup(env, await readJson(req));
    // Neues Konto: Wiederherstellungscode gleich mitgeben (wird einmal angezeigt)
    if (r.newUser || !(await env.DB.prepare('SELECT 1 FROM recovery WHERE user_id = ?').bind(r.userId).first())) r.recoveryCode = await makeRecovery(env, r.userId);
    return r;
  }
  if (p === '/api/recover' && M === 'POST') return await recover(env, await readJson(req));
  if (p === '/api/pair/redeem' && M === 'POST') return await redeemPairCode(env, await readJson(req));

  // Öffentliche Routen der Erweiterungen (OAuth-Rückkehr, Webhooks, Kurzbefehl mit eigenem Schlüssel)
  const pub = await publicRoutes(req, env, url, p, ctx);
  if (pub !== undefined) return pub;

  // Ab hier nur mit Geräte-Schlüssel
  const a: Auth = await authDevice(req, env);
  const uid = a.uid;

  if (p === '/api/me' && M === 'GET') {
    const u = await env.DB.prepare('SELECT name, role, features, test FROM users WHERE id = ?').bind(uid).first();
    const features = JSON.parse((u && u.features) || '{}');
    // Posteingang: neue Meldungen (Betreiber) bzw. ungelesene Antworten (Nutzer)
    const fbNew = a.role === 'admin' ? await env.DB.prepare("SELECT COUNT(*) AS n FROM feedback WHERE status = 'neu'").first() : null;
    const fbRep = await env.DB.prepare('SELECT COUNT(*) AS n FROM feedback WHERE user_id = ? AND reply IS NOT NULL AND reply_seen = 0').bind(uid).first();
    return { deviceId: a.deviceId, name: a.deviceName, userId: uid, role: a.role, test: !!(u && u.test), features, entitlements: entitlements(a.role, features), resetAt: (await getMeta(env, uid, 'reset_at')) || null, feedbackNew: fbNew ? fbNew.n : 0, repliesUnseen: fbRep ? fbRep.n : 0, time: Date.now() };
  }
  // Abmelden: dieses Gerät entfernen (Nutzerwechsel auf dem Gerät)
  if (p === '/api/devices/self/logout' && M === 'POST') {
    await env.DB.prepare('DELETE FROM push_subs WHERE device_id = ?').bind(a.deviceId).run();
    await env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(a.deviceId).run();
    return { ok: true };
  }
  // „Fehler melden / Idee“ und Posteingang des Betreibers (server/src/feedback.ts)
  const fbr = await feedbackRoutes(req, env, p, a);
  if (fbr !== undefined) return fbr;
  const acc = await accountRoutes(req, env, p, a);
  if (acc !== undefined) return acc;
  // Fehlerprotokoll der App (ohne Gesundheitsdaten)
  if (p === '/api/log' && M === 'POST') {
    const body = await readJson(req);
    const list = Array.isArray(body.errors) ? body.errors.slice(0, 10) : [];
    for (const e of list) await logError(env, 'app', e && e.msg, e && e.where, { version: e && e.version, view: e && e.view, uid });
    return { ok: true, logged: list.length };
  }
  if (p === '/api/log' && M === 'GET') return { errors: await recentErrors(env, a.role === 'admin' ? null : uid, 50) };

  if (p === '/api/pair/create' && M === 'POST') return await createPairCode(env, a);
  if (p === '/api/invites' && M === 'POST') return await createInvite(env, a, (await readJson(req)).note);
  if (p === '/api/invites' && M === 'GET') return await listInvites(env, a);
  // Admin: Nutzer und ihre Freischaltungen (Tester kostenlos freischalten; später ersetzt ein Kauf das)
  if (p.startsWith('/api/admin/')) {
    if (a.role !== 'admin') throw new HttpError(403, 'Nur der Betreiber darf das.');
    if (p === '/api/admin/users' && M === 'GET') {
      const rows = await env.DB.prepare('SELECT u.id, u.name, u.role, u.features, u.created_at, u.test, (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id) AS devices, (SELECT MAX(last_seen) FROM devices d WHERE d.user_id = u.id) AS last_seen, (SELECT version FROM devices d WHERE d.user_id = u.id ORDER BY last_seen DESC LIMIT 1) AS version, (SELECT COUNT(*) FROM feedback f WHERE f.user_id = u.id) AS reports FROM users u ORDER BY u.id').all();
      return { users: (rows.results || []).map((r: any) => { const f = JSON.parse(r.features || '{}'); return { id: r.id, name: r.name, role: r.role, test: !!r.test, devices: r.devices, lastSeen: r.last_seen || null, version: r.version || null, reports: r.reports || 0, features: f, entitlements: entitlements(r.role, f), createdAt: r.created_at, self: r.id === uid }; }) };
    }
    // Test-Nutzer: Einladung erzeugen (der Tester richtet sich damit selbst ein)
    if (p === '/api/admin/testusers' && M === 'POST') return await createInvite(env, a, (await readJson(req)).note || 'Test-Nutzer', true);
    const um = /^\/api\/admin\/users\/(\d+)(?:\/(reset))?$/.exec(p);
    if (um) {
      const target = +um[1];
      if (target === uid || target === 1) throw new HttpError(400, 'Das eigene Konto kann hier nicht zurückgesetzt oder gelöscht werden.');
      if (um[2] === 'reset' && M === 'POST') return { ok: true, removed: await resetUser(env, target) };
      if (!um[2] && M === 'DELETE') { await deleteUser(env, target); return { ok: true }; }
    }
    const fm = /^\/api\/admin\/users\/(\d+)\/features$/.exec(p);
    if (fm && M === 'POST') {
      const body = await readJson(req); const next: Record<string, boolean> = {};
      for (const k of FEATURE_KEYS) if (body.features && body.features[k] === true) next[k] = true;
      await env.DB.prepare('UPDATE users SET features = ? WHERE id = ?').bind(JSON.stringify(next), +fm[1]).run();
      return { ok: true, features: next };
    }
  }

  if (p === '/api/devices' && M === 'GET') {
    const rows = await env.DB.prepare('SELECT id, name, created_at, last_seen FROM devices WHERE user_id = ? ORDER BY created_at').bind(uid).all();
    return { devices: (rows.results || []).map((r: any) => ({ id: r.id, name: r.name, createdAt: r.created_at, lastSeen: r.last_seen, self: r.id === a.deviceId })) };
  }
  const delDev = /^\/api\/devices\/([A-Za-z0-9_-]+)$/.exec(p);
  if (delDev && M === 'DELETE') {
    if (delDev[1] === a.deviceId) throw new HttpError(400, 'Dieses Gerät kann sich nicht selbst entfernen.');
    await env.DB.prepare('DELETE FROM devices WHERE id = ? AND user_id = ?').bind(delDev[1], uid).run();
    await env.DB.prepare('DELETE FROM push_subs WHERE device_id = ? AND user_id = ?').bind(delDev[1], uid).run();
    return { ok: true };
  }

  // Sync: Änderungen hochladen und alles Neue seit cursor zurückgeben
  if (p === '/api/sync' && M === 'POST') {
    const body = await readJson(req);
    const changes: Change[] = Array.isArray(body.changes) ? body.changes : [];
    if (changes.length > 5000) throw new HttpError(413, 'Zu viele Änderungen auf einmal');
    const bad = changes.find(c => !validChange(c));
    if (bad) throw new HttpError(400, 'Ungültiger Datensatz: ' + String(bad && (bad as any).kind) + '/' + String(bad && (bad as any).key));
    if (changes.length) {
      await putRecords(env, uid, changes);
      // Neue Daten (Einheit, Nachtwerte, Notiz, Essen …) stoßen den Coach an, ohne die Antwort aufzuhalten
      const job = onRecordsChanged(env, uid, changes, 'app');
      if (ctx && ctx.waitUntil) ctx.waitUntil(job); else await job;
    }
    const since = Number.isFinite(body.since) ? body.since : 0;
    const out: any = await changesSince(env, uid, since, 2000);
    out.time = Date.now();
    out.accepted = changes.length;
    out.intervals = { configured: !!(await intervalsCreds(env, uid)), last: await getMeta(env, uid, 'intervals_last') };
    return out;
  }

  if (p === '/api/backups' && M === 'GET') {
    const rows = await env.DB.prepare('SELECT day, created_at, length(data) AS size FROM backups WHERE user_id = ? ORDER BY day DESC').bind(uid).all();
    return { backups: (rows.results || []).map((r: any) => ({ day: r.day, createdAt: r.created_at, size: r.size })) };
  }
  if (p === '/api/backups/now' && M === 'POST') return await dailyBackup(env, uid);
  const bk = /^\/api\/backups\/(\d{4}-\d{2}-\d{2})$/.exec(p);
  if (bk && M === 'GET') {
    const row = await env.DB.prepare('SELECT day, data FROM backups WHERE user_id = ? AND day = ?').bind(uid, bk[1]).first();
    if (!row) throw new HttpError(404, 'Kein Backup für diesen Tag');
    return { day: row.day, records: JSON.parse(row.data) };
  }

  // intervals.icu
  if (p === '/api/intervals/import' && M === 'POST') {
    const st = await runImport(env, uid, { days: 14 });
    return Object.assign({ configured: !!(await intervalsCreds(env, uid)) }, st);
  }
  if (p === '/api/intervals/status' && M === 'GET') {
    return { configured: !!(await intervalsCreds(env, uid)), last: await getMeta(env, uid, 'intervals_last') };
  }

  // Push-Abo dieses Geräts speichern / löschen / testen
  if (p === '/api/push/subscribe' && M === 'POST') {
    const body = await readJson(req);
    const s = body.subscription || {};
    const keys = s.keys || {};
    const okEndpoint = /^https:\/\//.test(s.endpoint || '') || (env.ALLOW_TEST_ROUTES === '1' && /^http:\/\/127\.0\.0\.1:/.test(s.endpoint || ''));
    if (!okEndpoint || !keys.p256dh || !keys.auth) throw new HttpError(400, 'Ungültiges Abo');
    await env.DB.prepare('DELETE FROM push_subs WHERE device_id = ? OR endpoint = ?').bind(a.deviceId, s.endpoint).run();
    await env.DB.prepare('INSERT INTO push_subs (id, device_id, endpoint, p256dh, auth, created_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind('sub-' + crypto.randomUUID(), a.deviceId, s.endpoint, keys.p256dh, keys.auth, Date.now(), uid).run();
    return { ok: true };
  }
  if (p === '/api/push/unsubscribe' && M === 'POST') {
    await env.DB.prepare('DELETE FROM push_subs WHERE device_id = ?').bind(a.deviceId).run();
    return { ok: true };
  }
  if (p === '/api/push/status' && M === 'GET') {
    const me = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE device_id = ?').bind(a.deviceId).first();
    const all = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?').bind(uid).first();
    return { configured: !!env.VAPID_PRIVATE_JWK, thisDevice: !!(me && me.n), devices: (all && all.n) || 0 };
  }
  if (p === '/api/push/test' && M === 'POST') {
    if (!env.VAPID_PRIVATE_JWK) throw new HttpError(503, 'Mitteilungen sind auf dem Server noch nicht eingerichtet.');
    const n = await deliver(env, uid, { title: BRAND.name, body: 'Mitteilungen funktionieren. 💪', url: './?go=heute', tag: 'test' });
    return { delivered: n };
  }

  // Nur für lokale Tests: einen 5-Minuten-Lauf zu einer bestimmten Uhrzeit simulieren
  if (p === '/api/test/tick' && M === 'POST' && env.ALLOW_TEST_ROUTES === '1') {
    const body = await readJson(req);
    return await everyFive(env, { date: body.date, hour: body.hour, minute: body.minute, dow: body.dow }, [uid]);
  }

  // Plan-Anpassungen von Hand auslösen
  if (p === '/api/coach/daily' && M === 'POST') return await runDaily(env, uid, { force: true });
  if (p === '/api/coach/weekly' && M === 'POST') {
    const body = await readJson(req);
    return await runWeekly(env, uid, { force: true, date: /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : undefined });
  }

  const extra = await extraRoutes(req, env, url, p, a, ctx);
  if (extra !== undefined) return extra;

  throw new HttpError(404, 'Unbekannte Adresse');
}

/* Alle 5 Minuten, für jeden Nutzer. Abruf und Anpassungen alle 30 Minuten zwischen 6 und 23 Uhr deutscher Zeit,
   Mitteilungen bei jedem Lauf. */
export async function everyFive(env: Env, b?: any, onlyUsers?: number[]) {
  b = b || berlinParts();
  const users = onlyUsers || await activeUsers(env);
  const out: any = {};
  for (const uid of users) {
    let L: any = null;
    if (b.hour >= 6 && b.hour <= 23 && b.minute % 30 < 5) {
      if (await intervalsCreds(env, uid)) { try { await runImport(env, uid); } catch (e) { await logError(env, 'server', (e as Error).message, 'intervals', { uid }); } }
      let daily: any = null;
      // Morgens nach dem Abruf: Tagesampel → Plan anpassen (einmal pro Tag)
      try { daily = await runDaily(env, uid); } catch (e) { await logError(env, 'server', (e as Error).message, 'daily', { uid }); }
      // Sonntag ab 18 Uhr: nächste Woche planen (einmal)
      if (b.dow === 0 && b.hour >= 18) { try { await runWeekly(env, uid); } catch (e) { await logError(env, 'server', (e as Error).message, 'weekly', { uid }); } }
      if (env.VAPID_PRIVATE_JWK) {
        try {
          L = await loadState(env, uid);
          if (L.plan) {
            await queueAfterImport(env, uid, L, b.date);
            if (daily && daily.adjustments) await queueAdjustments(env, uid, daily.adjustments, b.date);
            await queueAchievements(env, uid, await checkAchievements(env, uid, L, b.date));
          }
        } catch (e) { await logError(env, 'server', (e as Error).message, 'warnings', { uid }); }
      }
    }
    try { out[uid] = await notifyTick(env, uid, { berlin: b, state: L }); } catch (e) { out[uid] = { error: (e as Error).message }; }
  }
  try { await scheduledExtras(env, b, users); } catch (e) { await logError(env, 'server', (e as Error).message, 'extras'); }
  // Tests mit einem Nutzer erwarten das Ergebnis direkt
  return users.length === 1 ? out[users[0]] : out;
}

export default {
  async fetch(req: Request, env: Env, ctx: any): Promise<Response> {
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    try {
      const out = await route(req, env, url, ctx);
      if (out instanceof Response) { cors && Object.entries(cors).forEach(([k, v]) => out.headers.set(k, v)); return out; }
      return json(out, 200, cors);
    } catch (e: any) {
      const status = e instanceof HttpError ? e.status : 500;
      // Keine Datensätze oder Schlüssel loggen, nur die Meldung
      if (status === 500) { console.error('Fehler:', e && e.message); await logError(env, 'server', e && e.message, req.method + ' ' + url.pathname); }
      return json({ error: status === 500 ? 'Serverfehler' : e.message }, status, cors);
    }
  },
  async scheduled(event: any, env: Env, ctx: any) {
    // Nachts das Backup, jeder andere Zeitplan löst den normalen Lauf aus
    if (event.cron === '0 2 * * *') ctx.waitUntil(nightly(env));
    else ctx.waitUntil(everyFive(env));
  }
};
