import { storage as localStorage } from "./persistence";
/* Schlankes Fehlerprotokoll: nur Meldung, Stelle, Version und Ansicht. Keine Gesundheitsdaten, keine Eingaben.
   Liegt lokal (die letzten 30) und geht bei aktivem Sync an den Server. */
import { STORAGE, APP_VERSION, API_BASE } from './config';

export interface ErrEntry { at: number; msg: string; where: string; version: string; view: string }
const MAX = 30;

/* Entfernt Zahlen, die Messwerte sein könnten, und kürzt lange Texte */
export function scrub(s: unknown): string {
  return String(s ?? '').replace(/https?:\/\/\S+/g, '<url>').replace(/\b\d{2,}(?:[.,]\d+)?\b/g, '#').slice(0, 300);
}
export function readErrors(): ErrEntry[] {
  try { return JSON.parse(localStorage.getItem(STORAGE.errors) || '[]') || []; } catch (e) { return []; }
}
function view(): string { try { return (JSON.parse(localStorage.getItem(STORAGE.ui) || '{}') || {}).view || ''; } catch (e) { return ''; } }
let pending: ErrEntry[] = [];
let timer: any = null;
export function logError(msg: unknown, where?: unknown): void {
  const e: ErrEntry = { at: Date.now(), msg: scrub(msg), where: scrub(where).slice(0, 160), version: APP_VERSION, view: view() };
  const list = readErrors(); list.push(e);
  try { localStorage.setItem(STORAGE.errors, JSON.stringify(list.slice(-MAX))); } catch (x) {}
  pending.push(e);
  clearTimeout(timer); timer = setTimeout(flush, 3000);
}
async function flush() {
  const auth = (() => { try { return JSON.parse(localStorage.getItem(STORAGE.syncAuth) || 'null'); } catch (e) { return null; } })();
  if (!auth || !pending.length || !navigator.onLine) return;
  const batch = pending.splice(0, 10);
  try {
    await fetch(API_BASE + '/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token }, body: JSON.stringify({ errors: batch }) });
  } catch (e) { /* egal, lokal liegt es noch */ }
}
export function initErrorLog(): void {
  window.addEventListener('error', ev => logError(ev.message, (ev.filename || '').split('/').pop() + ':' + ev.lineno));
  window.addEventListener('unhandledrejection', ev => logError(ev.reason && ev.reason.message ? ev.reason.message : ev.reason, 'promise'));
}
