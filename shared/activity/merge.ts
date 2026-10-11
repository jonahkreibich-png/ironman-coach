/* Regeln für alle Quellen:
   - Jeder Wert speichert seine Quelle.
   - Korrekturen von Hand gelten ab dann und werden nie überschrieben. „Auf Original zurücksetzen“ holt den automatischen Wert zurück.
   - Pro Messwert entscheidet die Vorrang-Liste, welche Quelle gilt (z. B. Schlaf von Oura, Trainings von HealthFit).
   - Doppelte Einheiten (gleicher Tag und Sport, Start ±30 min) werden zusammengeführt, die Quelle mit Vorrang gewinnt.
   - Automatisch übernommene Einheiten werden der geplanten Einheit zugeordnet und abgehakt. */
import type { Activity, Source } from './analyze';

export type MetricGroup = 'workouts' | 'sleep' | 'hrv' | 'restingHR' | 'temp' | 'spo2' | 'breath' | 'load' | 'weight';
export const DEFAULT_PRIORITY: Record<MetricGroup, Source[]> = {
  workouts: ['healthfit', 'file', 'healthkit', 'polar', 'suunto', 'coros', 'wahoo', 'zepp', 'fitbit', 'whoop', 'shortcut', 'intervals', 'manual'],
  sleep: ['oura', 'whoop', 'withings', 'fitbit', 'polar', 'healthkit', 'shortcut', 'healthfit', 'intervals', 'zepp'],
  hrv: ['oura', 'whoop', 'polar', 'fitbit', 'healthkit', 'shortcut', 'healthfit', 'intervals', 'withings', 'zepp'],
  restingHR: ['oura', 'whoop', 'polar', 'fitbit', 'healthkit', 'shortcut', 'healthfit', 'intervals', 'withings', 'zepp'],
  temp: ['oura', 'whoop', 'fitbit', 'withings', 'intervals'],
  spo2: ['oura', 'whoop', 'fitbit', 'withings', 'healthkit', 'shortcut', 'intervals'],
  breath: ['oura', 'whoop', 'fitbit', 'healthkit', 'shortcut', 'intervals'],
  load: ['intervals'],
  weight: ['withings', 'healthkit', 'shortcut', 'healthfit', 'fitbit', 'intervals']
};
export const FIELD_GROUP: Record<string, MetricGroup> = {
  sleepHours: 'sleep', sleepQuality: 'sleep', remSleep: 'sleep', deepSleep: 'sleep', sleepLatency: 'sleep',
  hrv: 'hrv', restingHR: 'restingHR', bodyTemp: 'temp', spo2: 'spo2', breathingRate: 'breath',
  ctl: 'load', atl: 'load', tsb: 'load', vo2max: 'load', cardioRecovery: 'load', weight: 'weight'
};
export const SOURCE_LABEL: Record<string, string> = {
  healthfit: 'HealthFit', file: 'Datei', shortcut: 'Kurzbefehl', intervals: 'intervals.icu', oura: 'Oura', whoop: 'WHOOP', polar: 'Polar',
  withings: 'Withings', fitbit: 'Fitbit', suunto: 'Suunto', coros: 'COROS', wahoo: 'Wahoo', zepp: 'Zepp', healthkit: 'Apple Health', manual: 'von Hand'
};

export function priorityOf(settings: any, group: MetricGroup): Source[] {
  const p = settings && settings.sourcePriority && settings.sourcePriority[group];
  const base = DEFAULT_PRIORITY[group];
  if (!Array.isArray(p) || !p.length) return base;
  return [...p.filter((s: Source) => base.includes(s) || s === 'manual'), ...base.filter(s => !p.includes(s))];
}
const rank = (list: Source[], s: Source) => { const i = list.indexOf(s); return i < 0 ? 999 : i; };

/* ---------- Tageswerte (trend) ---------- */
/* Ein Trend-Punkt trägt: die angezeigten Werte, _auto (alle automatischen Werte je Quelle), _src (Quelle je Feld) und _manual (von Hand). */
export function upgradeLegacyPoint(p: any): any {
  if (!p || p._auto) return p;
  const out = { ...p, _auto: {}, _src: {}, _manual: {} };
  const icu = p._icu || {};
  for (const [k, v] of Object.entries(p)) {
    if (k.startsWith('_') || k === 'date' || k === 'illness' || v == null) continue;
    if (Object.prototype.hasOwnProperty.call(icu, k) && icu[k] === v) { out._auto[k] = { intervals: v }; out._src[k] = 'intervals'; }
    else { out._manual[k] = true; out._src[k] = 'manual'; }
  }
  for (const [k, v] of Object.entries(icu)) if (out._auto[k] == null && v != null) out._auto[k] = { intervals: v };
  delete out._icu;
  return out;
}

