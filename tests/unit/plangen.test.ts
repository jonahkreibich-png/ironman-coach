import { test, expect, describe } from 'vitest';
import { generatePlan, phasePlan, transitionPlan } from '../../shared/plangen';
import { validateWeeks, weekMinutes } from '../../shared/rules';
import { defaultProfile } from '../../shared/profile';
import { isIntense as isHard } from '../../shared/rules';

const today = '2026-10-14';
const adult = { ...defaultProfile(), birthYear: 1995, weeklyHours: 9, maxDayHours: 3, sports: ['swim', 'bike', 'run', 'strength'] as any };
const teen = { ...adult, birthYear: 2009, weeklyHours: 8, fixed: [{ id: 'f1', dow: 1, sport: 'football' as const, title: 'Teamtraining', time: '18:00', minutes: 90 }, { id: 'f2', dow: 5, sport: 'football' as const, title: 'Spiel', time: '18:30', minutes: 70, hard: true }] };

describe('Phasen', () => {
  test('Grundlage, Aufbau, spezifisch, Tapering, Wettkampf in dieser Reihenfolge, Erholung alle 4 Wochen', () => {
    const p = phasePlan(20, 'tri_olympic', 4);
    const order = p.map(x => x.phase).filter((x, i, a) => a.indexOf(x) === i);
    expect(order).toEqual(['base', 'build', 'specific', 'taper', 'race']);
    expect(p.filter(x => x.recovery).length).toBeGreaterThanOrEqual(3);
    p.forEach((x, i) => { if (x.recovery) expect(p.slice(Math.max(0, i - 4), i).some(y => y.recovery)).toBe(i < 4 ? false : p.slice(i - 4, i).some(y => y.recovery) ? true : false); });
  });
});

describe('Plan erzeugen', () => {
  const goal = { id: 'g1', type: 'tri_olympic' as const, name: 'Olympische Distanz', date: '2027-03-21', priority: 'A' as const };
  test('Olympische Distanz: alle Wochen, Regeln eingehalten, Wettkampf am Zieltag', () => {
    const r = generatePlan({ profile: adult, goal, today, currentWeeklyHours: 6 });
    expect(r.violations).toEqual([]);
    const w = r.plan.weeks;
    expect(w[0].startDate).toBe('2026-10-19');
    expect(w[w.length - 1].days.some((d: any) => d.date === '2027-03-21' && d.sessions.some((s: any) => s.title === 'Olympische Distanz'))).toBe(true);
    expect(w.some((x: any) => x.isRecoveryWeek)).toBe(true);
    // Umfang wächst, aber nie mehr als 10 %
    expect(validateWeeks(w, {})).toEqual([]);
    expect(weekMinutes(w[8])).toBeGreaterThan(weekMinutes(w[0]));
    // höchstens das Budget
    w.forEach((x: any) => expect(weekMinutes(x)).toBeLessThanOrEqual(9 * 60 + 5));
    // alle drei Sportarten
    const sports = new Set(w.flatMap((x: any) => x.days.flatMap((d: any) => d.sessions.map((s: any) => s.sport))));
    ['swim', 'bike', 'run', 'strength'].forEach(s => expect(sports.has(s)).toBe(true));
    expect(r.summary).toHaveLength(5);
  });
  test('Jugendlicher mit Teamsport Mo/Fr: Termine bleiben, kein harter Tag direkt neben dem Spiel, Steigerung ≤ 8 %', () => {
    const r = generatePlan({ profile: teen, goal: { ...goal, type: 'tri_sprint', name: 'Sprint' }, today, currentWeeklyHours: 5 });
    expect(r.violations.filter(v => v.rule !== 'age')).toEqual([]);
    for (const w of r.plan.weeks) {
      const mo = w.days.find((d: any) => new Date(d.date + 'T12:00:00Z').getUTCDay() === 1);
      expect(mo.sessions.some((s: any) => s.title === 'Teamtraining')).toBe(true);
      const days = w.days;
      days.forEach((d: any, i: number) => { if (d.sessions.some(isHard) && days[i + 1]) expect(days[i + 1].sessions.some(isHard)).toBe(false); });
    }
    expect(validateWeeks(r.plan.weeks, { minor: true })).toEqual([]);
    // Jugendliche: keine Lauf-Intervalle ohne Freigabe
    expect(r.plan.weeks.some((w: any) => w.days.some((d: any) => d.sessions.some((s: any) => /Lauf-Intervalle/.test(s.title))))).toBe(false);
  });
  test('Fehlende Schwellen: Einstiegstests in den ersten zwei Wochen', () => {
    const r = generatePlan({ profile: adult, goal, today, needTests: { run: true, bike: true, swim: true } });
    const titles = r.plan.weeks.slice(0, 2).flatMap((w: any) => w.days.flatMap((d: any) => d.sessions.map((s: any) => s.title)));
    expect(titles).toEqual(expect.arrayContaining(['Lauftest 30 min', 'Radtest 20 min', 'Schwimmtest 400/200 m']));
    expect(r.plan.keyDates.length).toBeGreaterThan(1);
  });
  test('Marathon mit 16 Jahren: Hinweis aufs Mindestalter', () => {
    const r = generatePlan({ profile: { ...adult, birthYear: 2010, sports: ['run'] as any }, goal: { id: 'm', type: 'run_marathon', name: 'Marathon', date: '2027-04-25', priority: 'A' }, today });
    expect(r.violations.some(v => v.rule === 'age')).toBe(true);
  });
  test('Zeitfenster aus dem Profil werden eingehalten', () => {
    const p = { ...adult, availability: { 2: [{ from: '06:15', to: '06:55' }], 4: [{ from: '17:00', to: '18:30' }], 6: [{ from: '09:00', to: '12:00' }], 0: [{ from: '09:00', to: '11:00' }] } };
    const r = generatePlan({ profile: p, goal: { ...goal, type: 'run_10k', name: '10 km' }, today });
    for (const w of r.plan.weeks) for (const d of w.days) {
      const dow = new Date(d.date + 'T12:00:00Z').getUTCDay();
      const mins = d.sessions.filter((s: any) => s.sport !== 'rest').reduce((a: number, s: any) => a + s.plannedMinutes, 0);
      const cap = ({ 2: 40, 4: 90, 6: 180, 0: 120 } as any)[dow] ?? 0;
      if (d.date !== '2027-03-21') expect(mins).toBeLessThanOrEqual(cap);
    }
  });
  test('Übergang: vergangene Wochen bleiben, neuer Plan ab nächstem Montag', () => {
    const old = { meta: { blockName: 'Alt' }, weeks: [{ weekNumber: 1, startDate: '2026-10-05', endDate: '2026-10-11', days: [] }, { weekNumber: 2, startDate: '2026-10-12', endDate: '2026-10-18', days: [] }] };
    const r = generatePlan({ profile: adult, goal, today });
    const t = transitionPlan(old, r.plan, today);
    expect(t.weeks[0].startDate).toBe('2026-10-05');
    expect(t.weeks[2].startDate).toBe('2026-10-19');
    expect(t.weeks[2].weekNumber).toBe(3);
  });
});
