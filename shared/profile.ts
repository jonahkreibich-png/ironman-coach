/* Profil des Nutzers statt fester Werte im Code. Wird als Datensatz (kind "profile", key "main") synchronisiert.
   Fehlt das Profil (alte Daten), wird es aus den bisherigen Einstellungen abgeleitet.
   Im Code stehen keine Werte einer bestimmten Person: fehlende Schwellen werden aus dem Profil geschätzt
   (Alter, Bestzeiten, Können) und als „geschätzt“ markiert, bis ein Test oder eine Messung sie ersetzt. */

import type { Rule } from './constraints';

export type SportKey = 'swim' | 'bike' | 'run' | 'strength' | 'football';
export type Units = 'metric' | 'imperial';
export type Lang = 'de' | 'en';

export interface FixedEvent { id: string; dow: number; sport: SportKey; title: string; time?: string; minutes?: number; hard?: boolean }
export interface Routine { id: string; title: string; days: number[]; time: string }
export interface DayWindow { from: string; to: string }
export type ThresholdKey = 'lthrRun' | 'lthrBike' | 'maxHr' | 'thresholdPaceRunSec' | 'thresholdSpeedBikeKmh' | 'ftp' | 'cssSec';
export interface Thresholds {
  lthrRun: number; lthrBike: number; maxHr?: number | null;
  thresholdPaceRunSec: number; thresholdSpeedBikeKmh: number;
  ftp?: number | null; cssSec?: number | null;
  /** aerobe Schwelle (Puls), Obergrenze für lockere Einheiten; [von, bis] */
  aetHr?: [number, number] | null;
  /** VO2max (ml/kg/min), z. B. von der Uhr */
  vo2max?: number | null;
  /** Werte, die nur aus dem Profil geschätzt sind (kein Test, keine Messung) */
  estimated?: ThresholdKey[];
  /** Herkunft der Schwellen (z. B. „Lauftest 24.10.“) */
  source?: string;
}
/** Aufbau: so viele Wochen steigern, dann eine Erholungswoche; Steigerung pro Woche in Prozent */
export interface Progression { buildWeeks: number; incPct: number }
/** Kraft nach Körperbereich an festen Tagen (0=So … 6=Sa) */
export interface StrengthPlan { lower: number[]; upper: number[]; core?: number[] }
/** Morgens vor Schule/Arbeit: an diesen Tagen nur kurze Einheiten am Morgen (ohne Schwimmbad), längere am Nachmittag */
export interface MorningSlot { days: number[]; maxMin: number; noPool: boolean; /** z. B. „vor der Schule“ */ label?: string }
/** Zeit pro Wochentag: 0 kein Training, 1 kurz (bis 45 min), 2 mittel (bis 90 min), 3 lang (mehr als 90 min) */
export type DayLoad = 0 | 1 | 2 | 3;
export const DAYLOAD_MIN: Record<DayLoad, number> = { 0: 0, 1: 45, 2: 90, 3: 180 };
export interface TeamSport {
  name: string;
  trainingDays: number[]; trainingMinutes: number;
  gameDays: number[]; gameMinutes: number;
  /** Saison (Spiele und Training) von … bis; außerhalb ist Pause. Leer = ganzjährig */
  seasonFrom?: string | null; seasonTo?: string | null;
}
export interface Skills {
  /** Kraul: ja / ein bisschen / nein */
  swimCrawl?: 'yes' | 'some' | 'no' | null;
  /** so viele Meter Kraul am Stück */
  swimCrawlM?: number | null;
  swimBreast?: boolean;
  /** so lange am Stück locker laufen (min) */
  runContinuousMin?: number | null;
  /** längste Radfahrt in letzter Zeit (min) */
  bikeLongestMin?: number | null;
}
/** Bestzeiten in Sekunden */
export interface Bests { run5k?: number | null; run10k?: number | null; runHalf?: number | null; runMarathon?: number | null; swim400?: number | null }
export const BIKE_TYPES = ['road', 'gravel', 'mtb', 'tt', 'trekking', 'ebike', 'trainer', 'spin'] as const;

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
  /** alte Form: verfügbare Zeitfenster je Wochentag 0=So … 6=Sa (neu: dayLoad) */
  availability: Record<number, DayWindow[]>;
  /** Zeit je Wochentag (0=So … 6=Sa) */
  dayLoad: Record<number, DayLoad>;
  timeOfDay: '' | 'morning' | 'evening';
  /** gewünschte Häufigkeit pro Woche je Sportart [mindestens, höchstens] */
  freq: Partial<Record<SportKey, [number, number]>>;
  teamSport: TeamSport | null;
  skills: Skills;
  bikes: string[];
  powerMeter: boolean;
  bests: Bests;
  /** freie Berücksichtigungen (eine pro Eintrag): Verletzungen, Vorlieben, Ausrüstung, Schwimmbad-Zeiten … */
  notes: string[];
  /** Regeln aus Wochenraster, Freitext und Chat (Auftrag 5): harte und weiche Einschränkungen */
  rules?: Rule[];
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
  /** eigener Aufbau-Rhythmus (sonst: Erwachsene 3+1 mit +10 %, Jugendliche 2+1 mit +8 %) */
  progression?: Progression | null;
  strengthPlan?: StrengthPlan | null;
  morning?: MorningSlot | null;
  /** langfristiges Lauf-Ziel für die Effizienz, z. B. 4:30/km bei Puls 120 */
  runGoal?: { paceSec: number; hr: number } | null;
  /** Uhr, Ring und Datenwege (nur zur Info für Plan und Coach) */
  devices?: string[];
  /** kurze Sätze für Plan und Coach (Schwächen, Schwerpunkte, Ausblick) */
  focus?: string[];
  /** Antworten aus dem Onboarding (frei) */
  answers?: Record<string, any>;
  updatedAt?: number;
}