/* Nimmt automatische Werte einer Quelle auf. Liefert den neuen Punkt und ob sich etwas Sichtbares geändert hat. */
export function mergeTrendValues(existing: any, date: string, source: Source, values: Record<string, number | null | undefined>, settings: any): { point: any; changed: boolean } {
  const p = upgradeLegacyPoint(existing ? { ...existing } : { date }) || { date };
  p.date = date;
  p._auto = { ...(p._auto || {}) }; p._src = { ...(p._src || {}) }; p._manual = { ...(p._manual || {}) };
  let changed = false;
  for (const [k, v] of Object.entries(values)) {
    if (v == null || !isFinite(v as number)) continue;
    const prevAuto = (p._auto[k] || {})[source];
    if (prevAuto !== v) { p._auto[k] = { ...(p._auto[k] || {}), [source]: v }; changed = true; }
    if (p._manual[k]) continue; // von Hand gilt
    const best = bestAuto(p, k, settings);
    if (best && (p[k] !== best.value || p._src[k] !== best.source)) { p[k] = best.value; p._src[k] = best.source; changed = true; }
  }
  return { point: p, changed };
}
export function bestAuto(p: any, field: string, settings: any): { source: Source; value: number } | null {
  const auto = (p._auto || {})[field];
  if (!auto) return null;
  const group = FIELD_GROUP[field] || 'sleep';
  const order = priorityOf(settings, group);
  const srcs = Object.keys(auto).filter(s => auto[s] != null) as Source[];
  if (!srcs.length) return null;
  srcs.sort((a, b) => rank(order, a) - rank(order, b));
  return { source: srcs[0], value: auto[srcs[0]] };
}
/* Korrektur von Hand */
export function setManual(existing: any, date: string, field: string, value: number | string | null): any {
  const p = upgradeLegacyPoint(existing ? { ...existing } : { date }) || { date };
  p.date = date; p._manual = { ...(p._manual || {}) }; p._src = { ...(p._src || {}) }; p._auto = { ...(p._auto || {}) };
  if (value == null || value === '') {
    // Feld geleert: ohne automatischen Wert bleibt es leer, sonst gilt wieder der automatische
    delete p._manual[field];
    const best = bestAuto(p, field, null);
    p[field] = best ? best.value : null; p._src[field] = best ? best.source : undefined;
    if (!best) delete p._src[field];
  } else { p[field] = value; p._manual[field] = true; p._src[field] = 'manual'; }
  return p;
}
export function resetToOriginal(existing: any, field: string, settings: any): any {
  const p = upgradeLegacyPoint({ ...existing });
  p._manual = { ...(p._manual || {}) }; delete p._manual[field];
  const best = bestAuto(p, field, settings);
  p._src = { ...(p._src || {}) };
  if (best) { p[field] = best.value; p._src[field] = best.source; } else { p[field] = null; delete p._src[field]; }
  return p;
}
export function hasOriginal(p: any, field: string): boolean { return !!(p && p._manual && p._manual[field] && p._auto && p._auto[field] && Object.keys(p._auto[field]).length); }

/* ---------- Einheiten ---------- */
const SAME_WINDOW_MS = 30 * 60 * 1000;
export function sameWorkout(a: Activity, b: Activity): boolean {
  const sp = (x: string) => (x === 'walk' ? 'run' : x);
  return a.date === b.date && sp(a.sport) === sp(b.sport) && Math.abs(a.startMs - b.startMs) <= SAME_WINDOW_MS;
}
/* Führt zwei Aufzeichnungen derselben Einheit zusammen. Die Quelle mit Vorrang gewinnt, Lücken werden aufgefüllt. */
export function mergeActivities(a: Activity, b: Activity, settings: any): Activity {
  const order = priorityOf(settings, 'workouts');
  const [win, lose] = rank(order, a.source) <= rank(order, b.source) ? [a, b] : [b, a];
  const out: any = { ...win };
  for (const [k, v] of Object.entries(lose)) if ((out[k] == null || (Array.isArray(out[k]) && !out[k].length)) && v != null) out[k] = v;
  out.sources = [...new Set([...(win.sources || [win.source]), ...(lose.sources || [lose.source])])];
  out.manual = { ...(lose.manual || {}), ...(win.manual || {}) };
  out.sessionId = win.sessionId || lose.sessionId || null;
  out.id = win.id;
  return out;
}

