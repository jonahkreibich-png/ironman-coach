/* Auftrag 9: Schwimmen automatisch weiterstufen (Feld, Uhr, Coach-Satz), alle kommenden Schwimmeinheiten neu; neue Zonen in alle
   kommenden Einheiten mit vorher/nachher; Trend aus den Uhrdaten. */
import { test, expect, describe } from 'vitest';
import * as W from '../../shared/workouts';
import * as C from '../../shared/core';
import { swimBests, swimSkillUpdate, parseSwimSkill, stageFor } from '../../shared/swimskill';
import { refreshFuture } from '../../shared/refresh';
import { applyOps } from '../../shared/coach/ops';
import { converse } from '../../shared/coach/dialog';
import { defaultProfile, withEstimates } from '../../shared/profile';

const today = '2026-11-03';
const ctx = { breast100: 165 } as W.PaceCtx;
const swimS = (id: string, n: number, extra: any = {}) => ({ id, sport: 'swim', ...W.build(W.swimLearn(ctx, { ladder: 'swim', n, breast: true, pull: 50 }, 'x', 50)), ...extra });
const weeks = [{ weekNumber: 8, startDate: '2026-11-02', endDate: '2026-11-08', days: [
  { date: '2026-11-03', sessions: [swimS('a', 2)] }, { date: '2026-11-07', sessions: [swimS('b', 2)] } ] },
  { weekNumber: 9, startDate: '2026-11-09', endDate: '2026-11-15', days: [{ date: '2026-11-10', sessions: [swimS('c', 2)] }, { date: '2026-11-14', sessions: [{ id: 'run1', sport: 'run', ...W.build(W.runEasy({ runThrSec: 339, lthrRun: 170 }, 45)) }] }] }];
const profile: any = withEstimates({ ...defaultProfile(), birthYear: 2009, skills: { swimCrawl: 'some', swimCrawlM: 25, swimPullM: 50, swimBreast: true }, thresholds: { lthrRun: 170, lthrBike: 169, thresholdPaceRunSec: 339, thresholdSpeedBikeKmh: 28, estimated: [] } } as any, today);

describe('Schwimm-Stufen', () => {
  test('Stufen nach Strecke am Stück: 25 → 50 → 100, ab 200 m normales Training (Auftrag 11); Brust-Weg für Anfänger', () => {
    expect([25, 50, 100, 150].map(m => stageFor(m, true)!.n)).toEqual([2, 3, 4, 4]);
    expect(stageFor(200, true)).toBe(null); expect(stageFor(800, true)).toBe(null);
    expect(stageFor(50, true, true)).toBe(null);
    expect(stageFor(0, true)).toEqual({ ladder: 'swimBreast', n: 0 });
  });
  test('mit jeder Stufe ändern sich Wiederholungslängen, Pull Buoy und Brust-Anteil', () => {
    const share = (n: number) => { const sp = W.swimLearn(ctx, { ladder: 'swim', n, breast: true, pull: 50 }, 'x', 50); const m = (modes: string[]) => sp.steps.filter(s => s.part === 'main' && modes.includes(s.mode || '')).reduce((a, s) => a + (s.reps || 1) * (s.m || 0), 0); return { breast: m(['breast']) / (m(['breast']) + m(['crawl', 'pull'])), crawlLen: Math.max(...sp.steps.filter(s => s.mode === 'crawl').map(s => s.m || 0)), pull: sp.steps.some(s => s.mode === 'pull') }; };
    const s2 = share(2), s3 = share(3), s5 = share(5);
    expect(s2.crawlLen).toBe(25); expect(s3.crawlLen).toBe(50); expect(s5.crawlLen).toBe(200);
    expect(s2.pull).toBe(true); // 25 m Kraul, 50 m mit Pull Buoy
    expect(s2.breast).toBeGreaterThan(s3.breast); expect(s3.breast).toBeGreaterThan(s5.breast);
    expect(W.build(W.swimLearn(ctx, { ladder: 'swim', n: 2, breast: true, pull: 50 }, 'x', 50)).description).toMatch(/Kraul mit Pull Buoy/);
  });
  test('jede Lern-Einheit fragt am Ende nach der längsten Strecke', () => {
    expect(weeks[0].days[0].sessions[0].description).toMatch(/Am Ende trägst du die längste Strecke Kraul am Stück ein/);
  });
  test('Feld „längste Strecke Kraul am Stück“ 100 m → Können eintragen, ALLE kommenden Schwimmeinheiten auf die 100-m-Stufe', () => {
    const state = { sessions: { a: { completed: true, metrics: { longestCrawl: '100', longestPull: '100' } } }, customWorkouts: {}, activities: {} };
    expect(swimBests(state, weeks, today)).toEqual({ crawl: 100, pull: 100 });
    const u = swimSkillUpdate(profile, weeks, {}, today, swimBests(state, weeks, today), 1000)!;
    expect(u.skills).toMatchObject({ swimCrawlM: 100, swimPullM: 100 });
    expect(u.adjustments.map(a => a.sessionId)).toEqual(['b', 'c']);
    u.adjustments.forEach(a => { expect(a.set.stage.n).toBe(4); expect(a.set.plannedMinutes).toBeGreaterThanOrEqual(45); });
    expect(u.text).toMatch(/100 m Kraul am Stück.*100-m-Stücke Kraul/);
    // nichts Neues → keine Änderung; nie zurückstufen
    expect(swimSkillUpdate({ ...profile, skills: { ...profile.skills, swimCrawlM: 100, swimPullM: 100 } }, weeks, {}, today, { crawl: 50 })).toBe(null);
  });
  test('ab 400 m: CSS-Hinweis; ab 200 m normales Training', () => {
    expect(swimSkillUpdate(profile, weeks, {}, today, { crawl: 400 })!.text).toMatch(/CSS-Tests und Zonen nach Pace/);
    const u = swimSkillUpdate(profile, weeks, {}, today, { crawl: 200 })!;
    expect(u.adjustments[0].set.title).toMatch(/Schwimmen: Technik \+ Ausdauer/);
    expect(u.skills.swimCrawl).toBe('yes');
  });
});

