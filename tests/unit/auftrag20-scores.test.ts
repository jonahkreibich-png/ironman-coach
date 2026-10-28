/* Auftrag 20: Scores zuverlässig – Datenqualität je Wert, vorsichtiger Startwert, Ausreißer gedämpft, höchstens ±3 Punkte pro Woche ohne Test,
   Obergrenze für Hochrechnungen, „vorläufig“, Transparenz im „Warum?“ und Hinweis beim Umstieg. */
import { describe, expect, test } from 'vitest';
import { sportScores, rescoreNotes, wattsTrusted, namedFromPlan, legacyActivities } from '../../shared/scores';
import { runFilter } from '../../shared/scorefilter';
import { defaultProfile, type Profile } from '../../shared/profile';
import { addDays } from '../../shared/core';
import type { Activity } from '../../shared/activity/analyze';

const today = '2026-10-24';
const prof = (o: Partial<Profile> = {}): Profile => ({ ...defaultProfile(), birthYear: 1995, sports: ['run', 'bike', 'swim'] as any, weightKg: 73, bikes: ['gravel', 'trainer'],
  ...o, thresholds: { ...defaultProfile().thresholds, lthrRun: 170, lthrBike: 169, thresholdPaceRunSec: 330, thresholdSpeedBikeKmh: 28, ...(o.thresholds || {}) } } as Profile);
let k = 0;
function act(sport: 'run' | 'bike' | 'swim', daysAgo: number, extra: Partial<Activity> = {}): Activity {
  const def: any = sport === 'run' ? { min: 45, avgHr: 150, speedKmh: 10, km: 7.5 }
    : sport === 'bike' ? { min: 60, avgHr: 140, speedKmh: 24, km: 24, bikeType: 'gravel' }
    : { min: 45, km: 1.5, swim: { pace100: 130, longestContinuousM: 400, poolLengthM: 25 } };
  return { id: sport + (k++), sport, date: addDays(today, -daysAgo), source: 'healthfit', sources: ['healthfit'], laps: [], indoor: false, ...def, ...extra } as Activity;
}
const sc = (sport: 'run' | 'bike' | 'swim', activities: Activity[], p: Profile = prof(), at = today) => sportScores({ today: at, profile: p, goal: null, illness: [], trend: [], activities }, [sport])[0];
const why = (s: any) => s.why.join('\n');