/* Was eine Aufzeichnung in die Felder einer Einheit schreibt (gleiche Namen wie bisher in der App) */
export function metricsFromActivity(a: Activity): Record<string, string> {
  const m: Record<string, string> = {};
  const mmss = (s: number) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
  if (a.min != null) m.min = String(a.min);
  if (a.avgHr != null) m.hr = String(a.avgHr);
  if (a.sport === 'swim') {
    if (a.km != null) m.meters = String(Math.round(a.km * 1000));
    if (a.swim && a.swim.pace100) m.pace100 = mmss(a.swim.pace100);
    if (a.swim && a.swim.strokesPerLength) m.spl = String(a.swim.strokesPerLength);
    if (a.swim && a.swim.metersPerStroke) m.dps = String(a.swim.metersPerStroke);
    if (a.swim && a.swim.strokeRate) m.rate = String(a.swim.strokeRate);
  } else {
    if (a.km != null) m.km = String(a.km);
    if (a.sport === 'run' && a.paceSecKm) m.pace = mmss(a.paceSecKm);
    if (a.sport === 'bike' && a.speedKmh) m.speed = String(a.speedKmh);
    if (a.avgPower) m.power = String(a.avgPower);
  }
  return m;
}

export interface IngestCtx {
  /** effektiver Plan (mit Anpassungen) */
  planDays: { date: string; sessions: any[] }[];
  sessions: Record<string, any>;
  customs: Record<string, any>;
  activities: Record<string, Activity>;
  settings: any;
  tz?: string;
}
export interface IngestResult { activities: Activity[]; sessions: Record<string, any>; customs: any[]; matched: 'session' | 'custom' | 'merged' | 'unchanged'; activity: Activity }

