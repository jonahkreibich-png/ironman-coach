/* Auftrag 36, Punkt 1: Intervalle nach dem Training bearbeiten – Titel, Lage, Hilfsmittel, Zone, Art und Untergrund je Satz bzw.
   Wiederholung. Das Programm versteht die Änderung: Bewertung, Kraul am Stück, CSS, Coach-Text nutzen das tatsächlich Gemachte.
   Beispiel aus dem Auftrag: Kraul mit Pull Buoy zählt nicht als „Kraul am Stück ohne Hilfsmittel“ und nur abgeschwächt fürs Kraul-Tempo,
   Kickboard ist Beinarbeit, der Coach sagt „mit Pull Buoy“ statt „ohne“. */
import { describe, expect, test } from 'vitest';
import * as W from '../../shared/workouts';
import { plannedIntervals, evaluateIntervals, ivGroups, swimIvFacts, stampRows, ivDiffNotes, ivAttrs, type IvRow } from '../../shared/intervals';
import { actualMetrics, effectiveActivity, swimFactsOf } from '../../shared/results';
import { legacyActivities, sportScores } from '../../shared/scores';
import { defaultProfile, withEstimates } from '../../shared/profile';

const ctx: W.PaceCtx = { runThrSec: 300, lthrRun: 170, lthrBike: 165, ftp: 250, css: 110, breast100: 160, pool: 25, gear: ['buoy', 'board'] };
const swimSess = () => ({ id: 'sw1', sport: 'swim', ...W.build(W.swimSession(ctx, 'css', [{ part: 'main', reps: 4, m: 100, zone: 3, mode: 'crawl', restSec: 20 }, { part: 'main', reps: 4, m: 50, zone: 3, mode: 'pull', restSec: 20 }], 200, 100)) });
const PULL = W.swimPace(ctx, 3, 'pull', ['buoy']);
const manual = (rows: IvRow[]) => ({ completed: true, metrics: { intervals: rows }, metricsSrc: { intervals: 'manual' } });

