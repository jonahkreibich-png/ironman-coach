/* Fester Wochenaufbau (Auftrag 8): Wer einen festen Wochenrhythmus hat (z. B. Di Schwimmen + Kraft, Mi Rad, Do Lauf, Sa Schwimmen + lange
   Ausfahrt, So langer Lauf), bekommt jede Woche genau diese Einheiten. Die Dauer kommt aus der Wochenvorgabe (Stunden, langer Lauf,
   lange Ausfahrt, Schwimmen) oder – nach der letzten Vorgabe – aus den Regeln: Aufbauwoche +8-10 %, langer Lauf höchstens +10 min pro
   Woche und nie über die Obergrenze, Erholungswoche etwa 65 %. Tests ersetzen die passenden Einheiten (Lauftest den langen Lauf).
   Was nicht genau passt, gleichen die flexiblen Einheiten aus (Rad unter der Woche, lockerer Lauf, lange Ausfahrt innerhalb der Spanne). */
import type { WeekPattern, WeekTarget, PatternSlot } from './profile';
import * as W from './workouts';

export type TestSport = 'run' | 'swim' | 'bike';
// höchstens 90 min mit Ein- und Ausrollen
export const SS_LADDER: [number, number][] = [[3, 8], [3, 12], [2, 20], [3, 15], [2, 25], [2, 30]];
const r5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);
const mid = (r: [number, number]) => (r[0] + r[1]) / 2;

/** Was von Woche zu Woche weitergetragen wird */
export interface PatternState { longRun: number; longBike: number; swim: number; keyWeeks: number; strideWeeks: number; brickWeeks: number; lastTestMon: string | null;
  /** Laufminuten der letzten Aufbauwoche: Laufen steigt höchstens um inc */ runRef?: number | null;
  /** tatsächlich geplanter Umfang der letzten Aufbauwoche (Minuten): Erholung und Tapering richten sich danach */ buildOwn?: number | null;
  /** Schwellen-Leiter in der wettkampfspezifischen Phase */ thrWeeks?: number }
