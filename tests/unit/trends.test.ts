/* Auftrag 13, Punkt 3: Trends. Künstliche Daten mit bekanntem Verlauf, damit jede Aussage prüfbar ist. */
import { test, expect, describe } from 'vitest';
import { trendCards, type TrendInput, type Period } from '../../shared/trends';
import * as C from '../../shared/core';
import { legacyActivities } from '../../shared/scores';

const TODAY = '2026-10-16';
const profile: any = { name: 'Test', birthYear: 1990, sex: 'm', sports: ['run', 'bike', 'swim'], thresholds: { lthrRun: 170, lthrBike: 162 } };
const act = (o: any) => ({ id: o.id || 'a' + Math.random(), source: 'healthfit', sources: ['healthfit'], indoor: false, startMs: Date.parse(o.date + 'T16:00:00Z'), elapsedMin: null, maxHr: null, avgPower: null, ascentM: null, kcal: null, tempC: null, hrZones: null, decouplingPct: null, efficiency: null, laps: [], intervals: null, swim: null, km: null, speedKmh: null, paceSecKm: null, ...o });

function world(opts: { days?: number; improving?: boolean } = {}): TrendInput {
  const n = opts.days ?? 120;
  const trend: any[] = []; const activities: any[] = []; const nutrition: any = {};
  for (let i = n; i >= 0; i--) {
    const d = C.addDays(TODAY, -i);
    const k = (n - i) / n; // 0 → 1 über den Zeitraum
    trend.push({ date: d, hrv: Math.round(60 + (i < 7 ? -8 : 0) + (i % 3)), restingHR: 50 + (i < 7 ? 1 : 0), sleepHours: i % 4 === 0 ? 6.4 : 8.1 });
    const dow = new Date(d + 'T12:00:00Z').getUTCDay();
    if (dow === 2 || dow === 4 || dow === 0) { // Läufe: werden bei gleichem Puls schneller
      const sp = 10 + (opts.improving === false ? 0 : 1.2 * k);
      const min = dow === 0 ? 60 + Math.round(30 * k) : 45;
      activities.push(act({ id: 'r' + d, sport: 'run', date: d, min, km: Math.round(sp * min / 60 * 100) / 100, speedKmh: sp, paceSecKm: Math.round(3600 / sp), avgHr: 140, decouplingPct: dow === 0 ? 4 - 2 * k : null, hrZones: [600, 1800, 200, 100, 0] }));
    }
    if (dow === 6) activities.push(act({ id: 'b' + d, sport: 'bike', date: d, min: 120, km: 56, speedKmh: 28, avgHr: 130, avgPower: 170 + Math.round(20 * k) }));
    if (dow === 3) activities.push(act({ id: 's' + d, sport: 'swim', date: d, min: 40, km: 1.5, swim: { poolLengthM: 25, lengths: 60, activeLengths: 60, strokesPerLength: 20 - 3 * k, metersPerStroke: 1.25 + 0.3 * k, pace100: 130 - 10 * k, byStroke: {}, longestContinuousM: Math.round(100 + 300 * k), strokeRate: null } }));
    if (i % 7 === 0) nutrition[d] = { weight: 72 - k };
  }
  return { today: TODAY, period: '3m', activities, trend, illness: [], profile, state: { sessions: {}, customWorkouts: {}, trend, nutrition, settings: {}, illnessPeriods: [] }, weeks: [] };
}
const byId = (cards: any[], id: string) => cards.find(c => c.id === id);

