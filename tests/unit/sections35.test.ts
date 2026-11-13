/* Auftrag 35, Punkt 1: Abschnitte (Aufwärmen, Hauptteil, Ausklang) – Erkennung aus der Uhr, von Hand, Gesamtwerte, Grenzen korrigieren */
import { test, expect } from 'vitest';
import { sectionsOf, mainPart, mainText, applySections, setBounds, totalsFromSections, minuteSeries, splitUnits } from '../../shared/sections';

const thr = { lthrRun: 170, lthrBike: 160 };
/* lockerer Lauf 60 min: 10 min Puls steigt 105→138, 45 min um 146, 5 min Ausklang (Puls 125, langsamer) */
function easyRun(): any {
  const hr: number[] = [], m: number[] = [];
  for (let i = 0; i < 60; i++) {
    if (i < 10) { hr.push(105 + Math.round(i * 3.4)); m.push(150); }
    else if (i < 55) { hr.push(146 + (i % 3) - 1); m.push(165); }
    else { hr.push(126); m.push(120); }
  }
  return { id: 'a1', sport: 'run', min: 60, avgHr: 139, series: { step: 60, hr, hx: hr.map(h => h + 4), m } };
}
const planned = { sport: 'run', zone: 'Zone 2', spec: { sport: 'run', kind: 'easy', steps: [{ part: 'warm', min: 10, zone: 1 }, { part: 'main', min: 45, zone: 2 }, { part: 'cool', min: 5, zone: 1 }] } };

test('Lockerer Lauf: Aufwärmen bis der Puls die Zielzone erreicht, Hauptteil Zone 2, Ausklang am Ende', () => {
  const r = sectionsOf(planned, {}, easyRun(), thr);
  expect(r.source).toBe('series');
  const [w, mn, c] = r.rows;
  expect(w.part).toBe('warm'); expect(mn.part).toBe('main'); expect(c.part).toBe('cool');
  // Zone 2 beginnt bei 81 % von 170 = 138 bpm → Minute 10
  expect(r.warmEnd).toBeGreaterThanOrEqual(9); expect(r.warmEnd).toBeLessThanOrEqual(11);
  expect(r.coolStart).toBe(55);
  expect(mn.hr).toBeGreaterThanOrEqual(145); expect(mn.hr).toBeLessThanOrEqual(147);
  const mp = mainPart(planned, {}, easyRun(), thr)!;
  expect(mp.hr).toBe(mn.hr);
  // Gesamtschnitt (139) wäre noch Zone 2 knapp; Hauptteil 146 klar Zone 2, Zeit in Zone fast komplett
  expect(mp.zoneSec![1] / mp.zoneSec!.reduce((a, b) => a + b, 0)).toBeGreaterThan(0.95);
  expect(mainText(mp, 170, 'run', 2)).toMatch(/^Hauptteil 4\d min, Ø Puls 14\d \(Zone 2\), 100 % der Zeit in Zone 2$/);
});

test('Grenze von Hand korrigieren: Aufwärmen bis Minute 15', () => {
  const st = setBounds({}, 15, null);
  const r = sectionsOf(planned, st, easyRun(), thr);
  expect(r.corrected).toBe(true);
  expect(r.warmEnd).toBe(15);
  expect(r.rows.find(x => x.part === 'warm')!.min).toBe(15);
  // Ausklang bleibt automatisch erkannt (ab Minute 55)
  expect(r.rows.find(x => x.part === 'main')!.min).toBe(40); expect(r.coolStart).toBe(55);
  expect(sectionsOf(planned, setBounds(st, null, null), easyRun(), thr).corrected).toBe(false);
});

test('Ohne Aufwärmen und Ausklang (gleich ab Start im Ziel): kein Hauptteil-Ersatz, Gesamtwerte gelten', () => {
  const hr = Array.from({ length: 40 }, () => 145); const m = hr.map(() => 165);
  const act = { sport: 'run', series: { step: 60, hr, hx: hr, m } };
  expect(mainPart(planned, {}, act, thr)).toBeNull();
});

test('Runden der Uhr (Workout mit Aufwärmen/Ausklang) haben Vorrang vor dem Verlauf', () => {
  const act = { ...easyRun(), laps: [{ n: 1, sec: 900, m: 2500, avgHr: 125, maxHr: 140, kind: 'warmup' }, { n: 2, sec: 1800, m: 5400, avgHr: 160, maxHr: 166, kind: 'work' }, { n: 3, sec: 600, m: 1500, avgHr: 130, maxHr: 150, kind: 'cooldown' }] };
  const r = sectionsOf({ ...planned, zone: 'Zone 3' }, {}, act, thr);
  expect(r.source).toBe('watch');
  expect(r.rows.map(x => [x.part, x.min, x.hr])).toEqual([['warm', 15, 125], ['main', 30, 160], ['cool', 10, 130]]);
  expect(r.rows[1].pace).toBe('5:33');
});

