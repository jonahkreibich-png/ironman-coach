/* Auftrag 36, Punkt 3: Prognose gegen bekannte Tabellen und Formeln prüfen – Daniels (VDOT), Riegel, Rad-Physik, typische Wechselzeiten,
   Freiwasser und Neopren – über viele Niveaus, Alter, Geschlechter und Ziele (5 km bis Ironman). Abweichungen sind erklärt (ERGEBNIS.md).
   Dazu: Abgleich Schwelle gegen VO2max der Uhr (Unsicherheit ehrlich, Test vorschlagen) und logische Bewegung bei Training, Pause, Krankheit. */
import { describe, expect, test } from 'vitest';
import { vdot, timeForVdot, riegel, prognosis, speedAt, raceSetup, runSourceCheck, thrSpeedForVdot, watchVo2max } from '../../shared/prognosis';
import { vdotFromThreshold } from '../../shared/vdot';
import type { Estimates } from '../../shared/scores';

const hms = (s: string) => s.split(':').reduce((a, x) => a * 60 + +x, 0);
const within = (got: number, want: number, tol: number) => expect(Math.abs(got / want - 1), `${got.toFixed(0)} statt ${want.toFixed(0)}`).toBeLessThanOrEqual(tol);
/* Daniels' Running Formula (3. Aufl.), Tabelle „VDOT values“ */
const DANIELS: Record<number, [string, string, string, string]> = {
  30: ['30:40', '63:46', '2:21:04', '4:49:17'], 40: ['24:08', '50:03', '1:50:59', '3:49:45'], 50: ['19:57', '41:21', '1:31:35', '3:10:49'],
  60: ['17:03', '35:22', '1:18:09', '2:43:25'], 70: ['14:55', '30:58', '1:08:21', '2:23:12']
};
const est = (o: Partial<Estimates> = {}): Estimates => ({ runThrSpeed: null, runEff: null, bikeThrKmh: null, ftp: null, swimCss: null, nRun: 20, nBike: 20, nSwim: 20, runManual: 0, bikeManual: 0, swimManual: 0, ...o });
const G = (type: string, date: string | null = null) => ({ id: 'g', type, name: type, date, priority: 'A' } as any);
const TODAY = '2026-11-16';

describe('Laufen gegen Daniels und Riegel', () => {
  test('timeForVdot trifft die Daniels-Tabelle (±1 %) für VDOT 30–70', () => {
    for (const [v, times] of Object.entries(DANIELS)) [5000, 10000, 21097.5, 42195].forEach((m, i) => within(timeForVdot(m, +v) * 60, hms(times[i]), 0.01));
  });
  test('Riegel 1,06: 10 km in 40:00 → Marathon 3:04 (Lehrbuchwert)', () => { within(riegel(2400, 10, 42.195), hms('3:04:09'), 0.002); });
  test('Prognose Marathon: gute Ausdauer ≈ Daniels; ohne lange Läufe deutlich langsamer (erklärter Riegel-Exponent)', () => {
    for (const v of [35, 45, 55]) {
      const sp = thrSpeedForVdot(v);
      const good = prognosis(G('run_marathon'), est({ runThrSpeed: sp, runLongMin: 160, runDec: 3 }), { today: TODAY, profile: { sports: ['run'] } as any }).total!.best;
      const none = prognosis(G('run_marathon'), est({ runThrSpeed: sp, runLongMin: 40, runDec: 9 }), { today: TODAY, profile: { sports: ['run'] } as any }).total!.best;
      within(good, timeForVdot(42195, vdotFromThreshold(sp)) * 60, 0.03);
      expect(none / good).toBeGreaterThan(1.05);
    }
  });
  test('Schwellen-Pace ≈ Daniels-T-Pace (±3 %): VDOT 50 → T ≈ 4:15/km', () => { within(1000 / thrSpeedForVdot(50), 255, 0.03); });
});

