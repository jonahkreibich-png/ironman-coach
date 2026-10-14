/* Langfristige Planung (Auftrag 9), für alle Nutzer:
   1) Platzhalter-Termine für Ziele ohne Datum: Reihenfolge nach Distanz, Vorbereitung nach Fitness, Saison je Sportart, Abstand zum A-Ziel.
   2) Makrozyklen: auf jedes A- und B-Ziel hin Grundlage → Aufbau → wettkampfspezifisch → Tapering → Wettkampf, danach Erholung,
      dann der nächste Zyklus. C-Ziele sind Trainingswettkämpfe ohne eigenen Zyklus.
   3) Obergrenzen der langen Einheiten je Distanz des nächsten Ziels, Jahreszeit (drinnen/draußen) und Alter. */
import { GOALS, type Goal, type GoalType } from './goals';
import { addDays } from './core';

export type MPhase = 'base' | 'build' | 'specific' | 'taper' | 'race';
export const PHASE_NAME: Record<MPhase, string> = { base: 'Grundlage', build: 'Aufbau', specific: 'Wettkampfspezifisch', taper: 'Tapering', race: 'Wettkampf' };

/* „Größe“ einer Distanz: kleinere Ziele kommen vorher */
export const DIST_RANK: Record<GoalType, number> = { fitness: 0, run_5k: 1, tri_supersprint: 1, swim_goal: 2, aquathlon: 2, run_10k: 2, tri_sprint: 2, duathlon: 3, run_half: 4, tri_olympic: 4, bike_event: 5, tri_middle: 6, run_marathon: 7, tri_long: 8 };
/* Saison-Termine (Monat-Tag): Triathlon und Rad im Sommer, Laufen im Frühjahr und Herbst, Schwimmen im Hochsommer */
const SEASON: Record<string, string[]> = { tri: ['06-13', '08-29'], bike: ['06-13', '08-29'], run: ['04-25', '10-10'], swim: ['07-11'] };
const seasonOf = (t: GoalType) => t === 'bike_event' ? 'bike' : t === 'swim_goal' ? 'swim' : GOALS[t].group === 'run' ? 'run' : 'tri';
const dowOf = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
const weeksBetween = (a: string, b: string) => (+new Date(b + 'T12:00:00Z') - +new Date(a + 'T12:00:00Z')) / 86400000 / 7;
const sundayOnOrAfter = (d: string) => addDays(d, (7 - dowOf(d)) % 7);

export interface Placed extends Goal { placeholder: true }
/* Ziele ohne Datum bekommen Platzhalter-Termine (werden nicht gespeichert, nur im Plan genutzt und als Platzhalter gezeigt).
   fitnessHours: eigenes Training pro Woche zurzeit; wenig Training → längere Vorbereitung. */
export function placeholders(goals: Goal[], A: Goal | null, today: string, fitnessHours: number | null): Placed[] {
  const undated = goals.filter(g => g && !g.date && !g.result && (!A || g.id !== A.id) && GOALS[g.type] && g.type !== 'fitness')
    .sort((a, b) => DIST_RANK[a.type] - DIST_RANK[b.type]);
  const dated = goals.filter(g => g && g.date && !g.result && g.date >= today);
  const out: Placed[] = [];
  const low = fitnessHours == null || fitnessHours < 4;
  for (const g of undated) {
    const def = GOALS[g.type];
    const prep = low ? def.prepWeeks[1] : def.prepWeeks[0];
    // nach dem letzten kleineren oder gleich großen Ziel: Abstand = gut die Hälfte der Vorbereitung dieses Ziels (mindestens 6 Wochen)
    const before = [...dated, ...out].filter(x => DIST_RANK[x.type] <= DIST_RANK[g.type]).map(x => x.date!).sort().pop();
    const gap = Math.max(6, Math.round(def.prepWeeks[0] * (DIST_RANK[g.type] >= 6 ? 1 : 0.6)));
    let earliest = addDays(today, prep * 7);
    if (before && addDays(before, gap * 7) > earliest) earliest = addDays(before, gap * 7);
    // vor dem A-Ziel genug Abstand: mindestens die halbe Vorbereitung des A-Ziels (bei Langdistanz-Zielen ein Großteil davon)
    const latest = A && A.date ? addDays(A.date, -Math.max(8, Math.round(GOALS[A.type].prepWeeks[0] * 0.4)) * 7) : null;
    let date: string | null = null;
    for (let y = +earliest.slice(0, 4); y <= +earliest.slice(0, 4) + 6 && !date; y++) {
      for (const md of SEASON[seasonOf(g.type)]) { const c = sundayOnOrAfter(`${y}-${md}`); if (c >= earliest) { date = c; break; } }
    }
    if (!date || (latest && date > latest)) {
      if (!latest) continue;
      // keine Saison mehr frei: mittig zwischen dem letzten Ziel und dem spätesten Termin
      const from = before && before > today ? before : today;
      date = sundayOnOrAfter(addDays(from, Math.max(gap * 7, Math.round(weeksBetween(from, latest) * 7 / 2))));
      if (date < earliest) date = sundayOnOrAfter(earliest);
      // passt nicht mehr vor das A-Ziel: bleibt ohne Termin (nicht eingeplant)
      if (date > latest || date <= today) continue;
    }
    out.push({ ...g, date, placeholder: true });
  }
  return out;
}

