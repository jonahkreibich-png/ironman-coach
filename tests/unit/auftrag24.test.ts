/* Auftrag 24: „Wenn du heute starten würdest“ und „Erwartet am Wettkampftag“ dürfen nur kurz vor dem Rennen gleich sein.
   Ohne/mit wenig eigenem Trend typische Entwicklung (Niveau, Alter, Sportart, Umfang, Abstand), mit mehr eigenen Daten zählt der Trend mehr.
   Schlechter am Renntag nur bei Pause (mit Begründung). Prognosen nur für Ziele, die zu den gewählten Sportarten passen; keine fremde
   Sportart in Zeit, Teilen, Tipps oder Tests. Federmodell der Tab-Leiste (Überschwingen, Dehnung, Einrasten). */
import { test, expect, describe } from 'vitest';
import { prognosis, horizonSpread, approxRange, goalPrognoses, goalMismatches, ownTrend, develop, minGain, trendHistory, fmtDuration, type Prognosis } from '../../shared/prognosis';
import { missingSports, mismatchText, type Goal } from '../../shared/goals';
import { estimatesAt, type Estimates } from '../../shared/scores';
import { defaultProfile } from '../../shared/profile';
import { applyOnboarding } from '../../shared/onboarding';
import { PERSONAS, PERSONA_TODAY } from '../../fixtures/personas';
import { NEW_USERS, NEWUSER_TODAY } from '../../fixtures/newusers';
import { trajectory, stepSpring, settled, stretchOf, SP_GLIDE, type LensState } from '../../web/src/tablens';

const TODAY = '2026-10-30';
const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const prof = (o: any = {}) => ({ ...defaultProfile(), birthYear: 1985, sex: 'm', weightKg: 75, weeklyHours: 7, sports: ['swim', 'bike', 'run'] as any, ...o,
  thresholds: { ...defaultProfile().thresholds, lthrRun: 168, lthrBike: 160, thresholdPaceRunSec: 330, thresholdSpeedBikeKmh: 29, cssSec: 150, ...(o.thresholds || {}) } });
const est = (o: Partial<Estimates> = {}): Estimates => ({ runThrSpeed: 1000 / 330, runEff: null, bikeThrKmh: 29, ftp: null, swimCss: 150, nRun: 0, nBike: 0, nSwim: 0, swimCanCrawl: true, ...o });
const goal = (type: Goal['type'], date: string | null, o: Partial<Goal> = {}): Goal => ({ id: 'g-' + type, type, name: type, date, priority: 'A', ...o });
const raceBest = (p: Prognosis) => p.race!.total.best;

