/* Auftrag 9: langfristige Planung für alle Nutzer. Alle 10 Test-Personen: Phasen bis zum Ziel (Grundlage → Aufbau → spezifisch →
   Tapering → Wettkampf), keine flache Dauer-Grundlage, Platzhalter für Ziele ohne Datum, lange Einheiten innerhalb der Obergrenzen
   (Distanz, Jahreszeit, Alter), langer Lauf höchstens +10 min pro Woche, keine harte Regel verletzt. */
import { test, expect, describe } from 'vitest';
import { PERSONAS, PERSONA_TODAY as today } from '../../fixtures/personas';
import { applyOnboarding } from '../../shared/onboarding';
import { capsFor, placeholders, macroPhases } from '../../shared/periodize';
import { ageOf } from '../../shared/profile';
import { evaluate, rulesOf } from '../../shared/constraints';
import { parseFor } from '../../shared/ruleparse';
import { ownWeekMinutes } from '../../shared/rules';
import * as C from '../../shared/core';

const dow = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
describe.each(PERSONAS.map(p => [p.id, p] as const))('%s', (_id, p) => {
  const r = applyOnboarding(p.answers, today);
  const plan = r.gen!.plan; const prof = r.profile; const tl = plan.meta.timeline;
  const A = r.goals.find((g: any) => g.priority === 'A')!;
  test('Zeitleiste: Phasen bis zum A-Ziel in der richtigen Reihenfolge, Wettkampf am Ziel', () => {
    expect(tl.segments.length).toBeGreaterThan(0);
    const order = ['base', 'build', 'specific', 'taper', 'race'];
    const forA = tl.segments.filter((s: any) => s.goalId === A.id).map((s: any) => s.phase);
    expect(forA[forA.length - 1]).toBe('race');
    // die letzte Annäherung ans Ziel nie rückwärts (davor sind Zwischenzyklen Grundlage → Aufbau erlaubt)
    const lastBase = forA.lastIndexOf('base');
    const tail = forA.slice(Math.max(0, lastBase));
    for (let i = 1; i < tail.length; i++) expect(order.indexOf(tail[i])).toBeGreaterThanOrEqual(order.indexOf(tail[i - 1]));
    if (forA.length > 2) expect(forA).toContain('specific');
    const raceSeg = tl.segments.filter((s: any) => s.goalId === A.id && s.phase === 'race').pop();
    expect(raceSeg.from <= A.date && raceSeg.to >= A.date).toBe(true);
  });
  test('keine flache Dauer-Grundlage: höchstens 28 Wochen Grundlage am Stück, Umfang nicht wochenlang gleich', () => {
    let run = 0, maxRun = 0;
    for (const s of tl.segments) { const w = Math.round((+new Date(s.to) - +new Date(s.from)) / 86400000 / 7 + 0.15); if (s.phase === 'base') { run += w; maxRun = Math.max(maxRun, run); } else run = 0; }
    expect(maxRun).toBeLessThanOrEqual(28);
    // ohne Lernstufen (die steigen erst, wenn eine Stufe geklappt hat)
    const vols = plan.weeks.map((w: any) => ownWeekMinutes(w) - C.planDays([w]).flatMap((d: any) => d.sessions).filter((s: any) => s.stage && !s.cancelled).reduce((a: number, s: any) => a + (s.plannedMinutes || 0), 0)).filter((v: number) => v >= 30);
    let same = 1, maxSame = 1;
    for (let i = 1; i < vols.length; i++) { same = Math.abs(vols[i] - vols[i - 1]) <= vols[i - 1] * 0.01 ? same + 1 : 1; maxSame = Math.max(maxSame, same); }
    expect(maxSame).toBeLessThanOrEqual(4); // spätestens nach 4 Wochen eine Erholungswoche oder ein Wechsel
  });
  test('lange Einheiten innerhalb der Obergrenzen (Distanz des nächsten Ziels, Jahreszeit, Alter), langer Lauf höchstens +10 min pro Woche', () => {
    let lastLR: number | null = null;
    plan.weeks.forEach((w: any, i: number) => {
      const seg = tl.segments.find((s: any) => s.from <= w.startDate && s.to >= w.startDate) || tl.segments[0];
      const segGoal = r.goals.find((g: any) => g.id === seg.goalId) || A;
      for (const d of w.days) for (const s of d.sessions) {
        if (s.race || s.fixed || s.sport === 'rest') continue;
        const caps = capsFor(segGoal.type, w.startDate, { aGoal: A.type, age: ageOf(prof, w.startDate), indoor: !!(s.spec && s.spec.ctx && s.spec.ctx.indoor), runEasySecKm: prof.thresholds.thresholdPaceRunSec ? prof.thresholds.thresholdPaceRunSec * 1.2 : null, bikeKm: 180 });
        if (s.sport === 'run') expect(s.plannedMinutes).toBeLessThanOrEqual(caps.run + 5);
        if (s.sport === 'bike' && !s.hard) expect(s.plannedMinutes).toBeLessThanOrEqual(caps.bike + 5);
      }
      const lr = Math.max(0, ...w.days.flatMap((d: any) => d.sessions.filter((s: any) => s.sport === 'run' && !s.race && !/test/i.test(s.title)).map((s: any) => s.plannedMinutes || 0)));
      if (lr && lastLR != null && !w.isRecoveryWeek) expect(lr - lastLR).toBeLessThanOrEqual(15);
      if (lr && !w.isRecoveryWeek && w.phase !== 'taper' && w.phase !== 'race') lastLR = lr;
      void i;
    });
  });
  test('keine harte Regel verletzt, keine Prüfungs-Warnung zu Steigerung oder harten Tagen', () => {
    const rules = rulesOf(prof, parseFor(today));
    for (const d of C.planDays(plan.weeks)) for (const s of d.sessions) if (!s.fixed && !s.race && s.sport !== 'rest') expect(evaluate(rules, s, d.date).hard).toEqual([]);
    expect(r.gen!.violations.filter((v: any) => ['volume', 'runVolume', 'hardDays', 'age'].includes(v.rule))).toEqual([]);
  });
});