/* Lockere Tage nach einem Wettkampf je Distanz */
export function easyAfterDays(t: GoalType): number {
  return ({ tri_supersprint: 3, tri_sprint: 3, aquathlon: 3, run_5k: 3, swim_goal: 2, tri_olympic: 5, duathlon: 5, run_10k: 4, run_half: 5, bike_event: 5, tri_middle: 10, run_marathon: 14, tri_long: 14, fitness: 2 } as Record<GoalType, number>)[t] ?? 3;
}
/* Wochen je Phase vor einem Ziel (ideal); bei wenig Zeit wird anteilig gekürzt */
const SPEC_W: Partial<Record<GoalType, number>> = { run_5k: 3, run_10k: 4, run_half: 6, run_marathon: 8, tri_supersprint: 3, tri_sprint: 4, tri_olympic: 6, tri_middle: 8, tri_long: 10, duathlon: 4, aquathlon: 3, bike_event: 6, swim_goal: 3, fitness: 0 };
const BUILD_W: Partial<Record<GoalType, number>> = { run_5k: 4, run_10k: 5, run_half: 6, run_marathon: 8, tri_supersprint: 4, tri_sprint: 5, tri_olympic: 6, tri_middle: 8, tri_long: 10, duathlon: 5, aquathlon: 4, bike_event: 6, swim_goal: 4, fitness: 0 };
const longTaper = (t: GoalType) => /marathon|middle|long|bike_event/.test(t);

export interface WeekPhase { phase: MPhase; recovery: boolean; goalId: string; goalType: GoalType; goalName: string; priority?: 'A' | 'B' | 'C'; afterRace?: boolean }
export interface Anchor { id: string; type: GoalType; name: string; date: string; priority: 'A' | 'B' | 'C'; placeholder?: boolean }
/* Phasen je Woche bis zum A-Ziel. anchors: A- und B-Ziele mit Datum (auch Platzhalter). Erholungswochen alle recoveryEvery Wochen,
   nach einem B-Wettkampf eine Erholungswoche, danach beginnt der nächste Zyklus. */