describe('Auftrag 20: Datenqualität je Wert', () => {
  test('Rolle ohne Watt mit Fantasie-Geschwindigkeit (36 km/h bei Puls 129) zählt nicht, Warum nennt den Grund', () => {
    const outdoor = [act('bike', 30), act('bike', 20)];
    // gleiche Rollen-Fahrten (zählen als Training), einmal ohne und einmal mit Fantasie-Tempo und geschätzten Watt
    const plain = [10, 7, 4, 1].map(d => act('bike', d, { id: 'r' + d, indoor: true, speedKmh: null, km: null, avgHr: 129, name: 'Rolle locker' }));
    const fake = plain.map(a => ({ ...a, speedKmh: 36.4, km: 36.4, avgPower: 205 }));
    const a = sc('bike', [...outdoor, ...plain]), b = sc('bike', [...outdoor, ...fake]);
    expect(b.score).toBe(a.score);
    expect(why(b)).toMatch(/ignoriert – Rad: .*Rolle ohne Watt – Geschwindigkeit und Watt nicht aussagekräftig/);
  });
  test('Watt zählen nur von Wattmesser oder Smart-Trainer', () => {
    const p = prof();
    expect(wattsTrusted({ indoor: true, bikeType: null, name: '' }, p)).toBe(false);
    expect(wattsTrusted({ indoor: true, bikeType: null, name: '' }, { ...p, trainerType: 'smart' })).toBe(true);
    expect(wattsTrusted({ indoor: false, bikeType: 'road', name: '' }, { ...p, trainerType: 'smart' })).toBe(false);
    expect(wattsTrusted({ indoor: false, bikeType: 'road', name: '' }, { ...p, powerMeter: true })).toBe(true);
    // einfache Rolle, Watt vom Gerät geschätzt: Score aus Tempo draußen, nicht aus FTP
    const rides = [12, 9, 6, 3].map(d => act('bike', d, { indoor: true, speedKmh: null, km: null, avgPower: 210, avgHr: 131, name: 'Zone 2 home trainer' }));
    expect(sc('bike', [act('bike', 20), ...rides], { ...p, trainerType: 'basic' }).parts[0].label).toBe('Schwellen-Tempo');
  });
  test('Smart-Trainer mit Watt: FTP in W/kg aus den Watt', () => {
    const p = prof({ trainerType: 'smart', thresholds: { ftp: 230 } as any });
    const rides = [21, 17, 13, 9, 5, 1].map(d => act('bike', d, { indoor: true, speedKmh: null, km: null, avgPower: 165, avgHr: 135, min: 60, name: 'Rolle Zone 2' }));
    const s = sc('bike', rides, p);
    expect(s.parts[0].label).toBe('FTP');
    expect(s.parts[0].value).toMatch(/W\/kg/);
  });
  test('Laufband zählt schwächer als draußen', () => {
    const base = [40, 35, 30, 25, 20].map(d => act('run', d));
    const fastOut = sc('run', [...base, act('run', 2, { speedKmh: 11.5 })]);
    const fastTm = sc('run', [...base, act('run', 2, { speedKmh: 11.5, indoor: true })]);
    expect(fastTm.parts[0].sub!).toBeLessThan(fastOut.parts[0].sub!);
    expect(why(fastTm)).toMatch(/Laufband, zählt weniger/);
  });
  test('GPS-Fehler (unrealistische Spitzen) zählen nicht', () => {
    const base = [30, 25, 20, 15, 10].map(d => act('run', d));
    const gps = sc('run', [...base, act('run', 3, { speedKmh: 31, km: 23, min: 45 })]);
    expect(gps.score).toBe(sc('run', base).score);
    expect(why(gps)).toMatch(/GPS-Fehler/);
    const bike = sc('bike', [act('bike', 20), act('bike', 2, { speedKmh: 61, km: 61 })]);
    expect(why(bike)).toMatch(/GPS-Fehler/);
  });
  test('Nutzer ohne Puls: Score aus Tempo und Gefühl, vorläufig und mit breitem Bereich', () => {
    const s = sc('run', [12, 9, 6, 3].map(d => act('run', d, { avgHr: null, rpe: 4 })));
    expect(s.measured).not.toBeNull();
    expect(s.provisional).toBe(true);
    expect(s.range).toBeGreaterThanOrEqual(5);
    expect(s.rangeText).toMatch(/vorläufig/);
  });
});