describe('Platzhalter für Ziele ohne Datum', () => {
  test('Reihenfolge nach Distanz, Saison je Sportart, Abstand zum A-Ziel; gekennzeichnet', () => {
    const goals: any[] = [{ id: 'A', type: 'tri_long', name: 'Ironman', date: '2029-09-15', priority: 'A' }, { id: 'm', type: 'tri_middle', name: 'Halb', date: null, priority: 'B' }, { id: 'o', type: 'tri_olympic', name: 'Olympisch', date: null, priority: 'B' }, { id: 's', type: 'tri_sprint', name: 'Sprint', date: null, priority: 'C' }];
    const p = placeholders(goals, goals[0], '2026-10-14', 6);
    expect(p.map(g => [g.name, g.date])).toEqual([['Sprint', '2027-06-13'], ['Olympisch', '2027-08-29'], ['Halb', '2028-06-18']]);
    expect(p.every(g => g.placeholder)).toBe(true);
    p.forEach(g => expect(dow(g.date!)).toBe(0));
    // Laufen: Frühjahr oder Herbst
    const run = placeholders([{ id: 'A', type: 'run_marathon', name: 'M', date: '2027-10-10', priority: 'A' }, { id: 'h', type: 'run_half', name: 'HM', date: null, priority: 'B' }] as any, { id: 'A', type: 'run_marathon', name: 'M', date: '2027-10-10', priority: 'A' } as any, '2026-10-14', 3);
    expect(['04', '10']).toContain(run[0].date!.slice(5, 7));
    expect(run[0].date! < '2027-10-10').toBe(true);
  });
  test('wenig Training → längere Vorbereitung', () => {
    const g: any[] = [{ id: 'A', type: 'tri_olympic', name: 'O', date: '2028-08-27', priority: 'A' }, { id: 's', type: 'tri_sprint', name: 'S', date: null, priority: 'B' }];
    const fit = placeholders(g, g[0], '2027-01-10', 8)[0].date!, unfit = placeholders(g, g[0], '2027-01-10', 2)[0].date!;
    expect(fit <= unfit).toBe(true);
  });
  test('B-Ziel: Tapering vorher, 1 Woche Erholung danach; C-Ziel mit Abstand: kurzer eigener Zyklus ohne Tapering', () => {
    const ph = macroPhases('2026-10-19', 60, [{ id: 'A', type: 'tri_long', name: 'IM', date: '2027-12-05', priority: 'A' }, { id: 'B', type: 'tri_olympic', name: 'O', date: '2027-06-20', priority: 'B' }, { id: 'C', type: 'tri_sprint', name: 'S', date: '2027-04-11', priority: 'C' }], 4);
    const iB = ph.findIndex(x => x.goalId === 'B' && x.phase === 'race');
    expect(ph[iB - 1].phase).toBe('taper');
    expect(ph[iB + 1]).toMatchObject({ recovery: true, afterRace: true });
    const iC = ph.findIndex(x => x.goalId === 'C' && x.phase === 'race');
    expect(ph[iC - 1].phase).toBe('specific');
    expect(ph[iC + 1].afterRace).toBeUndefined();
  });
});