describe('Auftrag 36: Intervalle mit Lage, Hilfsmittel, Titel', () => {
  test('Soll kennt Lage und Hilfsmittel aus dem Plan; Sätze werden gruppiert', () => {
    const s = swimSess(); const t = plannedIntervals(s);
    expect(t.map(x => x.stroke)).toEqual(['crawl', 'crawl', 'crawl', 'crawl', 'crawl', 'crawl', 'crawl', 'crawl']);
    expect(t[4].gear).toEqual(['buoy']); expect(t[0].gear).toEqual([]);
    const rows = stampRows(t.map(() => ({})), t, 'swim');
    const g = ivGroups(rows, t, 'swim');
    expect(g.map(x => x.label)).toEqual(['4 × 100 m Kraul', '4 × 50 m Kraul · Pull Buoy']);
    expect(g.map(x => x.idx.length)).toEqual([4, 4]);
  });

  test('4 × 100 m Kraul mit Pull Buoy: kein Kraul am Stück ohne Hilfsmittel, Pull-Buoy-Nachweis, Bewertung gegen Pull-Tempo, Coach sagt „mit Pull Buoy“', () => {
    const s = swimSess(); const t = plannedIntervals(s);
    // ganzer Satz gleich: alle 4 × 100 m im Pull-Tempo, mit Pull Buoy
    const rows: IvRow[] = stampRows(t.map((x, i) => (i < 4 ? { sec: PULL, gear: ['buoy'] } : { sec: 75, stroke: 'kick' as const, gear: ['board'] })), t, 'swim');
    expect(rows[0]).toMatchObject({ m: 100, stroke: 'crawl', gear: ['buoy'], ti: 0 });
    const st = manual(rows);
    const fx = swimFactsOf(st)!;
    expect(fx.crawlMaxM).toBeNull(); expect(fx.pullMaxM).toBe(100); expect(fx.kickM).toBe(200); expect(fx.pullPace).toBe(PULL);
    const m = actualMetrics(st, null);
    expect(m.longestCrawl ?? null).toBeNull(); expect(m.longestPull).toBe(100);
    const e = evaluateIntervals(s, st, null, {})!;
    expect(e.lines[0].diff).toEqual(['mit Pull Buoy statt ohne Hilfsmittel']);
    // Pull-Tempo statt Kraul-Tempo: im Pull-Tempo geschwommen ist im Ziel
    expect(e.lines[0].verdict).toBe('ok');
    const notes = ivDiffNotes(e);
    expect(notes[0]).toMatch(/^Die 4 × 100 m Kraul hast du mit Pull Buoy statt ohne Hilfsmittel geschwommen – zählt nicht als Kraul am Stück ohne Hilfsmittel/);
    expect(notes.join(' ')).not.toMatch(/ohne Pull Buoy/);
  });

  test('ohne Hilfsmittel geschwommen: Kraul am Stück zählt, Tempo zählt voll; Kickboard ist Beinarbeit', () => {
    const s = swimSess(); const t = plannedIntervals(s);
    const rows = stampRows(t.map((x, i) => (i < 4 ? { sec: 105 } : { sec: 55, gear: [] })), t, 'swim');
    const st = manual(rows);
    const fx = swimIvFacts(rows, t)!;
    expect(fx.crawlMaxM).toBe(100); expect(fx.crawlPace).toBe(105); expect(fx.kickM).toBe(0); expect(fx.pullMaxM).toBeNull();
    expect(ivDiffNotes(evaluateIntervals(s, st, null, {}))[0]).toMatch(/Die 4 × 50 m Kraul hast du ohne Hilfsmittel statt mit Pull Buoy geschwommen – das zählt als Kraul ohne Hilfsmittel/);
    expect(actualMetrics(st, null).longestCrawl).toBe(100);
    // Beine werden nie Kraul, auch wenn die Lage auf Kraul gestellt, aber das Kickboard benutzt wurde
    const r2 = rows.map((r, i) => (i >= 4 ? { ...r, stroke: 'crawl' as const, gear: ['board'] } : r));
    expect(swimIvFacts(r2, t)!.crawlMaxM).toBe(100);
    expect(swimIvFacts(r2, t)!.kickM).toBe(200);
  });

  test('selbst eingetragenes „Kraul am Stück“ gewinnt (Hand gewinnt)', () => {
    const s = swimSess(); const t = plannedIntervals(s);
    const rows = stampRows(t.map((x, i) => (i < 4 ? { sec: 105 } : {})), t, 'swim');
    const st = { ...manual(rows), metrics: { intervals: rows, longestCrawl: '50' }, metricsSrc: { intervals: 'manual', longestCrawl: 'manual' } };
    expect(+actualMetrics(st, null).longestCrawl).toBe(50);
  });

  test('Scores: Pull-Buoy-Wiederholungen nur abgeschwächt, Kraul-Wiederholungen voll; Gesamt-Pace mit Hilfsmitteln zählt nicht als Kraul', () => {
    const today = '2026-11-16';
    const prof = withEstimates({ ...defaultProfile(), birthYear: 1990, sports: ['swim'], weeklyHours: 4, thresholds: { ...defaultProfile().thresholds, cssSec: 140 }, skills: { swimCrawl: 'yes', swimCrawlM: 400, poolM: 25 } } as any, today);
    const s = swimSess(); const t = plannedIntervals(s);
    const mk = (gear: string[], sec: number, date: string) => ({ id: 'x' + date, date, sport: 'swim', title: 'CSS', ...W.build(W.swimSession(ctx, 'css', [{ part: 'main', reps: 4, m: 100, zone: 3, mode: 'crawl', restSec: 20 }], 200, 100)), st: { ...manual(stampRows(t.slice(0, 4).map(() => ({ sec, gear })), t, 'swim')), metrics: { min: '45', meters: '1800', intervals: stampRows(t.slice(0, 4).map(() => ({ sec, gear })), t, 'swim') } } });
    const state = (gear: string[]) => {
      const days = ['2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10'].map(d => mk(gear, 100, d));
      const weeks = [{ weekNumber: 1, startDate: '2026-10-19', days: days.map(x => ({ date: x.date, sessions: [{ id: x.id, sport: 'swim', title: x.title, spec: x.spec, plannedMinutes: 45 }] })) }];
      const sessions: any = {}; days.forEach(x => { sessions[x.id] = x.st; });
      return { st: { sessions, customWorkouts: {} }, weeks };
    };
    const css = (gear: string[]) => { const { st, weeks } = state(gear); const acts = legacyActivities(st, weeks, prof); return { acts, sc: sportScores({ today, activities: acts, trend: [], illness: [], profile: prof, goal: null } as any, ['swim'])[0] }; };
    const pull = css(['buoy']), free = css([]);
    expect(pull.acts[0].swim.iv.pullPace).toBe(100);
    expect(pull.acts[0].swim.longestCrawlM ?? null).toBeNull();
    expect(free.acts[0].swim.longestCrawlM).toBe(100);
    const cssOf = (r: any) => r.sc.parts.find((p: any) => p.key === 'css').raw;
    // ohne Hilfsmittel bewegt 1:40/100 m die CSS deutlich stärker in Richtung 1:40 als mit Pull Buoy
    expect(cssOf(free)).toBeLessThan(cssOf(pull));
    expect(Math.abs(140 - cssOf(pull))).toBeLessThan(Math.abs(140 - cssOf(free)));
  });

  test('Laufen: Zone und „bergauf“ ändern das Ziel; Titel je Satz', () => {
    const s = { id: 'r1', sport: 'run', ...W.build(W.runIntervals(ctx, 5, 4, 2, 4)) };
    const t = plannedIntervals(s);
    const rows = stampRows(t.map(() => ({ sec: 240, pace: '5:20', hr: 158, type: 'hill', title: 'Bergsprints am Deich' })), t, 'run');
    const e = evaluateIntervals(s, manual(rows), null, { lthrRun: 170, runThrSec: 300 })!;
    // bergauf: Pace zählt nicht, bewertet über den Puls (158 liegt unter Zone 4)
    expect(e.lines[0].why).toMatch(/Puls/);
    expect(e.lines[0].diff).toContain('bergauf');
    expect(ivGroups(rows, t, 'run')[0].label).toBe('Bergsprints am Deich (5 × 4 min)');
    const z = stampRows(t.map(() => ({ sec: 240, pace: '5:20', zone: 3 })), t, 'run');
    const e2 = evaluateIntervals(s, manual(z), null, { lthrRun: 170, runThrSec: 300 })!;
    expect(e2.lines[0].diff).toEqual(['Zone 3 statt 4']);
    expect(ivDiffNotes(e2)[0]).toMatch(/Die 5 × 4 min hast du Zone 3 statt 4 gelaufen – bewertet gegen Zone 3/);
  });

  test('Sätze verschoben und gelöscht: Zuordnung über ti, nicht über die Reihenfolge', () => {
    const s = swimSess(); const t = plannedIntervals(s);
    const rows = stampRows(t.map((x, i) => (i < 4 ? { sec: 105 } : { sec: 80 })), t, 'swim');
    const moved = [...rows.slice(4), ...rows.slice(0, 4)];
    const e = evaluateIntervals(s, manual(moved), null, {})!;
    expect(e.done).toBe(8); expect(e.extra).toBe(0);
    expect(e.lines[0].target!.gear).toEqual(['buoy']);
    const deleted = rows.slice(0, 4);
    const e2 = evaluateIntervals(s, manual(deleted), null, {})!;
    expect(e2.done).toBe(4); expect(e2.missing).toBe(4);
    // ein zusätzlicher Satz (ohne ti) ist „zusätzlich“
    const extra = [...rows, { sec: 60, m: 50, stroke: 'breast' as const, gear: [], set: 99, ti: null }];
    expect(evaluateIntervals(s, manual(extra), null, {})!.extra).toBe(1);
  });

  test('ältere Listen ohne ti/Lage bleiben gültig (Reihenfolge, Lage aus dem Plan)', () => {
    const s = swimSess(); const t = plannedIntervals(s);
    const legacy: IvRow[] = t.map((x, i) => (i < 4 ? { sec: 105 } : {}));
    const e = evaluateIntervals(s, manual(legacy), null, {})!;
    expect(e.done).toBe(4);
    expect(ivAttrs(legacy[0], t[0], 'swim')).toMatchObject({ stroke: 'crawl', gear: [], known: true });
    // ohne Plan und ohne Lage: kein Kraul-Nachweis (unbekannt ist kein Beweis)
    expect(swimIvFacts(legacy, [])!.crawlMaxM).toBeNull();
    expect(effectiveActivity({ id: 'a', sport: 'swim', date: '2026-11-01', swim: {} }, manual(stampRows(legacy, t, 'swim'))).swim.longestCrawlM).toBe(100);
  });
});
