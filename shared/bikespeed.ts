/* Geschwindigkeitszonen Rad (Auftrag 12): wie die Pace-Zonen beim Laufen, aber in km/h und getrennt je Rad
   (Rennrad, Gravel, drinnen mit virtueller Geschwindigkeit), weil die Räder unterschiedlich schnell sind.
   Grundlage ist die Schwellen-Geschwindigkeit auf flacher Strecke (etwa 1 Stunde haltbar). Puls bzw. Watt bleiben die Hauptvorgabe,
   das Tempo ist nur ein Anhalt: Wind und Steigung machen langsamer.
   Zonen: Tempo wächst etwa mit der dritten Wurzel der Leistung, daher Z2 (56-75 % FTP) ≈ 80-90 % der Schwellen-Geschwindigkeit. */
import type { Profile } from './profile';
import { intervalsOf } from './activity/structure';

export type BikeKind = 'road' | 'gravel' | 'indoor';
export const BIKE_KINDS: BikeKind[] = ['road', 'gravel', 'indoor'];
export const BIKE_KIND_LABEL: Record<BikeKind, string> = { road: 'Rennrad', gravel: 'Gravel', indoor: 'drinnen' };
/* Anteil der Schwellen-Geschwindigkeit je Zone [von, bis] */
export const SPEED_ZONES: [number, number][] = [[0, 0.80], [0.80, 0.90], [0.90, 0.96], [0.96, 1.02], [1.02, 9]];
/* Gravel ist bei gleicher Leistung etwa 10 % langsamer als das Rennrad (Reifen, Sitzposition, Untergrund) */
export const GRAVEL_F = 0.9;

const r1 = (x: number) => Math.round(x * 10) / 10;
const ok = (v: any) => typeof v === 'number' && v >= 10 && v <= 60;

/* Welches Rad ist das Hauptrad draußen? Rennrad/Zeitfahrrad vor Gravel/MTB/Trekking */
export function mainKind(p: Pick<Profile, 'bikes'>): 'road' | 'gravel' {
  const b = p.bikes || [];
  if (b.includes('road') || b.includes('tt')) return 'road';
  if (b.includes('gravel') || b.includes('mtb') || b.includes('trekking')) return 'gravel';
  return 'road';
}
/* Welche Räder hat die Person? (für Anzeige und Felder) */
export function kindsOf(p: Pick<Profile, 'bikes'>): BikeKind[] {
  const b = p.bikes || [];
  const out: BikeKind[] = [];
  if (b.includes('road') || b.includes('tt')) out.push('road');
  if (b.includes('gravel') || b.includes('mtb') || b.includes('trekking')) out.push('gravel');
  if (b.includes('trainer') || b.includes('spin')) out.push('indoor');
  return out.length ? out : [mainKind(p)];
}
/* Rad-Art aus Name/Titel, Ort und Feldern einer Einheit */
export function kindOf(o: { indoor?: boolean | null; bikeType?: string | null; name?: string | null; title?: string | null }, p?: Pick<Profile, 'bikes'>): BikeKind {
  if (o.indoor) return 'indoor';
  const txt = `${o.name || ''} ${o.title || ''}`;
  if (/rolle|trainer|indoor|zwift|rouvy|smart/i.test(txt)) return 'indoor';
  if (o.bikeType === 'road' || o.bikeType === 'tt') return 'road';
  if (o.bikeType === 'gravel' || o.bikeType === 'mtb' || o.bikeType === 'other') return 'gravel';
  if (/gravel|mtb|mountain|trekking|wald|schotter/i.test(txt)) return 'gravel';
  if (/rennrad|road|zeitfahr/i.test(txt)) return 'road';
  return p ? mainKind(p) : 'road';
}
/* Rad-Art aus dem Kontext einer geplanten Einheit (Name des Rads wie in plangen) */
export function kindFromName(bikeName: string | null | undefined, indoor: boolean): BikeKind {
  if (indoor) return 'indoor';
  if (/gravel|mountain|trekking/i.test(bikeName || '')) return 'gravel';
  return 'road';
}

export interface BikeSpeeds { road: number; gravel: number; indoor: number; main: 'road' | 'gravel'; measured: Partial<Record<BikeKind, boolean>> }
/* Schwellen-Geschwindigkeit je Rad. thresholdSpeedBikeKmh gilt für das Hauptrad; eigene Werte je Rad (Test, Trend, von Hand)
   stehen in thresholds.bikeSpeeds. Fehlende werden abgeleitet: Gravel = Rennrad × 0,9, drinnen (virtuell) ≈ Rennrad. */
