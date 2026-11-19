/* Auftrag 35, Punkt 3: Minuten- oder km-Ansicht – gleiche Einheit, Summen passen zusammen, Intervalle in Metern mit Zeit pro Stück */
import { test, expect } from 'vitest';
import * as W from '../../shared/workouts';
import { kmPlan, totalLine, roundKm, paceEstimated } from '../../shared/kmview';

const ctx: W.PaceCtx = { runThrSec: 300, lthrRun: 170, lthrBike: 160, bikeKmh: 30 };

test('Intervalle: „4 × 600 m in ca. 2:55“, Trabpause in Metern, Zieltempo aus der eigenen Schwelle', () => {
  const k = kmPlan(W.runIntervals(ctx, 4, 3, 2, 4))!;
  const main = k.lines.find(l => l.part === 'main')!;
  expect(main.text).toMatch(/^4 × 600 m an der Schwelle in ca\. 3:0\d \(4:5\d–5:1\d\/km\), dazwischen 300 m traben$/);
  expect(k.lines[0].text).toMatch(/^[\d,]+ km einlaufen/);
});

test('Gesamtstrecke und -dauer passen in beiden Ansichten zusammen (alle Lauf- und Radbausteine)', () => {
  const specs = [W.runEasy(ctx, 45), W.runLong(ctx, 90), W.runIntervals(ctx, 5, 4, 2), W.runTempo(ctx, 20), W.bikeEasy(ctx, 60), W.bikeLong(ctx, 150), W.bikeIntervals(ctx, 4, 8, 4, 4), W.bikeSweetSpot(ctx, 3, 12, 75)];
  for (const s of specs) {
    const t = W.totals(s); const k = kmPlan(s)!;
    expect(Math.abs(k.min - t.min) / t.min, `${s.kind} Minuten`).toBeLessThan(0.06);
    expect(Math.abs(k.km - t.km!) / t.km!, `${s.kind} km`).toBeLessThan(0.06);
    // Gesamtzeilen nennen dieselbe Strecke
    const kmTxt = String(k.km).replace('.', ',');
    expect(totalLine(s, 'min', t.min)).toBe(`${t.min} min, ca. ${kmTxt} km`);
    expect(totalLine(s, 'km', t.min)).toBe(`${kmTxt} km, ca. ${k.min} min`);
  }
});

test('Ohne gemessene Schwelle: „geschätzt – nach Gefühl“, Rolle drinnen und Lauf-Geh-Wechsel bleiben in Minuten', () => {
  const k = kmPlan(W.runTempo(ctx, 20), { estimated: true })!;
  expect(k.lines.find(l => l.part === 'main')!.text).toContain('geschätzt – nach Gefühl 5-6/10');
  expect(kmPlan(W.bikeEasy({ ...ctx, indoor: true }, 60))).toBeNull();
  expect(kmPlan({ sport: 'run', kind: 'runwalk', ctx, steps: [{ part: 'main', reps: 6, min: 2, walkMin: 1, zone: 2 }] })).toBeNull();
  expect(paceEstimated({ thresholds: { estimated: ['thresholdPaceRunSec'] } }, 'run')).toBe(true);
  expect(paceEstimated({ thresholds: { estimated: [] } }, 'run')).toBe(false);
});

test('Kurzzeile und Runden', () => {
  expect(roundKm('run', 0.62)).toBe(0.6); expect(roundKm('run', 0.07)).toBe(0.05); expect(roundKm('run', 7.3)).toBe(7.5); expect(roundKm('bike', 23.4)).toBe(23);
});
