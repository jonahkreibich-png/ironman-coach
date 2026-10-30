/* Auftrag 22: Eingaben prüfen – eine Stelle für App, Import und den täglichen Daten-Check.
   - Jedes Feld hat sinnvolle Grenzen und Einheiten (Puls 30-230, Pace mm:ss, Komma oder Punkt).
     Außerhalb: freundlich ablehnen (App) bzw. nicht übernehmen (Import).
   - Widersprüche zwischen Feldern (200 km in 30 min, Puls über max. Puls, Distanz 0 bei 60 min): Rückfrage mit Vorschlag.
   Nur Ist-Werte; geplante Werte werden hier nie geprüft oder verändert. */

export type VSport = 'run' | 'bike' | 'swim' | 'strength' | 'football' | string;
const SPORT_WORD: Record<string, string> = { run: 'Laufen', bike: 'Rad', swim: 'Schwimmen', football: 'Teamsport', strength: 'Kraft' };

/** Grenzen [min, max] je Feld (Zahlen) bzw. Sekunden (Pace). Sportart-spezifisch, sonst allgemein. */
const LIMITS: Record<string, Record<string, [number, number]>> = {
  '*': { min: [1, 1440], hr: [30, 230], maxHr: [30, 240], rpe: [1, 10], temp: [-30, 50], ascent: [0, 10000], decoupling: [-50, 50], efficiency: [0, 10], vo2max: [10, 95], cardioRecovery: [0, 120], carbs: [0, 1000], fluid: [0, 10000], sprints: [0, 300] },
  run: { km: [0.1, 300], cadence: [60, 240], maxCadence: [60, 260], power: [20, 800], strideLen: [0.3, 3], gct: [100, 500], vertRatio: [2, 20] },
  bike: { km: [0.1, 1000], power: [20, 2000], maxPower: [20, 2500], np: [20, 2000], cadence: [20, 200], maxCadence: [20, 250], speed: [3, 80] },
  swim: { meters: [10, 20000], spl: [3, 80], rate: [5, 120], dps: [0.3, 5], longestCrawl: [5, 20000], longestPull: [5, 20000], crawlShare: [0, 100], swolf: [10, 200] },
  football: { km: [0.1, 25] }
};
/** Pace-Grenzen in Sekunden: Laufen je km, Schwimmen je 100 m */
const PACE: Record<string, [number, number]> = { pace: [140, 1200], testPace: [140, 1200], pace100: [45, 600], paceBreast: [45, 600], crawl25: [10, 150] };
/** schnellstes realistisches Ø-Tempo (km/h) je Sportart und Einheit */
const MAX_KMH: Record<string, number> = { run: 25, bike: 70, football: 25 };
const MAX_SWIM_MS = 100 / 50; // 50 s pro 100 m

export const parseNum = (v: any): number | null => {
  if (v == null || v === '') return null; if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\s/g, '');
  if (!/^-?\d+([.,]\d+)?$/.test(s)) return NaN as any;
  return parseFloat(s.replace(',', '.'));
};
export const parsePace = (v: any): number | null => {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  let m = /^(\d{1,3})[:.,](\d{2})$/.exec(s); if (m) return +m[2] < 60 ? +m[1] * 60 + +m[2] : NaN;
  m = /^(\d{3,4})$/.exec(s); if (m) { const sec = +s.slice(-2); return sec < 60 ? +s.slice(0, -2) * 60 + sec : NaN; }
  return NaN;
};
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const de = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
const LABEL: Record<string, string> = { min: 'Dauer', km: 'Distanz', meters: 'Distanz', hr: 'Ø Puls', maxHr: 'max. Puls', rpe: 'RPE', power: 'Watt', maxPower: 'max. Watt', np: 'Normalized Power', cadence: 'Kadenz', maxCadence: 'max. Kadenz', speed: 'Tempo', spl: 'Züge pro Bahn', rate: 'Züge pro Minute', dps: 'Meter pro Zug', temp: 'Temperatur', ascent: 'Höhenmeter', pace: 'Pace', pace100: 'Pace', paceBreast: 'Pace Brust', longestCrawl: 'Kraul am Stück', longestPull: 'Pull Buoy am Stück', crawlShare: 'Kraul-Anteil', swolf: 'SWOLF' };
const UNIT: Record<string, string> = { min: 'min', km: 'km', meters: 'm', hr: '', maxHr: '', power: 'W', maxPower: 'W', np: 'W', speed: 'km/h', temp: '°C', ascent: 'm', longestCrawl: 'm', longestPull: 'm', crawlShare: '%' };

