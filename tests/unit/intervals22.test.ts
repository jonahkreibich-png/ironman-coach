/* Auftrag 22: Intervalle erfassen und auswerten – Soll aus dem Plan, Ist von Hand oder aus der Uhr (Runden bzw. Verlauf),
   Zuordnung, Bewertung je Intervall, Ø der harten Teile und der Pausen. Soll-Werte zählen nie als geschafft. */
import { test, expect, describe } from 'vitest';
import fs from 'node:fs';
import * as W from '../../shared/workouts';
import { analyze } from '../../shared/activity/analyze';
import { plannedIntervals, evaluateIntervals, actualRows, rowsToLaps, alignRows, type IvRow } from '../../shared/intervals';
import { effectiveActivity } from '../../shared/results';
import { simulate, pace, fromFixture, type Part } from '../helpers/runsim';
import type { RawActivity } from '../../shared/activity/types';

const ctx: W.PaceCtx = { runThrSec: 300, lthrRun: 170, lthrBike: 165, ftp: 250, css: 110, breast100: 160, pool: 25, gear: ['buoy'] };
const A = (raw: RawActivity, sport = 'run') => ({ ...analyze(raw, { source: 'file', lthr: { run: 170, bike: 165 } }), sport } as any);
const runIv = () => ({ id: 's1', sport: 'run', ...W.build(W.runIntervals(ctx, 5, 4, 2, 4)) });
const sweet = () => ({ id: 's2', sport: 'bike', ...W.build(W.bikeSweetSpot(ctx, 2, 10)) });
const E = pace('6:50'), J = pace('7:20'), F = pace('4:58');
const ivParts = (n = 5, workSec = 240): Part[] => [{ sec: 900, speed: E, hr: 140 }, ...Array.from({ length: n }, () => [{ sec: workSec, speed: F, hr: 165 }, { sec: 120, speed: J, hr: 140 }]).flat(), { sec: 600, speed: E, hr: 140 }];

describe('Soll aus dem Plan', () => {
  test('5×4 min Laufen: fünf Intervalle mit Pace- und Pulsziel, Pause nach jedem außer dem letzten', () => {
    const t = plannedIntervals(runIv());
    expect(t).toHaveLength(5);
    expect(t[0]).toMatchObject({ sec: 240, zone: 4, restSec: 120 });
    expect(t[4].restSec).toBeNull();
    expect(t[0].pace![0]).toBeLessThan(t[0].pace![1]);
    expect(t[0].hr![0]).toBe(Math.round(170 * 0.94));
  });
  test('2×10 Sweet Spot: Watt 88-94 % FTP', () => {
    const t = plannedIntervals(sweet());
    expect(t.map(x => x.sec)).toEqual([600, 600]);
    expect(t[0].power).toEqual([220, 235]);
  });
  test('lockerer Lauf und Lauf-Geh-Wechsel haben keine Intervalle', () => {
    expect(plannedIntervals({ sport: 'run', ...W.build(W.runEasy(ctx, 45)) })).toHaveLength(0);
    expect(plannedIntervals({ sport: 'run', ...W.build(W.runWalk(ctx, 2)) })).toHaveLength(0);
  });
  test('Schwimm-Sets: 8×50 m Kraul mit Pace-Ziel, Einschwimmen zählt nicht', () => {
    const sp = W.swimSession(ctx, 'css', [{ part: 'main', reps: 8, m: 50, zone: 4, mode: 'crawl', restSec: 20 }], 200, 100);
    const t = plannedIntervals({ sport: 'swim', ...W.build(sp) });
    expect(t).toHaveLength(8); expect(t[0]).toMatchObject({ m: 50, restSec: 20 }); expect(t[0].pace100).toEqual([106, 114]);
  });
  test('30/15 (26 sehr kurze Stücke) wird ein Block je Satz, nicht 26 Zeilen', () => {
    const steps: W.Step[] = [{ part: 'warm', min: 15, zone: 1 }, { part: 'main', reps: 13, min: 0.5, zone: 5, restMin: 0.25 }, { part: 'main', min: 5, zone: 1 }, { part: 'main', reps: 13, min: 0.5, zone: 5, restMin: 0.25 }, { part: 'cool', min: 10, zone: 1 }];
    const t = plannedIntervals({ sport: 'bike', ...W.build({ sport: 'bike', kind: 'vo2', ctx, steps }) });
    expect(t).toHaveLength(2); expect(t[0].label).toMatch(/13×30 s/);
  });
  test('Koppel (Rad mit Blöcken): harte Blöcke sind Intervalle', () => {
    const sp: W.Spec = { sport: 'bike', kind: 'brick', ctx, steps: [{ part: 'warm', min: 15, zone: 1 }, ...[0, 1, 2].flatMap(() => [{ part: 'main' as const, min: 10, zone: 4 }, { part: 'main' as const, min: 3, zone: 1 }]), { part: 'cool', min: 10, zone: 1 }] };
    expect(plannedIntervals({ sport: 'bike', ...W.build(sp) }).map(t => t.sec)).toEqual([600, 600, 600]);
  });
});

