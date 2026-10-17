/* Sportarten als Module: Zonen, Belastung, Vorlagen für Einheiten, Kennzahlen und Anforderungen je Ziel. */
import type { SportKey, Profile } from './profile';
import type { Goal, GoalType } from './goals';
import { GOALS, legsOf } from './goals';

/* Auftrag 15 (feste Regel für alle): Der Plan enthält nur Sportarten, die die Person gewählt hat; Teamsport nur, wenn angegeben.
   Gilt für Generator, Tests, Koppel, Ersatz-Einheiten, Coach-Vorschläge und den Plan-Check. */
export function chosenSports(p: Profile): SportKey[] {
  const out = (p.sports || []).filter(s => s === 'swim' || s === 'bike' || s === 'run' || s === 'strength');
  const f = (p.freq || {}).strength;
  if (!out.includes('strength') && f && f[0] > 0) out.push('strength');
  return [...new Set(out)];
}
export function sportAllowed(p: Profile, sport: string): boolean {
  if (!sport || sport === 'rest') return true;
  // eigene feste Termine (z. B. „Lauftreff Di“) hat die Person selbst angegeben
  if ((p.fixed || []).some(f => f && f.sport === sport)) return true;
  if (sport === 'football') return !!p.teamSport;
  const c = chosenSports(p);
  return !c.length || c.includes(sport as SportKey);
}

export interface ZoneDef { zone: number; label: string; low: number; high: number }
/* Prozent vom Schwellenpuls (LTHR). Für Pace und Speed gilt dieselbe Prozent-Tabelle relativ zur Schwelle. */
export const HR_ZONES: ZoneDef[] = [
  { zone: 1, label: 'Erholung', low: 0, high: 81 }, { zone: 2, label: 'Grundlage', low: 81, high: 89 },
  { zone: 3, label: 'Tempo', low: 90, high: 93 }, { zone: 4, label: 'Schwelle', low: 94, high: 102 }, { zone: 5, label: 'VO2max', low: 102, high: 999 }
];
/* Leistungszonen Rad nach FTP (Coggan) */
export const POWER_ZONES: ZoneDef[] = [
  { zone: 1, label: 'Erholung', low: 0, high: 55 }, { zone: 2, label: 'Grundlage', low: 56, high: 75 },
  { zone: 3, label: 'Tempo', low: 76, high: 90 }, { zone: 4, label: 'Schwelle', low: 91, high: 105 }, { zone: 5, label: 'VO2max', low: 106, high: 999 }
];
/* Schwimmzonen relativ zur CSS (Sekunden pro 100 m: + = langsamer) */
export const SWIM_ZONES = [
  { zone: 1, label: 'Erholung', plus: [10, 99] }, { zone: 2, label: 'Grundlage', plus: [5, 10] },
  { zone: 3, label: 'Tempo', plus: [2, 5] }, { zone: 4, label: 'Schwelle (CSS)', plus: [-2, 2] }, { zone: 5, label: 'schnell', plus: [-99, -2] }
];

export function hrZonesFor(lthr: number, table: ZoneDef[] = HR_ZONES) {
  return table.map(z => ({ zone: z.zone, label: z.label, lo: Math.round(lthr * z.low / 100), hi: z.high >= 999 ? null : Math.round(lthr * z.high / 100) }));
}
export function powerZonesFor(ftp: number) { return POWER_ZONES.map(z => ({ zone: z.zone, label: z.label, lo: Math.round(ftp * z.low / 100), hi: z.high >= 999 ? null : Math.round(ftp * z.high / 100) })); }
export function swimZonesFor(css: number) { return SWIM_ZONES.map(z => ({ zone: z.zone, label: z.label, fast: Math.max(30, css + z.plus[0]), slow: css + z.plus[1] })); }

export interface SportModule {
  key: SportKey;
  endurance: boolean;
  /** Belastungsfaktor (IF) je Zone für die geplante Belastung */
  ifByZone: Record<number, number>;
  /** typische Kennzahlen für die App */
  metrics: string[];
}
export const SPORTS: Record<SportKey, SportModule> = {
  swim: { key: 'swim', endurance: true, ifByZone: { 1: 0.6, 2: 0.72, 3: 0.82, 4: 0.92, 5: 1 }, metrics: ['meters', 'min', 'pace100', 'spl', 'dps', 'rate'] },
  bike: { key: 'bike', endurance: true, ifByZone: { 1: 0.55, 2: 0.68, 3: 0.8, 4: 0.92, 5: 1.02 }, metrics: ['km', 'min', 'hr', 'speed', 'power'] },
  run: { key: 'run', endurance: true, ifByZone: { 1: 0.62, 2: 0.72, 3: 0.84, 4: 0.94, 5: 1.03 }, metrics: ['km', 'min', 'hr', 'pace'] },
  strength: { key: 'strength', endurance: false, ifByZone: { 1: 0.5, 2: 0.55, 3: 0.6, 4: 0.65, 5: 0.7 }, metrics: ['min', 'weight', 'reps'] },
  football: { key: 'football', endurance: false, ifByZone: { 1: 0.6, 2: 0.7, 3: 0.8, 4: 0.88, 5: 0.95 }, metrics: ['min', 'hr'] }
};

