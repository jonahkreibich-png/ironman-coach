/* Auftrag 38: Ablauf enthält die ganze Einheit (auch lockere Hauptteile), Summe = Einheit; Gemachtes gilt überall (Titel, Änderungen,
   Gesamtwerte, Belastung); kurze Wiederholungen ohne Puls, bergauf ohne Tempo; ältere Listen behalten ihre Zuordnung. */
import { describe, it, expect } from 'vitest';
import * as W from '../../shared/workouts';
import { runEasyForm } from '../../shared/workoutbuild';
import { buildAblauf, doneSummary, doneSentence, ivRowsFor } from '../../shared/ablauf';
import { plannedIntervals, evaluateIntervals, stampRows, rowsToLaps, stepOrder } from '../../shared/intervals';
import { applyTotals, totalsFromSections } from '../../shared/sections';
import * as C from '../../shared/core';

const CTX: W.PaceCtx = { runThrSec: 300, lthrRun: 170, lthrBike: 160, css: 120, breast100: 165, bikeKmh: 30, pool: 25, ftp: 250 };
const THR = { lthrRun: 170, lthrBike: 160, css: 120, runThrSec: 300, ftp: 250 };
const hillsSpec = runEasyForm('run.hillsprints', 0, CTX, 41)!;
const hills = { id: 'h', sport: 'run', ...W.build(hillsSpec) };
const ss = { id: 'b', sport: 'bike', hard: true, ...W.build(W.bikeSweetSpot(CTX, 2, 8)) };

const planSum = (ab: any, planned: any) => {
  const secMin = ab.items.filter((x: any) => x.kind === 'sec').reduce((a: number, x: any) => a + (planned.spec.steps.filter((s: any) => s.part === x.part).reduce((b: number, s: any) => b + (s.min || 0), 0)), 0);
  const ivMin = ab.targets.reduce((a: number, t: any) => a + ((t.sec || 0) + (t.restSec || 0)) / 60, 0);
  return secMin + ivMin;
};

describe('Ablauf: ganze Einheit', () => {
  it('Lauf mit Hügelsprints: 10 min Aufwärmen + 20 min Z2 + 6 × 10 s Hügel + 5 min Ausklang, Summe = Einheit', () => {
    const ab = buildAblauf(hills, {}, null, THR, 'run');
    const labels = ab.items.map((x: any) => x.kind === 'set' ? x.label : x.key);
    expect(labels).toEqual(['sec:warm', '20 min Zone 2', '6 × 10 s bergauf', 'sec:cool']);
    expect(Math.round(planSum(ab, hills))).toBe(W.totals(hillsSpec).min);
    expect(hills.plannedMinutes).toBe(W.totals(hillsSpec).min);
  });
  it('Hügelsprints ohne Puls- und Pace-Ziel, mit Ausführung; Bewertung nicht „zu langsam“ wegen Pace', () => {
    const t = plannedIntervals(hills, THR).find(x => !x.steady)!;
    expect(t.hr).toBeNull(); expect(t.pace).toBeNull(); expect(t.cue).toMatch(/kräftig, fast maximal/);
    const txt = W.stepText(hillsSpec, hillsSpec.steps.find(s => (s.min || 0) < 1)!);
    expect(txt).not.toMatch(/Puls|\/km/); expect(txt).toMatch(/fast maximal/);
    // langsame „Pace“ bergauf eingetragen: kein Urteil „zu locker“
    const rows = stampRows([...Array(6)].map(() => ({ sec: 10, m: 30, pace: '5:33' })), plannedIntervals(hills, THR), 'run').map((r, i) => ({ ...r, ti: plannedIntervals(hills, THR).filter(x => !x.steady)[i].i }));
    const e = evaluateIntervals(hills, { metrics: { intervals: rows }, metricsSrc: { intervals: 'manual' } }, null, THR, 'run')!;
    expect(e.tooEasy).toBe(0); expect(e.tooHard).toBe(0);
  });
  it('lockerer Teil zählt nicht als Intervall (Ø, Anzahl, Runden für Scores)', () => {
    const targets = plannedIntervals(hills, THR);
    const st = { metrics: { intervals: stepOrder(targets).map(t => ({ ti: t.i, sec: t.sec, hr: t.steady ? 140 : 150 })) }, metricsSrc: { intervals: 'manual' } };
    const e = evaluateIntervals(hills, st, null, THR, 'run')!;
    expect(e.planned).toBe(6); expect(e.done).toBe(6); expect(e.work.hr).toBe(150);
    const laps = rowsToLaps(stampRows(st.metrics.intervals, targets, 'run'), 'run');
    expect(laps.filter(l => l.kind === 'work').length).toBe(6); expect(laps.filter(l => l.kind === 'steady').length).toBe(1);
  });
  it('ältere Liste (vor 3.26, ohne lockere Teile): Zuordnung bleibt, lockerer Teil wird an seiner Stelle eingefügt', () => {
    const targets = plannedIntervals(hills, THR);
    const hard = targets.filter(t => !t.steady);
    expect(hard.map(t => t.i)).toEqual([0, 1, 2, 3, 4, 5]); // alte ti bleiben gültig
    const old = hard.map(t => ({ ti: t.i, set: t.set, sec: 11 }));
    const r = ivRowsFor(hills, { metrics: { intervals: old }, metricsSrc: { intervals: 'manual' } }, null, THR, 'run');
    expect(r.rows.length).toBe(7); expect(r.rows[0].steady).toBe(true); expect(r.rows[1].sec).toBe(11);
  });
});

