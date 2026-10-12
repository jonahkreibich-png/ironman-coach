/* „Fehler melden / Idee“ (Auftrag 4 F1, Auftrag 5 B): Meldungen mit Bildschirm, Version, Gerät, letzten Fehlern und optional
   einem Screenshot. Jede neue Meldung schickt sofort eine Mitteilung an alle Geräte des Betreibers. Der Betreiber hat einen
   Posteingang (neu / in Arbeit / erledigt) und kann antworten; die Antwort erscheint beim Nutzer als Coach-Nachricht.
   Gesundheits- oder Trainingsdaten gehen nur mit, wenn der Nutzer sie für diese Meldung bewusst freigibt (shared). */
import { type Env, putRecords } from './store';
import type { Auth } from './auth';
import { HttpError, readJson } from './http';
import { deliver } from './notify';
import { scrub } from './errlog';

const STATUS = ['neu', 'arbeit', 'erledigt'];
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
  if (!p.startsWith('/api/admin/feedback') && p !== '/api/admin/errors') return undefined;
  if (a.role !== 'admin') throw new HttpError(403, 'Nur der Betreiber darf das.');
  if (p === '/api/admin/feedback' && M === 'GET') {
    const rows = await env.DB.prepare('SELECT f.id, f.user_id, f.at, f.kind, f.text, f.screen, f.version, f.device, f.errors, f.status, f.shared, f.reply, f.reply_at, f.screenshot IS NOT NULL AS shot, u.name FROM feedback f LEFT JOIN users u ON u.id = f.user_id ORDER BY f.at DESC LIMIT 300').all();
    return { feedback: (rows.results || []).map((r: any) => ({ id: r.id, userId: r.user_id, user: r.name || 'Nutzer ' + r.user_id, at: r.at, kind: r.kind, text: r.text, screen: r.screen, version: r.version, device: r.device,
      errors: JSON.parse(r.errors || '[]'), status: r.status || 'neu', done: r.status === 'erledigt', shared: r.shared ? JSON.parse(r.shared) : null, reply: r.reply || null, replyAt: r.reply_at || null, hasScreenshot: !!r.shot })) };
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
    if (status) await env.DB.prepare('UPDATE feedback SET status = ?, done = ? WHERE id = ?').bind(status, status === 'erledigt' ? 1 : 0, id).run();
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
  /* Fehler bei Testern, auch ohne Meldung: je Nutzer der letzten 14 Tage (Fehlertexte sind ohne Zahlen und Gesundheitsdaten) */
  if (p === '/api/admin/errors' && M === 'GET') {
    const since = Date.now() - 14 * 86400000;
    const rows = await env.DB.prepare('SELECT e.user_id, u.name, COUNT(*) AS n, MAX(e.at) AS last_at FROM error_log e LEFT JOIN users u ON u.id = e.user_id WHERE e.at > ? AND e.user_id IS NOT NULL GROUP BY e.user_id ORDER BY last_at DESC').bind(since).all();
    const users: any[] = [];
    for (const r of rows.results || []) {
      const last = await env.DB.prepare('SELECT msg, place, version, view, at FROM error_log WHERE user_id = ? AND at > ? ORDER BY id DESC LIMIT 5').bind((r as any).user_id, since).all();
      const list = (last.results || []) as any[];
      users.push({ userId: (r as any).user_id, user: (r as any).name || 'Nutzer ' + (r as any).user_id, count: (r as any).n, lastAt: (r as any).last_at, last: list[0] ? list[0].msg : '', recent: list });
    }
    return { users };
  }
  return undefined;
}
