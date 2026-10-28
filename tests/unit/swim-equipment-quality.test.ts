/* Schwimmen mit vorhandenem Material und bestätigtem Können (Codex 20.10., Auftrag 17 Punkt 2):
   Kickbrett für Beinschlag, Pull Buoy für Zug und Wasserlage, Flossen/Schnorchel für Technik – gezielt im Wechsel, nicht alles in jeder
   Einheit. Nie Material, das fehlt; nie Stücke länger als das, was schon am Stück geht. */
import { describe, expect, test } from 'vitest';
import * as W from '../../shared/workouts';
import * as K from '../../shared/keysessions';
import { paceCtx, generatePlan } from '../../shared/plangen';
import { defaultProfile, withEstimates } from '../../shared/profile';
import { sportScores, legacyActivities } from '../../shared/scores';
import type { Activity } from '../../shared/activity/analyze';

const today = '2026-10-20';
const profile = (gear: string[], crawl: 'some' | 'yes' = 'some') => withEstimates({
  ...defaultProfile(), birthYear: 1980, sports: ['swim'], weeklyHours: 2,
  skills: { swimCrawl: crawl, swimCrawlM: 50, swimBreast: true, poolM: 25, swimGear: gear },
} as any, today);
const withFocus = (spec: W.Spec, k: number) => W.build(K.fitSwim(K.swimVariant(spec, k, 1, 'base'), 40));
const has = (b: any, mode: string, g: string) => b.spec.steps.some((s: any) => s.mode === mode && s.gear?.includes(g));

