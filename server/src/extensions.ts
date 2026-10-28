/* Erweiterungen: Verbindungen (OAuth, Webhooks, Kurzbefehl), Datei-Import, Coach-Engine und KI-Coach.
   index.ts ruft diese Haken auf, damit der Kern übersichtlich bleibt. */
import { type Env, type Change, berlinParts, getRecord, getMeta, setMeta } from './store';
import { runImport, intervalsCreds } from './intervals';
import { fetchStatusText, FETCH_MIN_GAP_MS, type FetchResult } from '../../shared/fetchnow';
import type { Auth } from './auth';
import { HttpError, readJson } from './http';
import * as X from './connect';
import { runEngineFor, loadState, engineCtx, runAnalysis } from './coach';
import { aiChat, aiStatus, aiFoodEstimate, decideProposal, aiRephrase, aiParseRules } from './ai';
import { waiChat, freeStatus, waiUsageReport, FallbackError } from './wai';
import { sanitizeRule } from '../../shared/constraints';
import { parseRules } from '../../shared/ruleparse';
import { putRecords } from './store';
import { isMinor, ageOf } from '../../shared/profile';
import { needsParentConsent } from '../../shared/features';

const PROVIDER = /^\/api\/connect\/(dropbox|oura|whoop|polar|withings|fitbit)\/(start|callback|sync|disconnect|folder)$/;

/* Routen ohne Geräte-Login (eigene Prüfung je Route). undefined = nicht zuständig. */
export async function publicRoutes(req: Request, env: Env, url: URL, p: string, ctx: any): Promise<any> {
  const m = PROVIDER.exec(p);
  if (m && m[2] === 'callback' && req.method === 'GET') return X.oauthCallback(env, m[1] as X.ProviderId, url);
  if (p === '/api/hooks/dropbox') return X.dropboxWebhook(env, req, url, ctx);
  if (p === '/api/hooks/whoop' && req.method === 'POST') return X.whoopWebhook(env, req, ctx);
  // Kurzbefehl: eigener, widerrufbarer Schlüssel statt Geräte-Login
  if (p === '/api/ingest/shortcut' && req.method === 'POST') {
    const uid = await X.authIngest(req, env, url);
    return X.shortcutIngest(env, uid, await readJson(req));
  }
  if (p === '/api/import/file' && req.method === 'POST' && (req.headers.get('X-Ingest-Key') || url.searchParams.get('key'))) {
    const uid = await X.authIngest(req, env, url);
    return X.importFiles(env, uid, req, url, url.searchParams.get('source') === 'healthfit' ? 'healthfit' : 'file');
  }
  return undefined;
}