export interface PatternWeekIn {
  mon: string; dates: string[]; recovery: boolean; entry: boolean;
  /** eigenes Training dieser Woche (Minuten, ohne Teamsport) */
  ownMin: number; target: WeekTarget | null; tests: Set<TestSport>;
  run: W.PaceCtx; bikeOut: W.PaceCtx; bikeIn: W.PaceCtx; swim: W.PaceCtx;
  swimStage: { ladder: 'swim' | 'swimBreast'; n: number; breast?: boolean } | null;
  /** erlaubte Steigerung pro Woche (z. B. 1.1) */ inc?: number;
  /** Phase der Woche im Makrozyklus und Obergrenzen der langen Einheiten (Distanz des nächsten Ziels, Jahreszeit, Alter) */
  phase?: 'base' | 'build' | 'specific' | 'taper' | 'race'; caps?: { run: number; bikeOut: number; swim: number };
  /** 400 m Kraul am Stück geschafft: CSS-Test statt Kraul-Check */
  crawl400: boolean;
  strength: { knee?: boolean; back?: boolean; shoulder?: boolean };
  goalName: string;
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
  const slots = p.slots.filter(sl => !sl.from || inp.dates[(sl.dow + 6) % 7] >= sl.from);
  const dateOf = (sl: PatternSlot) => inp.dates[(sl.dow + 6) % 7];
  const lrMax = p.longRunMax || 999, lrStep = p.longRunStep || 10;
  const ladder = p.ssLadder && p.ssLadder.length ? p.ssLadder : SS_LADDER;
  const rec = inp.recovery;
  // Ziele der langen Einheiten
  const ph = inp.phase || 'base';
  const capRun = Math.min(lrMax, inp.caps ? inp.caps.run : 999), capBike = inp.caps ? inp.caps.bikeOut : 999;
  const longRun = t && t.longRun ? r5(mid(t.longRun)) : ph === 'race' ? r5(Math.min(40, st.longRun * 0.4)) : ph === 'taper' ? r5(st.longRun * 0.6) : rec ? r5(st.longRun * 0.65) : Math.min(capRun, st.longRun + lrStep);
  // lange Ausfahrt ohne Vorgabe: höchstens +15 min pro Woche, vorerst nicht über 4 h
  const lb = (f: number): [number, number] => [r5(Math.min(capBike, st.longBike) * f), r5(Math.min(capBike, st.longBike) * f)];
  const longBikeR: [number, number] = t && t.longBike ? t.longBike : ph === 'race' ? lb(0.4) : ph === 'taper' ? lb(0.6) : rec ? lb(0.6) : [Math.min(capBike, st.longBike), Math.min(capBike, st.longBike + 15)];
  // Schwimmen wird mit dem Können und dem Ziel länger (bis zur Obergrenze), in Erholung und Tapering kürzer
  const swimMin = t && t.swim ? r5(mid(t.swim)) : rec || ph === 'taper' || ph === 'race' ? 40 : Math.min(inp.caps ? inp.caps.swim : 60, st.swim + 5);
  const swimDays = slots.filter(sl => sl.role === 'swim').map(sl => sl.dow);
  const bikeTestDow = inp.tests.has('bike') ? (slots.find(sl => sl.sport === 'bike' && sl.role !== 'long') || { dow: -1 }).dow : -1;
  const out: (PatternItem & { slot: PatternSlot; adj?: [number, number]; make?: (min: number) => W.Spec; min?: number })[] = [];
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
      const make = (min: number) => inp.swimStage ? W.swimLearn(inp.swim, { ...inp.swimStage, breast: inp.swimStage.breast }, inp.swimStage.ladder === 'swimBreast' ? 'Brust bringt Ausdauer im Wasser, die Kraul-Technik kommt Schritt für Schritt dazu.' : 'Kraul-Technik in kurzen Stücken, Brust für die Ausdauer im Wasser.', min)
        : swimEndurance(inp.swim, min, first);
      out.push({ dow: sl.dow, slot: sl, s: null, make, min: swimMin, adj: t && t.swim ? undefined : rec || ph === 'taper' || ph === 'race' ? [30, 40] : [40, inp.caps ? inp.caps.swim : 60] });
    } else if (sl.role === 'lower' || sl.role === 'upper') {
      const area = sl.role;
      // Tag vor dem Radtest: Unterkörper nur leicht (2 Sätze, nichts Explosives)
      const easy = area === 'lower' && bikeTestDow >= 0 && ((sl.dow + 1) % 7) === bikeTestDow;
      const min = easy ? 25 : rec ? 30 : r5(mid(sl.min || [30, 35]));
      const spec = W.strengthArea(area, { ...inp.strength, light: rec && !easy, easy, minutes: min,
        why: area === 'lower' ? 'kräftige Beine und Hüfte schützen Knie, Leiste und Achillessehne und machen dich beim Laufen ökonomischer.' : 'Schultern und Rücken stark machen, das hilft beim Kraulen und schützt die Schulter.' });
      if (easy) spec.tip = 'Morgen ist der Radtest: nur 2 Sätze, nichts Explosives.';
      out.push({ dow: sl.dow, slot: sl, s: null, strength: true, make: () => spec });
    } else if (sl.sport === 'bike' && sl.role === 'long') {
      out.push({ dow: sl.dow, slot: sl, s: null, long: true, make: (min) => { const sp = W.bikeLong(inp.bikeOut, min); if (ph === 'specific' && !rec && min >= 90) { sp.steps[1].note = 'darin 2×15 min im Wettkampftempo (obere Zone 3), alle 20-30 min essen und trinken'; sp.why = 'Wettkampftempo auf müden Beinen üben.'; } return sp; }, min: r5(mid(longBikeR)), adj: longBikeR });
    } else if (sl.sport === 'bike') {
      if (sl.dow === bikeTestDow) { out.push({ dow: sl.dow, slot: sl, s: null, test: true, hard: true, make: () => W.bikeTest({ ...inp.bikeOut, indoor: false, bikeName: null }) }); continue; }
      const range = sl.min || [50, 75];
      const key = sl.role === 'key' && !rec && !inp.entry && ph !== 'race' && (!sl.keyFrom || date >= sl.keyFrom);
      if (key && ph === 'specific') {
        const THR: [number, number][] = [[4, 6], [3, 8], [3, 10], [2, 15], [3, 12]];
        const [reps, m] = THR[Math.min(THR.length - 1, st.thrWeeks || 0)];
        out.push({ dow: sl.dow, slot: sl, s: null, hard: true, make: (min) => { const sp = W.bikeIntervals(inp.bikeIn, reps, m, 4, Math.max(3, Math.round(m / 2))); sp.why = 'Schwelle (Zone 4) bringt das Wettkampftempo: kurz vor dem Ziel wichtiger als lange Sweet-Spot-Intervalle.'; const extra = Math.max(0, min - W.totals(sp).min); if (extra >= 5) sp.steps[sp.steps.length - 1].min = (sp.steps[sp.steps.length - 1].min || 10) + Math.round(extra / 5) * 5; return sp; }, min: 70, adj: [60, 90] });
      } else if (key) {
        // im Tapering kürzer (zwei Stufen zurück), die Intensität bleibt
        const [reps, m] = ladder[Math.max(0, Math.min(ladder.length - 1, st.keyWeeks) - (ph === 'taper' ? 2 : 0))];
        const core = reps * m + (reps - 1) * (m >= 15 ? 5 : 4) + 25;
        out.push({ dow: sl.dow, slot: sl, s: null, hard: true, make: (min) => { const sp = W.bikeSweetSpot(inp.bikeIn, reps, m, min); sp.why = 'Sweet Spot macht dich auf dem Rad stärker, ohne so müde zu machen wie Schwellen-Intervalle.'; return sp; }, min: Math.max(core, range[0]), adj: [core, 90] });
      } else out.push({ dow: sl.dow, slot: sl, s: null, make: (min) => W.bikeEasy(inp.bikeOut, min), min: rec ? range[0] : r5(mid(range)), adj: rec ? [range[0], range[1]] : [range[0], 90] });
    } else if (sl.sport === 'run' && sl.role === 'long') {
      if (inp.tests.has('run')) { out.push({ dow: sl.dow, slot: sl, s: null, test: true, hard: true, make: () => W.runTest(inp.run) }); continue; }
      out.push({ dow: sl.dow, slot: sl, s: null, long: true, make: (min) => W.runLong(inp.run, min), min: longRun });
    } else if (sl.sport === 'run' && sl.role === 'brick') {
      if (rec || ph === 'taper' || ph === 'race') continue;
      const min = ph === 'specific' ? 20 : st.brickWeeks > 0 ? 15 : 10;
      out.push({ dow: sl.dow, slot: sl, s: null, make: () => { const sp = W.runEasy(inp.run, min); if (ph === 'specific') sp.steps[0].note = 'die mittleren 10 min im Wettkampftempo'; sp.title = `Koppellauf ${min} min (direkt nach dem Rad)`; sp.why = 'gewöhnt die Beine an den Wechsel vom Rad zum Laufen.'; sp.tip = 'Nur wenn du gut erholt bist (Ampel grün). Sonst weglassen, das ist kein Problem.'; return sp; } });
    } else if (sl.sport === 'run') {
      const range = sl.min || [40, 50];
      const strides = !rec && !!sl.stridesFrom && date >= sl.stridesFrom ? (st.strideWeeks > 0 ? 6 : 4) : 0;
      out.push({ dow: sl.dow, slot: sl, s: null, make: (min) => W.runEasy(inp.run, min, { strides }), min: rec ? range[0] : r5(mid(range)), adj: rec ? [Math.max(30, range[0] - 10), range[1]] : [range[0], range[1]] });
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
  return out.map(x => {
    const spec = x.make!(x.min || 0);
    const s = { ...W.build(spec), pattern: true };
    if (x.hard) s.hard = true;
    if ((x as any).soft) delete s.hard;
    if (x.long) s.long = true;
    return { dow: x.dow, s, long: x.long, test: x.test || spec.kind === 'test', hard: !(x as any).soft && (x.hard || spec.kind === 'test'), strength: x.strength };
  });
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
    if (items.some(x => /^Sweet Spot/.test(x.s.title || ''))) n.keyWeeks++;
    if (items.some(x => x.s.sport === 'run' && /Steigerungsläufe/.test(x.s.description || ''))) n.strideWeeks++;
    if (items.some(x => /^Koppellauf/.test(x.s.title || ''))) n.brickWeeks++;
    if (items.some(x => /^Rad (Schwelle|-Intervalle)/.test(x.s.title || ''))) n.thrWeeks = (n.thrWeeks || 0) + 1;
    n.buildOwn = items.filter(x => !['football', 'rest'].includes(x.s.sport) && !x.s.race).reduce((a, x) => a + (x.s.plannedMinutes || 0), 0) || n.buildOwn;
    n.runRef = items.filter(x => x.s.sport === 'run').reduce((a, x) => a + (x.s.plannedMinutes || 0), 0) || n.runRef;
  }
  if (tests.size) n.lastTestMon = mon;
  return n;
}

/* Schwimmen für alle, die schon kraulen können: Technik bzw. Ausdauer in 100-m-Stücken bis zur Zielzeit */
function swimEndurance(ctx: W.PaceCtx, min: number, technique: boolean): W.Spec {
  const mk = (k: number) => technique
    ? W.swimSession(ctx, 'technique', [{ part: 'main', reps: 6, m: 50, zone: 1, mode: 'drill', restSec: 20, note: 'Abschlag, Fingerspitzen, Seitlage' }, { part: 'main', reps: k, m: 100, zone: 2, mode: 'crawl', restSec: 20 }])
    : W.swimSession(ctx, 'endurance', [{ part: 'main', reps: k, m: 200, zone: 2, mode: 'crawl', restSec: 30 }]);
  let k = 2; while (k < 30 && W.totals(mk(k + 1)).min <= min) k++;
  return mk(k);
}
