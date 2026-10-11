/* Profil des Nutzers statt fester Werte im Code. Wird als Datensatz (kind "profile", key "main") synchronisiert.
   Fehlt das Profil (alte Daten), wird es aus den bisherigen Einstellungen abgeleitet. */

export type SportKey = 'swim' | 'bike' | 'run' | 'strength' | 'football';
export type Units = 'metric' | 'imperial';
export type Lang = 'de' | 'en';

export interface FixedEvent { id: string; dow: number; sport: SportKey; title: string; time?: string; minutes?: number; hard?: boolean }
export interface Routine { id: string; title: string; days: number[]; time: string }
export interface DayWindow { from: string; to: string }
export interface Thresholds {
  lthrRun: number; lthrBike: number; maxHr?: number | null;
  thresholdPaceRunSec: number; thresholdSpeedBikeKmh: number;
  ftp?: number | null; cssSec?: number | null;
}
export interface Profile {
  name: string;
  birthYear: number | null;
  sex?: 'f' | 'm' | 'd' | null;
  heightCm: number | null;
  weightKg: number | null;
  pal: number;
  sports: SportKey[];
  teamSportName: string;
  thresholds: Thresholds;
  weeklyHours: number;
  maxDayHours: number;
  /** verfügbare Zeitfenster je Wochentag 0=So … 6=Sa */
  availability: Record<number, DayWindow[]>;
  fixed: FixedEvent[];
  routines: Routine[];
  units: Units;
  lang: Lang;
  /** Gesundheit: ärztliche Freigabe nötig (Herz, Asthma …) → vorsichtiger Plan */
  medicalCaution: boolean;
  injuries: string;
  vegetarian?: boolean;
  trackCalories?: boolean;
  planStyle: 'strict' | 'flexible';
  likesIntensity: 'intensity' | 'volume' | 'balanced';
  /** Ausdauersport-Erfahrung in Jahren */
  experienceYears: number | null;
  /** Antworten aus dem Onboarding (frei) */
  answers?: Record<string, any>;
  updatedAt?: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { lthrRun: 170, lthrBike: 162, thresholdPaceRunSec: 339, thresholdSpeedBikeKmh: 28, maxHr: null, ftp: null, cssSec: null };

export function defaultProfile(): Profile {
  return {
    name: '', birthYear: null, sex: null, heightCm: null, weightKg: null, pal: 1.4,
    sports: ['swim', 'bike', 'run'], teamSportName: 'Teamsport',
    thresholds: { ...DEFAULT_THRESHOLDS },
    weeklyHours: 6, maxDayHours: 2.5,
    availability: {}, fixed: [], routines: [],
    units: 'metric', lang: 'de',
    medicalCaution: false, injuries: '', planStyle: 'flexible', likesIntensity: 'balanced', experienceYears: null
  };
}

/* Aus alten Einstellungen (STATE.settings, nutritionProfile) ein Profil bauen. Werte kommen aus den Daten, nicht aus dem Code. */
export function profileFromLegacy(state: any, today: string): Profile {
  const p = defaultProfile();
  const s = (state && state.settings) || {};
  const np = (state && state.nutritionProfile) || {};
  if (np.age) p.birthYear = +today.slice(0, 4) - np.age;
  if (np.heightCm) p.heightCm = np.heightCm;
  if (np.weightKg) p.weightKg = np.weightKg;
  if (np.pal) p.pal = np.pal;
  p.thresholds = {
    ...p.thresholds,
    ...(s.lthrRun ? { lthrRun: s.lthrRun } : {}), ...(s.lthrBike ? { lthrBike: s.lthrBike } : {}),
    ...(s.thresholdPaceRunSec ? { thresholdPaceRunSec: s.thresholdPaceRunSec } : {}), ...(s.thresholdSpeedBikeKmh ? { thresholdSpeedBikeKmh: s.thresholdSpeedBikeKmh } : {})
  };
  // Sportarten aus dem Plan erkennen
  const seen = new Set<string>();
  ((state && state.planWeeks) || []).forEach((w: any) => (w.days || []).forEach((d: any) => (d.sessions || []).forEach((x: any) => { if (x && x.sport && x.sport !== 'rest') seen.add(x.sport); })));
  if (seen.size) p.sports = (['swim', 'bike', 'run', 'strength', 'football'] as SportKey[]).filter(k => seen.has(k));
  if (seen.has('football')) p.teamSportName = 'Fußball';
  return p;
}

export function mergeProfile(stored: any, fallback: Profile): Profile {
  if (!stored || typeof stored !== 'object') return fallback;
  const p = { ...defaultProfile(), ...stored };
  p.thresholds = { ...DEFAULT_THRESHOLDS, ...(stored.thresholds || {}) };
  p.availability = stored.availability || {};
  p.fixed = Array.isArray(stored.fixed) ? stored.fixed : [];
  p.routines = Array.isArray(stored.routines) ? stored.routines : [];
  p.sports = Array.isArray(stored.sports) && stored.sports.length ? stored.sports : fallback.sports;
  return p;
}

export function ageOf(p: Pick<Profile, 'birthYear'>, today: string): number | null {
  return p.birthYear ? +today.slice(0, 4) - p.birthYear : null;
}
export function isMinor(p: Pick<Profile, 'birthYear'>, today: string): boolean {
  const a = ageOf(p, today);
  return a != null && a < 18;
}
/* Schlafbedarf nach Alter (Empfehlungen der Schlafmedizin): Jugendliche mehr, weil sie noch wachsen. */
export function sleepNeed(p: Pick<Profile, 'birthYear'>, today: string): [number, number] {
  const a = ageOf(p, today);
  if (a == null) return [7.5, 9];
  if (a < 13) return [9, 11];
  if (a < 18) return [8.5, 9.5];
  if (a < 26) return [7.5, 9];
  return [7, 9];
}
/* Grobe Schätzung des Maximalpulses, nur wenn nichts gemessen ist */
export function estMaxHr(p: Profile, today: string): number {
  if (p.thresholds.maxHr) return p.thresholds.maxHr;
  const a = ageOf(p, today) ?? 30;
  return Math.round(208 - 0.7 * a);
}