export interface FieldCheck { ok: boolean; value?: any; msg?: string }
/** Ein Feld prüfen. Leer ist immer erlaubt. Text- und Auswahlfelder werden nicht geprüft. */
export function checkField(sport: VSport, key: string, raw: any): FieldCheck {
  if (raw == null || raw === '') return { ok: true, value: '' };
  if (Array.isArray(raw) || typeof raw === 'object') return { ok: true, value: raw };
  if (PACE[key]) {
    const s = parsePace(raw); if (s == null) return { ok: true, value: '' };
    if (!Number.isFinite(s)) return { ok: false, msg: 'Bitte als Minuten:Sekunden eingeben, z. B. 5:30.' };
    const [lo, hi] = PACE[key];
    if (s < lo || s > hi) return { ok: false, msg: `${LABEL[key] || 'Pace'} ${mmss(s)} ist unrealistisch (möglich: ${mmss(lo)} bis ${mmss(hi)}).` };
    return { ok: true, value: mmss(s) };
  }
  const lim = (LIMITS[sport] || {})[key] || LIMITS['*'][key];
  if (!lim) return { ok: true, value: raw };
  const n = parseNum(raw);
  if (n == null) return { ok: true, value: '' };
  if (!Number.isFinite(n)) return { ok: false, msg: `${LABEL[key] || 'Wert'}: bitte eine Zahl eingeben (Komma oder Punkt geht beides).` };
  if (n < lim[0] || n > lim[1]) {
    const u = UNIT[key] ? ' ' + UNIT[key] : '';
    return { ok: false, msg: key === 'hr' || key === 'maxHr' ? `Puls ${de(n)} ist unrealistisch (möglich: ${lim[0]} bis ${lim[1]}).` : key === 'rpe' ? 'RPE geht von 1 (sehr leicht) bis 10 (maximal).' : `${LABEL[key] || 'Wert'} ${de(n)}${u} ist für ${SPORT_WORD[sport] || 'diese Einheit'} unrealistisch (möglich: ${de(lim[0])} bis ${de(lim[1])}${u}).` };
  }
  return { ok: true, value: typeof raw === 'number' ? raw : String(raw).trim().replace(/^(-?\d+),(\d+)$/, '$1.$2') };
}