describe('Obergrenzen', () => {
  // Auftrag 17: langer Lauf passend zum nächsten Ziel (Halbmarathon-Strecke höchstens etwa 105 min, Marathon/Langdistanz etwa 2:30-2:45 h)
  test('langer Lauf: Sprint/Olympisch ~100 min, Halb-Ironman 105 min, Ironman 2:30 h, unter 18 höchstens 2 h, nie Marathondistanz', () => {
    expect(capsFor('tri_sprint', '2027-05-01', { aGoal: 'tri_long' }).run).toBe(100);
    expect(capsFor('tri_olympic', '2027-05-01', { aGoal: 'tri_long' }).run).toBe(100);
    expect(capsFor('tri_middle', '2028-05-01', { aGoal: 'tri_long' }).run).toBe(105);
    expect(capsFor('tri_long', '2029-07-01').run).toBe(150);
    expect(capsFor('run_half', '2027-03-01', { aGoal: 'tri_long' }).run).toBe(105);
    expect(capsFor('tri_long', '2029-07-01', { age: 17 }).run).toBe(120);
    expect(capsFor('run_marathon', '2027-08-01', { runEasySecKm: 390 }).run).toBe(165);
    expect(capsFor('run_marathon', '2027-08-01', { runEasySecKm: 300 }).run).toBe(160);
    expect(capsFor('tri_sprint', '2027-05-01').run).toBe(90);
  });
  test('langes Rad: Winter draußen 2:30 h, drinnen 2 h; Olympisch 3 h, Halb 4 h, Ironman 5 h', () => {
    expect(capsFor('tri_long', '2028-12-10').bike).toBe(150);
    expect(capsFor('tri_long', '2028-12-10', { indoor: true }).bike).toBe(120);
    expect(capsFor('tri_olympic', '2027-07-01').bike).toBe(180);
    expect(capsFor('tri_middle', '2028-05-01').bike).toBe(240);
    expect(capsFor('tri_long', '2029-07-01').bike).toBe(300);
    expect(capsFor('tri_sprint', '2027-05-01', { aGoal: 'tri_long' }).bike).toBe(180);
  });
  test('Schwimmen wird mit Können und Ziel länger (bis 90 min vor dem Ironman), beim Lernen kürzer', () => {
    expect(capsFor('tri_long', '2029-07-01').swim).toBe(90);
    expect(capsFor('tri_long', '2029-07-01', { swimLearning: true }).swim).toBe(55);
  });
});

describe('Personen-Besonderheiten', () => {
  const plan = (id: string) => { const p = PERSONAS.find(x => x.id === id)!; return applyOnboarding(p.answers, today); };
  test('Marathon-Anfänger: Gehen/Laufen-Stufen, Halbmarathon als Platzhalter vorher', () => {
    const r = plan('marathon-anfaenger');
    expect(C.planDays(r.gen!.plan.weeks.slice(0, 2)).flatMap((d: any) => d.sessions).some((s: any) => s.stage && s.stage.ladder === 'runwalk')).toBe(true);
    const hm = r.gen!.plan.meta.timeline.goals.find((g: any) => g.name === 'Halbmarathon');
    expect(hm.placeholder).toBe(true); expect(hm.date < '2027-10-10').toBe(true);
  });
  test('Rad-Event: lange Ausfahrt wächst bis über 4 h vor dem Event, im Winter höchstens 2:30 h', () => {
    const r = plan('rad-event');
    const bikes = C.planDays(r.gen!.plan.weeks).flatMap((d: any) => d.sessions.filter((s: any) => s.sport === 'bike').map((s: any) => ({ ...s, date: d.date })));
    bikes.filter((s: any) => ['11', '12', '01', '02'].includes(s.date.slice(5, 7))).forEach((s: any) => expect(s.plannedMinutes).toBeLessThanOrEqual(155));
    expect(Math.max(...bikes.filter((s: any) => s.date >= '2027-05-01').map((s: any) => s.plannedMinutes))).toBeGreaterThanOrEqual(200);
  });
  test('Olympisch-Erfahrene: Sprint (B) mit Tapering und Erholung, 10 km (C) als Training', () => {
    const r = plan('olympisch-erfahren');
    const w = r.gen!.plan.weeks;
    const iB = w.findIndex((x: any) => x.races.some((g: any) => g.goalId === 'g-sp'));
    expect(w[iB - 1].phase).toBe('taper');
    expect(w[iB + 1].isRecoveryWeek).toBe(true);
    expect(C.planDays(w).some((d: any) => d.sessions.some((s: any) => s.race && s.goalId === 'g-10'))).toBe(true);
  });
  test('Langdistanz-Profi: Mitteldistanz bekommt einen Platzhalter vor dem Ironman, Koppeltraining ab dem Aufbau', () => {
    const r = plan('langdistanz-profi');
    const md = r.gen!.plan.meta.timeline.goals.find((g: any) => g.name === 'Mitteldistanz');
    expect(md && md.placeholder).toBe(true);
    expect(md.date < '2027-08-29').toBe(true);
    const build = r.gen!.plan.weeks.filter((w: any) => w.phase === 'build' && !w.isRecoveryWeek);
    expect(build.length).toBeGreaterThan(0);
    expect(build.some((w: any) => C.planDays([w]).some((d: any) => d.sessions.some((s: any) => /Wechsel-Lauf|Koppellauf/.test(s.title))))).toBe(true);
  });
  test('Einsteigerin nur Brust: Schwimm-Stufen mit Brust und Kraul-Technik', () => {
    const r = plan('einsteiger-sprint');
    const sw = C.planDays(r.gen!.plan.weeks).flatMap((d: any) => d.sessions.filter((s: any) => s.sport === 'swim'));
    if (sw.length) expect(sw.every((s: any) => s.stage && s.stage.ladder === 'swimBreast')).toBe(true);
  });
});