export function bikeSpeedsOf(p: Pick<Profile, 'bikes' | 'thresholds'>): BikeSpeeds {
  const th: any = p.thresholds || {};
  const own: Partial<Record<BikeKind, number>> = th.bikeSpeeds || {};
  const main = mainKind(p);
  const base = ok(th.thresholdSpeedBikeKmh) ? th.thresholdSpeedBikeKmh : 27;
  const road0 = ok(own.road) ? own.road! : main === 'road' ? base : ok(own.gravel) ? own.gravel! / GRAVEL_F : base / GRAVEL_F;
  const gravel = ok(own.gravel) ? own.gravel! : main === 'gravel' && !ok(own.road) ? base : road0 * GRAVEL_F;
  const road = ok(own.road) ? own.road! : main === 'gravel' && ok(own.gravel) ? own.gravel! / GRAVEL_F : road0;
  const indoor = ok(own.indoor) ? own.indoor! : road;
  const est = (th.estimated || []).includes('thresholdSpeedBikeKmh');
  const measured: Partial<Record<BikeKind, boolean>> = { road: ok(own.road) || (main === 'road' && !est), gravel: ok(own.gravel) || (main === 'gravel' && !est), indoor: ok(own.indoor) };
  return { road: r1(road), gravel: r1(gravel), indoor: r1(indoor), main, measured };
}
export function speedFor(p: Pick<Profile, 'bikes' | 'thresholds'>, kind: BikeKind): number { return bikeSpeedsOf(p)[kind]; }

export interface SpeedZone { zone: number; lo: number; hi: number | null }
export function speedZonesFor(thr: number): SpeedZone[] {
  return SPEED_ZONES.map(([a, b], i) => ({ zone: i + 1, lo: r1(thr * a), hi: b >= 9 ? null : r1(thr * b) }));
}
/* „26–29 km/h“ (ganze Zahlen, die Grenzen nach innen gerundet, damit Zonen sich nicht überlappen) */
export function speedRange(thr: number, zone: number): string {
  const [a, b] = SPEED_ZONES[Math.max(0, Math.min(4, zone - 1))];
  if (a === 0) return `unter ${Math.round(thr * b)} km/h`;
  if (b >= 9) return `über ${Math.round(thr * a)} km/h`;
  return `${Math.round(thr * a)}–${Math.round(thr * b)} km/h`;
}
export const SPEED_HINT = 'Das Tempo gilt für flache Strecken ohne Wind. Bei Gegenwind, bergauf oder auf schlechtem Untergrund bist du langsamer, dann richte dich nach Puls oder Watt.';

/* Puls (Anteil der Schwelle) → Leistung (Anteil der FTP), nach den Zonen-Tabellen: 81 % ↔ 56 %, 89 % ↔ 75 %, 93 % ↔ 90 %, 100 % ↔ 100 % */
export function powerFracFromHr(hrFrac: number): number {
  const pts: [number, number][] = [[0.60, 0.20], [0.81, 0.56], [0.89, 0.75], [0.93, 0.90], [1.0, 1.0], [1.06, 1.08]];
  if (hrFrac <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (hrFrac <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (hrFrac - x0) / (x1 - x0) * (y1 - y0); }
  return pts[pts.length - 1][1];
}
/* Schwellen-Geschwindigkeit aus einer lockeren Fahrt: Tempo / (Leistungsanteil)^(1/3) */
export function thrSpeedFromRide(speedKmh: number, avgHr: number, lthr: number): number {
  return speedKmh / Math.cbrt(powerFracFromHr(avgHr / lthr));
}

/* Trend aus lockeren, flachen Fahrten der letzten 6 Wochen je Rad (mindestens 3 Fahrten): Median der geschätzten Schwellen-Geschwindigkeit */
export function speedTrend(acts: any[], lthrBike: number, p: Pick<Profile, 'bikes'>, end: string, startOf: (d: string, days: number) => string): Partial<Record<BikeKind, { kmh: number; n: number }>> {
  const from = startOf(end, -42);
  const by: Partial<Record<BikeKind, number[]>> = {};
  for (const a of acts) {
    if (!a || a.sport !== 'bike' || a.mergedInto || a.date > end || a.date <= from || !a.speedKmh || !a.avgHr || !a.min || a.min < 30) continue;
    if ((intervalsOf(a) || { count: 0 }).count >= 2) continue;
    const f = a.avgHr / lthrBike; if (f > 0.9 || f < 0.62) continue;
    if (a.km && a.ascentM && a.ascentM / a.km > 8) continue; // hügelig: Tempo sagt wenig
    const k = kindOf({ indoor: a.indoor, bikeType: a.bikeType, name: a.name }, p);
    (by[k] = by[k] || []).push(thrSpeedFromRide(a.speedKmh, a.avgHr, lthrBike));
  }
  const out: Partial<Record<BikeKind, { kmh: number; n: number }>> = {};
  (Object.keys(by) as BikeKind[]).forEach(k => { const v = by[k]!.sort((x, y) => x - y); if (v.length >= 3) out[k] = { kmh: r1(v[Math.floor(v.length / 2)]), n: v.length }; });
  return out;
}
