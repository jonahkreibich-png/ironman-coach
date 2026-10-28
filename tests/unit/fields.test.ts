/* Auftrag 7, Punkt 3: Felder statt Notizfeld */
import { test, expect, describe } from 'vitest';
import { fieldsFromNote, migrateNotes, fieldsOf, zoneVerdict, loadOn, fieldsFromIcu, SPORT_FIELDS, splitsFromLaps } from '../../shared/fields';
import { metricsFromActivity, applyToSession, setSessionMetricManual, resetSessionMetrics } from '../../shared/activity/merge';
import { legacyActivities } from '../../shared/scores';
import { defaultProfile } from '../../shared/profile';

describe('Notizen lesen', () => {
  test('Beispiel aus dem Auftrag: „5,07km, Ø6:21/km, ØHF153, Entkopplung 4,5 %, Kadenz 163“', () => {
    const r = fieldsFromNote('5,07km, Ø6:21/km, ØHF153, Entkopplung 4,5 %, Kadenz 163', 'run');
    expect(r.metrics).toMatchObject({ km: '5.07', pace: '6:21', hr: '153', decoupling: '4.5', cadence: '163' });
  });
  test('Lauf mit max. Puls, vertikalem Verhältnis, VO2max, RPE und Abweichung', () => {
    const r = fieldsFromNote('Getauscht auf Donnerstag frueh: 5,07km, Ø6:21/km, ØHF153 (max165), aerobe Entkopplung 4,5%, Kadenz 163spm, vertikales Verhaeltnis 9,1%, VO2max 56,8, rpe 4', 'run');
    expect(r.metrics).toMatchObject({ maxHr: '165', vertRatio: '9.1', vo2max: '56.8' });
    expect(r.rpe).toBe('4');
    expect(r.deviation).toMatch(/^Getauscht auf Donnerstag/);
  });
  test('ohne Ø: Pace aus Distanz und Zeit, nicht der schnelle letzte Kilometer; Spannen zählen nicht', () => {
    const r = fieldsFromNote('5,09km in 32:39. Erste 4km Ø6:20-6:40/km bei HF145-153, letzter km bewusst schneller auf 5:20/km', 'run');
    expect(r.metrics.min).toBe('32.7');
    expect(r.metrics.pace).toBe('6:25');
    expect(fieldsFromNote('33min, 5,08km, durchschnittlich 149 bpm und max 158bpm, 6:36 pace', 'run').metrics).toMatchObject({ pace: '6:36', hr: '149', maxHr: '158', min: '33' });
  });
  test('Rad drinnen mit Watt und Trittfrequenz, draußen mit Gravelbike', () => {
    expect(fieldsFromNote('60min/36,4km, Ø204W (max238W), Ø84rpm (max94rpm), ØHF129 (max140). Home-Trainer', 'bike').metrics)
      .toMatchObject({ km: '36.4', power: '204', maxPower: '238', cadence: '84', maxCadence: '94', hr: '129', maxHr: '140', indoor: 'in' });
    expect(fieldsFromNote('mit dem gravel bike, Øherzfrequenz 142bpm und max 157bpm, Ø23,48km/h', 'bike').metrics).toMatchObject({ hr: '142', maxHr: '157', speed: '23.48', indoor: 'out', bikeType: 'gravel' });
  });
  test('Schwimmen: Meter, längste Strecke Kraul am Stück, Technik-Problem; Abschnitte sind keine Gesamtdauer', () => {
    const r = fieldsFromNote('Durchbruch: erstmals 12,5m (halbe Bahn) am Stueck Kraul. Problem jetzt: Beine sinken ab. 650m, 45min', 'swim');
    expect(r.metrics).toMatchObject({ longestCrawl: '12.5', meters: '650', min: '45' });
    expect(r.metrics.technique).toMatch(/beine sinken ab/);
    expect(fieldsFromNote('5min warm up, dann 10min 250 watt, dann 3min erholung, dann 8min', 'bike').metrics.min).toBeUndefined();
  });
  test('Kraft und Fußball', () => {
    expect(fieldsFromNote('leicht oberkörper', 'strength').metrics.area).toBe('upper');
    expect(fieldsFromNote('Umstieg auf Oberkoerper/Unterkoerper', 'strength').metrics.area).toBeUndefined();
    expect(fieldsFromNote('45min gespielt, anstrengend', 'football').metrics).toMatchObject({ kind: 'game', min: '45' });
  });
});