describe('Auftrag 20: Startwert, wenig Daten, Ausreißer, Wochengrenze, Test', () => {
  test('ohne Einheiten: vorsichtiger Startwert aus dem Profil, vorläufig', () => {
    const s = sc('bike', []);
    expect(s.measured).toBeNull();
    expect(s.provisional).toBe(true);
    expect(s.rangeText).toMatch(/vorläufig/);
  });
  test('nur 1-2 Einheiten: kleiner Schritt, vorläufig', () => {
    const p = prof();
    const start = sc('run', [], p).score;
    const two = sc('run', [act('run', 5, { speedKmh: 11, avgHr: 150 }), act('run', 2, { speedKmh: 11, avgHr: 150 })], p);
    expect(two.provisional).toBe(true);
    // zwei sehr schnelle lockere Läufe heben den Wert, aber nicht bis ganz hin
    const many = sc('run', [40, 35, 30, 26, 22, 18, 14, 10, 6, 2].map(d => act('run', d, { speedKmh: 11, avgHr: 150 })), p);
    expect(two.score).toBeGreaterThanOrEqual(start);
    expect(two.score).toBeLessThan(many.score);
  });
  test('ab 5 brauchbaren Einheiten nicht mehr vorläufig', () => {
    const s = sc('run', [20, 16, 12, 8, 4].map(d => act('run', d)));
    expect(s.provisional).toBe(false);
    expect(s.rangeText).not.toMatch(/vorläufig/);
  });
  test('Ausreißer wird gedämpft, bis ein zweiter ähnlicher Wert ihn bestätigt', () => {
    const base = [60, 55, 50, 45, 40, 35, 30, 25, 20].map(d => act('run', d));
    const one = sc('run', [...base, act('run', 10, { speedKmh: 13, avgHr: 150 })]);
    const ref = sc('run', base);
    expect(one.score - ref.score).toBeLessThanOrEqual(2);
    expect(why(one)).toMatch(/gedämpft: weicht stark/);
    const two = sc('run', [...base, act('run', 10, { speedKmh: 13, avgHr: 150 }), act('run', 3, { speedKmh: 13, avgHr: 150 })]);
    expect(two.score).toBeGreaterThan(one.score);
    expect(why(two)).toMatch(/bestätigt den Wert vom/);
  });
  test('ohne Test höchstens etwa 3 Punkte pro Woche, wenn der Wert belegt ist', () => {
    const base = [70, 64, 58, 52, 46, 40, 34, 28, 22, 16, 10].map(d => act('run', d));
    const before = sc('run', base, prof(), addDays(today, -8));
    const fast = [6, 4, 2].map(d => act('run', d, { speedKmh: 12, avgHr: 150 }));
    const after = sc('run', [...base, ...fast]);
    expect(after.score - before.score).toBeLessThanOrEqual(4);
  });
  test('echter Test darf mehr bewegen (Score springt passend)', () => {
    const base = [70, 64, 58, 52, 46, 40, 34, 28, 22, 16, 10].map(d => act('run', d));
    const ref = sc('run', base);
    const tst = sc('run', [...base, act('run', 2, { name: 'Lauftest 30 min', min: 30, avgHr: 172, speedKmh: 14 })]);
    expect(tst.score - ref.score).toBeGreaterThan(5);
    expect(tst.provisional).toBe(false);
    expect(why(tst)).toMatch(/Test, zählt stark/);
  });
  test('Plausibilität: Rad-Neuling ohne Test kommt mit hochgerechneten lockeren Fahrten nicht auf 80', () => {
    // Läufer mittleren Niveaus, 4 Radfahrten mit unrealistisch hohem Tempo bei niedrigem Puls
    const rides = [12, 9, 6, 3].map(d => act('bike', d, { speedKmh: 34, km: 34, avgHr: 125, bikeType: 'road' }));
    const s = sc('bike', rides, prof({ bikes: ['road'] }));
    expect(s.score).toBeLessThan(65);
    expect(why(s)).toMatch(/gedeckelt|gedämpft|Puls niedrig/);
  });
  test('fehlende Werte zählen weiter als unbekannt, nicht als schlecht', () => {
    const acts = [30, 25, 20, 15, 10].map(d => act('run', d));
    const extra = [4, 3, 2, 1].map(d => act('run', d, { avgHr: null, speedKmh: null, km: null, rpe: null } as any));
    expect(sc('run', [...acts, ...extra]).score).toBe(sc('run', acts).score);
  });
  test('Filter: Startwert mit großer Unsicherheit, erste Messung bewegt nur einen Teil', () => {
    const pts = (z: number) => z * 100;
    const r = runFilter({ obs: [{ id: 'a', date: '2026-10-01', z: 0.1, sd: 0.06, kind: 'hr', title: '', value: '' }], trained: ['2026-10-01'], cross: [], illness: [], end: '2026-10-02',
      prior: { z: 0, sd: 0.08 }, v20: { pts, weekPts: 4, capZ: null } })!;
    expect(r.z).toBeGreaterThan(0.02);
    expect(r.z).toBeLessThan(0.09);
    expect(r.usable).toBe(1);
  });
});