/* Routen mit Geräte-Login */
export async function extraRoutes(req: Request, env: Env, url: URL, p: string, a: Auth, _ctx: any): Promise<any> {
  const M = req.method;
  if (p === '/api/connections' && M === 'GET') return { connections: X.connectionsFor(await X.connectionsStatus(env, a.uid), a.role), ...(a.role === 'admin' ? { callbackBase: String(env.PUBLIC_URL || '') + '/api/connect/' } : {}) };
  const m = PROVIDER.exec(p);
  if (m && M === 'POST') {
    const prov = m[1] as X.ProviderId;
    if (m[2] === 'start') return X.startOAuth(env, a, prov, (await readJson(req)).returnTo);
    if (m[2] === 'sync') return { ok: true, stats: await X.syncProvider(env, a.uid, prov, { initial: false }) };
    if (m[2] === 'disconnect') return { ok: true, ...(await X.disconnect(env, a.uid, prov, !!(await readJson(req)).deleteData)) };
    if (m[2] === 'folder' && prov === 'dropbox') {
      const folder = String((await readJson(req)).folder || '').trim();
      // leer = automatisch suchen (Auftrag 13)
      if (folder && !/^\/[^\u0000-\u001f]{0,200}$/.test(folder)) throw new HttpError(400, 'Ordner muss mit / beginnen, z. B. /Apps/HealthFit');
      const c = await X.getConn(env, a.uid, 'dropbox');
      const stats = c && c.stats ? JSON.parse(c.stats) : {};
      await env.DB.prepare("UPDATE connections SET stats = ?, cursor = NULL WHERE user_id = ? AND provider = 'dropbox'").bind(JSON.stringify({ ...stats, folder: folder || null, folderSet: !!folder }), a.uid).run();
      return { ok: true };
    }
  }
  // Auftrag 21: „Jetzt abrufen“ für alle verbundenen Quellen (aus einer Einheit oder den Verbindungen); höchstens einmal pro Minute
  if (p === '/api/fetch-now' && M === 'POST') {
    const body = await readJson(req); const only = body.provider ? String(body.provider) : null;
    const last = await getMeta(env, a.uid, 'fetch_now_at');
    if (last && Date.now() - last < FETCH_MIN_GAP_MS) throw new HttpError(429, 'Gerade eben schon abgerufen. In einer Minute geht es wieder.');
    await setMeta(env, a.uid, 'fetch_now_at', Date.now());
    const sid = body.sessionId ? String(body.sessionId) : null;
    const before = sid ? await getRecord(env, a.uid, 'session', sid) : null;
    const rows = await env.DB.prepare("SELECT provider FROM connections WHERE user_id = ? AND status IN ('connected', 'error')").bind(a.uid).all();
    const provs = ((rows.results || []) as any[]).map(r => String(r.provider)).filter(x => !only || x === only);
    const icu = await intervalsCreds(env, a.uid);
    if (icu && (!only || only === 'intervals') && !provs.includes('intervals')) provs.push('intervals');
    const results: FetchResult[] = [];
    for (const prov of provs) {
      const label = prov === 'intervals' ? 'intervals.icu' : prov === 'dropbox' ? 'HealthFit' : prov.charAt(0).toUpperCase() + prov.slice(1);
      try {
        if (prov === 'intervals') { const st = await runImport(env, a.uid, { days: 7 }); results.push({ provider: prov, label, ok: !!st.ok, error: st.ok ? undefined : st.error, activities: (st.matched || 0) + (st.extras || 0), matched: st.matched || 0, days: st.wellnessDays || 0 }); }
        else if (prov !== 'shortcut') { const st: any = await X.syncProvider(env, a.uid, prov as X.ProviderId, { maxFiles: 2 }); results.push({ provider: prov, label, ok: true, activities: st.activities || 0, matched: st.matched || 0, days: st.days || 0 }); }
      } catch (e: any) { results.push({ provider: prov, label, ok: false, error: X.friendlyError(e).text, activities: 0, matched: 0, days: 0 }); }
    }
    const after = sid ? await getRecord(env, a.uid, 'session', sid) : null;
    const at = Date.now();
    const sess = sid ? { sport: String(body.sport || ''), before: !!(before && before.data && before.data.activityId), done: !!(after && after.data && after.data.activityId) } : null;
    return { at, results, text: fetchStatusText(at, results, sess) };
  }
  if (p === '/api/connect/intervals' && M === 'POST') return X.connectIntervals(env, a.uid, await readJson(req));
  if (p === '/api/connect/intervals/disconnect' && M === 'POST') return { ok: true, ...(await X.disconnect(env, a.uid, 'intervals', !!(await readJson(req)).deleteData)) };
  if (p === '/api/ingest/keys' && M === 'POST') return X.createIngestKey(env, a.uid, (await readJson(req)).label);
  const rk = /^\/api\/ingest\/keys\/([\w-]+)$/.exec(p);
  if (rk && M === 'DELETE') return X.revokeIngestKey(env, a.uid, rk[1]);
  if (p === '/api/import/file' && M === 'POST') return X.importFiles(env, a.uid, req, url, 'file');
  const st = /^\/api\/activity\/([\w.:-]+)\/streams$/.exec(p);
  if (st && M === 'GET') {
    const row = await env.DB.prepare('SELECT data FROM blobs WHERE user_id = ? AND id = ?').bind(a.uid, st[1]).first();
    if (!row) throw new HttpError(404, 'Für diese Einheit gibt es keinen Verlauf.');
    return { streams: JSON.parse(row.data) };
  }
  // Coach
  if (p === '/api/coach/ai/status' && M === 'GET') {
    const s = await getRecord(env, a.uid, 'settings', 'main');
    const prof = await getRecord(env, a.uid, 'profile', 'main');
    const parent = prof ? needsParentConsent(ageOf(prof.data, berlinParts().date)) : false;
    const set = (s && s.data && s.data.settings) || {};
    const st = await aiStatus(env, a.uid, set, parent);
    const free = await freeStatus(env, a.uid, set, parent);
    // Auftrag 16: Chat über Claude (falls hinterlegt und eingeschaltet), sonst kostenlos über Workers AI
    return { ...st, free, chatActive: st.active || free.active, tier: st.active ? 'claude' : free.active ? 'free' : null };
  }
  if (p === '/api/admin/ai-usage' && M === 'GET') {
    if (a.role !== 'admin') throw new HttpError(403, 'Nur für den Betreiber.');
    return waiUsageReport(env);
  }
  /* Freitext → Regeln: mit aktivem KI-Coach über die KI, sonst (und bei Fehlern) mit dem eingebauten Parser */
  if (p === '/api/rules/parse' && M === 'POST') {
    const body = await readJson(req); const text = String(body.text || '').trim().slice(0, 400);
    if (!text) throw new HttpError(400, 'Leerer Text.');
    const today = berlinParts().date;
    const s = await getRecord(env, a.uid, 'settings', 'main');
    const prof = await getRecord(env, a.uid, 'profile', 'main');
    const st = await aiStatus(env, a.uid, (s && s.data && s.data.settings) || {}, prof ? needsParentConsent(ageOf(prof.data, today)) : false);
    if (st.active) {
      try {
        const rules = (await aiParseRules(env, a.uid, text, today)).map((r: any) => sanitizeRule(r, text, 'ai')).filter(Boolean);
        if (rules.length) return { rules, by: 'ai' };
      } catch (e) { /* eingebauter Parser */ }
    }
    const r = parseRules(text, today);
    return { rules: r.rules, ask: r.ask || null, by: 'parser' };
  }
  if (p === '/api/coach/chat' && M === 'POST') {
    const body = await readJson(req);
    if (!String(body.text || '').trim()) throw new HttpError(400, 'Leere Nachricht.');
    const L = await loadState(env, a.uid);
    const r = await coachChat(env, a.uid, L, String(body.text));
    const t = Date.now();
    const changes: Change[] = [...r.changes.map((c, i) => ({ kind: c.kind, key: c.key, data: c.data, updatedAt: t + i })), ...r.messages.map((mm, i) => ({ kind: 'coachMsg', key: mm.id, data: mm, updatedAt: t + 100 + i }))];
    await putRecords(env, a.uid, changes);
    return { messages: r.messages, applied: r.changes.length, status: r.status, blocked: r.blocked || null };
  }
  // Auftrag 12: dieselbe Antwort als Strom (NDJSON): {t:'delta'|'reset'|'done'|'error'}; gespeichert wird wie oben
  if (p === '/api/coach/chat/stream' && M === 'POST') {
    const body = await readJson(req);
    if (!String(body.text || '').trim()) throw new HttpError(400, 'Leere Nachricht.');
    const L = await loadState(env, a.uid);
    const ts = new TransformStream(); const w = ts.writable.getWriter(); const enc = new TextEncoder();
    const send = (o: any) => w.write(enc.encode(JSON.stringify(o) + '\n')).catch(() => {});
    (async () => {
      try {
        const r = await coachChat(env, a.uid, L, String(body.text), { delta: t => { send({ t: 'delta', text: t }); }, reset: () => { send({ t: 'reset' }); } });
        const t = Date.now();
        const changes: Change[] = [...r.changes.map((c, i) => ({ kind: c.kind, key: c.key, data: c.data, updatedAt: t + i })), ...r.messages.map((mm, i) => ({ kind: 'coachMsg', key: mm.id, data: mm, updatedAt: t + 100 + i }))];
        await putRecords(env, a.uid, changes);
        await send({ t: 'done', messages: r.messages, applied: r.changes.length, status: r.status, blocked: r.blocked || null });
      } catch (e: any) { await send({ t: 'error', status: e && e.status || 500, error: String(e && e.message || e), fallback: e instanceof FallbackError ? e.why : null }); }
      finally { try { await w.close(); } catch (e) { /* schon zu */ } }
    })();
    return new Response(ts.readable, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' } });
  }
  const pr = /^\/api\/coach\/proposal\/([\w.-]+)$/.exec(p);
  if (pr && M === 'POST') return decideProposal(env, a.uid, pr[1], !!(await readJson(req)).accept);
  if (p === '/api/coach/food' && M === 'POST') {
    const body = await readJson(req);
    const s = await getRecord(env, a.uid, 'settings', 'main');
    const prof = await getRecord(env, a.uid, 'profile', 'main');
    return aiFoodEstimate(env, a.uid, (s && s.data && s.data.settings) || {}, String(body.image || ''), String(body.mediaType || ''), String(body.question || ''), prof ? isMinor(prof.data, berlinParts().date) : false, prof ? needsParentConsent(ageOf(prof.data, berlinParts().date)) : false);
  }
  if (p === '/api/coach/run' && M === 'POST') {
    const body = await readJson(req);
    const ev = ['daily', 'weekly', 'activity', 'nutrition', 'illness'].includes(body.type) ? { type: body.type } : null;
    if (!ev) throw new HttpError(400, 'Unbekanntes Ereignis.');
    return runEngineFor(env, a.uid, ev as any);
  }
  return undefined;
}

/* Auftrag 16: Chat-Reihenfolge. Claude nur, wenn Schlüssel, Freischaltung, Schalter und Einwilligung da sind (Premium);
   sonst die kostenlose KI (Workers AI); sonst 403 → die App antwortet mit dem Regel-Coach. */
async function coachChat(env: Env, uid: number, L: any, text: string, live?: any): Promise<any> {
  const ctx = engineCtx(L);
  const parent = needsParentConsent(ageOf(ctx.profile, ctx.today));
  const st = await aiStatus(env, uid, L.state.settings, parent);
  if (st.active) return aiChat(env, uid, ctx, text, live);
  const free = await freeStatus(env, uid, L.state.settings, parent);
  if (free.active) return waiChat(env, uid, ctx, text, live, { parentNeeded: parent });
  // ohne kostenlose KI: wie bisher Claude fragen (wirft mit genauer Begründung, warum nicht)
  if (!free.available) return aiChat(env, uid, ctx, text, live);
  throw new HttpError(403, free.reason === 'consent' || free.reason === 'parent' ? 'Für KI-Antworten fehlt deine Einwilligung. Der Regel-Coach antwortet.' : 'Die KI ist gerade nicht verfügbar. Der Regel-Coach antwortet.');
}

/* Zusätzliche Zeitpläne (Abruf der Dienste) */
export async function scheduledExtras(env: Env, _b: any, users: number[]): Promise<void> {
  await X.scheduledSync(env, users);
}

/* Neue Datensätze aus der App: Coach-Engine anstoßen (Einheit, Nachtwerte, Krankheit, Essen) */
export async function onRecordsChanged(env: Env, uid: number, changes: Change[], _source: string): Promise<void> {
  const today = berlinParts().date;
  const kinds = new Set(changes.map(c => c.kind));
  const evs: any[] = [];
  if (kinds.has('session') || kinds.has('custom') || kinds.has('activity')) evs.push({ type: 'activity',
    activityIds: changes.filter(c => c.kind === 'activity').map(c => c.key),
    sessionIds: changes.filter(c => c.kind === 'session' || c.kind === 'custom').map(c => c.key) });
  const trendDates = changes.filter(c => c.kind === 'trend' && c.key >= today).map(c => c.key);
  if (trendDates.length) evs.push({ type: 'trend', dates: trendDates });
  if (kinds.has('illness')) evs.push({ type: 'illness' });
  if (kinds.has('nutrition') || kinds.has('meal')) evs.push({ type: 'nutrition' });
  if (!evs.length) return;
  try {
    const L = await loadState(env, uid);
    const ctx0 = engineCtx(L);
    const st = await aiStatus(env, uid, L.state.settings, needsParentConsent(ageOf(ctx0.profile, ctx0.today)));
    const rephrase = st.active ? (m: any) => aiRephrase(env, uid, engineCtx(L), m) : undefined;
    for (const ev of evs) await runEngineFor(env, uid, ev, { L, rephrase });
    if (evs.some(e => e.type === 'activity')) await runAnalysis(env, uid, 'activity', { L, rephrase });
  } catch (e) { /* die Engine darf den Sync nie stören */ }
}
