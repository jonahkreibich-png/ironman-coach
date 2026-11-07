/* Auftrag 22: Eingaben prüfen – eine Stelle für App, Import und den täglichen Daten-Check.
   - Jedes Feld hat sinnvolle Grenzen und Einheiten (Puls 30-230, Pace mm:ss, Komma oder Punkt).
     Außerhalb: freundlich ablehnen (App) bzw. nicht übernehmen (Import).
   - Widersprüche zwischen Feldern (200 km in 30 min, Puls über max. Puls, Distanz 0 bei 60 min): Rückfrage mit Vorschlag.
   Nur Ist-Werte; geplante Werte werden hier nie geprüft oder verändert. */

export type VSport = 'run' | 'bike' | 'swim' | 'strength' | 'football' | string;
const SPORT_WORD: Record<string, string> = { run: 'Laufen', bike: 'Rad', swim: 'Schwimmen', football: 'Teamsport', strength: 'Kraft' };

/** Grenzen [min, max] je Feld (Zahlen) bzw. Sekunden (Pace). Sportart-spezifisch, sonst allgemein. */
const LIMITS: Record<string, Record<string, [number, number]>> = {
  '*': { min: [1, 1440], hr: [30, 230], maxHr: [30, 240], rpe: [1, 10], temp: [-30, 50], ascent: [0, 10000], decoupling: [-50, 50], efficiency: [0, 10], vo2max: [10, 95], cardioRecovery: [0, 120], carbs: [0, 1000], fluid: [0, 10000], sprints: [0, 300], testHr: [30, 230], testPower: [20, 2000], testSpeed: [3, 80] },
  run: { km: [0.1, 300], cadence: [60, 240], maxCadence: [60, 260], power: [20, 800], strideLen: [30, 300], gct: [100, 500], vertRatio: [2, 20] },
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

export interface FieldCheck { ok: boolean; value?: any; msg?: string; /** Auftrag 29: Hinweis, wenn eine andere Einheit umgerechnet wurde */ note?: string }
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
  const spec = sessionInputSpec(sport, key);
  if (!spec) return { ok: true, value: raw };
  const r = parseInput(spec, raw);
  if (!r.ok) return { ok: false, msg: r.msg };
  if (r.value == null) return { ok: true, value: '' };
  return { ok: true, value: String(round6(r.value * (spec.store || 1))), ...(r.note ? { note: r.note } : {}) };
}

/* ---------- Auftrag 29: eine Stelle, die Eingaben wie ein Mensch liest ----------
   Komma oder Punkt, Tausenderpunkt („1.500 m“), Einheit dahinter („102 cm“, „1,02 m“, „45 min“, „1:30 h“, „150 bpm“).
   Andere Einheit als die des Felds wird umgerechnet und IMMER mit Hinweis gemeldet (keine stille Umwandlung); unbekannte Einheit,
   Text oder Werte außerhalb der Grenzen werden mit verständlicher Meldung abgelehnt. Es wird nie gerundet. */