/* Nimmt eine neue Aufzeichnung auf: Doppelte zusammenführen, der geplanten Einheit zuordnen und abhaken, sonst als Extra-Einheit anlegen. */
export function ingestActivity(ctx: IngestCtx, incoming: Activity): IngestResult {
  const res: IngestResult = { activities: [], sessions: {}, customs: [], matched: 'unchanged', activity: incoming };
  let act = { ...incoming };
  const existingSame = Object.values(ctx.activities).find(x => x && !x.mergedInto && x.id !== act.id && sameWorkout(x, act));
  const already = ctx.activities[act.id];
  if (already) { act = mergeActivities(act, already, ctx.settings); } // gleiche Aufzeichnung erneut: die neuen Werte gelten
  if (existingSame) {
    const merged = mergeActivities(existingSame, act, ctx.settings);
    const loserId = merged.id === existingSame.id ? act.id : existingSame.id;
    res.activities.push(merged);
    if (loserId !== merged.id) res.activities.push({ ...(loserId === act.id ? act : existingSame), mergedInto: merged.id } as Activity);
    act = merged; res.matched = 'merged';
  } else {
    res.activities.push(act);
  }
  res.activity = act;
  const metrics = metricsFromActivity(act);

  // Schon zugeordnet: Werte aktualisieren (ohne Korrekturen von Hand anzufassen)
  const linkedSession = act.sessionId && ctx.sessions[act.sessionId] !== undefined ? act.sessionId : null;
  const linkedCustom = Object.values(ctx.customs).find(c => c && c.activityId && (c.activityId === act.id || c.activityId === incoming.id || (existingSame && c.activityId === existingSame.id)));
  if (linkedSession || (act.sessionId && !linkedCustom)) {
    res.sessions[act.sessionId!] = applyToSession(ctx.sessions[act.sessionId!] || {}, act, metrics);
    if (res.matched === 'unchanged') res.matched = 'session';
    return res;
  }
  if (linkedCustom) { res.customs.push(applyToCustom(linkedCustom, act, metrics)); if (res.matched === 'unchanged') res.matched = 'custom'; return res; }

  // Neue Zuordnung: gleicher Tag, gleicher Sport, nicht ausgefallen, noch nicht verknüpft. Geplante Uhrzeit möglichst nah.
  const day = ctx.planDays.find(d => d.date === act.date);
  const taken = new Set(Object.values(ctx.activities).map(a => a && a.sessionId).filter(Boolean));
  const sportOk = (s: any) => s.sport === act.sport || (act.sport === 'walk' && s.sport === 'run' && /locker|spazier|walk|geh/i.test(s.title || ''));
  const cands = day ? day.sessions.filter(s => s && sportOk(s) && !s.cancelled && !(ctx.sessions[s.id] || {}).skipped && !taken.has(s.id) && !(ctx.sessions[s.id] || {}).activityId) : [];
  if (cands.length) {
    const startH = +new Intl.DateTimeFormat('en-GB', { timeZone: ctx.tz || 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(new Date(act.startMs));
    const tOf = (s: any) => { const m = /(\d{1,2})[:.](\d{2})/.exec(s.time || s.title || ''); return m ? +m[1] : 12; };
    cands.sort((a, b) => Math.abs(tOf(a) - startH) - Math.abs(tOf(b) - startH));
    const s = cands[0];
    act.sessionId = s.id;
    res.activities[0] = act;
    res.sessions[s.id] = applyToSession(ctx.sessions[s.id] || {}, act, metrics);
    res.matched = res.matched === 'merged' ? 'merged' : 'session';
    return res;
  }
  // Keine passende geplante Einheit: Extra-Einheit
  const id = 'act-' + act.id;
  const c = ctx.customs[id] || { id, date: act.date, sport: act.sport === 'walk' ? 'run' : act.sport, title: act.name || defaultTitle(act), description: '', auto: true };
  res.customs.push(applyToCustom(c, act, metrics));
  if (res.matched === 'unchanged') res.matched = 'custom';
  return res;
}
function defaultTitle(a: Activity): string {
  return ({ run: 'Lauf', bike: 'Radfahrt', swim: 'Schwimmen', strength: 'Kraft', football: 'Teamsport', walk: 'Gehen', multi: 'Multisport', other: 'Training' } as any)[a.sport] || 'Training';
}
/* Werte einer Aufzeichnung in die Einheit schreiben. Felder, die von Hand geändert wurden (metricsManual), bleiben. */
export function applyToSession(st: any, a: Activity, metrics: Record<string, string>): any {
  const out = { completed: true, notes: '', ...st };
  out.completed = true; out.skipped = false;
  out.activityId = a.id;
  out.source = a.source; out.sources = a.sources;
  const man = out.metricsManual || {};
  out.metrics = { ...(out.metrics || {}) };
  for (const [k, v] of Object.entries(metrics)) if (!man[k]) out.metrics[k] = v;
  out.metricsAuto = metrics;
  return out;
}
function applyToCustom(c: any, a: Activity, metrics: Record<string, string>): any {
  const out = { ...c, activityId: a.id, source: a.source, sources: a.sources };
  const man = out.metricsManual || {};
  out.metrics = { ...(out.metrics || {}) };
  for (const [k, v] of Object.entries(metrics)) if (!man[k]) out.metrics[k] = v;
  out.metricsAuto = metrics;
  if (out.plannedMinutes == null && a.min != null) out.plannedMinutes = a.min;
  if (out.plannedKm == null && a.km != null) out.plannedKm = a.km;
  return out;
}
/* Korrektur einer Einheit von Hand und Zurücksetzen */
export function setSessionMetricManual(st: any, key: string, value: string): any {
  const out = { ...st, metrics: { ...(st.metrics || {}) }, metricsManual: { ...(st.metricsManual || {}) } };
  if (value === '' || value == null) { delete out.metrics[key]; if (out.metricsAuto && out.metricsAuto[key] != null) out.metricsManual[key] = true; else delete out.metricsManual[key]; }
  else { out.metrics[key] = value; if (out.metricsAuto) out.metricsManual[key] = true; }
  return out;
}
export function resetSessionMetrics(st: any): any {
  const out = { ...st, metrics: { ...(st.metrics || {}), ...(st.metricsAuto || {}) }, metricsManual: {} };
  return out;
}

/* Werte einer Quelle aus Tageswerten entfernen (z. B. Oura-Daten dürfen nicht an eine KI, siehe SPAETER.md) */
export function withoutSource(trend: any[], source: string): any[] {
  return (trend || []).map(p0 => {
    if (!p0) return p0;
    const p = upgradeLegacyPoint({ ...p0 });
    const out: any = { ...p, _auto: {}, _src: { ...(p._src || {}) } };
    for (const [f, by] of Object.entries(p._auto || {}) as [string, any][]) {
      const rest = { ...by }; delete rest[source];
      out._auto[f] = rest;
      if ((p._src || {})[f] === source) { const keys = Object.keys(rest); out[f] = keys.length ? rest[keys[0]] : null; if (keys.length) out._src[f] = keys[0]; else delete out._src[f]; }
    }
    return out;
  });
}
export function hasSource(p: any, source: string): boolean { return !!p && !!p._src && Object.values(p._src).includes(source); }