describe('Gemacht gilt überall', () => {
  // Rad 2 × 8 Sweet Spot → 3 × 10, Aufwärmen 10 statt 15
  const targets = plannedIntervals(ss, THR);
  const rows = stampRows([{ ti: 0, set: targets[0].set, sec: 600 }, { ti: 1, set: targets[0].set, sec: 600 }, { ti: null, set: targets[0].set, sec: 600 }], targets, 'bike');
  let st: any = { completed: true, metrics: { intervals: rows, sections: [{ part: 'warm', min: '10' }] }, metricsSrc: { intervals: 'manual', sections: 'manual' } };
  st = applyTotals(st, 'bike', rows, targets, ss);
  it('Titel, Änderungen, Gesamtdauer aus dem Ablauf', () => {
    const d = doneSummary(ss, st, null, THR, 'bike')!;
    expect(d.changed).toBe(true);
    expect(d.title).toBe('Rad 3 × 10 min Sweet Spot'); // Auftrag 41: kurz, Unterschied nur in „Anders als geplant“
    expect(d.changes).toContain('3 × 10 min statt 2 × 8 min');
    expect(d.changes).toContain('Aufwärmen 10 statt 15 min');
    expect(d.more).toBe('more');
    expect(doneSentence(d)).toBe('3 × 10 min statt 2 × 8 min – mehr Sweet-Spot-Zeit (30 min statt 16 min), gut. Aufwärmen 10 statt 15 min.');
    // 10 + 3×10 + 2 Pausen à 4 + Ausklang 10 (wie geplant)
    expect(st.metrics.min).toBe('58');
  });
  it('Belastung steigt gegenüber dem Plan', () => {
    const planned = C.sessionLoad(ss, { completed: true }, { ftp: 250, lthrBike: 160 });
    const done = C.sessionLoad(ss, st, { ftp: 250, lthrBike: 160 });
    expect(done).toBeGreaterThan(planned);
  });
  it('ohne Werte abgehakt: still wie geplant, Summe = Einheit', () => {
    const t = totalsFromSections([], 'bike', stepOrder(targets).map(x => ({ ti: x.i })), targets, ss);
    expect(t.min).toBe(String(ss.plannedMinutes));
    expect(doneSummary(ss, { completed: true }, null, THR, 'bike')!.changed).toBe(false);
  });
});

/* Auftrag 38, Punkt 5: alle Einheiten der Bibliothek – kurze Wiederholungen (unter 1 min) ohne Puls-Ziel, bergauf ohne Tempo-Ziel,
   stattdessen Ausführung; Ablauf-Summe = Einheit (Plan). */
import { WORKOUTS } from '../../shared/workoutlib';
import { runQualitySpec, bikeQualitySpec, bikeEasyForm, longFinish, bikeLongBlocks } from '../../shared/workoutbuild';
describe('Bibliothek: kurze und Berg-Wiederholungen, Summe', () => {
  const specs: { key: string; spec: W.Spec }[] = [];
  for (const w of WORKOUTS) for (let stage = 0; stage < (w.stages || ['x']).length; stage++) {
    let sp: W.Spec | null = null;
    if (w.sport === 'run') sp = runQualitySpec(w.key, stage, CTX, 'olympic') || runEasyForm(w.key, stage, CTX, 50) || (w.key === 'run.longfinish' ? longFinish(CTX, 90, stage, 'marathon') : null);
    if (w.sport === 'bike') sp = bikeQualitySpec(w.key, stage, CTX, 'olympic', { total: 90 }) || bikeEasyForm(w.key, stage, CTX, 60) || (w.key === 'bike.racepaceblocks' ? bikeLongBlocks(CTX, 150, stage) : null);
    if (sp) specs.push({ key: `${w.key}#${stage}`, spec: sp });
  }
  it('genug Einheiten geprüft', () => { expect(specs.length).toBeGreaterThan(40); });
  it('Text und Ziele: unter 1 min kein Puls, bergauf keine Pace', () => {
    const bad: string[] = [];
    for (const { key, spec } of specs) {
      for (const s of spec.steps) {
        if (s.part !== 'main') continue;
        const txt = W.stepText(spec, s);
        if (W.isShortRep(spec, s) && /Puls \d/.test(txt)) bad.push(`${key}: Puls bei ${txt}`);
        if (W.isHillStep(spec, s) && /\d:\d\d.\d:\d\d\/km|km\/h/.test(txt)) bad.push(`${key}: Tempo bergauf bei ${txt}`);
        if ((W.isShortRep(spec, s) || W.isHillStep(spec, s)) && !W.repCue(spec, s)) bad.push(`${key}: ohne Ausführung`);
      }
      for (const t of plannedIntervals({ sport: spec.sport, spec }, THR)) {
        if (t.sec != null && t.sec < 60 && t.hr) bad.push(`${key}: Puls-Ziel bei ${t.label}`);
        if (t.hill && (t.pace || t.speed)) bad.push(`${key}: Tempo-Ziel bergauf bei ${t.label}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('Ablauf-Summe = Dauer der Einheit (jede Bibliotheks-Einheit)', () => {
    const bad: string[] = [];
    for (const { key, spec } of specs) {
      const s = { sport: spec.sport, ...W.build(spec) };
      const t = totalsFromSections([], spec.sport, stepOrder(plannedIntervals(s, THR)).map(x => ({ ti: x.i })), plannedIntervals(s, THR), s);
      const ab = buildAblauf(s, {}, null, THR, spec.sport);
      const sum = Math.round(planSum(ab, s));
      if (Math.abs(sum - W.totals(spec).min) > 1) bad.push(`${key}: Ablauf ${sum} statt ${W.totals(spec).min} min`);
      if (t.min && Math.abs(+t.min - W.totals(spec).min) > 1) bad.push(`${key}: gemacht (wie geplant) ${t.min} statt ${W.totals(spec).min} min`);
    }
    expect(bad).toEqual([]);
  });
});
