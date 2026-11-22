/* Auftrag 41: keine Wiederholungen (leere/doppelte Anpassungen, Netto-Unterschied, Platzhalter, Ketten beim Umwandeln),
   Tests verschwinden nicht still, Plan richtet sich nach dem echten Training, offene Einheiten ohne Eintrag = unbekannt. */
import { test, expect, describe } from 'vitest';
import * as C from '../../shared/core';
import { replanPlan } from '../../shared/replan';
import { analyze } from '../../shared/coach/analysis';
import { today as T0, oldPlan, profile, goals, state } from '../../fixtures/pattern-person';

const A = C.addDays;
function plan() {
  const mk = (mon: string, wn: number) => ({ weekNumber: wn, label: 'Woche ' + wn, startDate: mon, endDate: A(mon, 6), days: [
    { date: mon, sessions: [{ id: `w${wn}-mo`, sport: 'rest', title: 'Ruhetag' }] },
    { date: A(mon, 1), sessions: [{ id: `w${wn}-di`, sport: 'swim', title: 'Schwimmen: Technik (1.200 m)', zone: 'Zone 2', plannedMinutes: 45, plannedKm: 1.2, description: 'Technik' }] },
    { date: A(mon, 2), sessions: [{ id: `w${wn}-mi`, sport: 'run', title: 'Lockerer Lauf 40 min', zone: 'Zone 2', plannedMinutes: 40, plannedKm: 6 }] },
    { date: A(mon, 3), sessions: [{ id: `w${wn}-do`, sport: 'bike', title: 'Rad-Intervalle 4×8 min', zone: 'Zone 4', plannedMinutes: 60 }] },
    { date: A(mon, 4), sessions: [{ id: `w${wn}-fr`, sport: 'rest', title: 'Ruhetag' }] },
    { date: A(mon, 5), sessions: [{ id: `w${wn}-sa`, sport: 'run', title: 'Lauftest 30 min', zone: 'Zone 4', plannedMinutes: 55 }] },
    { date: A(mon, 6), sessions: [{ id: `w${wn}-so`, sport: 'bike', title: 'Lange Ausfahrt 120 min', zone: 'Zone 2', plannedMinutes: 120 }] }
  ] });
  return [mk('2026-11-16', 1), mk('2026-11-23', 2)];
}
const sessOf = (weeks: any[], id: string) => C.planDays(weeks).flatMap((d: any) => d.sessions).find((s: any) => s.id === id);
const adj = (id: string, x: any, t: number) => ({ id, createdAt: t, date: '2026-11-20', ...x });

