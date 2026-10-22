/* Auftrag 8: fester Wochenaufbau mit Wochenvorgaben. Test-Person wie im Auftrag beschrieben (17, Fußball Mo Training / Fr Spiel,
   Schwimmbad nur Di und Wochenende, morgens höchstens 40 min, Kraul-Anfänger mit Brust). Block 1 endet mit Woche 5 (Erholung),
   Erkältung in Woche 4. Ab Woche 6 gilt der Plan aus den Vorgaben, danach im gleichen Muster weiter. */
import { test, expect, describe } from 'vitest';
import { replanPlan } from '../../shared/replan';
import { defaultProfile, withEstimates } from '../../shared/profile';
import { validateWeeks, ownWeekMinutes, weekVolume } from '../../shared/rules';
import { evaluate } from '../../shared/constraints';
import * as C from '../../shared/core';

import { today, oldPlan, targets, profile, goals, state } from '../../fixtures/pattern-person';
const r = replanPlan(oldPlan(), profile, goals, today, { state: state(), adjustments: {}, stages: { swim: { ladder: 'swim', n: 2 } }, from: '2026-10-19' })!;
const plan = r.plan;
const W = (mon: string) => plan.weeks.find((w: any) => w.startDate === mon);
const day = (w: any, dow: number) => w.days.find((d: any) => new Date(d.date + 'T12:00:00Z').getUTCDay() === dow);
const own = (w: any) => ownWeekMinutes(w) / 60;
const titles = (w: any, dow: number) => day(w, dow).sessions.filter((s: any) => s.sport !== 'rest').map((s: any) => s.title);
const longRun = (w: any) => day(w, 0).sessions.find((s: any) => s.sport === 'run');
const longBike = (w: any) => day(w, 6).sessions.find((s: any) => s.sport === 'bike');
const swims = (w: any) => w.days.flatMap((d: any) => d.sessions.filter((s: any) => s.sport === 'swim'));
const future = plan.weeks.filter((w: any) => w.startDate >= '2026-10-19');

describe('Woche 5 bleibt, ab 19.10. der neue Plan', () => {
  test('Wochen 1-5 unverändert, Woche 6 = Block 2, Woche 1', () => {
    expect(plan.weeks.slice(0, 5)).toEqual(oldPlan().weeks);
    expect(W('2026-10-19').headline).toMatch(/^Woche 6 · Block 2, Woche 1/);
    expect(W('2026-11-16').headline).toMatch(/^Woche 10 · Block 3, Woche 1/);
    expect(plan.meta.pattern).toBe(true);
  });
  test('keine Regel verletzt (Umfang, Laufumfang, harte Tage)', () => {
    expect(r.gen.violations).toEqual([]);
    expect(r.gen.dropped).toEqual([]);
    expect(validateWeeks(plan.weeks.slice(3), { minor: true, maxIncPct: 10 })).toEqual([]);
  });
});

