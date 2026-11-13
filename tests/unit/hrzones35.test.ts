/* Auftrag 35, Punkt 5: Puls-Zonen aus Uhrdaten vorschlagen – vorsichtig gegen Ausreißer, Herkunft je Wert */
import { test, expect } from 'vitest';
import { hrZoneSuggest, applyHrSuggestion, dismissHrSuggestion, originText, confirmedMax } from '../../shared/hrzones';
import { applyTestUpdate } from '../../shared/fields';
import { setThreshold } from '../../shared/profile';

const TODAY = '2026-11-13';
const prof = (th: any = {}): any => ({ birthYear: 1990, sports: ['run', 'bike'], thresholds: { lthrRun: 170, lthrBike: 160, thresholdPaceRunSec: 300, thresholdSpeedBikeKmh: 30, maxHr: 186, ftp: null, cssSec: null, estimated: [], ...th } });
const series = (peak: number) => { const hr = Array.from({ length: 40 }, (_, i) => (i === 30 ? peak - 3 : 150)); return { step: 60, hr, hx: hr.map(h => h + 3), m: hr.map(() => 200) }; };
const act = (id: string, date: string, o: any) => ({ id, source: 'file', sources: ['file'], sport: 'run', date, startMs: Date.parse(date), min: 45, laps: [], ...o });
const state = (acts: any[]) => ({ sessions: {}, activities: Object.fromEntries(acts.map(a => [a.id, a])) });

test('Maximalpuls: zwei bestätigte höhere Werte → Vorschlag mit dem zweithöchsten', () => {
  const s = hrZoneSuggest(state([act('a1', '2026-11-01', { maxHr: 197, series: series(197) }), act('a2', '2026-11-08', { maxHr: 193, series: series(193) })]), [], prof(), TODAY)!;
  const c = s.changes.find(x => x.key === 'maxHr')!;
  expect(c.from).toBe(186); expect(c.to).toBe(193); expect(c.n).toBe(2);
  expect(s.text).toContain('Maximalpuls 186 → 193');
});

test('Ausreißer zählen nicht: einzelner Wert, Spitze ohne gehaltenen Puls, Teamsport', () => {
  // nur einer
  expect(hrZoneSuggest(state([act('a1', '2026-11-01', { maxHr: 197, series: series(197) })]), [], prof(), TODAY)).toBeNull();
  // Spitze im Verlauf nicht gehalten (Minuten-Schnitt weit darunter): Messfehler
  const spike = { step: 60, hr: Array(40).fill(150), hx: Array(40).fill(152), m: Array(40).fill(200) };
  expect(confirmedMax({ maxHr: 205, series: spike })).toBeNull();
  expect(hrZoneSuggest(state([act('a1', '2026-11-01', { maxHr: 205, series: spike }), act('a2', '2026-11-03', { maxHr: 204, series: spike })]), [], prof(), TODAY)).toBeNull();
  // Fußball zählt nicht
  expect(hrZoneSuggest(state([act('f1', '2026-11-01', { sport: 'football', maxHr: 199, series: series(199) }), act('f2', '2026-11-05', { sport: 'football', maxHr: 198, series: series(198) })]), [], prof(), TODAY)).toBeNull();
  // ein großer Sprung wird begrenzt (+12)
  const big = hrZoneSuggest(state([act('a1', '2026-11-01', { maxHr: 215, series: series(215) }), act('a2', '2026-11-08', { maxHr: 214, series: series(214) })]), [], prof(), TODAY)!;
  expect(big.changes.find(x => x.key === 'maxHr')!.to).toBe(198);
});

test('Schwellenpuls: zwei harte gleichmäßige 25-min-Abschnitte klar über dem hinterlegten Wert', () => {
  const lap = (hr: number) => [{ n: 1, sec: 600, avgHr: 140, kind: 'warmup' }, { n: 2, sec: 1500, avgHr: hr, kind: 'work' }, { n: 3, sec: 600, avgHr: 145, kind: 'cooldown' }];
  const s = hrZoneSuggest(state([act('r1', '2026-10-30', { laps: lap(182), maxHr: 188 }), act('r2', '2026-11-06', { laps: lap(184), maxHr: 189 })]), [], prof(), TODAY)!;
  const c = s.changes.find(x => x.key === 'lthrRun')!;
  expect(c.to).toBe(Math.round((182 * 0.97 + 184 * 0.97) / 2));
  expect(s.zones.find(z => z.sport === 'run')!.after[1].lo).toBe(Math.round(c.to * 0.81));
  // nur leicht darüber (unter 3 %): kein Vorschlag
  expect(hrZoneSuggest(state([act('r1', '2026-10-30', { laps: lap(178) }), act('r2', '2026-11-06', { laps: lap(179) })]), [], prof(), TODAY)).toBeNull();
});

test('Übernehmen setzt Werte mit Herkunft und Datum; „Nicht jetzt“ blendet denselben Vorschlag aus', () => {
  const st = state([act('a1', '2026-11-01', { maxHr: 197, series: series(197) }), act('a2', '2026-11-08', { maxHr: 193, series: series(193) })]);
  const s = hrZoneSuggest(st, [], prof(), TODAY)!;
  const p = applyHrSuggestion(prof(), s, TODAY);
  expect(p.thresholds.maxHr).toBe(193);
  expect(originText(p, 'maxHr', TODAY)).toBe('aus deinen Uhrdaten, 13.11.2026');
  expect(hrZoneSuggest(st, [], p, TODAY)).toBeNull();
  expect(hrZoneSuggest(st, [], dismissHrSuggestion(prof(), s), TODAY)).toBeNull();
});

test('Herkunft je Wert: Test, von Hand, geschätzt, ältere Daten', () => {
  const p1 = applyTestUpdate(prof(), { sport: 'run', sessionId: 's1', date: '2026-10-12', thresholds: { lthrRun: 174 }, text: '', title: '' } as any);
  expect(originText(p1, 'lthrRun', TODAY)).toBe('Lauftest, 12.10.2026');
  expect(originText(setThreshold(prof(), 'lthrBike', 158, { src: 'von dir eingetragen', at: '2026-11-02' }), 'lthrBike', TODAY)).toBe('von dir eingetragen, 02.11.2026');
  expect(originText(prof({ estimated: ['lthrRun'] }), 'lthrRun', TODAY)).toMatch(/^geschätzt/);
  expect(originText(prof({ source: 'Radtest 05.10.' }), 'lthrBike', TODAY)).toBe('Radtest, 05.10.');
  expect(originText(prof({ source: 'Trend aus deinen Einheiten (01.11.)' }), 'lthrRun', TODAY)).toBe('von dir eingetragen');
});