describe('Auftrag 20: Fall wie Jonah und Umstieg', () => {
  // einfache Rolle (Kuipers) ohne Wattmessung, Watt-Anzeige 204-215 W bei Puls ~130, zwei Fahrten draußen mit dem Gravelbike
  const p = prof({ bikes: ['gravel', 'trainer'], powerMeter: false, skills: { bikeLongestMin: 95 } as any, thresholds: { trendAt: '2026-10-14' } as any });
  const acts = [
    act('bike', 38, { indoor: true, speedKmh: null, km: 36.4, min: null, avgHr: 129, avgPower: 204, source: 'manual', sources: ['manual'], name: 'Ersatz fuer Fussball: Rad locker' }),
    act('bike', 33, { min: 64, km: 25.1, speedKmh: 23.5, avgHr: 142, source: 'manual', sources: ['manual'], name: 'outdoor Zone 2' }),
    act('bike', 31, { indoor: true, min: 30, speedKmh: null, km: null, avgHr: 131, avgPower: 210, source: 'manual', sources: ['manual'], name: 'Zone 2 home trainer' }),
    act('bike', 29, { min: 41, speedKmh: null, km: null, avgHr: null, avgPower: 270, source: 'manual', sources: ['manual'], name: 'sweet spot intervallle', bikeType: null }),
    act('bike', 23, { min: 30, speedKmh: null, km: null, avgHr: 130, avgPower: 204, source: 'manual', sources: ['manual'], name: 'zone 2', bikeType: null }),
    act('bike', 21, { min: 45, km: 17.4, speedKmh: 23.4, avgHr: 135, rpe: 4, source: 'manual', sources: ['manual'], name: 'Lockeres Rad', bikeType: null }),
    act('bike', 10, { indoor: true, min: 35, speedKmh: null, km: null, avgHr: 130, avgPower: 215, source: 'manual', sources: ['manual'] }),
    act('bike', 8, { indoor: true, min: 30, speedKmh: null, km: null, avgHr: 134, avgPower: 206 }),
    act('bike', 3, { indoor: true, min: 50, speedKmh: null, km: null, avgHr: 134, avgPower: 206 })
  ];
  test('Rad-Score realistisch (etwa 40-55, vorläufig) statt 80+', () => {
    const s = sc('bike', acts, p);
    expect(s.score).toBeGreaterThanOrEqual(38);
    expect(s.score).toBeLessThanOrEqual(55);
    expect(s.provisional).toBe(true);
    expect(s.parts[0].label).toBe('Schwellen-Tempo');
  });
  test('Umstieg: Warum und Coach erklären die Neuberechnung (Rollen-Speed zählt nicht mehr)', () => {
    const inp = { today, profile: p, goal: null, illness: [], trend: [], activities: acts };
    const [s] = sportScores(inp, ['bike']);
    expect(why(s)).toMatch(/Neu berechnet: Nach der bisherigen Rechnung stünde hier \d+/);
    const notes = rescoreNotes(inp, [s]);
    expect(notes.length).toBe(1);
    expect(notes[0].text).toMatch(/^Rad-Score neu berechnet: Rollen-Speed zählt nicht mehr \(\d+ → \d+\)/);
    expect(notes[0].old).toBeGreaterThan(notes[0].now + 10);
  });
  test('Verlauf ohne unerklärten Sprung: jeder Punkt mit der neuen Rechnung, keine Sprünge über 8', () => {
    const t = sc('bike', acts, p).trend.map(x => x.score);
    for (let i = 1; i < t.length; i++) expect(Math.abs(t[i] - t[i - 1])).toBeLessThanOrEqual(8);
  });
});

describe('Auftrag 20: Radtest zählt als Test (auch ohne Watt)', () => {
  const p = prof({ bikes: ['gravel', 'trainer'], trainerType: 'basic' });
  const outdoor = [act('bike', 30), act('bike', 20)];
  test('von der Uhr: 20-min-Runde im geplanten „Radtest“ (Name aus dem Plan) bewegt den Score und hebt „vorläufig“ auf', () => {
    const rec = act('bike', 2, { id: 'rt1', min: 70, avgHr: 145, speedKmh: 25, km: 29, name: undefined, laps: [{ kind: 'work', sec: 1200, speed: 30 / 3.6, avgHr: 163 }] as any });
    const weeks = [{ days: [{ date: rec.date, sessions: [{ id: 'bt', sport: 'bike', title: 'Radtest 20 min' }] }] }];
    const state = { sessions: { bt: { completed: true, activityId: 'rt1' } } };
    const [named] = namedFromPlan(state, weeks, [rec]);
    expect(named.name).toBe('Radtest 20 min');
    const before = sc('bike', outdoor, p), after = sc('bike', [...outdoor, named], p);
    expect(after.provisional).toBe(false);
    expect(after.score).toBeGreaterThan(before.score + 3);
    expect(why(after)).toMatch(/Test, zählt stark/);
  });
  test('von Hand: Testfelder (Ø-Puls und Tempo der 20 min) zählen wie eine Test-Runde', () => {
    const weeks = [{ startDate: '2026-10-19', days: [{ date: addDays(today, -2), sessions: [{ id: 'bt2', sport: 'bike', title: 'Radtest 20 min', plannedMinutes: 70 }] }] }];
    const state = { sessions: { bt2: { completed: true, metrics: { min: '70', hr: '145', testHr: '163', testSpeed: '30' } } }, customWorkouts: {} };
    const leg = legacyActivities(state, weeks, p);
    expect(leg[0].laps.length).toBe(1);
    expect(sc('bike', [...outdoor, ...leg], p).provisional).toBe(false);
  });
});

/* Auftrag 21: mehr Daten einrechnen – ältere Einheiten mit abnehmendem Gewicht statt harter 3-/6-Wochen-Grenze, Handeinträge wie
   Aufzeichnungen (nur nach Datenqualität), „Warum?“ nennt, wie viele Einheiten insgesamt zählen. */