describe('Ist aus der Uhr', () => {
  test('FIT-Runden mit Belastung/Pause der Uhr: 5 Intervalle zugeordnet, Ein- und Auslaufen fallen weg', () => {
    const raw = simulate(ivParts(), { laps: 'manual' });
    raw.laps.forEach((l, i) => { l.intensity = i === 0 ? 'warmup' : i === raw.laps.length - 1 ? 'cooldown' : i % 2 ? 'active' : 'rest'; });
    const a = A(raw);
    const e = evaluateIntervals(runIv(), {}, a, {})!;
    expect(e.source).toBe('watch');
    expect(e.done).toBe(5); expect(e.missing).toBe(0); expect(e.extra).toBe(0);
    expect(e.work.sec).toBe(240);
    expect(e.work.paceSec).toBeGreaterThan(290); expect(e.work.paceSec).toBeLessThan(305);
    expect(e.rest.sec).toBe(120);
    expect(e.inTarget).toBe(5);
    // Puls am Ende der Pause liegt unter dem Puls am Ende des Intervalls: Erholung messbar
    expect(e.recovery).toBeGreaterThan(5);
  });
  test('selbst gedrückte Runden ohne Angabe der Uhr: Wechsel schnell/langsam erkannt', () => {
    const e = evaluateIntervals(runIv(), {}, A(simulate(ivParts(), { laps: 'manual' })), {})!;
    expect(e.source).toBe('laps'); expect(e.done).toBe(5);
  });
  test('ohne Runden: harte Abschnitte aus dem Verlauf', () => {
    const a = A(simulate(ivParts(), { laps: 'none' }));
    expect(a.segments.filter((s: any) => s.kind === 'work')).toHaveLength(5);
    const e = evaluateIntervals(runIv(), {}, a, {})!;
    expect(e.source).toBe('stream'); expect(e.done).toBe(5);
    e.lines.forEach(l => expect(Math.abs((l.row!.sec || 0) - 240)).toBeLessThanOrEqual(20));
  });
  test('automatische Runden (1 km) und Intervalle: der Verlauf zählt, nicht die km-Runden', () => {
    const a = A(simulate(ivParts()));
    expect(evaluateIntervals(runIv(), {}, a, {})!.source).toBe('stream');
  });
  test('Auto-Lap-Lauf (Jonahs langer Lauf, 1-km-Runden): keine Intervalle', () => {
    const a = A(fromFixture(JSON.parse(fs.readFileSync('fixtures/runs/jonah-long-autolap.json', 'utf8'))));
    expect(actualRows({}, a).rows).toHaveLength(0);
    expect(evaluateIntervals({ sport: 'run', ...W.build(W.runLong(ctx, 60)) }, {}, a, {})).toBeNull();
  });
  test('mehr als geplant: 6 statt 5 Intervalle – das sechste ist „zusätzlich“', () => {
    const e = evaluateIntervals(runIv(), {}, A(simulate(ivParts(6), { laps: 'none' })), {})!;
    expect(e.done).toBe(5); expect(e.extra).toBe(1); expect(e.lines[e.lines.length - 1].extra).toBe(true);
  });
  test('abgebrochen: das letzte Intervall nur 90 s – als „kürzer“ markiert, zählt nicht als im Ziel', () => {
    const parts = ivParts(4); parts.splice(parts.length - 1, 0, { sec: 90, speed: F, hr: 160 }, { sec: 120, speed: J, hr: 140 });
    const e = evaluateIntervals(runIv(), {}, A(simulate(parts, { laps: 'manual' })), {})!;
    expect(e.short).toBe(1); expect(e.inTarget).toBe(4);
  });
  test('weniger als geplant: 3 von 5, zwei fehlen', () => {
    const e = evaluateIntervals(runIv(), {}, A(simulate(ivParts(3), { laps: 'none' })), {})!;
    expect(e.done).toBe(3); expect(e.missing).toBe(2);
  });
  test('Schwimm-Sets aus Runden der Uhr: 8×50 m, Einschwimmen 200 m und Ausschwimmen fallen weg, Züge pro Bahn je Serie', () => {
    const sp = W.swimSession(ctx, 'css', [{ part: 'main', reps: 8, m: 50, zone: 4, mode: 'crawl', restSec: 20 }], 200, 100);
    const sess = { sport: 'swim', ...W.build(sp) };
    const laps: any[] = []; const lengths: any[] = []; let t = 0;
    const lap = (m: number, sec: number, intensity: string, spl: number) => { laps.push({ start: t, sec, elapsed: sec, dist: m, avgHr: 140, maxHr: 150, avgSpeed: m / sec, avgPower: null, intensity, trigger: 0 }); for (let k = 0; k < m / 25; k++) lengths.push({ start: t + k * sec / (m / 25), sec: sec / (m / 25), strokes: spl, stroke: 'freestyle', cadence: 30, active: true }); t += sec; };
    const rest = (sec: number) => { laps.push({ start: t, sec, elapsed: sec, dist: 0, avgHr: 120, maxHr: 130, avgSpeed: 0, avgPower: null, intensity: 'rest', trigger: 0 }); t += sec; };
    lap(200, 260, 'active', 18); rest(30);
    for (let i = 0; i < 8; i++) { lap(50, 55, 'active', 17); rest(20); }
    lap(100, 140, 'active', 19);
    const raw: RawActivity = { format: 'fit', sport: 'swim', startMs: Date.UTC(2026, 9, 20, 6), indoor: true, poolLengthM: 25, totals: { elapsedSec: t, movingSec: t, distanceM: 700, ascentM: null, kcal: null, avgHr: 138, maxHr: 150, avgPower: null, avgSpeed: null }, records: [], laps, lengths };
    const e = evaluateIntervals(sess, {}, A(raw, 'swim'), {})!;
    expect(e.done).toBe(8); expect(e.extra).toBe(0); expect(e.missing).toBe(0);
    expect(e.lines[0].row).toMatchObject({ m: 50, pace100: '1:50', spl: 17, restSec: 20 });
    expect(e.inTarget).toBe(8);
  });
  test('Koppel: Rad-Blöcke aus Watt-Runden', () => {
    const sp: W.Spec = { sport: 'bike', kind: 'brick', ctx, steps: [{ part: 'warm', min: 15, zone: 1 }, ...[0, 1, 2].flatMap(() => [{ part: 'main' as const, min: 10, zone: 4 }, { part: 'main' as const, min: 3, zone: 1 }]), { part: 'cool', min: 10, zone: 1 }] };
    const parts: Part[] = [{ sec: 900, speed: 7, hr: 130, power: 150 }, ...[0, 1, 2].flatMap(() => [{ sec: 600, speed: 10, hr: 160, power: 245 }, { sec: 180, speed: 7, hr: 130, power: 140 }]), { sec: 600, speed: 7, hr: 125, power: 140 }];
    const e = evaluateIntervals({ sport: 'bike', ...W.build(sp) }, {}, A(simulate(parts, { sport: 'bike', laps: 'manual', power: true }), 'bike'), {})!;
    expect(e.done).toBe(3); expect(e.work.power).toBeGreaterThan(235); expect(e.inTarget).toBe(3);
  });
});

