/* Auftrag 16: kostenloser KI-Coach mit Cloudflare Workers AI (Binding „AI“, kein API-Schlüssel, Gratis-Plan: 10.000 Neurons pro Tag
   für das ganze Konto, Neustart 00:00 UTC). Reihenfolge im Chat: Claude (nur wenn Schlüssel hinterlegt und eingeschaltet) → Workers AI →
   Regel-Coach (in der App). Ist das Kontingent leer oder gibt es einen Fehler, antwortet die App selbst mit dem Regel-Coach.
   Fair: jede Person höchstens WAI_MAX_PER_DAY Fragen (30) und höchstens ein Viertel des Tageskontingents.
   Oura-Daten gehen nie an die KI (aiSafeCtx). Planänderungen nur als Vorschlag. Zahlen nur aus Daten und Werkzeugen (Zahlen-Wächter). */
import { type Env, berlinDate } from './store';
import { HttpError } from './http';
import { aiSafeCtx, type ChatResult, type ChatStream } from './ai';
import { runTool, type ToolChange } from '../../shared/coach/tools';
import { checkMessage } from '../../shared/coach/safety';
import { coachSkill, compactContext, openAiTools, inventedNumbers, cleanAnswer, cleanPartial, autoTool, isChangeRequest, claimsChange, leaksInternals } from '../../shared/coach/freeai';
import { hasSource } from '../../shared/activity/merge';
import type { EngineCtx, CoachMsg } from '../../shared/coach/engine';
import { isMinor } from '../../shared/profile';
import { BRAND } from '../../shared/brand';

/* Modelle (Auftrag 16 verglichen, siehe ERGEBNIS.md); WAI_MODEL überschreibt */
export const WAI_MODELS = {
  qwen: '@cf/qwen/qwen3-30b-a3b-fp8',
  gemma: '@cf/google/gemma-4-26b-a4b-it',
  mistral: '@cf/mistralai/mistral-small-3.1-24b-instruct'
} as const;
export const WAI_DEFAULT = WAI_MODELS.gemma;
/* ohne „Nachdenken“ (spart Neurons und Zeit): Gemma per Vorlage, Qwen per /no_think */
export function modelExtras(model: string): any { return /gemma/.test(model) ? { chat_template_kwargs: { enable_thinking: false } } : {}; }
const noThink = (model: string, text: string) => (/qwen3/.test(model) ? text + ' /no_think' : text);

export const utcDay = (ts?: number) => new Date(ts == null ? Date.now() : ts).toISOString().slice(0, 10);
const limits = (env: Env) => ({ budget: Number(env.WAI_DAILY_NEURONS || 9500), perUser: Number(env.WAI_MAX_PER_DAY || 30), share: Number(env.WAI_USER_SHARE || 0.25) });

