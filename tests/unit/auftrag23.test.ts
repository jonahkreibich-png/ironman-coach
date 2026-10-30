/* Auftrag 23: Prognose für jedes Ziel, realistische Entwicklung über 3-36 Monate (Sportart, Niveau, Alter, Umfang), Vergleich mit typischen
   Zeiten, Wunschzeit je Disziplin ohne Plan-Änderung, „zuletzt aktualisiert“. */
import { describe, test, expect } from 'vitest';
import { prognosis, growthOf, sportShares, approxRange, goalsWithDates, goalPrognoses, lastMove, horizonOf, fmtDuration, type Prognosis } from '../../shared/prognosis';
import { wishCheck, realism, verdictOf } from '../../shared/goalcheck';
import { wishPacing } from '../../shared/race';
import { goalsChangePlan, type Goal } from '../../shared/goals';
import { generatePlan } from '../../shared/plangen';
import { defaultProfile } from '../../shared/profile';

const T = '2026-10-30';
const est = (o: any = {}): any => ({ runThrSpeed: null, runEff: null, bikeThrKmh: null, ftp: null, swimCss: null, nRun: 10, nBike: 10, nSwim: 10, runManual: 0, bikeManual: 0, swimManual: 0, runLatest: T, bikeLatest: T, swimLatest: T, swimCanCrawl: true, ...o });
const P = (o: any = {}): any => ({ weightKg: 75, sex: 'm', birthYear: 1996, weeklyHours: 10, sports: ['swim', 'bike', 'run'], bikes: ['road'], experienceYears: 3, thresholds: {}, skills: {}, ...o });
const LEVEL: Record<string, { e: any; p: any }> = {
  einsteiger: { e: est({ runThrSpeed: 1000 / 360, ftp: 165, swimCss: 150, swimContM: 400, runLongMin: 50, bikeLongMin: 90 }), p: P({ weeklyHours: 7, experienceYears: 0 }) },
  mittel: { e: est({ runThrSpeed: 1000 / 300, ftp: 220, swimCss: 115, swimContM: 2000, runLongMin: 90, bikeLongMin: 180 }), p: P({ weeklyHours: 10 }) },
  stark: { e: est({ runThrSpeed: 1000 / 245, ftp: 290, swimCss: 92, swimContM: 4000, runLongMin: 150, bikeLongMin: 300 }), p: P({ weeklyHours: 15, experienceYears: 8 }) }
};
const inMonths = (m: number) => { const d = new Date(Date.parse(T + 'T12:00:00Z')); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10); };
const goal = (type: any, date: string | null = null, o: any = {}): Goal => ({ id: 'g-' + type, type, name: type, date, priority: 'A', ...o });
const H = (h: number, m = 0) => h * 3600 + m * 60;
const progAt = (lvl: string, type: string, months: number, age = 30) => {
  const x = LEVEL[lvl];
  const p = prognosis(goal(type, months ? inMonths(months) : null), x.e, { profile: { ...x.p, birthYear: 2026 - age }, today: T, plan: { bricksDone: lvl === 'einsteiger' ? 0 : 4 } });
  return months ? p.race!.total : p.total!;
};

describe('Vergleich mit typischen Zeiten (Männer, 30 Jahre, heute)', () => {
  // Bereiche aus Ergebnislisten (Altersklassen): Einsteiger / solide Hobbysportler / starke Amateure
  const REF: Record<string, Record<string, [number, number]>> = {
    run_half: { einsteiger: [H(2, 5), H(2, 35)], mittel: [H(1, 40), H(1, 58)], stark: [H(1, 18), H(1, 35)] },
    tri_olympic: { einsteiger: [H(2, 55), H(3, 35)], mittel: [H(2, 25), H(2, 55)], stark: [H(2, 0), H(2, 25)] },
    tri_middle: { einsteiger: [H(6, 0), H(7, 45)], mittel: [H(5, 0), H(6, 10)], stark: [H(4, 20), H(5, 5)] },
    tri_long: { einsteiger: [H(13, 0), H(16, 30)], mittel: [H(10, 45), H(12, 45)], stark: [H(9, 15), H(10, 45)] }
  };
  for (const [type, by] of Object.entries(REF)) for (const [lvl, [lo, hi]] of Object.entries(by)) test(`${type} ${lvl}: ${fmtDuration(lo)}-${fmtDuration(hi)}`, () => {
    const t = progAt(lvl, type, 0).best;
    expect(t).toBeGreaterThan(lo); expect(t).toBeLessThan(hi);
  });
});

