/* „Fehler melden / Idee“ (Auftrag 4 F1, Auftrag 5 B): Meldungen mit Bildschirm, Version, Gerät, letzten Fehlern und optional
   einem Screenshot. Jede neue Meldung schickt sofort eine Mitteilung an alle Geräte des Betreibers. Der Betreiber hat einen
   Posteingang (neu / in Arbeit / erledigt) und kann antworten; die Antwort erscheint beim Nutzer als Coach-Nachricht.
   Gesundheits- oder Trainingsdaten gehen nur mit, wenn der Nutzer sie für diese Meldung bewusst freigibt (shared). */
import { type Env, putRecords, getMeta, setMeta } from './store';
import type { Auth } from './auth';
import { HttpError, readJson } from './http';
import { deliver } from './notify';
import { scrub } from './errlog';

const STATUS = ['neu', 'arbeit', 'erledigt', 'verworfen'];
/* Auftrag 14: gleiche Fehler zu einer Zeile zusammenfassen („9× Dropbox: …“), kurzer verständlicher Text.
   Einstellungsfehler des Servers (Dropbox-App nur mit App-Ordner-Zugriff, fehlende Schlüssel) sind keine Tester-Fehler,
   sondern ein Hinweis für den Betreiber. */
const PLACE_LABEL: Record<string, string> = { 'sync-dropbox': 'Dropbox', 'sync-oura': 'Oura', 'sync-whoop': 'WHOOP', 'sync-polar': 'Polar', 'sync-withings': 'Withings', 'sync-intervals': 'intervals.icu', backup: 'Sicherung', push: 'Mitteilungen' };
export function errorKey(place: unknown, msg: unknown): string {
  return `${String(place || '')}|${String(msg || '').replace(/\s*\[[^\]]*\]\s*$/, '').replace(/^\w+:\s*/, '').replace(/\d+/g, '#').slice(0, 100)}`;
}
export function errorLabel(place: unknown): string { const p = String(place || ''); return PLACE_LABEL[p] || (p.startsWith('sync-') ? p.slice(5) : p ? p : 'App'); }
/* kurzer Text: erster Satz ohne technische Klammern, höchstens 90 Zeichen */
export function errorShort(msg: unknown): string {
  let t = String(msg || '').replace(/\s*\[[^\]]*\]\s*$/, '').replace(/^\w+:\s*/, '').trim();
  const first = t.split(/(?<=[.!?])\s+/)[0] || t;
  t = first.length > 90 ? first.slice(0, 87).replace(/\s+\S*$/, '') + ' …' : first;
  return t;
}
/* Betreiber-Hinweis statt Tester-Fehler */
export function operatorHint(place: unknown, msg: unknown): { key: string; text: string; help: string } | null {
  const m = String(msg || ''), p = String(place || '');
  if (p === 'sync-dropbox' && /App folder|eigenen, leeren Ordner|nur ihren eigenen/i.test(m)) return { key: 'op-dropbox-appfolder', text: 'Dropbox: Die Server-App hat nur „App folder“-Zugriff und sieht /Apps/HealthFit nicht.', help: 'Neue Dropbox-App mit „Full Dropbox“ anlegen und DROPBOX_APP_KEY und DROPBOX_APP_SECRET neu setzen (FUER-JONAH.md). Danach neu verbinden.' };
  if (/TOKEN_KEY (fehlt|zu kurz)/.test(m.replace(/\[[^\]]*\]/g, ''))) return { key: 'op-token-key', text: 'Server-Schlüssel TOKEN_KEY fehlt oder ist zu kurz.', help: 'TOKEN_KEY mit scripts/set-secret.mjs setzen (32 Byte, hex).' };
  if (/(APP_KEY|APP_SECRET|CLIENT_ID|CLIENT_SECRET)\b.*(fehlt|nicht gesetzt)|nicht eingerichtet/i.test(m)) return { key: 'op-app-keys-' + p, text: `${errorLabel(p)}: Die App-Schlüssel des Dienstes fehlen auf dem Server.`, help: 'Schlüssel setzen (VERBINDUNGEN.md), danach neu verbinden.' };
  return null;
}

const cleanVersion = (v: unknown) => String(v == null ? '' : v).replace(/[^\w.+-]/g, '').slice(0, 40);
const SHOT_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_SHOT = 600_000;

