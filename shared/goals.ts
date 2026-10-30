/* Ziele: Art, Datum, Priorität. Mehrere Ziele gleichzeitig möglich (Datensätze kind "goal"). */
import type { SportKey } from './profile';

export type GoalType =
  | 'run_5k' | 'run_10k' | 'run_half' | 'run_marathon'
  | 'tri_supersprint' | 'tri_sprint' | 'tri_olympic' | 'tri_middle' | 'tri_long' | 'duathlon' | 'aquathlon'
  | 'bike_event' | 'swim_goal' | 'fitness';
export type Priority = 'A' | 'B' | 'C';

export interface Leg { sport: SportKey; km: number }
export interface GoalDef {
  type: GoalType; group: 'run' | 'tri' | 'other';
  legs: Leg[];
  /** grobe Spanne der Wettkampfdauer in Stunden (schnell … Ankommen), für Umfang und Verpflegung */
  hours: [number, number];
  /** sinnvolle Vorbereitung in Wochen (mind., ideal) */
  prepWeeks: [number, number];
  /** Mindestalter für die Distanz (Verbandsregeln grob) */
  minAge?: number;
}

export const GOALS: Record<GoalType, GoalDef> = {
  run_5k: { type: 'run_5k', group: 'run', legs: [{ sport: 'run', km: 5 }], hours: [0.25, 0.6], prepWeeks: [6, 10] },
  run_10k: { type: 'run_10k', group: 'run', legs: [{ sport: 'run', km: 10 }], hours: [0.55, 1.3], prepWeeks: [8, 12] },
  run_half: { type: 'run_half', group: 'run', legs: [{ sport: 'run', km: 21.1 }], hours: [1.3, 3], prepWeeks: [10, 16], minAge: 16 },
  run_marathon: { type: 'run_marathon', group: 'run', legs: [{ sport: 'run', km: 42.2 }], hours: [3, 6], prepWeeks: [16, 20], minAge: 18 },
  tri_supersprint: { type: 'tri_supersprint', group: 'tri', legs: [{ sport: 'swim', km: 0.4 }, { sport: 'bike', km: 10 }, { sport: 'run', km: 2.5 }], hours: [0.5, 1], prepWeeks: [6, 10] },
  tri_sprint: { type: 'tri_sprint', group: 'tri', legs: [{ sport: 'swim', km: 0.75 }, { sport: 'bike', km: 20 }, { sport: 'run', km: 5 }], hours: [1, 1.8], prepWeeks: [8, 12] },
  tri_olympic: { type: 'tri_olympic', group: 'tri', legs: [{ sport: 'swim', km: 1.5 }, { sport: 'bike', km: 40 }, { sport: 'run', km: 10 }], hours: [2, 3.5], prepWeeks: [12, 16], minAge: 16 },
  tri_middle: { type: 'tri_middle', group: 'tri', legs: [{ sport: 'swim', km: 1.9 }, { sport: 'bike', km: 90 }, { sport: 'run', km: 21.1 }], hours: [4.5, 8], prepWeeks: [16, 24], minAge: 18 },
  tri_long: { type: 'tri_long', group: 'tri', legs: [{ sport: 'swim', km: 3.8 }, { sport: 'bike', km: 180 }, { sport: 'run', km: 42.2 }], hours: [9, 16], prepWeeks: [24, 40], minAge: 18 },
  duathlon: { type: 'duathlon', group: 'tri', legs: [{ sport: 'run', km: 5 }, { sport: 'bike', km: 20 }, { sport: 'run', km: 2.5 }], hours: [1, 2], prepWeeks: [8, 12] },
  aquathlon: { type: 'aquathlon', group: 'tri', legs: [{ sport: 'swim', km: 1 }, { sport: 'run', km: 5 }], hours: [0.5, 1.2], prepWeeks: [6, 10] },
  bike_event: { type: 'bike_event', group: 'other', legs: [{ sport: 'bike', km: 100 }], hours: [3, 6], prepWeeks: [10, 16] },
  swim_goal: { type: 'swim_goal', group: 'other', legs: [{ sport: 'swim', km: 1.5 }], hours: [0.4, 1], prepWeeks: [6, 12] },
  fitness: { type: 'fitness', group: 'other', legs: [], hours: [0, 0], prepWeeks: [4, 12] }
};

export interface Course { bikeAscentM?: number | null; runAscentM?: number | null; swimVenue?: 'open' | 'pool' | null; wetsuit?: boolean | null; tempC?: number | null }
export interface Goal {
  id: string;
  type: GoalType;
  name: string;
  date: string | null;
  priority: Priority;
  /** gewünschtes Ergebnis */
  outcome?: 'finish' | 'time' | 'place';
  targetTimeSec?: number | null;
  /** Auftrag 23: Plan auf die Wunschzeit ausgerichtet (nur nach Vorschau und Bestätigen): Schwerpunkte nach dem Rückstand zur Wunschzeit */
  alignWish?: boolean;
  /** Triathlon: Wunschzeit je Disziplin (Sekunden) statt gesamt */
  splits?: Partial<Record<'swim' | 'bike' | 'run', number>> | null;
  /** eigene Strecken (z. B. Rad-Event mit 150 km) */
  legs?: Leg[];
  why?: string;
  /** Strecke (Auftrag 12, optional): Höhenmeter Rad/Lauf, Freiwasser oder Becken, Neopren, erwartete Temperatur (°C) */
  course?: Course | null;
  /** Ergebnis; predicted = Prognose am Renntag (für den persönlichen Korrekturfaktor) */
  result?: { timeSec?: number | null; place?: string; note?: string; splits?: Record<string, number>; predicted?: Record<string, number> | null } | null;
  createdAt?: number;
}

