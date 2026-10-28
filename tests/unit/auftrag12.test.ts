/* Auftrag 12: Rad-Geschwindigkeitszonen und genauere Prognose. Bekannte Beispiele, alle Test-Personen, keine unrealistischen Werte. */
import { test, expect, describe } from 'vitest';
import { bikeSpeedsOf, speedZonesFor, speedRange, kindOf, speedTrend, thrSpeedFromRide, mainKind } from '../../shared/bikespeed';
import { prognosis, updateCorrection, correctionFromGoals, speedAt, powerAt, raceSetup, fmtDuration } from '../../shared/prognosis';
import { estimatesAt } from '../../shared/scores';
import { runTestUpdate, applyTestUpdate } from '../../shared/fields';
import { trendThresholds } from '../../shared/refresh';
import { paceCtx } from '../../shared/plangen';
import * as W from '../../shared/workouts';
import { defaultProfile } from '../../shared/profile';
import { applyOnboarding } from '../../shared/onboarding';
import { PERSONAS, PERSONA_TODAY } from '../../fixtures/personas';
import { NEW_USERS as NEWUSERS, NEWUSER_TODAY } from '../../fixtures/newusers';
import { mainGoal } from '../../shared/goals';
import * as C from '../../shared/core';

const prof = (o: any = {}) => ({ ...defaultProfile(), birthYear: 1990, weightKg: 75, sports: ['swim', 'bike', 'run'] as any, ...o, thresholds: { ...defaultProfile().thresholds, lthrRun: 170, lthrBike: 162, thresholdPaceRunSec: 285, thresholdSpeedBikeKmh: 32, ...(o.thresholds || {}) } });