describe('alte Notizen übertragen', () => {
  const weeks = [{ weekNumber: 1, startDate: '2026-09-14', days: [{ date: '2026-09-17', sessions: [{ id: 'r1', sport: 'run', title: 'Lauf' }] }] }];
  const state = () => ({ sessions: { r1: { completed: true, notes: '5,07km, Ø6:21/km, ØHF153', metrics: { km: '5.1' } } }, customWorkouts: { '2026-09-20': [{ id: 'c1', sport: 'bike', description: 'durchschnittlich 131bpm, 210watt' }] } });
  test('leere Felder werden gefüllt (Quelle „aus Notiz“), vorhandene Werte und die Notiz bleiben', () => {
    const st: any = state();
    expect(migrateNotes(st, weeks)).toBe(2);
    expect(st.sessions.r1.metrics).toMatchObject({ km: '5.1', pace: '6:21', hr: '153' });
    expect(st.sessions.r1.metricsSrc).toMatchObject({ pace: 'note', hr: 'note' });
    expect(st.sessions.r1.metricsSrc.km).toBeUndefined();
    expect(st.sessions.r1.notes).toBe('5,07km, Ø6:21/km, ØHF153');
    expect(st.customWorkouts['2026-09-20'][0].metrics).toMatchObject({ hr: '131', power: '210' });
  });
  test('nur einmal: eine spätere Korrektur von Hand wird nicht wieder überschrieben', () => {
    const st: any = state(); migrateNotes(st, weeks);
    st.sessions.r1 = setSessionMetricManual(st.sessions.r1, 'hr', '150');
    expect(migrateNotes(st, weeks)).toBe(0);
    expect(st.sessions.r1.metrics.hr).toBe('150');
    expect(st.sessions.r1.metricsSrc.hr).toBe('manual');
  });
  test('Scores nutzen die Felder: Entkopplung und längste Kraul-Strecke kommen in die Messungen', () => {
    const st: any = { sessions: { r1: { completed: true, metrics: { km: '10', min: '60', hr: '150', decoupling: '4.5' } }, s1: { completed: true, metrics: { meters: '800', min: '30', longestCrawl: '50' } } }, customWorkouts: {} };
    const w = [{ days: [{ date: '2026-10-01', sessions: [{ id: 'r1', sport: 'run', title: 'Lauf' }, { id: 's1', sport: 'swim', title: 'Schwimmen' }] }] }];
    const acts = legacyActivities(st, w, defaultProfile());
    expect(acts.find(a => a.sport === 'run')!.decouplingPct).toBe(4.5);
    expect(acts.find(a => a.sport === 'swim')!.swim!.longestContinuousM).toBe(50);
  });
});