export function macroPhases(start: string, nTotal: number, anchors: Anchor[], recoveryEvery: number, builtSinceRecovery = 0): WeekPhase[] {
  const out: WeekPhase[] = [];
  // C-Ziele bekommen einen eigenen (kurzen) Zyklus nur mit genug Abstand (10 Wochen danach, 8 Wochen davor), sonst sind sie Training im Zyklus
  const all = anchors.filter(a => a.date >= start).sort((a, b) => a.date.localeCompare(b.date));
  const list: Anchor[] = [];
  for (const a of all) {
    if (a.priority !== 'C') { list.push(a); continue; }
    const prev = list.length ? list[list.length - 1].date : start;
    const next = all.find(x => x.priority !== 'C' && x.date > a.date);
    if (weeksBetween(prev, a.date) >= 10 && (!next || weeksBetween(a.date, next.date) >= 8)) list.push(a);
  }
  const weekOf = (d: string) => Math.floor((+new Date(d + 'T12:00:00Z') - +new Date(start + 'T12:00:00Z')) / 86400000 / 7);
  let s = 0, since = Math.max(0, Math.min(recoveryEvery - 1, builtSinceRecovery));
  for (const a of list) {
    const e = Math.min(nTotal - 1, weekOf(a.date));
    if (e < s) continue;
    const len = e - s + 1;
    const race = 1, taper = a.priority === 'C' ? 0 : Math.min(Math.max(0, len - 2), a.priority === 'A' && longTaper(a.type) ? 2 : 1);
    const avail = Math.max(0, len - race - taper);
    let spec = SPEC_W[a.type] || 0, build = BUILD_W[a.type] || 0, base: number;
    if (avail < spec + build) { spec = Math.round(avail * 0.4); build = avail - spec; base = 0; } else base = avail - spec - build;
    // keine endlose Grundlage: höchstens 18 Wochen am Stück, der Rest wird Aufbau (bis 10 Wochen mehr)
    if (base > 18) { const x = Math.min(base - 18, 10); build += x; base -= x; }
    // sehr lange Grundlage (kein Zwischenziel): in Zwischenzyklen aus 10 Wochen Grundlage und 6 Wochen Aufbau teilen, die letzte Grundlage bleibt
    const pre: MPhase[] = [];
    while (base > 28) { pre.push(...Array(10).fill('base'), ...Array(6).fill('build')); base -= 16; }
    const seq: MPhase[] = [...pre, ...Array(base).fill('base'), ...Array(build).fill('build'), ...Array(spec).fill('specific'), ...Array(taper).fill('taper'), 'race'];
    seq.forEach((p, k) => {
      if (s + k >= nTotal) return;
      since++;
      // Erholung im Rhythmus, nicht direkt vor dem Tapering
      const recovery = (p === 'base' || p === 'build' || p === 'specific') && since >= recoveryEvery && k < seq.length - race - taper - 1;
      if (recovery) since = 0;
      out.push({ phase: p, recovery, goalId: a.id, goalType: a.type, goalName: a.name, priority: a.priority });
    });
    s = e + 1;
    // nach einem B-Wettkampf: 1 Woche Erholung, dann der nächste Zyklus
    // nach dem Wettkampf locker: B mindestens 1 Woche, nach Mittel-/Langdistanz und Marathon 1-2 Wochen (auch nach C)
    const recW = a.priority === 'A' ? 0 : Math.max(a.priority === 'B' ? 1 : 0, Math.round(easyAfterDays(a.type) / 7));
    for (let k = 0; k < recW && s < nTotal; k++) { const nx = list.find(x => x.date > a.date) || a; out.push({ phase: 'base', recovery: true, goalId: nx.id, goalType: nx.type, goalName: nx.name, priority: nx.priority, afterRace: true }); s++; since = 0; }
  }
  // nach dem letzten Ziel (falls die Wochen weiterlaufen): Grundlage
  const last = list[list.length - 1];
  while (out.length < nTotal) { since++; const rec = since >= recoveryEvery; if (rec) since = 0; out.push({ phase: 'base', recovery: rec, goalId: last ? last.id : 'none', goalType: last ? last.type : 'fitness', goalName: last ? last.name : '' }); }
  return out.slice(0, nTotal);
}

/* Zeitleiste für die Anzeige: Phasen als Abschnitte, Ziele als Marken */
export interface Timeline { segments: { phase: MPhase; from: string; to: string; goalId: string }[]; goals: { id: string; name: string; date: string; priority: string; placeholder?: boolean }[]; from: string; to: string }
export function timelineOf(start: string, phases: WeekPhase[], anchors: Anchor[], others: Anchor[]): Timeline {
  const segs: Timeline['segments'] = [];
  phases.forEach((p, i) => {
    const mon = addDays(start, i * 7), sun = addDays(mon, 6);
    const last = segs[segs.length - 1];
    if (last && last.phase === p.phase && last.goalId === p.goalId) last.to = sun; else segs.push({ phase: p.phase, from: mon, to: sun, goalId: p.goalId });
  });
  const goals = [...anchors, ...others].filter(a => a.date >= start).sort((a, b) => a.date.localeCompare(b.date)).map(a => ({ id: a.id, name: a.name, date: a.date, priority: a.priority, ...(a.placeholder ? { placeholder: true } : {}) }));
  return { segments: segs, goals, from: start, to: segs.length ? segs[segs.length - 1].to : start };
}