describe('Punkt 1: Anpassungen ohne Unterschied', () => {
  const s = plan()[0].days[1].sessions[0];
  const adjs: any = {
    a1: adj('a1', { type: 'modify', sessionId: 'w1-di', set: { title: s.title, plannedMinutes: 45, plannedKm: 1.2, zone: 'Zone 2', description: 'Technik' }, what: `${s.title} → ${s.title}`, reason: 'Aktualisierte Schwimmnachweise' }, 1),
    a2: adj('a2', { type: 'move', sessionId: 'w1-di', to: '2026-11-17', what: 'auf denselben Tag', reason: 'x' }, 2),
  };
  test('leere Anpassung: kein Abzeichen, kein Original, keine Box', () => {
    const x = sessOf(C.applyAdjustments(plan(), adjs), 'w1-di');
    expect(x._adj).toBeUndefined(); expect(x._orig).toBeUndefined(); expect(C.netChange(x)).toBeNull();
    expect(C.noopAdjustmentIds(plan(), adjs).sort()).toEqual(['a1', 'a2']);
  });
  test('doppelte Verschiebung: nur die erste zählt, Netto „verschoben“', () => {
    const two: any = { m1: adj('m1', { type: 'move', sessionId: 'w1-mi', to: '2026-11-19', what: 'Lauf → Do', reason: 'r' }, 1), m2: adj('m2', { type: 'move', sessionId: 'w1-mi', to: '2026-11-19', what: 'Lauf → Do', reason: 'r' }, 2) };
    const x = sessOf(C.applyAdjustments(plan(), two), 'w1-mi');
    expect(x._adj).toEqual(['m1']); expect(C.netChange(x)).toEqual({ moved: true, adjusted: false, added: false, fields: [] });
    expect(C.noopAdjustmentIds(plan(), two)).toEqual(['m2']);
  });
  test('hin und zurück verschoben: kein Netto-Unterschied, keine Box', () => {
    const back: any = { m1: adj('m1', { type: 'move', sessionId: 'w1-mi', to: '2026-11-19' }, 1), m2: adj('m2', { type: 'move', sessionId: 'w1-mi', to: '2026-11-18' }, 2) };
    expect(C.netChange(sessOf(C.applyAdjustments(plan(), back), 'w1-mi'))).toBeNull();
  });
  test('verschoben und angepasst: beide Felder', () => {
    const both: any = { m1: adj('m1', { type: 'move', sessionId: 'w1-mi', to: '2026-11-19' }, 1), m2: adj('m2', { type: 'modify', sessionId: 'w1-mi', set: { plannedMinutes: 30 } }, 2) };
    const nc = C.netChange(sessOf(C.applyAdjustments(plan(), both), 'w1-mi'))!;
    expect(nc.moved).toBe(true); expect(nc.adjusted).toBe(true); expect(nc.fields).toContain('plannedMinutes');
  });
  test('speichern: realAdjustments lässt leere weg', () => {
    const neu = [{ id: 'n1', type: 'modify', sessionId: 'w1-di', set: { title: s.title } }, { id: 'n2', type: 'modify', sessionId: 'w1-di', set: { plannedMinutes: 30 } }];
    expect(C.realAdjustments(plan(), {}, neu).map((a: any) => a.id)).toEqual(['n2']);
  });
  test('aufräumen beim Laden: leere stilllegen, Platzhalter ersetzen, eigene Ausnahmen behalten', () => {
    const all: any = { ...adjs,
      p1: adj('p1', { type: 'move', sessionId: 'w1-sa', to: '2026-11-22', what: 'Trainingsangabe (Begründung nicht für die KI freigegeben): auf 22.11. verschoben', reason: 'Du möchtest den Lauftest verschieben.' }, 3),
      o1: adj('o1', { type: 'modify', sessionId: 'w1-do', set: { title: 'Rad-Intervalle 4×8 min' }, override: true }, 4),
      k1: adj('k1', { type: 'modify', sessionId: 'w1-do', set: { locked: true } }, 5) };
    const out: any = C.adjustmentCleanup(plan(), all);
    expect(out.a1.retired && out.a1.undone).toBe(true); expect(out.a2.retired).toBe(true);
    expect(out.p1.what).toBe('Lauftest 30 min: auf 22.11. verschoben'); expect(out.p1.undone).toBeFalsy();
    expect(out.o1).toBeUndefined(); expect(out.k1).toBeUndefined();
  });
});

describe('Punkt 7: Ketten beim Umwandeln', () => {
  test('„Zone 2 statt: Locker statt: …“ → ein „statt“', () => {
    expect(C.flatStatt('Zone 2 statt: Locker statt: Rad-Intervalle 4×8 min')).toBe('Zone 2 statt: Rad-Intervalle 4×8 min');
    const two: any = { c1: adj('c1', { type: 'modify', sessionId: 'w1-do', set: { title: 'Locker statt: Rad-Intervalle 4×8 min', zone: 'Zone 2', hard: false } }, 1) };
    two.c2 = adj('c2', { type: 'modify', sessionId: 'w1-do', set: { title: 'Zone 2 statt: Locker statt: Rad-Intervalle 4×8 min', zone: 'Zone 2', plannedMinutes: 45 } }, 2);
    const x = sessOf(C.applyAdjustments(plan(), two), 'w1-do');
    expect(x.title).not.toMatch(/statt:.*statt:/);
  });
});

