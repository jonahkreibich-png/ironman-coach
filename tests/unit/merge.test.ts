import { test, expect, describe } from 'vitest';
import { mergeTrendValues, setManual, resetToOriginal, upgradeLegacyPoint, ingestActivity, setSessionMetricManual, resetSessionMetrics, hasOriginal } from '../../shared/activity/merge';
import type { Activity } from '../../shared/activity/analyze';

describe('Tageswerte aus mehreren Quellen', () => {
  test('Vorrang: Schlaf und HFV von Oura, Gewicht vom Kurzbefehl', () => {
    let p = mergeTrendValues(null, '2026-10-14', 'shortcut', { hrv: 62, restingHR: 52, sleepHours: 7.1 }, {}).point;
    expect(p.hrv).toBe(62); expect(p._src.hrv).toBe('shortcut');
    p = mergeTrendValues(p, '2026-10-14', 'oura', { hrv: 70, sleepHours: 7.6 }, {}).point;
    expect(p.hrv).toBe(70); expect(p._src.hrv).toBe('oura');
    expect(p.restingHR).toBe(52); expect(p._src.restingHR).toBe('shortcut');
    // eigene Vorrang-Liste: HFV von der Watch (Kurzbefehl) zuerst
    const q = mergeTrendValues(p, '2026-10-14', 'oura', { hrv: 70 }, { sourcePriority: { hrv: ['shortcut', 'oura'] } }).point;
    expect(q.hrv).toBe(62); expect(q._src.hrv).toBe('shortcut');
  });
  test('Korrektur von Hand gilt, bis man zurücksetzt', () => {
    let p = mergeTrendValues(null, '2026-10-14', 'oura', { sleepHours: 7.2 }, {}).point;
    p = setManual(p, '2026-10-14', 'sleepHours', 8);
    expect(p.sleepHours).toBe(8); expect(p._src.sleepHours).toBe('manual');
    const r = mergeTrendValues(p, '2026-10-14', 'oura', { sleepHours: 7.3 }, {});
    expect(r.point.sleepHours).toBe(8);
    expect(hasOriginal(r.point, 'sleepHours')).toBe(true);
    const back = resetToOriginal(r.point, 'sleepHours', {});
    expect(back.sleepHours).toBe(7.3); expect(back._src.sleepHours).toBe('oura');
  });
  test('alte Punkte (intervals.icu mit _icu) werden sauber übernommen', () => {
    const old = { date: '2026-10-10', hrv: 70, restingHR: 49, _icu: { hrv: 70, restingHR: 50 } };
    const p = upgradeLegacyPoint(old);
    expect(p._src.hrv).toBe('intervals');
    expect(p._manual.restingHR).toBe(true); // 49 war von Hand geändert
    expect(p._icu).toBeUndefined();
  });
});

const plan = [{ date: '2026-10-14', sessions: [
  { id: 'run1', sport: 'run', title: 'Lockerer Lauf 6:15', plannedMinutes: 40 },
  { id: 'swim1', sport: 'swim', title: 'Schwimmen', time: '17:00', plannedMinutes: 45 }
] }];
const act = (o: Partial<Activity>): Activity => ({ id: 'x', source: 'healthfit', sources: ['healthfit'], sport: 'run', date: '2026-10-14', startMs: Date.parse('2026-10-14T04:20:00Z'), indoor: false, min: 41, elapsedMin: 42, km: 6.4, avgHr: 146, maxHr: 160, avgPower: null, speedKmh: 9.4, paceSecKm: 384, ascentM: 20, kcal: 400, tempC: 12, hrZones: null, decouplingPct: 2, efficiency: 1.07, laps: [], intervals: null, swim: null, ...o } as Activity);

describe('Einheiten zuordnen und doppelte erkennen', () => {
  test('HealthFit-Lauf wird der geplanten Einheit zugeordnet und abgehakt', () => {
    const r = ingestActivity({ planDays: plan, sessions: {}, customs: {}, activities: {}, settings: {} }, act({ id: 'healthfit-run-1' }));
    expect(r.matched).toBe('session');
    expect(r.sessions.run1.completed).toBe(true);
    expect(r.sessions.run1.metrics).toMatchObject({ min: '41', km: '6.4', hr: '146', pace: '6:24' });
    expect(r.activities[0].sessionId).toBe('run1');
  });
  test('Dieselbe Einheit vom Kurzbefehl 10 min später: zusammengeführt, HealthFit gewinnt', () => {
    const first = ingestActivity({ planDays: plan, sessions: {}, customs: {}, activities: {}, settings: {} }, act({ id: 'shortcut-run-1', source: 'shortcut', sources: ['shortcut'], avgHr: 150, km: 6.3, laps: [] }));
    const acts = Object.fromEntries(first.activities.map(a => [a.id, a]));
    const r = ingestActivity({ planDays: plan, sessions: first.sessions, customs: {}, activities: acts, settings: {} }, act({ id: 'healthfit-run-1', startMs: Date.parse('2026-10-14T04:30:00Z') }));
    expect(r.matched).toBe('merged');
    const win = r.activities.find(a => !a.mergedInto)!;
    expect(win.source).toBe('healthfit'); expect(win.sources.sort()).toEqual(['healthfit', 'shortcut']);
    expect(r.activities.find(a => a.mergedInto)!.id).toBe('shortcut-run-1');
    expect(r.sessions.run1.metrics.hr).toBe('146');
  });
  test('2 Stunden Abstand ist eine neue Einheit, ohne passenden Plan eine Extra-Einheit', () => {
    const r = ingestActivity({ planDays: plan, sessions: { run1: { completed: true, activityId: 'a1' } }, customs: {}, activities: { a1: act({ id: 'a1', sessionId: 'run1' }) }, settings: {} }, act({ id: 'b', startMs: Date.parse('2026-10-14T16:30:00Z'), name: 'Abendrunde' }));
    expect(r.matched).toBe('custom');
    expect(r.customs[0]).toMatchObject({ title: 'Abendrunde', sport: 'run', date: '2026-10-14', activityId: 'b' });
  });
  test('Korrektur von Hand bleibt bei neuen Daten, Zurücksetzen holt die Werte der Uhr', () => {
    const r = ingestActivity({ planDays: plan, sessions: {}, customs: {}, activities: {}, settings: {} }, act({ id: 'h1' }));
    let st = setSessionMetricManual(r.sessions.run1, 'min', '45');
    const r2 = ingestActivity({ planDays: plan, sessions: { run1: st }, customs: {}, activities: { h1: r.activities[0] }, settings: {} }, act({ id: 'h1', sessionId: 'run1', avgHr: 147 }));
    expect(r2.sessions.run1.metrics.min).toBe('45');
    expect(r2.sessions.run1.metrics.hr).toBe('147');
    st = resetSessionMetrics(r2.sessions.run1);
    expect(st.metrics.min).toBe('41');
  });
  test('Ausgefallene Einheit wird nicht abgehakt', () => {
    const r = ingestActivity({ planDays: plan, sessions: { swim1: { skipped: true } }, customs: {}, activities: {}, settings: {} }, act({ id: 's', sport: 'swim', startMs: Date.parse('2026-10-14T15:00:00Z') }));
    expect(r.matched).toBe('custom');
  });
});