describe('Ist von Hand', () => {
  const hand = (rows: IvRow[]) => ({ metrics: { intervals: rows }, metricsSrc: { intervals: 'manual' }, metricsManual: { intervals: true }, completed: true });
  test('2×10 Sweet Spot von Hand: im Ziel, Ø Watt und Puls nur der harten Teile', () => {
    const e = evaluateIntervals(sweet(), hand([{ sec: 600, power: 228, hr: 150, restSec: 300, restHr: 118 }, { sec: 600, power: 230, hr: 156 }]), null, {})!;
    expect(e.source).toBe('manual'); expect(e.done).toBe(2); expect(e.inTarget).toBe(2);
    expect(e.work).toMatchObject({ power: 229, hr: 153 }); expect(e.hrRise).toBe(6); expect(e.recovery).toBe(32);
  });
  test('Hand gewinnt gegen die Uhr', () => {
    const a = A(simulate(ivParts(), { laps: 'none' }));
    const e = evaluateIntervals(runIv(), hand([{ sec: 240, pace: '4:40', hr: 185 }]), a, {})!;
    expect(e.source).toBe('manual'); expect(e.done).toBe(1); expect(e.missing).toBe(4);
    expect(e.lines[0].verdict).toBe('hard');
  });
  test('3 statt 2 gemacht und eines abgebrochen', () => {
    const e = evaluateIntervals(sweet(), hand([{ sec: 600, power: 230 }, { sec: 600, power: 231 }, { sec: 240, power: 225, aborted: true }]), null, {})!;
    expect(e.done).toBe(2); expect(e.extra).toBe(1); expect(e.inTarget).toBe(2);
  });
  test('Soll/Ist: nur geplante Werte (leere Zeilen) zählen nie als geschafft', () => {
    const e = evaluateIntervals(sweet(), hand([{}, { note: 'nur Notiz' }]), null, {})!;
    expect(e.done).toBe(0); expect(e.missing).toBe(2); expect(e.inTarget).toBe(0);
    expect(evaluateIntervals(sweet(), {}, null, {})!.done).toBe(0);
  });
  test('Hand-Intervalle werden zu Runden: Scores und Bewertung lesen sie über effectiveActivity', () => {
    const a = A(simulate([{ sec: 3600, speed: E, hr: 140 }]));
    const st = hand([{ sec: 600, power: 230, hr: 150, restSec: 300, restHr: 120 }, { sec: 600, power: 232, hr: 152 }]);
    const eff = effectiveActivity({ ...a, sport: 'bike' }, st);
    expect(eff.laps.filter((l: any) => l.kind === 'work')).toHaveLength(2);
    expect(eff.intervals.count).toBe(2);
    expect(rowsToLaps(st.metrics.intervals, 'bike')[1]).toMatchObject({ kind: 'rest', sec: 300, avgHr: 120 });
  });
  test('Zuordnung: Reihenfolge bleibt, Größe entscheidet', () => {
    const t = plannedIntervals(runIv());
    const { pairs, extra } = alignRows(t, [{ sec: 900 }, { sec: 240 }, { sec: 235 }, { sec: 250 }, { sec: 245 }, { sec: 238 }, { sec: 600 }], 'run');
    expect(pairs).toEqual([1, 2, 3, 4, 5]); expect(extra).toEqual([]);
  });
});

