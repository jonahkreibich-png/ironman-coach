/* Auftrag 18, Punkt 2 und 5: Trainingswissen als feste Regeln für jeden Plan (Prüfen und Korrigieren).
   Der Generator ruft repairTrainingRules auf, bevor die Person einen neuen oder geänderten Plan sieht; checkTrainingRules prüft jeden
   Plan (Plan-Check, großer Test). Die Regeln mit Quelle und Begründung stehen in docs/TRAININGSREGELN.md (aus shared/trainingknowledge.ts).
   Feste Termine (Teamsport, Spiel, Wettkampf), Erledigtes, Lernstufen und Tage vor „from“ werden nie verändert. */
import type { Profile } from './profile';
import { ageOf } from './profile';
import type { Goal, GoalType } from './goals';
import { GOALS } from './goals';
import * as W from './workouts';
import * as K from './keysessions';
import { isHardSession, isGameOrRace, levelOf, ownHardBudget, easyOf, hardMinutes } from './intensity';
import { capsFor, easyAfterDays } from './periodize';

export type TRuleId = 'restDay' | 'teenHours' | 'bigDayNext' | 'maxSports' | 'hardCount' | 'hardAdjacent' | 'hardBeforeEvent' | 'goalQuality' | 'afterRace' | 'raceWeek'
  | 'longCap' | 'longStep' | 'legsStrength' | 'strengthGameDay' | 'recoveryIntervals' | 'testLoad' | 'warmup' | 'raceSim';
export const TRULE_LABEL: Record<TRuleId, string> = {
  restDay: 'Ruhetage (mind. 1, unter 18/Einsteiger 2)', teenHours: 'Jugendliche: Wochenstunden ≤ Alter', bigDayNext: 'Nach langem Tag kein langer/harter Lauf',
  maxSports: 'Höchstens 2 Sportarten pro Tag', hardCount: 'Harte Einheiten pro Woche', hardAdjacent: 'Keine harten Tage hintereinander', hardBeforeEvent: 'Nichts Hartes vor Spiel/Wettkampf',
  goalQuality: 'Lauf-Qualität vor dem Laufziel', afterRace: 'Locker nach dem Wettkampf', raceWeek: 'Wettkampfwoche (keine Kraft, nichts Hartes)', longCap: 'Lange Einheit passend zum Ziel',
  longStep: 'Lange Einheit höchstens +10 min/Woche', legsStrength: 'Kraft Beine nicht vor/an Spiel, Wettkampf, langem Lauf', strengthGameDay: 'Kraft am Spieltag kurz (≤ 30 min)',
  recoveryIntervals: 'Erholungswoche ohne Intervalle (Tests erlaubt)', testLoad: 'Tests nicht neben Spiel/Wettkampf', warmup: 'Harte Einheit mit Ein- und Auslaufen', raceSim: 'Dreifach-Tag nur als Wettkampf-Simulation'
};
export interface TIssue { rule: TRuleId; week?: number; date?: string; msg: string }
export interface TOpts {
  from?: string | null; today?: string;
  /** Ziele (Typ und Priorität der Wettkämpfe) */ goals?: Goal[];
  /** Hauptziel-Typ (Obergrenzen der langen Einheiten) */ goalType?: GoalType | null;
  /** Einheiten, die bleiben müssen (z. B. heute erledigt) */ keep?: (s: any) => boolean;
  /** darf die Einheit an diesem Tag liegen (Regeln der Person, Schwimmbad)? */ allowed?: (s: any, date: string) => boolean;
  /** Minuten an diesem Tag (0 = kein Training) */ dayCap?: (date: string) => number;
  /** Lauf-Qualität erlaubt (keine Beschwerden, Freigabe)? */ runQualityOk?: boolean;
  /** langer Lauf des letzten normalen Blocks vor dem Plan (Bezug für +10 min) */ prevLongRun?: number | null; prevLongBike?: number | null;
}

