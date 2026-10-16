/* Auftrag 13, Punkt 2: Extra-Einheiten zählen voll – Belastung (CTL/ATL), Scores, Analyse, Bewertung und Plan-Anpassung. */
import { test, expect, describe } from 'vitest';
import { world } from '../helpers/chat-world';
import { runEngine } from '../../shared/coach/engine';
import { extraChecks } from '../../shared/coach/extra';
import { doneItems } from '../../shared/coach/review';
import { ingestActivity } from '../../shared/activity/merge';
import { legacyActivities } from '../../shared/scores';
import * as C from '../../shared/core';

/* Ein Tag, an dem morgen eine harte (nicht feste) Einheit geplant ist */
function setup(id = 'erfahren-md-marathon') {
  const W = world(id, '2026-10-21');
  const days = W.days();
  const d = days.find((x: any) => x.date >= '2026-10-26' && (days.find((y: any) => y.date === C.addDays(x.date, 1)) || { sessions: [] }).sessions.some((s: any) => C.isIntervals(s) && !s.locked && !s.fixed))!;
  W.today = d.date; W.now = Date.parse(d.date + 'T18:00:00Z');
  const hard = days.find((y: any) => y.date === C.addDays(d.date, 1))!.sessions.find((s: any) => C.isIntervals(s))!;
  return { W, date: d.date, hard };
}
const extraRun = (date: string, hr: number, min = 50) => ({ id: `custom-${date}-x`, date, sport: 'run', title: 'Lauf mit Freunden', description: '', plannedMinutes: min, metrics: { min: String(min), hr: String(hr), km: '10' } });

describe('Harte Extra-Einheit prüft die nächste harte Einheit', () => {
  test('Extra-Lauf mit hohem Puls → Vorschlag, die Intervalle morgen locker zu machen; Übernehmen ändert den Plan', () => {
    const { W, date, hard } = setup();
    const lthr = W.profile.thresholds.lthrRun;
    W.state.customWorkouts[date] = [extraRun(date, Math.round(lthr * 0.95))];
    const out = runEngine(W.ctx() as any, { type: 'activity' });
    const p = out.messages.find(m => m.id === `msg-extra-hard-custom-${date}-x`)!;
    expect(p).toBeTruthy();
    expect(p.kind).toBe('proposal');
    expect(p.text).toMatch(/war hart \(Puls Ø \d+, \d+ % deiner Schwelle\)/);
    expect(p.text).toContain('Morgen steht „' + hard.title);
    const ch = p.proposal!.changes[0];
    expect(ch).toMatchObject({ kind: 'adjust', data: { type: 'modify', sessionId: hard.id } });
    expect(ch.data.set.title).toMatch(/^Zone 2 statt/);
    // Übernehmen: morgen ist die Einheit locker und kürzer
    W.state.adjustments[ch.key] = { ...ch.data, createdAt: W.now };
    const tomorrow = W.day(C.addDays(date, 1)).sessions.find((s: any) => s.id === hard.id);
    expect(tomorrow.title).toMatch(/^Zone 2 statt/);
    expect(C.isIntervals(tomorrow)).toBe(false);
    if (hard.plannedMinutes) expect(tomorrow.plannedMinutes).toBeLessThan(hard.plannedMinutes);
    // nur einmal
    W.state.coachMsgs[p.id] = p;
    expect(extraChecks(W.ctx() as any).some(m => m.id === p.id)).toBe(false);
  });
  test('lockerer Extra-Lauf → kein Vorschlag', () => {
    const { W, date } = setup();
    W.state.customWorkouts[date] = [extraRun(date, Math.round(W.profile.thresholds.lthrRun * 0.78))];
    expect(extraChecks(W.ctx() as any).some(m => /msg-extra-hard/.test(m.id))).toBe(false);
  });
  test('hohe Anstrengung (RPE 8) zählt auch ohne Puls', () => {
    const { W, date } = setup();
    W.state.customWorkouts[date] = [{ ...extraRun(date, 0), metrics: { min: '40' }, rpe: '8' }];
    expect(extraChecks(W.ctx() as any).some(m => /msg-extra-hard/.test(m.id))).toBe(true);
  });
});

describe('Woche zu voll → Entlastung', () => {
  test('viele Extra-Einheiten → Vorschlag, die lockeren Einheiten bis Sonntag zu kürzen (nie Schlüsseleinheiten)', () => {
    const { W } = setup();
    const [mon] = C.weekRange(W.today);
    W.state.customWorkouts[mon] = [{ id: 'c1', date: mon, sport: 'bike', title: 'Ausfahrt', plannedMinutes: 180, metrics: { min: '180' }, rpe: '6' }];
    W.state.customWorkouts[C.addDays(mon, 1)] = [{ id: 'c2', date: C.addDays(mon, 1), sport: 'run', title: 'Lauf', plannedMinutes: 90, metrics: { min: '90' }, rpe: '6' }];
    const p = extraChecks(W.ctx() as any).find(m => m.id === `msg-extra-week-${mon}`)!;
    expect(p).toBeTruthy();
    expect(p.text).toMatch(/\d+ % der geplanten Belastung/);
    const ids = p.proposal!.changes.map((c: any) => c.data.sessionId);
    const all = W.days().flatMap((d: any) => d.sessions);
    for (const id of ids) { const s = all.find((x: any) => x.id === id); expect(C.isKey(s)).toBe(false); }
    for (const c of p.proposal!.changes) expect(c.data.set.plannedMinutes).toBeLessThan(all.find((x: any) => x.id === c.data.sessionId).plannedMinutes);
  });
  test('ohne Extras keine Entlastung', () => {
    const { W } = setup();
    expect(extraChecks(W.ctx() as any).some(m => /msg-extra-week/.test(m.id))).toBe(false);
  });
});

