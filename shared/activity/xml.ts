/* .gpx und .tcx lesen, ohne DOM (läuft im Browser und im Worker). Namensräume (gpxtpx:, ns3: …) werden ignoriert. */
import type { RawActivity, RawRecord, RawLap, ActSport } from './types';

const R = 6371000;
function haversine(a: [number, number], b: [number, number]): number {
  const toR = (x: number) => x * Math.PI / 180;
  const dLat = toR(b[0] - a[0]), dLon = toR(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/* Text eines (ersten) Kind-Elements, egal mit welchem Präfix */
function tag(xml: string, name: string): string | null {
  const m = new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'i').exec(xml);
  return m ? m[1].trim() : null;
}
function tags(xml: string, name: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${name}\\b([^>]*)>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'gi');
  const out: string[] = []; let m;
  while ((m = re.exec(xml))) out.push(m[1] + '\u0000' + m[2]);
  return out;
}
function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(attrs);
  return m ? m[1] : null;
}
const numOr = (s: string | null): number | null => { if (s == null || s === '') return null; const n = parseFloat(s); return isFinite(n) ? n : null; };
function unescapeXml(s: string): string { return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }

function sportFromText(s: string | null): ActSport {
  const t = String(s || '').toLowerCase();
  if (/run|lauf|jog|trail/.test(t)) return 'run';
  if (/bik|cycl|rad|ride|velo/.test(t)) return 'bike';
  if (/swim|schwimm/.test(t)) return 'swim';
  if (/walk|hik|wander|spazier/.test(t)) return 'walk';
  if (/soccer|football|fußball|fussball/.test(t)) return 'football';
  if (/strength|kraft|weight|gym/.test(t)) return 'strength';
  return 'other';
}

function finish(format: 'gpx' | 'tcx', sport: ActSport, name: string | undefined, startMs: number, records: RawRecord[], laps: RawLap[], extra?: Partial<RawActivity['totals']>): RawActivity {
  const last = records[records.length - 1];
  const hrs = records.map(r => r.hr).filter((x): x is number => x != null);
  // Bewegte Zeit: Abschnitte mit mehr als 0,5 m/s
  let moving = 0;
  for (let i = 1; i < records.length; i++) {
    const dt = records[i].t - records[i - 1].t;
    const dd = (records[i].dist ?? 0) - (records[i - 1].dist ?? 0);
    if (dt > 0 && dt < 60 && dd / dt > 0.5) moving += dt;
  }
  let ascent = 0;
  for (let i = 1; i < records.length; i++) { const a = records[i].alt, b = records[i - 1].alt; if (a != null && b != null && a - b > 0.4) ascent += a - b; }
  const dist = extra && extra.distanceM != null ? extra.distanceM : last && last.dist != null ? last.dist : null;
  return {
    format, sport, name, startMs, indoor: !records.some(r => r.lat != null),
    totals: {
      elapsedSec: last ? last.t : null, movingSec: moving || (last ? last.t : null), distanceM: dist,
      ascentM: Math.round(ascent), kcal: extra && extra.kcal != null ? extra.kcal : null,
      avgHr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
      maxHr: hrs.length ? Math.max(...hrs) : null, avgPower: null,
      avgSpeed: dist && moving ? dist / moving : null
    },
    records, laps, lengths: []
  };
}

export function parseGpx(xml: string): RawActivity {
  if (!/<gpx\b/i.test(xml)) throw new Error('Keine GPX-Datei');
  const trk = tag(xml, 'trk') || xml;
  const name = tag(trk, 'name');
  const type = tag(trk, 'type');
  const pts = tags(trk, 'trkpt');
  if (!pts.length) throw new Error('Die GPX-Datei enthält keine Trackpunkte');
  const records: RawRecord[] = [];
  let t0: number | null = null, dist = 0, prev: [number, number] | null = null;
  for (const p of pts) {
    const [attrs, body] = p.split('\u0000');
    const lat = numOr(attr(attrs, 'lat')), lon = numOr(attr(attrs, 'lon'));
    const tm = tag(body, 'time'); if (!tm) continue;
    const ms = Date.parse(tm); if (!isFinite(ms)) continue;
    if (t0 == null) t0 = ms;
    if (lat != null && lon != null) { if (prev) dist += haversine(prev, [lat, lon]); prev = [lat, lon]; }
    records.push({ t: (ms - t0) / 1000, hr: numOr(tag(body, 'hr')), cad: numOr(tag(body, 'cad')), power: numOr(tag(body, 'power')), dist, speed: null, alt: numOr(tag(body, 'ele')), temp: numOr(tag(body, 'atemp')), lat, lon });
  }
  if (t0 == null) throw new Error('Die GPX-Datei hat keine Zeitangaben');
  // Tempo aus Strecke/Zeit (geglättet über 5 Punkte)
  for (let i = 0; i < records.length; i++) {
    const a = records[Math.max(0, i - 2)], b = records[Math.min(records.length - 1, i + 2)];
    const dt = b.t - a.t; records[i].speed = dt > 0 ? ((b.dist ?? 0) - (a.dist ?? 0)) / dt : null;
  }
  return finish('gpx', sportFromText(type || name), name ? unescapeXml(name) : undefined, t0, records, []);
}

