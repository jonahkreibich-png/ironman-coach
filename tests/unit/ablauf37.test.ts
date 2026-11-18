/* Auftrag 37: ein Ablauf je Einheit (shared/ablauf.ts) – Reihenfolge, Soll/Ist/Urteil, „Wie geplant gemacht“ (nicht gemessen,
   Uhrdaten haben Vorrang), Gesamtwerte aus dem ganzen Ablauf (mit Pause), gelöschte und hinzugefügte Abschnitte. */
import { describe, it, expect } from 'vitest';
import * as W from '../../shared/workouts';
import { buildAblauf, fillAsPlanned, diffText, partsShown } from '../../shared/ablauf';
import { evaluateIntervals, swimIvFacts, rowsToLaps, actualRows } from '../../shared/intervals';
import { sectionsOf, totalsFromSections, mainPart, applySections } from '../../shared/sections';

const CTX: W.PaceCtx = { runThrSec: 300, lthrRun: 170, lthrBike: 160, css: 120, breast100: 165, bikeKmh: 30, pool: 25 };
const THR = { lthrRun: 170, lthrBike: 160, css: 120, runThrSec: 300 };
const swim = { sport: 'swim', ...W.build(W.swimSession(CTX, 'css', [{ part: 'main', reps: 3, m: 100, zone: 3, mode: 'breast', restSec: 20 }], 200, 100)) };
const run = { sport: 'run', ...W.build(W.runIntervals(CTX, 4, 3, 2, 4)) };
const easy = { sport: 'run', title: 'Lockerer Lauf', spec: { sport: 'run', kind: 'easy', ctx: CTX, steps: [{ part: 'warm', min: 10, zone: 1 }, { part: 'main', min: 40, zone: 2 }, { part: 'cool', min: 5, zone: 1 }] } };