export interface Doubt { key: string; text: string; fix?: { key: string; value: string; label: string } | null; severe: boolean }
/** Widersprüche zwischen Feldern einer Einheit, mit Vorschlag („200 km in 30 min? Meintest du 20 km?“). */
export function crossCheck(sport: VSport, m: Record<string, any>): Doubt[] {
  const out: Doubt[] = [];
  const n = (k: string) => { const v = parseNum(m && m[k]); return v != null && Number.isFinite(v) ? v : null; };
  const min = n('min'), km = n('km'), meters = n('meters'), hr = n('hr'), maxHr = n('maxHr');
  if (hr != null && maxHr != null && maxHr < hr) out.push({ key: 'hr>max', text: `Ø Puls ${hr} liegt über dem max. Puls ${maxHr}. Vertauscht?`, fix: { key: 'swapHr', value: '', label: 'Tauschen' }, severe: true });
  const maxKmh = MAX_KMH[sport];
  if (maxKmh && km != null && min != null && min > 0) {
    const kmh = km / (min / 60);
    if (kmh > maxKmh) {
      const k10 = km / 10, m60 = min * 60;
      const fix = k10 / (min / 60) <= maxKmh && k10 >= 0.5 ? { key: 'km', value: String(Math.round(k10 * 100) / 100), label: `${de(k10)} km` } : m60 <= 1440 && km / (m60 / 60) <= maxKmh ? { key: 'min', value: String(m60), label: `${m60} min` } : null;
      out.push({ key: 'speed', text: `${de(km)} km in ${de(min)} min (${de(kmh)} km/h)?${fix ? ` Meintest du ${fix.label}?` : ' Bitte Distanz und Dauer prüfen.'}`, fix, severe: true });
    } else if (km === 0 || (min >= 60 && km < 0.2)) out.push({ key: 'dist0', text: `Distanz ${de(km)} km bei ${de(min)} min? Weißt du die Distanz nicht, lass das Feld leer.`, fix: { key: 'km', value: '', label: 'Distanz leeren' }, severe: false });
    if (sport === 'run' && kmh < 2.5 && min >= 20 && km > 0) out.push({ key: 'slow', text: `${de(km)} km in ${de(min)} min wäre langsamer als Gehen. Stimmen die Werte?`, fix: null, severe: false });
  }
  if (sport === 'swim' && meters != null && min != null && min > 0) {
    const ms = meters / (min * 60);
    if (ms > MAX_SWIM_MS) {
      const fix = meters / 10 / (min * 60) <= MAX_SWIM_MS && meters >= 100 ? { key: 'meters', value: String(Math.round(meters / 10)), label: `${Math.round(meters / 10)} m` } : null;
      out.push({ key: 'speed', text: `${meters} m in ${de(min)} min ist schneller als Weltrekord.${fix ? ` Meintest du ${fix.label}?` : ' Bitte prüfen.'}`, fix, severe: true });
    } else if (meters === 0 && min >= 10) out.push({ key: 'dist0', text: `0 m bei ${de(min)} min? Weißt du die Strecke nicht, lass das Feld leer.`, fix: { key: 'meters', value: '', label: 'Strecke leeren' }, severe: false });
  }
  const lc = n('longestCrawl'); if (sport === 'swim' && lc != null && meters != null && lc > meters) out.push({ key: 'crawl>total', text: `${lc} m Kraul am Stück, aber nur ${meters} m gesamt?`, fix: null, severe: true });
  const p = n('power'), mp = n('maxPower'); if (p != null && mp != null && mp < p) out.push({ key: 'power>max', text: `Ø ${p} W liegt über max. ${mp} W. Vertauscht?`, fix: { key: 'swapPower', value: '', label: 'Tauschen' }, severe: true });
  return out;
}
/** Vorschlag anwenden (liefert neue Werte), z. B. Puls tauschen oder km korrigieren */
export function applyDoubtFix(m: Record<string, any>, key: string, value: string): Record<string, any> {
  const o = { ...(m || {}) };
  if (key === 'swapHr') { const a = o.hr; o.hr = o.maxHr; o.maxHr = a; return o; }
  if (key === 'swapPower') { const a = o.power; o.power = o.maxPower; o.maxPower = a; return o; }
  if (value === '') delete o[key]; else o[key] = value;
  return o;
}
/** Import: Werte außerhalb der Grenzen nicht übernehmen (eine Uhr mit GPS-Sprung oder Pulsgurt-Fehler darf nichts verfälschen) */
export function cleanImported(sport: VSport, m: Record<string, any>): { metrics: Record<string, any>; dropped: string[] } {
  const out: Record<string, any> = {}; const dropped: string[] = [];
  for (const [k, v] of Object.entries(m || {})) { const c = checkField(sport, k, v); if (c.ok) out[k] = v; else dropped.push(k); }
  // Widerspruch Distanz/Dauer (GPS): Tempo-Felder fallen weg, die Dauer bleibt
  if (crossCheck(sport, out).some(d => d.key === 'speed')) { for (const k of ['km', 'meters', 'pace', 'pace100', 'speed']) if (k in out) { delete out[k]; dropped.push(k); } }
  if (crossCheck(sport, out).some(d => d.key === 'hr>max')) { delete out.maxHr; dropped.push('maxHr'); }
  return { metrics: out, dropped };
}
