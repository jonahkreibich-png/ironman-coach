/* Auftrag 37: Rückgängig in einer Einheit. Jede Änderung (Ablauf, Werte, RPE, Gefühl, abhaken …) legt den Stand davor ab.
   - Löschen und „Wie geplant gemacht“: sofort ein Hinweis unten mit „Rückgängig“ (einige Sekunden).
   - Änderungen im Fenster eines Teils (Aufwärmen, Satz, Wiederholung, Übung): beim Schließen ein Hinweis; „Rückgängig“ nimmt alles zurück,
     was in diesem Fenster geändert wurde.
   - Mehrere Schritte: nach dem Rückgängigmachen bietet der Hinweis den nächsten Schritt an; dazu oben in der Einheit „↶ Rückgängig“.
   Gespeichert wird wie jede Änderung (saveState → Sync mit Zeitstempel), der Stapel selbst liegt nur im Speicher. */
import { toast } from './toast';

export type UTg = { kind: 'session' | 'custom'; id: string; date?: string; sport?: string };
interface Step { before: string; label: string }
interface UndoHost { rec: (tg: UTg) => any; put: (tg: UTg, next: any) => void; after: (tg: UTg) => void }
let HOST: UndoHost | null = null;
export function registerUndoHost(h: UndoHost) { HOST = h; }
const STACKS = new Map<string, Step[]>();
const keyOf = (tg: UTg) => `${tg.kind}|${tg.id}`;
const stack = (tg: UTg) => { const k = keyOf(tg); if (!STACKS.has(k)) STACKS.set(k, []); return STACKS.get(k)!; };
const snap = (tg: UTg): string => { try { return JSON.stringify(HOST ? HOST.rec(tg) ?? null : null); } catch (e) { return 'null'; } };

export function lastStepLabel(tg: UTg): string { const s = STACKS.get(keyOf(tg)) || []; return s.length ? s[s.length - 1].label : ''; }
/** Knopf „↶ Rückgängig“ oben in der Einheit (nur der Platzhalter wird aktualisiert, nicht das ganze Fenster – ein Neuzeichnen
    während eines Tipps würde den getippten Knopf ersetzen) */
export function undoButton(tg: UTg, attrs: string): string { const n = undoCount(tg); return n ? `<button class="btn ghost sm" data-act="undo-one" ${attrs} data-undo-btn aria-label="Letzte Änderung rückgängig machen">↶ Rückgängig${n > 1 ? ` (${n})` : ''}</button>` : ''; }
export function updateUndoSlots(): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll<HTMLElement>('[data-undo-slot]').forEach(el => { const tg: UTg = { kind: el.dataset.tk as any, id: el.dataset.tid! }; el.innerHTML = undoButton(tg, el.dataset.attrs || ''); });
}
export function undoCount(tg: UTg): number { return (STACKS.get(keyOf(tg)) || []).length; }
export function clearUndo(): void { STACKS.clear(); }

export interface UToken { tg: UTg; before: string }
export function undoBegin(tg: UTg | null): UToken | null { return tg && HOST ? { tg, before: snap(tg) } : null; }
/** true = es hat sich etwas geändert (Schritt abgelegt) */
export function undoEnd(tok: UToken | null, label = 'Geändert'): boolean {
  if (!tok || !HOST) return false;
  if (snap(tok.tg) === tok.before) return false;
  const s = stack(tok.tg); s.push({ before: tok.before, label });
  if (s.length > 50) s.shift();
  return true;
}
/** zurück auf den Stand vor Schritt n (alle Schritte ab n fallen weg) */
export function undoTo(tg: UTg, n: number): boolean {
  const s = stack(tg); if (!HOST || n < 0 || n >= s.length) return false;
  const step = s[n]; s.length = n;
  let v: any = null; try { v = JSON.parse(step.before); } catch (e) { return false; }
  HOST.put(tg, v); HOST.after(tg); updateUndoSlots();
  return true;
}
/** einen Schritt zurück; der Hinweis bietet danach den nächsten Schritt an */
export function undoOne(tg: UTg): void {
  const s = stack(tg); if (!s.length) return;
  const label = s[s.length - 1].label;
  undoTo(tg, s.length - 1);
  undoToast(tg, `Rückgängig: ${label}`, s.length - 1, true);
}
/** Hinweis mit „Rückgängig“: nimmt alles ab Schritt from zurück */
export function undoToast(tg: UTg, msg: string, from = undoCount(tg) - 1, after = false): void {
  if (after) { if (undoCount(tg) > 0) toast(msg, { label: 'Noch einmal rückgängig', run: () => undoOne(tg) }); else toast(msg); return; }
  if (from < 0 || from >= undoCount(tg)) { toast(msg); return; }
  toast(msg, { label: 'Rückgängig', run: () => { const label = stack(tg)[from]?.label || ''; undoTo(tg, from); undoToast(tg, `Rückgängig: ${label}`, 0, true); } });
}