describe('Schwimmtechnik mit vorhandenem Material und bestätigtem Können', () => {
  test('50 m Kraul: Brett und Buoy im Wechsel mit eigener Aufgabe, ohne längere Kraulstrecken', () => {
    const ctx = paceCtx(profile(['board', 'buoy']), false, null, today);
    const list = K.swimFocusList(ctx.gear, { ladder: 'swim', n: 3 });
    expect(list).toEqual(['Technik', 'Beinschlag', 'Pull Buoy', 'zügige Bahnen']);
    const built = list.map((_, k) => withFocus(W.swimLearn(ctx, { ladder: 'swim', n: 3, breast: true }, undefined, 40), k));
    const kick = built.find(b => b.spec.variant === 'Beinschlag')!, pull = built.find(b => b.spec.variant === 'Pull Buoy')!;
    expect(has(kick, 'kick', 'board')).toBe(true); expect(kick.description).toContain('Kraul-Beinschlag mit Kickbrett');
    expect(has(pull, 'pull', 'buoy')).toBe(true); expect(pull.description).toContain('Kraul mit Pull Buoy');
    // nicht alles in jeder Einheit
    expect(built.some(b => has(b, 'kick', 'board') && has(b, 'pull', 'buoy'))).toBe(false);
    for (const b of built) {
      for (const s of b.spec.steps.filter((s: any) => s.mode === 'crawl' || s.mode === 'pull')) expect(s.m).toBeLessThanOrEqual(50);
      expect(b.plannedKm).toBe(W.swimSums(b.spec).meters / 1000);
      expect(b.plannedMinutes).toBe(Math.round(W.swimSums(b.spec).min));
    }
  });

  test('ohne Material: keine Serie mit Material, kein Schwerpunkt dafür', () => {
    const ctx = paceCtx(profile([]), false, null, today);
    expect(K.swimFocusList(ctx.gear, { ladder: 'swim', n: 3 })).toEqual(['Technik', 'zügige Bahnen']);
    for (const k of [0, 1, 2, 3]) {
      const built = withFocus(W.swimLearn(ctx, { ladder: 'swim', n: 3, breast: true }, undefined, 40), k);
      expect(built.description).not.toMatch(/Kickbrett|Pull Buoy|Flossen|Paddles|Schnorchel/);
      expect(built.spec.steps.every((s: any) => !s.gear?.length)).toBe(true);
      expect(built.spec.steps.filter((s: any) => s.mode === 'crawl').every((s: any) => (s.m || 0) <= 50)).toBe(true);
    }
  });

  test.each([2, 3, 4, 5])('Stufe %i: Pull-Buoy-Stücke nie länger als die Stufe', n => {
    const ctx = { gear: ['board', 'buoy'], pool: 25 } as W.PaceCtx;
    const pull = withFocus(W.swimLearn(ctx, { ladder: 'swim', n, breast: true }), K.swimFocusList(ctx.gear, { ladder: 'swim', n }).indexOf('Pull Buoy'));
    const ps = pull.spec.steps.filter((s: any) => s.mode === 'pull');
    expect(ps.length).toBeGreaterThan(0);
    for (const s of ps) expect(s.m).toBeLessThanOrEqual(W.SWIM_STAGE_M[n]);
  });

  test('längere Pull-Stücke brauchen eine eigene bestätigte Pull-Distanz', () => {
    const built = W.build(W.swimLearn({ gear: ['buoy'] }, { ladder: 'swim', n: 3, breast: true, pull: 100 }));
    expect(built.spec.steps.find(s => s.mode === 'pull')?.m).toBe(100);
    expect(built.spec.steps.filter(s => s.mode === 'crawl').every(s => (s.m || 0) <= 50)).toBe(true);
  });

  test.each([[], ['board'], ['buoy'], ['board', 'buoy'], ['fins', 'snorkel']].map(gear => [gear] as const))('Material %j: nur vorhandene Hilfsmittel, gleiche Kraulgrenze', gear => {
    for (const k of [0, 1, 2, 3]) {
      const built = withFocus(W.swimLearn({ gear, pool: 25 }, { ladder: 'swim', n: 3, breast: true }), k);
      for (const s of built.spec.steps) for (const item of s.gear || []) expect(gear).toContain(item);
      if (!gear.includes('buoy')) expect(built.spec.steps.some(s => s.mode === 'pull')).toBe(false);
      for (const s of built.spec.steps.filter(s => s.mode === 'crawl')) expect(s.m).toBeLessThanOrEqual(50);
    }
  });

  test('normales Training bei 50 m: Brett und Buoy über die Schwerpunkte, kurze Serien', () => {
    const ctx = { gear: ['board', 'buoy'], pool: 25 } as W.PaceCtx;
    const all = [0, 1, 2, 3].map(k => withFocus(W.swimNormal(ctx, 'technique', 40, 'base', 50), k));
    expect(all.some(b => has(b, 'kick', 'board'))).toBe(true);
    expect(all.some(b => has(b, 'pull', 'buoy'))).toBe(true);
    for (const b of all) for (const s of b.spec.steps.filter((s: any) => s.mode === 'crawl' || s.mode === 'pull')) expect(s.m).toBeLessThanOrEqual(50);
  });

  test('12 Wochen: bestätigte 50 m bleiben, Brett und Buoy kommen regelmäßig, aber nicht beide in jeder Einheit', () => {
    const result = generatePlan({ profile: profile(['board', 'buoy']), goals: [{ id: 'g', type: 'fitness', name: 'Fitness', date: null, priority: 'A' }], today, from: today, maxWeeks: 12 });
    const swims = result.plan.weeks.flatMap((w: any) => w.days.flatMap((d: any) => d.sessions)).filter((s: any) => s.sport === 'swim' && s.spec && s.spec.kind !== 'test');
    expect(swims.length).toBeGreaterThan(8);
    expect(swims.filter((s: any) => has(s, 'kick', 'board')).length).toBeGreaterThanOrEqual(Math.floor(swims.length / 4));
    expect(swims.filter((s: any) => has(s, 'pull', 'buoy')).length).toBeGreaterThanOrEqual(Math.floor(swims.length / 4));
    expect(swims.every((s: any) => has(s, 'kick', 'board') && has(s, 'pull', 'buoy'))).toBe(false);
    for (const s of swims) {
      for (const x of s.spec.steps.filter((x: any) => x.mode === 'crawl' || x.mode === 'pull')) expect(x.m).toBeLessThanOrEqual(50);
      expect(s.stage?.n).toBe(3);
    }
  });

  test('eigene Pace mit Pausen: weniger Meter in derselben Zeit, wenn jemand mehr Pause braucht', () => {
    const base = { breast100: 165, gear: [], pool: 25 } as W.PaceCtx;
    const a = W.build(W.swimLearn(base, { ladder: 'swim', n: 3, breast: true }, undefined, 46));
    const b = W.build(W.swimLearn({ ...base, swimMPerMin: 19 }, { ladder: 'swim', n: 3, breast: true }, undefined, 46));
    expect(b.plannedKm! * 1000).toBeLessThan(a.plannedKm! * 1000);
    expect(b.plannedKm! * 1000 / b.plannedMinutes).toBeLessThanOrEqual(19 * 1.35);
  });
});

