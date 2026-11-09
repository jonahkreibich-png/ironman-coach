/* Bewertung nach jeder erledigten Einheit in der App (Auftrag 12): beim Abhaken und wenn Werte eingetragen werden (kurz verzögert),
   für Einheiten von heute bis vor 2 Tagen. Dieselbe Kennung wie auf dem Server (msg-review-…), damit es nur eine Nachricht gibt;
   kommen später Werte dazu, wird sie aktualisiert. Einstellung: ausführlich, kurz oder aus. */
import { STATE, saveSoon } from './store';
import { D, invalidate } from './data';
import { doneItems, autoReview, reviewInputSig, reviewChange, reviewMsgId } from '../../shared/coach/review';
import * as C from '../../shared/core';

export function reviewMode(): 'full' | 'short' | 'off' { const m = (STATE.settings || {}).coachReview; return m === 'short' || m === 'off' ? m : 'full'; }
let timer: any = null;
let pendingReview: [string, string] | null = null;
export function reviewSoon(key: string, date: string, delay = 1500) { clearTimeout(timer); pendingReview = [key, date]; timer = setTimeout(() => { pendingReview = null; try { reviewNow(key, date); } catch (e) { /* Bewertung darf nie stören */ } }, delay); }
/* Auftrag 29: App wird verlassen oder neu geladen, bevor die verzögerte Bewertung lief → sofort bewerten (sonst blieb die alte stehen) */
if (typeof document !== 'undefined') { const flush = () => { if (!pendingReview) return; const [k, d] = pendingReview; pendingReview = null; clearTimeout(timer); try { reviewNow(k, d); } catch (e) { /* egal */ } }; document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); }); window.addEventListener('pagehide', flush); }
export function reviewNow(key: string, date: string): boolean {
  const mode = reviewMode(); if (mode === 'off') return false;
  invalidate();
  const ctx = D().engine;
  if (date > ctx.today) return false;
  const d = doneItems(ctx, date, date).find(x => x.key === key); if (!d) return false;
  // Auftrag 32: dieselbe Kennung wie der Server; eine ältere Bewertung derselben Aufzeichnung wird ersetzt (nicht doppelt)
  const rid = reviewMsgId(STATE, d);
  const id = rid.id; const old = STATE.coachMsgs[id];
  if (rid.old && !old) STATE.coachMsgs[rid.old.id] = { ...rid.old, deleted: true };
  const text = autoReview(ctx, d, mode);
  const sig = reviewInputSig(ctx, key);
  const how = reviewChange(old, text, sig);
  if (how === 'same') return false;
  // Auftrag 21: „Korrigiert“ nur bei geänderten Werten; neue Formulierung (App-Update) still übernehmen
  if (how === 'quiet') { STATE.coachMsgs[id] = { ...old, resultText: text, text: /^Korrigiert:/.test(old.text || '') ? 'Korrigiert: neu bewertet mit deinen geänderten Werten. Die alte Bewertung gilt nicht mehr.\n\n' + text : text, inputSig: sig }; saveSoon(); return true; }
  STATE.coachMsgs[id] = { ...(old || {}), id, at: old ? old.at : rid.old ? rid.old.at : Date.now(), date, kind: 'session', from: 'coach', title: (old ? 'Bewertung aktualisiert: ' : 'Bewertung: ') + d.title, resultText: text, text: old ? 'Korrigiert: neu bewertet mit deinen geänderten Werten. Die alte Bewertung gilt nicht mehr.\n\n' + text : text, unread: true, inputSig: sig, refs: { ...(d.custom ? {} : { sessionId: key }), ...(d.act ? { activityId: d.act.id } : {}) } };
  saveSoon();
  return true;
}