export function defaultProfile(): Profile {
  return {
    name: '', birthYear: null, sex: null, heightCm: null, weightKg: null, pal: 1.4,
    sports: ['run'], teamSportName: '',
    thresholds: { lthrRun: 0, lthrBike: 0, thresholdPaceRunSec: 0, thresholdSpeedBikeKmh: 0, maxHr: null, ftp: null, cssSec: null, estimated: [] },
    weeklyHours: 5, maxDayHours: 2.5,
    availability: {}, dayLoad: {}, timeOfDay: '', freq: {}, teamSport: null, skills: {}, bikes: [], powerMeter: false, bests: {}, notes: [],
    fixed: [], routines: [],
    units: 'metric', lang: 'de',
    medicalCaution: false, injuries: '', planStyle: 'flexible', likesIntensity: 'balanced', experienceYears: null
  };
}

export function ageOf(p: Pick<Profile, 'birthYear'>, today: string): number | null {
  return p.birthYear ? +today.slice(0, 4) - p.birthYear : null;
}
export function isMinor(p: Pick<Profile, 'birthYear'>, today: string): boolean {
  const a = ageOf(p, today);
  return a != null && a < 18;
}

/* ---------- Schätzungen aus dem Profil ---------- */
/* Riegel: Zeit über eine andere Distanz. Daraus die Pace, die man etwa 60 min halten kann (≈ Schwellen-Pace). */
export function thresholdPaceFromBest(km: number, sec: number): number {
  const d60 = km * Math.pow(3600 / sec, 1 / 1.06);
  return Math.round(3600 / d60);
}
const BEST_KM: [keyof Bests, number][] = [['run10k', 10], ['runHalf', 21.0975], ['run5k', 5], ['runMarathon', 42.195]];

