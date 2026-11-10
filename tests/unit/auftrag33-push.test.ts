/* Auftrag 33: Adduktoren-Erinnerung nur bei aktiver Leisten-/Adduktoren-Beschwerde; Urgency und TTL zeitgebundener Mitteilungen. */
import { describe, test, expect } from 'vitest';
import * as C from '../../shared/core';
import { buildJobs, prefsOf, deliveryOpts } from '../../server/src/notify';

const DATE = '2099-01-05';   // Montag
const weeks = [{ weekNumber: 1, startDate: DATE, days: [{ date: DATE, sessions: [{ id: 's1', sport: 'run', title: 'Lockerer Lauf', plannedMinutes: 40, time: '17:00' }] }] }];
const state = (profile: any, extra: any = {}) => ({ profile, sessions: {}, trend: [], illnessPeriods: [], settings: { readiness: {} }, adjustments: {}, nutrition: {}, ...extra });
const team = { sports: ['run', 'football'], teamSport: { name: 'Fußball' }, thresholds: {} };

describe('Leisten-/Adduktoren-Beschwerde', () => {
  test('ohne Eintrag: keine Beschwerde', () => {
    expect(C.groinComplaint(state({ ...team, injuries: 'keine', notes: [] }), weeks, DATE)).toBeNull();
  });
  test('Verletzungs-Feld oder Berücksichtigung „Leiste“: aktiv', () => {
    expect(C.groinComplaint(state({ ...team, injuries: 'Leiste zieht beim Sprinten' }), weeks, DATE)).toBe('regel');
    expect(C.groinComplaint(state({ ...team, notes: ['Adduktoren zwicken'] }), weeks, DATE)).toBe('regel');
  });
  test('Notiz einer Einheit in den letzten 7 Tagen: aktiv; ältere Notiz oder 0/10: nicht', () => {
    const w = [{ weekNumber: 1, startDate: '2098-12-29', days: [{ date: '2099-01-02', sessions: [{ id: 'a', sport: 'run', title: 'Lauf' }] }, { date: '2098-12-20', sessions: [{ id: 'b', sport: 'run', title: 'Lauf' }] }] }];
    expect(C.groinComplaint(state(team, { sessions: { a: { completed: true, notes: 'Leiste 3/10' } } }), w, DATE)).toBe('notiz');
    expect(C.groinComplaint(state(team, { sessions: { b: { completed: true, notes: 'Leiste 3/10' } } }), w, DATE)).toBeNull();
    expect(C.groinComplaint(state(team, { sessions: { a: { completed: true, notes: 'Leiste 0/10, alles gut' } } }), w, DATE)).toBeNull();
  });
  test('nach „wieder schmerzfrei“ zählt eine ältere Regel nicht mehr', () => {
    const rule = { id: 'r', kind: 'body', body: 'groin', strength: 'hard', source: 'chat', text: 'Leiste', createdAt: Date.parse('2098-12-01') };
    expect(C.groinComplaint(state({ ...team, rules: [rule] }), weeks, DATE)).toBe('regel');
    expect(C.groinComplaint(state({ ...team, rules: [rule] }, { settings: { readiness: {}, painClearedOn: '2098-12-10' } }), weeks, DATE)).toBeNull();
  });
  test('Zeitplan: Adduktoren-Erinnerung (Mo 19:00) nur mit Beschwerde', () => {
    const b = { date: DATE, hour: 19, minute: 0, dow: 1 };
    const L = (profile: any) => ({ state: state(profile), baseWeeks: weeks, profile, plan: {} });
    expect(buildJobs(L(team), b, prefsOf({}), 18 * 60 + 55).some(j => j.type === 'adductors')).toBe(false);
    const jobs = buildJobs(L({ ...team, injuries: 'Leiste zieht' }), b, prefsOf({}), 18 * 60 + 55);
    expect(jobs.some(j => j.type === 'adductors')).toBe(true);
  });
});

describe('Urgency und TTL', () => {
  test('zeitgebunden: high, TTL bis die Mitteilung nicht mehr passt', () => {
    expect(deliveryOpts({ type: 'morning', until: 12 * 60 }, 6 * 60 + 45, false)).toEqual({ urgency: 'high', ttl: 18900 });
    expect(deliveryOpts({ type: 'preSession', until: 17 * 60 }, 16 * 60, false)).toEqual({ urgency: 'high', ttl: 3600 });
    expect(deliveryOpts({ type: 'evening', until: 22 * 60 + 30 }, 20 * 60 + 30, false)).toEqual({ urgency: 'high', ttl: 7200 });
    expect(deliveryOpts({ type: 'x' }, 600, true)).toEqual({ urgency: 'high', ttl: 6 * 3600 });
  });
  test('nicht zeitgebunden: normal; TTL nie unter 10 min, nie über 24 h', () => {
    expect(deliveryOpts({ type: 'weekly' }, 1000, false)).toEqual({ urgency: 'normal', ttl: 12 * 3600 });
    expect(deliveryOpts({ type: 'achievements' }, 1000, false).urgency).toBe('normal');
    expect(deliveryOpts({ type: 'morning', until: 12 * 60 }, 11 * 60 + 58, false).ttl).toBe(600);
  });
  test('jede geplante Mitteilung hat eine Gültigkeit (until)', () => {
    const b = { date: DATE, hour: 16, minute: 0, dow: 1 };
    const L = { state: state(team), baseWeeks: weeks, profile: team, plan: {} };
    const jobs = buildJobs(L, b, prefsOf({ notify: { times: { morningSchool: '16:00', evening: '16:00', eveEarly: '16:00' } } }), 15 * 60 + 55);
    expect(jobs.length).toBeGreaterThan(1);
    for (const j of jobs) expect(j.until, j.type).toBeGreaterThan(0);
  });
});