export interface FreeStatus { available: boolean; consent: boolean; off: boolean; decided: boolean; active: boolean; todayQuestions: number; maxPerDay: number; neuronsToday: number; neuronsBudget: number; model: string; reason: string | null }
/* settings.freeAi = { consentAt, parentConsent, off } – einmal gefragt, abschaltbar. parentNeeded: unter 16 mit Eltern. */
export async function freeStatus(env: Env, uid: number, settings: any, parentNeeded = false): Promise<FreeStatus> {
  const f = (settings && settings.freeAi) || {};
  const L = limits(env); const day = utcDay();
  const all = await env.DB.prepare('SELECT COALESCE(SUM(neurons),0) AS n FROM wai_usage WHERE day = ?').bind(day).first().catch(() => null);
  const me = await env.DB.prepare('SELECT questions, neurons FROM wai_usage WHERE day = ? AND user_id = ?').bind(day, uid).first().catch(() => null);
  const st: FreeStatus = {
    available: !!env.AI, consent: !!f.consentAt && (!parentNeeded || !!f.parentConsent), off: !!f.off, decided: !!f.consentAt || !!f.off,
    todayQuestions: me ? me.questions : 0, maxPerDay: L.perUser, neuronsToday: all ? Math.round(all.n) : 0, neuronsBudget: L.budget,
    model: String(env.WAI_MODEL || WAI_DEFAULT), active: false, reason: null
  };
  st.reason = !st.available ? 'unavailable' : st.off ? 'off' : !st.consent ? (f.consentAt && parentNeeded ? 'parent' : 'consent')
    : st.todayQuestions >= L.perUser ? 'user-limit' : st.neuronsToday >= L.budget ? 'day-limit' : me && me.neurons >= L.budget * L.share ? 'user-share' : null;
  st.active = st.reason == null;
  return st;
}
export async function addWaiUsage(env: Env, uid: number, u: { questions?: number; calls?: number; neurons?: number; tin?: number; tout?: number; errors?: number; fallbacks?: number }) {
  await env.DB.prepare(`INSERT INTO wai_usage (day, user_id, questions, calls, neurons, tokens_in, tokens_out, errors, fallbacks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (day, user_id) DO UPDATE SET questions = questions + excluded.questions, calls = calls + excluded.calls, neurons = neurons + excluded.neurons,
    tokens_in = tokens_in + excluded.tokens_in, tokens_out = tokens_out + excluded.tokens_out, errors = errors + excluded.errors, fallbacks = fallbacks + excluded.fallbacks`)
    .bind(utcDay(), uid, u.questions || 0, u.calls || 0, u.neurons || 0, u.tin || 0, u.tout || 0, u.errors || 0, u.fallbacks || 0).run();
}
/* Für den Betreiber: heute je Person, letzte 7 Tage gesamt */
export async function waiUsageReport(env: Env): Promise<any> {
  const day = utcDay(); const L = limits(env);
  const rows = (await env.DB.prepare('SELECT w.user_id, u.name, w.questions, w.calls, w.neurons, w.errors, w.fallbacks FROM wai_usage w LEFT JOIN users u ON u.id = w.user_id WHERE w.day = ? ORDER BY w.neurons DESC').bind(day).all()).results || [];
  const week = (await env.DB.prepare('SELECT day, SUM(questions) AS questions, SUM(neurons) AS neurons, SUM(errors) AS errors, SUM(fallbacks) AS fallbacks FROM wai_usage WHERE day >= ? GROUP BY day ORDER BY day DESC').bind(utcDay(Date.now() - 6 * 86400000)).all()).results || [];
  const tot = rows.reduce((a: any, r: any) => ({ q: a.q + r.questions, n: a.n + r.neurons }), { q: 0, n: 0 });
  return { day, model: String(env.WAI_MODEL || WAI_DEFAULT), available: !!env.AI, budget: L.budget, freeLimit: 10000, perUser: L.perUser, neuronsToday: Math.round(tot.n), questionsToday: tot.q,
    perQuestion: tot.q ? Math.round(tot.n / tot.q * 10) / 10 : null, users: rows.map((r: any) => ({ id: r.user_id, name: r.name || null, questions: r.questions, neurons: Math.round(r.neurons), errors: r.errors, fallbacks: r.fallbacks })),
    week: week.map((r: any) => ({ day: r.day, questions: r.questions, neurons: Math.round(r.neurons), errors: r.errors, fallbacks: r.fallbacks })) };
}

/* ---------- Ein Aufruf mit Strom (SSE im OpenAI-Format) ---------- */
interface Turn { content: string; toolCalls: { id: string; name: string; args: string }[]; usage: any }
export async function readStream(body: ReadableStream | any, onText: (t: string) => void): Promise<Turn> {
  const out: Turn = { content: '', toolCalls: [], usage: null };
  const reader = (body as ReadableStream).getReader(); const dec = new TextDecoder(); let buf = '';
  const byIdx: Record<number, { id: string; name: string; args: string }> = {};
  const handle = (line: string) => {
    if (!line.startsWith('data:')) return; const data = line.slice(5).trim(); if (!data || data === '[DONE]') return;
    let e: any; try { e = JSON.parse(data); } catch (x) { return; }
    if (e.usage && (e.usage.neurons || e.usage.prompt_tokens)) out.usage = e.usage;
    const ch = e.choices && e.choices[0];
    if (ch && ch.delta) {
      const d = ch.delta;
      if (typeof d.content === 'string' && d.content) { out.content += d.content; onText(d.content); }
      for (const tc of d.tool_calls || []) {
        const i = tc.index ?? 0; const cur = byIdx[i] = byIdx[i] || { id: '', name: '', args: '' };
        if (tc.id) cur.id = tc.id; if (tc.function && tc.function.name) cur.name = tc.function.name;
        if (tc.function && typeof tc.function.arguments === 'string') cur.args += tc.function.arguments;
      }
    } else if (!e.choices && typeof e.response === 'string' && e.response) { out.content += e.response; onText(e.response); }
  };
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let k; while ((k = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, k).trim()); buf = buf.slice(k + 1); }
  }
  if (buf.trim()) handle(buf.trim());
  out.toolCalls = Object.values(byIdx).filter(t => t.name).map((t, i) => ({ id: t.id || 'call-' + i, name: t.name, args: t.args }));
  return out;
}