describe('Auftrag 21: Scores mit mehr Daten', () => {
  test('Einheiten älter als 6 Wochen zählen weiter (weniger), Sprünge an der alten Grenze gibt es nicht', () => {
    const recent = [5, 12, 19].map(d => act('run', d));
    const old = [50, 60, 75, 90].map(d => act('run', d, { min: 100, speedKmh: 10.5, km: 17.5 }));
    const a = sc('run', recent), b = sc('run', [...recent, ...old]);
    expect(b.parts.find((p: any) => p.key === 'long')!.raw).toBeGreaterThan(a.parts.find((p: any) => p.key === 'long')!.raw);
    // längster Lauf vor 75 Tagen zählt weniger als frisch
    const fresh = sc('run', [...recent, act('run', 20, { min: 100, speedKmh: 10.5, km: 17.5 })]);
    expect(fresh.parts.find((p: any) => p.key === 'long')!.raw).toBeGreaterThan(b.parts.find((p: any) => p.key === 'long')!.raw);
    // ein Tag später kein Sprung, nur weil eine Einheit die 42-Tage-Grenze überschreitet
    const edge = [3, 10, 41.5].map(d => act('run', Math.round(d)));
    const d0 = sc('run', edge, prof(), today).score, d1 = sc('run', edge, prof(), addDays(today, 1)).score;
    expect(Math.abs(d1 - d0)).toBeLessThanOrEqual(1);
  });
  test('Handeintrag mit denselben Werten zählt wie eine Aufzeichnung', () => {
    const watch = [3, 9, 15, 22].map(d => act('run', d));
    const hand = watch.map(a => ({ ...a, id: 'h' + a.id, source: 'manual', sources: ['manual'] } as Activity));
    const a = sc('run', watch), b = sc('run', hand);
    expect(b.score).toBe(a.score);
    expect(b.confidence).toBe(a.confidence);
  });
  test('„Warum?“ nennt, wie viele Einheiten insgesamt zählen', () => {
    const s = sc('run', [...[5, 12, 19].map(d => act('run', d)), ...[60, 120].map(d => act('run', d))]);
    expect(s.confText).toMatch(/5 Läufe zählen insgesamt .*davon 3 in den letzten 6 Wochen/);
  });
});

/* Auftrag 21 (Langzeit-Simulation): am 1. Januar sprang der Score aller über 35/unter 18, weil das Alter nur aus dem Geburtsjahr kam */
test('Auftrag 21: kein Score-Sprung am Jahreswechsel', () => {
  for (const birthYear of [1960, 1975, 2010]) {
    const p = prof({ birthYear } as any);
    const acts = [3, 9, 15, 22].map(d => act('run', d));
    const shift = (list: Activity[], days: number) => list.map(a => ({ ...a, date: addDays(a.date, days) }));
    const dec31 = sportScores({ today: '2026-12-31', profile: p, goal: null, illness: [], trend: [], activities: shift(acts, addDays('2026-12-31', 0) > today ? 68 : 0) }, ['run'])[0];
    const jan1 = sportScores({ today: '2027-01-01', profile: p, goal: null, illness: [], trend: [], activities: shift(acts, 69) }, ['run'])[0];
    expect(Math.abs(jan1.score - dec31.score)).toBeLessThanOrEqual(1);
  }
});

/* Auftrag 21 (Langzeit-Simulation): ein Test mit unmöglichem Wert (z. B. Dauer korrigiert, Strecke nicht) sprang um 33 Punkte */
test('Auftrag 21: Test weit weg von allem Bisherigen zählt erst nach Bestätigung', () => {
  const base = [70, 64, 58, 52, 46, 40, 34, 28, 22, 16, 10].map(d => act('bike', d));
  const ref = sc('bike', base);
  const wild = sc('bike', [...base, act('bike', 3, { name: 'Radtest 20 min', min: 20, avgHr: 160, speedKmh: 40, km: 13.3 })]);
  expect(wild.score - ref.score).toBeLessThanOrEqual(4);
  expect(why(wild)).toMatch(/gedämpft/);
  const twice = sc('bike', [...base, act('bike', 9, { name: 'Radtest 20 min', min: 20, avgHr: 160, speedKmh: 40, km: 13.3 }), act('bike', 3, { name: 'Radtest 20 min', min: 20, avgHr: 160, speedKmh: 40, km: 13.3 })]);
  expect(twice.score).toBeGreaterThan(wild.score);
});
