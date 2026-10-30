import {effectiveCustomBuckets} from './custom-state26';
import { manualIntervals, rowsToLaps } from './intervals';
import { statsOf } from './activity/structure';
import { checkField } from './validate';
/* Tatsächliche Ergebnisse, ohne Planwerte. Eine manuelle Korrektur (auch ein bewusst
   geleertes Feld) hat Vorrang. Keine Mutation der importierten Originalaufzeichnung. */
export function resultNumber(v: any): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const pace = (s: any): number | null => {
  const m = /^(\d+):([0-5]\d)$/.exec(String(s ?? ''));
  return m ? +m[1] * 60 + +m[2] : null;
};
const time = (s: any) => s == null ? null : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
export function crawlOf(a: any): number | null {
  const sw = a?.swim;
  if (!sw) return null;
  if (Object.prototype.hasOwnProperty.call(sw, 'longestCrawlM')) return resultNumber(sw.longestCrawlM);
  const strokes = Object.keys(sw.byStroke || {}).filter(k => sw.byStroke[k] > 0);
  // Alte Aufzeichnungen: nur eindeutig Kraul; unbekannt/gemischt ist kein Nachweis.
  const gear = [sw.gear, sw.equipment, a.gear, a.equipment].flatMap(v => Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).filter(k => v[k]) : v ? [v] : []);
  const assisted = gear.some(v => /pull|buoy|fins?|flossen|paddles?|snorkel|schnorchel|board|kickbrett/i.test(String(v))) || resultNumber(sw.longestPullM)! > 0;
  if (!assisted && strokes.length > 0 && strokes.every(k => /^(freestyle|crawl|front_crawl)$/i.test(k))) return resultNumber(sw.longestContinuousM);
  return null;
}
export function actualMetrics(st: any = {}, a: any = null): Record<string, any> {
  const sw = a?.swim || {};
  const m: Record<string, any> = a ? {
    // Auftrag 22: Distanz 0 von der Uhr heißt „nicht gemessen“ (ohne GPS), nicht 0 km
    min: a.min, km: a.km > 0 ? a.km : null, meters: a.km > 0 ? a.km * 1000 : null,
    hr: a.avgHr, maxHr: a.maxHr, power: a.avgPower, maxPower: a.maxPower,
    cadence: a.avgCadence, maxCadence: a.maxCadence, pace: time(a.paceSecKm),
    speed: a.speedKmh, decoupling: a.decouplingPct, efficiency: a.efficiency,
    spl: sw.strokesPerLength, dps: sw.metersPerStroke, rate: sw.strokeRate,
    pace100: time(sw.pace100), longestCrawl: crawlOf(a), longestPull: sw.longestPullM, splits: a.splits,
    area: a.strength?.area ?? a.area, exercises: a.strength?.exercises ?? a.exercises,
    ascent: a.ascentM, temp: a.tempC, np: a.np, paceBreast: time(sw.breastPace100), swolf: sw.swolf
  } : {};
  const sport = (a && a.sport) || st?.sport;
  for (const [k, v] of Object.entries(st?.metrics || {})) {
    const src = st.metricsSrc?.[k];
    // Auftrag 22: übernommene Werte außerhalb sinnvoller Grenzen (Uhr ohne GPS: 0 km, Pulsgurt-Fehler) zählen nicht; von Hand Eingetragenes bleibt
    if (src && src !== 'manual' && !st.metricsManual?.[k] && sport && !checkField(sport, k, v).ok) continue;
    if (!a || !src || src === 'manual' || st.metricsManual?.[k] || (m[k] == null && k !== 'longestCrawl')) m[k] = v;
  }
  for (const k of Object.keys(st?.metricsManual || {})) if (st.metricsManual[k] && !Object.prototype.hasOwnProperty.call(st.metrics || {}, k)) m[k] = null;
  // Vor dem Entwurfsmodell waren Zusatztrainings ausschließlich manuelle Ergebnislogs.
  // Die damalige Eingabemaske speicherte ihre eingegebene Ist-Dauer unter plannedMinutes.
  // Explizit abgeschlossene moderne Pläne und geleerte Felder dürfen diesen Altpfad nicht nutzen.
  if (!a && st.id && st.sport && st.completed == null && !st.spec && !st.strengthTemplateId) {
    if (m.min == null && !st.metricsManual?.min) m.min = st.plannedMinutes ?? null;
    if (m.km == null && !st.metricsManual?.km) m.km = st.plannedKm ?? null;
  }
  const changed = (k: string) => !!st?.metricsManual?.[k] || st?.metricsSrc?.[k] === 'manual';
  // Abgeleitete Importwerte dürfen eine korrigierte Strecke/Dauer nicht überleben.
  if (changed('km') || changed('meters') || changed('min')) {
    if (!changed('pace')) m.pace = null;
    if (!changed('speed')) m.speed = null;
    if (!changed('pace100')) m.pace100 = null;
  }
  m._issues = [];
  const longest = resultNumber(m.longestCrawl), meters = resultNumber(m.meters);
  if (longest != null && meters != null && longest > meters) {
    m._issues.push(`Widerspruch: ${longest} m Kraul am Stück bei nur ${meters} m Gesamtdistanz. Kein Kraulrekord ableitbar.`);
    m.longestCrawl = null;
  }
  const pull = resultNumber(m.longestPull);
  if (pull != null && meters != null && pull > meters) {
    m._issues.push(`Widerspruch: ${pull} m mit Pull Buoy am Stück bei nur ${meters} m Gesamtdistanz. Kein Pull-Buoy-Nachweis ableitbar.`);
    m.longestPull = null;
  }
  return m;
}
export type StrengthArea = 'upper' | 'lower' | 'core' | 'full';
export const STRENGTH_AREA_LABEL: Record<StrengthArea, string> = { upper: 'Oberkörper', lower: 'Unterkörper', core: 'Rumpf', full: 'Ganzkörper' };
/** Result identity, deliberately independent of the prescription. Explicit area wins.
 * Infer only from recognizable actual exercise names; unknown exercises cannot prove an area. */