/* ---------- Coach und Stufen nutzen die Intervalle ---------- */
import { world } from '../helpers/chat-world';
import { reviewItem, doneItems, intervalReview } from '../../shared/coach/review';
import * as C from '../../shared/core';
import { LIB } from '../../shared/workoutlib';
import { bikeQualitySpec, runQualitySpec } from '../../shared/workoutbuild';

function coachCtx(sessions: { date: string; s: any; st: any }[], today: string) {
  const Wd = world('jugend-langdistanz', today);
  const ctx: any = Wd.ctx();
  ctx.profile = { ...ctx.profile, powerMeter: true, thresholds: { ...ctx.profile.thresholds, ftp: 250, lthrBike: 165, lthrRun: 170, thresholdPaceRunSec: 300 } };
  const days = [...new Set(sessions.map(x => x.date))].sort().map(date => ({ date, sessions: sessions.filter(x => x.date === date).map(x => x.s) }));
  ctx.baseWeeks = [{ weekNumber: 1, label: 'W', startDate: days[0].date, endDate: today, days }];
  ctx.state = { ...ctx.state, profile: ctx.profile, activities: {}, sessions: Object.fromEntries(sessions.map(x => [x.s.id, x.st])) };
  return ctx;
}
const ss = (id: string, stage = 0) => ({ id, sport: 'bike', ...W.build(bikeQualitySpec('bike.sweetspot', stage, { ...ctx, indoor: true }, null, { total: 75 })!) });
const handSt = (rows: IvRow[], rpe = '6') => ({ completed: true, rpe, metrics: { intervals: rows, min: '75' }, metricsSrc: { intervals: 'manual' }, metricsManual: { intervals: true } });