async function userName(env: Env, uid: number): Promise<string> {
  const u = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(uid).first();
  return (u && u.name) || 'Nutzer ' + uid;
}
/* Mitteilung an alle Betreiber-Geräte */
export async function notifyAdmins(env: Env, msg: any): Promise<number> {
  const admins = await env.DB.prepare("SELECT id FROM users WHERE role = 'admin'").all();
  let n = 0;
  for (const a of admins.results || []) n += await deliver(env, (a as any).id, msg);
  return n;
}

export async function feedbackRoutes(req: Request, env: Env, p: string, a: Auth): Promise<any> {
  const M = req.method;
  if (p === '/api/feedback' && M === 'POST') {
    const b = await readJson(req);
    const text = String(b.text || '').trim().slice(0, 2000);
    if (!text) throw new HttpError(400, 'Bitte kurz beschreiben, was los ist.');
    const errs = Array.isArray(b.errors) ? b.errors.slice(-5).map((e: any) => ({ msg: scrub(e && e.msg, 200), where: scrub(e && e.where, 80), at: Number(e && e.at) || null })) : [];
    const shot = typeof b.screenshot === 'string' && b.screenshot.length <= MAX_SHOT && SHOT_RE.test(b.screenshot) ? b.screenshot : null;
    const shared = b.shared && typeof b.shared === 'object' ? JSON.stringify(b.shared).slice(0, 8000) : null;
    const kind = b.kind === 'idea' ? 'idea' : 'bug';
    const r = await env.DB.prepare('INSERT INTO feedback (user_id, at, kind, text, screen, version, device, errors, screenshot, shared, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(a.uid, Date.now(), kind, text, scrub(b.screen, 80), cleanVersion(b.version), String(b.device || '').slice(0, 120), JSON.stringify(errs), shot, shared, 'neu').run();
    const id = r.meta.last_row_id;
    // Meldungen des Betreibers selbst lösen keine Mitteilung aus
    if (a.role !== 'admin') {
      try { await notifyAdmins(env, { title: `Neue Meldung von ${await userName(env, a.uid)}`, body: (kind === 'idea' ? 'Idee: ' : '') + text.slice(0, 140), url: `/?go=feedback&fb=${id}`, tag: 'fb-' + id, urgent: true }); }
      catch (e) { /* Meldung ist gespeichert, Mitteilung ist nur ein Zusatz */ }
    }
    return { ok: true, id };
  }
  if (p === '/api/feedback/mine' && M === 'GET') {
    const rows = await env.DB.prepare('SELECT id, at, kind, text, status, reply, reply_at, reply_seen FROM feedback WHERE user_id = ? ORDER BY at DESC LIMIT 50').bind(a.uid).all();
    return { feedback: (rows.results || []).map((r: any) => ({ id: r.id, at: r.at, kind: r.kind, text: r.text, status: r.status || 'neu', reply: r.reply || null, replyAt: r.reply_at || null, replySeen: !!r.reply_seen })) };
  }
  if (p === '/api/feedback/mine/seen' && M === 'POST') {
    await env.DB.prepare('UPDATE feedback SET reply_seen = 1 WHERE user_id = ? AND reply IS NOT NULL').bind(a.uid).run();
    return { ok: true };
  }
  if (!p.startsWith('/api/admin/feedback') && !p.startsWith('/api/admin/errors')) return undefined;
  if (a.role !== 'admin') throw new HttpError(403, 'Nur der Betreiber darf das.');
  if (p === '/api/admin/feedback' && M === 'GET') {
    const rows = await env.DB.prepare('SELECT f.id, f.user_id, f.at, f.kind, f.text, f.screen, f.version, f.device, f.errors, f.status, f.shared, f.reply, f.reply_at, f.screenshot IS NOT NULL AS shot, u.name FROM feedback f LEFT JOIN users u ON u.id = f.user_id ORDER BY f.at DESC LIMIT 300').all();
    return { feedback: (rows.results || []).map((r: any) => ({ id: r.id, userId: r.user_id, user: r.name || 'Nutzer ' + r.user_id, at: r.at, kind: r.kind, text: r.text, screen: r.screen, version: r.version, device: r.device,
      errors: JSON.parse(r.errors || '[]'), status: r.status || 'neu', done: r.status === 'erledigt' || r.status === 'verworfen', shared: r.shared ? JSON.parse(r.shared) : null, reply: r.reply || null, replyAt: r.reply_at || null, hasScreenshot: !!r.shot })) };
  }
  const shot = /^\/api\/admin\/feedback\/(\d+)\/screenshot$/.exec(p);
  if (shot && M === 'GET') {
    const r = await env.DB.prepare('SELECT screenshot FROM feedback WHERE id = ?').bind(+shot[1]).first();
    if (!r) throw new HttpError(404, 'Meldung nicht gefunden.');
    return { screenshot: r.screenshot || null };
  }
  const one = /^\/api\/admin\/feedback\/(\d+)$/.exec(p);
  if (one && M === 'POST') {
    const id = +one[1]; const b = await readJson(req);
    const row = await env.DB.prepare('SELECT user_id, text FROM feedback WHERE id = ?').bind(id).first();
    if (!row) throw new HttpError(404, 'Meldung nicht gefunden.');
    const status = STATUS.includes(b.status) ? b.status : b.done === true ? 'erledigt' : b.done === false ? 'neu' : null;
    if (status) await env.DB.prepare('UPDATE feedback SET status = ?, done = ? WHERE id = ?').bind(status, status === 'erledigt' || status === 'verworfen' ? 1 : 0, id).run();
    const reply = typeof b.reply === 'string' ? b.reply.trim().slice(0, 2000) : '';
    if (reply) {
      const now = Date.now();
      await env.DB.prepare('UPDATE feedback SET reply = ?, reply_at = ?, reply_seen = 0 WHERE id = ?').bind(reply, now, id).run();
      // Antwort als Coach-Nachricht beim Nutzer (kommt über den normalen Abgleich) und als Mitteilung
      const uid = (row as any).user_id;
      const msg = { id: `msg-fb-${id}-${now}`, at: now, date: new Date(now).toISOString().slice(0, 10), kind: 'answer', from: 'coach', title: 'Antwort auf deine Meldung', text: `Zu „${String((row as any).text).slice(0, 80)}“: ${reply}`, unread: true, pinned: true, feedbackId: id };
      await putRecords(env, uid, [{ kind: 'coachMsg', key: msg.id, data: msg, updatedAt: now }]);
      try { await deliver(env, uid, { title: 'Antwort auf deine Meldung', body: reply.slice(0, 140), url: '/?go=coach', tag: 'fbr-' + id }); } catch (e) { /* egal */ }
    }
    return { ok: true };
  }
  /* Fehler bei Testern der letzten 14 Tage, gleiche Fehler zusammengefasst; „Erledigt“ blendet eine Gruppe aus, bis der Fehler wieder auftritt.
     Einstellungsfehler des Servers stehen getrennt als Hinweis für den Betreiber. */
  if (p === '/api/admin/errors' && M === 'GET') {
    const since = Date.now() - 14 * 86400000;
    const acks: Record<string, number> = (await getMeta(env, a.uid, 'err_ack')) || {};
    const rows = await env.DB.prepare('SELECT e.user_id, u.name, e.msg, e.place, e.version, e.at FROM error_log e LEFT JOIN users u ON u.id = e.user_id WHERE e.at > ? AND e.user_id IS NOT NULL ORDER BY e.id DESC LIMIT 500').bind(since).all();
    const groups: Record<string, any> = {}; const ops: Record<string, any> = {};
    for (const r of (rows.results || []) as any[]) {
      const op = operatorHint(r.place, r.msg);
      const key = op ? op.key : errorKey(r.place, r.msg);
      if (acks[key] && r.at <= acks[key]) continue;
      const tgt = op ? ops : groups;
      const g = tgt[key] = tgt[key] || (op ? { key, text: op.text, help: op.help, count: 0, lastAt: 0 } : { key, label: errorLabel(r.place), text: errorShort(r.msg), count: 0, lastAt: 0, users: [] as string[], versions: [] as string[] });
      g.count++; g.lastAt = Math.max(g.lastAt, r.at);
      if (!op) { const n = r.name || 'Nutzer ' + r.user_id; if (!g.users.includes(n)) g.users.push(n); if (r.version && !g.versions.includes(r.version)) g.versions.push(r.version); }
    }
    const byLast = (x: any, y: any) => y.lastAt - x.lastAt;
    return { groups: Object.values(groups).sort(byLast), operator: Object.values(ops).sort(byLast) };
  }
  if (p === '/api/admin/errors/ack' && M === 'POST') {
    const b = await readJson(req);
    const key = String(b.key || '').slice(0, 160);
    if (!key) throw new HttpError(400, 'Welcher Fehler?');
    const acks: Record<string, number> = (await getMeta(env, a.uid, 'err_ack')) || {};
    acks[key] = Date.now();
    // alte Einträge (älter als 30 Tage) aufräumen
    for (const k of Object.keys(acks)) if (acks[k] < Date.now() - 30 * 86400000) delete acks[k];
    await setMeta(env, a.uid, 'err_ack', acks);
    return { ok: true };
  }
  return undefined;
}