describe('Umfang nach den Vorgaben', () => {
  // Auftrag 17: die Vorgabe ist eine Obergrenze; auch sie steigt höchstens etwa 10 % pro Woche (auf die letzte normale Woche)
  test('Gesamt je Woche (eigenes Training ohne Fußball) höchstens die Vorgabe, Steigerung höchstens etwa +10 %', () => {
    let prev: number | null = null;
    for (const t of targets) {
      const o = own(W(t.start));
      expect(o).toBeLessThanOrEqual(t.hours + 0.6); // feste Längen aus der Vorgabe (lange Ausfahrt, Schwimmen) runden etwas
      if (prev != null && !t.recovery) expect(o).toBeLessThanOrEqual(prev * 1.1 + 0.3);
      if (!t.recovery && !(t as any).entry) prev = o;
    }
  });
  test('langer Lauf So, lange Ausfahrt Sa und Schwimmen Di + Sa wie vorgegeben', () => {
    expect(longRun(W('2026-10-19')).title).toBe('Lauftest 30 min');
    expect(longRun(W('2026-10-19')).plannedMinutes).toBe(55);
    expect(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'].map(m => longRun(W(m)).plannedMinutes)).toEqual([65, 75, 50, 85, 90]);
    expect([90, 95]).toContain(longRun(W('2026-11-30')).plannedMinutes);
    // Auftrag 17: in der Erholungswoche höchstens ein harter Test (Radtest Mi); der Lauftest kommt in die Woche danach
    expect(longRun(W('2026-12-07')).title).not.toBe('Lauftest 30 min');
    expect(longRun(W('2026-12-14')).title).toBe('Lauftest 30 min');
    for (const t of targets) {
      const lb = longBike(W(t.start)).plannedMinutes;
      expect(lb).toBeGreaterThanOrEqual(t.longBike![0]); expect(lb).toBeLessThanOrEqual(t.longBike![1]);
      const sw = swims(W(t.start)).filter((s: any) => !/test/i.test(s.title));
      expect(sw.length).toBeGreaterThanOrEqual(1);
      sw.forEach((s: any) => expect(Math.abs(s.plannedMinutes - (t.swim![0] + t.swim![1]) / 2)).toBeLessThanOrEqual(6));
    }
  });
  test('danach im gleichen Muster: langer Lauf höchstens +10 min pro Woche und nicht über 100 min, Aufbau höchstens +10 %', () => {
    const later = future.filter((w: any) => w.startDate > '2026-12-07');
    expect(later.length).toBeGreaterThan(8);
    let prev = 95;
    for (const w of later) {
      const lr = longRun(w);
      // Auftrag 18: in Koppel-Wochen ist der Sonntag bewusst kürzer (kein langer Lauf) und kein Bezug
      if (!lr || /test/i.test(lr.title) || !lr.long) continue;
      expect(lr.plannedMinutes).toBeLessThanOrEqual(100);
      if (!w.isRecoveryWeek) { expect(lr.plannedMinutes - prev).toBeLessThanOrEqual(10); prev = lr.plannedMinutes; }
      expect(own(w)).toBeLessThanOrEqual(12.05); // Wochenlimit 15 h inklusive 3 h Fußball
    }
    // Auftrag 17: Fußball zählt voll gegen die Spitze; nach den Vorgaben geht es höchstens +10 % weiter
    expect(own(later[1])).toBeLessThanOrEqual(own(W('2026-11-30')) * 1.1 + 0.3);
    // Erholung alle 4 Wochen
    expect(later.filter((w: any) => w.isRecoveryWeek).map((w: any) => w.startDate).slice(0, 2)).toEqual(['2027-01-04', '2027-02-01']);
  });
  test('Anzeige: Umfang und Steigerung zur letzten Aufbauwoche', () => {
    const i8 = plan.weeks.indexOf(W('2026-11-02')), i10 = plan.weeks.indexOf(W('2026-11-16')), i9 = plan.weeks.indexOf(W('2026-11-09'));
    const v10 = weekVolume(plan.weeks, i10);
    expect(v10.refWeek).toBe(8);
    expect(v10.pct).toBe(Math.round((own(W('2026-11-16')) / own(W('2026-11-02')) - 1) * 100));
    expect(v10.pct!).toBeGreaterThan(0);
    expect(weekVolume(plan.weeks, i9).pct!).toBeLessThan(-20);
    expect(weekVolume(plan.weeks, i8).refWeek).toBe(7);
    expect(weekVolume(plan.weeks, 0).pct).toBe(null);
  });
});

describe('Aufbau einer normalen Woche', () => {
  test('Mo nur Fußball, Di Schwimmen + Kraft Unterkörper, Fr Kraft Oberkörper + Spiel, Sa Schwimmen + lange Ausfahrt, So langer Lauf', () => {
    for (const w of future.slice(0, 16)) {
      expect(titles(w, 1).every((t: string) => /Fußball/.test(t))).toBe(true);
      expect(day(w, 2).sessions.some((s: any) => s.sport === 'swim')).toBe(true);
      expect(day(w, 2).sessions.some((s: any) => s.sport === 'strength' && s.area === 'lower')).toBe(true);
      expect(day(w, 5).sessions.some((s: any) => s.sport === 'strength' && s.area === 'upper')).toBe(true);
      expect(day(w, 5).sessions.some((s: any) => /Spiel/.test(s.title))).toBe(true);
      // Auftrag 18: höchstens 2 Sportarten pro Tag – in Koppel-Wochen (Rad + Koppellauf am Samstag) wandert das Schwimmen auf den Sonntag
      const brick = day(w, 6).sessions.some((s: any) => /^Koppellauf/.test(s.title));
      expect(day(w, brick ? 0 : 6).sessions.some((s: any) => s.sport === 'swim')).toBe(true);
    }
  });
  test('Mi Rad: Sweet Spot ab Woche 8 (3×8 → 3×12 → 2×20), vorher locker, Woche 7 der Radtest', () => {
    // Auftrag 18: in der ersten Woche ist Mittwoch der Ruhetag (sonst kein freier Tag in der Woche)
    expect(titles(W('2026-10-19'), 3)[0] || 'Ruhetag').toMatch(/^(Lockere Ausfahrt|Ruhetag)/);
    expect(titles(W('2026-10-26'), 3)[0]).toBe('Radtest 20 min');
    expect(titles(W('2026-11-02'), 3)[0]).toMatch(/^Rad-Intervalle \d×8 min Sweet Spot/);
    expect(titles(W('2026-11-09'), 3)[0]).toMatch(/^Lockere Ausfahrt/);
    expect(titles(W('2026-11-16'), 3)[0]).toMatch(/^Rad-Intervalle 3×12 min Sweet Spot/);
    // Abwechslung: nach zwei Sweet-Spot-Wochen Kraftausdauer, dann Sweet Spot weiter (2×20)
    expect(titles(W('2026-11-23'), 3)[0]).toMatch(/^Rad-Intervalle \d×\d+ min Kraftausdauer/);
    expect(titles(W('2026-11-30'), 3)[0]).toMatch(/^Rad-Intervalle 2×20 min Sweet Spot/);
    for (const w of future.slice(1, 12)) expect(day(w, 3).sessions.find((s: any) => s.sport === 'bike').plannedMinutes).toBeLessThanOrEqual(90);
  });
  // Auftrag 18: mindestens ein Ruhetag pro Woche. Der Donnerstag liegt zwischen der Rad-Qualität (Mi) und dem Spiel (Fr) und ist der Ruhetag;
  // der lockere Lauf dort entfällt (Laufen nur Do/Sa/So erlaubt, Sa nach dem Spiel und So mit dem langen Lauf belegt).
  test('Do Ruhetag zwischen Rad-Qualität und Spiel, jede Woche mindestens ein freier Tag', () => {
    for (const w of future.slice(1, 16)) {
      expect(day(w, 4).sessions.filter((s: any) => s.sport !== 'rest')).toEqual([]);
      expect(w.days.filter((d: any) => !d.sessions.some((s: any) => s.sport !== 'rest')).length).toBeGreaterThanOrEqual(1);
    }
  });
  // Auftrag 17: Koppel nur gezielt: nie in der Grundlage oder Erholung, im Aufbau höchstens jede 3., spezifisch jede 2. Woche, kurz
  test('Sa Koppellauf nur im Aufbau/spezifisch, höchstens jede 2.-3. Woche, kurz, nur wenn gut erholt', () => {
    const brick = (w: any) => day(w, 6).sessions.find((s: any) => /Koppellauf/.test(s.title));
    for (const w of future) {
      const b = brick(w); if (!b) continue;
      expect(['build', 'specific']).toContain(w.phase); expect(w.isRecoveryWeek).toBeFalsy();
      expect(b.plannedMinutes).toBeLessThanOrEqual(20); expect(b.description).toMatch(/gut erholt/);
    }
    const idx = future.map((w: any, i: number) => brick(w) ? i : -1).filter((i: number) => i >= 0);
    for (let k = 1; k < idx.length; k++) expect(idx[k] - idx[k - 1]).toBeGreaterThanOrEqual(2);
    expect(future.filter((w: any) => w.phase === 'base').some((w: any) => brick(w))).toBe(false);
  });
  test('Morgens optional Mobility oder lockeres Rad nur bei grüner Ampel (Hinweis), keine Einheit morgens über 40 min', () => {
    expect(W('2026-11-02').important).toMatch(/optional 30-40 min Mobility oder lockeres Rad.*grüner Ampel/);
    C.planDays(future).forEach((d: any) => d.sessions.filter((s: any) => s.slot === 'am').forEach((s: any) => expect(s.plannedMinutes).toBeLessThanOrEqual(40)));
  });
});

describe('Harte Regeln', () => {
  test('Schwimmbad nur Di und Wochenende, keine Beine am Spieltag oder am Tag davor, keine Regel aus dem Raster verletzt', () => {
    for (const d of C.planDays(future)) {
      const dow = new Date(d.date + 'T12:00:00Z').getUTCDay();
      for (const s of d.sessions) {
        if (s.sport === 'swim') expect([0, 2, 6]).toContain(dow);
        if (s.sport === 'strength' && s.area === 'lower') expect([4, 5]).not.toContain(dow);
        if (!s.fixed) expect(evaluate(profile.rules!, s, d.date).hard).toEqual([]);
      }
    }
  });
});

describe('Tests', () => {
  const at = (date: string) => C.planDays(plan.weeks).find((d: any) => d.date === date)!.sessions;
  test('Lauftest So 25.10. (55 min) statt des langen Laufs, mit flacher Strecke ohne Ampeln', () => {
    const t = at('2026-10-25').find((s: any) => s.sport === 'run');
    expect(t.title).toBe('Lauftest 30 min'); expect(t.plannedMinutes).toBe(55);
    expect(t.description).toMatch(/15 min.*einlaufen/); expect(t.description).toMatch(/30 min/); expect(t.description).toMatch(/10 min.*auslaufen/);
    expect(t.description).toMatch(/flache Strecke ohne Ampeln/);
  });
  test('Schwimmtest Di 27.10.: Kraul-Check (200 m Brust, längste Strecke Kraul, 4×25 m, 200 m Brust auf Zeit), danach Technik', () => {
    const t = at('2026-10-27').find((s: any) => s.sport === 'swim');
    expect(t.title).toBe('Schwimmtest: Kraul-Check');
    expect(t.description).toMatch(/200 m Brust.*einschwimmen/);
    expect(t.description).toMatch(/so weit wie möglich am Stück/);
    expect(t.description).toMatch(/4×25 m Kraul.*30 s Pause/);
    expect(t.description).toMatch(/200 m Brust.*auf Zeit/);
    expect(t.description).toMatch(/danach Technik/);
    // Kraft Unterkörper am Tag davor nur leicht: 2 Sätze, nichts Explosives
    const k = at('2026-10-27').find((s: any) => s.sport === 'strength');
    expect(k.area).toBe('lower');
    expect(k.spec.exercises.every((e: any) => e.sets <= 2 && !/Nordic/.test(e.name))).toBe(true);
  });
  test('Radtest Mi 28.10.: drinnen oder draußen, Ablauf wie vorgegeben, statt Intervallen', () => {
    const t = at('2026-10-28').find((s: any) => s.sport === 'bike');
    expect(t.title).toBe('Radtest 20 min'); expect(t.plannedMinutes).toBe(70);
    expect(t.description).toMatch(/20 min.*3×1 min zügig/); expect(t.description).toMatch(/5 min.*hart/); expect(t.description).toMatch(/20 min.*maximal gleichmäßig/);
    expect(t.description).toMatch(/Drinnen oder draußen/); expect(t.description).toMatch(/FTP = 95 %/);
  });
  test('Wiederholung in Woche 13 (Di 8.12. Kraul-Check, Mi 9.12. Radtest; Lauftest So 20.12. in der Woche danach), danach alle 8 Wochen', () => {
    expect(at('2026-12-08').some((s: any) => /Kraul-Check/.test(s.title))).toBe(true);
    expect(at('2026-12-09').some((s: any) => s.title === 'Radtest 20 min')).toBe(true);
    expect(at('2026-12-13').some((s: any) => s.title === 'Lauftest 30 min')).toBe(false);
    expect(at('2026-12-20').some((s: any) => s.title === 'Lauftest 30 min')).toBe(true);
    const testWeeks = future.filter((w: any) => C.planDays([w]).some((d: any) => d.sessions.some((s: any) => /test/i.test(s.title)))).map((w: any) => w.startDate);
    expect(testWeeks.slice(0, 5)).toEqual(['2026-10-19', '2026-10-26', '2026-12-07', '2026-12-14', '2027-02-01']);
    expect(W('2027-02-01').isRecoveryWeek).toBe(true);
  });
  test('nie zwei harte Tests an aufeinanderfolgenden Tagen, nie am Tag nach einem Spiel', () => {
    const days = C.planDays(future);
    days.forEach((d: any, i: number) => {
      const hardTest = d.sessions.some((s: any) => /test/i.test(s.title) && s.hard);
      if (!hardTest) return;
      const prev = days[i - 1];
      expect(prev.sessions.some((s: any) => /test/i.test(s.title) && s.hard)).toBe(false);
      expect(prev.sessions.some((s: any) => /Spiel/.test(s.title))).toBe(false);
    });
  });
});