describe('Rad-Geschwindigkeitszonen', () => {
  test('Zone 2 bei 32 km/h Schwelle: 26-29 km/h auf flacher Strecke', () => {
    expect(speedRange(32, 2)).toBe('26–29 km/h');
    expect(speedZonesFor(32).map(z => z.zone)).toEqual([1, 2, 3, 4, 5]);
    expect(speedRange(32, 1)).toMatch(/^unter/); expect(speedRange(32, 5)).toMatch(/^über/);
  });
  test('getrennt je Rad: Gravel langsamer, drinnen virtuell wie Rennrad, eigene Werte gehen vor', () => {
    const p = prof({ bikes: ['road', 'gravel', 'trainer'] });
    expect(bikeSpeedsOf(p)).toMatchObject({ road: 32, gravel: 28.8, indoor: 32, main: 'road' });
    const g = prof({ bikes: ['gravel', 'trainer'], thresholds: { thresholdSpeedBikeKmh: 28 } });
    expect(mainKind(g)).toBe('gravel'); expect(bikeSpeedsOf(g)).toMatchObject({ gravel: 28, road: 31.1 });
    const own = prof({ bikes: ['road', 'gravel'], thresholds: { bikeSpeeds: { gravel: 27, indoor: 34 } } });
    expect(bikeSpeedsOf(own)).toMatchObject({ road: 32, gravel: 27, indoor: 34 });
  });
  test('Rad-Art aus Feld, Name oder Ort', () => {
    expect(kindOf({ indoor: true })).toBe('indoor'); expect(kindOf({ name: 'Zwift Watopia' })).toBe('indoor');
    expect(kindOf({ bikeType: 'gravel' })).toBe('gravel'); expect(kindOf({ title: 'Lange Ausfahrt (Rennrad)' })).toBe('road');
    expect(kindOf({}, { bikes: ['gravel'] })).toBe('gravel');
  });
  test('in den Einheiten: Puls/Watt zuerst, dann km/h flach mit Hinweis auf Wind und Steigung; drinnen ohne km/h', () => {
    const p = prof({ bikes: ['road', 'trainer'], powerMeter: true, thresholds: { ftp: 250 } });
    const out = W.build(W.bikeEasy(paceCtx(p, false, 'Rennrad', '2026-10-15'), 90));
    expect(out.description).toMatch(/W, Puls \d+–\d+, ca\. 26–29 km\/h flach/);
    expect(out.description).toMatch(/flache Strecken ohne Wind/);
    const ind = W.build(W.bikeEasy(paceCtx(p, true, 'Rolle', '2026-10-15'), 60));
    // Auftrag 21: drinnen nie km/h (auch nicht „virtuell“); Smart-Trainer mit Watt, einfache Rolle nur Puls und Gefühl
    expect(ind.description).not.toMatch(/km\/h/); expect(ind.description).not.toMatch(/ohne Wind/);
    expect(ind.description).toMatch(/\d+–\d+ W/);
    const basic = prof({ bikes: ['road', 'trainer'], powerMeter: false, trainerType: 'basic', thresholds: { ftp: 250, lthrBike: 165 } });
    const bi = W.build(W.bikeEasy(paceCtx(basic, true, 'Rolle', '2026-10-15'), 60));
    expect(bi.description).not.toMatch(/km\/h|\bW\b/);
    expect(bi.description).toMatch(/Puls \d+–\d+, Gefühl 3-4\/10/);
  });
  test('Gravel-Einheit rechnet mit dem Gravel-Tempo', () => {
    const p = prof({ bikes: ['road', 'gravel'] });
    expect(paceCtx(p, false, 'Gravelbike', '2026-10-15').bikeKmh).toBe(28.8);
  });
  test('nach dem Radtest: Schwellen-Tempo des benutzten Rads (20 min × 0,97)', () => {
    const p = prof({ bikes: ['gravel'] });
    const weeks = [{ days: [{ date: '2026-10-14', sessions: [{ id: 't1', sport: 'bike', title: 'Radtest 20 min' }] }] }];
    const u = runTestUpdate({ sessions: { t1: { completed: true, metrics: { testHr: '165', testSpeed: '30', bikeType: 'gravel', indoor: 'out' } } } }, weeks, p, '2026-10-15')!;
    expect(u.thresholds.bikeSpeeds).toEqual({ gravel: 29.1 }); expect(u.thresholds.thresholdSpeedBikeKmh).toBe(29.1);
    expect(u.text).toMatch(/Schwellen-Tempo Gravel 29,1 km\/h/);
    expect(applyTestUpdate(p, u).thresholds.bikeSpeeds.gravel).toBe(29.1);
  });
  test('Trend aus lockeren, flachen Fahrten (mindestens 3 je Rad), hügelige zählen nicht', () => {
    const ride = (d: number, o: any = {}) => ({ id: 'b' + d, sport: 'bike', date: C.addDays('2026-10-15', -d), min: 60, km: 25, speedKmh: 25, avgHr: 125, ascentM: 100, indoor: false, ...o });
    expect(thrSpeedFromRide(25, 125, 162)).toBeGreaterThan(29);
    const t = speedTrend([ride(2), ride(5), ride(9), ride(12, { ascentM: 900 })], 162, { bikes: ['road'] }, '2026-10-15', C.addDays);
    expect(t.road!.n).toBe(3);
    const p = prof({ bikes: ['road'], thresholds: { thresholdSpeedBikeKmh: 28 } });
    const acts = [2, 5, 9, 12].map(d => ride(d, { speedKmh: 23 })); // ≈ 29,1 km/h, +4 % (mehr als 10 % wird nicht automatisch übernommen)
    const tr = trendThresholds({ activities: Object.fromEntries(acts.map(a => [a.id, a])), sessions: {} }, [], p, null, '2026-10-15');
    expect(tr && tr.thresholds.bikeSpeeds && tr.thresholds.bikeSpeeds.road).toBeGreaterThan(28);
  });
});

const est = (o: any) => ({ runThrSpeed: null, runEff: null, bikeThrKmh: null, ftp: null, swimCss: null, nRun: 10, nBike: 10, nSwim: 10, runManual: 0, bikeManual: 0, swimManual: 0, runLatest: '2026-10-12', bikeLatest: '2026-10-12', swimLatest: '2026-10-12', swimCanCrawl: true, swimContM: 2000, ...o });
const g = (type: any, o: any = {}) => ({ id: 'g', type, name: type, date: '2027-06-01', priority: 'A' as const, ...o });
const P: any = { weightKg: 75, bikes: ['road'], experienceYears: 3, thresholds: {} };
const T = '2026-10-15';

