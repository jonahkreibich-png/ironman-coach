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
  /** Laufminuten der letzten Aufbauwoche: Laufen steigt höchstens um inc */ runRef?: number | null }
export interface PatternWeekIn {
  mon: string; dates: string[]; recovery: boolean; entry: boolean;
  /** eigenes Training dieser Woche (Minuten, ohne Teamsport) */
  ownMin: number; target: WeekTarget | null; tests: Set<TestSport>;
  run: W.PaceCtx; bikeOut: W.PaceCtx; bikeIn: W.PaceCtx; swim: W.PaceCtx;
  swimStage: { ladder: 'swim' | 'swimBreast'; n: number; breast?: boolean } | null;
  /** erlaubte Steigerung pro Woche (z. B. 1.1) */ inc?: number;
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
  const slots = p.slots.filter(sl => !sl.from || inp.dates[(sl.dow + 6) % 7] >= sl.from);
  const dateOf = (sl: PatternSlot) => inp.dates[(sl.dow + 6) % 7];
  const lrMax = p.longRunMax || 999, lrStep = p.longRunStep || 10;
  const ladder = p.ssLadder && p.ssLadder.length ? p.ssLadder : SS_LADDER;
  const rec = inp.recovery;
  // Ziele der langen Einheiten
  const longRun = t && t.longRun ? r5(mid(t.longRun)) : rec ? r5(st.longRun * 0.65) : Math.min(lrMax, st.longRun + lrStep);
  // lange Ausfahrt ohne Vorgabe: höchstens +15 min pro Woche, vorerst nicht über 4 h
  const longBikeR: [number, number] = t && t.longBike ? t.longBike : rec ? [r5(st.longBike * 0.6), r5(st.longBike * 0.6)] : [Math.min(240, st.longBike), Math.min(240, st.longBike + 15)];
  const swimMin = t && t.swim ? r5(mid(t.swim)) : rec ? 40 : st.swim;
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
      out.push({ dow: sl.dow, slot: sl, s: null, make, min: swimMin, adj: t && t.swim ? undefined : [40, 60] });
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
      out.push({ dow: sl.dow, slot: sl, s: null, long: true, make: (min) => W.bikeLong(inp.bikeOut, min), min: r5(mid(longBikeR)), adj: longBikeR });
    } else if (sl.sport === 'bike') {
      if (sl.dow === bikeTestDow) { out.push({ dow: sl.dow, slot: sl, s: null, test: true, hard: true, make: () => W.bikeTest({ ...inp.bikeOut, indoor: false, bikeName: null }) }); continue; }
      const range = sl.min || [50, 75];
      const key = sl.role === 'key' && !rec && !inp.entry && !!sl.keyFrom && date >= sl.keyFrom;
      if (key) {
        const [reps, m] = ladder[Math.min(ladder.length - 1, st.keyWeeks)];
        const core = reps * m + (reps - 1) * (m >= 15 ? 5 : 4) + 25;
        out.push({ dow: sl.dow, slot: sl, s: null, hard: true, make: (min) => { const sp = W.bikeSweetSpot(inp.bikeIn, reps, m, min); sp.why = 'Sweet Spot macht dich auf dem Rad stärker, ohne so müde zu machen wie Schwellen-Intervalle.'; return sp; }, min: Math.max(core, range[0]), adj: [core, 90] });
      } else out.push({ dow: sl.dow, slot: sl, s: null, make: (min) => W.bikeEasy(inp.bikeOut, min), min: rec ? range[0] : r5(mid(range)), adj: rec ? [range[0], range[1]] : [range[0], 90] });
    } else if (sl.sport === 'run' && sl.role === 'long') {
      if (inp.tests.has('run')) { out.push({ dow: sl.dow, slot: sl, s: null, test: true, hard: true, make: () => W.runTest(inp.run) }); continue; }
      out.push({ dow: sl.dow, slot: sl, s: null, long: true, make: (min) => W.runLong(inp.run, min), min: longRun });
    } else if (sl.sport === 'run' && sl.role === 'brick') {
      if (rec) continue;
      const min = st.brickWeeks > 0 ? 15 : 10;
      out.push({ dow: sl.dow, slot: sl, s: null, make: () => { const sp = W.runEasy(inp.run, min); sp.title = `Koppellauf ${min} min (direkt nach dem Rad)`; sp.why = 'gewöhnt die Beine an den Wechsel vom Rad zum Laufen.'; sp.tip = 'Nur wenn du gut erholt bist (Ampel grün). Sonst weglassen, das ist kein Problem.'; return sp; } });
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
