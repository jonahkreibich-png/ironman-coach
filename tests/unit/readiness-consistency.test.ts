import { test, expect } from 'vitest';
import * as C from '../../shared/core';
import { defaultProfile } from '../../shared/profile';
import { aiSafeCtx } from '../../server/src/ai';
import { compactContext } from '../../shared/coach/freeai';
import { readinessOf } from '../../shared/coach/engine';
import { runTool } from '../../shared/coach/tools';

const today = '2026-10-24';
export function fixture(): any {
  return { today, now: Date.parse(today + 'T10:00:00Z'), profile: defaultProfile(), goals: [], baseWeeks: [], planMeta: {}, state: {
    settings: { readiness: { rhrMax: 50 } }, sessions: {}, activities: {}, adjustments: {}, illnessPeriods: [],
    trend: [...Array.from({ length: 8 }, (_, i) => ({ date: C.addDays(today, -i - 1), restingHR: 60, _src: { restingHR: 'oura' }, _auto: { restingHR: { oura: 60 } } })), { date: today, restingHR: 55, sleepHours: 6.5 }]
  } };
}
test('Oura baseline removal must never produce a different current traffic light for the AI', () => {
  const ctx = fixture();
  expect(readinessOf(ctx).level).toBe(1);
  const safe = aiSafeCtx(ctx);
  expect(compactContext(safe)).not.toMatch(/AMPEL HEUTE: Rot/);
  expect(compactContext(safe)).toContain('nicht an die KI');
  expect(JSON.stringify(safe)).not.toContain('"oura":60');
});
test('analysis tool exposes canonical date/source/version and never a partial recalculation', () => {
  const ctx = fixture();
  const tool = JSON.parse(runTool(ctx, 'get_analysis', {}).result);
  expect(tool.readiness).toMatchObject({ date: today, source: 'canonical-state', level: 1 });
  expect(tool.readiness.version).toEqual(expect.any(String));
});
test('stored fallback load cannot override current canonical training load', () => {
  const ctx = fixture(); ctx.state.settings.readiness.load = { ctl: 40, atl: 100 };
  expect(readinessOf(ctx).level).toBe(1);
});

test('version changes after correction; stale values remain uncertain, never yesterday green', async () => {
  const { readinessSnapshot } = await import('../../shared/readiness');
  const ctx = fixture();
  const before = readinessSnapshot(ctx.state, [], ctx.profile, today);
  ctx.state.trend[8].sleepHours = 8.5;
  const after = readinessSnapshot(ctx.state, [], ctx.profile, today);
  expect(after.version).not.toBe(before.version);
  expect(after.level).toBe(0);
  ctx.today = C.addDays(today, 1);
  expect(readinessOf(ctx)).toMatchObject({ date: ctx.today, level: 3, stale: true, dataDate: today });
});
test('mock red model assertion is replaced by canonical yellow outside model context', async () => {
  const { guardReadinessAnswer } = await import('../../shared/readiness');
  const ctx = fixture();
  const text = guardReadinessAnswer('Deine Ampel ist rot. Du musst pausieren.', 'Wie soll ich heute trainieren?', ctx);
  expect(text).toContain('Gelb');
  expect(text).not.toContain('rot');
  expect(text).toContain(today);
  const safe = aiSafeCtx(ctx);
  expect(safe.readinessSnapshot).toMatchObject({ source: 'withheld', score: null });
  expect(JSON.stringify(safe.readinessSnapshot)).not.toContain('Gelb');
});

test('app-only readiness output is removed from the next external model history', () => {
  const ctx = fixture();
  ctx.state.coachMsgs = { app: { id: 'app', kind: 'answer', from: 'ai', text: 'Ampel der App: Gelb (69/100).', aiExcluded: true } };
  expect(Object.keys(aiSafeCtx(ctx).state.coachMsgs)).toHaveLength(0);
});

test('daily engine adjustments and green briefing use the same current load despite stale fallback', async () => {
  const { runEngine } = await import('../../shared/coach/engine');
  const ctx = fixture(); ctx.state.trend[8].sleepHours = 8.5;
  ctx.state.settings.readiness.load = { ctl: 40, atl: 100 };
  ctx.baseWeeks = [{ days: [{ date: today, sessions: [{ id: 'bike1', sport: 'bike', title: 'Intervalle', zone: 'Zone 4', hard: true, plannedMinutes: 60 }] }] }];
  const out = runEngine(ctx, { type: 'daily' });
  expect(out.messages.find((m: any) => m.kind === 'briefing')?.readiness?.level).toBe(0);
  expect(out.adjustments.filter((a: any) => /Ampel rot/.test(a.reason || ''))).toHaveLength(0);
  expect(C.dailyAdjustments({ ...ctx.state, profile: ctx.profile }, ctx.baseWeeks, today, { now: ctx.now }).filter((a: any) => /Ampel rot/.test(a.reason || ''))).toHaveLength(0);
});

test('Oura-derived plan explanations and old adjustment chat never enter external context or tool payloads', async () => {
  const { buildContext } = await import('../../shared/coach/summary');
  const ctx = fixture();
  ctx.state.trend = [{ date: today, sleepHours: 2, _src: { sleepHours: 'oura' }, _auto: { sleepHours: { oura: 2 } } }];
  ctx.baseWeeks = [{ days: [{ date: today, sessions: [{ id: 'bike1', sport: 'bike', title: 'Intervalle', zone: 'Zone 4', hard: true, plannedMinutes: 60 }] }] }];
  const adjustments = C.dailyAdjustments({ ...ctx.state, profile: ctx.profile }, ctx.baseWeeks, today, { now: ctx.now });
  expect(JSON.stringify(adjustments)).toMatch(/Nur 2,0 h/);
  ctx.state.adjustments = Object.fromEntries(adjustments.map((a: any) => [a.id, a]));
  ctx.state.coachMsgs = { old: { kind: 'adjust', from: 'coach', text: 'Statt Intervallen locker: Du hast nur 2,0 h geschlafen.', date: C.addDays(today, -1) } };
  const original = JSON.stringify(ctx);
  const safe = aiSafeCtx(ctx);
  const external = [buildContext(safe), compactContext(safe), runTool(safe, 'explain_day', { date: today }).result, runTool(safe, 'get_analysis', {}).result, runTool(safe, 'get_data', { what: 'day', date: today }).result, JSON.stringify(safe.state.coachMsgs)].join('\n');
  expect(external).not.toMatch(/Nur 2,0 h|nur 2,0 h|Ampel rot/);
  expect(JSON.stringify(ctx)).toBe(original);
});