describe('Prognose: bekannte Beispiele', () => {
  test('10 km in ~47 min → Halbmarathon ~1:43 (gute Ausdauer), Marathon ohne lange Läufe deutlich langsamer als mit', () => {
    const hm = prognosis(g('run_half'), est({ runThrSpeed: 1000 / 285, runLongMin: 110, runDec: 3 }), { profile: P, today: T });
    const tenK = hm.runDistances!.find(d => d.label === '10 km')!.best;
    expect(tenK / 60).toBeGreaterThan(46); expect(tenK / 60).toBeLessThan(48);
    expect(hm.total!.best / 60).toBeGreaterThan(100); expect(hm.total!.best / 60).toBeLessThan(106);
    const good = prognosis(g('run_marathon'), est({ runThrSpeed: 1000 / 285, runLongMin: 160, runDec: 3 }), { profile: P, today: T }).total!.best;
    const poor = prognosis(g('run_marathon'), est({ runThrSpeed: 1000 / 285, runLongMin: 45, runDec: 8 }), { profile: P, today: T }).total!.best;
    expect(good / 3600).toBeGreaterThan(3.45); expect(good / 3600).toBeLessThan(3.7);
    expect(poor - good).toBeGreaterThan(20 * 60);
    expect(prognosis(g('run_marathon'), est({ runThrSpeed: 1000 / 285, runLongMin: 45 }), { profile: P, today: T }).assumptions!.join(' ')).toMatch(/Riegel-Exponent 1,1[3-5]/);
  });
  test('typische Olympische Distanz: 2:20-2:45 bei CSS 1:45, FTP 230 W, Schwelle 4:45', () => {
    const p = prognosis(g('tri_olympic'), est({ runThrSpeed: 1000 / 285, ftp: 230, swimCss: 105, runLongMin: 80, bikeLongMin: 150 }), { profile: P, today: T, plan: { bricksDone: 4 } });
    expect(p.total!.best / 3600).toBeGreaterThan(2.33); expect(p.total!.best / 3600).toBeLessThan(2.75);
    expect(p.parts!.map(x => x.label)).toEqual(['Schwimmen', 'Rad', 'Laufen', 'Wechsel']);
    expect(p.bike!.watts).toBeGreaterThan(180); expect(p.bike!.kmh).toBeGreaterThan(30); expect(p.bike!.kmh).toBeLessThan(38);
  });
  test('Rad-Physik: 200 W, 80 kg auf dem Rennrad ≈ 33-35 km/h flach; Höhenmeter machen langsamer', () => {
    const v = speedAt(200, 80, raceSetup(['road'])) * 3.6; expect(v).toBeGreaterThan(32.5); expect(v).toBeLessThan(35.5);
    expect(Math.round(powerAt(v / 3.6, 80, raceSetup(['road'])))).toBe(200);
    const flat = prognosis(g('tri_olympic'), est({ runThrSpeed: 3.5, ftp: 230, swimCss: 105 }), { profile: P, today: T }).parts!.find(x => x.label === 'Rad')!.best;
    const hilly = prognosis(g('tri_olympic', { course: { bikeAscentM: 800 } }), est({ runThrSpeed: 3.5, ftp: 230, swimCss: 105 }), { profile: P, today: T }).parts!.find(x => x.label === 'Rad')!.best;
    expect(hilly - flat).toBeGreaterThan(4 * 60);
  });
  test('ohne Watt: Schwellen-Tempo des passenden Rads (Gravel als Rennrad umgerechnet, im Rennen auf dem Rennrad schneller)', () => {
    const onGravel = prognosis(g('tri_olympic'), est({ runThrSpeed: 3.5, bikeThrKmh: 31.1, bikeMainKind: 'gravel', swimCss: 110 }), { profile: { ...P, bikes: ['gravel'] }, today: T }).parts!.find(x => x.label === 'Rad')!.best;
    const onRoad = prognosis(g('tri_olympic'), est({ runThrSpeed: 3.5, bikeThrKmh: 31.1, bikeMainKind: 'gravel', swimCss: 110 }), { profile: { ...P, bikes: ['gravel', 'road'] }, today: T }).parts!.find(x => x.label === 'Rad')!.best;
    expect(onRoad).toBeLessThan(onGravel);
  });
  test('Lauf nach dem Rad: mehr Koppeltraining → kleinerer Abschlag', () => {
    const run = (b: number) => prognosis(g('tri_middle'), est({ runThrSpeed: 3.5, ftp: 230, swimCss: 105, runLongMin: 110, bikeLongMin: 200 }), { profile: P, today: T, plan: { bricksDone: b } }).parts!.find(x => x.label === 'Laufen')!.best;
    expect(run(0) - run(8)).toBeGreaterThan(60);
  });
  test('Strecke: Neopren schneller, Becken schneller als Freiwasser, Hitze langsamer', () => {
    const base = est({ runThrSpeed: 3.5, ftp: 230, swimCss: 110 });
    const sw = (c: any) => prognosis(g('tri_olympic', { course: c }), base, { profile: P, today: T }).parts!.find(x => x.label === 'Schwimmen')!.best;
    expect(sw({ wetsuit: true })).toBeLessThan(sw({ wetsuit: false }));
    expect(sw({ swimVenue: 'pool' })).toBeLessThan(sw({ swimVenue: 'open' }));
    const run = (c: any) => prognosis(g('tri_olympic', { course: c }), base, { profile: P, today: T }).parts!.find(x => x.label === 'Laufen')!.best;
    expect(run({ tempC: 30 })).toBeGreaterThan(run({ tempC: 18 }) * 1.03);
  });
  test('Schwimmen ohne CSS: aus 25-m-Zeit; wer nicht kraulen kann, bekommt eine Prognose mit Brust', () => {
    const c25 = prognosis(g('tri_sprint'), est({ runThrSpeed: 3.2, bikeThrKmh: 30, swimCss: null, swimCanCrawl: true, swimContM: 800 }), { profile: { ...P, thresholds: { crawl25Sec: 30 } }, today: T });
    expect(c25.ok).toBe(true); expect(c25.parts![0].best / 60).toBeGreaterThan(12); expect(c25.parts![0].best / 60).toBeLessThan(20);
    const br = prognosis(g('tri_sprint'), est({ runThrSpeed: 3.2, bikeThrKmh: 30, swimCss: null, swimCanCrawl: false, swimContM: 0 }), { profile: { ...P, skills: { swimCrawl: 'no' }, thresholds: { breast100Sec: 170, estimated: ['cssSec'] } }, today: T });
    expect(br.parts![0].note).toBe('Brust'); expect(br.missing!.join(' ')).toMatch(/Brust-Test/);
    const mix = prognosis(g('tri_olympic'), est({ runThrSpeed: 3.2, bikeThrKmh: 30, swimCss: 150, swimCanCrawl: true, swimContM: 100 }), { profile: P, today: T });
    expect(mix.parts![0].note).toMatch(/Kraul, Rest Brust/);
  });
  test('ohne Tests: Prognose trotzdem, mit breiterem Bereich und Hinweis auf den passenden Test', () => {
    const pr = { ...P, thresholds: { thresholdPaceRunSec: 330, thresholdSpeedBikeKmh: 27, estimated: ['thresholdPaceRunSec', 'thresholdSpeedBikeKmh', 'cssSec'] } };
    const none = prognosis(g('tri_sprint'), est({ runThrSpeed: null, bikeThrKmh: null, nRun: 0, nBike: 0, nSwim: 0, runManual: 1, bikeManual: 1, swimManual: 1 }), { profile: pr, today: T });
    const data = prognosis(g('tri_sprint'), est({ runThrSpeed: 1000 / 330, bikeThrKmh: 27, swimCss: 130 }), { profile: P, today: T });
    expect(none.ok).toBe(true); expect(none.confidence).toBe('niedrig');
    const w = (p: any) => (p.total.high - p.total.low) / p.total.best; expect(w(none)).toBeGreaterThan(w(data) * 1.5);
    expect(none.missing!.join(' ')).toMatch(/30-min-Lauftest/); expect(none.missing!.join(' ')).toMatch(/20-min-Radtest/);
  });
  test('heute und am Renntag: Fortschritt der letzten Wochen, abgeflacht; Renntag-Bereich breiter', () => {
    const now = est({ runThrSpeed: 1000 / 300, ftp: 220, swimCss: 110, runLongMin: 70, bikeLongMin: 120 });
    const then = est({ runThrSpeed: 1000 / 310, ftp: 210, swimCss: 114 });
    const p = prognosis(g('tri_olympic', { date: '2027-06-01' }), now, { profile: P, today: T, history: [{ date: '2026-08-06', est: then }], plan: { longRunPlanned: 90, longRidePlanned: 180, bricksPlanned: 10 } });
    expect(p.race!.date).toBe('2027-06-01');
    expect(p.race!.total.best).toBeLessThan(p.total!.best);
    expect(p.total!.best - p.race!.total.best).toBeLessThan(p.total!.best * 0.15);
    expect((p.race!.total.high - p.race!.total.low)).toBeGreaterThan(p.total!.high - p.total!.low);
  });
  test('was am meisten bringt: konkrete Einheit, Ausdauer bei langen Distanzen', () => {
    const p = prognosis(g('run_marathon'), est({ runThrSpeed: 1000 / 285, runLongMin: 45 }), { profile: P, today: T });
    expect(p.improve).toMatch(/langer Lauf Schritt für Schritt bis 150 min/);
    const o = prognosis(g('tri_olympic'), est({ runThrSpeed: 1000 / 285, ftp: 230, swimCss: 105, runLongMin: 80 }), { profile: P, today: T });
    expect(o.improve).toMatch(/z\. B\./);
  });
  test('lernt aus Wettkämpfen: Abweichung → Korrekturfaktor je Disziplin (halbes Gewicht, 0,85-1,15)', () => {
    expect(updateCorrection(null, { swim: 1800, bike: 4200, run: 2700 }, { swim: 1800 * 1.1, bike: 4200 * 0.96, run: 2700 })).toEqual({ swim: 1.05, bike: 0.98, run: 1 });
    const goals: any[] = [{ id: 'a', type: 'tri_olympic', name: 'A', date: '2026-07-01', priority: 'A', result: { timeSec: 9000, splits: { swim: 1980, run: 2970 }, predicted: { total: 8800, swim: 1800, bike: 4200, run: 2700 } } }];
    const c = correctionFromGoals(goals)!; expect(c.swim).toBeCloseTo(1.05, 2); expect(c.run).toBeCloseTo(1.05, 2); expect(c.bike).toBeUndefined();
    const base = est({ runThrSpeed: 3.5, ftp: 230, swimCss: 105 });
    const a = prognosis(g('tri_olympic'), base, { profile: P, today: T }), b = prognosis(g('tri_olympic'), base, { profile: P, today: T, correction: c });
    expect(b.parts![0].best / a.parts![0].best).toBeCloseTo(1.05, 2);
    const run10: any[] = [{ id: 'r', type: 'run_10k', name: '10', date: '2026-09-01', priority: 'B', result: { timeSec: 2900, predicted: { total: 2800, run: 2800 } } }];
    expect(correctionFromGoals(run10)!.run).toBeGreaterThan(1);
  });
  test('Sicherheit: Werte von Hand und alte Daten machen den Bereich breiter', () => {
    const w = (o: any) => { const p = prognosis(g('run_10k'), est({ runThrSpeed: 3.5, ...o }), { profile: P, today: T }); return p.total!.high - p.total!.low; };
    expect(w({ runManual: 1 })).toBeGreaterThan(w({ runManual: 0 }));
    expect(w({ runLatest: '2026-08-01' })).toBeGreaterThan(w({}));
    expect(w({ runSpread: 0.05 })).toBeGreaterThan(w({}));
  });
});

