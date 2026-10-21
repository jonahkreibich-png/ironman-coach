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
  if (a.source === 'manual' || (strokes.length > 0 && strokes.every(k => /^(freestyle|crawl|front_crawl)$/i.test(k)))) return resultNumber(sw.longestContinuousM);
  return null;
}
export function actualMetrics(st: any = {}, a: any = null): Record<string, any> {
  const sw = a?.swim || {};
  const m: Record<string, any> = a ? {
    min: a.min, km: a.km, meters: a.km == null ? null : a.km * 1000,
    hr: a.avgHr, maxHr: a.maxHr, power: a.avgPower, maxPower: a.maxPower,
    cadence: a.avgCadence, maxCadence: a.maxCadence, pace: time(a.paceSecKm),
    speed: a.speedKmh, decoupling: a.decouplingPct, efficiency: a.efficiency,
    spl: sw.strokesPerLength, dps: sw.metersPerStroke, rate: sw.strokeRate,
    pace100: time(sw.pace100), longestCrawl: crawlOf(a), splits: a.splits
  } : {};
  for (const [k, v] of Object.entries(st?.metrics || {})) {
    const src = st.metricsSrc?.[k];
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
  return m;
}
export function effectiveActivity(a: any, st: any = {}): any {
  const m = actualMetrics(st, a), out = { ...a };
  const map: Record<string, string> = { min: 'min', km: 'km', hr: 'avgHr', maxHr: 'maxHr', power: 'avgPower', cadence: 'avgCadence', decoupling: 'decouplingPct', efficiency: 'efficiency' };
  for (const [key, prop] of Object.entries(map)) out[prop] = resultNumber(m[key]);
  if (a.sport === 'swim') out.km = resultNumber(m.meters) == null ? null : resultNumber(m.meters)! / 1000;
  out.paceSecKm = pace(m.pace) ?? (out.km > 0 && out.min > 0 ? out.min * 60 / out.km : null);
  out.speedKmh = resultNumber(m.speed) ?? (out.km > 0 && out.min > 0 ? out.km * 60 / out.min : null);
  if (a.sport === 'swim') out.swim = { ...(a.swim || {}), longestCrawlM: resultNumber(m.longestCrawl), longestContinuousM: resultNumber(m.longestCrawl), pace100: pace(m.pace100), strokesPerLength: resultNumber(m.spl), metersPerStroke: resultNumber(m.dps) };
  if (['km', 'meters', 'min', 'pace', 'power', 'hr'].some(k => st.metricsManual?.[k] || st.metricsSrc?.[k] === 'manual')) {
    out.laps = []; out.intervals = null; out.pattern = null; out.splits = [];
    if (!st.metricsManual?.decoupling && st.metricsSrc?.decoupling !== 'manual') out.decouplingPct = null;
    if (!st.metricsManual?.efficiency && st.metricsSrc?.efficiency !== 'manual') out.efficiency = out.avgHr > 0 && out.speedKmh > 0 ? out.speedKmh / 3.6 * 60 / out.avgHr : null;
  }
  out.rpe = resultNumber(st.rpe) ?? a.rpe;
  return out;
}

/** Änderungskennung für Vorschläge; enthält keine Chattexte und löst keine Berechnung aus. */
export function evidenceSignature(state: any, weeks?: any[]): string {
  const stable = (x: any): any => Array.isArray(x) ? x.map(stable) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, stable(x[k])])) : x;
  const records = (obj: any) => Object.entries(obj || {}).sort(([a], [b]) => a.localeCompare(b)).map(([id, x]: any) => [id, { completed: x.completed, skipped: x.skipped, activityId: x.activityId, metrics: x.metrics, metricsManual: x.metricsManual, rpe: x.rpe, feel: x.feel, notes: x.notes, deviation: x.deviation }]);
  const custom: Record<string, any> = {};
  Object.entries(state.customWorkouts || {}).forEach(([date, list]: any) => (list || []).forEach((w: any) => { custom[date + ':' + w.id] = { ...w, date }; }));
  const input = JSON.stringify(stable({ sessions: records(state.sessions), custom: records(custom), activities: state.activities || {}, skills: state.profile?.skills || {}, adjustments: state.adjustments || {}, weeks: weeks || [] }));
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
  return 'results-v1-' + (hash >>> 0).toString(16);
}