export function actualStrength(st: any = {}, activity: any = null): { area: StrengthArea | null; exercises: any[]; title: string; source: 'area' | 'exercises' | 'unknown' } {
  const m = actualMetrics(st, activity);
  const exercises = Array.isArray(m.exercises) ? m.exercises.filter((e: any) => e && typeof e.name === 'string' && e.name.trim()) : [];
  const explicit = Object.prototype.hasOwnProperty.call(STRENGTH_AREA_LABEL, m.area) ? m.area as StrengthArea : null;
  const norm = (name: string) => name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const classify = (name: string): StrengthArea | null => {
    const n = norm(name);
    if (/kniebeug|squat|ausfallschritt|lunge|beinpresse|leg press|wadenheb|calf raise|huftbruck|hip thrust|nordic hamstring|kreuzheb|deadlift|beincurl|leg curl/.test(n)) return 'lower';
    if (/bankdruck|bench press|liegestutz|push.?up|rudern|\brow(?:s|ing)?\b|klimmzug|pull.?up|latzug|schulterdruck|overhead press|bizeps|biceps|trizeps|triceps|aussenrotation|außenrotation|y-t-w/.test(n)) return 'upper';
    if (/plank|unterarmstutz|seitstutz|side plank|dead bug|bird dog|rumpf|crunch|sit.?up|pallof/.test(n)) return 'core';
    return null;
  };
  const inferred = exercises.map((e: any) => classify(e.name));
  const known = new Set(inferred.filter(Boolean));
  let area: StrengthArea | null = explicit;
  if (!area && inferred.length && inferred.every(Boolean)) area = known.has('lower') && known.has('upper') ? 'full' : known.has('lower') ? 'lower' : known.has('upper') ? 'upper' : 'core';
  return { area, exercises, title: area ? 'Kraft ' + STRENGTH_AREA_LABEL[area] : 'Krafttraining', source: explicit ? 'area' : area ? 'exercises' : 'unknown' };
}