/* Verlauf: nur das Gespräch von heute (höchstens 4 Nachrichten), sonst verwechseln kleine Modelle alte Antworten mit heute */
function history(msgs: CoachMsg[], today: string): any[] {
  return msgs.filter(m => m && m.text && m.date === today && (m.kind === 'user' || m.kind === 'answer')).sort((a, b) => a.at - b.at).slice(-4)
    .map(m => ({ role: m.from === 'user' ? 'user' : 'assistant', content: String(m.text).slice(0, 600) }));
}

export class FallbackError extends HttpError { constructor(public why: string) { super(503, 'Die KI ist gerade nicht verfügbar. Der Regel-Coach antwortet.'); } }

/* Eine Frage an Workers AI. Wirft FallbackError (→ Regel-Coach in der App) bei leerem Kontingent, Fehler oder erfundenen Zahlen. */
export async function waiChat(env: Env, uid: number, ctx0: EngineCtx, text: string, live?: ChatStream, o: { model?: string; parentNeeded?: boolean } = {}): Promise<ChatResult & { neurons: number; model: string; rounds: number; tools: string[] }> {
  const ctx: any = aiSafeCtx(ctx0);
  ctx.ouraHidden = (ctx0.state.trend || []).some((p: any) => p && p.date === ctx0.today && hasSource(p, 'oura'));
  const now = Date.now();
  const model = o.model || String(env.WAI_MODEL || WAI_DEFAULT);
  const userMsg: CoachMsg = { id: `msg-user-${now}`, at: now, date: ctx.today, kind: 'user', from: 'user', text: String(text).slice(0, 1000) };
  const out: any = { messages: [userMsg], changes: [] as ToolChange[], status: null, neurons: 0, model, rounds: 0, tools: [] as string[] };
  // Sicherheit zuerst: Notfall und Medikamente beantwortet die App selbst
  const hits = checkMessage(text, { minor: isMinor(ctx.profile, ctx.today) });
  const hard = hits.find(h => h.flag === 'emergency' || h.flag === 'medication');
  if (hard) { out.messages.push({ id: `msg-safe-${now}`, at: now + 1, date: ctx.today, kind: 'warning', from: 'coach', text: hard.text, important: hard.flag === 'emergency' }); out.blocked = hard.flag; return out; }
  const st = await freeStatus(env, uid, ctx.state.settings, !!o.parentNeeded);
  if (!st.active) throw new FallbackError(st.reason || 'inactive');
  const system = coachSkill(ctx, BRAND.name) + '\n\nDATEN DES ATHLETEN (Stand heute):\n' + compactContext(ctx);
  const messages: any[] = [{ role: 'system', content: system }, ...history(Object.values(ctx.state.coachMsgs || {}) as CoachMsg[], ctx.today), { role: 'user', content: noThink(model, userMsg.text) }];
  const sources: string[] = [system, userMsg.text, ...messages.map(m => String(m.content || ''))];
  const tools = openAiTools();
  const props: CoachMsg[] = [];
  const propose = (r: any) => { if (r && r.proposal) props.push({ id: `msg-prop-${now}-${props.length}`, at: Date.now(), date: ctx.today, kind: 'proposal', from: 'ai', title: r.proposal.title, text: r.proposal.text, proposal: { changes: r.proposal.changes, status: 'open' } }); };
  // erkannte Frage: Werkzeug schon vorher ausführen (Ergebnis der Regel-Engine), die KI formuliert nur
  const pre = autoTool(ctx, userMsg.text);
  if (pre) {
    const r = runTool(ctx, pre.name, pre.input, { proposeOnly: true });
    const id = 'pre' + String(now).slice(-6);
    messages.push({ role: 'assistant', content: '', tool_calls: [{ id, type: 'function', function: { name: pre.name, arguments: JSON.stringify(pre.input) } }] });
    messages.push({ role: 'tool', tool_call_id: id, name: pre.name, content: String(r.result).slice(0, 6000) });
    sources.push(r.result); out.tools.push(pre.name + '*'); propose(r);
  }
  let final = '', tin = 0, tout = 0, calls = 0;
  // Änderungswunsch: es muss ein Werkzeug aufgerufen werden (sonst behaupten kleine Modelle nur, etwas geändert zu haben)
  const change = !pre && isChangeRequest(userMsg.text);
  let nudged = false, toolCalled = !!pre;
  // Strom ohne Denk-Teil (<|channel>…<channel|>, <think>…</think>) an die App
  let raw = '', sent = '';
  const push = (t: string) => {
    if (!live) return; raw += t;
    const c = cleanPartial(raw);
    if (c.startsWith(sent)) { if (c.length > sent.length) { live.delta(c.slice(sent.length)); sent = c; } }
    else { live.reset(); sent = c; if (c) live.delta(c); }
  };
  try {
    for (let round = 0; round < 4; round++) {
      if (live && round > 0) { live.reset(); raw = ''; sent = ''; }
      const last = round === 3;
      const quiet = change && !props.length && round === 0;
      const body = await env.AI.run(model, { messages, ...(last ? {} : { tools, ...(quiet ? { tool_choice: 'required' } : {}) }), max_tokens: 700, temperature: 0.3, stream: true, ...modelExtras(model) });
      const turn = await readStream(body, t => { if (!quiet) push(t); });
      if (env.WAI_DEBUG) console.log('TURN', round, JSON.stringify({ c: turn.content.slice(0, 300), t: turn.toolCalls, u: turn.usage && turn.usage.neurons }));
      calls++; out.rounds = round + 1;
      if (turn.usage) { out.neurons += Number(turn.usage.neurons || 0); tin += turn.usage.prompt_tokens || 0; tout += turn.usage.completion_tokens || 0; }
      if (!turn.toolCalls.length) {
        // Änderungswunsch ohne Werkzeug: einmal ausdrücklich nachfordern
        if (change && !toolCalled && !nudged && !last) {
          nudged = true;
          messages.push({ role: 'assistant', content: turn.content || '' }, { role: 'user', content: 'Ändere nichts mit Worten. Rufe jetzt genau das passende Werkzeug auf (add_rule, move_session, modify_session oder cancel_session; die IDs stehen in den Daten). Antworte erst nach dem Ergebnis.' });
          continue;
        }
        final = turn.content; break;
      }
      toolCalled = true;
      messages.push({ role: 'assistant', content: turn.content || '', tool_calls: turn.toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.args || '{}' } })) });
      for (const tc of turn.toolCalls) {
        let input: any = {}; try { input = tc.args ? JSON.parse(tc.args) : {}; } catch (e) { input = {}; }
        let r;
        try { r = runTool(ctx, tc.name, input, { proposeOnly: true }); } catch (e) { r = { result: 'Interner Fehler: ' + (e as Error).message, isError: true, changes: [] }; }
        out.tools.push(tc.name);
        out.changes.push(...r.changes);
        propose(r);
        sources.push(r.result);
        messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.name, content: String(r.result).slice(0, 6000) });
      }
    }
  } catch (e) {
    if (e instanceof FallbackError) throw e;
    await addWaiUsage(env, uid, { calls, neurons: out.neurons, tin, tout, errors: 1, fallbacks: 1 });
    throw new FallbackError('error: ' + String((e as Error).message || e).slice(0, 120));
  }
  if (change && !toolCalled) {
    await addWaiUsage(env, uid, { calls, neurons: out.neurons, tin, tout, fallbacks: 1 });
    throw new FallbackError('change without tool');
  }
  final = cleanAnswer(final);
  const bad = inventedNumbers(final, sources);
  const claimed = claimsChange(final) && !props.length;
  if (!final || bad.length || claimed || leaksInternals(final)) {
    await addWaiUsage(env, uid, { calls, neurons: out.neurons, tin, tout, fallbacks: 1 });
    throw new FallbackError(!final ? 'empty' : bad.length ? 'invented: ' + bad.join(', ') : claimed ? 'claimed change without proposal' : 'internals');
  }
  await addWaiUsage(env, uid, { questions: 1, calls, neurons: out.neurons, tin, tout });
  hits.filter(h => h.flag !== 'emergency' && h.flag !== 'medication').forEach((h, i) => out.messages.push({ id: `msg-hint-${now}-${i}`, at: Date.now(), date: ctx.today, kind: 'warning', from: 'coach', text: h.text }));
  out.messages.push({ id: `msg-ai-${now}`, at: Date.now() + 2, date: ctx.today, kind: 'answer', from: 'ai', text: final, by: 'free' } as any);
  // Vorschläge nach der Antwort, damit „bestätige ihn unten“ stimmt
  props.forEach((m, i) => out.messages.push({ ...m, at: Date.now() + 3 + i }));
  out.status = await freeStatus(env, uid, ctx.state.settings, !!o.parentNeeded);
  return out;
}