describe('Schwimm-Scores unterscheiden Leistungsnachweise', () => {
  const p = { ...defaultProfile(), skills: {}, thresholds: { ...defaultProfile().thresholds, cssSec: 160 } };
  const score = (activities: Activity[]) => sportScores({ today, profile: p, goal: null, illness: [], trend: [], activities }, ['swim'])[0];
  const swim = (data: any): Activity => ({ id: 'evidence', sport: 'swim', date: today, source: 'healthfit', sources: ['healthfit'], min: 30, km: 1, laps: [], indoor: false, swim: { pace100: 100, longestContinuousM: 1000, ...data } } as Activity);
  test.each([
    ['Brust', { byStroke: { breaststroke: 1000 }, longestCrawlM: null }],
    ['unbekannter Stil', { byStroke: {}, longestCrawlM: null }],
    ['Pull Buoy', { byStroke: { freestyle: 1000 }, longestCrawlM: null, gear: ['buoy'] }],
  ])('%s ist kein Kraulrekord ohne Hilfsmittel', (_, data) => {
    expect(score([swim(data)]).parts.find(x => x.key === 'cont')!.raw).toBeNull();
  });
  test('verifizierte Kraulstrecke ersetzt die allgemeine Gesamtstrecke', () => {
    const s = score([swim({ longestCrawlM: 100, byStroke: { freestyle: 100, breaststroke: 900 } })]);
    expect(s.parts.find(x => x.key === 'cont')!.raw).toBe(100);
  });
  test.each([
    ['Brust', { byStroke: { breaststroke: 1000 }, longestCrawlM: null }],
    ['Pull Buoy', { byStroke: { freestyle: 1000 }, longestCrawlM: null, gear: ['buoy'] }],
  ])('%s-Pace aktualisiert keine Kraul-CSS', (_, data) => {
    expect(score([swim(data)]).parts[0].raw).toBe(score([]).parts[0].raw);
  });
  test.each([
    ['swim', 'gear'], ['swim', 'equipment'], ['activity', 'gear'], ['activity', 'equipment'],
  ])('aktive Objekt-Hilfsmittel %s.%s erlauben keine unaided CSS-Pace', (scope, field) => {
    const a = swim({ byStroke: { freestyle: 1000 }, longestCrawlM: 100 });
    const target: any = scope === 'swim' ? a.swim : a;
    target[field] = { pull: true, fins: false };
    expect(score([a]).parts[0].raw).toBe(score([]).parts[0].raw);
    expect(score([a]).why.join(' ')).toMatch(/ignoriert.*Hilfsmittel/);
  });
  test('deaktivierte Objekt-Hilfsmittel schließen eine echte Kraul-Pace nicht aus', () => {
    const a = swim({ byStroke: { freestyle: 1000 }, longestCrawlM: 100, gear: { pull: false, fins: false } });
    expect(score([a]).parts[0].raw).toBeLessThan(score([]).parts[0].raw!);
  });
  test('Warum erklärt ausgeschlossene Hilfsmittel-Pace statt sie als CSS-Nachweis anzuzeigen', () => {
    const s = score([swim({ byStroke: { freestyle: 1000 }, longestPullM: 100, longestCrawlM: 100 })]);
    expect(s.why.join(' ')).toMatch(/ignoriert.*Hilfsmittel/);
  });
  test('ein bloßer Schwimmtest-Titel macht die durchschnittliche Pace nicht zum CSS-Test', () => {
    const a = swim({ byStroke: { freestyle: 1000 }, longestCrawlM: 100 });
    const ordinary = score([a]), titled = score([{ ...a, name: 'CSS Test' }]);
    expect(titled.parts[0].raw).toBe(ordinary.parts[0].raw);
    expect(titled.provisional).toBe(true);
  });
  test('manuelles Pull-Ergebnis wird nicht zur Kraul-CSS oder zum Kraulrekord', () => {
    const state = { customWorkouts: { [today]: [{ id: 'pull', sport: 'swim', completed: true, title: 'Pull Buoy', metrics: { min: 10, meters: 100, longestPull: 100, pace100: '1:40' } }] } };
    const s = score(legacyActivities(state, [], p));
    expect(s.parts.find(x => x.key === 'cont')!.raw).toBeNull();
    expect(s.parts[0].raw).toBe(score([]).parts[0].raw);
  });
});