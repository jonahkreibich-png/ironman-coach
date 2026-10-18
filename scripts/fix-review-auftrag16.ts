/* Auftrag 16: Bewertungen, die mit der alten Logik entstanden sind (z. B. „Bei Intervallen zählt der Puls …“ für einen lockeren langen Lauf),
   mit der neuen Logik neu schreiben. Liest eine lokale Kopie (nur lesen) und schreibt eine SQL-Datei für D1; das Skript selbst ändert nichts.
   Aufruf: npx vite-node scripts/fix-review-auftrag16.ts -- <kopie.sqlite> <nutzer> <ausgabe.sql> <heute JJJJ-MM-TT> */
import fs from 'node:fs';
import { D1Shim } from '../server/test/d1-shim.mjs';
import { loadState, engineCtx } from '../server/src/coach';
import { doneItems, autoReview } from '../shared/coach/review';

const [dbFile, uidS, outFile, today] = process.argv.slice(2).filter(a => a !== '--');
const uid = +uidS;
if (!dbFile || !uid || !outFile || !today) { console.error('Aufruf: <kopie.sqlite> <nutzer> <ausgabe.sql> <heute>'); process.exit(1); }
const env: any = { DB: new D1Shim(dbFile) };
const L = await loadState(env, uid);
const ctx = engineCtx(L, today);
const mode = ((ctx.state.settings || {}).coachReview || 'full') as 'full' | 'short';
const OLD = /Bei Intervallen zählt der Puls|von \d+ Intervallen geschafft|prüf die Runden/;
const out: { key: string; data: any }[] = [];
for (const m of Object.values(ctx.state.coachMsgs || {}) as any[]) {
  if (!m || !/^msg-review-/.test(m.id) || !OLD.test(m.text || '')) continue;
  const key = m.id.slice('msg-review-'.length);
  const d = doneItems(ctx, m.date, m.date).find(x => x.key === key || (x.act && x.act.id === key));
  if (!d) continue;
  // „Nächste Tage“ bleibt wie damals (passt zum Datum der Nachricht)
  const oldNext = (m.text.split('\n').find((l: string) => l.startsWith('➡️')) || '');
  const text = autoReview(ctx, d, mode).split('\n').map((l: string) => l.startsWith('➡️') && oldNext ? oldNext : l).join('\n');
  if (OLD.test(text) && !/von \d+ Intervallen geschafft/.test(text)) { console.error('Neue Bewertung enthält noch den alten Fehler:', text); process.exit(1); }
  console.log('ALT:', m.text.replace(/\n/g, ' '), '\nNEU:', text.replace(/\n/g, ' '));
  out.push({ key: m.id, data: { ...m, text: text + '\n(Neu bewertet: Automatische Runden der Uhr zählen nicht mehr als Intervalle.)', unread: true } });
}
const now = Date.now();
const q = (s: string) => "'" + s.replace(/'/g, "''") + "'";
const sql: string[] = [];
out.forEach((rec, n) => {
  sql.push("UPDATE meta SET v = CAST(v AS INTEGER) + 1 WHERE k = 'rev';");
  sql.push(`UPDATE records SET data = ${q(JSON.stringify(rec.data))}, updated_at = ${now + n}, rev = (SELECT CAST(v AS INTEGER) FROM meta WHERE k = 'rev') WHERE user_id = ${uid} AND kind = 'coachMsg' AND key = ${q(rec.key)};`);
});
fs.writeFileSync(outFile, sql.join('\n') + '\n');
console.log(out.length, 'Bewertung(en) →', outFile);