describe('Coach versteht Schwimm-Fortschritte', () => {
  test('Sätze erkennen', () => {
    expect(parseSwimSkill('ich schaffe jetzt 100 m Kraul am Stück')).toEqual({ crawl: 100 });
    expect(parseSwimSkill('Heute 50 m mit Pull Buoy geschafft')).toEqual({ pull: 50 });
    expect(parseSwimSkill('kann jetzt 75 Meter kraulen und 150 m mit pullbuoy')).toEqual({ crawl: 75, pull: 150 });
    expect(parseSwimSkill('Wie weit ist der lange Lauf?')).toBe(null);
  });
  test('„ich schaffe jetzt 100 m Kraul am Stück“ im Chat: eintragen und hochstufen, rückgängig möglich', () => {
    const state: any = { sessions: {}, customWorkouts: {}, adjustments: {}, trend: [], illnessPeriods: [], coachMsgs: {}, activities: {}, settings: {} };
    const ectx: any = { today, now: 5000, state, baseWeeks: weeks, planMeta: {}, profile, goals: [] };
    const { reply } = converse(ectx, {}, 'ich schaffe jetzt 100 m Kraul am Stück');
    expect(reply.intent).toBe('swim-skill');
    expect(reply.text).toMatch(/100 m Kraul am Stück/);
    let saved: any = null;
    const store: any = { state, profile, goals: {}, saveProfile: (p: any) => { saved = p; } };
    applyOps(store, reply.apply!, 6000, today);
    expect(saved.skills.swimCrawlM).toBe(100);
    expect(Object.values(state.adjustments).filter((a: any) => a.type === 'modify').length).toBe(2);
  });
});

describe('Neue Zonen in alle kommenden Einheiten', () => {
  test('nach dem Lauftest: kommende Läufe rechnen mit dem neuen Puls und der neuen Pace, Beispiel vorher/nachher', () => {
    const w2 = [{ ...weeks[1], days: [{ date: '2026-11-12', sessions: [{ id: 'k', sport: 'run', ...W.build(W.runIntervals({ runThrSec: 339, lthrRun: 170 }, 4, 6, 2, 4)) }] }, { date: '2026-11-02', sessions: [{ id: 'old', sport: 'run', ...W.build(W.runEasy({ runThrSec: 339, lthrRun: 170 }, 40)) }] }] }];
    const p2 = { ...profile, thresholds: { ...profile.thresholds, lthrRun: 175, thresholdPaceRunSec: 320 } };
    const r = refreshFuture(w2, p2, today);
    expect(r.changed).toBe(1);
    const k = r.weeks[0].days[0].sessions[0];
    expect(k.spec.ctx).toMatchObject({ lthrRun: 175, runThrSec: 320 });
    expect(k.description).toMatch(/Puls 1(6|7)\d–1(7|8)\d/);
    expect(r.example).toMatch(/vorher .* jetzt /);
    // vergangene Einheiten bleiben
    expect(r.weeks[0].days[1].sessions[0].spec.ctx.lthrRun).toBe(170);
    void C;
  });
});