describe('Trends mit genug Daten', () => {
  const I = world();
  const cards = trendCards(I);
  test('alle Gruppen sind da, jede Karte hat Zahl und Satz', () => {
    for (const g of ['recovery', 'fitness', 'efficiency', 'intensity', 'swim', 'bests', 'long', 'relations']) expect(cards.some(c => c.group === g)).toBe(true);
    for (const c of cards.filter(c => !c.locked)) { expect(c.value).toBeTruthy(); expect(c.text.length).toBeGreaterThan(20); expect(c.text).not.toMatch(/undefined|NaN|null/); }
  });
  test('HFV: 7-Tage-Schnitt deutlich unter der 60-Tage-Basis → Warnung', () => {
    const c = byId(cards, 'hrv'); expect(c.tone).toBe('warn'); expect(c.delta).toMatch(/▼ .* zur Basis/); expect(c.text).toMatch(/unter deiner Basis/);
  });
  test('Schlaf: Schnitt und Bedarf', () => { const c = byId(cards, 'sleep'); expect(c.text).toMatch(/Bedarf ist 7,0-9,0 h/); });
  test('Laufen: schneller bei gleichem Puls', () => { const c = byId(cards, 'runpace'); expect(c.tone).toBe('good'); expect(c.delta).toMatch(/schneller/); expect(c.value).toMatch(/^\d:\d\d$/); });
  test('Rad: Watt bei gleichem Puls steigt', () => { const c = byId(cards, 'bikehr'); expect(c.title).toMatch(/Watt/); expect(c.tone).toBe('good'); });
  test('Entkopplung unter 5 % → gut', () => { const c = byId(cards, 'decoupling'); expect(c.tone).toBe('good'); });
  test('Intensität aus Pulszonen: 80/20 erkannt', () => { const c = byId(cards, 'intensity'); expect(c.value).toMatch(/^\d+\/\d+\/\d+$/); const [e] = c.value.split('/').map(Number); expect(e).toBeGreaterThanOrEqual(75); expect(c.tone).toBe('good'); });
  test('Schwimmen: Pace, Meter pro Zug, Züge pro Bahn besser; Kraul am Stück', () => {
    for (const id of ['swimpace', 'dps', 'spl']) expect(byId(cards, id).tone).toBe('good');
    expect(+byId(cards, 'crawl').value).toBeGreaterThanOrEqual(350);
  });
  test('Bestwerte: neue markiert, längster Lauf in der Liste', () => {
    const c = byId(cards, 'bests'); expect(c.rows.some((r: any) => r.label === 'Längster Lauf')).toBe(true);
    expect(c.rows.some((r: any) => r.badge === 'neu')).toBe(true); expect(c.delta).toMatch(/neu/);
  });
  test('Lange Einheiten wachsen', () => { expect(byId(cards, 'long').tone).toBe('good'); });
  test('Belastung (eigene Rechnung) und ACWR vorhanden', () => {
    const l = byId(cards, 'load'); expect(l.locked).toBeUndefined(); expect(l.chart.series.map((s: any) => s.key)).toEqual(['ctl', 'atl', 'tsb']);
    expect(byId(cards, 'acwr').value).toMatch(/^\d,\d\d$/);
  });
  test('Gewicht neutral formuliert', () => { const c = byId(cards, 'weight'); expect(c.tone).toBe('info'); });
  test('Zusammenhang Schlaf und Qualität wird berechnet', () => { expect(byId(cards, 'sleepq').locked).toBeUndefined(); });
});

describe('Zeitraum und zu wenig Daten', () => {
  test('Zeitraum ändert die Grundlage (4 Wochen weniger Punkte als 1 Jahr)', () => {
    const I = world({ days: 300 });
    const n = (p: Period) => byId(trendCards({ ...I, period: p }), 'runpace').chart.pts.length;
    expect(n('4w')).toBeLessThan(n('3m')); expect(n('3m')).toBeLessThan(n('1y'));
  });
  test('neue Person ohne Daten: alles „ab X … verfügbar“, nichts erfunden', () => {
    const I: TrendInput = { today: TODAY, period: '4w', activities: [], trend: [], illness: [], profile, state: { sessions: {}, customWorkouts: {}, trend: [], nutrition: {}, settings: {} }, weeks: [] };
    const cards = trendCards(I);
    expect(cards.length).toBeGreaterThan(8);
    for (const c of cards) { expect(c.locked).toMatch(/^ab \d+ .* verfügbar \(bisher 0\)$/); expect(c.value).toBeNull(); }
  });
  test('Extra-Einheiten (selbst eingetragen, ohne Uhr) zählen für die Belastung', () => {
    const I = world({ days: 40 });
    const customs: any = {}; for (let i = 30; i >= 0; i -= 2) { const d = C.addDays(TODAY, -i); customs[d] = [{ id: 'c' + i, date: d, sport: 'run', title: 'Extra', plannedMinutes: 60, metrics: { min: '60', hr: '150' } }]; }
    const a = byId(trendCards({ ...I, period: '4w' }), 'load');
    const st = { ...I.state, customWorkouts: customs };
    // wie in der App: Extra-Einheiten ohne Aufzeichnung kommen über legacyActivities in die Liste
    const b = byId(trendCards({ ...I, period: '4w', state: st, activities: [...I.activities, ...legacyActivities(st, [], profile)] }), 'load');
    expect(+b.value).toBeGreaterThan(+a.value || 0);
  });
});