describe('heute ≠ Wettkampftag (außer kurz vorher)', () => {
  test('ohne eigene Daten: typische Entwicklung, Renntag schneller; Warum nennt „typische Entwicklung“', () => {
    for (const type of ['run_5k', 'run_half', 'tri_olympic', 'bike_event', 'swim_goal'] as const) {
      const p = prognosis(goal(type, addDays(TODAY, 274)), est(), { profile: prof(), today: TODAY });
      expect(p.ok).toBe(true);
      expect(raceBest(p), type).toBeLessThan(p.total!.best * 0.995);
      for (const part of p.parts!.filter(x => x.sport !== 'trans')) expect(p.race!.parts.find(r => r.label === part.label)!.best, `${type} ${part.label}`).toBeLessThan(part.best);
      expect(p.race!.growth!.every(g => g.basis === 'typisch')).toBe(true);
    }
  });
  test('Papa-Fall: Stand vor 70 Tagen ohne eigene Daten (Standardwerte) zählt nicht als Trend', () => {
    const now = est({ runThrSpeed: 1000 / 351, nRun: 6, nBike: 1, nSwim: 3, runLatest: addDays(TODAY, -3), bikeLatest: addDays(TODAY, -10), swimLatest: addDays(TODAY, -5) });
    const then = est({ runThrSpeed: 1000 / 319, bikeThrKmh: 27.5, swimCss: 170 });   // n = 0: Standardwerte, keine Messung
    const history = [{ date: addDays(TODAY, -70), est: then }];
    expect(ownTrend('run', now, history, TODAY)).toBeNull();
    const pa = prof({ birthYear: 1977, experienceYears: 3, sports: ['swim', 'bike', 'run', 'strength', 'football'] });
    const p = prognosis(goal('tri_olympic', '2027-07-18'), now, { profile: pa, today: TODAY, history });
    const without = prognosis(goal('tri_olympic', '2027-07-18'), now, { profile: pa, today: TODAY });
    expect(raceBest(p)).toBeCloseTo(raceBest(without), 0);
    expect(raceBest(p)).toBeLessThan(p.total!.best * 0.98);
    // jede Disziplin und der Wechsel am Renntag schneller als heute (vorher: Rad und Wechsel gleich)
    p.parts!.forEach((x, i) => expect(p.race!.parts[i].best, x.label).toBeLessThan(x.best));
  });
  test('Abstand: 8 Tage = praktisch gleich, 2 Wochen und 3 Jahre = besser, 3 Jahre deutlich', () => {
    const e = est({ nRun: 5, nBike: 5, nSwim: 5, runLatest: addDays(TODAY, -2), bikeLatest: addDays(TODAY, -2), swimLatest: addDays(TODAY, -2) });
    const at = (days: number) => prognosis(goal('run_10k', addDays(TODAY, days)), e, { profile: prof(), today: TODAY });
    const d3 = at(3); expect(d3.race).toBeNull();
    const d8 = at(8); expect(Math.abs(raceBest(d8) / d8.total!.best - 1)).toBeLessThan(0.002);
    const w2 = at(14); expect(raceBest(w2)).toBeLessThan(w2.total!.best); expect(w2.total!.best - raceBest(w2)).toBeGreaterThanOrEqual(1);
    const y3 = at(3 * 365); expect(raceBest(y3)).toBeLessThan(y3.total!.best * 0.95);
    expect(raceBest(y3)).toBeLessThan(raceBest(at(180)));
  });
  test('Niveau, Alter, Sportart: Einsteiger mehr als Erfahrene, Jüngere mehr als Ältere, Schwimm-Einsteiger am meisten', () => {
    const g = goal('tri_olympic', addDays(TODAY, 300));
    const gain = (p: Prognosis, sp: string) => p.race!.growth!.find(x => x.sport === sp)!.gain;
    const beg = prognosis(g, est({ runThrSpeed: 1000 / 390, swimCss: 190, bikeThrKmh: 25 }), { profile: prof(), today: TODAY });
    const exp = prognosis(g, est({ runThrSpeed: 1000 / 250, swimCss: 95, bikeThrKmh: 38 }), { profile: prof(), today: TODAY });
    for (const sp of ['run', 'bike', 'swim']) expect(gain(beg, sp), sp).toBeGreaterThan(gain(exp, sp));
    expect(gain(beg, 'swim')).toBeGreaterThan(gain(beg, 'run'));
    const young = prognosis(g, est(), { profile: prof({ birthYear: 2008 }), today: TODAY });
    const old = prognosis(g, est(), { profile: prof({ birthYear: 1966 }), today: TODAY });
    expect(gain(young, 'run')).toBeGreaterThan(gain(old, 'run'));
    // auch wer an der eigenen Grenze ist (erfahren, 60), wird mit dem Plan noch etwas besser, nicht schlechter
    const top = prognosis(g, est({ runThrSpeed: 1000 / 230, swimCss: 85, bikeThrKmh: 41 }), { profile: prof({ birthYear: 1966 }), today: TODAY });
    expect(raceBest(top)).toBeLessThan(top.total!.best);
    expect(minGain('run', 40, 60)).toBeGreaterThan(0);
  });
  test('mehr Umfang = mehr Entwicklung', () => {
    const g = goal('run_half', addDays(TODAY, 200));
    const lo = prognosis(g, est(), { profile: prof({ weeklyHours: 3 }), today: TODAY }), hi = prognosis(g, est(), { profile: prof({ weeklyHours: 12 }), today: TODAY });
    expect(raceBest(hi)).toBeLessThan(raceBest(lo));
  });
  test('eigener Trend: mit 12 Wochen Daten zählt er (Warum: „Trend der letzten 12 Wochen“), mit wenig Daten kaum; Bereich mit Trend schmaler', () => {
    const g = goal('run_10k', addDays(TODAY, 70));
    const now = est({ runThrSpeed: 1000 / 300, nRun: 14, runLatest: addDays(TODAY, -1) });
    const hist = [84, 56, 35].map(n => ({ date: addDays(TODAY, -n), est: est({ runThrSpeed: 1000 / (300 + n * 0.25), nRun: 12 }) }));
    const p = prognosis(g, now, { profile: prof({ sports: ['run'] }), today: TODAY, history: hist });
    const gr = p.race!.growth![0];
    expect(gr.basis).toBe('trend'); expect(gr.trendWeeks).toBe(12); expect(gr.trendShare!).toBeGreaterThan(0.3);
    const few = prognosis(g, est({ runThrSpeed: 1000 / 300, nRun: 3, runLatest: addDays(TODAY, -1) }), { profile: prof({ sports: ['run'] }), today: TODAY, history: [{ date: addDays(TODAY, -35), est: est({ runThrSpeed: 1000 / 309, nRun: 3 }) }] });
    expect(few.race!.growth![0].basis).toBe('typisch');
    const none = prognosis(g, now, { profile: prof({ sports: ['run'] }), today: TODAY });
    const w = (x: Prognosis) => (x.race!.total.high - x.race!.total.low) / x.race!.total.best;
    // ohne eigene Daten (nur typische Entwicklung) ist der Bereich breiter als mit Daten und Trend
    const blank = prognosis(g, est({ runThrSpeed: 1000 / 300 }), { profile: prof({ sports: ['run'] }), today: TODAY });
    expect(w(blank)).toBeGreaterThan(w(p));
    expect(horizonSpread(0.03, 10, 0.05, 0.25)).toBeLessThan(horizonSpread(0.03, 10, 0.05, 0.4));
    // schneller Trend → am Renntag schneller als nur typisch
    const fast = prognosis(g, now, { profile: prof({ sports: ['run'] }), today: TODAY, history: [84, 56].map(n => ({ date: addDays(TODAY, -n), est: est({ runThrSpeed: 1000 / (300 + n * 0.5), nRun: 12 }) })) });
    expect(raceBest(fast)).toBeLessThan(raceBest(none));
  });
  test('Pause: 4 Wochen ohne Einheit, Rennen in 3 Wochen → am Renntag langsamer, mit Begründung; krank ebenso', () => {
    const e = est({ nRun: 6, runLatest: addDays(TODAY, -28) });
    const p = prognosis(goal('run_10k', addDays(TODAY, 21)), e, { profile: prof({ sports: ['run'] }), today: TODAY });
    expect(raceBest(p)).toBeGreaterThan(p.total!.best);
    expect(p.race!.growth![0].basis).toBe('pause');
    expect(p.race!.notes!.join(' ')).toMatch(/keine Einheit.*langsamer als heute/);
    // weit weg: wieder aufgebaut, besser als heute
    const far = prognosis(goal('run_10k', addDays(TODAY, 300)), e, { profile: prof({ sports: ['run'] }), today: TODAY });
    expect(raceBest(far)).toBeLessThan(far.total!.best);
    // krank seit 10 Tagen, Rennen in 10 Tagen
    const ill = prognosis(goal('run_10k', addDays(TODAY, 10)), est({ nRun: 6, runLatest: addDays(TODAY, -10) }), { profile: prof({ sports: ['run'] }), today: TODAY, ill: addDays(TODAY, -10) });
    expect(raceBest(ill)).toBeGreaterThan(ill.total!.best);
    expect(ill.race!.notes!.join(' ')).toMatch(/gerade krank/);
    // kurz krank, Rennen weit weg: kein Pausen-Hinweis
    const shortIll = prognosis(goal('run_half', addDays(TODAY, 200)), est({ nRun: 6, runLatest: addDays(TODAY, -2) }), { profile: prof({ sports: ['run'] }), today: TODAY, ill: TODAY });
    expect(shortIll.race!.notes || []).toEqual([]);
  });
  test('develop: Pausen-Verlust höchstens 12 %, ohne Pause nie unter der Untergrenze', () => {
    const d = develop('run', est({ nRun: 5, runLatest: addDays(TODAY, -200) }), [], TODAY, 0.1, 2, 40, null, 0.45);
    expect(d.gain).toBeGreaterThanOrEqual(-0.12);
    const n = develop('run', est({ nRun: 5, runLatest: addDays(TODAY, -2) }), [{ date: addDays(TODAY, -84), est: est({ nRun: 10, runThrSpeed: 1000 / 280 }) }], TODAY, 0, 30, 40, null, 0.45);
    expect(n.gain).toBeGreaterThanOrEqual(minGain('run', 30, 40) - 1e-9);
  });
  test('grober Bereich über die Stundengrenze: „49 min – 1:04 h“ statt „49–1:04 h“', () => {
    expect(approxRange(49 * 60, 64 * 60)).toBe('49 min – 1:04 h');
  });
  test('trendHistory: drei Stände (12, 8, 5 Wochen zurück)', () => {
    expect(trendHistory(() => est(), TODAY).map(x => x.date)).toEqual([addDays(TODAY, -84), addDays(TODAY, -56), addDays(TODAY, -35)]);
  });
});