test('Ältere Aufzeichnung nur mit km-Splits: Abschnitte nach Kilometern', () => {
  const splits = [['6:30', 120], ['6:10', 134], ['5:40', 146], ['5:38', 147], ['5:40', 147], ['5:39', 148], ['5:41', 148], ['5:40', 147], ['6:40', 128]].map(([p, h], i) => ({ km: i + 1, pace: p as string, hr: h as number }));
  const r = sectionsOf(planned, {}, { sport: 'run', splits }, thr);
  expect(r.source).toBe('splits');
  const main = r.rows.find(x => x.part === 'main')!;
  expect(main.km).toBe(6);
  expect(main.hr).toBeGreaterThanOrEqual(146);
});

test('Von Hand: Abschnitte gewinnen, Gesamtwerte werden berechnet, eigene Gesamtwerte bleiben', () => {
  const rows = [{ part: 'warm', min: '10', km: '1,6', hr: '120' }, { part: 'main', min: '40', km: '7,2', hr: '147', maxHr: '158' }, { part: 'cool', min: '5', km: '0,8', hr: '125' }] as any;
  let st: any = applySections({ metrics: {} }, rows, 'run');
  expect(st.metrics.min).toBe('55'); expect(st.metrics.km).toBe('9.6'); expect(st.metricsSrc.min).toBe('sections');
  expect(st.metrics.hr).toBe(String(Math.round((10 * 120 + 40 * 147 + 5 * 125) / 55)));
  expect(st.metrics.maxHr).toBe('158');
  expect(sectionsOf(planned, st, easyRun(), thr).source).toBe('manual');
  const mp = mainPart(planned, st, null, thr)!;
  expect(mp.hr).toBe(147); expect(mp.paceSec).toBe(Math.round(2400 / 7.2));
  // eigene Dauer bleibt
  st = { ...st, metrics: { ...st.metrics, min: '56' }, metricsSrc: { ...st.metricsSrc, min: 'manual' } };
  st = applySections(st, rows.map((r: any) => r.part === 'main' ? { ...r, min: '41' } : r), 'run');
  expect(st.metrics.min).toBe('56');
  // alles leeren: berechnete Gesamtwerte verschwinden, eigene bleiben
  st = applySections(st, [], 'run');
  expect(st.metrics.sections).toBeUndefined(); expect(st.metrics.hr).toBeUndefined(); expect(st.metrics.min).toBe('56');
});

test('Gesamtwerte aus Abschnitten: Rad mit Tempo statt Strecke, Schwimmen in Metern', () => {
  expect(totalsFromSections([{ part: 'warm', min: '15', speed: '24' }, { part: 'main', min: '60', speed: '30', power: '200' }] as any, 'bike')).toMatchObject({ min: '75', km: '36' });
  expect(totalsFromSections([{ part: 'warm', min: '6', meters: '200' }, { part: 'tech', min: '8', meters: '200' }, { part: 'main', min: '20', meters: '1000' }, { part: 'cool', min: '3', meters: '100' }] as any, 'swim')).toMatchObject({ min: '37', meters: '1500' });
});

test('Rad: Ausklang an niedrigeren Watt erkannt, Grenzen nie über 35 % Aufwärmen', () => {
  const hr: number[] = [], w: number[] = [], m: number[] = [];
  for (let i = 0; i < 90; i++) { const warm = i < 12, cool = i >= 82; hr.push(warm ? 100 + i * 3 : cool ? 115 : 138); w.push(warm ? 130 : cool ? 110 : 190); m.push(warm ? 450 : cool ? 400 : 520); }
  const r = sectionsOf({ sport: 'bike', zone: 'Zone 2' }, {}, { sport: 'bike', series: { step: 60, hr, hx: hr, m, w } }, thr, 'bike');
  expect(r.warmEnd).toBeGreaterThanOrEqual(9); expect(r.warmEnd).toBeLessThanOrEqual(12);
  expect(r.coolStart).toBe(82);
  { const pw = r.rows.find(x => x.part === 'main')!.power; expect(pw).toBeGreaterThanOrEqual(185); expect(pw).toBeLessThanOrEqual(190); }
  expect(splitUnits(hr.map(h => ({ sec: 60, hr: 100, hx: 100, m: 400, w: null })), { sport: 'bike' })!.w).toBe(0);
});

test('Minuten-Verlauf beim Einlesen: Puls, Strecke, Watt je Minute', () => {
  const records = Array.from({ length: 1200 }, (_, t) => ({ t: t * 3, hr: 120 + Math.floor(t / 100), cad: null, power: 150, dist: t * 3 * 3, speed: 3, alt: null, temp: null, lat: null, lon: null }));
  const s = minuteSeries({ sport: 'bike', records } as any)!;
  expect(s.hr.length).toBe(60);
  expect(s.m[5]).toBe(180);
  expect(s.w![0]).toBe(150);
  expect(minuteSeries({ sport: 'swim', records } as any)).toBeNull();
});
