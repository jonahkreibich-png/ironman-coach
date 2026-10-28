/* Auftrag 21: Historie (12 Monate) einmalig nachladen, ohne Handeinträge zu überschreiben oder doppelt zu zählen */
import { describe, expect, test } from 'vitest';
import { historyFilter } from '../src/ingest';
import { activityFromIcu } from '../src/intervals';

describe('Auftrag 21: Historie nachladen', () => {
  const icu = (id: number, date: string, type = 'Run', extra: any = {}) => ({ id, type, start_date_local: date + 'T07:00:00', start_date: date + 'T06:00:00Z', moving_time: 2700, distance: 7500, average_heartrate: 148, total_elevation_gain: 80, ...extra });
  test('intervals.icu-Aktivität wird zur Aufzeichnung mit Höhenmetern, ohne Zuordnung zum Plan', () => {
    const a = activityFromIcu(icu(1, '2026-05-02'));
    expect(a).toMatchObject({ id: 'icu-1', sport: 'run', date: '2026-05-02', min: 45, km: 7.5, avgHr: 148, ascentM: 80, speedKmh: 10 });
    expect(activityFromIcu({ id: 2, type: 'Sailing', start_date_local: '2026-05-02T07:00:00' })).toBeNull();
  });
  test('keine Doppelten: gleiche Aufzeichnung, gleicher Start oder Handeintrag am selben Tag zählt nicht noch einmal', () => {
    const a = activityFromIcu(icu(1, '2026-05-02')), b = activityFromIcu(icu(2, '2026-05-03')), c = activityFromIcu(icu(3, '2026-05-04', 'Ride'));
    const existing = [{ ...a, id: 'healthfit-x', source: 'healthfit' }];
    const manual = new Set(['2026-05-04|bike']);
    const out = historyFilter(existing as any, manual, [a, b, c, b] as any);
    expect(out.map(x => x.id)).toEqual(['icu-2']);
    expect(out[0]).toMatchObject({ sessionId: null, history: true });
  });
});
