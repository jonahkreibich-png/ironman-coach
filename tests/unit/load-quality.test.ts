import { describe, test, expect } from 'vitest';
import * as C from '../../shared/core';
import { recordLoadEdit, undoLoadEdit, loadSeriesFromDaily } from '../../shared/load';
import { setManual, mergeTrendValues, resetToOriginal } from '../../shared/activity/merge';
import { formScore } from '../../shared/scores';
import { defaultProfile } from '../../shared/profile';
import { doneItems } from '../../shared/coach/review';
import { doneSessions } from '../../shared/coach/analysis';
import { trendCards } from '../../shared/trends';

const date = '2026-10-20';
const state = (extra: any = {}) => ({ sessions: {}, customWorkouts: {}, trend: [], ...extra });
const extra = (id: string, more: any = {}) => ({ id, sport: 'run', metrics: { min: 60 }, icuLoad: 100, ...more });
describe('Belastungsregressionen', () => {
  test('Temperaturverlauf bleibt nach dem Umzug in Fortschritt verfügbar', () => {
    const trend = [{ date: '2026-10-19', bodyTemp: 0.1 }, { date, bodyTemp: 0.2 }];
    const card = trendCards({ today: date, period: '4w', trend, state: state({ trend }), weeks: [], activities: [], profile: defaultProfile(), illness: [] }).find(c => c.id === 'bodytemp');
    expect(card?.chart?.pts).toHaveLength(2);
  });
  test('Undo auf ein zuvor leeres Feld übernimmt einen inzwischen eingegangenen Import', () => {
    const manual = recordLoadEdit({ date }, setManual(null, date, 'ctl', 60), 'ctl');
    const updated = mergeTrendValues(manual, date, 'intervals', { ctl: 42 }, {}).point;
    expect(undoLoadEdit(updated)).toMatchObject({ ctl: 42, _src: { ctl: 'intervals' } });
  });
  test('ATL/CTL-Verlauf verwendet denselben datierten manuellen Wert', () => {
    const trend = [{ date: '2026-10-19', ctl: 40, atl: 50 }, { date, loadRatio: 1.5, _manual: { loadRatio: true } }];
    const cards = trendCards({ today: date, period: '4w', trend, state: state({ trend }), weeks: [], activities: [], profile: defaultProfile(), illness: [] });
    expect(cards.find(c => c.id === 'loadratio')?.value).toBe('1,50');
  });
  test('Undo einer CTL-Korrektur erhält inzwischen importierte ATL', () => {
    const auto = mergeTrendValues(null, date, 'intervals', { ctl: 40 }, {}).point;
    const manual = recordLoadEdit(auto, setManual(auto, date, 'ctl', 60), 'ctl');
    const updated = mergeTrendValues(manual, date, 'intervals', { ctl: 42, atl: 50 }, {}).point;
    expect(undoLoadEdit(updated).atl).toBe(50);
  });
  test('Kraftentwürfe zählen weder in Wochenbilanz noch Bewertung', () => {
    const s = state({ customWorkouts: { [date]: [extra('draft', { completed: false, sport: 'strength' })] } });
    expect(C.weekSummary(s, [], date).extra).toBe(0);
    expect(doneItems({ state: s, baseWeeks: [] } as any, date, date)).toEqual([]);
    expect(doneSessions({ state: s, baseWeeks: [] } as any, date, date)).toEqual([]);
  });
  test('verknüpfte Aufzeichnung eines Entwurfs wird nicht erneut als erledigt gezählt', () => {
    const a = { id: 'a', date, sport: 'strength', min: 60 };
    const s = state({ customWorkouts: { [date]: [extra('draft', { completed: false, sport: 'strength', activityId: 'a' })] }, activities: { a } });
    expect(C.dailyLoads(s, [])).toEqual({});
    expect(doneItems({ state: s, baseWeeks: [] } as any, date, date)).toEqual([]);
  });
  test('Gesamtform verwendet dieselben manuellen Ausgangswerte', () => {
    const s = formScore({ today: date, profile: defaultProfile(), activities: [], goal: null, illness: [], trend: [{ date, ctl: 40, atl: 50, _manual: { ctl: true, atl: true } }] });
    expect(s.ctl).toBe(40);
  });
  test('separates manuelles TSB ohne Historie bleibt sichtbar', () => {
    expect(loadSeriesFromDaily({}, [{ date, tsb: 10, _manual: { tsb: true } }], date)[0]).toMatchObject({ tsb: 10, inconsistent: true });
  });
  test('Undo stellt aktuelle importierte Automatik statt veralteter Kopie her', () => {
    const auto = mergeTrendValues(null, date, 'intervals', { ctl: 40 }, {}).point;
    const manual = recordLoadEdit(auto, setManual(auto, date, 'ctl', 60), 'ctl');
    const updated = mergeTrendValues(manual, date, 'intervals', { ctl: 42 }, {}).point;
    expect(undoLoadEdit(updated).ctl).toBe(42);
  });
  test('manuelle Korrektur bleibt beim Import, Rücksetzen und Undo behalten Verlauf', () => {
    const auto = mergeTrendValues(null, date, 'intervals', { ctl: 40, atl: 50 }, {}).point;
    const manual = recordLoadEdit(auto, setManual(auto, date, 'ctl', 60), 'ctl', 1);
    const updated = mergeTrendValues(manual, date, 'intervals', { ctl: 42 }, {}).point;
    expect(updated.ctl).toBe(60);
    const reverted = recordLoadEdit(updated, resetToOriginal(updated, 'ctl', {}), 'reset', 2);
    const undo = undoLoadEdit(reverted);
    expect(undo.ctl).toBe(60); expect(undo._loadHistory).toHaveLength(2);
    expect(undo._loadHistory[1].undoneAt).toBeTypeOf('number');
  });
  test('manueller Widerspruch bleibt sichtbar, wird nicht weiter als Zustand verwendet', () => {
    const trend = [{ date: '2026-10-19', ctl: 42, atl: 49, tsb: 100, loadRatio: 3, _manual: { tsb: true, loadRatio: true } }];
    const s = loadSeriesFromDaily({}, trend, date);
    expect(s[0]).toMatchObject({ tsb: 100, loadRatio: 3, inconsistent: true });
    expect(s[1]).toMatchObject({ ctl: 41, atl: 42, tsb: -1, inconsistent: false });
  });
  test('ungültige Datumswerte und zukünftige Anker werden ignoriert', () => {
    expect(loadSeriesFromDaily({ '2026-02-30': 100 }, [{ date: '2026-10-21', ctl: 99 }], date)).toEqual([]);
  });
  test('Import ohne lokale Einheiten ist ein gültiger Tagesendanker', () => {
    const s = C.ownLoadSeries(state({ trend: [{ date, ctl: 40, atl: 50 }] }), [], date);
    expect(s).toHaveLength(1); expect(s[0]).toMatchObject({ ctl: 40, atl: 50, tsb: -10 });
  });
  test('am Ankertag wird Last nicht erneut addiert und Folgetage verfallen', () => {
    const s = C.ownLoadSeries(state({ trend: [{ date: '2026-10-19', ctl: 42, atl: 49 }], customWorkouts: { '2026-10-19': [extra('a')] } }), [], date);
    expect(s[0].ctl).toBe(42); expect(s.at(-1).ctl).toBe(41); expect(s.at(-1).atl).toBe(42);
  });
  test('Plan und Extra mit derselben Aufzeichnung zählen einmal, Entwürfe nie', () => {
    const w = [{ days: [{ date, sessions: [{ id: 's', sport: 'run' }] }] }];
    const s = state({ sessions: { s: { completed: true, activityId: 'a', icuLoad: 100 } }, customWorkouts: { [date]: [extra('copy', { activityId: 'a' }), extra('draft', { completed: false })] } });
    expect(C.dailyLoads(s, w)[date]).toBe(100);
  });
  test('unverknüpfte Aufzeichnungen zählen und zusammengeführte nie doppelt', () => {
    const a = { id: 'a', date, sport: 'bike', min: 60, avgPower: 200, avgHr: null };
    const s = state({ profile: { thresholds: { ftp: 200 } }, activities: { a, b: { ...a, id: 'b', mergedInto: 'a' } } });
    expect(C.dailyLoads(s, [])[date]).toBe(100);
  });
  test('negative Last, Dauer und RPE werden nicht quadriert', () => {
    expect(C.sessionLoad({ sport: 'run' }, { icuLoad: -20 })).toBe(0);
    expect(C.sessionLoad({ sport: 'run' }, { metrics: { min: -30 }, rpe: 5 })).toBe(0);
    expect(C.sessionLoad({ sport: 'run' }, { metrics: { min: 60 }, rpe: -5 })).toBe(0);
  });
  test('Null-Anker und konfigurierbare Zeitkonstanten', () => {
    const s = C.ownLoadSeries(state({ settings: { loadModel: { ctlDays: 10, atlDays: 2 } }, customWorkouts: { [date]: [extra('a')] } }), [], date);
    expect(s[0]).toMatchObject({ ctl: 10, atl: 50, tsb: -40 });
  });
  test('die Planung schreibt ältere Importwerte bis heute fort', () => {
    const s = C.loadBaseline(state({ trend: [{ date: '2026-10-19', ctl: 42, atl: 49 }] }), [], date);
    expect(s).toMatchObject({ ctl: 41, atl: 42 });
  });
});
