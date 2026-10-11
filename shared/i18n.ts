/* Übersetzungen und Einheiten. Texte stehen in shared/lang/de.ts (vollständig) und en.ts (vorbereitet, fällt auf Deutsch zurück). */
import { de } from './lang/de';
import { en } from './lang/en';
import type { Lang, Units } from './profile';

const DICTS: Record<Lang, Record<string, string>> = { de, en };
let LANG: Lang = 'de';
let UNITS: Units = 'metric';
export function setLang(l: Lang) { LANG = DICTS[l] ? l : 'de'; }
export function getLang(): Lang { return LANG; }
export function setUnits(u: Units) { UNITS = u === 'imperial' ? 'imperial' : 'metric'; }
export function getUnits(): Units { return UNITS; }

/* t('heute.titel', { n: 3 }) → Text mit {n} ersetzt. Fehlt ein Schlüssel, erscheint der Schlüssel selbst (fällt in Tests auf). */
export function t(key: string, params?: Record<string, any>): string {
  const s = DICTS[LANG][key] ?? de[key] ?? key;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] == null ? '' : String(params[k])));
}
export function hasKey(key: string): boolean { return key in de; }
/* Einzahl/Mehrzahl: tn('einheit', n) nutzt 'einheit.1' oder 'einheit.n' */
export function tn(key: string, n: number, params?: Record<string, any>): string {
  return t(key + (n === 1 ? '.1' : '.n'), { n, ...(params || {}) });
}

/* ---------- Zahlen und Einheiten ---------- */
const KM_PER_MI = 1.609344;
export function num(v: number | null | undefined, dec = 0): string {
  if (v == null || !isFinite(v)) return '–';
  const s = Number(v).toFixed(dec);
  return LANG === 'de' ? s.replace('.', ',') : s;
}
export function dist(km: number | null | undefined, dec = 1): string {
  if (km == null) return '–';
  return UNITS === 'imperial' ? `${num(km / KM_PER_MI, dec)} mi` : `${num(km, dec)} km`;
}
export function swimDist(m: number | null | undefined): string {
  if (m == null) return '–';
  return UNITS === 'imperial' ? `${num(m / 0.9144, 0)} yd` : `${num(m, 0)} m`;
}
export function mmss(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return '–';
  sec = Math.round(sec); const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
export function hhmm(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return '–';
  sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
/* Pace in Sekunden pro km → "5:20/km" oder "8:35/mi" */
export function pace(secPerKm: number | null | undefined): string {
  if (secPerKm == null) return '–';
  return UNITS === 'imperial' ? `${mmss(secPerKm * KM_PER_MI)}/mi` : `${mmss(secPerKm)}/km`;
}
export function swimPace(secPer100m: number | null | undefined): string {
  if (secPer100m == null) return '–';
  return UNITS === 'imperial' ? `${mmss(secPer100m * 0.9144)}/100yd` : `${mmss(secPer100m)}/100m`;
}
export function speed(kmh: number | null | undefined): string {
  if (kmh == null) return '–';
  return UNITS === 'imperial' ? `${num(kmh / KM_PER_MI, 1)} mph` : `${num(kmh, 1)} km/h`;
}
export function weight(kg: number | null | undefined): string {
  if (kg == null) return '–';
  return UNITS === 'imperial' ? `${num(kg * 2.20462, 1)} lb` : `${num(kg, 1)} kg`;
}
export function temp(c: number | null | undefined, signed = false): string {
  if (c == null) return '–';
  if (UNITS === 'imperial') { const f = signed ? c * 1.8 : c * 1.8 + 32; return `${signed && f > 0 ? '+' : ''}${num(f, 1)} °F`; }
  return `${signed && c > 0 ? '+' : ''}${num(c, 1)} °C`;
}
export function duration(min: number | null | undefined): string {
  if (min == null || !isFinite(min)) return '–';
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
export function hours(h: number | null | undefined): string { return h == null ? '–' : `${num(h, h < 10 ? 1 : 0)} h`; }
