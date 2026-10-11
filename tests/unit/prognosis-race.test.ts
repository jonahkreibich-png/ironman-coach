import { test, expect, describe } from 'vitest';
import { vdot, timeForVdot, prognosis, fmtDuration } from '../../shared/prognosis';
import { raceModeGoal, briefing, pacingPlan, packingList, recoveryPlan, raceReview, raceFuel } from '../../shared/race';
import { nutritionTargets, underEatingCheck, raceFuelPlan, mealsFor } from '../../shared/nutrition';

describe('Prognose', () => {
  test('VDOT: 5 km in 20 min ≈ 49,8, Umrechnung auf 10 km ≈ 41:2x', () => {
    expect(vdot(5000, 20)).toBeCloseTo(49.8, 0);
    const t = timeForVdot(10000, vdot(5000, 20));
    expect(t).toBeGreaterThan(41); expect(t).toBeLessThan(42);
  });
  test('Laufziel: alle Distanzen als Bereich', () => {
    const p = prognosis({ id: 'g', type: 'run_10k', name: '10 km', date: '2027-01-01', priority: 'A' }, { runThrSpeed: 1000 / 270, runEff: 1.1, bikeThrKmh: null, ftp: null, swimCss: null, nRun: 10, nBike: 0, nSwim: 0 });
    expect(p.ok).toBe(true); expect(p.confidence).toBe('hoch');
    expect(p.runDistances!.map(d => d.label)).toEqual(['5 km', '10 km', 'Halbmarathon', 'Marathon']);
    const tenK = p.total!;
    expect(tenK.low).toBeLessThan(tenK.best); expect(tenK.high).toBeGreaterThan(tenK.best);
    expect(fmtDuration(tenK.best)).toMatch(/^4\d:\d\d$/);
  });
  test('Triathlon: Disziplinen + Wechsel, Lauf mit Abschlag, Satz was am meisten bringt', () => {
    const p = prognosis({ id: 'g', type: 'tri_olympic', name: 'Olympisch', date: '2027-06-01', priority: 'A' }, { runThrSpeed: 1000 / 300, runEff: 1, bikeThrKmh: 32, ftp: null, swimCss: 115, nRun: 5, nBike: 5, nSwim: 4 });
    expect(p.parts!.map(x => x.label)).toEqual(['Schwimmen', 'Rad', 'Laufen', 'Wechsel']);
    expect(p.total!.best / 3600).toBeGreaterThan(2); expect(p.total!.best / 3600).toBeLessThan(3);
    expect(p.improve).toMatch(/Rad/);
    expect(p.confidence).toBe('mittel');
  });
  test('ohne Schwimmdaten: Hinweis auf den fehlenden Test statt Prognose', () => {
    const p = prognosis({ id: 'g', type: 'tri_sprint', name: 'Sprint', date: '2027-06-01', priority: 'A' }, { runThrSpeed: 3, runEff: 1, bikeThrKmh: 30, ftp: null, swimCss: null, nRun: 5, nBike: 5, nSwim: 0 });
    expect(p.ok).toBe(false); expect(p.missing![0]).toMatch(/Schwimmtest/);
  });
});

describe('Wettkampf-Modus', () => {
  const g = { id: 'g', type: 'tri_sprint' as const, name: 'Stadttriathlon', date: '2026-10-24', priority: 'A' as const };
  test('aktiv ab 14 Tagen vorher, nicht für C-Ziele', () => {
    expect(raceModeGoal([g], '2026-10-09')).toBeNull();
    expect(raceModeGoal([g], '2026-10-10')!.id).toBe('g');
    expect(raceModeGoal([{ ...g, priority: 'C' }], '2026-10-20')).toBeNull();
  });
  test('Briefings, Pacing, Checkliste mit Wechselzone, Erholung, Rückblick', () => {
    expect(briefing(g, '2026-10-23').title).toBe('Morgen ist es so weit');
    expect(briefing(g, '2026-10-24').title).toMatch(/Renntag/);
    const pace = pacingPlan(g, null, { lthrRun: 172, lthrBike: 165 });
    expect(pace.map(p => p.leg)).toEqual(expect.arrayContaining(['Schwimmen', 'Rad', 'Laufen']));
    expect(packingList(g).map(x => x.group)).toContain('Wechselzone');
    const rec = recoveryPlan(g, 1.4 * 3600);
    expect(rec[0].text).toMatch(/Ruhetag/); expect(rec.length).toBeGreaterThanOrEqual(4);
    expect(raceReview(g, { timeSec: 4000 }, { ok: true, confidence: 'mittel', total: { label: '', best: 4500, low: 4300, high: 4700 } })).toMatch(/schneller als die Prognose/);
    expect(raceFuel(g, null, 70, true).carbsPerHour).toBeLessThanOrEqual(60);
  });
});

describe('Ernährung', () => {
  test('Ziel beginnt beim Verbrauch, Training erhöht den Bedarf, harter Tag mehr Kohlenhydrate', () => {
    const rest = nutritionTargets({ age: 17, heightCm: 180, weightKg: 70, pal: 1.4, sessions: [], ill: false });
    const hard = nutritionTargets({ age: 17, heightCm: 180, weightKg: 70, pal: 1.4, sessions: [{ sport: 'bike', title: 'Sweet Spot 3×10', zone: 'Zone 3-4', minutes: 90 }], ill: false });
    expect(rest.type).toBe('rest'); expect(hard.type).toBe('hard');
    expect(hard.kcal[0]).toBeGreaterThan(rest.kcal[0] + 600);
    expect(hard.carbs[0]).toBe(420);
    expect(rest.kcal[0]).toBeGreaterThanOrEqual(Math.round(rest.tdee / 50) * 50 - 25);
  });
  test('Hinweis bei zu wenig Essen, bei Warnzeichen mit Hilfe-Nummer', () => {
    expect(underEatingCheck([{ kcal: 2000, low: 2800 }, { kcal: 2100, low: 2800 }, { kcal: 2000, low: 2800 }], false).level).toBe(1);
    const w = underEatingCheck([1, 2, 3, 4, 5].map(() => ({ kcal: 1500, low: 2800 })), true);
    expect(w.level).toBe(2); expect(w.text).toMatch(/116 111/);
  });
  test('Verpflegung im Rennen und vegetarische Vorschläge', () => {
    const f = raceFuelPlan({ durationMin: 180, weightKg: 70, minor: false, sport: 'tri', tempC: 28 });
    expect(f.carbsPerHour).toBe(75); expect(f.sodiumMgPerHour).toBe(700); expect(f.schedule.length).toBeGreaterThan(6);
    expect(mealsFor('main', { vegan: true }).every(m => m.vegan)).toBe(true);
  });
});