describe('Rad, Wechsel, Schwimmen', () => {
  test('Rad-Physik: 200 W, 72 kg + Rennrad flach ≈ 32–35 km/h; 250 W auf dem Zeitfahrrad ≈ 39–42 km/h (übliche Rechner)', () => {
    const v1 = speedAt(200, 80.5, raceSetup(['road'])) * 3.6, v2 = speedAt(250, 81, raceSetup(['tt'])) * 3.6;
    expect(v1).toBeGreaterThan(32); expect(v1).toBeLessThan(35);
    expect(v2).toBeGreaterThan(39); expect(v2).toBeLessThan(42);
  });
  test('Wechselzeiten im üblichen Bereich (Erfahrene): Sprint 2–5 min, Olympisch 3–6, Mitteldistanz 5–10, Langdistanz 8–15', () => {
    const tr = (type: string) => prognosis(G(type), est({ runThrSpeed: thrSpeedForVdot(45), bikeThrKmh: 31, swimCss: 115 }), { today: TODAY, profile: { sports: ['swim', 'bike', 'run'], experienceYears: 3, skills: { swimCrawl: 'yes', swimCrawlM: 4000 } } as any }).parts!.find(p => p.label === 'Wechsel')!.best / 60;
    const r: Record<string, [number, number]> = { tri_sprint: [2, 5], tri_olympic: [3, 6], tri_middle: [5, 10], tri_long: [8, 15] };
    for (const [k, [lo, hi]] of Object.entries(r)) { const m = tr(k); expect(m, k).toBeGreaterThanOrEqual(lo); expect(m, k).toBeLessThanOrEqual(hi); }
  });
  test('Freiwasser +3 % (ohne Wenden, Orientieren), Neopren 4–6 % schneller (schwächere Schwimmer mehr)', () => {
    const swim = (course: any, css: number) => prognosis({ ...G('tri_olympic'), course }, est({ runThrSpeed: thrSpeedForVdot(45), bikeThrKmh: 31, swimCss: css }), { today: TODAY, profile: { sports: ['swim', 'bike', 'run'], skills: { swimCrawl: 'yes', swimCrawlM: 2000 } } as any }).parts!.find(p => p.sport === 'swim')!.best;
    for (const css of [95, 130]) {
      const pool = swim({ swimVenue: 'pool' }, css), open = swim({ swimVenue: 'open' }, css), neo = swim({ swimVenue: 'open', wetsuit: true }, css);
      within(open / pool, 1.03, 0.002);
      expect(1 - neo / open).toBeGreaterThanOrEqual(0.04); expect(1 - neo / open).toBeLessThanOrEqual(0.06);
    }
  });
});

describe('Viele Niveaus, Alter, Geschlechter, Ziele: plausibel und richtig geordnet', () => {
  const LV = [{ n: 'Einsteiger', v: 32, kmh: 25, css: 160 }, { n: 'mittel', v: 45, kmh: 31, css: 115 }, { n: 'stark', v: 60, kmh: 37, css: 85 }];
  const GOALS: [string, number, number][] = [['run_5k', 14 * 60, 45 * 60], ['run_10k', 29 * 60, 95 * 60], ['run_half', 65 * 60, 3.4 * 3600], ['run_marathon', 2.2 * 3600, 7 * 3600],
    ['tri_sprint', 55 * 60, 2.4 * 3600], ['tri_olympic', 1.9 * 3600, 4.5 * 3600], ['tri_middle', 4 * 3600, 9.5 * 3600], ['tri_long', 8 * 3600, 17.5 * 3600]];
  for (const age of [16, 35, 65]) for (const sex of ['m', 'f']) test(`Alter ${age}, ${sex}: Zeiten im realistischen Bereich, stärker = schneller, länger = länger`, () => {
    const prof = (lv: typeof LV[0]) => ({ sports: ['swim', 'bike', 'run'], birthYear: 2026 - age, sex, weightKg: sex === 'f' ? 60 : 74, experienceYears: lv.v > 50 ? 5 : lv.v > 40 ? 2 : 0, skills: { swimCrawl: 'yes', swimCrawlM: lv.v > 40 ? 4000 : 400 } } as any);
    let prevGoal = 0;
    for (const [type, lo, hi] of GOALS) {
      const times = LV.map(lv => prognosis(G(type), est({ runThrSpeed: thrSpeedForVdot(lv.v), bikeThrKmh: lv.kmh, swimCss: lv.css, runLongMin: lv.v > 40 ? 150 : 60, bikeLongMin: lv.v > 40 ? 300 : 90, swimContM: lv.v > 40 ? 4000 : 400 }), { today: TODAY, profile: prof(lv) }));
      for (const p of times) { const t = p.total!; expect(t.low).toBeLessThanOrEqual(t.best); expect(t.high).toBeGreaterThanOrEqual(t.best); expect(t.best, type).toBeGreaterThan(lo); expect(t.best, type).toBeLessThan(hi); }
      expect(times[0].total!.best).toBeGreaterThan(times[1].total!.best); expect(times[1].total!.best).toBeGreaterThan(times[2].total!.best);
      if (type.startsWith('run_')) { expect(times[1].total!.best).toBeGreaterThan(prevGoal); prevGoal = times[1].total!.best; }
      if (type === 'tri_sprint') prevGoal = 0;
      if (type.startsWith('tri_')) { expect(times[1].total!.best).toBeGreaterThan(prevGoal); prevGoal = times[1].total!.best; }
    }
  });
});