describe('automatisch: Werte aus Uhr und intervals.icu, Pulszone, Belastung', () => {
  const act: any = { id: 'a1', source: 'healthfit', sources: ['healthfit'], sport: 'run', date: '2026-10-20', startMs: 0, indoor: false, min: 32, km: 5.1, avgHr: 152, maxHr: 166, avgPower: null, speedKmh: 9.6, paceSecKm: 376, decouplingPct: 3.2, efficiency: 1.2, avgCadence: 164, laps: [], splits: [{ km: 1, pace: '6:20', hr: 148 }, { km: 2, pace: '6:15', hr: 153 }], swim: null, intervals: null };
  test('Uhr füllt die Felder mit Quelle, eine Korrektur von Hand gilt, „Original“ holt den Uhr-Wert zurück', () => {
    const m = metricsFromActivity(act);
    expect(m).toMatchObject({ maxHr: '166', decoupling: '3.2', cadence: '164' });
    expect(m.splits).toHaveLength(2);
    let st = applyToSession({}, act, m);
    expect(st.metricsSrc.cadence).toBe('healthfit');
    st = setSessionMetricManual(st, 'cadence', '170');
    st = applyToSession(st, act, m);
    expect(st.metrics.cadence).toBe('170');
    expect(resetSessionMetrics(st).metrics.cadence).toBe('164');
  });
  test('intervals.icu: Kadenz beim Laufen doppelt, Watt, Entkopplung, drinnen', () => {
    expect(fieldsFromIcu({ average_cadence: 81, max_heartrate: 170, decoupling: 4.26 }, 'run')).toMatchObject({ cadence: '162', maxHr: '170', decoupling: '4.3' });
    expect(fieldsFromIcu({ icu_average_watts: 205, average_cadence: 86, trainer: true }, 'bike')).toMatchObject({ power: '205', cadence: '86', indoor: 'in' });
  });
  test('Splits aus Kilometer-Runden', () => {
    expect(splitsFromLaps([{ m: 1000, sec: 380, avgHr: 150 }, { m: 1003, sec: 372, avgHr: 154 }, { m: 300, sec: 100 }])).toEqual([{ km: 1, pace: '6:20', hr: 150 }, { km: 2, pace: '6:11', hr: 154 }]);
  });
  test('Pulszone: „Zone 3 statt 2“ bzw. „wie geplant“', () => {
    const thr = { lthrRun: 170, lthrBike: 169 };
    expect(zoneVerdict({ sport: 'run', zone: 'Zone 2' }, { metrics: { hr: '156' } }, thr)!.text).toBe('Zone 3 statt 2');
    expect(zoneVerdict({ sport: 'run', zone: 'Zone 2' }, { metrics: { hr: '145' } }, thr)!.text).toBe('Zone 2 wie geplant');
    expect(zoneVerdict({ sport: 'swim', zone: 'Zone 2' }, { metrics: { hr: '145' } }, thr)).toBe(null);
  });
  test('CTL/ATL/TSB des Tages aus intervals.icu, sonst aus den eigenen Einheiten', () => {
    expect(loadOn({ trend: [{ date: '2026-10-20', ctl: 30.4, atl: 35.1, tsb: -4.7 }] }, [], '2026-10-20')).toMatchObject({ ctl: 30, atl: 35, tsb: -5, source: 'intervals.icu' });
    const own = loadOn({ trend: [], sessions: { x: { completed: true, metrics: { min: '60' } } } }, [{ days: [{ date: '2026-10-19', sessions: [{ id: 'x', sport: 'run', title: 'Lauf', zone: 'Zone 2', plannedMinutes: 60 }] }] }], '2026-10-20');
    expect(own && own.source).toBe('eigene Einheiten');
  });
  test('jede Sportart hat die Felder aus dem Auftrag', () => {
    const keys = (s: string) => SPORT_FIELDS[s].map(f => f.key);
    expect(keys('run')).toEqual(expect.arrayContaining(['min', 'km', 'pace', 'splits', 'hr', 'maxHr', 'decoupling', 'efficiency', 'cadence', 'vertRatio', 'vo2max', 'cardioRecovery']));
    expect(keys('bike')).toEqual(expect.arrayContaining(['min', 'km', 'power', 'maxPower', 'cadence', 'maxCadence', 'hr', 'maxHr', 'indoor', 'bikeType']));
    expect(keys('swim')).toEqual(expect.arrayContaining(['min', 'meters', 'pace100', 'spl', 'rate', 'dps', 'longestCrawl', 'crawlShare', 'technique']));
    expect(keys('strength')).toEqual(['area', 'min', 'exercises']);
    expect(keys('football')).toEqual(['kind', 'min', 'hr', 'maxHr']);
    expect(fieldsOf({ rpe: '6', feel: '4', deviation: 'verkürzt', metrics: {} }, 'run')).toMatchObject({ rpe: 6, feel: 4, deviation: 'verkürzt' });
  });
});