describe('Extra-Einheiten zählen überall mit', () => {
  test('Belastung (eigene CTL/ATL), Bewertung und Scores', () => {
    const { W, date } = setup();
    const before = C.dailyLoads(W.state, W.weeks())[date] || 0;
    W.state.customWorkouts[date] = [extraRun(date, 160)];
    expect(C.dailyLoads(W.state, W.weeks())[date]).toBeGreaterThan(before + 40);
    expect(doneItems(W.ctx() as any, date, date).some(d => d.custom && d.key === `custom-${date}-x`)).toBe(true);
    const out = runEngine(W.ctx() as any, { type: 'activity' });
    expect(out.messages.some(m => m.id === `msg-review-custom-${date}-x`)).toBe(true);
    // Scores lesen erledigte Einheiten ohne Aufzeichnung über legacyActivities (mit Aufzeichnung direkt aus activities)
    expect(legacyActivities(W.state, W.weeks(), W.profile).some((a: any) => a.date === date && a.sport === 'run' && a.avgHr === 160)).toBe(true);
  });
});

describe('Zuordnung von Aufzeichnungen (selbst hinzugefügte Einheiten)', () => {
  const act = (o: any) => ({ id: 'a1', source: 'healthfit', sources: ['healthfit'], sport: 'run', date: '2026-10-20', startMs: Date.parse('2026-10-20T16:00:00Z'), min: 45, km: 8, avgHr: 150, laps: [], ...o });
  const ctx = (customs: any[], sessions: any[] = []) => ({ planDays: [{ date: '2026-10-20', sessions }], sessions: {}, settings: {}, customs: Object.fromEntries(customs.map(c => [c.id, c])), activities: {} });
  test('selbst hinzugefügter Lauf am selben Tag wird gefüllt (Quelle, Werte), keine neue Extra-Einheit', () => {
    const r = ingestActivity(ctx([{ id: 'custom-1', date: '2026-10-20', sport: 'run', title: 'Mit Tim', plannedMinutes: 40, metrics: { min: '40' } }]) as any, act({}) as any);
    expect(r.matched).toBe('custom');
    expect(r.customs[0]).toMatchObject({ id: 'custom-1', title: 'Mit Tim', activityId: 'a1', source: 'healthfit' });
    expect(r.customs[0].metrics).toMatchObject({ min: '45', km: '8', hr: '150' });
  });
  test('zwei Einheiten am Tag: Uhrzeit und Dauer entscheiden', () => {
    const plan = [{ id: 's-morning', sport: 'run', title: 'Lauf 06:30 locker', plannedMinutes: 30 }];
    const r = ingestActivity(ctx([{ id: 'custom-eve', date: '2026-10-20', sport: 'run', title: 'Abendlauf', plannedMinutes: 45 }], plan) as any, act({}) as any); // 18 Uhr, 45 min
    expect(r.matched).toBe('custom'); expect(r.customs[0].id).toBe('custom-eve');
    const r2 = ingestActivity(ctx([{ id: 'custom-eve', date: '2026-10-20', sport: 'run', title: 'Abendlauf', plannedMinutes: 45 }], plan) as any, act({ startMs: Date.parse('2026-10-20T04:35:00Z'), min: 31 }) as any);
    expect(r2.matched).toBe('session'); expect(r2.activities[0].sessionId).toBe('s-morning');
  });
  test('andere Sportart oder anderer Tag → Extra-Einheit', () => {
    const r = ingestActivity(ctx([{ id: 'custom-1', date: '2026-10-20', sport: 'bike', title: 'Rad', plannedMinutes: 60 }]) as any, act({}) as any);
    expect(r.customs[0].id).toBe('act-a1'); expect(r.customs[0].auto).toBe(true);
  });
  test('Einheit, die intervals.icu schon mit einem anderen Lauf (2 h früher) verknüpft hat, bleibt bei diesem', () => {
    const r = ingestActivity(ctx([{ id: 'icu-9', date: '2026-10-20', sport: 'run', title: 'Lauf', icuId: '9', icuStart: Date.parse('2026-10-20T14:00:00Z'), plannedMinutes: 45 }]) as any, act({}) as any);
    expect(r.customs[0].id).toBe('act-a1');
  });
});
