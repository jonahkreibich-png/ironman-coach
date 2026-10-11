/* Kleine Hilfen: DOM, Datum, Zahlen. */
export const $ = (s: string): any => document.querySelector(s);
export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
export function esc(s: unknown): string { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)); }
export function ymd(d: Date): string { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
export function todayStr(): string { return ymd(new Date()); }
export function addDays(s: string, n: number): string { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); }
export function daysBetween(a: string, b: string): number { return Math.round((+new Date(b + 'T12:00:00') - +new Date(a + 'T12:00:00')) / 86400000); }
export const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const DOW_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export function dowShort(s: string): string { return DOW[new Date(s + 'T12:00:00').getDay()]; }
export function dowLong(s: string): string { return DOW_LONG[new Date(s + 'T12:00:00').getDay()]; }
export function fmtDate(s: string): string { if (!s) return ''; const p = s.split('-'); return p[2] + '.' + p[1] + '.'; }
export function de(v: any, dec?: number): string {
  if (v == null || v === '' || (typeof v === 'number' && isNaN(v))) return '–';
  const n = Number(v);
  const str = dec != null ? n.toFixed(dec) : String(Math.round(n * 100) / 100);
  return str.replace('.', ',');
}
export function parseNum(v: any): number | null { if (v == null) return null; const s = String(v).trim().replace(',', '.'); if (s === '') return null; const n = parseFloat(s); return isNaN(n) ? null : n; }
export function paceToSec(str: any): number | null { const m = /^(\d+)[:.,](\d{1,2})$/.exec(String(str || '').trim()); if (!m) return null; return parseInt(m[1]) * 60 + parseInt(m[2]); }
export function secToPace(sec: number | null | undefined): string { if (sec == null) return '–'; sec = Math.round(sec); const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${String(s).padStart(2, '0')}`; }
export function round5(x: number): number { return Math.round(x / 5) * 5; }
export function round50(x: number): number { return Math.round(x / 50) * 50; }
export function rng(a: number, b: number): string { return a === b ? String(a) : a + '-' + b; }