/* Geschätzte Schwellen. Jeder Wert sagt, woher er kommt. */
export function estimateThresholds(p: Partial<Profile>, today: string): { values: Required<Omit<Thresholds, 'estimated' | 'ftp' | 'cssSec' | 'aetHr' | 'vo2max' | 'source'>> & { ftp: number | null; cssSec: number | null }; basis: Partial<Record<ThresholdKey, string>> } {
  const age = (p.birthYear ? +today.slice(0, 4) - p.birthYear : null);
  const basis: Partial<Record<ThresholdKey, string>> = {};
  const maxHr = Math.round(208 - 0.7 * (age ?? 35));
  basis.maxHr = age != null ? `aus deinem Alter (${age})` : 'allgemeiner Wert (Alter fehlt)';
  const lthrRun = Math.round(maxHr * 0.89), lthrBike = Math.round(maxHr * 0.86);
  basis.lthrRun = 'etwa 89 % des Maximalpulses'; basis.lthrBike = 'etwa 86 % des Maximalpulses';
  // Laufen: aus einer Bestzeit, sonst aus Können und Erfahrung
  let pace: number | null = null;
  const bests = p.bests || {};
  for (const [k, km] of BEST_KM) { const s = bests[k]; if (s && s > 0) { pace = thresholdPaceFromBest(km, s); basis.thresholdPaceRunSec = `aus deiner Bestzeit (${k === 'run10k' ? '10 km' : k === 'runHalf' ? 'Halbmarathon' : k === 'run5k' ? '5 km' : 'Marathon'})`; break; } }
  const sk = p.skills || {};
  const exp = p.experienceYears ?? null;
  if (pace == null) {
    const cont = sk.runContinuousMin ?? null;
    pace = cont != null && cont < 30 ? 450 : exp != null && exp < 1 ? 410 : exp != null && exp >= 3 ? 330 : 370;
    if (age != null && age >= 50) pace += 25;
    if (p.sex === 'f') pace += 20;
    basis.thresholdPaceRunSec = 'grob aus Erfahrung und Alter';
  }
  // Rad
  const bikeLong = sk.bikeLongestMin ?? null;
  let speed = exp != null && exp >= 3 ? 28 : bikeLong != null && bikeLong < 60 ? 22 : 25;
  if (age != null && age >= 50) speed -= 1;
  basis.thresholdSpeedBikeKmh = 'grob aus Erfahrung';
  // Schwimmen: CSS nur, wenn gekrault wird
  let css: number | null = null;
  if (bests.swim400) { css = Math.round(bests.swim400 / 4 + 5); basis.cssSec = 'aus deiner 400-m-Zeit'; }
  else if (sk.swimCrawl === 'yes') { css = exp != null && exp >= 3 ? 125 : 150; basis.cssSec = 'grob aus deinem Können'; }
  else if (sk.swimCrawl === 'some') { css = 170; basis.cssSec = 'grob aus deinem Können'; }
  return { values: { maxHr, lthrRun, lthrBike, thresholdPaceRunSec: pace, thresholdSpeedBikeKmh: speed, ftp: null, cssSec: css }, basis };
}

/* Fehlende Schwellen auffüllen und markieren. Gemessene oder eingetragene Werte bleiben unverändert. */
export function withEstimates(p: Profile, today: string): Profile {
  const th: Thresholds = { ...p.thresholds };
  const est = new Set<ThresholdKey>(th.estimated || []);
  const e = estimateThresholds(p, today).values;
  const fill = (k: ThresholdKey, v: number | null) => {
    const cur = (th as any)[k];
    if (cur == null || cur === 0 || est.has(k)) { (th as any)[k] = v; if (v != null) est.add(k); else est.delete(k); }
  };
  fill('lthrRun', e.lthrRun); fill('lthrBike', e.lthrBike); fill('thresholdPaceRunSec', e.thresholdPaceRunSec); fill('thresholdSpeedBikeKmh', e.thresholdSpeedBikeKmh);
  if (th.cssSec == null || est.has('cssSec')) fill('cssSec', e.cssSec);
  if (!th.maxHr || est.has('maxHr')) fill('maxHr', e.maxHr);
  th.estimated = [...est];
  return { ...p, thresholds: th };
}
export function isEstimated(p: Profile, k: ThresholdKey): boolean { return !!(p.thresholds.estimated || []).includes(k); }
/* Wert von Hand oder aus einem Test gesetzt: nicht mehr geschätzt */
export function setThreshold(p: Profile, k: ThresholdKey, v: number | null): Profile {
  const th: any = { ...p.thresholds, [k]: v };
  th.estimated = (p.thresholds.estimated || []).filter(x => x !== k);
  return { ...p, thresholds: th };
}

