/* Neutrale Form einer Aufzeichnung, egal ob aus .fit, .gpx, .tcx, Kurzbefehl oder einer API. */
export type ActSport = 'run' | 'bike' | 'swim' | 'strength' | 'football' | 'walk' | 'multi' | 'other';

export interface RawRecord {
  t: number;              // Sekunden seit Start
  hr: number | null;
  cad: number | null;
  power: number | null;
  dist: number | null;    // Meter seit Start
  speed: number | null;   // m/s
  alt: number | null;     // m
  temp: number | null;    // °C
  lat: number | null;
  lon: number | null;
}
export interface RawLap {
  start: number; sec: number; elapsed?: number | null; dist: number | null;
  avgHr: number | null; maxHr: number | null; avgSpeed: number | null; avgPower: number | null;
  intensity: string | null; trigger: number | null; lengths?: number | null;
}
export interface RawLength { start: number; sec: number; strokes: number | null; stroke: string | null; cadence: number | null; active: boolean }
export interface RawActivity {
  format: 'fit' | 'gpx' | 'tcx' | 'api' | 'shortcut';
  sport: ActSport;
  subSport?: number | null;
  name?: string;
  startMs: number;
  indoor: boolean;
  openWater?: boolean;
  poolLengthM?: number | null;
  totals: {
    elapsedSec: number | null; movingSec: number | null; distanceM: number | null; ascentM: number | null;
    kcal: number | null; avgHr: number | null; maxHr: number | null; avgPower: number | null; avgSpeed: number | null;
  };
  records: RawRecord[];
  laps: RawLap[];
  lengths: RawLength[];
  device?: { manufacturer: number | null; product: number | null } | null;
  sessions?: { sport: ActSport; start: number; sec: number; distanceM: number | null }[];
}