export function legsOf(g: Goal): Leg[] { return g.legs && g.legs.length ? g.legs : (GOALS[g.type] || GOALS.fitness).legs; }
export function goalSports(g: Goal): SportKey[] { return [...new Set(legsOf(g).map(l => l.sport))]; }
/* Auftrag 24: Sportarten, die ein Ziel braucht, der Nutzer aber nicht gewählt hat. Ohne gewählte Sportarten (alte Profile): keine Aussage.
   Für solche Ziele gibt es keine Prognose, nur einen Hinweis (die Plan-Erstellung plant sie ohnehin nicht ein). */
export function missingSports(g: Goal | null | undefined, sports: readonly string[] | null | undefined): SportKey[] {
  if (!g || !sports || !sports.length) return [];
  return goalSports(g).filter(s => !sports.includes(s));
}
const SPORT_NAME: Record<string, string> = { swim: 'Schwimmen', bike: 'Radfahren', run: 'Laufen' };
export function mismatchText(missing: readonly string[]): string {
  const names = missing.map(s => SPORT_NAME[s] || s);
  const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' und ' + names[names.length - 1] : names[0];
  return `Dein Ziel enthält ${list}, das trainierst du bisher nicht – Ziel ändern oder ${list} hinzufügen?`;
}

/* Hauptziel: das nächste A-Ziel in der Zukunft, sonst das nächste Ziel überhaupt */
export function mainGoal(goals: Goal[], today: string): Goal | null {
  const future = (goals || []).filter(g => g && (!g.date || g.date >= today) && !g.result);
  const byDate = (a: Goal, b: Goal) => String(a.date || '9999').localeCompare(String(b.date || '9999'));
  return future.filter(g => g.priority === 'A').sort(byDate)[0] || future.sort(byDate)[0] || null;
}
export function nextGoal(goals: Goal[], today: string): Goal | null {
  return (goals || []).filter(g => g && g.date && g.date >= today && !g.result).sort((a, b) => String(a.date).localeCompare(String(b.date)))[0] || null;
}

/* Alte Pläne kannten nur meta.event und meta.eventDate. Daraus wird ein Hauptziel. */
export function goalFromPlanMeta(meta: any): Goal | null {
  if (!meta || !meta.eventDate) return null;
  const ev = String(meta.event || '');
  const t: GoalType = /mittel|70\.3|half/i.test(ev) ? 'tri_middle' : /olymp/i.test(ev) ? 'tri_olympic' : /sprint/i.test(ev) ? 'tri_sprint'
    : /marathon/i.test(ev) && /halb/i.test(ev) ? 'run_half' : /marathon/i.test(ev) ? 'run_marathon' : /tri|lang|140|226|full/i.test(ev) ? 'tri_long' : 'fitness';
  return { id: 'goal-main', type: t, name: ev || 'Hauptziel', date: meta.eventDate, priority: 'A', outcome: 'finish' };
}

/* Auftrag 23: Felder eines Ziels, die den Plan nicht ändern. Die Wunschzeit (gesamt oder je Disziplin) zeigt nur, wie realistisch sie
   ist; den Plan richtet erst „Plan auf Wunschzeit ausrichten“ aus (alignWish). Strecke und „Warum“ wirken nur auf Prognose und Coach. */
export const PLAN_NEUTRAL_GOAL_KEYS = ['targetTimeSec', 'splits', 'outcome', 'why', 'course', 'createdAt'] as const;
export function planRelevantGoal(g: Goal | null | undefined): any {
  if (!g) return null;
  const o: any = { ...g };
  for (const k of PLAN_NEUTRAL_GOAL_KEYS) delete o[k];
  // ausgerichtet: dann zählt die Wunschzeit doch (Schwerpunkte nach Rückstand zur Wunschzeit)
  if (g.alignWish) { o.targetTimeSec = g.targetTimeSec ?? null; o.splits = g.splits ?? null; }
  return o;
}
/* Ändert sich der Plan durch diese Ziel-Änderungen? (nur Wunschzeit o. Ä. geändert → nein) */
export function goalsChangePlan(before: Record<string, Goal> | Goal[], after: Record<string, Goal> | Goal[]): boolean {
  const map = (x: any) => { const m: Record<string, any> = {}; (Array.isArray(x) ? x : Object.values(x || {})).forEach((g: any) => { if (g && g.id) m[g.id] = planRelevantGoal(g); }); return m; };
  const a = map(before), b = map(after);
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) if (JSON.stringify(a[id] ?? null) !== JSON.stringify(b[id] ?? null)) return true;
  return false;
}
