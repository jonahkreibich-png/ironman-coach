/* Auftrag 16: KI-Vergleich mit echten Daten (lokale Kopie der Datenbank, nur lesen; Oura entfernt der Server-Code). Echte Aufrufe an Workers AI
   über die Wrangler-Anmeldung (verbraucht Neurons des Gratis-Kontingents). Schreibt je Frage Antwort, Neurons, Zeit, Werkzeuge und die Antwort des Regel-Coachs.
   Aufruf: npx vite-node scripts/ki-vergleich.ts -- <modell> <kopie.sqlite> <fragen.json:schlüssel> <ausgabe.json> <nutzer> [heute] */
import fs from 'node:fs';
import { D1Shim } from '../server/test/d1-shim.mjs';
import { loadState, engineCtx } from '../server/src/coach';
import { waiChat, FallbackError } from '../server/src/wai';
import { converse } from '../shared/coach/dialog';
// @ts-ignore
import { AI } from './lib/wai-rest.mjs';
const [model, src, qspec, out, uidS, todayArg] = process.argv.slice(2).filter(a => a !== "--"); const UID = +(uidS || 1); const TODAY = todayArg || new Date().toISOString().slice(0, 10);
if (!model || !src || !qspec || !out) { console.error("Aufruf: <modell> <kopie.sqlite> <fragen.json:schlüssel> <ausgabe.json> <nutzer> [heute]"); process.exit(1); }
// Arbeitskopie, damit der Verbrauch nicht in der Kopie landet
const dbf = out.replace(/.json$/, '') + '.sqlite';
fs.copyFileSync(src, dbf);
const DB = new D1Shim(dbf); DB.execFile('server/migrations/0006_wai.sql');
const env: any = { DB, AI, WAI_MAX_PER_DAY: '10000', WAI_USER_SHARE: '1', WAI_DAILY_NEURONS: '1e9', WAI_MODEL: model, WAI_DEBUG: process.env.WAI_DEBUG };
const [qfile, qkey] = qspec.split(':'); const qj = JSON.parse(fs.readFileSync(qfile, 'utf8')); const qs: string[] = qkey ? qj[qkey] : qj;
const res: any[] = [];
for (const q of qs) {
  const L = await loadState(env, UID); L.state.settings = { ...(L.state.settings || {}), freeAi: { consentAt: 1 } };
  const ctx = engineCtx(L, TODAY); ctx.now = Date.parse(TODAY + 'T15:00:00Z');
  const t0 = Date.now(); let r: any = null, err = '', streamed = '';
  try { r = await waiChat(env, UID, ctx, q, { delta: t => { streamed += t; }, reset: () => { streamed = ''; } }); } catch (e) { err = e instanceof FallbackError ? 'FALLBACK ' + e.why : 'ERR ' + (e as Error).message; }
  const rule = converse(engineCtx(await loadState(env, UID), TODAY), {}, q).reply;
  const used = (await DB.prepare("SELECT neurons, tokens_in, tokens_out, calls FROM wai_usage WHERE user_id = " + UID).first());
  const row = { q, ms: Date.now() - t0, answer: r ? r.messages.filter((m: any) => m.from !== 'user').map((m: any) => (m.kind === 'proposal' ? '[VORSCHLAG] ' + m.title : m.text)).join('\n') : '', err, tools: r ? r.tools : [], neurons: r ? Math.round(r.neurons * 10) / 10 : null, rounds: r ? r.rounds : null, total: used, rule: rule.text };
  res.push(row);
  console.log(`\n### ${q}  [${row.ms} ms, ${row.neurons} N, tools ${row.tools.join(',')}]${err ? ' ' + err : ''}\n${row.answer}`);
  fs.writeFileSync(out, JSON.stringify(res, null, 1));
}
const ok = res.filter(r => !r.err);
console.log('\nSUMME', model, 'ok', ok.length, '/', res.length, 'Ø Neurons', Math.round(ok.reduce((a, r) => a + r.neurons, 0) / Math.max(1, ok.length) * 10) / 10, 'Ø ms', Math.round(res.reduce((a, r) => a + r.ms, 0) / res.length));
