import {effectiveCustomBuckets} from './custom-state26';
import { manualIntervals, rowsToLaps } from './intervals';
import { statsOf } from './activity/structure';
import { checkField } from './validate';
/* Tatsächliche Ergebnisse, ohne Planwerte. Eine manuelle Korrektur (auch ein bewusst
   geleertes Feld) hat Vorrang. Keine Mutation der importierten Originalaufzeichnung. */
export function resultNumber(v: any, signed = false): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  // Auftrag 29: Entkopplung und Temperatur dürfen negativ sein (vorher fiel z. B. −2,1 % still weg)
  return Number.isFinite(n) && (signed || n >= 0) ? n : null;
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
  for (const [key, prop] of Object.entries(map)) out[prop] = resultNumber(m[key], key === 'decoupling' || key === 'temp');
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
  const records = (obj: any) => Object.entries(obj || {}).sort(([a], [b]) => a.localeCompare(b)).map(([id, x]: any) => [id, { completed: x.completed, skipped: x.skipped, sport: x.sport, date: x.date, title: x.title, description: x.description, activityId: x.activityId, metrics: x.metrics, metricsSrc: x.metricsSrc, metricsManual: x.metricsManual, rpe: x.rpe, feel: x.feel, notes: x.notes, deviation: x.deviation, asPlanned: x.asPlanned, changed: x.changed }]);
  const custom: Record<string, any> = {};
  Object.entries(effectiveCustomBuckets(state) || {}).forEach(([date, list]: any) => (list || []).forEach((w: any) => { custom[date + ':' + w.id] = { ...w, date }; }));
  const input = JSON.stringify(stable({ sessions: records(state.sessions), custom: records(custom), activities: state.activities || {}, skills: state.profile?.skills || {}, adjustments: state.adjustments || {}, weeks: weeks || [] }));
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
  return 'results-v1-' + (hash >>> 0).toString(16);
}

/* ---------- Auftrag 29/30: „Anders trainiert als geplant“ ----------
   Am Zustand der Einheit: asPlanned (true = so wie geplant, false = anders) und changed { kind, sport?, reason?, zone?, place?, parts?, omit? }.
   Eine Stelle für Titel und „geplant: …“ (Einheit, Liste, Plan, Heute, Coach), für Sportart, Zone und Härte des Gemachten, die Bewertung,
   Scores, Stufen und Belastung nutzen: gezählt wird nur das Gemachte. Das alte Freitextfeld „deviation“ bleibt als optionale Notiz.
   Auftrag 30: je Art die passenden Felder – lockerer/härter: tatsächliche Zone; kürzer/länger/abgebrochen: Dauer und Distanz (dieselben
   Werte metrics.min/km/meters, eine Quelle); andere Intervalle: eigene Liste ohne Soll; andere Sportart: Felder dieser Sportart;
   drinnen/draußen; aufgeteilt: Teile mit je Dauer (Summe = Dauer der Einheit); ohne Teil: Koppel, Hilfsmittel, nur Brust, Ein-/Auslaufen. */
export type ChangeKind = 'easy' | 'harder' | 'shorter' | 'longer' | 'aborted' | 'otherIntervals' | 'otherSport' | 'place' | 'split' | 'omit';
export const CHANGE_KINDS: [ChangeKind, string][] = [['easy', 'Lockerer'], ['harder', 'Härter'], ['shorter', 'Kürzer'], ['longer', 'Länger'], ['aborted', 'Abgebrochen'],
  ['otherIntervals', 'Andere Intervalle'], ['otherSport', 'Andere Sportart'], ['place', 'Drinnen / draußen'], ['split', 'Aufgeteilt'], ['omit', 'Ohne Teil']];
export const CHANGE_REASONS: [string, string][] = [['tired', 'müde'], ['ill', 'krank'], ['time', 'keine Zeit'], ['weather', 'Wetter'], ['pain', 'Schmerzen'], ['motivation', 'Motivation'], ['other', 'anderes']];
export const CHANGE_ZONES: [number, string][] = [[1, 'Zone 1 · sehr locker'], [2, 'Zone 2 · locker'], [3, 'Zone 3 · mittel'], [4, 'Zone 4 · Schwelle'], [5, 'Zone 5 · sehr hart']];
export interface Change { kind: ChangeKind; sport?: string; reason?: string; zone?: number; place?: 'in' | 'out'; parts?: number[]; omit?: string }
const SPORT_NAME: Record<string, string> = { run: 'Laufen', bike: 'Rad', swim: 'Schwimmen', strength: 'Kraft', football: 'Teamsport' };
const KINDS = new Set<string>(CHANGE_KINDS.map(([k]) => k));
export function changedOf(st: any): Change | null {
  if (!st || st.asPlanned !== false || !st.changed || !KINDS.has(st.changed.kind)) return null;
  return st.changed;
}
export function actualSport(s: any, st: any): string { const c = changedOf(st); return c && c.kind === 'otherSport' && c.sport ? c.sport : s.sport; }
const planZone = (s: any) => Math.max(0, ...[...String((s && s.zone) || '').matchAll(/\d/g)].map(x => +x[0]));
/** Zone des Gemachten (1-5) oder null, wenn sie aus der Änderung nicht hervorgeht */
export function changeZone(st: any, s: any = null): number | null {
  const c = changedOf(st); if (!c) return null;
  const z = Number(c.zone); const ok = Number.isInteger(z) && z >= 1 && z <= 5 ? z : null;
  if (c.kind === 'easy') return ok ?? 2;
  if (c.kind === 'harder') return ok ?? Math.min(5, Math.max(4, planZone(s) + 1));
  if (c.kind === 'otherSport') return ok ?? 2;
  return ok;
}
/** Ist die geplante Härte weggefallen (locker statt hart, andere Sportart, abgebrochen)? Dann zählt die Einheit nicht als Schlüsseleinheit/Stufe
    und darf nach den Regeln nachgeholt werden. */