describe('alle Test-Personen: ohne Daten, Ziel in 2 Wochen und in 3 Jahren', () => {
  const all = [...PERSONAS.map(p => ({ id: p.id, answers: p.answers, today: PERSONA_TODAY })), ...NEW_USERS.map((p: any) => ({ id: p.id, answers: p.answers, today: NEWUSER_TODAY }))];
  for (const u of all) test(u.id, () => {
    const r = applyOnboarding(u.answers, u.today);
    const e = estimatesAt({ today: u.today, activities: [], trend: [], illness: [], profile: r.profile, goal: null } as any, u.today);
    for (const g0 of r.goals.filter((x: any) => x.type !== 'fitness')) {
      const p0 = prognosis(g0, e, { profile: r.profile, today: u.today });
      if (missingSports(g0, r.profile.sports).length) { expect(p0.ok).toBe(false); continue; }
      for (const days of [14, 3 * 365]) {
        const p = prognosis({ ...g0, date: addDays(u.today, days) }, e, { profile: r.profile, today: u.today });
        expect(p.ok).toBe(true);
        expect(raceBest(p), `${g0.name} in ${days} Tagen: ${fmtDuration(p.total!.best)} → ${fmtDuration(raceBest(p))}`).toBeLessThan(p.total!.best);
        expect(p.race!.total.low).toBeLessThan(raceBest(p)); expect(p.race!.total.high).toBeGreaterThan(raceBest(p));
      }
    }
  });
});