describe('Entwicklung über 3, 6, 12, 24, 36 Monate', () => {
  const M = [3, 6, 12, 24, 36];
  test('Einsteiger werden stetig schneller, der Zuwachs pro Jahr nimmt ab', () => {
    for (const type of ['run_half', 'tri_olympic', 'tri_middle', 'tri_long']) {
      const t = [progAt('einsteiger', type, 0).best, ...M.map(m => progAt('einsteiger', type, m).best)];
      for (let i = 1; i < t.length; i++) expect(t[i], type + ' ' + i).toBeLessThan(t[i - 1]);
      const y1 = t[0] - t[3], y2 = t[3] - t[4], y3 = t[4] - t[5];
      expect(y2).toBeLessThan(y1); expect(y3).toBeLessThan(y2);
    }
  });
  test('Einsteiger entwickeln sich stärker als Erfahrene; Starke ab 50 kaum noch', () => {
    const rel = (lvl: string, age = 30) => 1 - progAt(lvl, 'tri_long', 36, age).best / progAt(lvl, 'tri_long', 0, age).best;
    expect(rel('einsteiger')).toBeGreaterThan(rel('mittel'));
    expect(rel('mittel')).toBeGreaterThan(rel('stark'));
    expect(Math.abs(rel('stark', 50))).toBeLessThan(0.02);
  });
  test('Jugendliche entwickeln sich schneller als Erwachsene, Erwachsene schneller als 50-Jährige', () => {
    const t = (age: number) => progAt('einsteiger', 'tri_olympic', 24, age).best;
    expect(t(17)).toBeLessThan(t(30)); expect(t(30)).toBeLessThan(t(50));
  });
  test('mehr geplanter Umfang = höhere Grenze', () => {
    const c = (h: number) => growthOf('run', 2.9, { age: 30, sex: 'm', weeklyHours: h, shares: sportShares(['swim', 'bike', 'run']) }, 3).gain;
    expect(c(5)).toBeLessThan(c(10)); expect(c(10)).toBeLessThan(c(15));
  });
  test('Schwimmtechnik: Einsteiger holen im Schwimmen relativ am meisten', () => {
    const g = (s: any, v: number) => growthOf(s, v, { age: 30, sex: 'm', weeklyHours: 8, shares: sportShares(['swim', 'bike', 'run']) }, 1).gain;
    expect(g('swim', 100 / 160)).toBeGreaterThan(g('run', 1000 / 380));
  });
  test('je weiter weg, desto breiter der Bereich; über 1 Jahr gerundet und Sicherheit niedrig', () => {
    const w = (m: number) => { const r = progAt('mittel', 'tri_middle', m); return (r.high - r.low) / r.best; };
    for (let i = 1; i < M.length; i++) expect(w(M[i])).toBeGreaterThan(w(M[i - 1]));
    const p = prognosis(goal('tri_long', inMonths(36)), LEVEL.mittel.e, { profile: LEVEL.mittel.p, today: T });
    expect(p.race!.horizon).toBe('lang'); expect(p.race!.confidence).toBe('niedrig');
    expect(p.race!.approx).toMatch(/^\d+(:\d\d)?–\d+(:\d\d)? h$/);
    expect(prognosis(goal('run_half', inMonths(4)), LEVEL.mittel.e, { profile: LEVEL.mittel.p, today: T }).race!.approx).toBeNull();
    expect(horizonOf(10)).toBe('kurz'); expect(horizonOf(40)).toBe('mittel'); expect(horizonOf(60)).toBe('lang');
  });
  test('keine unrealistischen Werte nach 3 Jahren (weder zu schnell noch zu langsam)', () => {
    expect(progAt('einsteiger', 'tri_long', 36, 17).best).toBeGreaterThan(H(10, 45));
    expect(progAt('einsteiger', 'tri_long', 36, 50).best).toBeLessThan(H(14));
    expect(progAt('stark', 'tri_long', 36, 17).best).toBeGreaterThan(H(8, 50));
    expect(progAt('einsteiger', 'run_half', 36, 17).best).toBeGreaterThan(H(1, 35));
    expect(progAt('stark', 'run_half', 36, 30).best).toBeGreaterThan(H(1, 15));
  });
  test('wer nur Brust schwimmt, lernt mit dem Plan Kraulen (ab 6 Monaten schneller als heute)', () => {
    const e = est({ runThrSpeed: 3.2, bikeThrKmh: 30, swimCss: null, swimCanCrawl: false, swimContM: 0 });
    const pr = P({ skills: { swimCrawl: 'no' }, thresholds: { breast100Sec: 170 } });
    const sw = (m: number) => { const p = prognosis(goal('tri_olympic', inMonths(m)), e, { profile: pr, today: T }); return p.race!.parts.find(x => x.sport === 'swim')!.best; };
    const today = prognosis(goal('tri_olympic'), e, { profile: pr, today: T }).parts!.find(x => x.sport === 'swim')!.best;
    expect(sw(3)).toBeGreaterThanOrEqual(today * 0.97);
    expect(sw(24)).toBeLessThan(today * 0.9);
  });
});

