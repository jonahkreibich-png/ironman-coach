/* Auftrag 40: Auswertungs-Vorschläge 1-4 (Lauf-Geh-Wechsel, Teamsport-Zonenzeit, Intensitätsverteilung, 5-km-Bestwert aus Abschnitten). */
import { test, expect, describe } from 'vitest';
import { segmentBest } from '../../shared/trends';
import { runWalkParts, RUNWALK_RE } from '../../shared/scores';
import * as W from '../../shared/workouts';
import * as C from '../../shared/core';
import { world } from '../helpers/chat-world';
import { reviewItem, doneItems } from '../../shared/coach/review';

import { zoneSeconds } from '../../shared/activity/analyze';
import { trendCards } from '../../shared/trends';

describe('Vorschlag 2: Teamsport – Belastung aus der Zeit in den Zonen', () => {
  test('Spiel 90 min, Ø Puls 128 (Halbzeit, Bank), davon 25 min hart: Belastung höher als aus dem Ø Puls', () => {
    const lthr = 175;
    const day = '2026-10-25';
    const s = { id: 'g1', sport: 'football', title: 'Fußballspiel', plannedMinutes: 90, spec: { kind: 'game' } };
    const weeks = [{ weekNumber: 1, days: [{ date: day, sessions: [s] }] }];
    const zones = [45 * 60, 15 * 60, 5 * 60, 15 * 60, 10 * 60];
    const act = { id: 'act-g1', sport: 'football', date: day, min: 90, avgHr: 128, hrZones: zones, laps: [] };
    const base: any = { profile: { thresholds: { lthrRun: lthr } }, settings: { lthrRun: lthr }, sessions: { g1: { completed: true, activityId: 'act-g1', metrics: { min: '90', hr: '128' } } }, activities: { 'act-g1': act } };
    const withZones = C.dailyLoadEntries(base, weeks).find((e: any) => e.key === 'session:g1')!.load;
    const noZones = C.dailyLoadEntries({ ...base, activities: { 'act-g1': { ...act, hrZones: null } } }, weeks).find((e: any) => e.key === 'session:g1')!.load;
    expect(noZones).toBe(Math.round(1.5 * Math.pow(128 / lthr, 2) * 100));
    expect(withZones).toBeGreaterThan(noZones);
    expect(withZones).toBe(Math.round([0.7, 0.85, 0.91, 0.965, 1.05].reduce((a, f, i) => a + zones[i] / 3600 * f * f * 100, 0)));
  });
  test('Zeit in Zonen aus Runden mit Ø Puls, wenn kein Verlauf da ist; zu wenig abgedeckt → null', () => {
    const laps = [{ sec: 1200, avgHr: 120 }, { sec: 600, avgHr: 168 }, { sec: 600, avgHr: 180 }];
    expect(zoneSeconds({ laps, min: 40 }, 175)).toEqual([1200, 0, 0, 600, 600]);
    expect(zoneSeconds({ laps: laps.slice(0, 2), min: 90 }, 175)).toBeNull();
    expect(zoneSeconds({ hrZones: [1, 2, 3, 4, 5], laps }, null)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('Vorschlag 3: Intensitätsverteilung aus Runden statt ganzer Einheit nach Ø Puls', () => {
  test('5 Intervall-Läufe ohne Pulsverlauf, aber mit Runden: hart nur die Belastungen (vorher pauschal 70/30)', () => {
    const lthr = 170; const today = '2026-10-28';
    const laps = [{ n: 1, sec: 900, m: 2500, avgHr: 135, maxHr: 140, speed: 2.8, power: null, kind: 'warmup' }, ...[0, 1, 2, 3].flatMap(i => [{ n: 2 + 2 * i, sec: 240, m: 1000, avgHr: 168, maxHr: 172, speed: 4.2, power: null, kind: 'work' }, { n: 3 + 2 * i, sec: 120, m: 300, avgHr: 140, maxHr: 150, speed: 2.5, power: null, kind: 'rest' }]), { n: 10, sec: 600, m: 1600, avgHr: 132, maxHr: 138, speed: 2.7, power: null, kind: 'cooldown' }];
    const acts = [0, 2, 4, 6, 8].map(k => ({ id: 'iv' + k, sport: 'run', date: C.addDays(today, -k), name: 'Intervalle 4×4 min', min: 49, km: 8.5, avgHr: 148, speedKmh: 13, laps, hrZones: null }));
    const card: any = trendCards({ activities: acts as any, trend: [], illness: [], profile: { thresholds: { lthrRun: lthr }, sports: ['run'] } as any, today, period: '4w', state: {}, weeks: [] } as any).find((c: any) => c.id === 'intensity');
    expect(card, 'Karte Intensität').toBeTruthy();
    // Belastungen 16 von 49 min hart (33 %), Rest locker; vorher pauschal 70/0/30
    expect(card.value).toBe('67/0/33');
  });
});

/* Lauf-Geh-Wechsel 6 ×(3 min laufen 6:30/km + 2 min gehen 11:00/km), Uhr mit Runde je Teil */
const lap = (n: number, sec: number, paceSec: number, hr: number) => ({ n, sec, m: Math.round(sec * 1000 / paceSec), avgHr: hr, maxHr: hr + 5, speed: 1000 / paceSec, power: null, kind: 'work' as const });
const rwLaps = () => Array.from({ length: 6 }, (_, i) => [lap(2 * i + 1, 180, 390, 150), lap(2 * i + 2, 120, 660, 128)]).flat();

describe('Vorschlag 1: Lauf-Geh-Wechsel – Laufteile getrennt werten', () => {
  test('Laufteile aus den Runden: 6:30/km bei Puls 150 (Schnitt mit Gehpausen wäre etwa 7:57/km)', () => {
    const r = runWalkParts(rwLaps())!;
    expect(r.paceSec).toBe(390); expect(r.hr).toBe(150); expect(r.runs).toBe(6); expect(r.runMin).toBe(18); expect(r.walkMin).toBe(12);
    expect(runWalkParts(rwLaps().filter((_, i) => i % 2 === 0))).toBeNull(); // nur Laufrunden → keine Trennung
    expect(runWalkParts([])).toBeNull();
    expect(RUNWALK_RE.test('Lauf-Geh-Wechsel 6× (3 + 2 min)')).toBe(true);
  });
  test('Coach-Bewertung nennt die Laufteile und rechnet die Gehpausen heraus; ohne Runden ein Hinweis statt falscher Pace', () => {
    const today = '2026-10-28';
    const Wd = world('marathon-anfaenger', today);
    const ctx: any = Wd.ctx();
    ctx.profile = { ...ctx.profile, thresholds: { ...ctx.profile.thresholds, lthrRun: 170, thresholdPaceRunSec: 330 } };
    const s = { id: 'rw1', sport: 'run', ...W.build(W.runWalk({ runThrSec: 330, lthrRun: 170 } as any, 3)) };
    const act = { id: 'act-rw', sport: 'run', date: today, source: 'file', sources: ['file'], name: s.title, min: 30, km: 30 * 60 / 477, avgHr: 141, paceSecKm: 477, laps: rwLaps(), intervals: null };
    ctx.baseWeeks = [{ weekNumber: 1, label: 'W', startDate: today, endDate: today, days: [{ date: today, sessions: [s] }] }];
    ctx.state = { ...ctx.state, profile: ctx.profile, activities: { 'act-rw': act }, sessions: { rw1: { completed: true, activityId: 'act-rw', metrics: {} } } };
    const d = doneItems(ctx, today, today)[0];
    expect(d).toBeTruthy();
    const t = reviewItem(ctx, d).text;
    expect(t).toMatch(/Laufteile Ø 6:30\/km bei Puls 150 \(6× gelaufen, 12 min Gehen herausgerechnet\)/);
    // ohne getrennte Runden
    ctx.state.activities['act-rw'] = { ...act, laps: [] };
    const t2 = reviewItem(ctx, doneItems(ctx, today, today)[0]).text;
    expect(t2).toMatch(/Schnitt mit Gehpausen \(7:57\/km\) sagt wenig über dein Lauftempo/);
  });
});

const run = (o: any) => ({ id: 'a', sport: 'run', date: '2026-11-01', km: 10, min: 55, laps: [], ...o }) as any;

describe('Vorschlag 4: schnellster 5-km-Abschnitt aus km-Zeiten bzw. Runden', () => {
  test('10-km-Lauf mit km-Zeiten: die schnellsten 5 zusammenhängenden km (vorher nur Schnitt des ganzen Laufs)', () => {
    const paces = ['5:40', '5:35', '5:00', '4:55', '4:50', '4:52', '4:58', '5:30', '5:45', '5:50'];
    const a = run({ splits: paces.map((p, i) => ({ km: i + 1, pace: p, hr: null })) });
    // km 3-7: 300 + 295 + 290 + 292 + 298 = 1475 s = 24:35
    expect(segmentBest(a, 5)).toBe(1475);
    // Schnitt des ganzen Laufs wäre 27:30 für 5 km
    expect(segmentBest(a, 5)!).toBeLessThan(55 * 60 / 10 * 5);
  });
  test('Runden der Uhr (je 1 km) zählen genauso; zu kurze Läufe und fehlende Zeiten nicht', () => {
    const laps = [330, 320, 300, 300, 300, 300, 300, 340].map((sec, i) => ({ n: i + 1, sec, m: 1000, avgHr: null, maxHr: null, speed: null, power: null, kind: 'work' }));
    expect(segmentBest(run({ laps, km: 8 }), 5)).toBe(1500);
    expect(segmentBest(run({ laps: laps.slice(0, 4), km: 4 }), 5)).toBeNull();
    expect(segmentBest(run({ splits: [{ km: 1, pace: '' }, { km: 2, pace: '5:00' }], km: 2 }), 5)).toBeNull();
  });
  test('Runden unterschiedlicher Länge: auf genau 5 km hochgerechnet', () => {
    const laps = [{ m: 2000, sec: 600 }, { m: 2000, sec: 580 }, { m: 2000, sec: 590 }].map((l, i) => ({ n: i + 1, ...l, avgHr: null, maxHr: null, speed: null, power: null, kind: 'work' }));
    // beste Folge ab 4.950 m: Runden 2+3 = 4 km reicht nicht → 1+2+3 (6 km, 1770 s) = 1475 s auf 5 km; 2+3+… gibt es nicht
    expect(segmentBest(run({ laps, km: 6 }), 5)).toBe(1475);
  });
});
