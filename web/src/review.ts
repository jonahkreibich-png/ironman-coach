/* Bewertung nach jeder erledigten Einheit in der App (Auftrag 12): beim Abhaken und wenn Werte eingetragen werden (kurz verzögert),
   für Einheiten von heute bis vor 2 Tagen. Dieselbe Kennung wie auf dem Server (msg-review-…), damit es nur eine Nachricht gibt;
   kommen später Werte dazu, wird sie aktualisiert. Einstellung: ausführlich, kurz oder aus. */
import { STATE, saveSoon } from './store';
import { D, invalidate } from './data';
import { doneItems, autoReview, reviewInputSig, reviewChange } from '../../shared/coach/review';
import * as C from '../../shared/core';

export function reviewMode(): 'full' | 'short' | 'off' { const m = (STATE.settings || {}).coachReview; return m === 'short' || m === 'off' ? m : 'full'; }
let timer: any = null;
export function reviewSoon(key: string, date: string, delay = 1500) { clearTimeout(timer); timer = setTimeout(() => { try { reviewNow(key, date); } catch (e) { /* Bewertung darf nie stören */ } }, delay); }
export function reviewNow(key: string, date: string): boolean {
  const mode = reviewMode(); if (mode === 'off') return false;
  invalidate();
  const ctx = D().engine;
  if (date > ctx.today) return false;
  const d = doneItems(ctx, date, date).find(x => x.key === key); if (!d) return false;
  const id = 'msg-review-' + key; const old = STATE.coachMsgs[id];
  const text = autoReview(ctx, d, mode);
  const sig = reviewInputSig(ctx, key);
  const how = reviewChange(old, text, sig);
  if (how === 'same') return false;
  // Auftrag 21: „Korrigiert“ nur bei geänderten Werten; neue Formulierung (App-Update) still übernehmen
  if (how === 'quiet') { STATE.coachMsgs[id] = { ...old, resultText: text, text: /^Korrigiert:/.test(old.text || '') ? 'Korrigiert: neu bewertet mit deinen geänderten Werten. Die alte Bewertung gilt nicht mehr.\n\n' + text : text, inputSig: sig }; saveSoon(); return true; }
  STATE.coachMsgs[id] = { ...(old || {}), id, at: old ? old.at : Date.now(), date, kind: 'session', from: 'coach', title: (old ? 'Bewertung aktualisiert: ' : 'Bewertung: ') + d.title, resultText: text, text: old ? 'Korrigiert: neu bewertet mit deinen geänderten Werten. Die alte Bewertung gilt nicht mehr.\n\n' + text : text, unread: true, inputSig: sig, refs: d.custom ? {} : { sessionId: key } };
  saveSoon();
  return true;
}
