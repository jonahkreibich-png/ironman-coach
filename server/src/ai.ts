/* KI-Coach (Claude) auf dem Server. Vollständig gebaut, aber nur aktiv, wenn
   1. der API-Schlüssel ANTHROPIC_API_KEY als Cloudflare-Secret hinterlegt ist,
   2. der Nutzer den Schalter in den Einstellungen eingeschaltet und
   3. der Weitergabe von Gesundheitsdaten zugestimmt hat (Einwilligungs-Bildschirm).
   Ohne das läuft nur die Regel-Engine. Budget: Monatsbudget und Höchstzahl an Nachrichten pro Tag. */
import Anthropic from '@anthropic-ai/sdk';
import { type Env, berlinDate, putRecords, getRecord } from './store';
import { HttpError } from './http';
import { COACHING_HANDBOOK } from '../../shared/coach/handbook';
import { TOOL_DEFS, runTool, type ToolChange } from '../../shared/coach/tools';
import { checkMessage } from '../../shared/coach/safety';
import { buildContext } from '../../shared/coach/summary';
import type { EngineCtx, CoachMsg } from '../../shared/coach/engine';
import { isMinor, ageOf } from '../../shared/profile';
import { BRAND } from '../../shared/brand';
import { withoutSource, hasSource } from '../../shared/activity/merge';

/* Oura-Daten dürfen laut Oura-API-Vertrag (gültig ab 08.06.2026, Abschnitt 4(d)) nicht an KI-Modelle gehen. Sie werden vor jedem KI-Aufruf entfernt. */
export const NO_AI_SOURCES = ['oura'];
export function aiSafeCtx(ctx: EngineCtx): EngineCtx {
  let trend = ctx.state.trend || [];
  for (const s of NO_AI_SOURCES) trend = withoutSource(trend, s);
  const acts = Object.fromEntries(Object.entries(ctx.state.activities || {}).filter(([, a]: any) => !a || !NO_AI_SOURCES.includes(a.source)));
  return { ...ctx, state: { ...ctx.state, trend, activities: acts } };
}

/* Stärkstes Modell für Gespräche und Wochenplanung, günstiges Modell für Routine (Briefings, Kommentare, Essensfotos) */
export const MODELS = { strong: 'claude-opus-5-5', routine: 'claude-haiku-5-5' } as const;
/* US-Dollar pro 1 Mio. Tokens (Stand Oktober 2026) */
export const PRICES: Record<string, { in: number; out: number }> = { 'claude-opus-5-5': { in: 4, out: 20 }, 'claude-haiku-5-5': { in: 0.1, out: 0.5 } };

/* Austauschbar für Tests (Mock ohne echte Aufrufe) */
export type CreateFn = (params: any) => Promise<any>;
let createOverride: CreateFn | null = null;
export function setCreateOverride(fn: CreateFn | null) { createOverride = fn; }
function creator(env: Env): CreateFn {
  if (createOverride) return createOverride;
  const client = new Anthropic({ apiKey: String(env.ANTHROPIC_API_KEY).trim() });
  return (params: any) => client.beta.messages.create(params);
}