/* ---------- Grundbausteine ---------- */
const DAY = 86400000;
const addD = (d: string, n: number) => new Date(+new Date(d + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
const diffD = (a: string, b: string) => Math.round((+new Date(b + 'T12:00:00Z') - +new Date(a + 'T12:00:00Z')) / DAY);
const r5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);
const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const dowOf = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
const fmt = (d: string) => `${DOW[dowOf(d)]} ${+d.slice(8)}.${+d.slice(5, 7)}.`;
export const live = (d: any): any[] => ((d && d.sessions) || []).filter((s: any) => s && s.sport !== 'rest' && !s.cancelled && !s.removed);
export const isBrick = (s: any) => !!s && /^(Koppellauf|Wechsel-Lauf)/.test(s.title || '');
export const isTestS = (s: any) => !!s && !s.race && (!!s.test || (!!s.spec && s.spec.kind === 'test') || /test|Kraul-Check/i.test(s.title || ''));
const isGame = (s: any) => !!s && isGameOrRace(s) && !s.race;
export const isLongS = (s: any) => !!s && !isBrick(s) && !s.race && s.sport !== 'strength' && s.sport !== 'football' && (!!s.long || (s.spec ? s.spec.kind === 'long' || s.spec.kind === 'longq' : /^Lang/.test(s.title || '')));
const fixedS = (s: any) => !!s && (!!s.fixed || !!s.race || !!s.frozen || s.sport === 'football' || !!s.locked);
const hardS = (s: any) => isHardSession(s) && !(s.spec && s.spec.kind === 'test' && /Kraul-Check/.test(s.title || ''));
const ownHard = (s: any) => hardS(s) && !fixedS(s) && !isTestS(s);
const legsS = (s: any) => !!s && s.sport === 'strength' && s.area !== 'upper' && s.area !== 'core';
const minOf = (s: any) => (s && s.plannedMinutes) || 0;
const dayMin = (d: any) => live(d).filter((s: any) => !s.race).reduce((a: number, s: any) => a + minOf(s), 0);
const sportsOf = (d: any) => new Set<string>(live(d).filter((s: any) => !s.race).map((s: any) => isBrick(s) ? 'run' : s.sport));
const hardDay = (d: any) => !!d && live(d).some(hardS);
const eventDay = (d: any) => !!d && live(d).some((s: any) => s.race || isGame(s));
const raceSimDay = (d: any) => live(d).length > 0 && live(d).filter((s: any) => !s.race).every((s: any) => s.raceSim);
const RUN_Q = new Set(['threshold', 'tempo', 'racepace', 'intervals', 'longq', 'vo2', 'test']);

interface DayRef { w: any; d: any }
const daysOf = (weeks: any[]): DayRef[] => weeks.flatMap((w: any) => (w.days || []).map((d: any) => ({ w, d }))).sort((a, b) => a.d.date.localeCompare(b.d.date));
const at = (D: DayRef[], i: number, off: number): DayRef | null => { const x = D[i + off]; return x && diffD(D[i].d.date, x.d.date) === off ? x : null; };

/* Wettkämpfe im Plan (mit Typ: am Wettkampf gespeichert, sonst aus den Zielen) */
export interface RaceAt { date: string; goalId?: string; priority: string; type: GoalType | null; name: string }
export function racesOf(weeks: any[], goals: Goal[] = []): RaceAt[] {
  const out: RaceAt[] = [];
  for (const { d } of daysOf(weeks)) for (const s of live(d)) if (s.race) {
    const g = goals.find(x => x && x.id === s.goalId);
    out.push({ date: d.date, goalId: s.goalId, priority: s.priority || (g && g.priority) || 'A', type: (s.goalType || (g && g.type) || null) as GoalType | null, name: s.title || (g && g.name) || 'Wettkampf' });
  }
  for (const g of goals || []) if (g && g.date && !g.result && GOALS[g.type] && g.type !== 'fitness' && !out.some(r => r.date === g.date && (!r.goalId || r.goalId === g.id))) out.push({ date: g.date, goalId: g.id, priority: g.priority || 'A', type: g.type, name: g.name });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
const isRunGoal = (t: GoalType | null) => !!t && /^run_/.test(t);
/* Großer Tag: lange Einheit plus Koppel, über ca. 2,5 h Training oder Wettkampf-Simulation. longRideOnly: nur lange Ausfahrt (ohne Koppel) */
export function bigDay(d: any): { big: boolean; longRideOnly: boolean; longSport: string | null } {
  const l = live(d).filter((s: any) => !s.race);
  const brick = l.some(isBrick); const longs = l.filter(isLongS);
  // lange Einheit plus Koppel zählt ab 90 min am Tag (eine „lange“ Ausfahrt von 30 min mit 15 min Koppellauf ist kein langer Tag)
  const big = (longs.length > 0 && brick && dayMin(d) >= 90) || dayMin(d) > 150 || l.some((s: any) => s.raceSim);
  // nur eine lange Einheit einer Sportart (ohne Koppel, ohne weitere harte Einheit außer Schwimmen): am Tag danach darf die lange Einheit
  // einer anderen Sportart locker folgen (z. B. lange Ausfahrt Sa, langer lockerer Lauf So)
  const sp = longs.length && longs.every((s: any) => s.sport === longs[0].sport) ? longs[0].sport : null;
  const longSport = big && !brick && !l.some((s: any) => s.raceSim) && sp && !l.some((s: any) => hardS(s) && s.sport !== sp && s.sport !== 'swim') ? sp : null;
  return { big, longRideOnly: longSport === 'bike', longSport };
}
/* Darf diese Einheit am Tag nach einem großen Tag liegen? Ruhe, Lockeres und Kurzes oder Schwimmen; nach einer einzelnen langen Einheit
   auch die lange lockere Einheit einer anderen Sportart */
function okAfterBig(s: any, b: { big: boolean; longSport: string | null }): boolean {
  if (!b.big || s.sport === 'swim' || s.sport === 'strength') return true;
  if (hardS(s)) return false;
  if (isLongS(s)) return !!b.longSport && b.longSport !== s.sport;
  return !(s.sport === 'run' && minOf(s) > 75) && !(s.sport === 'bike' && minOf(s) > 90);
}
/* Ruhetage, die eine Woche braucht: 1, unter 18 und Einsteiger 2 (wenn die festen Termine und Einheiten es zulassen) */
export function restNeed(w: any, p: Profile): number {
  const minor = (ageOf(p, w.startDate) ?? 30) < 18;
  const beginner = levelOf(p) === 'beginner';
  if (!minor && !beginner) return 1;
  const days = w.days || [];
  const fixedDays = days.filter((d: any) => live(d).some(fixedS)).length;
  const units = days.reduce((a: number, d: any) => a + live(d).filter((s: any) => !fixedS(s) && !isBrick(s)).length, 0);
  // 2 Ruhetage passen, wenn alle eigenen Einheiten in die übrigen 5 Tage passen (höchstens 2 pro Tag, an festen Tagen 1)
  return fixedDays <= 5 && units <= (5 - fixedDays) * 2 + fixedDays ? 2 : 1;
}
const fullWeek = (w: any, from?: string | null) => !w.partial && (w.days || []).length === 7 && (!from || w.startDate >= from);
const cycleType = (w: any, date: string, races: RaceAt[], o: TOpts): GoalType => (w && w.cycleGoalType) || ((races.find(r => r.date >= date && r.priority !== 'C') || {}).type as GoalType) || o.goalType || 'fitness';
const ctxOf = (s: any): W.PaceCtx | null => (s && s.spec && s.spec.ctx) || null;

/* ---------- Prüfen ---------- */
export function checkTrainingRules(weeks: any[], p: Profile, o: TOpts = {}): TIssue[] {
  const out: TIssue[] = [];
  const add = (rule: TRuleId, w: any, date: string | undefined, msg: string) => out.push({ rule, week: w && w.weekNumber, date, msg });
  const D = daysOf(weeks);
  const inR = (date: string) => !o.from || date >= o.from;
  const races = racesOf(weeks, o.goals || []);
  const ageAt = (d: string) => ageOf(p, d);
  // Tage
  D.forEach((x, i) => {
    const { w, d } = x; if (!inR(d.date)) return;
    const L = live(d); const nx = at(D, i, 1); const pv = at(D, i, -1);
    // höchstens 2 Sportarten (Koppellauf zählt als Laufen); Dreifach nur als Wettkampf-Simulation (spezifisch, ab 16)
    if (sportsOf(d).size > 2) {
      if (!raceSimDay(d)) add('maxSports', w, d.date, `${fmt(d.date)}: ${sportsOf(d).size} Sportarten an einem Tag (${L.map((s: any) => s.title).join(', ')}).`);
      else if (w.phase !== 'specific' || (ageAt(d.date) ?? 30) < 16) add('raceSim', w, d.date, `${fmt(d.date)}: Wettkampf-Simulation nur in der spezifischen Phase und ab 16.`);
    }
    // nach einem großen Tag kein langer oder harter Lauf (Ausnahme: lange Ausfahrt Sa, langer lockerer Lauf So)
    const b = bigDay(d);
    if (b.big && nx && inR(nx.d.date)) {
      for (const s of live(nx.d).filter((y: any) => !fixedS(y))) {
        if (okAfterBig(s, b)) continue;
        add('bigDayNext', nx.w, nx.d.date, `${fmt(nx.d.date)}: ${s.title} am Tag nach einem langen Tag (${dayMin(d)} min${live(d).some(isBrick) ? ', mit Koppellauf' : ''}) – dort nur Ruhe, locker und kurz oder Schwimmen.`);
      }
    }
    // harte Tage nicht hintereinander (Tests zählen, zwei feste Termine kann der Plan nicht ändern)
    if (nx && hardDay(d) && hardDay(nx.d) && inR(nx.d.date)) {
      const flex = (y: any) => live(y).filter(hardS).some((s: any) => !fixedS(s));
      if (flex(d) || flex(nx.d)) add('hardAdjacent', nx.w, nx.d.date, `${fmt(d.date)} und ${fmt(nx.d.date)}: zwei harte Tage hintereinander (${live(d).filter(hardS).map((s: any) => s.title).join(', ')} / ${live(nx.d).filter(hardS).map((s: any) => s.title).join(', ')}).`);
    }
    // nichts Hartes am Tag vor einem Spiel oder Wettkampf
    if (nx && eventDay(nx.d) && L.some((s: any) => !fixedS(s) && hardS(s))) add('hardBeforeEvent', w, d.date, `${fmt(d.date)}: ${L.filter((s: any) => !fixedS(s) && hardS(s)).map((s: any) => s.title).join(', ')} am Tag vor ${live(nx.d).find((s: any) => s.race || isGame(s)).title}.`);
    // Tests nicht neben Spiel oder Wettkampf
    for (const s of L.filter(isTestS).filter(hardS)) if ((pv && eventDay(pv.d)) || (nx && eventDay(nx.d))) add('testLoad', w, d.date, `${fmt(d.date)}: ${s.title} direkt neben einem Spiel oder Wettkampf.`);
    // Kraft Beine nicht am oder vor Spiel, Wettkampf, langem Lauf
    const legsBad = (y: any) => !!y && live(y).some((s: any) => s.race || isGame(s) || (isLongS(s) && s.sport === 'run'));
    for (const s of L.filter(legsS)) if (!fixedS(s) && (legsBad(d) || (nx && legsBad(nx.d)))) add('legsStrength', w, d.date, `${fmt(d.date)}: ${s.title} (Beine) ${legsBad(d) ? 'am selben Tag wie' : 'am Tag vor'} Spiel, Wettkampf oder langem Lauf.`);
    // Kraft am Spieltag höchstens 30 min
    if (L.some(isGame)) for (const s of L.filter((y: any) => y.sport === 'strength' && !fixedS(y))) if (minOf(s) > 30) add('strengthGameDay', w, d.date, `${fmt(d.date)}: ${s.title} am Spieltag ${minOf(s)} min, höchstens 30 min.`);
    // harte Einheit mit Aufwärmen (≥ 10 min) und Auslaufen (≥ 5 min)
    for (const s of L.filter((y: any) => ownHard(y) && (y.sport === 'run' || y.sport === 'bike') && y.spec && y.spec.steps)) {
      const st: any[] = s.spec.steps; const warm = st.filter(x => x.part === 'warm').reduce((a, x) => a + (x.min || 0), 0);
      const last = st[st.length - 1]; const cool = st.filter(x => x.part === 'cool').reduce((a, x) => a + (x.min || 0), 0) || (last && last.part === 'main' && (last.zone || 2) <= 2 && !last.reps ? last.min || 0 : 0);
      if (warm < 10 || cool < 5) add('warmup', w, d.date, `${fmt(d.date)}: ${s.title} ohne ausreichendes Ein- (${warm} min) oder Auslaufen (${cool} min).`);
    }
  });
  // Wochen
  let lastLR: number | null = o.prevLongRun ?? null, lastLB: number | null = o.prevLongBike ?? null;
  const simCount: Record<string, number> = {};
  for (const w of weeks) {
    const days = w.days || [];
    const inW = !o.from || (w.endDate || addD(w.startDate, 6)) >= o.from;
    const own = days.flatMap((d: any) => live(d).filter((s: any) => !s.race));
    if (inW && fullWeek(w, o.from)) {
      const rest = days.filter((d: any) => !live(d).length).length; const need = 1; // der zweite Ruhetag (unter 18, Einsteiger) ist ein Ziel, keine Pflicht
      if (rest < need) add('restDay', w, undefined, `Woche ${w.weekNumber}: ${rest} Ruhetag${rest === 1 ? '' : 'e'}, nötig ${need}.`);
      const age = ageOf(p, w.startDate);
      if (age != null && age < 18) { const tot = own.reduce((a: number, s: any) => a + minOf(s), 0); if (tot > age * 60 + 5) add('teenHours', w, undefined, `Woche ${w.weekNumber}: ${Math.round(tot / 6) / 10} h, unter 18 höchstens ${age} h (Alter).`); }
    }
    if (inW) {
      // harte Einheiten pro Woche (Spiele und C-Wettkämpfe kommen dazu, Tests nicht)
      const fixedHard = days.filter((d: any) => live(d).some((s: any) => isGame(s) || (s.race && s.priority === 'C'))).length;
      const ph = (w.phase || 'base') as any;
      const n = own.filter(ownHard).length;
      const max = w.isRecoveryWeek || ph === 'race' ? 0 : ownHardBudget(p, ph, w.startDate, 4, fixedHard);
      if (!w.partial && n > max && !w.isRecoveryWeek && ph !== 'race') add('hardCount', w, undefined, `Woche ${w.weekNumber}: ${n} eigene harte Einheiten, passend wären höchstens ${max}.`);
      // Erholungswoche: keine Intervalle (Tests erlaubt), höchstens ein harter Test
      if (w.isRecoveryWeek) {
        for (const d of days) for (const s of live(d).filter(ownHard)) if (inR(d.date)) add('recoveryIntervals', w, d.date, `${fmt(d.date)}: ${s.title} in der Erholungswoche.`);
        const tests = own.filter((s: any) => isTestS(s) && hardS(s));
        if (tests.length > 1) add('testLoad', w, undefined, `Woche ${w.weekNumber}: ${tests.length} harte Tests in der Erholungswoche.`);
      }
      // lange Einheiten: passend zum Ziel und höchstens +10 min (Rad +15 min) pro Woche
      const lr = Math.max(0, ...own.filter((s: any) => s.sport === 'run' && isLongS(s)).map(minOf));
      const lb = Math.max(0, ...own.filter((s: any) => s.sport === 'bike' && isLongS(s)).map(minOf));
      const ref = w.days.find((d: any) => live(d).some((s: any) => s.sport === 'run' && isLongS(s) && minOf(s) === lr));
      if (lr && ref && inR(ref.date)) {
        const cap = capsFor(cycleType(w, ref.date, races, o), ref.date, { aGoal: o.goalType || null, age: ageOf(p, ref.date) }).run;
        if (lr > cap + 2) add('longCap', w, ref.date, `${fmt(ref.date)}: langer Lauf ${lr} min, passend zum nächsten Ziel höchstens ${cap} min.`);
        if (lastLR != null && lr > lastLR + 11 && !w.partial) add('longStep', w, ref.date, `${fmt(ref.date)}: langer Lauf ${lr} min nach ${lastLR} min (höchstens +10 min).`);
      }
      if (lb && lastLB != null && lb > lastLB + 16 && !w.partial) add('longStep', w, undefined, `Woche ${w.weekNumber}: lange Ausfahrt ${lb} min nach ${lastLB} min (höchstens +15 min).`);
      if (!w.isRecoveryWeek && ph !== 'taper' && ph !== 'race' && !w.entry && !w.reduced) { if (lr) lastLR = lr; if (lb) lastLB = lb; }
      // Wettkampf-Simulationen: höchstens 3 pro Saison (Kalenderjahr)
      for (const d of days) if (raceSimDay(d) && sportsOf(d).size > 2) { const y = d.date.slice(0, 4); simCount[y] = (simCount[y] || 0) + 1; if (simCount[y] > 3) add('raceSim', w, d.date, `${fmt(d.date)}: mehr als 3 Wettkampf-Simulationen in ${y}.`); }
    } else {
      const lr = Math.max(0, ...own.filter((s: any) => s.sport === 'run' && isLongS(s)).map(minOf)); const lb = Math.max(0, ...own.filter((s: any) => s.sport === 'bike' && isLongS(s)).map(minOf));
      if (!w.isRecoveryWeek && w.phase !== 'taper' && w.phase !== 'race') { if (lr) lastLR = lr; if (lb) lastLB = lb; }
    }
  }
  // Wettkämpfe: Woche davor, Tage danach, Lauf-Qualität vor Laufzielen
  for (const r of races) {
    const after = r.type ? easyAfterDays(r.type) : 3;
    for (const x of D) {
      const k = diffD(r.date, x.d.date); if (!inR(x.d.date)) continue;
      if (k > 0 && k <= after) for (const s of live(x.d).filter((y: any) => !fixedS(y))) {
        const cap = k <= 2 ? 45 : 60;
        if (hardS(s)) add('afterRace', x.w, x.d.date, `${fmt(x.d.date)}: ${s.title} ist hart, ${k} Tag${k === 1 ? '' : 'e'} nach ${r.name} nur locker.`);
        else if (isLongS(s) || (minOf(s) > cap && s.sport !== 'strength')) add('afterRace', x.w, x.d.date, `${fmt(x.d.date)}: ${s.title} (${minOf(s)} min), ${k} Tag${k === 1 ? '' : 'e'} nach ${r.name} höchstens ${cap} min locker.`);
      }
      if (r.priority !== 'C' && k < 0 && k >= -6) for (const s of live(x.d).filter((y: any) => !fixedS(y))) {
        if (s.sport === 'strength') add('raceWeek', x.w, x.d.date, `${fmt(x.d.date)}: ${s.title} in der Wettkampfwoche vor ${r.name}.`);
        else if (isTestS(s) && hardS(s)) add('raceWeek', x.w, x.d.date, `${fmt(x.d.date)}: ${s.title} in der Wettkampfwoche.`);
        else if (hardS(s) && !(hardMinutes(s) <= 12 && minOf(s) <= 50)) add('raceWeek', x.w, x.d.date, `${fmt(x.d.date)}: ${s.title} in der Wettkampfwoche, nur kurze Aktivierungen.`);
      }
      if (r.priority === 'C' && k === -1) for (const s of live(x.d).filter((y: any) => !fixedS(y) && y.sport === 'strength')) add('raceWeek', x.w, x.d.date, `${fmt(x.d.date)}: ${s.title} am Tag vor ${r.name}.`);
    }
    // festes Spiel 1-2 Tage vor einem A/B-Wettkampf: Woche leichter, Hinweis
    if (r.priority !== 'C') {
      const g = D.find(x => diffD(x.d.date, r.date) >= 1 && diffD(x.d.date, r.date) <= 2 && live(x.d).some(isGame));
      if (g && inR(g.d.date) && !g.w.gameLight) add('raceWeek', g.w, g.d.date, `${fmt(g.d.date)}: Spiel kurz vor ${r.name}, die Woche ist nicht leichter geplant.`);
    }
    // Laufziel: in den letzten 7 Wochen davor jede (normale) Woche ein Schwellen- bzw. Wettkampftempo-Lauf
    if (isRunGoal(r.type) && r.priority !== 'C' && o.runQualityOk !== false) for (const w of weeks) {
      const k = Math.floor(diffD(w.startDate, r.date) / 7);
      if (k < 1 || k > 7 || w.isRecoveryWeek || w.phase === 'race' || w.partial || (o.from && w.startDate < o.from) || w.entry) continue;
      const runs = (w.days || []).flatMap((d: any) => live(d).filter((s: any) => s.sport === 'run' && !s.race && !isBrick(s)));
      if (runs.some((s: any) => s.stage)) continue;
      if (!runs.some((s: any) => hardS(s) && RUN_Q.has((s.spec && s.spec.kind) || (isTestS(s) ? 'test' : '')))) add('goalQuality', w, undefined, `Woche ${w.weekNumber}: kein Schwellen- oder Wettkampftempo-Lauf, ${k} Woche${k === 1 ? '' : 'n'} vor ${r.name}.`);
    }
  }
  return out;
}

/* ---------- Korrigieren ---------- */
const restOf = (s: any) => ({ id: `${s.id || 'x'}-rest`, sport: 'rest', title: 'Ruhetag' });
function setS(d: any, s: any, nx: any) { d.sessions = d.sessions.map((x: any) => x === s ? nx : x); }
function removeS(d: any, s: any) { d.sessions = d.sessions.filter((x: any) => x !== s); if (!live(d).length && !d.sessions.some((x: any) => x.sport === 'rest')) d.sessions.push(restOf(s)); }
function addS(d: any, s: any) { d.sessions = [...d.sessions.filter((x: any) => x.sport !== 'rest'), s]; }
const note = (s: any, why: string) => ({ ...s, ruleNote: why, description: `${String(s.description || '').replace(/\nRegel: .*$/s, '')}\nRegel: ${why}`.trim() });
/* lockere, kurze Form (gleiche Sportart); null ohne Bausteine */
function easyShortOf(s: any, min: number, why: string, phase = 'base'): any | null {
  const ctx = ctxOf(s); if (!ctx || !s.spec) return null;
  const m = r5(Math.max(20, min));
  const e = s.sport === 'run' ? W.runEasy(ctx, m) : s.sport === 'bike' ? W.bikeEasy(ctx, Math.max(30, m)) : s.sport === 'swim' ? W.swimNormal(ctx, 'endurance', Math.max(25, m), phase, Math.max(25, ...s.spec.steps.filter((x: any) => x.mode === 'crawl' || x.mode === 'pull').map((x: any) => x.m || 0))) : null;
  if (!e) return null;
  e.why = why; if (s.spec.tip) e.tip = s.spec.tip;
  const { hard, long, ...rest } = s; void hard; void long;
  return { ...rest, ...W.build(e), id: s.id, ruleNote: why };
}
const scaled = (s: any, f: number): any | null => { const rb = W.rebuildScaled(s, f); return rb ? { ...s, ...rb, plannedKm: rb.plannedKm ?? undefined } : null; };

export function repairTrainingRules(weeks: any[], p: Profile, o: TOpts = {}): string[] {
  const fixes: string[] = [];
  const inR = (date: string) => !o.from || date >= o.from;
  const keep = (s: any) => !!(o.keep && o.keep(s));
  const movable = (s: any, date: string) => !!s && !fixedS(s) && !keep(s) && inR(date);
  const races = racesOf(weeks, o.goals || []);
  const ageAt = (d: string) => ageOf(p, d);
  const minor = (d: string) => (ageAt(d) ?? 30) < 18;
  const noZ5 = (d: string) => { const a = ageAt(d); return a != null && (a < 18 || a >= 60); };

  // 1) Wettkampfwoche (A/B): keine Kraft, nichts Hartes außer kurzen Aktivierungen; Spiel 1-2 Tage vorher → Woche leichter
  for (const r of races.filter(x => x.priority !== 'C')) {
    let D = daysOf(weeks);
    for (const x of D) {
      const k = diffD(r.date, x.d.date); if (k >= 0 || k < -6 || !inR(x.d.date)) continue;
      for (const s of [...live(x.d)]) {
        if (!movable(s, x.d.date)) continue;
        if (s.sport === 'strength') { removeS(x.d, s); fixes.push(`${x.d.date}: ${s.title} entfällt (Wettkampfwoche ${r.name})`); continue; }
        if (hardS(s) && (isTestS(s) || !(hardMinutes(s) <= 12 && minOf(s) <= 50))) {
          const why = `Wettkampfwoche vor ${r.name}: nur locker mit kurzen Steigerungen, damit du frisch bist.`;
          const ctx = ctxOf(s); let nx: any = null;
          if (ctx && s.sport === 'run') { const e = W.runEasy(ctx, Math.min(35, Math.max(25, minOf(s))), { strides: 4 }); e.why = why; nx = { ...W.build(e), id: s.id }; }
          else nx = easyShortOf(s, Math.min(45, minOf(s)), why, x.w.phase);
          if (nx) { setS(x.d, s, nx); fixes.push(`${x.d.date}: ${s.title} → ${nx.title} (Wettkampfwoche)`); }
        }
      }
    }
    D = daysOf(weeks);
    const g = D.find(x => diffD(x.d.date, r.date) >= 1 && diffD(x.d.date, r.date) <= 2 && live(x.d).some(isGame));
    if (g && !g.w.gameLight && inR(g.d.date)) {
      g.w.gameLight = true;
      for (const x of D.filter(y => y.w === g.w && inR(y.d.date) && y.d.date < r.date)) for (const s of [...live(x.d)]) {
        if (!movable(s, x.d.date) || !s.spec || s.stage || isTestS(s) || minOf(s) < 30) continue;
        const nx = scaled(s, 0.8); if (nx && nx.plannedMinutes < minOf(s)) setS(x.d, s, nx);
      }
      const hint = `${live(g.d).find(isGame).title} am ${fmt(g.d.date)} kurz vor ${r.name}: Die Woche ist leichter geplant. Im Spiel nur kurz spielen oder aussetzen, damit du frisch an den Start gehst.`;
      if (!String(g.w.important || '').includes(hint)) g.w.important = [g.w.important, hint].filter(Boolean).join(' ');
      fixes.push(`Woche ${g.w.weekNumber}: leichter (Spiel kurz vor ${r.name})`);
    }
  }
  // 2) Tage nach einem Wettkampf: locker und kurz, nichts Langes, nichts Hartes
  for (const r of races) {
    const after = r.type ? easyAfterDays(r.type) : 3;
    for (const x of daysOf(weeks)) {
      const k = diffD(r.date, x.d.date); if (k <= 0 || k > after || !inR(x.d.date)) continue;
      const cap = k <= 2 ? 45 : 60;
      for (const s of [...live(x.d)]) {
        if (!movable(s, x.d.date) || s.stage) continue;
        if (hardS(s) || isLongS(s) || (minOf(s) > cap && s.sport !== 'strength')) {
          const nx = easyShortOf(s, Math.min(cap, minOf(s)), `${k} Tag${k === 1 ? '' : 'e'} nach ${r.name}: nur locker und kurz, der Körper erholt sich vom Wettkampf.`, x.w.phase);
          if (nx) { setS(x.d, s, nx); fixes.push(`${x.d.date}: ${s.title} → ${nx.title} (nach ${r.name})`); } else { removeS(x.d, s); fixes.push(`${x.d.date}: ${s.title} entfällt (nach ${r.name})`); }
        }
      }
    }
  }
  // 3) Erholungswoche: keine Intervalle (Tests bleiben)
  for (const w of weeks) if (w.isRecoveryWeek) for (const d of w.days || []) for (const s of [...live(d)]) {
    if (!movable(s, d.date) || !ownHard(s) || !s.spec || s.stage) continue;
    const nx = { ...easyOf(s, w.phase), ...(isLongS(s) ? { long: true } : {}), ruleNote: 'Erholungswoche: keine Intervalle.' }; setS(d, s, nx); fixes.push(`${d.date}: ${s.title} locker (Erholungswoche)`);
  }

  // Platzieren: darf s an Tag j liegen? (für Verschieben)
  const canPlace = (D: DayRef[], s: any, j: number, opt: { noRest?: boolean } = {}): boolean => {
    const x = D[j]; const d = x.d; if (!inR(d.date)) return false;
    const L = live(d);
    if (opt.noRest && !L.length) return false;
    if (L.some((y: any) => y.race)) return false;
    if (o.dayCap && dayMin(d) - L.filter((y: any) => y.sport === 'football').reduce((a: number, y: any) => a + minOf(y), 0) + minOf(s) > o.dayCap(d.date)) return false;
    if (o.allowed && !o.allowed(s, d.date)) return false;
    const sp = isBrick(s) ? 'run' : s.sport;
    if (L.some((y: any) => (isBrick(y) ? 'run' : y.sport) === sp)) return false;
    const ss = sportsOf(d); ss.add(sp); if (ss.size > 2) return false;
    if (L.filter((y: any) => !y.race).length >= 2) return false;
    const pv = at(D, j, -1), nx = at(D, j, 1);
    const sameNear = (y: DayRef | null) => !!y && live(y.d).some((z: any) => z !== s && !isBrick(z) && (z.sport === 'strength' && s.sport === 'strength' ? (!z.area || !s.area || z.area === s.area) : z.sport === s.sport && !z.race));
    if (s.sport !== 'football' && (sameNear(pv) || sameNear(nx))) return false;
    const gameDay = L.some(isGame);
    if (gameDay && (hardS(s) || isLongS(s) || legsS(s) || (s.sport === 'strength' && minOf(s) > 30))) return false;
    if (hardS(s)) { if (hardDay(d) || (pv && hardDay(pv.d)) || (nx && (hardDay(nx.d) || eventDay(nx.d)))) return false; }
    if (pv && !okAfterBig(s, bigDay(pv.d))) return false;
    if (isLongS(s) && nx && eventDay(nx.d)) return false;
    // keine zwei langen Einheiten an einem Tag; wird der Tag dadurch groß, muss der Tag danach dazu passen
    if (isLongS(s) && L.some(isLongS)) return false;
    if (dayMin(d) + minOf(s) > 150 && nx && live(nx.d).some((y: any) => !fixedS(y) && !okAfterBig(y, { big: true, longSport: null }))) return false;
    if (s.sport === 'strength' && nx && (hardDay(nx.d) || eventDay(nx.d)) && !(s.spec && (s.spec.exercises || []).every((e: any) => /leicht/.test(e.note || '')))) return false;
    if (legsS(s)) { const bad = (y: DayRef | null) => !!y && live(y.d).some((z: any) => z.race || isGame(z) || (isLongS(z) && z.sport === 'run')); if (bad(x) || bad(nx)) return false; }

    return true;
  };
  const moveTo = (from: any, to: any, s: any) => { removeS(from, s); addS(to, s); };
  /* Großen Tag verkleinern (Koppellauf weg, lange Ausfahrt → lockere Ausfahrt bis 75 min), damit am Tag danach ein Test oder die
     Lauf-Qualität vor dem Laufziel stattfinden kann. true: der Tag ist danach kein großer Tag mehr. */
  const shrinkDay = (x: DayRef, why: string): boolean => {
    const pl = live(x.d);
    if (pl.some((y: any) => (isLongS(y) || isBrick(y) || minOf(y) > 75) && !movable(y, x.d.date))) return false;
    for (const y of [...pl]) {
      if (isBrick(y)) { removeS(x.d, y); fixes.push(`${x.d.date}: ${y.title} entfällt (${why})`); }
      else if ((isLongS(y) || minOf(y) > 75) && y.sport !== 'run') { const e = easyShortOf(y, Math.min(75, minOf(y)), `Lockerer und kürzer: ${why}.`, x.w.phase); if (e) { setS(x.d, y, e); fixes.push(`${x.d.date}: ${y.title} → ${e.title} (${why})`); } }
    }
    return !bigDay(x.d).big;
  };
  const goalWeek = (w: any) => o.runQualityOk !== false && races.some(r => isRunGoal(r.type) && r.priority !== 'C' && (() => { const k = Math.floor(diffD(w.startDate, r.date) / 7); return k >= 1 && k <= 7; })()) && !w.isRecoveryWeek && w.phase !== 'race';
  const protectedS = (s: any, w: any) => isTestS(s) && hardS(s) || (s.sport === 'run' && hardS(s) && goalWeek(w) && RUN_Q.has((s.spec && s.spec.kind) || ''));

  // 5) Lauf-Qualität vor einem Laufziel (letzte 7 Wochen, jede normale Woche): lockerer Lauf ohne harten Nachbartag → Schwelle bzw.
  //    Wettkampftempo; geht das nicht, Qualität im langen Lauf (Tag davor dann ohne lange Ausfahrt und ohne Koppel). Das Budget harter
  //    Einheiten bleibt: notfalls wird eine harte Einheit einer anderen Sportart locker.
  // vor einem Laufziel (letzte 8 Wochen) kein Koppellauf: der lange Lauf am Tag danach hat Vorrang
  for (const r of races.filter(x => isRunGoal(x.type) && x.priority !== 'C')) for (const w of weeks) {
    const k = Math.floor(diffD(w.startDate, r.date) / 7); if (k < 0 || k > 8) continue;
    for (const d of w.days || []) for (const s of [...live(d)]) if (isBrick(s) && movable(s, d.date)) { removeS(d, s); fixes.push(`${d.date}: ${s.title} entfällt (vor ${r.name} hat der lange Lauf Vorrang)`); }
  }
  if (o.runQualityOk !== false) for (const r of races.filter(x => isRunGoal(x.type) && x.priority !== 'C')) {
    let qn = 0;
    for (const w of weeks) {
      const k = Math.floor(diffD(w.startDate, r.date) / 7);
      if (k < 1 || k > 7 || w.isRecoveryWeek || w.phase === 'race' || w.partial || w.entry || (o.from && w.startDate < o.from)) continue;
      const D = daysOf(weeks); const idx = (d: any) => D.findIndex(y => y.d === d);
      const runs = (w.days || []).flatMap((d: any) => live(d).filter((s: any) => s.sport === 'run' && !s.race && !isBrick(s)).map((s: any) => ({ d, s })));
      if (runs.some(({ s }: any) => s.stage)) continue;
      const have = runs.find(({ s }: any) => hardS(s) && RUN_Q.has((s.spec && s.spec.kind) || (isTestS(s) ? 'test' : '')));
      if (have) {
        // die Qualität liegt nach einem großen Tag: den Tag davor verkleinern, sonst würde sie gleich wieder locker
        const i = idx(have.d); const pv = i >= 0 ? at(D, i, -1) : null;
        if (pv && bigDay(pv.d).big) shrinkDay(pv, `Tag vor ${isTestS(have.s) ? 'dem Test' : 'dem Qualitätslauf'} für ${r.name}`);
        qn++; continue;
      }
      const ph = (w.phase === 'base' ? 'build' : w.phase) as any;
      const rq0 = K.runQualityStep(ph, r.type as GoalType, qn, minor(w.startDate), { noZ5: noZ5(w.startDate), level: levelOf(p), baseWeek: 4 });
      if (!rq0) continue;
      const fitQ = (room: number) => { const q = { ...rq0 }; while (q.reps > 1 && q.reps * q.min + (q.reps - 1) * q.rest > room) q.reps--; if (q.reps * q.min > room) q.min = Math.max(5, Math.floor(room / 5) * 5); return q; };
      const freeAround = (i: number) => { const pv = at(D, i, -1), nx = at(D, i, 1); return !hardDay(D[i].d) && !(pv && (hardDay(pv.d) || bigDay(pv.d).big)) && !(nx && (hardDay(nx.d) || eventDay(nx.d))); };
      let placed: { d: any; s: any; nx: any } | null = null;
      // a) lockerer Lauf unter der Woche
      for (const { d, s } of runs) {
        if (!movable(s, d.date) || isLongS(s) || hardS(s) || !s.spec || minOf(s) < 30) continue;
        const i = idx(d); if (i < 0 || !freeAround(i)) continue;
        const room = Math.max(minOf(s), 45) - 25; const q = fitQ(room);
        let spec = K.runQuality(s.spec.ctx, q); if (W.totals(spec).min > Math.max(minOf(s), 45) + 5) spec = K.runQuality(s.spec.ctx, q, { short: true });
        if (W.totals(spec).min > Math.max(minOf(s), 45) + 10) continue;
        placed = { d, s, nx: { ...W.build({ ...spec, why: `${spec.why} ${k} Woche${k === 1 ? '' : 'n'} vor ${r.name}: einmal pro Woche im Schwellen- bzw. Wettkampftempo.` }), id: s.id, ruleNote: 'Lauf-Qualität vor dem Laufziel' } };
        break;
      }
      // b) im langen Lauf: Tag davor ohne lange Ausfahrt und Koppel, Tag danach kein Spiel/Wettkampf
      if (!placed) for (const { d, s } of runs.filter(({ s }: any) => isLongS(s) && !hardS(s) && s.spec)) {
        if (!movable(s, d.date)) continue;
        const i = idx(d); const pv = at(D, i, -1), nx = at(D, i, 1);
        if (hardDay(d) || (nx && (hardDay(nx.d) || eventDay(nx.d))) || (pv && hardDay(pv.d))) continue;
        // lange Ausfahrt und Koppel am Tag davor verkleinern (nur eigene Einheiten)
        if (pv && bigDay(pv.d).big && !shrinkDay(pv, `morgen ist der Qualitätslauf für ${r.name}`)) continue;
        const q = fitQ(minOf(s) - 25);
        const b = W.build({ ...K.longRunWithQuality(s.spec.ctx, minOf(s), q), why: `${q.why} ${k} Woche${k === 1 ? '' : 'n'} vor ${r.name}: Qualität im langen Lauf, weil unter der Woche kein Lauftag ohne harten Nachbartag frei ist.` });
        if (b.plannedMinutes > minOf(s) + 1) { const b2 = W.build({ ...K.longRunWithQuality(s.spec.ctx, minOf(s) - 5, q), why: b.spec.why }); if (b2.plannedMinutes > minOf(s) + 1) continue; Object.assign(b, b2); }
        placed = { d, s, nx: { ...s, ...b, id: s.id, long: true, hard: true, ruleNote: 'Lauf-Qualität vor dem Laufziel (im langen Lauf)' } };
        break;
      }
      if (!placed) continue;
      // Budget harter Einheiten: notfalls eine harte Einheit einer anderen Sportart locker
      const fixedHard = (w.days || []).filter((d: any) => live(d).some((s: any) => isGame(s) || (s.race && s.priority === 'C'))).length;
      const max = ownHardBudget(p, w.phase as any, w.startDate, 4, fixedHard);
      const ownH = (w.days || []).flatMap((d: any) => live(d).filter(ownHard).map((s: any) => ({ d, s })));
      if (ownH.length + 1 > max) {
        const dem = ownH.filter(({ d, s }: any) => s.sport !== 'run' && movable(s, d.date) && s.spec).sort((a: any, b: any) => minOf(a.s) - minOf(b.s))[0];
        if (!dem) continue;
        setS(dem.d, dem.s, { ...easyOf(dem.s, w.phase), ...(isLongS(dem.s) ? { long: true } : {}), ruleNote: `Locker, damit Platz für die Lauf-Qualität vor ${r.name} ist.` }); fixes.push(`${dem.d.date}: ${dem.s.title} locker (Lauf-Qualität vor ${r.name} geht vor)`);
      }
      setS(placed.d, placed.s, placed.nx); qn++;
      fixes.push(`${placed.d.date}: ${placed.s.title} → ${placed.nx.title} (${k} Woche${k === 1 ? '' : 'n'} vor ${r.name})`);
      // die Woche hat jetzt einen Qualitätslauf: langer Lauf mit Tempo daneben wird locker
      for (const { d, s } of (w.days || []).flatMap((d: any) => live(d).filter((s: any) => s.sport === 'run' && s.spec && s.spec.kind === 'longq' && s !== placed!.nx).map((s: any) => ({ d, s }))))
        if (movable(s, d.date) && placed.nx.spec.kind !== 'longq') { setS(d, s, { ...easyOf(s, w.phase), long: true }); fixes.push(`${d.date}: ${s.title} locker (Qualität schon unter der Woche)`); }
    }
  }

  // 4) höchstens 2 Sportarten pro Tag (Koppellauf zählt als Laufen): eine Einheit verschieben, sonst den Koppellauf, sonst die kürzeste lockere weglassen
  for (let guard = 0; guard < 3; guard++) {
    const D = daysOf(weeks); let changed = false;
    for (let i = 0; i < D.length; i++) {
      const { w, d } = D[i]; if (!inR(d.date) || sportsOf(d).size <= 2 || raceSimDay(d)) continue;
      const cand = live(d).filter((s: any) => movable(s, d.date) && !isLongS(s) && !isBrick(s)).sort((a: any, b: any) => +hardS(a) - +hardS(b) || minOf(a) - minOf(b));
      let done = false;
      for (const s of cand) {
        const js = D.map((y, j) => ({ y, j })).filter(({ y, j }) => y.w === w && j !== i).sort((a, b) => Math.abs(a.j - i) - Math.abs(b.j - i));
        const t = js.find(({ j }) => canPlace(D, s, j, { noRest: true })) || js.find(({ j }) => canPlace(D, s, j));
        if (t) { moveTo(d, t.y.d, s); fixes.push(`${s.title}: ${d.date} → ${t.y.d.date} (höchstens 2 Sportarten pro Tag)`); done = true; break; }
      }
      if (!done) {
        const br = live(d).find((s: any) => isBrick(s) && movable(s, d.date));
        const drop = br || live(d).filter((s: any) => movable(s, d.date) && !hardS(s) && !isLongS(s) && !isTestS(s)).sort((a: any, b: any) => minOf(a) - minOf(b))[0];
        if (drop) { removeS(d, drop); fixes.push(`${d.date}: ${drop.title} entfällt (höchstens 2 Sportarten pro Tag)`); done = true; }
      }
      if (done) { changed = true; break; }
    }
    if (!changed) break;
  }

  // 6) Nach einem großen Tag: kein langer oder harter Lauf, sondern locker und kürzer (Koppel-Woche: Sonntag etwa 65 % des langen Laufs)
  { const D = daysOf(weeks);
    for (let i = 0; i < D.length - 1; i++) {
      const b0 = bigDay(D[i].d); const nx = at(D, i, 1); if (!b0.big || !nx || !inR(nx.d.date)) continue;
      // Test oder Lauf-Qualität vor dem Laufziel am Tag danach: lieber den großen Tag verkleinern
      if (live(nx.d).some((s: any) => protectedS(s, nx.w) && movable(s, nx.d.date)) && shrinkDay(D[i], `morgen ist ${live(nx.d).some(isTestS) ? 'ein Test' : 'der Qualitätslauf vor dem Laufziel'}`)) continue;
      const b = bigDay(D[i].d); if (!b.big) continue;
      for (const s of [...live(nx.d)]) {
        if (!movable(s, nx.d.date) || s.stage || okAfterBig(s, b)) continue;
        if (b.longSport && b.longSport !== s.sport && isLongS(s) && hardS(s) && s.spec) { const e = { ...easyOf(s, nx.w.phase), long: true, ruleNote: 'Lange Einheit nach einer langen Einheit am Vortag: locker, ohne Tempo.' }; setS(nx.d, s, e); fixes.push(`${nx.d.date}: ${s.title} locker (Tag nach der langen Einheit)`); continue; }
        const brick = live(D[i].d).some(isBrick);
        const why = brick ? 'Koppel-Woche: am Tag nach Rad und Koppellauf locker und kürzer (etwa 2/3 des langen Laufs).' : `Am Tag nach einem langen Tag (${dayMin(D[i].d)} min) nur locker und kurz.`;
        {
          const target = Math.min(minOf(s), s.sport === 'run' ? Math.max(30, r5(minOf(s) * (isLongS(s) ? 0.65 : 0.8))) : Math.min(60, minOf(s)));
          const e = easyShortOf(s, Math.min(target, s.sport === 'run' ? 75 : 60), why, nx.w.phase);
          if (e) { setS(nx.d, s, e); fixes.push(`${nx.d.date}: ${s.title} → ${e.title} (Tag nach langem Tag)`); }
        }
      }
    }
  }
  // 7) lange Einheiten: passend zum Ziel, höchstens +10 min (Rad +15 min) pro Woche
  { let lastLR: number | null = o.prevLongRun ?? null, lastLB: number | null = o.prevLongBike ?? null;
    for (const w of weeks) {
      for (const d of w.days || []) for (const s of [...live(d)]) {
        if (!isLongS(s) || !s.spec || s.stage || !movable(s, d.date)) continue;
        let lim = Infinity;
        if (s.sport === 'run') { lim = capsFor(cycleType(w, d.date, races, o), d.date, { aGoal: o.goalType || null, age: ageOf(p, d.date) }).run; if (lastLR != null && !w.partial) lim = Math.min(lim, lastLR + 10); }
        if (s.sport === 'bike' && lastLB != null && !w.partial) lim = Math.min(lim, lastLB + 15);
        for (let k = 0; k < 4 && minOf(s) > lim + 1; k++) { const nx = scaled(s, (lim / minOf(s)) * (1 - 0.03 * k)); if (nx && nx.plannedMinutes < minOf(s)) { Object.assign(s, nx); fixes.push(`${d.date}: ${s.title} (lange Einheit höchstens ${Math.round(lim)} min)`); } else break; }
        // Qualität im langen Lauf lässt sich nicht immer skalieren: dann mit der Ziel-Dauer neu bauen (gleicher Qualitätsteil, weniger locker)
        if (minOf(s) > lim + 1 && s.sport === 'run' && s.spec.kind === 'longq') {
          const st = s.spec.steps.find((x: any) => x.part === 'main' && (x.zone || 0) >= 3);
          if (st) { const q = { reps: st.reps || 1, min: st.min || 10, zone: st.zone, rest: st.restMin || 2, label: st.note || 'Tempo', why: s.spec.why || '' } as any;
            while (q.reps > 1 && q.reps * q.min + (q.reps - 1) * q.rest > lim - 25) q.reps--;
            const b = W.build({ ...K.longRunWithQuality(s.spec.ctx, r5(lim) > lim ? r5(lim) - 5 : r5(lim), q), why: s.spec.why });
            if (b.plannedMinutes <= lim + 1) { Object.assign(s, b); fixes.push(`${d.date}: ${s.title} (lange Einheit höchstens ${Math.round(lim)} min)`); } }
        }
      }
      const own = (w.days || []).flatMap((d: any) => live(d));
      const lr = Math.max(0, ...own.filter((s: any) => s.sport === 'run' && isLongS(s)).map(minOf)), lb = Math.max(0, ...own.filter((s: any) => s.sport === 'bike' && isLongS(s)).map(minOf));
      if (!w.isRecoveryWeek && w.phase !== 'taper' && w.phase !== 'race' && !w.entry && !w.reduced) { if (lr) lastLR = lr; if (lb) lastLB = lb; }
    }
  }
  // 8) Kraft: Beine nie am oder vor Spiel, Wettkampf, langem Lauf (verschieben, sonst Rumpf statt Beine); am Spieltag höchstens 30 min
  { const D = daysOf(weeks);
    for (let i = 0; i < D.length; i++) {
      const { w, d } = D[i]; if (!inR(d.date)) continue;
      const bad = (y: DayRef | null) => !!y && live(y.d).some((z: any) => z.race || isGame(z) || (isLongS(z) && z.sport === 'run'));
      for (const s of [...live(d).filter(legsS)]) {
        if (!movable(s, d.date) || !(bad(D[i]) || bad(at(D, i, 1)))) continue;
        const js = D.map((y, j) => ({ y, j })).filter(({ y, j }) => y.w === w && j !== i);
        const t = js.find(({ j }) => canPlace(D, s, j, { noRest: true }));
        if (t) { moveTo(d, t.y.d, s); fixes.push(`${s.title}: ${d.date} → ${t.y.d.date} (Kraft Beine nicht vor Spiel/Wettkampf/langem Lauf)`); continue; }
        const nx = { ...W.build({ ...W.strengthArea('core', { minutes: Math.min(30, minOf(s)), why: 'Rumpf statt Beine: am Tag davor oder danach ist ein Spiel, Wettkampf oder langer Lauf.' }) }), id: s.id };
        setS(d, s, nx); fixes.push(`${d.date}: ${s.title} → ${nx.title} (keine Beine vor Spiel/Wettkampf/langem Lauf)`);
      }
      if (live(d).some(isGame)) for (const s of [...live(d).filter((y: any) => y.sport === 'strength')]) {
        if (!movable(s, d.date)) continue;
        let nx = minOf(s) > 30 ? scaled(s, 28 / minOf(s)) : { ...s };
        if (!nx) nx = { ...s };
        const tip = 'Am Spieltag kurz halten (höchstens 30 min) und nicht direkt vor dem Spiel: vormittags oder nach dem Spiel.';
        if (!String(nx.description || '').includes(tip)) nx = { ...nx, description: `${nx.description || ''}\n${tip}`.trim(), tip };
        setS(d, s, nx); if (minOf(s) > 30) fixes.push(`${d.date}: ${s.title} → ${nx.plannedMinutes} min (Spieltag)`);
      }
    }
  }
  // 9) harte Tage: nicht hintereinander, nicht vor Spiel oder Wettkampf, Tests nicht neben Spiel/Wettkampf
  for (let guard = 0; guard < 6; guard++) {
    const D = daysOf(weeks); let changed = false;
    const flex = (y: DayRef) => live(y.d).filter((s: any) => hardS(s) && movable(s, y.d.date) && s.spec && !s.stage);
    for (let i = 0; i < D.length && !changed; i++) {
      const x = D[i]; if (!inR(x.d.date) || !flex(x).length) continue;
      const nx = at(D, i, 1), pv = at(D, i, -1);
      // vor Spiel/Wettkampf: dieser Tag; zwei harte Tage: der spätere, wenn er sich ändern lässt; nach festem hartem Tag: dieser Tag
      let target: DayRef | null = null;
      if (nx && eventDay(nx.d)) target = x;
      else if (nx && hardDay(nx.d)) target = flex(nx).length ? nx : x;
      else if (pv && hardDay(pv.d) && !flex(pv).length) target = x;
      else if (pv && eventDay(pv.d) && flex(x).some(isTestS)) target = x;
      if (!target) continue;
      const s = flex(target).sort((a: any, b: any) => +isTestS(b) - +isTestS(a))[0];
      if (!s) continue;
      const ti = D.indexOf(target);
      if (isTestS(s)) {
        // Test an einen anderen Tag der Woche (gleiche Sportart, frei von harten Nachbarn), sonst locker
        const js = D.map((y, j) => ({ y, j })).filter(({ y, j }) => y.w === target.w && j !== ti);
        let moved = false;
        for (const { y, j } of js) {
          const same = live(y.d).find((z: any) => z.sport === s.sport && movable(z, y.d.date) && !hardS(z) && !isLongS(z));
          if (!same) continue;
          const pj = at(D, j, -1), nj = at(D, j, 1);
          if (hardDay(y.d) && !live(y.d).filter(hardS).every((z: any) => z === same)) continue;
          if ((pj && pj !== target && hardDay(pj.d)) || (nj && nj !== target && (hardDay(nj.d) || eventDay(nj.d))) || (pj && eventDay(pj.d)) || (pj && bigDay(pj.d).big)) continue;
          setS(y.d, same, s); setS(target.d, s, same); fixes.push(`${s.title}: ${target.d.date} → ${y.d.date} (nicht neben Spiel, Wettkampf oder harter Einheit)`); moved = true; break;
        }
        if (!moved) { const e = easyShortOf(s, minOf(s), 'Test verschoben: direkt neben einem Spiel, Wettkampf oder harten Tag liefert er keine guten Werte.', target.w.phase); if (e) { setS(target.d, s, e); fixes.push(`${target.d.date}: ${s.title} → ${e.title} (Test nicht neben Spiel/Wettkampf)`); } else continue; }
      } else { setS(target.d, s, { ...easyOf(s, target.w.phase), ...(isLongS(s) ? { long: true } : {}), ruleNote: 'Locker: der Tag daneben ist hart (Spiel, Wettkampf oder harte Einheit).' }); fixes.push(`${target.d.date}: ${s.title} locker (harter Tag daneben)`); }
      changed = true;
    }
    if (!changed) break;
  }
  // 10) unter 18: Wochenstunden höchstens so viele wie das Alter
  for (const w of weeks) {
    const age = ageOf(p, w.startDate); if (age == null || age >= 18 || !fullWeek(w, o.from)) continue;
    const all = (w.days || []).flatMap((d: any) => live(d).filter((s: any) => !s.race).map((s: any) => ({ d, s })));
    const tot = all.reduce((a: number, { s }: any) => a + minOf(s), 0); if (tot <= age * 60) continue;
    const flex = all.filter(({ d, s }: any) => movable(s, d.date) && s.spec && !s.stage && !isTestS(s));
    const flexMin = flex.reduce((a: number, { s }: any) => a + minOf(s), 0); if (!flexMin) continue;
    const f = Math.max(0.5, 1 - (tot - age * 60 + 5) / flexMin);
    for (const { d, s } of flex) { const nx = scaled(s, f); if (nx && nx.plannedMinutes < minOf(s)) setS(d, s, nx); }
    fixes.push(`Woche ${w.weekNumber}: kürzer (unter 18 höchstens ${age} h pro Woche)`);
  }
  // 11) Ruhetage: mindestens 1 (unter 18 und Einsteiger 2) – einen Tag freimachen, Einheiten verschieben, sonst lockere weglassen.
  //     Was wegfällt, kostet: Minuten (Sportart des Zyklus-Ziels 1,5-fach, Lernstufen mehr), dazu ein Aufschlag, wenn die gewünschte Häufigkeit dann fehlt.
  const goalSport = (w: any) => { const t = cycleType(w, w.startDate, races, o); return isRunGoal(t) ? 'run' : t === 'bike_event' ? 'bike' : t === 'swim_goal' ? 'swim' : ''; };
  /* Minuten einer weggefallenen lockeren Einheit an eine andere lockere Einheit derselben Sportart in der Woche geben (Umfang bleibt) */
  const absorb = (w: any, from: any, s: any): string | null => {
    let left = minOf(s); if (!left || !s.spec || s.stage) return null;
    const got: string[] = [];
    // auf mehrere Einheiten derselben Sportart verteilen (je höchstens +60 %, Laufen höchstens 75 min, lange Einheiten bis +10 min)
    for (const d of (w.days || []).filter((x: any) => x !== from)) for (const y of [...live(d)]) {
      if (left < 5) break;
      if (y.sport !== s.sport || hardS(y) || isTestS(y) || y.stage || !y.spec || !movable(y, d.date) || isBrick(y) || y.adjacentOk || isLongS(y) || y.ruleNote) continue;
      { const D0 = daysOf(weeks); const k = D0.findIndex(x => x.d === d); const pv = k >= 0 ? at(D0, k, -1) : null; if (pv && bigDay(pv.d).big) continue; }
      const room0 = Math.min(minOf(y) * 0.6, y.sport === 'run' ? 75 - minOf(y) : Infinity);
      const cap = o.dayCap ? o.dayCap(d.date) - (dayMin(d) - live(d).filter((z: any) => z.sport === 'football').reduce((a: number, z: any) => a + minOf(z), 0)) : Infinity;
      const add = Math.floor(Math.min(left, room0, cap) / 5) * 5; if (add < 5) continue;
      const nx = scaled(y, (minOf(y) + add) / minOf(y)); if (!nx || nx.plannedMinutes <= minOf(y) || nx.plannedMinutes - minOf(y) > Math.min(left, cap) + 2 || (o.allowed && !o.allowed(nx, d.date))) continue;
      left -= nx.plannedMinutes - minOf(y); setS(d, y, nx); got.push(nx.title);
    }
    return got.length ? got.join(', ') : null;
  };
  const dropCost = (w: any, s: any) => { const n = (w.days || []).reduce((a: number, d: any) => a + live(d).filter((y: any) => y.sport === s.sport && !isBrick(y)).length, 0); const f = ((p.freq || {}) as any)[s.sport];
    return minOf(s) * (goalSport(w) === s.sport ? 1.5 : 1) + (s.stage ? 120 : 0) + (f && n - 1 < f[0] ? 60 : 0) + (n <= 1 ? 100 : 0); };
  let restDow: number | null = null; // möglichst jede Woche derselbe Ruhetag
  for (const w of weeks) {
    if (!fullWeek(w, o.from)) continue;
    for (let guard = 0; guard < 3; guard++) {
      const need = restNeed(w, p);
      const rd = (w.days || []).filter((d: any) => !live(d).length);
      if (rd.length >= need) { if (rd.length && restDow == null) restDow = dowOf(rd[0].date); break; }
      const D = daysOf(weeks);
      const opts: { d: any; cost: number; pref: number; plan: () => void; label: string }[] = [];
      for (const d of w.days || []) {
        const L = live(d); if (!L.length || L.some((s: any) => !movable(s, d.date))) continue;
        // ausprobieren (mit Rückgängig): verschieben, was geht; was nicht geht, fällt weg (nur Lockeres)
        const snap = new Map<any, any[]>(); (w.days || []).forEach((x: any) => snap.set(x, [...x.sessions]));
        let cost = 0; const log: string[] = [];
        for (const s of [...L].sort((a: any, b: any) => +isLongS(b) - +isLongS(a) || +hardS(b) - +hardS(a) || minOf(b) - minOf(a))) {
          const i = D.findIndex(y => y.d === d);
          const t = D.map((y, j) => ({ y, j })).filter(({ y, j }) => y.w === w && j !== i).find(({ j }) => canPlace(D, s, j, { noRest: true }));
          if (t) { moveTo(d, t.y.d, s); log.push(`${s.title}: ${d.date} → ${t.y.d.date}`); if (isLongS(s) || hardS(s)) cost += 40; }
          else if (!isLongS(s) && !hardS(s) && !isTestS(s)) { const c0 = dropCost(w, s); removeS(d, s); const ab = absorb(w, d, s); cost += ab ? c0 * 0.4 : c0; log.push(ab ? `${d.date}: ${s.title} entfällt, Minuten zu ${ab}` : `${d.date}: ${s.title} entfällt`); }
          else { cost = Infinity; break; }
        }
        const i = D.findIndex(y => y.d === d); const pv = at(D, i, -1), nx = at(D, i, 1);
        const pref = (pv && (hardDay(pv.d) || bigDay(pv.d).big) ? 2 : 0) + (nx && eventDay(nx.d) ? 2 : 0) + (nx && hardDay(nx.d) ? 1 : 0);
        (w.days || []).forEach((x: any) => { x.sessions = snap.get(x); });
        if (cost < Infinity) opts.push({ d, cost, pref, label: log.join('; '), plan: () => {
          for (const s of [...live(d)].sort((a: any, b: any) => +isLongS(b) - +isLongS(a) || +hardS(b) - +hardS(a) || minOf(b) - minOf(a))) {
            const D2 = daysOf(weeks); const i2 = D2.findIndex(y => y.d === d);
            const t = D2.map((y, j) => ({ y, j })).filter(({ y, j }) => y.w === w && j !== i2).find(({ j }) => canPlace(D2, s, j, { noRest: true }));
            if (t) moveTo(d, t.y.d, s); else { removeS(d, s); absorb(w, d, s); w.restDropped = [...new Set([...(w.restDropped || []), s.sport])]; }
          } } });
      }
      // der zweite Ruhetag nur, wenn dafür nichts wegfällt (nur verschieben)
      if (rd.length >= 1) for (let k = opts.length - 1; k >= 0; k--) if (opts[k].cost > 0) opts.splice(k, 1);
      if (!opts.length) break;
      // möglichst wenig wegfallen lassen; bei Gleichstand der Tag zwischen/vor harten Tagen, dann der kürzeste
      opts.sort((a, b) => a.cost - b.cost || b.pref - a.pref || dayMin(a.d) - dayMin(b.d));
      const best = opts.find(x => restDow != null && dowOf(x.d.date) === restDow && x.cost <= opts[0].cost + 40) || opts[0]; best.plan(); restDow = dowOf(best.d.date);
      w.restDays = (w.restDays || 0) + 1;
      fixes.push(`Woche ${w.weekNumber}: Ruhetag ${fmt(best.d.date)} (${best.label || 'frei'})`);
    }
  }
  return fixes;
}

/* Darf an diesem Tag etwas Hartes liegen? (für andere Korrekturen, z. B. fehlende Intensität) */
export function hardBlocked(weeks: any[], date: string, goals: Goal[] = []): boolean {
  const D = daysOf(weeks); const i = D.findIndex(x => x.d.date === date); if (i < 0) return false;
  const pv = at(D, i, -1), nx = at(D, i, 1); const w = D[i].w;
  if (w.isRecoveryWeek || w.phase === 'race') return true;
  if (pv && (bigDay(pv.d).big || eventDay(pv.d))) return true;
  if (nx && eventDay(nx.d)) return true;
  for (const r of racesOf(weeks, goals)) { const k = diffD(r.date, date); if ((k > 0 && k <= (r.type ? easyAfterDays(r.type) : 3)) || (r.priority !== 'C' && k < 0 && k >= -6)) return true; }
  return false;
}

/* Auftrag 18, Punkt 6: Warum ist an diesem Tag frei? (für den Regel-Coach und die Plan-Ansicht) */
export function restDayReason(weeks: any[], date: string, p: Profile | null = null, goals: Goal[] = []): string | null {
  const D = daysOf(weeks); const i = D.findIndex(x => x.d.date === date); if (i < 0 || live(D[i].d).length) return null;
  const pv = at(D, i, -1), nx = at(D, i, 1); const w = D[i].w;
  const title = (y: DayRef | null, f: (s: any) => boolean) => y ? (live(y.d).find(f) || {}).title : null;
  const why: string[] = [];
  for (const r of racesOf(weeks, goals)) { const k = diffD(r.date, date); if (k > 0 && k <= (r.type ? easyAfterDays(r.type) : 3)) why.push(`du erholst dich von ${r.name} (${k === 1 ? 'gestern' : `vor ${k} Tagen`})`); else if (k === -1 || k === -2) why.push(`${k === -1 ? 'morgen' : 'übermorgen'} ist ${r.name}`); }
  if (pv && eventDay(pv.d)) why.push(`gestern war ${title(pv, (s: any) => s.race || isGame(s)) || 'ein Spiel'}`);
  else if (pv && bigDay(pv.d).big) why.push(`gestern war ein langer Tag (${Math.round(dayMin(pv.d) / 6) / 10} h${live(pv.d).some(isBrick) ? ' mit Koppellauf' : ''})`.replace('.', ','));
  else if (pv && hardDay(pv.d)) why.push(`gestern war ${title(pv, hardS)}`);
  if (nx && eventDay(nx.d)) why.push(`morgen ist ${title(nx, (s: any) => s.race || isGame(s))}`);
  else if (nx && hardDay(nx.d)) why.push(`morgen steht ${title(nx, hardS)} an`);
  if (w && w.isRecoveryWeek) why.push('es ist Erholungswoche');
  const minor = p ? (ageOf(p, date) ?? 30) < 18 : false;
  const head = `Am ${fmt(date)} ist Ruhetag${why.length ? ': ' + why.slice(0, 3).join(', ') : ''}.`;
  return `${head} Mindestens ein freier Tag pro Woche gehört fest in den Plan: In der Pause passt sich der Körper an das Training an und wird stärker.${minor ? ' Für Jugendliche sind 1-2 freie Tage pro Woche empfohlen.' : ''} Lockeres Bewegen (Spaziergang, Mobility) ist okay.`;
}