export function effectiveActivity(a: any, st: any = {}): any {
  const m = actualMetrics(st, a), out = { ...a };
  const map: Record<string, string> = { min: 'min', km: 'km', hr: 'avgHr', maxHr: 'maxHr', power: 'avgPower', maxPower: 'maxPower', cadence: 'avgCadence', maxCadence: 'maxCadence', decoupling: 'decouplingPct', efficiency: 'efficiency', ascent: 'ascentM', temp: 'tempC', np: 'np' };
  for (const [key, prop] of Object.entries(map)) out[prop] = resultNumber(m[key]);
  if (a.sport === 'swim') out.km = resultNumber(m.meters) == null ? null : resultNumber(m.meters)! / 1000;
  out.paceSecKm = pace(m.pace) ?? (out.km > 0 && out.min > 0 ? out.min * 60 / out.km : null);
  out.speedKmh = resultNumber(m.speed) ?? (out.km > 0 && out.min > 0 ? out.km * 60 / out.min : null);
  if (a.sport === 'swim') out.swim = { ...(a.swim || {}), longestPullM: resultNumber(m.longestPull), longestCrawlM: resultNumber(m.longestCrawl), longestContinuousM: resultNumber(m.longestCrawl), pace100: pace(m.pace100), strokesPerLength: resultNumber(m.spl), metersPerStroke: resultNumber(m.dps), strokeRate: resultNumber(m.rate) };
  if (['km', 'meters', 'min', 'pace', 'power', 'hr'].some(k => st.metricsManual?.[k] || st.metricsSrc?.[k] === 'manual')) {
    out.laps = []; out.intervals = null; out.pattern = null; out.splits = [];
    if (!st.metricsManual?.decoupling && st.metricsSrc?.decoupling !== 'manual') out.decouplingPct = null;
    if (!st.metricsManual?.efficiency && st.metricsSrc?.efficiency !== 'manual') out.efficiency = out.avgHr > 0 && out.speedKmh > 0 ? out.speedKmh / 3.6 * 60 / out.avgHr : null;
  }
  // Auftrag 22: von Hand eingetragene Intervalle gelten (Hand gewinnt) – als Runden für Scores, Trends und Bewertung
  const man = ['run', 'bike', 'swim'].includes(a.sport) ? manualIntervals(st) : null;
  if (man && man.length) {
    out.laps = rowsToLaps(man, a.sport); out.segments = undefined;
    out.intervals = statsOf(out.laps, a.sport === 'bike' && out.laps.some((l: any) => l.power));
    out.pattern = man.length >= 2 ? { type: 'intervals', from: 'laps', reps: man.length } : out.pattern;
  }
  if (a.sport === 'strength') { const strength = actualStrength(st, a); out.area = strength.area; out.exercises = strength.exercises; out.strength = { ...(a.strength || {}), area: strength.area, exercises: strength.exercises }; }
  out.rpe = resultNumber(st.rpe) ?? a.rpe;
  return out;
}

/** Änderungskennung für Vorschläge; enthält keine Chattexte und löst keine Berechnung aus. */
export function evidenceSignature(state: any, weeks?: any[]): string {
  const stable = (x: any): any => Array.isArray(x) ? x.map(stable) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, stable(x[k])])) : x;
  const records = (obj: any) => Object.entries(obj || {}).sort(([a], [b]) => a.localeCompare(b)).map(([id, x]: any) => [id, { completed: x.completed, skipped: x.skipped, sport: x.sport, date: x.date, title: x.title, description: x.description, activityId: x.activityId, metrics: x.metrics, metricsSrc: x.metricsSrc, metricsManual: x.metricsManual, rpe: x.rpe, feel: x.feel, notes: x.notes, deviation: x.deviation }]);
  const custom: Record<string, any> = {};
  Object.entries(effectiveCustomBuckets(state) || {}).forEach(([date, list]: any) => (list || []).forEach((w: any) => { custom[date + ':' + w.id] = { ...w, date }; }));
  const input = JSON.stringify(stable({ sessions: records(state.sessions), custom: records(custom), activities: state.activities || {}, skills: state.profile?.skills || {}, adjustments: state.adjustments || {}, weeks: weeks || [] }));
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
  return 'results-v1-' + (hash >>> 0).toString(16);
}