describe('Jonah (18 Jahre, 15 h/Woche, Kraul 100 m am Stück)', () => {
  const e = est({ runThrSpeed: 2.983, bikeThrKmh: 31.17, bikeMainKind: 'gravel', swimCss: 161, swimContM: 100, runLongMin: 64, runDec: 6.3, bikeLongMin: 95, nRun: 8, nBike: 11, nSwim: 11, runSpread: 0.0336, runManual: 0.0625, bikeManual: 0.045, swimManual: 0.136, runLatest: '2026-10-22', bikeLatest: '2026-10-28', swimLatest: '2026-10-27' });
  const pr = P({ birthYear: 2008, weeklyHours: 15, weightKg: 73, experienceYears: 11, bikes: ['gravel', 'trainer'], sports: ['swim', 'bike', 'run', 'strength', 'football'] });
  test('Ironman 15.9.2029: ca. 11-13 h statt 13:54', () => {
    const p = prognosis(goal('tri_long', '2029-09-15'), e, { profile: pr, today: T });
    expect(p.race!.total.best).toBeGreaterThan(H(11)); expect(p.race!.total.best).toBeLessThan(H(13));
    expect(p.race!.approx).toMatch(/^1[01](:30)?–1[34](:30)? h$/);
  });
  test('Halbmarathon 4.4.2027: 1:50-2:05, Wunschzeit 1:50 ambitioniert', () => {
    const g = goal('run_half', '2027-04-04', { targetTimeSec: 6600 });
    const p = prognosis(g, e, { profile: pr, today: T, plan: { longRunPlanned: 105 } });
    expect(p.race!.total.best).toBeGreaterThan(H(1, 50)); expect(p.race!.total.best).toBeLessThan(H(2, 5));
    expect(wishCheck(g, p)!.verdict).toBe('ambitioniert');
    expect(p.race!.runDistances!.map(x => x.label)).toEqual(['5 km', '10 km', 'Halbmarathon', 'Marathon']);
  });
});

describe('Prognose für jedes Ziel', () => {
  const gl: Goal[] = [
    goal('tri_long', '2029-09-15', { id: 'im' }), goal('run_half', '2027-04-04', { id: 'hm', priority: 'B' }),
    goal('tri_olympic', null, { id: 'oly', priority: 'B' }), goal('tri_sprint', null, { id: 'nodate', priority: 'C' }),
    goal('fitness', '2027-01-01', { id: 'fit' }), goal('run_10k', '2026-01-01', { id: 'past' }), goal('run_5k', '2027-01-10', { id: 'done', result: { timeSec: 1500 } })
  ];
  const meta = { placeholders: [{ id: 'oly', name: 'Olympisch', date: '2027-08-29' }] };
  test('nach Datum, das nächste zuerst; Platzhalter gekennzeichnet; ohne Termin, Fitness, vergangene und erledigte nicht', () => {
    const l = goalsWithDates(gl, meta, T);
    expect(l.map(x => x.goal.id)).toEqual(['hm', 'oly', 'im']);
    expect(l.find(x => x.goal.id === 'oly')!.placeholder).toBe(true);
    expect(l.find(x => x.goal.id === 'oly')!.goal.date).toBe('2027-08-29');
    expect(l.find(x => x.goal.id === 'hm')!.placeholder).toBe(false);
  });
  test('Hauptziel ohne Datum bekommt den Termin aus dem Plan als Platzhalter', () => {
    const l = goalsWithDates([goal('tri_middle', null, { id: 'a' })], { goalId: 'a', eventDate: '2028-06-18' }, T);
    expect(l[0]).toMatchObject({ placeholder: true, goal: { date: '2028-06-18' } });
  });
  test('jede Prognose eigenständig (eigene Distanz, eigener Renntag)', () => {
    const l = goalPrognoses(gl, meta, T, LEVEL.mittel.e, { profile: LEVEL.mittel.p });
    expect(l).toHaveLength(3);
    expect(l.map(x => x.p.race!.date)).toEqual(['2027-04-04', '2027-08-29', '2029-09-15']);
    expect(l[0].p.race!.total.best).toBeLessThan(l[1].p.race!.total.best);
  });
});

