/* Fester Wochenaufbau (Auftrag 8): Wer einen festen Wochenrhythmus hat (z. B. Di Schwimmen + Kraft, Mi Rad, Do Lauf, Sa Schwimmen + lange
   Ausfahrt, So langer Lauf), bekommt jede Woche genau diese Einheiten. Die Dauer kommt aus der Wochenvorgabe (Stunden, langer Lauf,
   lange Ausfahrt, Schwimmen) oder – nach der letzten Vorgabe – aus den Regeln: Aufbauwoche +8-10 %, langer Lauf höchstens +10 min pro
   Woche und nie über die Obergrenze, Erholungswoche etwa 65 %. Tests ersetzen die passenden Einheiten (Lauftest den langen Lauf).
   Was nicht genau passt, gleichen die flexiblen Einheiten aus (Rad unter der Woche, lockerer Lauf, lange Ausfahrt innerhalb der Spanne). */
import type { WeekPattern, WeekTarget, PatternSlot } from './profile';
import * as W from './workouts';
import * as K from './keysessions';
import type { GoalType } from './goals';
import { LIB, pickQuality } from './workoutlib';
import { markExcuse } from './planrules';
import { swimQuality, bikeEasyForm, bikeQualitySpec, noFast } from './workoutbuild';

/* Auftrag 19: lange Ausfahrt mit Sweet-Spot-Block (die Rad-Qualität der Woche, wenn ihr Tag frei ist): erst locker, dann der Block, locker zu Ende */
function bikeLongSweetSpot(ctx: W.PaceCtx, min: number, n: number): W.Spec {
  const ss = bikeQualitySpec('bike.sweetspot', Math.min(4, n), ctx, null, { total: 75 })!;
  const hq0 = ss.steps.find(x => x.part === 'main')!; const hq: W.Step = { ...hq0, reps: hq0.reps || 1 };
  while ((hq.reps || 1) > 1 && (hq.reps || 1) * (hq.min || 10) + ((hq.reps || 1) - 1) * (hq.restMin || 5) > min - 40) hq.reps = (hq.reps || 1) - 1;
  if ((hq.min || 10) * (hq.reps || 1) > min - 40) hq.min = Math.max(10, Math.floor((min - 40) / 5) * 5);
  const q = (hq.reps || 1) * (hq.min || 10) + ((hq.reps || 1) - 1) * (hq.restMin || 5); const easy = Math.max(10, min - 15 - q - 10);
  const before = Math.max(10, r5(easy * 0.4)), after = Math.max(5, easy - before);
  return { sport: 'bike', kind: 'longq', ctx, noDistance: !!ctx.indoor, lib: { key: 'bike.sweetspot', stage: Math.min(4, n) }, why: 'Die Rad-Qualität der Woche als Sweet-Spot-Block in der langen Ausfahrt: erst locker, dann der Block, locker zu Ende fahren.',
    steps: [{ part: 'warm', min: 15, zone: 1 }, { part: 'main', min: before, zone: 2 }, hq, { part: 'main', min: after, zone: 2, note: 'locker zu Ende fahren, essen und trinken' }, { part: 'cool', min: 10, zone: 1 }] };
}

export type TestSport = 'run' | 'swim' | 'bike';
// höchstens 90 min mit Ein- und Ausrollen
export const SS_LADDER: [number, number][] = [[3, 8], [3, 12], [2, 20], [3, 15], [2, 25], [2, 30]];
const r5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);
const mid = (r: [number, number]) => (r[0] + r[1]) / 2;

/** Was von Woche zu Woche weitergetragen wird */
export interface PatternState { longRun: number; longBike: number; swim: number; keyWeeks: number; strideWeeks: number; brickWeeks: number; lastTestMon: string | null;
  /** Laufminuten der letzten Aufbauwoche: Laufen steigt höchstens um inc */ runRef?: number | null;
  /** tatsächlich geplanter Umfang der letzten Aufbauwoche (Minuten): Erholung und Tapering richten sich danach */ buildOwn?: number | null;
  /** Schwellen-Leiter in der wettkampfspezifischen Phase */ thrWeeks?: number;
  /** Schlüsseleinheiten Rad und Qualitätsläufe je Phase, Wochenzähler (Abwechslung) und Woche im Block (seit der letzten Erholung) */
  keyN?: Record<string, number>; runQN?: Record<string, number>; weekN?: number; blockWeek?: number;
  /** Auftrag 17: Wochen seit dem letzten Koppellauf (Koppel nur jede 2.-3. Woche) */ sinceBrick?: number;
  /** Auftrag 17: Tests, die in die nächste passende Woche verschoben wurden */ carryTests?: string[];
  /** Auftrag 19: Schwimm-Qualität je Phase; Wochen seit dem letzten Tempo im langen Lauf */ swimQN?: Record<string, number>; longQAgo?: number | null }