export interface InputSpec {
  label: string; unit?: string; min: number; max: number; int?: boolean;
  /** weitere Einheiten → Faktor in die Feld-Einheit (z. B. Schrittlänge cm: { m: 100 }) */
  units?: Record<string, number>;
  /** Zahl ohne Einheit außerhalb der Grenzen in einer anderen Einheit lesen (Schrittlänge „1,02“ = 1,02 m) */
  bare?: { below?: number; above?: number; factor: number; unit: string };
  /** Stunden:Minuten erlaubt („1:30“, „1 h 30“); Ergebnis in Minuten bzw. Stunden */
  hm?: 'min' | 'h';
  /** gespeichert wird Wert × store (Schrittlänge: Eingabe cm, gespeichert m) */
  store?: number;
}
export interface ParsedInput { ok: boolean; value: number | null; msg?: string; note?: string }
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
export const deNum = (x: number) => String(round6(x)).replace('.', ',');
const UNIT_ALIAS: Record<string, string> = { minuten: 'min', minute: 'min', mins: 'min', std: 'h', stunden: 'h', stunde: 'h', meter: 'm', metern: 'm', kilometer: 'km', zentimeter: 'cm', 'schläge': 'bpm', 's/min': 'bpm', 'schläge/min': 'bpm', 'u/min': 'rpm', watt: 'w', grad: '°c', '°': '°c', c: '°c', liter: 'l', kmh: 'km/h', 'km/std': 'km/h', prozent: '%', hm: 'm', millisekunden: 'ms', kilogramm: 'kg', gramm: 'g', sekunden: 's', sek: 's' };
function readNumber(t: string, spec: InputSpec): number | null {
  const sign = t[0] === '-' ? -1 : 1; const u = t.replace(/^[+-]/, '');
  let m = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d+))?$/.exec(u);
  if (m) {
    const thousands = +(m[1].replace(/\./g, '') + (m[2] ? '.' + m[2] : ''));
    const asDecimal = m[2] == null && (m[1].match(/\./g) || []).length === 1 ? +m[1] : null;
    // „1.500“: als Tausender, außer nur die Kommazahl passt in die Grenzen (z. B. 1.5 km)
    if (asDecimal != null && asDecimal >= spec.min && asDecimal <= spec.max && !(thousands >= spec.min && thousands <= spec.max)) return sign * asDecimal;
    return sign * thousands;
  }
  m = /^(\d*)[.,](\d+)$/.exec(u); if (m) return sign * +((m[1] || '0') + '.' + m[2]);
  if (/^\d+$/.test(u)) return sign * +u;
  return null;
}
export function parseInput(spec: InputSpec, raw: any): ParsedInput {
  if (raw == null || String(raw).trim() === '') return { ok: true, value: null };
  const s = String(raw).replace(/ /g, ' ').trim().toLowerCase().replace(/\s+/g, ' ');
  const unitTxt = spec.unit ? ' ' + spec.unit : '';
  let v: number | null = null; let note: string | undefined;
  // Stunden und Minuten
  if (spec.hm) {
    let hm = /^(\d{1,2}):([0-5]\d)(?:\s*(?:h|std\.?|stunden?))?$/.exec(s);
    let h: number | null = null, mi = 0;
    if (hm) { h = +hm[1]; mi = +hm[2]; }
    else if ((hm = /^(\d+(?:[.,]\d+)?)\s*(?:h|std\.?|stunden?)\s*(?:(\d{1,2})\s*(?:min|minuten|m)?)?$/.exec(s))) { h = +hm[1].replace(',', '.'); mi = hm[2] ? +hm[2] : 0; }
    if (h != null) {
      v = spec.hm === 'min' ? h * 60 + mi : h + mi / 60;
      note = `${String(raw).trim()} als ${deNum(v)}${unitTxt} übernommen.`;
    }
  }
  if (v == null) {
    const m = /^([+-]?[\d.,]+)\s*([^\d\s].*)?$/.exec(s);
    if (!m) return { ok: false, value: null, msg: `${spec.label}: bitte eine Zahl eingeben${spec.unit ? ' (in ' + spec.unit + ')' : ''}. Komma oder Punkt geht beides.` };
    const n = readNumber(m[1], spec);
    if (n == null) return { ok: false, value: null, msg: `${spec.label}: „${String(raw).trim()}“ ist keine Zahl. Komma oder Punkt geht beides.` };
    const unitRaw = (m[2] || '').trim().replace(/\.$/, '');
    if (unitRaw) {
      const u = UNIT_ALIAS[unitRaw] || unitRaw; const own = (spec.unit || '').toLowerCase();
      const f = u === own ? 1 : spec.units && spec.units[u] != null ? spec.units[u] : null;
      if (f == null) return { ok: false, value: null, msg: `${spec.label}: Einheit „${m[2].trim()}“ passt nicht${spec.unit ? ' – bitte in ' + spec.unit + ' eingeben' : ''}.` };
      v = n * f; if (f !== 1) note = `${String(raw).trim()} als ${deNum(v)}${unitTxt} übernommen.`;
    } else {
      v = n;
      const b = spec.bare;
      if (b && ((b.below != null && n < b.below) || (b.above != null && n > b.above)) && (n < spec.min || n > spec.max)) { v = n * b.factor; note = `${String(raw).trim()} als ${deNum(n)} ${b.unit} = ${deNum(v)}${unitTxt} übernommen.`; }
    }
  }
  v = round6(v!);
  if (!Number.isFinite(v)) return { ok: false, value: null, msg: `${spec.label}: bitte eine Zahl eingeben.` };
  if (spec.int && !Number.isInteger(v)) return { ok: false, value: null, msg: `${spec.label}: bitte eine ganze Zahl eingeben.` };
  if (v < spec.min || v > spec.max) return { ok: false, value: null, msg: spec.label === 'Puls' || /Puls$/.test(spec.label) ? `${spec.label} ${deNum(v)} ist unrealistisch (möglich: ${deNum(spec.min)} bis ${deNum(spec.max)}).` : spec.label === 'RPE' ? 'RPE geht von 1 (sehr leicht) bis 10 (maximal).' : `${spec.label} ${deNum(v)}${unitTxt} ist unrealistisch (möglich: ${deNum(spec.min)} bis ${deNum(spec.max)}${unitTxt}).` };
  return { ok: true, value: v, ...(note ? { note } : {}) };
}
/** Einheit und weitere Einheiten je Feld einer Einheit (Training) */
const SESSION_UNITS: Record<string, Partial<InputSpec>> = {
  min: { unit: 'min', units: { h: 60, s: 1 / 60 }, hm: 'min' }, km: { unit: 'km', units: { m: 0.001 } }, meters: { unit: 'm', units: { km: 1000 } },
  hr: { unit: 'bpm', units: { '/min': 1 } }, maxHr: { unit: 'bpm', units: { '/min': 1 } }, testHr: { unit: 'bpm', units: { '/min': 1 } }, cardioRecovery: { unit: 'bpm' },
  decoupling: { unit: '%' }, vertRatio: { unit: '%' }, crawlShare: { unit: '%' },
  cadence: { unit: 'spm', units: { rpm: 1, '/min': 1, 'schritte/min': 1 } }, maxCadence: { unit: 'rpm', units: { spm: 1, '/min': 1 } },
  power: { unit: 'W' }, maxPower: { unit: 'W' }, np: { unit: 'W' }, testPower: { unit: 'W' }, speed: { unit: 'km/h' }, testSpeed: { unit: 'km/h' },
  ascent: { unit: 'm' }, gct: { unit: 'ms' }, temp: { unit: '°C' }, carbs: { unit: 'g' }, fluid: { unit: 'ml', units: { l: 1000 } },
  dps: { unit: 'm' }, longestCrawl: { unit: 'm' }, longestPull: { unit: 'm' }, rpe: { int: true },
  // Schrittlänge: Eingabe und Anzeige in cm (102 cm), gespeichert wie von der Uhr in m (1.02); „1,02“ und „1,02 m“ werden erkannt
  strideLen: { unit: 'cm', units: { m: 100 }, bare: { below: 3.01, factor: 100, unit: 'm' }, store: 0.01 }
};
const FIELD_LABEL: Record<string, string> = { testHr: 'Test-Puls', testPower: 'Test-Watt', testSpeed: 'Test-Tempo', decoupling: 'Aerobe Entkopplung', efficiency: 'Aerobe Effizienz', vo2max: 'VO2max', cardioRecovery: 'Cardio-Erholung', vertRatio: 'Vertikales Verhältnis', strideLen: 'Schrittlänge', gct: 'Bodenkontaktzeit', carbs: 'Kohlenhydrate', fluid: 'Trinken', sprints: 'Sprints', rpe: 'RPE', hr: 'Ø Puls', maxHr: 'max. Puls' };
/** Prüf-Regeln eines Felds einer Einheit (null = Feld ohne Zahlenprüfung) */
export function sessionInputSpec(sport: VSport, key: string): InputSpec | null {
  const lim = (LIMITS[sport] || {})[key] || LIMITS['*'][key];
  if (!lim) return null;
  return { label: FIELD_LABEL[key] || LABEL[key] || 'Wert', min: lim[0], max: lim[1], ...(SESSION_UNITS[key] || {}) };
}
/** Anzeige eines gespeicherten Werts im Eingabefeld (deutsches Komma, Schrittlänge in cm) */
export function inputDisplay(sport: VSport, key: string, stored: any): string {
  if (stored == null || stored === '') return '';
  const spec = sessionInputSpec(sport, key);
  const n = parseNum(stored);
  if (!spec || n == null || !Number.isFinite(n)) return String(stored);
  return deNum(round6(n / (spec.store || 1)));
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

/* Auftrag 29: Einheit und Grenzen der übrigen Eingabefelder (Morgenwerte, Profil, Essen, Schwellen, Können, Teamsport, Intervalle).
   Jede Ansicht liest Zahlen nur noch über parseInput mit diesen Angaben. */
const YEAR = () => new Date().getFullYear();
export const INPUTS: Record<string, Record<string, InputSpec>> = {
  trend: {
    sleepHours: { label: 'Schlaf', unit: 'h', min: 0, max: 16, hm: 'h', units: { min: 1 / 60 } }, sleepQuality: { label: 'Schlafqualität', unit: '%', min: 0, max: 100 },
    hrv: { label: 'HFV', unit: 'ms', min: 5, max: 300 }, restingHR: { label: 'Ruhepuls', unit: 'bpm', min: 25, max: 130, units: { '/min': 1 } },
    bodyTemp: { label: 'Temperatur-Abweichung', unit: '°C', min: -3, max: 3 }, breathingRate: { label: 'Atemfrequenz', unit: '/min', min: 5, max: 40 },
    spo2: { label: 'SpO2', unit: '%', min: 70, max: 100 }, remSleep: { label: 'REM-Schlaf', unit: 'min', min: 0, max: 600, hm: 'min', units: { h: 60 } },
    deepSleep: { label: 'Tiefschlaf', unit: 'min', min: 0, max: 600, hm: 'min', units: { h: 60 } }, sleepLatency: { label: 'Einschlafzeit', unit: 'min', min: 0, max: 300, hm: 'min', units: { h: 60 } }
  },
  profile: {
    get birthYear() { return { label: 'Geburtsjahr', min: 1930, max: YEAR() - 5, int: true }; },
    heightCm: { label: 'Größe', unit: 'cm', min: 100, max: 230, units: { m: 100 }, bare: { below: 2.5, factor: 100, unit: 'm' } },
    weightKg: { label: 'Gewicht', unit: 'kg', min: 25, max: 250 }, experienceYears: { label: 'Erfahrung', unit: 'Jahre', min: 0, max: 80, units: { jahre: 1, j: 1 } }, pal: { label: 'Aktivität', min: 1, max: 2.5 }
  },
  food: {
    kcal: { label: 'Kalorien', unit: 'kcal', min: 0, max: 15000 }, carbs: { label: 'Kohlenhydrate', unit: 'g', min: 0, max: 2000 }, protein: { label: 'Eiweiß', unit: 'g', min: 0, max: 1000 },
    fat: { label: 'Fett', unit: 'g', min: 0, max: 1000 }, weight: { label: 'Gewicht', unit: 'kg', min: 25, max: 250 }
  },
  thr: {
    lthrRun: { label: 'Schwellenpuls Laufen', unit: 'bpm', min: 100, max: 215, int: true }, lthrBike: { label: 'Schwellenpuls Rad', unit: 'bpm', min: 100, max: 215, int: true },
    maxHr: { label: 'max. Puls', unit: 'bpm', min: 120, max: 230, int: true }, ftp: { label: 'FTP', unit: 'W', min: 50, max: 600 },
    thresholdSpeedBikeKmh: { label: 'Schwellentempo Rad', unit: 'km/h', min: 10, max: 60 }, bikeSpeed: { label: 'Tempo', unit: 'km/h', min: 10, max: 60 }
  },
  skills: {
    swimCrawlM: { label: 'Kraul am Stück', unit: 'm', min: 0, max: 10000, int: true }, runContinuousMin: { label: 'Laufen am Stück', unit: 'min', min: 0, max: 600, hm: 'min', units: { h: 60 } },
    bikeLongestMin: { label: 'Längste Ausfahrt', unit: 'min', min: 0, max: 1440, hm: 'min', units: { h: 60 } },
    trainingMinutes: { label: 'Trainingsdauer', unit: 'min', min: 10, max: 300, hm: 'min', units: { h: 60 } }, gameMinutes: { label: 'Spieldauer', unit: 'min', min: 10, max: 300, hm: 'min', units: { h: 60 } }
  }
};