/* ---------- Obergrenzen der langen Einheiten ---------- */
const RUN_CAP: Record<GoalType, number> = { run_5k: 75, run_10k: 90, run_half: 120, run_marathon: 180, tri_supersprint: 60, tri_sprint: 90, tri_olympic: 100, tri_middle: 120, tri_long: 165, duathlon: 90, aquathlon: 75, bike_event: 75, swim_goal: 60, fitness: 80 };
const BIKE_CAP: Record<GoalType, number> = { run_5k: 90, run_10k: 90, run_half: 120, run_marathon: 120, tri_supersprint: 90, tri_sprint: 150, tri_olympic: 180, tri_middle: 240, tri_long: 300, duathlon: 150, aquathlon: 60, bike_event: 300, swim_goal: 90, fitness: 150 };
const SWIM_CAP: Partial<Record<GoalType, number>> = { tri_olympic: 65, tri_middle: 75, tri_long: 90, swim_goal: 75, aquathlon: 60 };
export interface Caps { run: number; bike: number; swim: number; why: string[] }
/* goal: Ziel des aktuellen Zyklus. age: Alter an dem Tag. indoor: lange Ausfahrt drinnen (Rolle). runEasySecKm: lockeres Lauftempo.
   swimLearning: Kraul wird noch gelernt (dann kürzere Schwimmeinheiten). bikeKm: Rad-Event-Strecke. */
/* Zwischenziel auf dem Weg zu einem größeren A-Ziel: die langen Einheiten dürfen bis zur „mittleren“ Distanz der Sportart wachsen
   (Triathlon: Olympisch, Laufen: Halbmarathon), nie über die Grenzen des A-Ziels */
const LIFT: Record<string, GoalType> = { tri: 'tri_olympic', run: 'run_half', other: 'tri_olympic' };
export function capsFor(goal: GoalType, date: string, o: { age?: number | null; indoor?: boolean; runEasySecKm?: number | null; swimLearning?: boolean; bikeKm?: number | null; aGoal?: GoalType | null; phase?: MPhase } = {}): Caps {
  const why: string[] = [];
  let run = RUN_CAP[goal] ?? 80, bike = BIKE_CAP[goal] ?? 150;
  if (o.aGoal && DIST_RANK[o.aGoal] > DIST_RANK[goal]) {
    const lift = LIFT[GOALS[o.aGoal].group] || 'tri_olympic';
    run = Math.max(run, Math.min(RUN_CAP[o.aGoal], RUN_CAP[lift])); bike = Math.max(bike, Math.min(BIKE_CAP[o.aGoal], BIKE_CAP[lift]));
  }
  if (goal === 'bike_event' && o.bikeKm) bike = Math.max(150, Math.min(330, Math.round(o.bikeKm / 27 * 60 * 0.9 / 15) * 15));
  // nie die volle Marathondistanz im Training: höchstens etwa 32 km
  if (o.runEasySecKm) { const m = Math.round(32000 / 1000 * o.runEasySecKm / 60 / 5) * 5; if (m < run) { run = m; why.push('höchstens etwa 32 km'); } }
  const month = +date.slice(5, 7);
  if ([11, 12, 1, 2].includes(month)) { const w = o.indoor ? 120 : 150; if (bike > w) { bike = w; why.push(o.indoor ? 'Winter drinnen: höchstens 2 h' : 'Winter: höchstens 2:30 h'); } }
  else if (o.indoor && bike > 150) { bike = 150; why.push('drinnen höchstens 2:30 h'); }
  if (o.age != null && o.age < 18) { if (run > 120) { run = 120; why.push('unter 18: langer Lauf höchstens 2 h'); } if (bike > 240) { bike = 240; why.push('unter 18: Rad höchstens 4 h'); } }
  // Schwimmen wächst mit der Phase: Grundlage 70 %, Aufbau 85 %, spezifisch 100 % der Obergrenze (mindestens 45 min)
  const pf = o.phase ? ({ base: 0.7, build: 0.85, specific: 1, taper: 0.7, race: 0.5 } as Record<MPhase, number>)[o.phase] : 1;
  const swim = o.swimLearning ? 55 : Math.max(45, Math.round((SWIM_CAP[goal] ?? 60) * pf / 5) * 5);
  return { run, bike, swim, why };
}