export interface PatternWeekIn {
  mon: string; dates: string[]; recovery: boolean; entry: boolean;
  /** eigenes Training dieser Woche (Minuten, ohne Teamsport) */
  ownMin: number; target: WeekTarget | null; tests: Set<TestSport>;
  run: W.PaceCtx; bikeOut: W.PaceCtx; bikeIn: W.PaceCtx; swim: W.PaceCtx;
  swimStage: { ladder: 'swim' | 'swimBreast'; n: number; breast?: boolean } | null;
  /** erlaubte Steigerung pro Woche (z. B. 1.1) */ inc?: number;
  /** Phase der Woche im Makrozyklus und Obergrenzen der langen Einheiten (Distanz des nächsten Ziels, Jahreszeit, Alter) */
  phase?: 'base' | 'build' | 'specific' | 'taper' | 'race'; caps?: { run: number; bikeOut: number; swim: number };
  /** Ziel des Zyklus (Art der Schlüsseleinheiten), harte feste Tage (Spiel, Wettkampf), lockere Tage nach einem Wettkampf, unter 18 */
  goalType?: GoalType; hardDows?: number[]; easyDates?: string[]; minor?: boolean;
  /** 400 m Kraul am Stück geschafft: CSS-Test statt Kraul-Check */
  crawl400: boolean;
  /** längstes Kraul-Stück im normalen Training (Strecke am Stück, Auftrag 11) */ repMax?: number;
  strength: { knee?: boolean; back?: boolean; shoulder?: boolean };
  goalName: string;
  /** Auftrag 14: Niveau, Woche in der Grundlage, keine Zone 5 (unter 18, ab 60) */
  level?: 'beginner' | 'advanced' | 'experienced'; baseWeek?: number; noZ5?: boolean;
  /** höchstens so viele harte Tage (Spiele und Wettkämpfe zählen mit) */ maxHard?: number;
  /** Auftrag 17: Tempo-Teil im langen Lauf erlaubt (letzte 8 Wochen vor einem Laufziel, jede 2. Woche) */ longQOk?: boolean;
  /** Auftrag 19: Text für Einheiten am Morgen (z. B. „vor der Schule“) */ morningLabel?: string;
}
export interface PatternItem { dow: number; s: any; long?: boolean; test?: boolean; hard?: boolean; strength?: boolean }

export function targetFor(p: WeekPattern, mon: string): WeekTarget | null { return (p.targets || []).find(t => t.start === mon) || null; }

/* Tests dieser Woche: aus der Vorgabe, sonst alle testEveryWeeks Wochen in der Erholungswoche (nach dem letzten Test) */
export function testsFor(p: WeekPattern, mon: string, recovery: boolean, st: PatternState): Set<TestSport> {
  const t = targetFor(p, mon);
  if (t) return new Set(t.tests || []);
  const every = p.testEveryWeeks || 0;
  if (!every || !recovery || !st.lastTestMon) return new Set();
  const weeks = Math.round((+new Date(mon + 'T12:00:00Z') - +new Date(st.lastTestMon + 'T12:00:00Z')) / 86400000 / 7);
  return weeks >= every ? new Set<TestSport>(['swim', 'bike', 'run']) : new Set();
}