describe('Prognose nur für gewählte Sportarten und passende Ziele', () => {
  const tri = goal('tri_olympic', addDays(TODAY, 200));
  const sportsIn = (p: Prognosis) => new Set([...(p.parts || []), ...((p.race && p.race.parts) || [])].map(x => x.sport).filter(s => s && s !== 'trans'));
  const words: Record<string, RegExp> = { run: /Lauf|Laufen|Riegel/, bike: /Rad|FTP|Ausfahrt/, swim: /Schwimm|Kraul|Brust/ };
  const noForeign = (p: Prognosis, chosen: string[]) => {
    const txt = JSON.stringify({ i: p.improve, m: p.missing, a: p.assumptions, g: p.race && p.race.growth, n: p.race && p.race.notes, parts: p.parts });
    for (const sp of ['run', 'bike', 'swim'].filter(s => !chosen.includes(s))) { expect(sportsIn(p).has(sp as any), sp).toBe(false); expect(txt, sp).not.toMatch(words[sp]); }
  };
  test('Hinweis-Text wie gewünscht', () => {
    expect(mismatchText(['run'])).toBe('Dein Ziel enthält Laufen, das trainierst du bisher nicht – Ziel ändern oder Laufen hinzufügen?');
    expect(mismatchText(['swim', 'run'])).toBe('Dein Ziel enthält Schwimmen und Laufen, das trainierst du bisher nicht – Ziel ändern oder Schwimmen und Laufen hinzufügen?');
  });
  test('zwei von drei Triathlon-Sportarten: keine Prognose, Hinweis; passende Ziele bleiben', () => {
    const p = prof({ sports: ['swim', 'bike'] });
    const pr = prognosis(tri, est(), { profile: p, today: TODAY });
    expect(pr.ok).toBe(false); expect(pr.mismatch).toEqual(['run']); expect(pr.total).toBeUndefined();
    const goals = [tri, goal('swim_goal', addDays(TODAY, 100)), goal('bike_event', addDays(TODAY, 150))];
    const list = goalPrognoses(goals, {}, TODAY, est(), { profile: p });
    expect(list.map(x => x.goal.type)).toEqual(['swim_goal', 'bike_event']);
    expect(goalMismatches(goals, {}, TODAY, p.sports).map(x => [x.goal.type, x.missing])).toEqual([['tri_olympic', ['run']]]);
    for (const x of list) noForeign(x.p, ['swim', 'bike']);
  });
  test('nur Laufen: Lauf-Ziele mit Prognose ohne Rad/Schwimmen, Triathlon nicht', () => {
    const p = prof({ sports: ['run'] });
    const hm = prognosis(goal('run_half', addDays(TODAY, 150)), est(), { profile: p, today: TODAY });
    expect(hm.ok).toBe(true); noForeign(hm, ['run']);
    expect(prognosis(tri, est(), { profile: p, today: TODAY }).mismatch).toEqual(['swim', 'bike']);
  });
  test('nur Rad und nur Schwimmen', () => {
    const b = prognosis(goal('bike_event', addDays(TODAY, 150)), est(), { profile: prof({ sports: ['bike'] }), today: TODAY });
    expect(b.ok).toBe(true); noForeign(b, ['bike']);
    const s = prognosis(goal('swim_goal', addDays(TODAY, 150)), est(), { profile: prof({ sports: ['swim'] }), today: TODAY });
    expect(s.ok).toBe(true); noForeign(s, ['swim']);
    expect(prognosis(goal('run_10k', addDays(TODAY, 60)), est(), { profile: prof({ sports: ['swim'] }), today: TODAY }).ok).toBe(false);
  });
  test('Fitness-Ziel ohne Wettkampf: keine Prognose, kein Hinweis', () => {
    const goals = [goal('fitness', null)];
    expect(goalPrognoses(goals, {}, TODAY, est(), { profile: prof({ sports: ['run', 'strength'] }) })).toEqual([]);
    expect(goalMismatches(goals, {}, TODAY, ['run', 'strength'])).toEqual([]);
  });
  test('ohne gewählte Sportarten (alte Profile): keine Aussage, Prognose wie bisher', () => {
    expect(missingSports(tri, [])).toEqual([]);
    expect(prognosis(tri, est(), { profile: prof({ sports: [] }), today: TODAY }).ok).toBe(true);
  });
});