describe('Prognose für alle Test-Personen: immer da, nie unrealistisch', () => {
  const all = [...PERSONAS.map(p => ({ id: p.id, answers: p.answers, today: PERSONA_TODAY })), ...NEWUSERS.map((p: any) => ({ id: p.id, answers: p.answers, today: NEWUSER_TODAY }))];
  // grobe Grenzen: schneller als Weltklasse oder langsamer als Zielschluss wäre unrealistisch
  const LIM: Record<string, [number, number]> = { run_5k: [13, 50], run_10k: [27, 100], run_half: [58, 220], run_marathon: [125, 420], tri_supersprint: [20, 110], tri_sprint: [52, 200], tri_olympic: [105, 270], tri_middle: [225, 510], tri_long: [470, 1020], duathlon: [55, 200], aquathlon: [25, 120], bike_event: [100, 800], swim_goal: [15, 90] };
  for (const p of all) test(p.id, () => {
    const r = applyOnboarding(p.answers, p.today);
    for (const goal of r.goals.filter((x: any) => x.type !== 'fitness')) {
      const e = estimatesAt({ today: p.today, activities: [], trend: [], illness: [], profile: r.profile, goal }, p.today);
      const pr = prognosis(goal, e, { profile: r.profile, today: p.today });
      expect(pr.ok).toBe(true);
      const min = pr.total!.best / 60; const [lo, hi] = LIM[goal.type] || [10, 2000];
      expect(min, `${goal.name}: ${fmtDuration(pr.total!.best)}`).toBeGreaterThan(lo); expect(min, `${goal.name}: ${fmtDuration(pr.total!.best)}`).toBeLessThan(hi);
      expect(pr.total!.low).toBeLessThan(pr.total!.best); expect(pr.total!.high).toBeGreaterThan(pr.total!.best);
      if (goal.date && goal.date > p.today) expect(pr.race).toBeTruthy();
      expect(JSON.stringify(pr)).not.toMatch(/NaN|Infinity/);
    }
    void mainGoal;
  });
});