describe('Punkt 4: Tests verschwinden nicht still', () => {
  test('automatisch zur normalen Einheit gewordener Lauftest → neuer Termin gleich eingeplant, deutliche Nachricht', () => {
    const p = replanPlan(oldPlan(), profile, goals as any, T0, { state: state(), adjustments: {}, stages: { swim: { ladder: 'swim', n: 2 } }, from: '2026-10-19' })!.plan;
    const days = C.planDays(p.weeks);
    const test0 = days.filter((d: any) => d.date > A(T0, 3)).flatMap((d: any) => d.sessions.map((s: any) => ({ d, s }))).find((x: any) => x.s.sport === 'run' && /test/i.test(x.s.title));
    expect(test0, 'Lauftest im Plan').toBeTruthy();
    const today = A(test0!.d.date, -1);
    const adjustments: any = { 'daily-x': { id: 'daily-x', type: 'modify', sessionId: test0!.s.id, set: { title: 'Locker statt: ' + test0!.s.title, zone: 'Zone 2', hard: false, plannedMinutes: 40 }, what: 'locker', reason: 'Ampel rot', createdAt: 1, date: today } };
    const ctx: any = { today, now: Date.parse(today + 'T07:00:00Z'), state: { ...state(), profile, adjustments }, baseWeeks: p.weeks, planMeta: p.meta || {}, profile, goals };
    const a = analyze(ctx, 'morning');
    const moved = a.auto.find((x: any) => /^test-moved-/.test(x.id));
    const hint = a.insights.find((x: any) => x.id === 'test-moved-run');
    expect(moved, 'neuer Termin eingeplant' + (hint ? ' (nur Hinweis: ' + hint.why + ')' : '')).toBeTruthy();
    if (moved) {
      expect(moved.set.title).toMatch(/Lauftest/);
      const m = a.messages.find((x: any) => /^msg-ana-test-run-/.test(x.id))!;
      expect(m.text).toMatch(/Dein Lauftest am .* ist zu „Locker statt: /); expect(m.text).toMatch(/Neuer Termin/);
    }
  });
});

describe('Punkt 7: Plan richtet sich nach dem echten Training', () => {
  const p = replanPlan(oldPlan(), profile, goals as any, T0, { state: state(), adjustments: {}, stages: { swim: { ladder: 'swim', n: 2 } }, from: '2026-10-19' })!.plan;
  const sunday = (() => { let d = A(T0, 28); while (new Date(d + 'T12:00:00Z').getUTCDay() !== 0) d = A(d, 1); return d; })();
  const past = C.planDays(p.weeks).filter((d: any) => d.date >= A(sunday, -27) && d.date <= sunday).flatMap((d: any) => d.sessions.map((s: any) => ({ d, s }))).filter((x: any) => x.s.sport !== 'rest' && x.s.sport !== 'football');
  test('wenig trainiert (erledigt bzw. „nicht gemacht“ eingetragen) → Woche kürzer, lange Einheiten höchstens ~10 min über der längsten echten, ehrlicher Grund', () => {
    const sessions: any = {};
    past.forEach((x: any, i: number) => { sessions[x.s.id] = i % 4 === 0 ? { completed: true, metrics: { min: '30' } } : { skipped: true }; });
    const st: any = { ...state(), profile, sessions, adjustments: {} };
    const W = C.weeklyAdjustments(st, p.weeks, sunday, { planMeta: p.meta || {}, now: Date.now() });
    const note = W.adjustments.find((a: any) => a.type === 'note')!;
    expect(note.reason).toMatch(/In den letzten 4 Wochen hast du höchstens/);
    expect(W.adjustments.some((a: any) => a.type === 'modify')).toBe(true);
    const eff = C.applyAdjustments(p.weeks, Object.fromEntries(W.adjustments.map((a: any) => [a.id, a])));
    const next = eff.find((w: any) => w.startDate === A(sunday, 1))!;
    for (const s of C.planDays([next]).flatMap((d: any) => d.sessions)) if (['run', 'bike', 'swim'].includes(s.sport) && !C.isTestOrRace(s) && !s.stage && !s.cancelled) expect(s.plannedMinutes, s.title).toBeLessThanOrEqual(30 + 15 + 3);
  });
  test('nichts eingetragen → unbekannt: nicht kürzen (wäre geraten), Grund sagt es', () => {
    const st: any = { ...state(), profile, sessions: {}, adjustments: {}, activities: {} };
    const W = C.weeklyAdjustments(st, p.weeks, sunday, { planMeta: p.meta || {}, now: Date.now() });
    expect(W.adjustments.filter((a: any) => /-vol-|-long-/.test(a.id))).toEqual([]);
    expect(W.adjustments.find((a: any) => a.type === 'note')!.reason).toMatch(/fast nichts eingetragen/);
    expect(C.actualTraining(st, p.weeks, sunday).unknown).toBe(true);
  });
});