describe('Zuletzt aktualisiert: was die Prognose bewegt hat', () => {
  test('neuer schnellerer Lauf am 28.10. → Datum, Richtung und Grund', () => {
    const g = goal('run_half', '2027-04-04');
    const estAt = (d: string) => d >= '2026-10-28' ? est({ runThrSpeed: 1000 / 300, runLongMin: 80 }) : est({ runThrSpeed: 1000 / 310, runLongMin: 80 });
    const m = lastMove(g, estAt, ['2026-10-20', '2026-10-28', '2026-10-29'], { profile: P(), today: T })!;
    expect(m.date).toBe('2026-10-28'); expect(m.delta).toBeLessThan(0);
    expect(m.why.join(' ')).toMatch(/Lauf-Schwelle 5:10\/km → 5:00\/km/);
  });
  test('Wettkampf-Ergebnis zählt als Grund', () => {
    const g = goal('run_half', '2027-04-04');
    const m = lastMove(g, () => est({ runThrSpeed: 3.3 }), ['2026-10-25'], { profile: P(), today: T, corrAt: d => d >= '2026-10-25' ? { run: 1.05 } : null })!;
    expect(m.why.join(' ')).toMatch(/Wettkampf-Ergebnis/); expect(m.delta).toBeGreaterThan(0);
  });
  test('nichts geändert → null', () => {
    expect(lastMove(goal('run_half', '2027-04-04'), () => est({ runThrSpeed: 3.3 }), ['2026-10-25'], { profile: P(), today: T })).toBeNull();
  });
});