export interface AiStatus { keyPresent: boolean; enabled: boolean; consent: boolean; active: boolean; monthUsd: number; budgetUsd: number; todayMessages: number; maxPerDay: number }
/* minor: unter 18 zählt die Einwilligung nur zusammen mit der eines Elternteils (parentConsent) */
export async function aiStatus(env: Env, uid: number, settings: any, minor = false): Promise<AiStatus> {
  const ai = (settings && settings.ai) || {};
  const month = berlinDate().slice(0, 7);
  const m = await env.DB.prepare('SELECT COALESCE(SUM(cost_micro),0) AS c FROM ai_usage WHERE user_id = ? AND day LIKE ?').bind(uid, month + '%').first();
  const d = await env.DB.prepare('SELECT messages FROM ai_usage WHERE user_id = ? AND day = ?').bind(uid, berlinDate()).first();
  const keyPresent = !!(env.ANTHROPIC_API_KEY && String(env.ANTHROPIC_API_KEY).trim().length > 20) || !!createOverride;
  const budgetUsd = Math.min(Number(ai.budgetUsd || env.AI_MONTHLY_BUDGET_USD || 5), Number(env.AI_MONTHLY_BUDGET_MAX_USD || 20));
  const maxPerDay = Number(ai.maxPerDay || env.AI_MAX_MESSAGES_PER_DAY || 30);
  const st = { keyPresent, enabled: !!ai.enabled, consent: !!ai.consentAt && (!minor || !!ai.parentConsent), monthUsd: (m ? m.c : 0) / 1e6, budgetUsd, todayMessages: d ? d.messages : 0, maxPerDay, active: false };
  st.active = st.keyPresent && st.enabled && st.consent && st.monthUsd < st.budgetUsd && st.todayMessages < st.maxPerDay;
  return st;
}
async function addUsage(env: Env, uid: number, model: string, usage: any, countMessage: boolean) {
  const p = PRICES[model] || PRICES[MODELS.strong];
  const tin = (usage && (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0)) || 0;
  const tout = (usage && usage.output_tokens) || 0;
  const cost = Math.round(((usage.input_tokens || 0) * p.in + (usage.cache_creation_input_tokens || 0) * p.in * 1.25 + (usage.cache_read_input_tokens || 0) * p.in * 0.1 + tout * p.out));
  await env.DB.prepare(`INSERT INTO ai_usage (user_id, day, messages, tokens_in, tokens_out, cost_micro) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, day) DO UPDATE SET messages = messages + excluded.messages, tokens_in = tokens_in + excluded.tokens_in, tokens_out = tokens_out + excluded.tokens_out, cost_micro = cost_micro + excluded.cost_micro`)
    .bind(uid, berlinDate(), countMessage ? 1 : 0, tin, tout, cost).run();
}

function systemPrompt(ctx: EngineCtx): string {
  const minor = isMinor(ctx.profile, ctx.today);
  return [
    COACHING_HANDBOOK,
    `\n## Diese App\nDu bist der Coach in der App „${BRAND.name}“. Heute ist ${ctx.today}. Antworte in höchstens 120 Wörtern, außer der Athlet will eine ausführliche Wochenplanung.`,
    minor ? `\n## Wichtig\nDer Athlet ist ${ageOf(ctx.profile, ctx.today)} Jahre alt und minderjährig: keine Gewichtsziele, keine Kalorien-Defizite, kein Druck. Schule und Schlaf gehen vor.` : '',
    '\nNutze die Werkzeuge für jede Planänderung. Wenn die Regel-Engine ablehnt, erkläre kurz warum und schlage eine erlaubte Alternative vor.'
  ].join('\n');
}