describe('Ablauf', () => {
  it('Schwimmen: Einschwimmen → Satz → Ausschwimmen; Intervalle: Aufwärmen → Satz → Ausklang; gleichmäßig: drei Abschnitte', () => {
    const a = buildAblauf(swim, {}, null, THR, 'swim');
    expect(a.items.map(x => x.kind === 'set' ? 'set:' + x.label : x.key)).toEqual(['sec:warm', 'set:3 × 100 m Brust', 'sec:cool']);
    const b = buildAblauf(run, {}, null, THR, 'run');
    expect(b.items.map(x => x.kind)).toEqual(['sec', 'set', 'sec']);
    const c = buildAblauf(easy, {}, null, THR, 'run');
    expect(c.items.map(x => x.key)).toEqual(['sec:warm', 'sec:main', 'sec:cool']);
    expect((c.items[1] as any).soll).toBe('40 min · Zone 2');
  });
  it('Wiederholung anders gemacht: Ist fett mit „Kraul (statt Brust)“, Satz-Kopf mit gemischten Lagen, Bewertung gegen das Kraul-Ziel', () => {
    const rows = [{ ti: 0, set: 1, m: 100, sec: 165, stroke: 'breast' }, { ti: 1, set: 1, m: 100, sec: 101, stroke: 'crawl' }, { ti: 2, set: 1, m: 100, sec: 166, stroke: 'breast' }];
    const st = { completed: true, metrics: { intervals: rows }, metricsSrc: { intervals: 'manual' } };
    const a = buildAblauf(swim, st, null, THR, 'swim', { done: true });
    const set = a.items.find(x => x.kind === 'set') as any;
    expect(set.label).toBe('3 × 100 m (2 Brust, 1 Kraul)');
    expect(set.reps[1].ist).toContain('1:41');
    expect(set.reps[1].ist).toContain('Kraul (statt Brust)');
    const e = evaluateIntervals(swim, st, null, THR, 'swim')!;
    const l1 = e.lines[1]; const l0 = e.lines[0];
    expect(l1.why).not.toBe(l0.why.replace('2:45', '1:41'));
    expect(/Ziel (\d:\d\d)/.exec(l1.why)![1]).not.toBe(/Ziel (\d:\d\d)/.exec(l0.why)![1]);
    expect(diffText(['Kraul statt Brust', 'Zone 3 statt 4'])).toBe('Kraul (statt Brust), Zone 3 (statt 4)');
  });
  it('„Wie geplant gemacht“: füllt alles mit dem Soll, markiert als „wie geplant“, zählt als gemacht, nie als Messwert', () => {
    const st = fillAsPlanned(run, { completed: true }, null, THR, 'run');
    expect(st.metricsSrc.intervals).toBe('plan');
    expect(st.metrics.intervals).toHaveLength(4);
    expect(st.metrics.intervals.every((r: any) => r.plan && r.sec === 180)).toBe(true);
    expect(st.metrics.sections.map((r: any) => [r.part, r.min, r.plan])).toEqual([['warm', String(run.spec.steps[0].min), true], ['cool', String(run.spec.steps[run.spec.steps.length - 1].min), true]]);
    const e = evaluateIntervals(run, st, null, THR, 'run')!;
    expect(e.done).toBe(4); expect(e.asPlanned).toBe(4); expect(e.judged).toBe(0); expect(e.work.paceSec).toBeNull();
    expect(rowsToLaps(st.metrics.intervals, 'run')).toEqual([]);
    const a = buildAblauf(run, st, null, THR, 'run', { done: true });
    expect((a.items[1] as any).reps.every((r: any) => r.ist === 'wie geplant' && r.verdict.word === 'wie geplant')).toBe(true);
    // Gesamtdauer aus dem Ablauf (Aufwärmen + 4×3 min + 3×2 min Pause + Ausklang)
    const total = run.spec.steps[0].min + 12 + 6 + run.spec.steps[run.spec.steps.length - 1].min;
    expect(st.metrics.min).toBe(String(total)); expect(st.metricsSrc.min).toBe('sections');
    // Schwimmen: Pace aus „wie geplant“ zählt nie fürs Kraul-Tempo
    const sw = fillAsPlanned(swim, { completed: true }, null, THR, 'swim');
    const f = swimIvFacts(sw.metrics.intervals)!;
    expect(f.crawlPace).toBeNull();
  });
  it('Uhrdaten haben Vorrang vor „wie geplant“; eigene Einträge bleiben', () => {
    const act = { id: 'a', sport: 'run', laps: [{ n: 1, sec: 900, m: 2500, avgHr: 130, kind: 'warmup' }, ...[0, 1, 2, 3].flatMap(i => [{ n: 2 + i * 2, sec: 180, m: 750, avgHr: 165, kind: 'work' }, { n: 3 + i * 2, sec: 120, m: 250, avgHr: 140, kind: 'rest' }]), { n: 20, sec: 600, m: 1500, avgHr: 125, kind: 'cooldown' }] };
    const planSt = fillAsPlanned(run, { completed: true }, null, THR, 'run');
    // später kommt die Uhr: die Uhr gewinnt (Intervalle und Abschnitte)
    expect(actualRows({ ...planSt, activityId: 'a' }, act).source).not.toBe('plan');
    expect(sectionsOf(run, planSt, act, THR, 'run').source).not.toBe('plan');
    // eigene Werte vorher: bleiben beim Füllen
    const own = { completed: true, metrics: { intervals: [{ ti: 0, set: 1, sec: 175, hr: 166 }, { ti: 1, set: 1 }, { ti: 2, set: 1 }, { ti: 3, set: 1 }] }, metricsSrc: { intervals: 'manual' } };
    const f = fillAsPlanned(run, own, null, THR, 'run');
    expect(f.metrics.intervals[0]).toMatchObject({ sec: 175, hr: 166 }); expect(f.metrics.intervals[0].plan).toBeUndefined();
    expect(f.metrics.intervals[1].plan).toBe(true); expect(f.metricsSrc.intervals).toBe('manual');
  });
  it('Gesamtwerte aus dem ganzen Ablauf: Abschnitte + Wiederholungen + geplante Pause; Ø Puls ohne Pausen', () => {
    const rows = [{ part: 'warm', min: '10', km: '1.6', hr: '120' }, { part: 'cool', min: '5', km: '0.8', hr: '125' }];
    const iv = [{ ti: 0, sec: 180, m: 750, hr: 165 }, { ti: 1, sec: 180, m: 760, hr: 167 }];
    const targets = [{ restSec: 120 }, { restSec: null }];
    const t = totalsFromSections(rows as any, 'run', iv, targets);
    expect(t.min).toBe(String(10 + 3 + 2 + 3 + 5));
    expect(t.km).toBeUndefined(); // Pause ohne Strecke → keine Gesamtstrecke (ehrlich statt zu kurz)
    expect(t.hr).toBe(String(Math.round((10 * 120 + 3 * 165 + 3 * 167 + 5 * 125) / 21)));
    // nicht eingetragene Wiederholung → keine Gesamtdauer
    expect(totalsFromSections(rows as any, 'run', [...iv, { ti: 2 }], targets).min).toBeUndefined();
  });
  it('Abschnitt löschen (off) und wieder hinzufügen (added); gelöschte zählen nirgends', () => {
    let st: any = applySections({ completed: true, metrics: {} }, [{ part: 'warm', off: true }, { part: 'main', min: '45', hr: '147' }, { part: 'cool', min: '5', hr: '120' }] as any, 'run');
    const a = buildAblauf(easy, st, null, THR, 'run', { done: true });
    expect(a.items.map(x => x.key)).toEqual(['sec:main', 'sec:cool']);
    expect(a.missingParts).toEqual(['warm']);
    expect(st.metrics.min).toBe('50');
    expect(mainPart(easy, st, null, THR, 'run')!.warmMin).toBeNull();
    st = applySections(st, [{ part: 'warm', added: true }, { part: 'main', min: '45', hr: '147' }, { part: 'cool', min: '5', hr: '120' }] as any, 'run');
    expect(buildAblauf(easy, st, null, THR, 'run').items.map(x => x.key)).toEqual(['sec:warm', 'sec:main', 'sec:cool']);
    expect(st.metrics.min).toBe('50');
    // Schwimm-Technik nur, wenn geplant oder eingetragen
    expect(partsShown('swim', swim, [], true).shown).toEqual(['warm', 'cool']);
  });
  it('Kraft: Liste der Übungen mit Soll und Ist; „wie geplant“ übernimmt die geplanten Übungen', () => {
    const k = { sport: 'strength', ...W.build(W.strengthArea('core')) };
    const st = fillAsPlanned(k, { completed: true }, null, THR, 'strength');
    const a = buildAblauf(k, st, null, THR, 'strength', { done: true });
    expect(a.items).toHaveLength(k.spec.exercises.length);
    expect((a.items[0] as any).ist).toBe('wie geplant');
    const st2 = { ...st, metrics: { exercises: st.metrics.exercises.map((e: any, i: number) => (i === 0 ? { name: e.name, sets: e.sets, reps: e.reps, kg: 10 } : e)) } };
    const b = buildAblauf(k, st2, null, THR, 'strength', { done: true });
    expect((b.items[0] as any).ist).toContain('10 kg');
    expect((b.items[0] as any).verdict.word).toBe('✓');
  });
});
