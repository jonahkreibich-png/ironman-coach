/* Auftrag 31: Zeitplan der Mitteilungen zur richtigen Ortszeit – auch rund um die Zeitumstellung – und Ruhezeiten.
   Der Server läuft alle 5 Minuten in UTC; berlinParts rechnet in die Zeitzone des Nutzers um (Standard Europe/Berlin). */
import { describe, test, expect } from 'vitest';
import { berlinParts } from '../src/store';
import { buildJobs, inQuiet, prefsOf } from '../src/notify';
import { withTz } from '../src/tz';

const plan = (date: string) => ({ state: { adjustments: {}, sessions: {}, trend: [], illnessPeriods: [], settings: { readiness: {} }, nutrition: {} }, baseWeeks: [{ weekNumber: 1, startDate: date, days: [{ date, sessions: [{ id: 's1', sport: 'run', title: 'Lockerer Lauf', plannedMinutes: 40 }] }] }], profile: {}, plan: {} });
/* alle 5-Minuten-Läufe eines Tages (UTC) durchgehen und festhalten, um wie viel Uhr Ortszeit das Morgen-Briefing fällig wird */
function morningAt(dayUtcStart: number): string[] {
  const out: string[] = []; let prev = -1, prevDate = '';
  for (let t = dayUtcStart - 4 * 3600000; t < dayUtcStart + 20 * 3600000; t += 5 * 60000) {
    const b = berlinParts(t); const min = b.hour * 60 + b.minute;
    const prevMin = Math.max(prevDate === b.date ? prev : -1, min - 35);
    const jobs = buildJobs(plan(b.date), b, prefsOf({}), prevMin);
    if (jobs.some(j => j.type === 'morning')) out.push(`${b.date} ${String(b.hour).padStart(2, '0')}:${String(b.minute).padStart(2, '0')}`);
    prev = min; prevDate = b.date;
  }
  return out;
}

describe('Zeitplan zur richtigen Ortszeit', () => {
  test('Schultag (Montag) vor und nach der Umstellung auf Winterzeit: Briefing um 06:45 Ortszeit, genau einmal', async () => {
    await withTz('Europe/Berlin', async () => {
      expect(morningAt(Date.UTC(2026, 9, 19))).toEqual(['2026-10-19 06:45']);   // Sommerzeit (UTC+2)
      expect(morningAt(Date.UTC(2026, 9, 26))).toEqual(['2026-10-26 06:45']);   // Winterzeit (UTC+1)
    });
  });
  test('Tag der Umstellung (Sonntag 25.10. und 28.03.): Wochenend-Briefing um 09:00, genau einmal', async () => {
    await withTz('Europe/Berlin', async () => {
      expect(morningAt(Date.UTC(2026, 9, 25))).toEqual(['2026-10-25 09:00']);
      expect(morningAt(Date.UTC(2027, 2, 28))).toEqual(['2027-03-28 09:00']);
    });
  });
  test('nach der Umstellung auf Sommerzeit (Montag 29.03.2027): 06:45', async () => {
    await withTz('Europe/Berlin', async () => { expect(morningAt(Date.UTC(2027, 2, 29))).toEqual(['2027-03-29 06:45']); });
  });
  test('andere Zeitzone des Nutzers (New York): Briefing um 06:45 dort', async () => {
    await withTz('America/New_York', async () => { expect(morningAt(Date.UTC(2026, 10, 9, 5))).toEqual(['2026-11-09 06:45']); });
  });
});

describe('Ruhezeiten', () => {
  const P = (x: any = {}) => prefsOf({ notify: x });
  test('nachts (22:30–06:00) immer ruhig', () => {
    expect(inQuiet(P(), 23 * 60, 2)).toBe(true);
    expect(inQuiet(P(), 5 * 60 + 59, 2)).toBe(true);
    expect(inQuiet(P(), 6 * 60, 2)).toBe(false);
  });
  test('Schule nur, wenn gewählt, nur Mo–Fr, nicht in den Ferien', () => {
    const on = P({ schoolQuiet: true, schoolStart: '07:45', schoolEnd: '13:15' });
    expect(inQuiet(P(), 10 * 60, 2)).toBe(false);
    expect(inQuiet(on, 10 * 60, 2)).toBe(true);
    expect(inQuiet(on, 13 * 60 + 15, 2)).toBe(false);
    expect(inQuiet(on, 10 * 60, 6)).toBe(false);
    expect(inQuiet(on, 10 * 60, 0)).toBe(false);
    expect(inQuiet({ ...on, holidays: true }, 10 * 60, 3)).toBe(false);
  });
  test('kaputte oder leere Zeiten schalten nichts stumm', () => {
    expect(inQuiet(P({ quietStart: '', quietEnd: '06:00' }), 3 * 60, 2)).toBe(false);
    expect(inQuiet(P({ schoolQuiet: true, schoolStart: 'x', schoolEnd: '13:15' }), 10 * 60, 2)).toBe(false);
  });
});
