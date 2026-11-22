/* Auftrag 40, Vorschlag 8: Test in den 2 Wochen nach einem Wettkampf, den die Plan-Pflege nicht tauschen kann (z. B. am Ende eines
   Planabschnitts) → normale Einheit mit Merker; der Coach schlägt einen neuen Termin nach den 2 Wochen vor (oder nennt den frühesten). */
import { test, expect, describe } from 'vitest';
import { replanPlan } from '../../shared/replan';
import * as C from '../../shared/core';
import { repairTrainingRules } from '../../shared/trainingrules';
import * as Wk from '../../shared/workouts';
import { analyze } from '../../shared/coach/analysis';
import { today, oldPlan, profile, goals, state } from '../../fixtures/pattern-person';

const diff = (a: string, b: string) => Math.round((+new Date(b + 'T12:00:00Z') - +new Date(a + 'T12:00:00Z')) / 86400000);
const FEB = '2027-02-07';
const hm = { id: 'g-feb', type: 'run_half', name: 'Halbmarathon', date: FEB, priority: 'B' };
const ctxB = { runThrSec: 300, lthrRun: 170, lthrBike: 160, bikeKmh: 28, ftp: null } as any;

function setup(clearBike: [number, number]) {
  const p = replanPlan(oldPlan(), profile, [...goals, hm] as any, today, { state: state(), adjustments: {}, stages: { swim: { ladder: 'swim', n: 2 } }, from: '2026-10-19' })!.plan;
  const w = JSON.parse(JSON.stringify(p.weeks));
  const days = w.flatMap((x: any) => x.days);
  // Radtest 10 Tage nach dem Halbmarathon; Rad-Einheiten im Tauschfenster entfernt → die Pflege kann nicht tauschen
  const d10 = days.find((x: any) => x.date === C.addDays(FEB, 10))!;
  d10.sessions = [...d10.sessions.filter((x: any) => x.sport !== 'bike' && x.sport !== 'rest'), { ...Wk.build(Wk.bikeTest(ctxB)), id: 'u1-bike-test', sport: 'bike' }];
  for (const d of days) { const k = diff(FEB, d.date); if (k >= clearBike[0] && k <= clearBike[1]) d.sessions = d.sessions.filter((x: any) => x.sport !== 'bike'); }
  const fixes = repairTrainingRules(w, profile, { goals: [...goals, hm] as any, from: '2026-10-19', today });
  const ctx: any = { today: C.addDays(FEB, 2), now: Date.parse(C.addDays(FEB, 2) + 'T07:00:00Z'), state: { ...state(), profile, adjustments: {} }, baseWeeks: w, planMeta: p.meta || {}, profile, goals: [...goals, hm] };
  return { w, fixes, ctx };
}
const sessOf = (w: any[], id: string) => C.planDays(w).flatMap((d: any) => d.sessions.map((s: any) => ({ d, s }))).find((x: any) => x.s.id === id);

describe('Vorschlag 8: verschobener Test, der nicht mehr passt', () => {
  test('Pflege macht den Radtest zur normalen Einheit und merkt sich den Wettkampf', () => {
    const { w, fixes } = setup([11, 35]);
    expect(fixes.join(' | ')).toMatch(/Radtest 20 min → .*nach dem Wettkampf kein Test/);
    const x = sessOf(w, 'u1-bike-test')!;
    expect(x.s.title).not.toMatch(/test/i);
    expect(x.s.droppedTest).toBe(FEB);
  });
  test('Coach: neuer Termin nach den 2 Wochen gleich eingeplant (Auftrag 41: Tests verschwinden nicht still), deutliche Nachricht', () => {
    const { ctx } = setup([11, 35]);
    const a = analyze(ctx, 'morning');
    const x = a.auto.find((y: any) => y.group === `test-moved-bike-${FEB}`);
    const i = a.insights.find(y => y.id === 'test-moved-bike');
    expect(x || i, 'Neueinplanung oder Hinweis').toBeTruthy();
    if (x) {
      const at = sessOf(ctx.baseWeeks, x.sessionId)!.d.date;
      expect(diff(FEB, at)).toBeGreaterThan(14); expect(diff(FEB, at)).toBeLessThanOrEqual(42);
      expect(x.set.title).toBe('Radtest 20 min');
      const m = a.messages.find((y: any) => y.id === 'msg-ana-test-bike-' + FEB)!;
      expect(m.text).toMatch(/Dein Radtest am 17\.2\. lag in den 2 Wochen nach dem Wettkampf/);
      expect(m.text).toMatch(/Neuer Termin: /); expect(m.important).toBe(true);
      expect(a.proposals.some(y => y.id.startsWith('test-moved-'))).toBe(false);
    }
  });
  test('kein Rad-Tag frei bis 6 Wochen nach dem Wettkampf → Hinweis mit frühestem Termin statt Vorschlag', () => {
    const { ctx } = setup([11, 60]);
    // auch was die übrigen Regeln danach wieder eingeplant haben (Mindesthäufigkeit), fällt weg – wie am Ende eines Planabschnitts
    for (const d of ctx.baseWeeks.flatMap((x: any) => x.days)) { const k = diff(FEB, d.date); if (k >= 11 && k <= 60) d.sessions = d.sessions.filter((x: any) => x.sport !== 'bike' || x.id === 'u1-bike-test'); }
    const a = analyze(ctx, 'morning');
    expect(a.auto.some((x: any) => /^test-moved-/.test(x.id))).toBe(false);
    const i = a.insights.find(x => x.id === 'test-moved-bike')!;
    expect(i).toBeTruthy();
    expect(i.tip).toMatch(/Frühestens ab 22\.2\./);
  });
});