export function patternWeek(p: WeekPattern, inp: PatternWeekIn, st: PatternState): PatternItem[] {
  const t = inp.target;
  // Erholung, Tapering und Wettkampfwoche: vom tatsächlich erreichten Umfang der letzten Aufbauwoche aus (nicht vom Ziel-Umfang)
  if (!t && st.buildOwn) { const f = inp.phase === 'race' ? 0.5 : inp.phase === 'taper' ? 0.65 : inp.recovery ? 0.65 : 0; if (f) inp = { ...inp, ownMin: Math.min(inp.ownMin, Math.round(st.buildOwn * f)) }; }
  const dateOf = (sl: PatternSlot) => inp.dates[(sl.dow + 6) % 7];
  // Auftrag 19: Erholungswoche mit festen Ruhetagen (z. B. Mi und So); ein Tag im Wechsel frei (restEvery, die Qualität wandert an qualityTo);
  // Einheiten nur jede n-te Woche (every, z. B. Koppellauf jede 3. Woche); Tests nur, wenn ihr Tag in dieser Woche nicht frei ist
  const bwk = st.blockWeek || 0;
  const offWeek = (sl: PatternSlot) => !!sl.restEvery && !inp.recovery && inp.phase !== 'race' && bwk % sl.restEvery === sl.restEvery - 1;
  const movedQ = p.slots.filter(sl => (!sl.from || dateOf(sl) >= sl.from) && offWeek(sl) && sl.qualityTo != null && (!sl.keyFrom || dateOf(sl) >= sl.keyFrom));
  const slots = p.slots.filter(sl => (!sl.from || dateOf(sl) >= sl.from) && !offWeek(sl) && !(inp.recovery && (p.recoveryRest || []).includes(sl.dow))
    && !(sl.every && sl.every > 1 && (st.sinceBrick == null ? false : st.sinceBrick < sl.every - 1) && sl.role === 'brick'));
  const lrMax = p.longRunMax || 999, lrStep = p.longRunStep || 10;
  const ladder = p.ssLadder && p.ssLadder.length ? p.ssLadder : SS_LADDER;
  const rec = inp.recovery;
  // Ziele der langen Einheiten
  const ph = inp.phase || 'base';
  const capRun = Math.min(lrMax, inp.caps ? inp.caps.run : 999), capBike = inp.caps ? inp.caps.bikeOut : 999;
  const longRun = t && t.longRun ? r5(mid(t.longRun)) : ph === 'race' ? r5(Math.min(40, st.longRun * 0.4)) : ph === 'taper' ? r5(st.longRun * 0.6) : rec ? r5(st.longRun * 0.65) : Math.min(capRun, st.longRun + lrStep);
  // lange Ausfahrt ohne Vorgabe: höchstens +15 min pro Woche, vorerst nicht über 4 h
  const lb = (f: number): [number, number] => [r5(Math.min(capBike, st.longBike) * f), r5(Math.min(capBike, st.longBike) * f)];
  const longBikeR: [number, number] = t && t.longBike ? [...t.longBike] as [number, number] : ph === 'race' ? lb(0.4) : ph === 'taper' ? lb(0.6) : rec ? lb(0.6) : [Math.min(capBike, st.longBike), Math.min(capBike, st.longBike + 15)];
  // Schwimmen wird mit dem Können und dem Ziel länger (bis zur Obergrenze), in Erholung und Tapering kürzer
  const swimMin = t && t.swim ? r5(mid(t.swim)) : rec || ph === 'taper' || ph === 'race' ? 40 : Math.min(inp.caps ? inp.caps.swim : 60, st.swim + 5);
  const swimDays = slots.filter(sl => sl.role === 'swim').map(sl => sl.dow);
  const bikeTestDow = inp.tests.has('bike') ? (slots.find(sl => sl.sport === 'bike' && sl.role !== 'long' && !sl.am) || { dow: -1 }).dow : -1;
  // Tests ohne passenden Tag in dieser Woche (z. B. Ruhetage in der Erholungswoche) kommen in die nächste passende Woche
  const unplaced: TestSport[] = [];
  if (inp.tests.has('bike') && bikeTestDow < 0) unplaced.push('bike');
  if (inp.tests.has('run') && !slots.some(sl => sl.sport === 'run' && sl.role === 'long')) unplaced.push('run');
  if (inp.tests.has('swim') && !slots.some(sl => sl.role === 'swim')) unplaced.push('swim');
  if (unplaced.length) { const ts = new Set(inp.tests); unplaced.forEach(x => ts.delete(x)); inp = { ...inp, tests: ts }; }
  const bikeTestDow0 = bikeTestDow;
  const out: (PatternItem & { slot: PatternSlot; adj?: [number, number]; make?: (min: number) => W.Spec; min?: number })[] = [];
  const goal: GoalType = inp.goalType || 'tri_olympic';
  const easyDay = (d: string) => !!inp.easyDates && inp.easyDates.includes(d);
  // Qualitätslauf (Aufbau, spezifisch, Tapering): an einem Lauftag, der nicht zwischen zwei harten Tagen liegt; sonst im langen Lauf
  let runQ = !rec && !inp.entry && ph !== 'race' && !inp.tests.has('run') ? K.runQualityStep(ph, goal, (st.runQN || {})[ph] || 0, !!inp.minor, { noZ5: inp.noZ5, baseWeek: inp.baseWeek, level: inp.level }) : null;
  // Auftrag 14: harte Tage nach Niveau und Alter; reicht es nur für eine Qualität neben den Spielen, wechseln sich Rad und Lauf ab
  // (Grundlage: das Rad, Tempolauf entfällt)
  // Auftrag 17: ein harter Test (Rad, Lauf) zählt wie eine harte Einheit
  const budget = (inp.maxHard ?? 3) - (inp.hardDows || []).length - (inp.tests.has('run') ? 1 : 0);
  const runSlots = slots.filter(x => x.sport === 'run' && x.role !== 'brick');
  const longRunSlot = runSlots.find(x => x.role === 'long');
  const keySlot0 = slots.find(x => x.sport === 'bike' && x.role === 'key' && (!x.keyFrom || dateOf(x) >= x.keyFrom));
  // Auftrag 17: Platz für den Qualitätslauf: ein Lauftag ohne harten Nachbartag, sonst der lange Lauf – dort aber nur in den letzten
  // 8 Wochen vor einem Laufziel und nur jede 2. Woche (inp.longQOk). Gibt es keinen Platz, entfällt er (und nimmt dem Rad nichts weg).
  // Auftrag 19: ausdrücklich gewünschter Qualitätslauf unter der Woche (pin, ab qualityFrom): auch am Tag vor einem Spiel, dann aber nur
  // kontrolliert (Zone 3, z. B. Halbmarathon-Tempo) und nie direkt nach einem harten Tag (also in der Woche, in der der harte Tag davor frei ist)
  const pinQ = runSlots.find(x => x.role !== 'long' && !!x.pin && !!x.qualityFrom && dateOf(x) >= x.qualityFrom);
  const qDayFor = (withKey: boolean) => {
    const hd = new Set<number>([...(inp.hardDows || []), ...(withKey && keySlot0 && !rec && !inp.entry ? [keySlot0.dow] : []), ...(bikeTestDow0 >= 0 ? [bikeTestDow0] : [])]);
    if (pinQ && !hd.has((pinQ.dow + 6) % 7) && !hd.has(pinQ.dow)) return pinQ.dow;
    const free = runSlots.find(x => x.role !== 'long' && (!x.qualityFrom || dateOf(x) >= x.qualityFrom) && !hd.has((x.dow + 6) % 7) && !hd.has((x.dow + 1) % 7) && !hd.has(x.dow));
    // Tempo im langen Lauf: nur im Fenster vor einem Laufziel, nie zwei Wochen hintereinander, erst ab tempoFrom
    const lqOk = !!longRunSlot && !!inp.longQOk && (st.longQAgo == null || st.longQAgo >= Math.max(1, (longRunSlot.tempoEvery || 2) - 1)) && (!longRunSlot.tempoFrom || dateOf(longRunSlot) >= longRunSlot.tempoFrom);
    return free ? free.dow : lqOk && !hd.has((longRunSlot!.dow + 6) % 7) && !hd.has((longRunSlot!.dow + 1) % 7) ? longRunSlot!.dow : -1;
  };
  let keyOk = budget > 0;
  if (budget <= 0) runQ = null;
  else if (budget === 1 && runQ) { if (ph === 'base' || ((st.runQN || {})[ph] || 0) >= ((st.keyN || {})[ph] || 0) || qDayFor(false) < 0) runQ = null; else keyOk = false; }
  if (runQ && qDayFor(keyOk) < 0) runQ = null;
  const keySlot = keyOk ? keySlot0 : undefined;
  const hardDays = new Set<number>([...(inp.hardDows || []), ...(keySlot && !rec && !inp.entry ? [keySlot.dow] : []), ...(bikeTestDow0 >= 0 ? [bikeTestDow0] : [])]);
  const qDay = runQ ? qDayFor(keyOk) : -1;
  // Auftrag 19: liegt am Tag nach der langen Ausfahrt Tempo im langen Lauf oder ein Lauftest, bleibt der Tag unter 2,5 h (sonst wird er
  // später gekürzt und die Minuten fehlen); den Rest der Woche gleichen die anderen Einheiten aus
  const lbSlot = slots.find(x => x.sport === 'bike' && x.role === 'long');
  if (lbSlot && longRunSlot && (longRunSlot.dow === (lbSlot.dow + 1) % 7) && ((runQ && qDay === longRunSlot.dow) || inp.tests.has('run'))) {
    const same = slots.filter(x => x.dow === lbSlot.dow && x.role === 'swim').length ? swimMin : 0;
    const cap = Math.max(60, r5(150 - same - 5)); longBikeR[0] = Math.min(longBikeR[0], cap); longBikeR[1] = Math.min(longBikeR[1], cap);
  }
  const why = (k: string) => k;
  for (const sl of slots) {
    const date = dateOf(sl);
    if (sl.role === 'swim') {
      const first = sl.dow === swimDays[0];
      if (first && inp.tests.has('swim')) {
        const spec = inp.crawl400 ? W.swimTest(inp.swim) : W.swimCheck(inp.swim, inp.swimStage, swimMin);
        // der Kraul-Check ist kein harter Test (der CSS-Test schon)
        out.push({ dow: sl.dow, slot: sl, s: null, test: true, soft: !inp.crawl400, make: () => spec } as any);
        continue;
      }
      const base = (min: number) => inp.swimStage ? W.swimLearn(inp.swim, { ...inp.swimStage, breast: inp.swimStage.breast }, inp.swimStage.ladder === 'swimBreast' ? 'Brust bringt Ausdauer im Wasser, die Kraul-Technik kommt Schritt für Schritt dazu.' : 'Kraul-Technik in kurzen Stücken, Brust für die Ausdauer im Wasser.', min)
        : swimEndurance(inp.swim, min, first, ph, inp.repMax ?? 400, st.weekN || 0);
      // Auftrag 19: in einer von zwei Schwimmeinheiten ein kurzer harter Teil (Lernende: kurze schnelle Stücke, ab 200 m Schwellen-Sets,
      // ab 400 m CSS-Intervalle); die Technik bleibt in jeder Einheit
      const sq = first && !rec && !inp.entry && ph !== 'race' && !easyDay(date) ? pickQuality('swim', (st.swimQN || {})[ph] || 0, { ...K.libEnv(), phase: ph, goal, level: inp.level || 'advanced', noZ5: inp.noZ5, swimCont: inp.swimStage ? (W.SWIM_STAGE_M[inp.swimStage.n] || 25) : inp.repMax ?? 400, gear: inp.swim.gear || [] }) : null;
      const anyQ = !rec && !inp.entry && ph !== 'race';
      const make = (min: number) => { let v = K.fitSwim(K.swimVariant(base(min), (st.weekN || 0) + (first ? 0 : 1), st.blockWeek || 0, ph), min); if (!first && anyQ) v = K.fitSwim(noFast(v), min); return sq && sq.key !== 'swim.drills' ? swimQuality(sq.key, sq.stage, v, { repMax: inp.swimStage ? (W.SWIM_STAGE_M[inp.swimStage.n] || 25) : inp.repMax ?? 400, learner: !!inp.swimStage, minutes: min }) : v; };
      out.push({ dow: sl.dow, slot: sl, s: null, make, min: swimMin, adj: t && t.swim ? undefined : rec || ph === 'taper' || ph === 'race' ? [30, 40] : [40, inp.caps ? inp.caps.swim : 60] });
    } else if (sl.role === 'full') {
      // Auftrag 19: Kraft Ganzkörper (z. B. Di 30 min); vor der Rad-Qualität leichter
      const easy = (!!keySlot && !rec && !inp.entry && ((sl.dow + 1) % 7) === keySlot.dow) || (bikeTestDow >= 0 && ((sl.dow + 1) % 7) === bikeTestDow);
      const min = rec ? 25 : r5(mid(sl.min || [30, 30]));
      const spec = W.strengthSession(['run', 'bike', 'swim'], { light: rec || easy, minutes: min, ...inp.strength, why: 'Ganzkörper-Kraft: stabile Muskeln und Sehnen schützen vor Verletzungen und machen dich ökonomischer.' });
      spec.lib = { key: 'strength.full', stage: 0 };
      // genau die gewünschte Dauer (Aufwärmen + Übungen)
      { const mainS = spec.steps.find(x => x.part === 'main'); if (mainS) mainS.min = Math.max(10, min - 5); }
      if (easy) spec.tip = 'Morgen ist die Rad-Qualität bzw. der Test: Beine nur leicht, nichts Explosives.';
      out.push({ dow: sl.dow, slot: sl, s: null, strength: true, make: () => spec });
    } else if (sl.role === 'lower' || sl.role === 'upper') {
      const area = sl.role;
      // Tag vor dem Radtest: Unterkörper nur leicht (2 Sätze, nichts Explosives)
      // Auftrag 17: auch vor der Rad-Qualität nur leicht (die Beine sollen für den harten Tag frisch sein)
      const easy = area === 'lower' && ((bikeTestDow >= 0 && ((sl.dow + 1) % 7) === bikeTestDow) || (!!keySlot && !rec && !inp.entry && ((sl.dow + 1) % 7) === keySlot.dow));
      // Auftrag 17: im Aufbau und in der spezifischen Phase Kraft als Erhaltung (25-30 min)
      const min = easy ? 25 : rec ? 30 : ph === 'build' || ph === 'specific' ? Math.min(30, r5(mid(sl.min || [30, 35]))) : r5(mid(sl.min || [30, 35]));
      const spec = W.strengthArea(area, { ...inp.strength, light: rec && !easy, easy, minutes: min,
        why: area === 'lower' ? 'kräftige Beine und Hüfte schützen Knie, Leiste und Achillessehne und machen dich beim Laufen ökonomischer.' : 'Schultern und Rücken stark machen, das hilft beim Kraulen und schützt die Schulter.' });
      if (easy) spec.tip = bikeTestDow >= 0 && ((sl.dow + 1) % 7) === bikeTestDow ? 'Morgen ist der Radtest: nur 2 Sätze, nichts Explosives.' : 'Morgen ist die Rad-Qualität: nur 2 Sätze, nichts Explosives.';
      out.push({ dow: sl.dow, slot: sl, s: null, strength: true, make: () => spec });
    } else if (sl.sport === 'bike' && sl.role === 'long') {
      // Auftrag 19: ist der Tag der Rad-Qualität diese Woche frei (restEvery), kommt sie als Sweet-Spot-Block in die lange Ausfahrt – außer der
      // Qualitätslauf liegt schon am Tag vor dem Spiel (sonst drei harte Tage hintereinander)
      const mq = movedQ.find(x => x.qualityTo === sl.dow);
      const three = qDay >= 0 && !!runQ && (inp.hardDows || []).some(h => (qDay + 1) % 7 === h && (h + 1) % 7 === sl.dow);
      const ssIn = !!mq && !rec && !inp.entry && ph !== 'race' && ph !== 'taper' && !easyDay(date) && !three;
      const ssN = ((st.keyN || {})[ph] || 0) + (ph === 'base' ? st.keyWeeks : 0);
      out.push({ dow: sl.dow, slot: sl, s: null, long: true, hard: ssIn || undefined, pin: ssIn && !!mq!.pin, make: (min) => ssIn ? bikeLongSweetSpot(inp.bikeOut, min, ssN) : K.bikeLongVariant(W.bikeLong(inp.bikeOut, min), st.weekN || 0, ph, rec || !!inp.entry), min: r5(mid(longBikeR)), adj: longBikeR } as any);
    } else if (sl.sport === 'bike' && sl.am) {
      // Auftrag 19: lockeres Rad am Morgen (z. B. vor der Schule auf der Rolle, auch am Spieltag): Zone 1-2, zählt nicht als hart
      const range = sl.min || [30, 40];
      out.push({ dow: sl.dow, slot: sl, s: null, am: true, make: (min) => bikeEasyForm('bike.morning', 0, inp.bikeIn, min)!, min: rec ? range[0] : r5(mid(range)), adj: rec ? [range[0], range[0]] : [range[0], range[1]] } as any);
    } else if (sl.sport === 'bike') {
      if (sl.dow === bikeTestDow) { out.push({ dow: sl.dow, slot: sl, s: null, test: true, hard: true, make: () => W.bikeTest({ ...inp.bikeOut, indoor: false, bikeName: null }) }); continue; }
      const range = sl.min || [50, 75];
      const key = keyOk && sl.role === 'key' && !rec && !inp.entry && ph !== 'race' && (!sl.keyFrom || date >= sl.keyFrom);
      if (key && !easyDay(date)) {
        // Fortschritt je Phase: Sweet Spot/Kraftausdauer → Schwelle/Over-Unders → je Ziel VO2max, Schwelle, Wettkampftempo
        const n = ((st.keyN || {})[ph] || 0) + (ph === 'base' ? st.keyWeeks : 0);
        const core = W.totals(K.bikeKey(inp.bikeIn, ph, goal, n, undefined, { noZ5: inp.noZ5, level: inp.level })).min;
        out.push({ dow: sl.dow, slot: sl, s: null, hard: true, make: (min) => K.bikeKey(inp.bikeIn, ph, goal, n, min, { noZ5: inp.noZ5, level: inp.level }), min: Math.max(core, range[0]), adj: [core, Math.max(core, 90)] });
      } else out.push({ dow: sl.dow, slot: sl, s: null, make: (min) => W.bikeEasy(inp.bikeOut, min), min: rec ? range[0] : r5(mid(range)), adj: rec ? [range[0], range[1]] : [range[0], 90] });
    } else if (sl.sport === 'run' && sl.role === 'long') {
      if (inp.tests.has('run')) { out.push({ dow: sl.dow, slot: sl, s: null, test: true, hard: true, make: () => W.runTest(inp.run) }); continue; }
      const lq = runQ && qDay === sl.dow && !easyDay(date);
      out.push({ dow: sl.dow, slot: sl, s: null, long: true, hard: lq || undefined, pin: lq && !!sl.pin, make: (min) => lq ? K.longRunWithQuality(inp.run, min, runQ!.zone > 3 ? K.calmQuality(goal, (st.runQN || {})[ph] || 0, { noZ5: inp.noZ5 }) : runQ!) : W.runLong(inp.run, min), min: easyDay(date) ? r5(longRun * 0.6) : longRun } as any);
    } else if (sl.sport === 'run' && sl.role === 'brick') {
      // Auftrag 17: Koppel nur gezielt: im Aufbau jede 3., in der spezifischen Phase jede 2. Woche, kurz; nie in Grundlage, Erholung, Tapering
      if (rec || inp.entry || ph === 'taper' || ph === 'race' || ph === 'base' || easyDay(date) || /^run_/.test(goal)) continue; // Auftrag 18: vor einem Laufziel kein Koppellauf
      if (st.sinceBrick != null && st.sinceBrick < (ph === 'specific' ? 1 : 2)) continue;
      const min = sl.min ? (st.brickWeeks > 0 ? sl.min[1] : sl.min[0]) : ph === 'specific' ? 20 : st.brickWeeks > 0 ? 15 : 10;
      out.push({ dow: sl.dow, slot: sl, s: null, pin: !!sl.pin, make: () => { const sp = W.runEasy(inp.run, min); if (ph === 'specific') sp.steps[0].note = 'die mittleren 10 min im Wettkampftempo'; sp.title = `Koppellauf ${min} min (direkt nach dem Rad)`; sp.why = 'gewöhnt die Beine an den Wechsel vom Rad zum Laufen.'; sp.tip = 'Nur wenn du gut erholt bist (Ampel grün). Sonst weglassen, das ist kein Problem.'; return sp; } } as any);
    } else if (sl.sport === 'run') {
      const range = sl.min || [40, 50];
      const strides = !rec && !!sl.stridesFrom && date >= sl.stridesFrom ? (st.strideWeeks > 0 ? 6 : 4) : 0;
      const q = runQ && qDay === sl.dow && !easyDay(date);
      // Grundlage: im Wechsel Hügelsprints, Fahrtspiel, Steigerungen (sobald Steigerungen dran sind)
      // Auftrag 17: Hügelsprints oder kurze Intervalle nur ohne harten Nachbartag; zwischen zwei harten Tagen nur Steigerungen
      const variant = ph === 'base' && !rec && strides && !easyDay(date) && !hardDays.has((sl.dow + 6) % 7) && !hardDays.has((sl.dow + 1) % 7);
      // gewünschter Qualitätslauf am Tag vor einem Spiel: nur kontrolliert (Zone 3, Wettkampftempo wie Halbmarathon), nie Schwelle oder härter
      const beforeHard = (inp.hardDows || []).includes((sl.dow + 1) % 7);
      const rq = q && sl.pin && beforeHard && runQ!.zone > 3 ? K.calmQuality(goal, (st.runQN || {})[ph] || 0, { noZ5: inp.noZ5 }) : runQ;
      out.push({ dow: sl.dow, slot: sl, s: null, hard: q || undefined, pin: q && !!sl.pin, make: (min) => q ? K.runQuality(inp.run, rq!) : variant ? K.runBaseVariant(inp.run, min, st.weekN || 0) : W.runEasy(inp.run, min, { strides: easyDay(date) ? 0 : strides }), min: q ? W.totals(K.runQuality(inp.run, rq!)).min : rec ? Math.max(30, range[0] - 10) : r5(mid(range)), adj: q ? undefined : rec ? [Math.max(30, range[0] - 10), range[0]] : [range[0], range[1]] } as any);
    }
  }
  void why;
  // Auf die Wochenvorgabe ausgleichen: zuerst Rad unter der Woche, dann lockerer Lauf, dann lange Ausfahrt (innerhalb der Spanne)
  const total = () => out.reduce((a, x) => a + (x.min != null ? x.min : W.totals(x.make!(0)).min), 0);
  const order = [...out.filter(x => x.slot.sport === 'bike' && !x.long && x.adj), ...out.filter(x => x.slot.sport === 'run' && !x.long && x.adj), ...out.filter(x => x.long && x.slot.sport === 'bike'), ...out.filter(x => x.slot.role === 'swim' && x.adj)];
  for (let pass = 0; pass < 2; pass++) for (const x of order) {
    const diff = inp.ownMin - total(); if (Math.abs(diff) < 5) break;
    const [lo, hi] = x.adj!;
    x.min = r5(Math.max(lo, Math.min(hi, (x.min || 0) + diff)));
  }
  // Auftrag 17: liegt die Woche dann noch über dem Umfang (z. B. wegen der Obergrenze aus dem echten Training), werden auch die langen
  // Einheiten und das Schwimmen kürzer – nie unter sinnvolle Mindestlängen, Tests und Lernstufen bleiben
  {
    // in Erholungs- und Einstiegswochen dürfen die Einheiten kürzer werden als sonst
    const easyW = rec || !!inp.entry;
    const floor = (x: any) => x.long ? (x.slot.sport === 'bike' ? (easyW ? 45 : 60) : (easyW ? 35 : 45)) : x.slot.role === 'swim' ? (easyW ? 25 : 30) : x.slot.sport === 'bike' ? (easyW ? 30 : 40) : x.slot.sport === 'run' ? (easyW ? 25 : 30) : (x.min || 0);
    // zuerst die kurzen Einheiten unter der Woche, dann Schwimmen, zuletzt die langen Einheiten
    const cut = [...out.filter(x => !x.long && !x.test && (x.slot.sport === 'bike' || x.slot.sport === 'run') && x.adj), ...out.filter(x => x.slot.role === 'swim' && !x.test), ...out.filter(x => x.long && x.slot.sport === 'bike'), ...out.filter(x => x.long && x.slot.sport === 'run')];
    for (let pass = 0; pass < 3; pass++) for (const x of cut) {
      const over = total() - inp.ownMin; if (over <= 10) break;
      if (x.min == null) continue;
      // ausdrückliche Vorgaben der Woche (lange Ausfahrt, langer Lauf, Schwimmen) bleiben
      if (t && ((x.long && x.slot.sport === 'bike' && t.longBike) || (x.long && x.slot.sport === 'run' && t.longRun) || (x.slot.role === 'swim' && t.swim))) continue;
      const nx = r5(Math.max(floor(x), x.min - Math.min(over, x.min * 0.35)));
      if (nx < x.min) x.min = nx;
    }
  }
  // Laufen steigt höchstens um inc gegenüber der letzten Aufbauwoche: zuerst den lockeren Lauf kürzen (nicht unter 30 min)
  if (st.runRef && inp.inc && !rec) {
    const runMin = () => out.filter(x => x.slot.sport === 'run').reduce((a, x) => a + (x.min != null ? x.min : W.totals(x.make!(0)).min), 0);
    const easy = out.find(x => x.slot.sport === 'run' && !x.long && x.adj);
    const over = runMin() - (st.runRef * inp.inc + 4);
    if (easy && over > 0) easy.min = Math.max(30, r5((easy.min || 0) - over - 2));
    // was beim Laufen wegfällt, geht aufs Rad unter der Woche (bis 90 min)
    const bike = out.find(x => x.slot.sport === 'bike' && !x.long && x.adj);
    const diff = inp.ownMin - total();
    if (bike && diff > 5) bike.min = r5(Math.min(bike.adj![1], (bike.min || 0) + diff));
  }
  // Einheiten bauen
  const built = out.map(x => {
    const spec = x.make!(x.min || 0);
    const s = { ...W.build(spec), pattern: true };
    // lockere Formen der Bibliothek (Sprints, Kadenz-Übungen) sind keine harte Einheit, auch am Tag der Rad-Qualität
    const light = !!(spec.lib && LIB[spec.lib.key] && LIB[spec.lib.key].load === 'locker');
    if (x.hard && !light) s.hard = true;
    if ((x as any).soft) delete s.hard;
    if (x.long) s.long = true;
    // Auftrag 19: ausdrücklicher Wunsch aus dem Wochenraster (bleibt so, die Prüfung zeigt ihn als bewusste Ausnahme)
    if ((x as any).pin) s.pinned = 'Wochenraster';
    if ((x as any).am) { s.slot = 'am'; s.time = s.time || '06:30'; markExcuse(s, 'kurz und locker am Morgen, deshalb ist Rad am Tag davor oder danach in Ordnung.'); const when = `Morgens ${inp.morningLabel || 'vor der Schule'}, höchstens ${(x.slot.min || [30, 40])[1]} min.`; s.spec = { ...s.spec, when }; s.description = W.describe(s.spec); }
    return { dow: x.dow, s, long: x.long, test: x.test || spec.kind === 'test', hard: !(x as any).soft && ((x.hard && !light) || spec.kind === 'test'), strength: x.strength };
  });
  (built as any).phase = ph;
  (built as any).unplacedTests = unplaced;
  (built as any).offWeek = p.slots.some(sl => (!sl.from || dateOf(sl) >= sl.from) && offWeek(sl));
  return built;
}