describe('Tab-Leiste: Feder', () => {
  const from: LensState = { x: 50, v: 0, s: 1, vs: 0 };
  test('Gleiten über 4 Tabs: Zwischenbilder, leichtes Überschwingen (unter 6 %), endet genau am Ziel, rund', () => {
    const path = trajectory(from, 330, 1, SP_GLIDE);
    expect(path.length).toBeGreaterThan(12); expect(path.length).toBeLessThan(60);     // 0,2-1 s
    const max = Math.max(...path.map(o => o.x));
    expect(max).toBeGreaterThan(330.5); expect((max - 330) / 280).toBeLessThan(0.06);
    expect(path[path.length - 1]).toEqual({ x: 330, v: 0, s: 1, vs: 0 });
    expect(Math.max(...path.map(o => stretchOf(o.v)))).toBeGreaterThan(0.1);           // dehnt sich in der Bewegung
    expect(stretchOf(0)).toBe(0);
  });
  test('Loslassen nach dem Drücken: Größe federt kurz unter 1 und kommt zur Ruhe', () => {
    const path = trajectory({ x: 100, v: 0, s: 1.2, vs: 0 }, 100, 1, SP_GLIDE);
    expect(Math.min(...path.map(o => o.s))).toBeLessThan(0.995);
    const o = { x: 100, v: 0, s: 1.2, vs: 0 }; for (let i = 0; i < 240; i++) stepSpring(o, 100, 1, SP_GLIDE, 1 / 60);
    expect(settled(o, 100, 1)).toBe(true);
  });
  test('gleiche Bahn bei 60 und 120 Hz (Schrittweite egal)', () => {
    const a = { ...from }, b = { ...from };
    for (let i = 0; i < 30; i++) stepSpring(a, 330, 1, SP_GLIDE, 1 / 60);
    for (let i = 0; i < 60; i++) stepSpring(b, 330, 1, SP_GLIDE, 1 / 120);
    expect(Math.abs(a.x - b.x)).toBeLessThan(0.5);
  });
});