describe('Coach: Intervalle Soll gegen Ist', () => {
  test('Sweet Spot von Hand: im Zielbereich, gleichmäßig, Vergleich mit derselben Einheit 3 Wochen vorher („gleiche Watt bei 5 Schlägen weniger“)', () => {
    const rows = (hr: number): IvRow[] => [0, 1, 2].map(k => ({ sec: 600, power: 228, hr: hr + k, restSec: 240, restHr: hr - 30 }));
    const c = coachCtx([{ date: '2026-10-07', s: ss('a', 0), st: handSt(rows(156)) }, { date: '2026-10-28', s: ss('b', 0), st: handSt(rows(151)) }], '2026-10-28');
    const d = doneItems(c, '2026-10-28', '2026-10-28')[0];
    const r = intervalReview(c, d);
    expect(r.e!.done).toBe(3); expect(r.e!.inTarget).toBe(3);
    expect(r.good[0]).toMatch(/wie am Mi 07\.10\.: gleiche Watt \(228 W\) bei 5 Schlägen weniger \(152 statt 157\)/);
    const t = reviewItem(c, d).text;
    expect(t).toMatch(/Alle 3 Intervalle im Zielbereich, gleichmäßig/);
    expect(t).toMatch(/Nächstes Mal eine Stufe weiter/);
  });
  test('Intervalle zu hart (Watt über dem Ziel, Puls darüber): Hinweis, keine nächste Stufe', () => {
    const c = coachCtx([{ date: '2026-10-28', s: ss('b'), st: handSt([0, 1, 2].map(k => ({ sec: 600, power: 270, hr: 172 + k })), '8') }], '2026-10-28');
    const d = doneItems(c, '2026-10-28', '2026-10-28')[0];
    const t = reviewItem(c, d).text;
    expect(t).toMatch(/3 von 3 Intervallen zu hart/); expect(t).toMatch(/dieselbe Stufe wiederholen/); expect(t).not.toMatch(/Stufe weiter/);
  });
  test('Pulsanstieg bei gleicher Leistung = Ermüdung; schwache Erholung in den Pausen', () => {
    const c = coachCtx([{ date: '2026-10-28', s: ss('b'), st: handSt([0, 1, 2].map(k => ({ sec: 600, power: 228, hr: 145 + k * 6, restSec: 240, restHr: 140 + k * 6 }))) }], '2026-10-28');
    const r = intervalReview(c, doneItems(c, '2026-10-28', '2026-10-28')[0]);
    expect(r.better.join(' ')).toMatch(/Puls stieg von Intervall 1 bis 3 um 12 Schläge: Ermüdung/);
    expect(r.better.join(' ')).toMatch(/In den Pausen fiel der Puls nur um 5 Schläge/);
  });
  test('Soll/Ist: nur geplante Werte – keine Bewertung „im Ziel“, keine Stufe weiter', () => {
    const c = coachCtx([{ date: '2026-10-28', s: ss('b'), st: { completed: true } }], '2026-10-28');
    const d = doneItems(c, '2026-10-28', '2026-10-28')[0];
    const t = reviewItem(c, d).text;
    expect(t).not.toMatch(/im Zielbereich|Stufe weiter/);
    expect(C.ladderVerdictOf(d.planned, d.st, null, c.profile.thresholds).result).not.toBe('up');
  });
});

