/* Auftrag 40, Vorschlag 9: Zonen auch aus Triathlon-Rad/-Lauf und Freiwasser (mit denselben Faktoren wie die Prognose). */
import { test, expect, describe } from 'vitest';
import { raceTestUpdate, applyTestUpdate, thresholdPaceFromRace } from '../../shared/fields';
import { OFF_BIKE_BASE, TRI_BIKE_IF, OPEN_WATER_F, wetsuitF, swimRaceAdd } from '../../shared/prognosis';

const D = '2027-06-06', T = '2027-06-08';
const weeks = [{ weekNumber: 1, days: [{ date: D, sessions: [{ id: 'race-tri', sport: 'multi', race: true, goalId: 'g-tri', title: 'Olympische Distanz' }] }] }];
const tri = (extra: any = {}) => ({ id: 'g-tri', type: 'tri_olympic', name: 'Olympische Distanz', date: D, priority: 'A', result: { timeSec: 9600, splits: { swim: 1800, bike: 4500, run: 2700 } }, course: { swimVenue: 'open', wetsuit: true }, ...extra });
const state = (g: any, metrics: any = {}) => ({ goals: { [g.id]: g }, sessions: { 'race-tri': { completed: true, metrics } } });

describe('Vorschlag 9: Zonen aus allen Teilen eines Triathlons', () => {
  test('Freiwasser mit Neopren: CSS = Pace ÷ (Freiwasser × Neopren) − Strecken-Zuschlag; eigener Merker je Sportart', () => {
    const prof: any = { thresholds: { cssSec: 115, thresholdPaceRunSec: 290, ftp: 230 }, appliedTests: [], powerMeter: true };
    const u = raceTestUpdate(state(tri()), weeks, prof, T)!;
    expect(u.sport).toBe('swim'); expect(u.sessionId).toBe('race:g-tri:swim');
    const want = Math.round(1800 / 15 / (OPEN_WATER_F * wetsuitF(115)) - swimRaceAdd(1.5));
    expect(u.thresholds.cssSec).toBe(want);
    expect(u.text).toMatch(/Freiwasser mit Neopren umgerechnet aufs Becken/);
  });
  test('danach Rad (Watt der Wettkampf-Einheit ÷ typische Triathlon-Intensität) und Lauf (Abschlag nach dem Rad herausgerechnet)', () => {
    let prof: any = { thresholds: { cssSec: 115, thresholdPaceRunSec: 290, ftp: 230 }, appliedTests: [], powerMeter: true };
    const st = state(tri(), { power: '200' });
    const s1 = raceTestUpdate(st, weeks, prof, T)!; prof = applyTestUpdate(prof, s1);
    const b = raceTestUpdate(st, weeks, prof, T)!;
    expect(b.sport).toBe('bike'); expect(b.thresholds.ftp).toBe(Math.round(200 / TRI_BIKE_IF.tri_olympic));
    expect(b.text).toMatch(/im Triathlon fährt man etwa 85 % der FTP/);
    prof = applyTestUpdate(prof, b);
    const r = raceTestUpdate(st, weeks, prof, T)!;
    expect(r.sport).toBe('run'); expect(r.sessionId).toBe('race:g-tri:run');
    expect(r.thresholds.thresholdPaceRunSec).toBe(thresholdPaceFromRace(10, 2700 / (1 + OFF_BIKE_BASE.tri_olympic)));
    // schneller als aus der reinen Laufzeit (der Abschlag nach dem Rad ist herausgerechnet)
    expect(r.thresholds.thresholdPaceRunSec).toBeLessThan(thresholdPaceFromRace(10, 2700)!);
    expect(r.text).toMatch(/nach dem Rad läuft man etwa 6 % langsamer/);
    prof = applyTestUpdate(prof, r);
    expect(raceTestUpdate(st, weeks, prof, T)).toBeNull(); // jeder Teil nur einmal
  });
  test('ohne Wattmesser: Rad-Teil ändert keine FTP, Lauf-Teil zählt trotzdem', () => {
    let prof: any = { thresholds: { cssSec: 115, thresholdPaceRunSec: 290 }, appliedTests: ['race:g-tri:swim'] };
    const u = raceTestUpdate(state(tri(), { power: '200' }), weeks, prof, T)!;
    expect(u.sport).toBe('run');
    prof = applyTestUpdate(prof, u);
    expect(raceTestUpdate(state(tri(), { power: '200' }), weeks, prof, T)).toBeNull();
  });
  test('unplausible Werte (über 25 % weg von der bisherigen Schwelle) ändern nichts; Duathlon-Lauf (zwei Lauf-Teile) zählt nicht', () => {
    const prof: any = { thresholds: { cssSec: 70, thresholdPaceRunSec: 200 }, appliedTests: [] };
    expect(raceTestUpdate(state(tri({ result: { timeSec: 9600, splits: { swim: 1800, run: 2700 } } })), weeks, prof, T)).toBeNull();
    const du = { id: 'g-tri', type: 'duathlon', name: 'Duathlon', date: D, priority: 'A', result: { timeSec: 4800, splits: { run: 1500 } } };
    expect(raceTestUpdate(state(du), weeks, { thresholds: { thresholdPaceRunSec: 290 }, appliedTests: [] }, T)).toBeNull();
  });
  test('alter Merker (Becken-Schwimmen vor Auftrag 40 als „race:<id>“): Schwimmen nicht doppelt', () => {
    const prof: any = { thresholds: { cssSec: 115, thresholdPaceRunSec: 290 }, appliedTests: ['race:g-tri'] };
    const u = raceTestUpdate(state(tri({ course: { swimVenue: 'pool' } })), weeks, prof, T)!;
    expect(u.sport).toBe('run');
  });
});
