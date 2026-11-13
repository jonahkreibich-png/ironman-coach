/* Auftrag 35, Punkt 4: Einheit umwandeln – passende Einheit derselben Sportart, sinnvolle Dauer, leichtere Variante */
import { test, expect } from 'vitest';
import * as W from '../../shared/workouts';
import * as C from '../../shared/core';
import { convertKinds, convertSession } from '../../shared/convert';
import { kmPlan } from '../../shared/kmview';

const ctx: W.PaceCtx = { runThrSec: 300, lthrRun: 170, lthrBike: 160, bikeKmh: 30, css: 110, pool: 25 };
const sess = (spec: W.Spec, extra: any = {}) => ({ id: 'x', date: '2026-11-13', ...W.build(spec), ...extra });

test('Lieber Intervalle: gleiche Sportart, gleiche Dauer, harte Wiederholungen mit Zieltempo', () => {
  for (const s of [sess(W.runEasy(ctx, 50)), sess(W.bikeEasy(ctx, 75)), sess(W.swimSession(ctx, 'endurance', [{ part: 'main', reps: 4, m: 200, zone: 2, mode: 'crawl', restSec: 30 }]))]) {
    expect(convertKinds(s)).toEqual(['intervals', 'longer', 'shorter']);
    const o = convertSession(s, 'intervals')!;
    expect(o.set.spec.sport).toBe(s.sport);
    expect(o.set.hard).toBe(true);
    expect(Math.abs(o.set.plannedMinutes - s.plannedMinutes) / s.plannedMinutes, s.sport).toBeLessThan(0.25);
    if (s.sport !== 'swim') expect(kmPlan(o.set.spec)!.lines.some(l => l.part === 'main' && / × /.test(l.text))).toBe(true);
    // leichtere Variante: Zone 3 statt 4
    const l = convertSession(s, 'intervals', { lighter: true })!;
    expect(Math.max(...l.set.spec.steps.filter(x => x.part === 'main').map(x => x.zone || 2))).toBe(3);
  }
});

test('Lieber locker, länger, kürzer', () => {
  const iv = sess(W.runIntervals(ctx, 5, 3, 2, 4));
  expect(convertKinds(iv)).toEqual(['easy', 'longer', 'shorter']);
  const e = convertSession(iv, 'easy')!;
  expect(e.set.hard).toBe(false); expect(Math.abs(e.set.plannedMinutes - iv.plannedMinutes)).toBeLessThanOrEqual(3);
  const easy = sess(W.runEasy(ctx, 40));
  expect(convertSession(easy, 'longer')!.set.plannedMinutes).toBe(50);
  expect(convertSession(easy, 'longer', { lighter: true })!.set.plannedMinutes).toBe(45);
  expect(convertSession(easy, 'shorter')!.set.plannedMinutes).toBe(30);
  expect(convertSession(easy, 'longer')!.what).toBe(`${easy.title} → ${convertSession(easy, 'longer')!.set.title} (40 → 50 min)`);
});

test('Nicht umwandelbar: Wettkampf, Test, Lernstufen ohne Intervalle', () => {
  expect(convertKinds({ ...sess(W.runEasy(ctx, 40)), race: true })).toEqual([]);
  expect(convertKinds(sess({ sport: 'run', kind: 'test', ctx, steps: [{ part: 'main', min: 30, zone: 4 }] }))).toEqual([]);
  expect(convertKinds(sess({ sport: 'run', kind: 'runwalk', ctx, steps: [{ part: 'main', reps: 6, min: 2, walkMin: 1, zone: 2 }] }))).toEqual(['shorter']);
});

test('Übernommen als Anpassung: der Plan (und damit Coach, Bewertung, Woche) zeigt die neue Einheit', () => {
  const s = sess(W.runEasy(ctx, 50), { id: 'r1' });
  const weeks = [{ weekNumber: 1, startDate: '2026-11-09', endDate: '2026-11-15', days: [{ date: '2026-11-13', sessions: [s] }] }];
  const o = convertSession(s, 'intervals')!;
  const adj = { a1: { id: 'a1', group: 'user-1', type: 'modify', sessionId: 'r1', set: { ...o.set, converted: 'intervals' }, createdAt: 1, from_user: true } };
  const got = C.planDays(C.applyAdjustments(weeks, adj))[0].sessions[0];
  expect(got.title).toBe(o.set.title); expect(got.hard).toBe(true); expect(got.spec.kind).toBe('intervals');
  expect(C.isHard(got)).toBe(true);
});