describe('Stufen: nächste Stufe nur mit passenden Ist-Werten', () => {
  const thr = { lthrBike: 165, lthrRun: 170, ftp: 250, thresholdPaceRunSec: 300 };
  test('Sweet Spot: alle im Ziel → weiter; eines abgebrochen → nicht geschafft; weniger als geplant → nicht geschafft', () => {
    const s = ss('x');
    const ok = [0, 1, 2].map(() => ({ sec: 600, power: 228, hr: 150, restSec: 240, restHr: 120 }));
    expect(C.ladderVerdictOf(s, handSt(ok), null, thr).result).toBe('up');
    expect(C.ladderVerdictOf(s, handSt([...ok.slice(0, 2), { sec: 200, power: 220, aborted: true }]), null, thr).result).toBe('fail');
    expect(C.ladderVerdictOf(s, handSt(ok.slice(0, 2)), null, thr).result).toBe('fail');
  });
  test('Lauf-Stufe nutzt den Lauf-Schwellenpuls (vorher den Rad-Schwellenpuls)', () => {
    const s = { id: 'r', sport: 'run', ...W.build(runQualitySpec('run.threshold', 0, ctx, 'run_half')!) };
    const t = plannedIntervals(s);
    expect(t.length).toBeGreaterThan(0);
    const rows = t.map(x => ({ sec: x.sec, hr: 165, pace: '5:05' }));
    // Puls 165 liegt für den Lauf (Schwelle 170) im Ziel; mit dem Rad-Schwellenpuls 150 wäre er „zu hoch“
    expect(C.ladderVerdictOf(s, handSt(rows, '7'), null, { ...thr, lthrBike: 150 }).result).toBe('up');
    expect(LIB['run.threshold']).toBeTruthy();
  });
});

describe('intervals.icu-Abschnitte', () => {
  test('WORK/RECOVERY werden Intervalle mit Pause; gleich lange Abschnitte ohne Pause (Auto-Runden) nicht', async () => {
    const { segmentsFromIcu, rowsFromSegments } = await import('../../shared/intervals');
    const list = [{ type: 'WARMUP', moving_time: 900, distance: 2200, average_heartrate: 135 },
      ...[0, 1].flatMap(() => [{ type: 'WORK', moving_time: 600, distance: 5900, average_heartrate: 152, max_heartrate: 158, average_watts: 228, average_cadence: 88 }, { type: 'RECOVERY', moving_time: 300, distance: 2000, average_heartrate: 125 }]),
      { type: 'COOLDOWN', moving_time: 600, distance: 3000, average_heartrate: 130 }];
    const rows = rowsFromSegments(segmentsFromIcu(list, 'bike'), 'bike');
    expect(rows).toHaveLength(2); expect(rows[0]).toMatchObject({ sec: 600, power: 228, hr: 152, cad: 88, restSec: 300, restHr: 125 });
    const auto = Array.from({ length: 8 }, () => ({ type: 'WORK', moving_time: 410, distance: 1000, average_heartrate: 146 }));
    expect(segmentsFromIcu(auto, 'run')).toEqual([]);
    expect(segmentsFromIcu(null as any, 'run')).toEqual([]);
  });
});