/* Bisheriger Chat als Gesprächsverlauf (nur Text, höchstens 12 Nachrichten) */
function history(msgs: CoachMsg[]): any[] {
  const list = msgs.filter(m => m.kind !== 'proposal' || m.text).sort((a, b) => a.at - b.at).slice(-12);
  const out: any[] = [];
  for (const m of list) {
    const role = m.from === 'user' ? 'user' : 'assistant';
    const text = m.title && m.from !== 'user' ? `${m.title}: ${m.text}` : m.text;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += '\n\n' + text;
    else out.push({ role, content: text });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

export interface ChatResult { messages: CoachMsg[]; changes: ToolChange[]; status: AiStatus; blocked?: string }
/* Eine Nachricht an den KI-Coach. Werkzeuge werden in einer Schleife ausgeführt (höchstens 6 Runden). */
export async function aiChat(env: Env, uid: number, ctx0: EngineCtx, text: string): Promise<ChatResult> {
  const ctx = aiSafeCtx(ctx0);
  const now = Date.now();
  const userMsg: CoachMsg = { id: `msg-user-${now}`, at: now, date: ctx.today, kind: 'user', from: 'user', text: String(text).slice(0, 2000) };
  const out: ChatResult = { messages: [userMsg], changes: [], status: await aiStatus(env, uid, ctx.state.settings, isMinor(ctx.profile, ctx.today)) };
  // Sicherheit zuerst: Notfall, Medikamente und Diagnosen beantwortet die App selbst, ohne KI
  const hits = checkMessage(text);
  const hard = hits.find(h => h.flag === 'emergency' || h.flag === 'medication');
  if (hard) { out.messages.push({ id: `msg-safe-${now}`, at: now + 1, date: ctx.today, kind: 'warning', from: 'coach', text: hard.text, important: hard.flag === 'emergency' }); out.blocked = hard.flag; return out; }
  if (!out.status.active) {
    const why = !out.status.keyPresent ? 'Der KI-Coach ist noch nicht eingerichtet (kein API-Schlüssel).' : !out.status.consent ? 'Für den KI-Coach fehlt deine Einwilligung.' : !out.status.enabled ? 'Der KI-Coach ist ausgeschaltet.' : out.status.monthUsd >= out.status.budgetUsd ? 'Das Monatsbudget für den KI-Coach ist aufgebraucht.' : 'Für heute sind alle KI-Nachrichten verbraucht.';
    throw new HttpError(403, why + ' Die Schnellfragen und „Mit Claude besprechen“ funktionieren weiter.');
  }
  const create = creator(env);
  const prior = Object.values(ctx.state.coachMsgs || {}) as CoachMsg[];
  const context = buildContext(ctx, { days: 28, appName: BRAND.name });
  const messages: any[] = [...history(prior), { role: 'user', content: [{ type: 'text', text: `<daten>\n${context}\n</daten>` }, { type: 'text', text: userMsg.text }] }];
  // Eingaben prüft runTool selbst (Datum, IDs, Regeln), deshalb ohne strict
  const tools = TOOL_DEFS.map(t => ({ ...t }));
  let finalText = '';
  for (let round = 0; round < 6; round++) {
    const res = await create({
      model: MODELS.strong, max_tokens: 16000,
      output_config: { effort: 'high' },
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      system: [{ type: 'text', text: systemPrompt(ctx), cache_control: { type: 'ephemeral' } }],
      tools, tool_choice: { type: 'auto' }, messages
    });
    await addUsage(env, uid, MODELS.strong, res.usage || {}, round === 0);
    if (res.stop_reason === 'refusal') { finalText = 'Dazu kann ich dir keine Antwort geben. Frag mich gern etwas zu deinem Training.'; break; }
    messages.push({ role: 'assistant', content: res.content });
    const toolUses = (res.content || []).filter((b: any) => b.type === 'tool_use');
    const texts = (res.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
    if (texts) finalText = texts;
    if (res.stop_reason !== 'tool_use' || !toolUses.length) break;
    const results: any[] = [];
    for (const tu of toolUses) {
      let o;
      try { o = runTool(ctx, tu.name, tu.input || {}); } catch (e) { o = { result: 'Interner Fehler: ' + (e as Error).message, isError: true, changes: [] }; }
      out.changes.push(...o.changes);
      // sofortige Änderungen auch für die nächsten Werkzeuge sichtbar machen
      o.changes.filter((c: ToolChange) => c.kind === 'adjust').forEach((c: ToolChange) => { ctx.state.adjustments = { ...(ctx.state.adjustments || {}), [c.key]: c.data }; });
      if (o.proposal) out.messages.push({ id: `msg-prop-${now}-${out.messages.length}`, at: Date.now(), date: ctx.today, kind: 'proposal', from: 'ai', title: o.proposal.title, text: o.proposal.text, proposal: { changes: o.proposal.changes, status: 'open' } });
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: o.result, ...(o.isError ? { is_error: true } : {}) });
    }
    messages.push({ role: 'user', content: results });
  }
  // Warnhinweise (z. B. Fieber, Essen) zusätzlich zur Antwort
  hits.filter(h => h.flag !== 'emergency' && h.flag !== 'medication').forEach((h, i) => out.messages.push({ id: `msg-hint-${now}-${i}`, at: Date.now(), date: ctx.today, kind: 'warning', from: 'coach', text: h.text }));
  out.messages.push({ id: `msg-ai-${now}`, at: Date.now() + 2, date: ctx.today, kind: 'answer', from: 'ai', text: finalText || 'Erledigt.' });
  out.status = await aiStatus(env, uid, ctx.state.settings, isMinor(ctx.profile, ctx.today));
  return out;
}

/* Routine: Text der Engine natürlicher formulieren (günstiges Modell). Fällt bei Fehlern auf den Engine-Text zurück. */
export async function aiRephrase(env: Env, uid: number, ctx: EngineCtx, msg: CoachMsg): Promise<CoachMsg> {
  try {
    const st = await aiStatus(env, uid, ctx.state.settings, isMinor(ctx.profile, ctx.today));
    if (!st.active || st.monthUsd > st.budgetUsd * 0.8) return msg;
    // Nachrichten, die auf Oura-Werten beruhen, nie an die KI geben
    const p = (ctx.state.trend || []).find((x: any) => x && x.date === msg.date);
    if ((msg.kind === 'briefing' || msg.kind === 'adjust') && NO_AI_SOURCES.some(src => hasSource(p, src))) return msg;
    if (msg.refs && msg.refs.activityId && NO_AI_SOURCES.some(src => String(msg.refs!.activityId).startsWith(src))) return msg;
    const res = await creator(env)({
      model: MODELS.routine, max_tokens: 1000,
      system: 'Du formulierst Nachrichten eines Ausdauer-Coachs auf Deutsch um: kurz (höchstens 60 Wörter), natürlich, ermutigend, du-Form. Alle Zahlen und Fakten exakt übernehmen, nichts dazuerfinden, keine Medikamente oder Diagnosen.' + (isMinor(ctx.profile, ctx.today) ? ' Der Athlet ist minderjährig: kein Druck, keine Gewichtsthemen.' : ''),
      messages: [{ role: 'user', content: msg.text }]
    });
    await addUsage(env, uid, MODELS.routine, res.usage || {}, false);
    const text = (res.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ').trim();
    return text && res.stop_reason !== 'refusal' ? { ...msg, text, from: 'ai' } : msg;
  } catch (e) { return msg; }
}

/* Essen per Foto: Schätzung als Bereich. Das Foto wird nicht gespeichert. */
export interface FoodEstimate { kcal: [number, number]; carbs: [number, number]; protein: [number, number]; fat: [number, number]; items: string[]; note: string }
export async function aiFoodEstimate(env: Env, uid: number, settings: any, imageB64: string, mediaType: string, question: string, minor: boolean): Promise<{ estimate: FoodEstimate; status: AiStatus }> {
  const st = await aiStatus(env, uid, settings, minor);
  if (!st.active) throw new HttpError(403, 'Essen per Foto braucht den KI-Coach. Bis dahin kannst du Foto und Frage an die Claude-App schicken.');
  if (!/^image\/(jpeg|png|webp|gif)$/.test(mediaType)) throw new HttpError(400, 'Nur Fotos (JPEG, PNG, WebP).');
  if (imageB64.length > 5 * 1024 * 1024) throw new HttpError(413, 'Das Foto ist zu groß.');
  const res = await creator(env)({
    model: MODELS.routine, max_tokens: 2000,
    system: 'Du schätzt Nährwerte von Mahlzeiten auf Fotos. Antworte NUR mit JSON: {"kcal":[min,max],"carbs":[min,max],"protein":[min,max],"fat":[min,max],"items":["…"],"note":"ein Satz"}. Gramm für Makros. Immer Bereiche, nie exakte Werte. Keine Bewertung des Essens, keine Diät-Tipps.' + (minor ? ' Der Nutzer ist minderjährig: keine Hinweise zu Gewicht oder Abnehmen.' : ''),
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: imageB64 } }, { type: 'text', text: question || 'Wie viel ist das ungefähr?' }] }]
  });
  await addUsage(env, uid, MODELS.routine, res.usage || {}, true);
  const text = (res.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  let est: any;
  try { est = JSON.parse(text.slice(a, b + 1)); } catch (e) { throw new HttpError(502, 'Die Schätzung konnte nicht gelesen werden. Versuch es nochmal.'); }
  const rng = (v: any): [number, number] => Array.isArray(v) && v.length === 2 ? [Math.max(0, Math.round(+v[0])), Math.max(0, Math.round(+v[1]))] : [0, 0];
  return { estimate: { kcal: rng(est.kcal), carbs: rng(est.carbs), protein: rng(est.protein), fat: rng(est.fat), items: Array.isArray(est.items) ? est.items.slice(0, 8).map(String) : [], note: String(est.note || '').slice(0, 200) }, status: await aiStatus(env, uid, settings, minor) };
}

/* Vorschlag übernehmen oder ablehnen */
export async function decideProposal(env: Env, uid: number, msgId: string, accept: boolean): Promise<{ applied: number }> {
  const rec = await getRecord(env, uid, 'coachMsg', msgId);
  if (!rec || !rec.data || !rec.data.proposal) throw new HttpError(404, 'Vorschlag nicht gefunden.');
  if (rec.data.proposal.status !== 'open') throw new HttpError(409, 'Über diesen Vorschlag wurde schon entschieden.');
  const t = Math.max(Date.now(), rec.updatedAt + 1);
  const changes = accept ? (rec.data.proposal.changes || []).map((c: any, i: number) => ({ kind: c.kind, key: c.key, data: c.data, updatedAt: t + i })) : [];
  changes.push({ kind: 'coachMsg', key: msgId, data: { ...rec.data, proposal: { ...rec.data.proposal, status: accept ? 'accepted' : 'rejected' } }, updatedAt: t + 99 });
  await putRecords(env, uid, changes);
  return { applied: accept ? changes.length - 1 : 0 };
}
