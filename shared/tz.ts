/* Auftrag 22: Zeitzone der App. Bisher war überall Europe/Berlin fest eingetragen; für Nutzer in anderen Ländern (oder auf Reisen)
   waren „heute“, „ab 18 Uhr“ und die Morgen-Anpassung des Servers dann falsch.
   - App: Zeitzone des Geräts (setAppTz beim Start); sie wird in den Einstellungen gespeichert, damit der Server sie kennt.
   - Server: je Nutzer über einen Anbieter (AsyncLocalStorage, server/src/tz.ts), Standard Europe/Berlin.
   Datumsrechnungen mit Kalendertagen laufen weiter über 12:00 UTC (keine Fehler bei Sommer-/Winterzeit). */
export const DEFAULT_TZ = 'Europe/Berlin';
let fixed = DEFAULT_TZ;
let provider: (() => string | undefined | null) | null = null;
const okCache = new Map<string, boolean>();
export function validTz(tz: any): boolean {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  if (okCache.has(tz)) return okCache.get(tz)!;
  let ok = false; try { new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(0); ok = true; } catch { ok = false; }
  okCache.set(tz, ok); return ok;
}
export function appTz(): string { const p = provider ? provider() : null; return p && validTz(p) ? p : fixed; }
export function setAppTz(tz: any): boolean { if (!validTz(tz)) return false; fixed = tz; return true; }
export function setTzProvider(fn: (() => string | undefined | null) | null) { provider = fn; }
const fmtCache = new Map<string, Intl.DateTimeFormat>();
const fmt = (tz: string, kind: 'd' | 'p') => { const k = tz + kind; let f = fmtCache.get(k); if (!f) { f = kind === 'd' ? new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }) : new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }); fmtCache.set(k, f); } return f; };
/** Kalendertag (YYYY-MM-DD) eines Zeitpunkts in der Zeitzone der App */
export function localDate(ms: number = Date.now(), tz: string = appTz()): string { return fmt(validTz(tz) ? tz : DEFAULT_TZ, 'd').format(new Date(ms)); }
export interface LocalParts { date: string; hour: number; minute: number; dow: number }
export function localParts(ms: number = Date.now(), tz: string = appTz()): LocalParts {
  const z = validTz(tz) ? tz : DEFAULT_TZ;
  const parts = fmt(z, 'p').formatToParts(new Date(ms));
  const get = (t: string) => (parts.find(p => p.type === t) || ({} as any)).value;
  return { date: localDate(ms, z), hour: parseInt(get('hour'), 10) % 24, minute: parseInt(get('minute'), 10), dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')) };
}