describe('Wunschzeit', () => {
  const p = (g: Goal): Prognosis => prognosis(g, LEVEL.mittel.e, { profile: LEVEL.mittel.p, today: T });
  test('Einordnung: realistisch / ambitioniert / sehr unwahrscheinlich', () => {
    const g = goal('tri_olympic', inMonths(8));
    const r = p(g).race!.total;
    expect(wishCheck({ ...g, targetTimeSec: r.best * 1.02 }, p(g))!.verdict).toBe('realistisch');
    expect(wishCheck({ ...g, targetTimeSec: (r.best + r.low) / 2 }, p(g))!.verdict).toBe('ambitioniert');
    expect(wishCheck({ ...g, targetTimeSec: r.low - (r.best - r.low) }, p(g))!.verdict).toBe('sehr unwahrscheinlich');
    expect(verdictOf(100, { best: 100, low: 90 })).toBe('realistisch');
    expect(verdictOf(88, { best: 100, low: 90 })).toBe('ambitioniert');
    expect(verdictOf(84, { best: 100, low: 90 })).toBe('sehr unwahrscheinlich');
  });
  test('je Disziplin: nötig vs. Prognose, Summe = Wunschzeit, größter Hebel benannt', () => {
    const g = { ...goal('tri_long', inMonths(20)), targetTimeSec: H(10, 30) };
    const w = wishCheck(g, p(g))!;
    expect(Math.abs(w.rows.reduce((a, r) => a + r.need, 0) - g.targetTimeSec)).toBeLessThan(2);
    expect(w.rows.filter(r => r.lever)).toHaveLength(1);
    expect(w.leverText).toMatch(/^Größter Hebel: (Schwimmen|Rad|Laufen) \(/);
    for (const r of w.rows) if (r.sport !== 'trans') expect(r.need).toBeLessThanOrEqual(r.pred + 1);
  });
  test('Wunschzeit je Disziplin wird übernommen', () => {
    const g = { ...goal('tri_olympic', inMonths(8)), splits: { swim: 1500 } };
    const w = wishCheck(g, p(g))!;
    expect(w.rows.find(r => r.sport === 'swim')!.need).toBe(1500);
    expect(w.rows.find(r => r.sport === 'bike')!.need).toBeCloseTo(w.rows.find(r => r.sport === 'bike')!.pred, 0);
  });
  test('Pacing zur Wunschzeit mit Warnung, wenn sie über der eigenen Leistung liegt', () => {
    const g = { ...goal('tri_olympic', inMonths(8)), targetTimeSec: p(goal('tri_olympic', inMonths(8))).race!.total.best * 0.9 };
    const w = wishCheck(g, p(g))!;
    const wp = wishPacing(g, p(g), w.rows, { lthrRun: 172, lthrBike: 165, ftp: 220 });
    expect(wp.segments.some(s => s.leg === 'Laufen' && /\/km/.test(s.target))).toBe(true);
    expect(wp.warnings.join(' ')).toMatch(/über deiner erwarteten Leistung/);
    const easy = { ...g, targetTimeSec: p(g).race!.total.best * 1.1 };
    expect(wishPacing(easy, p(easy), wishCheck(easy, p(easy))!.rows, { lthrRun: 172, lthrBike: 165, ftp: 220 }).warnings).toEqual([]);
  });
  test('Profil-Zeile („realistisch?“) nutzt dieselbe Prognose wie der Fortschritt', () => {
    const g = { ...goal('tri_olympic', inMonths(8)), targetTimeSec: H(2, 0) };
    const pr = p(g);
    expect(realism(g, LEVEL.mittel.p, T, pr)!.verdict).toBe(wishCheck(g, pr)!.verdict);
  });
  test('Wunschzeit ändert den Plan nicht (Umfang, Schwerpunkte, Wettkampf-Einheit)', () => {
    const prof = { ...defaultProfile(), birthYear: 1995, weeklyHours: 9, maxDayHours: 3, sports: ['swim', 'bike', 'run', 'strength'] as any, thresholds: { ...defaultProfile().thresholds, thresholdPaceRunSec: 330, thresholdSpeedBikeKmh: 28, cssSec: 140 } };
    const base = { id: 'g1', type: 'tri_olympic' as const, name: 'Olympische Distanz', date: '2027-03-21', priority: 'A' as const };
    const a = generatePlan({ profile: prof, goal: base, today: '2026-10-14', currentWeeklyHours: 6 });
    const b = generatePlan({ profile: prof, goal: { ...base, outcome: 'time', targetTimeSec: H(2, 10), splits: { swim: 1500 } }, today: '2026-10-14', currentWeeklyHours: 6 });
    const strip = (r: any) => JSON.stringify(r.plan.weeks);
    expect(strip(b)).toBe(strip(a));
  });
  test('Plan-relevante Ziel-Änderungen: nur Wunschzeit = nein, Datum = ja, ausgerichtet + Wunschzeit = ja', () => {
    const g = goal('tri_olympic', '2027-06-01', { id: 'x' });
    expect(goalsChangePlan([g], [{ ...g, targetTimeSec: 9000, outcome: 'time', why: 'Spaß', course: { tempC: 25 } }])).toBe(false);
    expect(goalsChangePlan([g], [{ ...g, date: '2027-06-08' }])).toBe(true);
    expect(goalsChangePlan([{ ...g, alignWish: true }], [{ ...g, alignWish: true, targetTimeSec: 9000 }])).toBe(true);
    expect(goalsChangePlan([g], [{ ...g, alignWish: true }])).toBe(true);
  });
});

test('gerundeter Bereich', () => {
  expect(approxRange(H(11, 4), H(13, 11))).toBe('11–13 h');
  expect(approxRange(H(10, 50), H(13, 20))).toBe('11–13:30 h');
  expect(approxRange(H(1, 52), H(2, 7))).toBe('1:50–2:05 h');
  expect(approxRange(22 * 60, 25 * 60)).toBe('22–25 min');
});

test('geplante lange Einheiten zählen (vorher als „hart“ übersehen), Tests und Wettkämpfe nicht', async () => {
  const { planFactsOf } = await import('../../shared/prognosis');
  const C = await import('../../shared/core');
  const s = [
    { id: 'a', date: '2026-11-10', sport: 'run', title: 'Lockerer Lauf', plannedMinutes: 45 },
    { id: 'b', date: '2027-02-28', sport: 'run', title: 'Langer Lauf 105 min mit 2×15 min Halbmarathon-Tempo', plannedMinutes: 105 },
    { id: 'c', date: '2027-01-10', sport: 'run', title: '30-min-Lauftest', plannedMinutes: 50 },
    { id: 'd', date: '2027-04-04', sport: 'run', title: 'Halbmarathon', plannedMinutes: 130, race: true },
    { id: 'e', date: '2026-12-05', sport: 'bike', title: 'Lange Ausfahrt', plannedMinutes: 150 },
    { id: 'f', date: '2026-10-20', sport: 'bike', title: 'Koppeltraining Rad + 15 min Lauf', plannedMinutes: 90 }
  ];
  const f = planFactsOf(s, x => x.id === 'f', {}, { id: 'g', type: 'run_half', name: 'HM', date: '2027-04-04', priority: 'B' }, '2026-10-30', C.isTestOrRace);
  expect(f).toEqual({ longRunPlanned: 105, longRidePlanned: 150, bricksDone: 1, bricksPlanned: 0 });
});