export function plannedLoadDropped(st: any): boolean { const c = changedOf(st); return !!c && (c.kind === 'easy' || c.kind === 'otherSport' || c.kind === 'aborted'); }
/** Gilt das Gemachte noch als Nachweis für Lern-Stufen (z. B. Kraul am Stück)? Kürzer/länger, drinnen/draußen und ohne Hilfsmittel ja;
    aufgeteilt, nur Brust, locker, härter, abgebrochen, andere Sportart, andere Intervalle nein. */
export function changeKeepsStage(st: any): boolean {
  const c = changedOf(st); if (!c) return true;
  return c.kind === 'shorter' || c.kind === 'longer' || c.kind === 'place' || (c.kind === 'omit' && (c.omit === 'aids' || c.omit === 'warmup' || c.omit === 'brick'));
}
/** Intervall-Liste: keine (locker, andere Sportart, aufgeteilt), eigene ohne Soll (andere Intervalle, härter) oder die geplante */
export function intervalsMode(st: any): 'none' | 'free' | 'planned' {
  const c = changedOf(st); if (!c) return 'planned';
  if (c.kind === 'easy' || c.kind === 'otherSport' || c.kind === 'split') return 'none';
  if (c.kind === 'otherIntervals' || c.kind === 'harder') return 'free';
  return 'planned';
}
/** Die Einheit, wie sie wirklich gemacht wurde (für Belastung, Scores, Bewertung): Sportart, Zone, Härte, Aufbau */
export function effectiveSession(s: any, st: any): any {
  const c = changedOf(st); if (!c) return s;
  const z = changeZone(st, s); const out: any = { ...s, sport: actualSport(s, st) };
  if (c.kind === 'easy') Object.assign(out, { zone: 'Zone ' + z, hard: false, spec: null, title: 'Locker' });
  else if (c.kind === 'harder') Object.assign(out, { zone: 'Zone ' + z, hard: (z || 0) >= 4, spec: null, title: (z || 0) >= 4 ? 'Hart' : 'Mittel' });
  else if (c.kind === 'otherSport') Object.assign(out, { zone: 'Zone ' + z, hard: false, spec: null, title: SPORT_NAME[out.sport] || 'Training' });
  else if (c.kind === 'aborted') Object.assign(out, { hard: false, spec: null });
  else if (c.kind === 'otherIntervals') Object.assign(out, { spec: null, title: 'Intervalle', ...(z ? { zone: 'Zone ' + z } : {}) });
  else if (c.kind === 'split') Object.assign(out, { spec: null, long: false });
  return out;
}
/** Teile einer aufgeteilten Einheit (Minuten) */
export function changeParts(st: any): number[] {
  const c = changedOf(st); if (!c || c.kind !== 'split' || !Array.isArray(c.parts)) return [];
  return c.parts.map(v => resultNumber(v)).filter((v): v is number => v != null && v > 0);
}
const PLACE_WORD: Record<string, [string, string]> = { run: ['Laufband', 'draußen'], bike: ['Rolle', 'draußen'], swim: ['Halle', 'Freiwasser'] };
export function placeLabel(sport: string, place: 'in' | 'out' | undefined): string { const w = PLACE_WORD[sport] || ['drinnen', 'draußen']; return place === 'out' ? w[1] : w[0]; }
/** „ohne Teil“: passende Auswahl je geplanter Einheit */
export function omitOptions(s: any): [string, string][] {
  const out: [string, string][] = [];
  const brick = /koppel/i.test(String((s && s.title) || '') + ' ' + JSON.stringify((s && s.spec) || {}));
  if (brick) out.push(['brick', 'Koppellauf weggelassen']);
  if (s && s.sport === 'swim') out.push(['aids', 'ohne Hilfsmittel'], ['breastOnly', 'nur Brust']);
  if (s && (s.sport === 'run' || s.sport === 'bike' || s.sport === 'swim')) out.push(['warmup', 'ohne Ein-/Auslaufen']);
  if (s && s.sport === 'strength') out.push(['exercises', 'nicht alle Übungen']);
  out.push(['other', 'anderer Teil']);
  return out;
}
const OMIT_WORD: Record<string, string> = { brick: 'ohne Koppellauf', aids: 'ohne Hilfsmittel', breastOnly: 'nur Brust', warmup: 'ohne Ein-/Auslaufen', exercises: 'nicht alle Übungen', other: 'ohne einen Teil' };
export const omitLabel = (k: string | undefined) => OMIT_WORD[k || ''] || 'ohne einen Teil';
const stripNums = (t: string) => String(t || '').replace(/\s*\d+(?:[.,]\d+)?\s*×\s*\d+(?:[.,]\d+)?\s*(?:min|s|m)\b|\s*\(\s*\d{1,3}(?:\.\d{3})*\s*m\s*\)|\s*\d+(?:[.,]\d+)?\s*(?:min|km|m)\b/g, '').replace(/\s+mit\s*$/, '').replace(/\s{2,}/g, ' ').trim();
const fmtMin = (m: number) => m >= 60 && m % 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : m >= 60 ? `${m / 60} h` : `${Math.round(m)} min`;
/** Titel dessen, was wirklich gemacht wurde („Rad Zone 2 · 60 min“); ohne Änderung der geplante Titel */
export function actualTitle(s: any, st: any, act: any = null): string {
  const c = changedOf(st); if (!c) return s.title;
  const min = resultNumber(actualMetrics(st || {}, act).min); const dur = min ? ` · ${Math.round(min)} min` : '';
  const sp = SPORT_NAME[actualSport(s, st)] || 'Training'; const z = changeZone(st, s);
  if (c.kind === 'easy') return `${sp} Zone ${z}${dur}`;
  if (c.kind === 'harder') return `${sp} härter (Zone ${z})${dur}`;
  if (c.kind === 'shorter' || c.kind === 'longer') return `${stripNums(s.title) || sp}${dur || (c.kind === 'shorter' ? ' (kürzer)' : ' (länger)')}`;
  if (c.kind === 'aborted') return `${stripNums(s.title) || sp} · abgebrochen${min ? ` nach ${Math.round(min)} min` : ''}`;
  if (c.kind === 'otherIntervals') return `${sp}: andere Intervalle${dur}`;
  if (c.kind === 'place') return `${s.title} · ${placeLabel(s.sport, c.place)}`;
  if (c.kind === 'split') { const p = changeParts(st); return `${stripNums(s.title) || sp} · ${p.length >= 2 ? `${p.length} Teile (${p.map(x => Math.round(x)).join(' + ')} min)` : 'aufgeteilt'}`; }
  if (c.kind === 'omit') return `${c.omit === 'brick' ? String(s.title || sp).replace(/\s*(?:\+|mit|und)\s*Koppel\w*.*$/i, '') || sp : s.title} · ${omitLabel(c.omit)}`;
  return `${sp}${dur}`;
}
/** Kurzform der Änderung für Coach-Kontext und Anzeige („härter (Zone 4)“, „abgebrochen nach 25 min“) */
export function changeText(s: any, st: any, act: any = null): string {
  const c = changedOf(st); if (!c) return '';
  const min = resultNumber(actualMetrics(st || {}, act).min);
  const t: Record<ChangeKind, string> = { easy: `lockerer (Zone ${changeZone(st, s)})`, harder: `härter (Zone ${changeZone(st, s)})`, shorter: `kürzer${min ? ` (${fmtMin(min)})` : ''}`, longer: `länger${min ? ` (${fmtMin(min)})` : ''}`,
    aborted: `abgebrochen${min ? ` nach ${Math.round(min)} min` : ''}`, otherIntervals: 'andere Intervalle', otherSport: `andere Sportart (${SPORT_NAME[actualSport(s, st)] || '?'})`,
    place: placeLabel(s.sport, c.place), split: `aufgeteilt${changeParts(st).length ? ` (${changeParts(st).map(x => Math.round(x)).join(' + ')} min)` : ''}`, omit: omitLabel(c.omit) };
  const why = (CHANGE_REASONS.find(([k]) => k === c.reason) || [])[1];
  return t[c.kind] + (why ? `, Grund: ${why}` : '');
}
/** kleine Zeile darunter: „geplant: Sweet Spot 2×12“ (leer ohne Änderung) */
export function plannedLine(s: any, st: any): string {
  const c = changedOf(st); if (!c) return '';
  const why = (CHANGE_REASONS.find(([k]) => k === c.reason) || [])[1];
  return `geplant: ${s.title}${why ? ` · Grund: ${why}` : ''}`;
}