describe('Quellen abgleichen (Schwelle gegen VO2max der Uhr)', () => {
  test('Nutzer-1-Fall: 5:39/km (hochgerechnet) gegen VO2max 57,5 → unsicher, Text mit beiden Werten, Test vorgeschlagen, Bereich breiter', () => {
    const prof: any = { sports: ['run'], thresholds: { thresholdPaceRunSec: 339, source: 'Trend aus deinen Einheiten (04.11.)', vo2max: 57.5, estimated: [] } };
    const ck = runSourceCheck(prof, { runThrSpeed: null }, { v: 57.5, date: '2026-11-10', from: 'Uhr' })!;
    expect(Math.round(ck.vdotThr)).toBe(35);
    expect(ck.uncertain).toBe(true); expect(ck.diffPct!).toBeGreaterThan(50);
    expect(ck.text).toContain('5:39/km'); expect(ck.text).toMatch(/VO2max 57,5 – das passt zu einer Schwelle von etwa 3:[45]\d\/km/);
    expect(ck.test).toMatch(/30-min-Lauftest/);
    const a = prognosis(G('run_10k'), est({ runThrSpeed: 1000 / 339 }), { today: TODAY, profile: prof });
    const b = prognosis(G('run_10k'), est({ runThrSpeed: 1000 / 339 }), { today: TODAY, profile: prof, vo2max: { v: 57.5, date: '2026-11-10', from: 'Uhr' } });
    expect((b.total!.high - b.total!.low)).toBeGreaterThan((a.total!.high - a.total!.low) * 1.5);
    expect(b.missing![0]).toMatch(/30-min-Lauftest/); expect(b.sources!.uncertain).toBe(true);
  });
  test('passende Werte (Lauftest, VO2max ±10 %): kein Hinweis', () => {
    const prof: any = { sports: ['run'], thresholds: { thresholdPaceRunSec: 255, source: 'Lauftest 01.11.', estimated: [] } };
    const ck = runSourceCheck(prof, { runThrSpeed: null }, { v: 53, date: TODAY, from: 'Uhr' })!;
    expect(ck.uncertain).toBe(false); expect(ck.text).toBeNull();
  });
  test('VO2max der Uhr: neuester Tageswert der letzten 120 Tage, sonst Profil', () => {
    expect(watchVo2max({ trend: [{ date: '2026-11-01', vo2max: 56.8 }, { date: '2026-11-10', vo2max: null }, { date: '2026-11-05', vo2max: '57,5' }] }, {}, TODAY)).toMatchObject({ v: 57.5, date: '2026-11-05' });
    expect(watchVo2max({ trend: [{ date: '2026-01-01', vo2max: 50 }] }, { thresholds: { vo2max: 52 } }, TODAY)).toMatchObject({ v: 52, from: 'Profil' });
    expect(watchVo2max({}, {}, TODAY)).toBeNull();
  });
});

describe('Bewegung der Prognose: Training, Pause, Krankheit', () => {
  const goal = G('run_half', '2027-04-11');
  const base = { runThrSpeed: 1000 / 300, runLongMin: 90, runDec: 5, runLatest: '2026-11-14' };
  const hist = (f: number) => [84, 56, 35].map(d => ({ date: new Date(Date.parse(TODAY + 'T12:00:00Z') - d * 864e5).toISOString().slice(0, 10), est: est({ ...base, runThrSpeed: base.runThrSpeed / (1 + f * d / 84), runLatest: TODAY }) }));
  const race = (e: Estimates, o: any = {}) => prognosis(goal, e, { today: TODAY, profile: { sports: ['run'], birthYear: 1990 } as any, ...o }).race!.total.best;
  test('gutes Training (eigener Aufwärtstrend) ≤ typische Entwicklung < nach 6 Wochen Pause; krank: Bereich breiter, nie schneller', () => {
    const typical = race(est(base));
    const improving = race(est(base), { history: hist(0.06) });
    const paused = race(est({ ...base, runLatest: '2026-10-05' }));
    expect(improving).toBeLessThanOrEqual(typical);
    expect(paused).toBeGreaterThan(typical);
    const ill = prognosis(goal, est(base), { today: TODAY, profile: { sports: ['run'], birthYear: 1990 } as any, ill: '2026-11-12' }).race!;
    expect(ill.total.best).toBeGreaterThanOrEqual(typical - 1);
  });
  test('heute schneller (Test/Wettkampf hebt die Schwelle) → Prognose schneller; kein Sprung ohne Grund (gleiche Werte = gleiche Zeit)', () => {
    expect(race(est({ ...base, runThrSpeed: base.runThrSpeed * 1.04 }))).toBeLessThan(race(est(base)));
    expect(race(est(base))).toBe(race(est(base)));
  });
});
