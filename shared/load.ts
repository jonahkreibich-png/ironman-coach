/** Gemeinsame Tagesendwerte. Kein DOM, keine Abhängigkeit vom App-Zustand. */
export const LOAD_FIELDS = ['ctl', 'atl', 'tsb', 'loadRatio'] as const;
export const validDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;
const nextDay = (s: string) => new Date(Date.parse(s + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
const finite = (v: any) => typeof v === 'number' && Number.isFinite(v);
const nonnegative = (v: any) => finite(v) && v >= 0;
const round = (v: number) => Math.round(v * 10) / 10;
export function loadConstants(settings: any = {}) {
  const m = settings.loadModel || {};
  const days = (v: any, fallback: number) => finite(v) && v >= 1 && v <= 3650 ? v : fallback;
  return { ctlDays: days(m.ctlDays, 42), atlDays: days(m.atlDays, 7) };
}
export function loadSeriesFromDaily(loads: Record<string, number>, trend: any[], upto: string, settings: any = {}) {
  if (!validDate(upto)) return [];
  const points = (trend || []).filter(p => p && validDate(p.date) && p.date <= upto);
  const dates = [...Object.keys(loads).filter(d => validDate(d) && d <= upto), ...points.filter(p => nonnegative(p.ctl) || nonnegative(p.atl) || LOAD_FIELDS.some(k => p._manual?.[k] && finite(p[k]))).map(p => p.date)].sort();
  if (!dates.length) return [];
  const byDate = new Map(points.map(p => [p.date, p]));
  const { ctlDays, atlDays } = loadConstants(settings);
  let ctl = 0, atl = 0, anchored = false;
  const out = [];
  for (let d = dates[0]; d <= upto; d = nextDay(d)) {
    const tsbStart = ctl - atl;
    const load = nonnegative(loads[d]) ? loads[d] : 0;
    ctl += (load - ctl) / ctlDays; atl += (load - atl) / atlDays;
    const p = byDate.get(d);
    // Ein Import/Handwert beschreibt das Tagesende, Last dieses Tages ist bereits enthalten.
    if (p && nonnegative(p.ctl)) { ctl = p.ctl; anchored = true; }
    if (p && nonnegative(p.atl)) { atl = p.atl; anchored = true; }
    const manual = p && LOAD_FIELDS.some(k => p._manual?.[k] || p._src?.[k] === 'manual');
    const derivedTsb = ctl - atl, derivedRatio = ctl > 0 ? atl / ctl : null;
    const tsb = p?._manual?.tsb && finite(p.tsb) ? p.tsb : derivedTsb;
    const ratio = p?._manual?.loadRatio && nonnegative(p.loadRatio) ? p.loadRatio : derivedRatio;
    const inconsistent = Math.abs(tsb - derivedTsb) > 0.15 || (ratio != null && (derivedRatio == null || Math.abs(ratio - derivedRatio) > 0.015));
    const source = manual ? 'von Hand' : p && (nonnegative(p.ctl) || nonnegative(p.atl)) ? 'intervals.icu' : 'eigene Einheiten';
    out.push({ date: d, load, ctl: round(ctl), atl: round(atl), tsb: round(tsb), tsbStart: round(tsbStart), loadRatio: ratio == null ? null : Math.round(ratio * 1000) / 1000, source, src: source, inconsistent, estimated: !anchored });
  }
  return out;
}

/** Separates Änderungsprotokoll bleibt im datierten Trend-Datensatz und wird mitsynchronisiert. */
export function recordLoadEdit(before: any, after: any, action: string, at = Date.now()) {
  const snapshot = (p: any) => Object.fromEntries(LOAD_FIELDS.map(k => [k, { value: p?.[k] ?? null, manual: !!p?._manual?.[k], source: p?._src?.[k] ?? null }]));
  return { ...after, _loadHistory: [...(before?._loadHistory || []), { at, action, before: snapshot(before), after: snapshot(after) }] };
}
export function undoLoadEdit(point: any) {
  const history = point?._loadHistory || [];
  const last = [...history].reverse().find(x => !x.undoneAt);
  if (!last) return point;
  const out = { ...point, _manual: { ...point._manual }, _src: { ...point._src } };
  for (const k of LOAD_FIELDS) {
    if (JSON.stringify(last.before[k]) === JSON.stringify(last.after[k])) continue;
    const prev = last.before[k];
    const auto = !prev.manual ? Object.entries(point._auto?.[k] || {}).find(([source, value]) => finite(value) && (source === prev.source || !prev.source)) : null;
    out[k] = auto ? auto[1] : prev.value;
    if (prev.manual) out._manual[k] = true; else delete out._manual[k];
    if (auto) out._src[k] = auto[0]; else if (prev.source) out._src[k] = prev.source; else delete out._src[k];
  }
  out._loadHistory = history.map(x => x === last ? { ...x, undoneAt: Date.now() } : x);
  return out;
}