export function parseTcx(xml: string): RawActivity {
  if (!/<TrainingCenterDatabase\b/i.test(xml)) throw new Error('Keine TCX-Datei');
  const act = tags(xml, 'Activity')[0];
  if (!act) throw new Error('Die TCX-Datei enthält keine Aktivität');
  const [actAttrs, body] = act.split('\u0000');
  const sport = sportFromText(attr(actAttrs, 'Sport'));
  const records: RawRecord[] = [];
  const laps: RawLap[] = [];
  let t0: number | null = null, kcal = 0, distTotal = 0;
  for (const l of tags(body, 'Lap')) {
    const [la, lb] = l.split('\u0000');
    const lstart = Date.parse(attr(la, 'StartTime') || '');
    if (t0 == null && isFinite(lstart)) t0 = lstart;
    const sec = numOr(tag(lb, 'TotalTimeSeconds')) || 0;
    const ldist = numOr(tag(lb, 'DistanceMeters'));
    kcal += numOr(tag(lb, 'Calories')) || 0;
    distTotal += ldist || 0;
    const avgHrBlock = tag(lb, 'AverageHeartRateBpm'), maxHrBlock = tag(lb, 'MaximumHeartRateBpm');
    laps.push({ start: t0 != null && isFinite(lstart) ? (lstart - t0) / 1000 : 0, sec, dist: ldist, avgHr: avgHrBlock ? numOr(tag(avgHrBlock, 'Value')) : null, maxHr: maxHrBlock ? numOr(tag(maxHrBlock, 'Value')) : null, avgSpeed: ldist && sec ? ldist / sec : null, avgPower: null, intensity: /Resting/i.test(tag(lb, 'Intensity') || '') ? 'rest' : 'active', trigger: null });
    for (const tp of tags(lb, 'Trackpoint')) {
      const tb = tp.split('\u0000')[1];
      const ms = Date.parse(tag(tb, 'Time') || ''); if (!isFinite(ms)) continue;
      if (t0 == null) t0 = ms;
      const hrb = tag(tb, 'HeartRateBpm'); const pos = tag(tb, 'Position');
      records.push({ t: (ms - t0) / 1000, hr: hrb ? numOr(tag(hrb, 'Value')) : null, cad: numOr(tag(tb, 'Cadence')) ?? numOr(tag(tb, 'RunCadence')), power: numOr(tag(tb, 'Watts')), dist: numOr(tag(tb, 'DistanceMeters')), speed: numOr(tag(tb, 'Speed')), alt: numOr(tag(tb, 'AltitudeMeters')), temp: null, lat: pos ? numOr(tag(pos, 'LatitudeDegrees')) : null, lon: pos ? numOr(tag(pos, 'LongitudeDegrees')) : null });
    }
  }
  if (t0 == null) throw new Error('Die TCX-Datei hat keine Zeitangaben');
  return finish('tcx', sport, undefined, t0, records, laps, { kcal: kcal || null, distanceM: distTotal || null });
}

/* Erkennt das Format am Inhalt */
export function parseActivityFile(name: string, data: Uint8Array, parseFit: (b: Uint8Array) => RawActivity): RawActivity {
  const head = String.fromCharCode(...data.slice(0, 16));
  if (/\.fit$/i.test(name) || head.slice(8, 12) === '.FIT') return parseFit(data);
  const text = new TextDecoder().decode(data);
  if (/<gpx\b/i.test(text)) return parseGpx(text);
  if (/<TrainingCenterDatabase\b/i.test(text)) return parseTcx(text);
  throw new Error('Unbekanntes Dateiformat. Möglich sind .fit, .gpx und .tcx.');
}