/* ---------- Anforderungen je Ziel (für Scores und Plan) ---------- */
export interface Requirement {
  /** Schwelle, die für das Ziel in der geplanten Zeit nötig ist */
  runThresholdSecKm?: number; bikeThresholdKmh?: number; bikeFtpWkg?: number; swimCss100?: number;
  /** längste Einheit, die vor dem Wettkampf sitzen sollte (Minuten bzw. Meter) */
  longRunMin?: number; longRideMin?: number; longSwimM?: number;
  /** Fitness (CTL) je Sport und gesamt */
  ctl: number; ctlBySport: Partial<Record<SportKey, number>>;
  /** Bezug in Worten für „Warum?“ */
  basis: string;
}
/* Ankommen-Niveau je Distanz: sicher ankommen, deutlich unter dem Zielschluss (Auftrag 12: vorher zu streng, z. B. 27 km/h im Ironman).
   Renntempo in s/km (Laufen), km/h (Rad, Rennrad flach) und s/100 m (Schwimmen) */
const FINISH: Record<GoalType, { run?: number; bike?: number; swim?: number }> = {
  run_5k: { run: 400 }, run_10k: { run: 410 }, run_half: { run: 420 }, run_marathon: { run: 440 },
  tri_supersprint: { run: 400, bike: 23, swim: 150 }, tri_sprint: { run: 400, bike: 24, swim: 150 }, tri_olympic: { run: 405, bike: 24, swim: 145 },
  tri_middle: { run: 420, bike: 24, swim: 145 }, tri_long: { run: 435, bike: 23, swim: 145 },
  duathlon: { run: 400, bike: 25 }, aquathlon: { run: 400, swim: 145 }, bike_event: { bike: 24 }, swim_goal: { swim: 150 }, fitness: { run: 420, bike: 25, swim: 150 }
};
/* Schwellen-Geschwindigkeit Rennrad (km/h) → FTP in W/kg (passend zur Score-Skala) */
export function wkgFromKmh(kmh: number): number {
  const pts: [number, number][] = [[18, 0.5], [22, 1.0], [28, 2.0], [32, 3.0], [35.5, 3.8], [37.5, 4.5], [40.5, 5.8]];
  if (kmh <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (kmh <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (kmh - x0) / (x1 - x0) * (y1 - y0); }
  return pts[pts.length - 1][1];
}
/* Wie weit die Wettkampf-Pace von der Schwelle weg ist (Wettkampf-Pace = Schwelle × Faktor) */
const RACE_FACTOR_RUN: Partial<Record<GoalType, number>> = { run_5k: 0.96, run_10k: 1.0, run_half: 1.05, run_marathon: 1.12, tri_supersprint: 1.0, tri_sprint: 1.02, tri_olympic: 1.06, tri_middle: 1.13, tri_long: 1.22, duathlon: 1.02, aquathlon: 1.0, fitness: 1.15 };
/* Rad: Renntempo = Schwellen-Tempo × Faktor. Leistung im Rennen (Anteil FTP) → Tempo mit der dritten Wurzel
   (Sprint 92 %, Olympisch 88 %, Mittel 80 %, Lang 72 %) */
const RACE_FACTOR_BIKE: Partial<Record<GoalType, number>> = { tri_supersprint: 0.98, tri_sprint: 0.97, tri_olympic: 0.958, tri_middle: 0.928, tri_long: 0.896, duathlon: 0.965, bike_event: 0.908, fitness: 0.89 };
const LONG: Record<GoalType, { run?: number; ride?: number; swim?: number; ctl: number }> = {
  run_5k: { run: 50, ctl: 30 }, run_10k: { run: 70, ctl: 38 }, run_half: { run: 110, ctl: 48 }, run_marathon: { run: 160, ctl: 60 },
  tri_supersprint: { run: 30, ride: 50, swim: 500, ctl: 30 }, tri_sprint: { run: 45, ride: 75, swim: 900, ctl: 38 }, tri_olympic: { run: 75, ride: 120, swim: 1800, ctl: 55 },
  tri_middle: { run: 110, ride: 210, swim: 2500, ctl: 75 }, tri_long: { run: 160, ride: 330, swim: 4000, ctl: 95 },
  duathlon: { run: 60, ride: 90, ctl: 42 }, aquathlon: { run: 45, swim: 1200, ctl: 32 }, bike_event: { ride: 240, ctl: 55 }, swim_goal: { swim: 2000, ctl: 25 }, fitness: { run: 50, ride: 90, swim: 1000, ctl: 30 }
};
export function requirementFor(goal: Goal | null, profile: Profile): Requirement {
  const type: GoalType = (goal && goal.type) || 'fitness';
  const def = GOALS[type];
  const F = FINISH[type] || FINISH.fitness;
  const L = LONG[type] || LONG.fitness;
  const req: Requirement = { ctl: L.ctl, ctlBySport: {}, basis: goal ? (goal.targetTimeSec ? 'deine Zielzeit' : 'Ankommen gut unter dem Zielschluss') : 'allgemeine Fitness' };
  const legs = goal ? legsOf(goal) : def.legs;
  // Auftrag 15: nur gewählte Sportarten (Fitness ohne Laufen hat keine Lauf-Anforderung)
  const has = (s: SportKey) => (legs.some(l => l.sport === s) || type === 'fitness') && sportAllowed(profile, s);
  // Mit Zielzeit: Tempo je Disziplin aus der Zielzeit aufteilen (grob nach typischen Anteilen)
  let runPace = F.run, bikeKmh = F.bike, swim100 = F.swim;
  if (goal && goal.targetTimeSec && legs.length) {
    const share: Record<string, number> = def.group === 'tri' ? { swim: 0.12, bike: 0.52, run: 0.33 } : { [legs[0].sport]: 1 };
    const trans = def.group === 'tri' ? goal.targetTimeSec * 0.03 : 0;
    const total = goal.targetTimeSec - trans;
    const sum = legs.reduce((a, l) => a + (share[l.sport] || 0), 0) || 1;
    for (const l of legs) {
      const sec = total * (share[l.sport] || 0) / sum * (legs.filter(x => x.sport === l.sport).length > 1 ? l.km / legs.filter(x => x.sport === l.sport).reduce((a, x) => a + x.km, 0) : 1);
      if (l.sport === 'run') runPace = sec / l.km;
      if (l.sport === 'bike') bikeKmh = l.km / (sec / 3600);
      if (l.sport === 'swim') swim100 = sec / (l.km * 10);
    }
  }
  // Wunschzeit je Disziplin (Triathlon) geht vor der Aufteilung der Gesamtzeit
  if (goal && goal.splits) {
    const km = (s: SportKey) => legs.filter(l => l.sport === s).reduce((a, l) => a + l.km, 0);
    const sp = goal.splits;
    if (sp.run && km('run')) runPace = sp.run / km('run');
    if (sp.bike && km('bike')) bikeKmh = km('bike') / (sp.bike / 3600);
    if (sp.swim && km('swim')) swim100 = sp.swim / (km('swim') * 10);
    if (Object.values(sp).some(Boolean)) req.basis = 'deine Wunschzeit';
  }
  if (has('run') && runPace) { req.runThresholdSecKm = Math.round(runPace / (RACE_FACTOR_RUN[type] || 1.1)); req.longRunMin = L.run; }
  if (has('bike') && bikeKmh) { req.bikeThresholdKmh = Math.round(bikeKmh / (RACE_FACTOR_BIKE[type] || 0.85) * 10) / 10; req.longRideMin = L.ride; req.bikeFtpWkg = Math.round(wkgFromKmh(req.bikeThresholdKmh) * 10) / 10; }
  if (has('swim') && swim100) { req.swimCss100 = Math.round(swim100 - 5); req.longSwimM = L.swim; }
  const n = ['swim', 'bike', 'run'].filter(s => has(s as SportKey)).length || 1;
  (['swim', 'bike', 'run'] as SportKey[]).forEach(s => { if (has(s)) req.ctlBySport[s] = Math.round(L.ctl * (s === 'bike' ? 0.45 : s === 'run' ? 0.35 : 0.2) * (n === 1 ? 1 / (s === 'bike' ? 0.45 : s === 'run' ? 0.35 : 0.2) : 1)); });
  void profile;
  return req;
}
