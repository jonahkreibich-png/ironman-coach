/* Auftrag 22: Datum und Zeit – Zeitumstellung (Oktober und März), Mitternacht, Wochenwechsel So/Mo, Zeitzonen (andere Länder, Reisen).
   Kalendertage werden über 12:00 UTC gerechnet; „heute“ und Uhrzeiten in der Zeitzone der App bzw. des Nutzers. */
import { test, expect, describe, afterEach } from 'vitest';
import { localDate, localParts, setAppTz, appTz, DEFAULT_TZ, validTz } from '../../shared/tz';
import * as C from '../../shared/core';
import { readinessDate } from '../../shared/readiness';
import { occasionKey, arrangeFeed } from '../../shared/coach/feed';
import { analyze } from '../../shared/activity/analyze';
import { addDays as uiAddDays, daysBetween as uiDays, dowShort } from '../../web/src/util';
import { withTz, userTz } from '../../server/src/tz';
import { berlinParts, berlinDate } from '../../server/src/store';

afterEach(() => { setAppTz(DEFAULT_TZ); });
const Z = (s: string) => Date.parse(s);

describe('Zeitumstellung', () => {
  test('Oktober (25.10.2026, 03:00 → 02:00): Tage, Wochentage und Abstände stimmen', () => {
    expect(localDate(Z('2026-10-24T22:30:00Z'))).toBe('2026-10-25'); // 00:30 Sommerzeit
    expect(localDate(Z('2026-10-25T00:59:00Z'))).toBe('2026-10-25'); // 02:59 Sommerzeit
    expect(localParts(Z('2026-10-25T01:30:00Z')).hour).toBe(2);       // 02:30 Winterzeit (zweites Mal)
    expect(localDate(Z('2026-10-25T22:59:00Z'))).toBe('2026-10-25'); // 23:59 Winterzeit
    expect(localDate(Z('2026-10-25T23:00:00Z'))).toBe('2026-10-26');
    expect(C.addDays('2026-10-24', 1)).toBe('2026-10-25'); expect(C.addDays('2026-10-25', 1)).toBe('2026-10-26'); expect(C.addDays('2026-10-26', -2)).toBe('2026-10-24');
    expect(C.weekRange('2026-10-25')).toEqual(['2026-10-19', '2026-10-25']);
    expect(uiAddDays('2026-10-25', 1)).toBe('2026-10-26'); expect(uiDays('2026-10-24', '2026-10-26')).toBe(2); expect(dowShort('2026-10-25')).toMatch(/^So/);
  });
  test('März (28.03.2027, 02:00 → 03:00): kein Tag doppelt oder verloren', () => {
    expect(localParts(Z('2027-03-28T00:59:00Z')).hour).toBe(1);
    expect(localParts(Z('2027-03-28T01:00:00Z')).hour).toBe(3);
    expect(localDate(Z('2027-03-27T23:30:00Z'))).toBe('2027-03-28');
    expect(C.addDays('2027-03-27', 1)).toBe('2027-03-28'); expect(C.addDays('2027-03-28', 1)).toBe('2027-03-29');
    expect(uiAddDays('2027-03-28', 1)).toBe('2027-03-29'); expect(uiDays('2027-03-27', '2027-03-29')).toBe(2);
    const days: string[] = []; for (let d = '2027-03-22'; d <= '2027-04-04'; d = C.addDays(d, 1)) days.push(d);
    expect(days).toHaveLength(14); expect(new Set(days).size).toBe(14);
  });
  test('Einheit kurz nach Mitternacht in der Nacht der Umstellung zählt zum richtigen Tag', () => {
    const raw: any = { format: 'fit', sport: 'run', startMs: Z('2026-10-24T22:40:00Z'), indoor: false, totals: { elapsedSec: 1800, movingSec: 1800, distanceM: 5000, ascentM: null, kcal: null, avgHr: 140, maxHr: 150, avgPower: null, avgSpeed: null }, records: [], laps: [], lengths: [] };
    expect(analyze(raw, { source: 'file' }).date).toBe('2026-10-25');
    expect(analyze(raw, { source: 'file', tz: 'America/New_York' }).date).toBe('2026-10-24');
  });
});
describe('Mitternacht und Wochenwechsel', () => {
  test('„heute“ wechselt um Mitternacht Ortszeit, nicht UTC; So 23:59 und Mo 00:01 liegen in verschiedenen Wochen', () => {
    expect(readinessDate(Z('2026-11-01T22:59:00Z'))).toBe('2026-11-01'); // So 23:59 MEZ
    expect(readinessDate(Z('2026-11-01T23:01:00Z'))).toBe('2026-11-02'); // Mo 00:01
    expect(C.weekRange(readinessDate(Z('2026-11-01T22:59:00Z')))[0]).toBe('2026-10-26');
    expect(C.weekRange(readinessDate(Z('2026-11-01T23:01:00Z')))[0]).toBe('2026-11-02');
  });
  test('Meldung um 00:30 gehört zum neuen Tag (vorher UTC: Vortag) – auch für die Doppelt-Erkennung', () => {
    const at = Z('2026-10-26T23:30:00Z'); // 00:30 am 27.10.
    const m = { id: 'x', kind: 'warning', title: 'T', text: 'a', at };
    expect(occasionKey(m)!.endsWith('|2026-10-27')).toBe(true);
    expect(arrangeFeed([m], at + 1000, 0).feed[0].date).toBe('2026-10-27');
  });
});
describe('Zeitzonen (andere Länder, Reisen)', () => {
  test('App-Zeitzone vom Gerät; ungültige Angaben ändern nichts', () => {
    expect(setAppTz('Australia/Sydney')).toBe(true); expect(appTz()).toBe('Australia/Sydney');
    expect(readinessDate(Z('2026-10-29T14:00:00Z'))).toBe('2026-10-30'); // 01:00 in Sydney
    expect(setAppTz('Mond/Basis')).toBe(false); expect(appTz()).toBe('Australia/Sydney');
    expect(validTz('')).toBe(false); expect(validTz(null)).toBe(false);
  });
  test('Server: je Nutzer die eigene Zeitzone (aus den Einstellungen), Standard Berlin', async () => {
    const t = Z('2026-10-29T11:00:00Z');
    expect(berlinParts(t).hour).toBe(12);
    await withTz('America/New_York', async () => { expect(berlinParts(t).hour).toBe(7); expect(berlinDate(Z('2026-10-30T02:00:00Z'))).toBe('2026-10-29'); });
    await withTz('Unsinn/Zone', async () => { expect(berlinParts(t).hour).toBe(12); });
    expect(berlinParts(t).hour).toBe(12);
    const env: any = { DB: { prepare: () => ({ bind: () => ({ first: async () => ({ data: JSON.stringify({ settings: { tz: 'Asia/Tokyo' } }) }) }) }) } };
    expect(await userTz(env, 1)).toBe('Asia/Tokyo');
    const env2: any = { DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } };
    expect(await userTz(env2, 1)).toBe('Europe/Berlin');
  });
  test('parallel laufende Nutzer in verschiedenen Zeitzonen beeinflussen sich nicht', async () => {
    const t = Z('2026-10-29T23:30:00Z');
    const [a, b] = await Promise.all([withTz('America/Los_Angeles', async () => { await new Promise(r => setTimeout(r, 5)); return berlinDate(t); }), withTz('Asia/Tokyo', async () => berlinDate(t))]);
    expect(a).toBe('2026-10-29'); expect(b).toBe('2026-10-30');
  });
});
