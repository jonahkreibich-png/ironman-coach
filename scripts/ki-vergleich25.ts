/* Auftrag 25: Modellvergleich mit 60 Fragen (docs/ki-vergleich-25/fragen.json) auf einer lokalen Kopie echter Daten (nur lesen).
   Echte Aufrufe an Workers AI über die Wrangler-Anmeldung (Gratis-Kontingent). Je Frage: Antwort, Neurons, Tokens, Aufrufe, Werkzeuge,
   Rückfall-Grund und eine automatische Prüfung. Zum Vergleich: geschätzte Tokens des alten Aufbaus (alles in jeder Anfrage).
   Aufruf: npx vite-node scripts/ki-vergleich25.ts -- <modell> <kopie.sqlite> <ausgabe.json> [nutzer=1] [heute] [von=0] [bis=60] [jede n-te=1] */
import fs from 'node:fs';
import { D1Shim } from '../server/test/d1-shim.mjs';
import { loadState, engineCtx } from '../server/src/coach';
import { waiChat, FallbackError } from '../server/src/wai';
import { aiSafeCtx } from '../server/src/ai';
import { coachSkill, compactContext, openAiTools } from '../shared/coach/freeai';
import { converse } from '../shared/coach/dialog';
// @ts-ignore
import { AI } from './lib/wai-rest.mjs';
const [model, src, out, uidS, todayArg, fromS, toS, stepS] = process.argv.slice(2).filter(a => a !== '--');
if (!model || !src || !out) { console.error('Aufruf: <modell> <kopie.sqlite> <ausgabe.json> [nutzer] [heute] [von] [bis]'); process.exit(1); }
const UID = +(uidS || 1); const TODAY = todayArg || new Date().toISOString().slice(0, 10);
const QS: { q: string; cat: string }[] = JSON.parse(fs.readFileSync('docs/ki-vergleich-25/fragen.json', 'utf8')).slice(+(fromS || 0), +(toS || 60)).filter((_: any, i: number) => i % +(stepS || 1) === 0);
// Arbeitskopie der Datenbank nie neben die Ausgabe, sondern in scratch/ (nicht im Git); danach gelöscht
const dbf = 'scratch/ki-vergleich-' + Date.now() + '.sqlite';
fs.copyFileSync(src, dbf);
const DB = new D1Shim(dbf); DB.execFile('server/migrations/0006_wai.sql');
const env: any = { DB, AI, WAI_MAX_PER_DAY: '10000', WAI_USER_SHARE: '1', WAI_DAILY_NEURONS: '1e9', WAI_MODEL: model };
const tok = (s: string) => Math.round(s.length / 3.3);
/* automatische Prüfung je Art der Frage */
function check(cat: string, r: any, err: string): string[] {
  const bad: string[] = [];
  if (err) return ['Rückfall: ' + err];
  const ans = r.messages.filter((m: any) => m.kind === 'answer').map((m: any) => m.text).join(' ');
  const props = r.messages.filter((m: any) => m.kind === 'proposal');
  if (!ans) bad.push('leer');
  if ((ans.match(/[.!?](\s|$)/g) || []).length > 6) bad.push('zu lang');
  if (/\*\*|^#|^\s*[-*]\s/m.test(ans)) bad.push('Markdown');
  if (/\b(warum|grund)\b[^.]*\?/i.test(ans) && cat === 'change') bad.push('fragt nach Grund');
  if (cat === 'change' && !props.length && !/\?\s*$/.test(ans)) bad.push('Änderung ohne Vorschlag');
  if (cat === 'review' && !r.tools.some((t: string) => /review_training|get_data|get_analysis/.test(t))) bad.push('ohne Auswertung');
  if (cat === 'other' && /gedicht/i.test(r.q || '') && /pizza.*\n.*pizza/i.test(ans)) bad.push('Gedicht geschrieben');
  if (/\b(I |the |and )\b/.test(ans)) bad.push('Englisch');
  return bad;
}
const res: any[] = [];
for (const { q, cat } of QS) {
  const L = await loadState(env, UID); L.state.settings = { ...(L.state.settings || {}), freeAi: { consentAt: 1 } };
  L.state.coachMsgs = {}; // jede Frage einzeln, ohne Verlauf
  const ctx = engineCtx(L, TODAY); ctx.now = Date.parse(TODAY + 'T15:00:00Z');
  const safe: any = aiSafeCtx(ctx);
  const oldTokensPerCall = tok(coachSkill(safe, 'Stamio')) + tok(compactContext(safe)) + tok(JSON.stringify(openAiTools())) + tok(q);
  const before: any = await DB.prepare('SELECT COALESCE(SUM(tokens_in),0) AS ti, COALESCE(SUM(tokens_out),0) AS tt, COALESCE(SUM(neurons),0) AS n, COALESCE(SUM(calls),0) AS c FROM wai_usage').first();
  const t0 = Date.now(); let r: any = null, err = '';
  try { r = await waiChat(env, UID, ctx, q); r.q = q; } catch (e) { err = e instanceof FallbackError ? e.why : 'ERR ' + (e as Error).message; }
  const after: any = await DB.prepare('SELECT COALESCE(SUM(tokens_in),0) AS ti, COALESCE(SUM(tokens_out),0) AS tt, COALESCE(SUM(neurons),0) AS n, COALESCE(SUM(calls),0) AS c FROM wai_usage').first();
  let rule = ''; try { rule = converse(engineCtx(await loadState(env, UID), TODAY), {}, q).reply.text; } catch (e) { rule = 'FEHLER ' + (e as Error).message; }
  const row = {
    q, cat, ms: Date.now() - t0, err, topic: r ? r.topic : null, tools: r ? r.tools : [],
    answer: r ? r.messages.filter((m: any) => m.from !== 'user').map((m: any) => (m.kind === 'proposal' ? '[VORSCHLAG] ' + m.title + (m.text ? ' – ' + m.text : '') : m.text)).join('\n') : '',
    neurons: Math.round((after.n - before.n) * 10) / 10, tokensIn: after.ti - before.ti, tokensOut: after.tt - before.tt, calls: after.c - before.c,
    oldTokensPerCall, checks: check(cat, r, err), rule
  };
  res.push(row);
  console.log(`\n### [${cat}] ${q}  (${row.ms} ms, ${row.neurons} N, ${row.tokensIn}/${row.tokensOut} Tokens, ${row.calls} Aufrufe, ${row.tools.join(',')})${row.checks.length ? '  !! ' + row.checks.join('; ') : ''}\n${row.answer || '(Regel-Coach) ' + rule}`);
  fs.writeFileSync(out, JSON.stringify(res, null, 1));
}
const ok = res.filter(r => !r.err);
const avg = (k: string, l = ok) => Math.round(l.reduce((a, r) => a + r[k], 0) / Math.max(1, l.length) * 10) / 10;
console.log('\nSUMME', model, 'ohne Rückfall', ok.length, '/', res.length, 'ohne Befund', res.filter(r => !r.checks.length).length, 'Ø Neurons', avg('neurons', res), 'Ø Tokens ein', avg('tokensIn', res), 'Ø aus', avg('tokensOut', res), 'Ø Aufrufe', avg('calls', res), 'Ø alt je Aufruf', avg('oldTokensPerCall', res), 'Ø ms', avg('ms', res));
try { fs.unlinkSync(dbf); } catch (e) { /* Kopie bleibt */ }
