/* Auftrag 40: Coach-Vorschläge 5, 6 und 11. */
import { test, expect, describe } from 'vitest';
// @ts-ignore - deterministic JavaScript fixture
import { makeDemo } from '../../fixtures/demo.mjs';
import { readiness24Fixture, READINESS24_TODAY } from '../../fixtures/readiness24';
import { mergeProfile, profileFromLegacy } from '../../shared/profile';
import { readinessSnapshot } from '../../shared/readiness';
import { converse } from '../../shared/coach/dialog';
import * as C from '../../shared/core';

function seeded(red: boolean) {
  const state = makeDemo(READINESS24_TODAY); readiness24Fixture(state);
  const profile = mergeProfile(state.profile, profileFromLegacy({ ...state, planWeeks: state.plan.weeks }, READINESS24_TODAY), READINESS24_TODAY);
  const point = state.trend.find((p: any) => p.date === READINESS24_TODAY);
  if (red) { point.sleepHours = 3.5; point.restingHR = 72; }
  else { point.sleepHours = 8; }
  const ctx: any = { state, profile, baseWeeks: state.plan.weeks, goals: [], planMeta: state.plan.meta, today: READINESS24_TODAY, now: Date.parse(READINESS24_TODAY + 'T07:00:00Z') };
  return { state, profile, ctx, level: () => readinessSnapshot(state, state.plan.weeks, profile, READINESS24_TODAY).level };
}
const todaySession = (state: any) => C.planDays(C.applyAdjustments(state.plan.weeks, state.adjustments || {})).find((d: any) => d.date === READINESS24_TODAY)!.sessions.find((s: any) => s.sport !== 'rest' && s.plannedMinutes);

describe('Vorschlag 11: „Mach die Einheit heute kürzer“ bei roter Ampel', () => {
  test('rot: erst Pause anbieten (Streichen), „Trotzdem nur kürzer“ kürzt dann', () => {
    const f = seeded(true); expect(f.level()).toBe(2);
    const s = todaySession(f.state); expect(s).toBeTruthy();
    const d: any = {};
    const r = converse(f.ctx, d, 'Mach die Einheit heute kürzer');
    expect(r.reply.text).toMatch(/Ampel ist heute rot/); if (process.env.SHOW) console.log(r.reply.text);
    expect(r.reply.text).toMatch(/Pause/);
    expect((r.reply.options || []).map((o: any) => o.label)).toEqual(['Heute Pause', 'Trotzdem nur kürzer', 'So lassen']);
    const r2 = converse(f.ctx, r.dialog || d, 'kürzer');
    expect(r2.reply.text).toMatch(/→ \d+ min|min\?/);
    expect(r2.reply.text).not.toMatch(/Ampel ist heute rot/);
  });
  test('rot: „Heute Pause“ schlägt Streichen vor', () => {
    const f = seeded(true); const d: any = {};
    const r = converse(f.ctx, d, 'Mach die Einheit heute kürzer');
    const r2 = converse(f.ctx, r.dialog || d, 'streichen');
    expect(r2.reply.text).toMatch(/streichen\?/);
  });
  test('grün: kürzt wie bisher direkt', () => {
    const f = seeded(false); expect(f.level()).toBe(0);
    const r = converse(f.ctx, {}, 'Mach die Einheit heute kürzer');
    expect(r.reply.text).not.toMatch(/Ampel/);
    expect(r.reply.text).toMatch(/\d+ min/);
  });
});

describe('Vorschlag 5: „Wie fit bin ich?“ und „Bin ich übertrainiert?“ (vorher „nicht verstanden“)', async () => {
  const { world } = await import('../helpers/chat-world');
  test('Wie fit bin ich? → Fitness, Ampel, Verweis auf Fortschritt (mit Gesamt-Form aus der App)', () => {
    const f = seeded(false);
    const t = converse(f.ctx, {}, 'Wie fit bin ich?', { form: { score: 47, ctl: 38, target: 80 }, scores: [{ sport: 'run', score: 40 }, { sport: 'bike', score: 44 }] }).reply.text;
    expect(t).toMatch(/Gesamt-Form 47 von 100/);
    expect(t).toMatch(/Laufen 40, Rad 44/);
    expect(t).toMatch(/Ampel grün/);
    expect(t).not.toMatch(/verstanden|nicht sicher/i);
  });
  test('Wie fit bin ich? ohne App-Werte (Server) → Fitness aus der Belastung', () => {
    const f = seeded(false);
    const t = converse(f.ctx, {}, 'wie fit bin ich gerade').reply.text;
    expect(t).toMatch(/Fitness|zu wenig Daten/);
    expect(t).not.toMatch(/NaN|undefined/);
  });
  test('Bin ich übertrainiert? rot → Warnzeichen mit Grund; grün → keine Zeichen; immer Hinweis auf Arzt bei langer Dauer', () => {
    const r = converse(seeded(true).ctx, {}, 'Bin ich übertrainiert?').reply.text;
    expect(r).toMatch(/Warnzeichen: deine Ampel ist heute rot/);
    expect(r).toMatch(/Ärztin oder einem Arzt/);
    const g = converse(seeded(false).ctx, {}, 'bin ich uebertrainiert').reply.text;
    expect(g).toMatch(/Keine Zeichen von Übertraining|Warnzeichen/);
  });
  test('Testnutzer ohne Daten: beide Fragen werden verstanden', () => {
    const W = world('laeuferin-hm', '2026-10-21');
    for (const q of ['Wie fit bin ich?', 'Bin ich übertrainiert?', 'Habe ich mich übertrainiert?']) {
      const t = converse(W.ctx(), {}, q).reply.text;
      expect(t, q).not.toMatch(/verstehe ich nicht|nicht verstanden|Meinst du/i);
      expect(t, q).not.toMatch(/NaN|undefined|null/);
    }
  });
});

describe('Vorschlag 6: „Was sind meine Zonen?“ je Sportart', async () => {
  const { world } = await import('../helpers/chat-world');
  test('Triathlon: Laufen, Rad und Schwimmen; „Rad“ allein nur Rad', () => {
    const W = world('langdistanz-profi', '2026-10-21');
    const th = W.profile.thresholds;
    const t = converse(W.ctx(), {}, 'Was sind meine Zonen?').reply.text;
    if (th.lthrRun) expect(t).toMatch(/Laufen: Zone 2/);
    if (th.ftp || th.lthrBike) expect(t).toMatch(/Rad: /);
    if (th.cssSec) expect(t).toMatch(/Schwimmen: Zone 2 .* pro 100 m/);
    const b = converse(W.ctx(), {}, 'Welche Zonen habe ich beim Rad?').reply.text;
    expect(b).toMatch(/Rad: /); expect(b).not.toMatch(/Laufen: /);
  });
  test('Radfahrer ohne Laufen: keine Lauf-Zonen', () => {
    const W = world('rad-event', '2026-10-21');
    W.profile.sports = ['bike'];
    const t = converse(W.ctx(), {}, 'Was sind meine Zonen?').reply.text;
    expect(t).not.toMatch(/Laufen: /);
    expect(t).toMatch(/Rad|Schwelle/);
  });
});