/* Nach der Woche: lange Einheiten, Leiter und Tests für die nächste Woche merken */
export function advance(st: PatternState, items: PatternItem[], recovery: boolean, mon: string, tests: Set<TestSport>): PatternState {
  // recovery: auch Wiedereinstieg (die Woche ist kein Bezug für die Steigerung)
  const n = { ...st };
  const lr = items.find(x => x.long && x.s.sport === 'run'), lb = items.find(x => x.long && x.s.sport === 'bike');
  const sw = items.filter(x => x.s.sport === 'swim' && !x.test);
  if (!recovery) {
    if (lr) n.longRun = lr.s.plannedMinutes;
    if (lb) n.longBike = lb.s.plannedMinutes;
    if (sw.length) n.swim = r5(sw.reduce((a, x) => a + x.s.plannedMinutes, 0) / sw.length);
    const kn = { ...(n.keyN || {}) }, rq = { ...(n.runQN || {}) };
    if (items.some(x => x.s.sport === 'bike' && x.hard && !x.test)) kn[phaseOf(items)] = (kn[phaseOf(items)] || 0) + 1;
    if (items.some(x => x.s.sport === 'run' && x.hard && !x.test)) rq[phaseOf(items)] = (rq[phaseOf(items)] || 0) + 1;
    n.keyN = kn; n.runQN = rq;
    if (items.some(x => x.s.sport === 'run' && /Steigerungsläufe/.test(x.s.description || ''))) n.strideWeeks++;
    if (items.some(x => /^Koppellauf/.test(x.s.title || ''))) { n.brickWeeks++; n.sinceBrick = 0; } else if (n.sinceBrick != null) n.sinceBrick++;
    if (items.some(x => x.s.sport === 'bike' && ['threshold', 'overunder', 'intervals'].includes((x.s.spec && x.s.spec.kind) || ''))) n.thrWeeks = (n.thrWeeks || 0) + 1;
    n.buildOwn = items.filter(x => !['football', 'rest'].includes(x.s.sport) && !x.s.race).reduce((a, x) => a + (x.s.plannedMinutes || 0), 0) || n.buildOwn;
    // Woche mit Lauftest (statt langem Lauf) ist kein Bezug für den Laufumfang (Auftrag 17)
    if (!tests.has('run')) n.runRef = items.filter(x => x.s.sport === 'run').reduce((a, x) => a + (x.s.plannedMinutes || 0), 0) || n.runRef;
  }
  if (tests.size) n.lastTestMon = mon;
  // Auftrag 19: Schwimm-Qualität je Phase (Leiter) und Wochen seit dem letzten Tempo im langen Lauf (nie zwei Wochen hintereinander)
  if (!recovery && items.some(x => x.s.sport === 'swim' && x.s.spec && x.s.spec.lib && LIB[x.s.spec.lib.key] && LIB[x.s.spec.lib.key].quality)) n.swimQN = { ...(n.swimQN || {}), [phaseOf(items)]: ((n.swimQN || {})[phaseOf(items)] || 0) + 1 };
  n.longQAgo = items.some(x => x.s.sport === 'run' && x.s.spec && x.s.spec.kind === 'longq') ? 0 : n.longQAgo == null ? null as any : n.longQAgo + 1;
  n.weekN = (n.weekN || 0) + 1;
  n.blockWeek = recovery ? 0 : (n.blockWeek || 0) + 1;
  return n;
}

const phaseOf = (items: PatternItem[]) => (items as any).phase || 'base';
/* Schwimmen für alle, die schon kraulen können: Technik bzw. Ausdauer bis zur Zielzeit; ab Aufbau CSS-Intervalle in der zweiten Einheit */
function swimEndurance(ctx: W.PaceCtx, min: number, technique: boolean, phase = 'base', repMax = 400, n = 0): W.Spec {
  const css = !technique && (phase === 'build' || phase === 'specific') && !!ctx.css && repMax >= 400;
  return W.swimNormal(ctx, css ? 'css' : technique ? 'technique' : 'endurance', min, phase, repMax, n);
}