import { runTestUpdate, applyTestUpdate } from '../../shared/fields';
describe('nach dem Schwellentest: Zonen automatisch aktualisieren', () => {
  const weeks = [{ days: [{ date: '2026-10-25', sessions: [{ id: 't1', sport: 'run', title: 'Lauftest 30 min', plannedMinutes: 55 }] }] }];
  const prof: any = { thresholds: { lthrRun: 170, thresholdPaceRunSec: 339, aetHr: [150, 155], estimated: ['maxHr'] } };
  test('eingetragene Werte des Tests (Ø-Puls, Ø-Pace) → neue Schwellen und aerobe Schwelle im gleichen Verhältnis', () => {
    const st = { sessions: { t1: { completed: true, metrics: { hr: '174', pace: '5:25' } } } };
    const u = runTestUpdate(st, weeks, prof, '2026-10-25')!;
    expect(u).toMatchObject({ lthrRun: 174, thresholdPaceRunSec: 325, aetHr: [154, 159] });
    const p2 = applyTestUpdate(prof, u);
    expect(p2.thresholds).toMatchObject({ lthrRun: 174, thresholdPaceRunSec: 325, source: 'Lauftest 25.10.' });
    expect(runTestUpdate(st, weeks, p2, '2026-10-25')).toBe(null); // nur einmal
  });
  test('von der Uhr: Belastungsrunde von 30 min (Ø-Puls × 1,01)', () => {
    const st = { sessions: { t1: { completed: true, activityId: 'a', metrics: { hr: '160' } } }, activities: { a: { laps: [{ sec: 900, m: 2300, avgHr: 140, kind: 'warmup' }, { sec: 1800, m: 5500, avgHr: 171, kind: 'work' }, { sec: 600, m: 1400, avgHr: 145, kind: 'cooldown' }] } } };
    expect(runTestUpdate(st, weeks, prof, '2026-10-26')).toMatchObject({ lthrRun: 173, thresholdPaceRunSec: 327 });
  });
  test('unplausible Werte (z. B. lockerer Puls) werden nicht übernommen, ohne erledigten Test nichts', () => {
    expect(runTestUpdate({ sessions: { t1: { completed: true, metrics: { hr: '120', pace: '7:30' } } } }, weeks, prof, '2026-10-25')).toBe(null);
    expect(runTestUpdate({ sessions: {} }, weeks, prof, '2026-10-25')).toBe(null);
  });
});

test('Pull Buoy bleibt ein eigenes kanonisches Ergebnis', () => {
 expect(fieldsOf({metrics:{longestCrawl:'50',longestPull:'100'}},'swim')).toMatchObject({longestCrawl:50,longestPull:100});
 expect(fieldsFromNote('100 m Kraul mit Pull Buoy am Stück und 50 m Kraul ohne Pull Buoy am Stück','swim').metrics).toMatchObject({longestPull:'100',longestCrawl:'50'});
 expect(fieldsFromNote('2 x 50 m Kraul mit Pause, insgesamt 100 m','swim').metrics.longestCrawl).toBeUndefined();
});

test('unbekannte oder unterstützte Dauerschwimmstrecke ist kein Kraulnachweis', async()=>{
 const {crawlOf}=await import('../../shared/results');
 expect(crawlOf({source:'manual',swim:{longestContinuousM:100}})).toBeNull();
 expect(crawlOf({swim:{longestContinuousM:100,byStroke:{freestyle:100},equipment:['pull buoy']}})).toBeNull();
 expect(crawlOf({swim:{longestContinuousM:100,byStroke:{freestyle:100}}})).toBe(100);
 expect(crawlOf({source:'manual',swim:{longestCrawlM:50,longestPullM:100,equipment:['pull buoy']}})).toBe(50);
});


test.each(['100 m Brust am Stück','100 m Rücken am Stück','100 m breaststroke am Stück','100 m backstroke am Stück','100 m am Stück','100 m Kraul mit Kickbrett am Stück','100 m Kraul mit board am Stück','100 m Kraul mit fins am Stück','100 m Kraul mit Flossen am Stück','100 m Kraul mit snorkel am Stück','100 m Kraul mit Schnorchel am Stück','100 m Kraul mit paddles am Stück'])('Notiz bildet keinen unaided Kraulnachweis aus %s',text=>{
 expect(fieldsFromNote(text,'swim').metrics.longestCrawl).toBeUndefined();
});