/* Aus alten Einstellungen (STATE.settings, nutritionProfile) ein Profil bauen. Werte kommen aus den eigenen Daten, nicht aus dem Code. */
export function profileFromLegacy(state: any, today: string): Profile {
  const p = defaultProfile();
  const s = (state && state.settings) || {};
  const np = (state && state.nutritionProfile) || {};
  if (np.age) p.birthYear = +today.slice(0, 4) - np.age;
  if (np.heightCm) p.heightCm = np.heightCm;
  if (np.weightKg) p.weightKg = np.weightKg;
  if (np.pal) p.pal = np.pal;
  for (const k of ['lthrRun', 'lthrBike', 'thresholdPaceRunSec', 'thresholdSpeedBikeKmh'] as const) if (s[k]) (p.thresholds as any)[k] = s[k];
  // Sportarten aus dem eigenen Plan erkennen
  const seen = new Set<string>();
  ((state && state.planWeeks) || []).forEach((w: any) => (w.days || []).forEach((d: any) => (d.sessions || []).forEach((x: any) => { if (x && x.sport && x.sport !== 'rest') seen.add(x.sport); })));
  if (seen.size) p.sports = (['swim', 'bike', 'run', 'strength', 'football'] as SportKey[]).filter(k => seen.has(k));
  if (seen.has('football')) {
    p.teamSportName = 'Fußball';
    // Termine aus dem bisherigen Plan übernehmen (Training/Spiel je Wochentag), damit sie beim Neuplanen nicht verschwinden
    const tr = new Map<number, number>(), gm = new Map<number, number>();
    ((state && state.planWeeks) || []).forEach((w: any) => (w.days || []).forEach((d: any) => (d.sessions || []).forEach((x: any) => {
      if (!x || x.sport !== 'football') return; const dow = new Date(d.date + 'T12:00:00Z').getUTCDay();
      const m = /spiel|match/i.test(x.title || '') ? gm : tr; m.set(dow, (m.get(dow) || 0) + 1);
    })));
    const often = (m: Map<number, number>) => [...m.entries()].filter(([, n]) => n >= 2).map(([d]) => d).sort();
    if (tr.size || gm.size) p.teamSport = { name: 'Fußball', trainingDays: often(tr), trainingMinutes: 90, gameDays: often(gm), gameMinutes: 90, seasonFrom: null, seasonTo: null };
  }
  return withEstimates(p, today);
}

export function mergeProfile(stored: any, fallback: Profile, today?: string): Profile {
  if (!stored || typeof stored !== 'object') return fallback;
  const d = defaultProfile();
  const p: Profile = { ...d, ...stored };
  p.thresholds = { ...d.thresholds, ...(stored.thresholds || {}) };
  p.availability = stored.availability || {};
  p.dayLoad = stored.dayLoad || {};
  p.freq = stored.freq || {};
  p.skills = stored.skills || {};
  p.bests = stored.bests || {};
  p.bikes = Array.isArray(stored.bikes) ? stored.bikes : [];
  p.notes = Array.isArray(stored.notes) ? stored.notes : (typeof stored.notes === 'string' && stored.notes ? [stored.notes] : []);
  p.fixed = Array.isArray(stored.fixed) ? stored.fixed : [];
  p.rules = Array.isArray(stored.rules) ? stored.rules.filter((r: any) => r && r.kind) : [];
  p.routines = Array.isArray(stored.routines) ? stored.routines : [];
  p.sports = Array.isArray(stored.sports) && stored.sports.length ? stored.sports : fallback.sports;
  return withEstimates(p, today || new Date().toISOString().slice(0, 10));
}

/* Aufbau-Rhythmus: eigener Wunsch (höchstens +10 % pro Woche, 2-4 Aufbauwochen), sonst nach Alter und Vorsicht */
export function progressionOf(p: Profile, today: string, cautious = false): Progression {
  const own = p.progression;
  if (own && own.buildWeeks > 0) return { buildWeeks: Math.max(2, Math.min(4, Math.round(own.buildWeeks))), incPct: Math.max(3, Math.min(10, own.incPct || 10)) };
  return isMinor(p, today) || cautious ? { buildWeeks: 2, incPct: 8 } : { buildWeeks: 3, incPct: 10 };
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
/* Maximalpuls: gemessen, sonst aus dem Alter geschätzt */
export function estMaxHr(p: Profile, today: string): number {
  if (p.thresholds.maxHr) return p.thresholds.maxHr;
  return estimateThresholds(p, today).values.maxHr;
}
/* Puls-Schwellen ohne Profil (z. B. alte Datensätze): allgemeine Formel für ein mittleres Alter, keine Werte einer Person */
export const GENERIC_LTHR = { run: Math.round((208 - 0.7 * 35) * 0.89), bike: Math.round((208 - 0.7 * 35) * 0.86) };
