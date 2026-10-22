/* Auftrag 18, Punkt 1 (dauerhaft): Der Coach behauptet keine Ursache ohne Daten.
   Fehler aus Jonahs App: nach wenig Schlaf „der wenige Schlaf erklärt den höheren Puls“, obwohl bei der Einheit kein Puls eingetragen war.
   Regel: Ursache/Zusammenhang nur, wenn beide Werte für genau diesen Tag da sind und die Abweichung zur eigenen Basis wirklich besteht
   (Puls bei gleicher Pace ≥ 5 Schläge über dem 6-Wochen-Schnitt). Sonst neutral („Du hast nur 5,5 h geschlafen, mach heute lieber locker.“).
   Gilt für Regel-Coach (Bewertung, Engine, Chat) und KI (claims.ts prüft jede Antwort vor dem Anzeigen). */
import { describe, expect, test } from 'vitest';
import * as C from '../../shared/core';
import { defaultProfile } from '../../shared/profile';
import { claimFacts, unsupportedCauses, unsupportedClaims, stripUnsupported } from '../../shared/coach/claims';
import { autoReview, doneItems, reviewOne } from '../../shared/coach/review';
import { runEngine } from '../../shared/coach/engine';
import { converse } from '../../shared/coach/dialog';
import { coachSkill } from '../../shared/coach/freeai';
import { COACHING_HANDBOOK } from '../../shared/coach/handbook';

const TODAY = '2026-10-21';
const run = (id: string, date: string) => ({ id, sport: 'run', title: 'Lockerer Lauf 45 min', plannedMinutes: 45, zone: 'Zone 2' });
/* 6 Wochen lockere Läufe (Pace 5:30, Puls 140), heute ein lockerer Lauf mit der gewünschten Messung */
function world(o: { hr?: number | null; sleep?: number | null; rpe?: number | null; temp?: number | null; feel?: number | null } = {}) {
  const profile: any = { ...defaultProfile(), name: 'Test', birthYear: 1990, sports: ['run', 'bike'], thresholds: { ...defaultProfile().thresholds, lthrRun: 170, thresholdPaceRunSec: 290 } };
  const days: any[] = []; const sessions: any = {}; const activities: any = {};
  for (let k = 40; k >= 3; k -= 4) {
    const date = C.addDays(TODAY, -k); const id = 'r' + k;
    days.push({ date, sessions: [run(id, date)] });
    sessions[id] = { completed: true, metrics: { min: '45', km: '8.18', hr: '140', pace: '5:30' }, rpe: '3' };
  }
  days.push({ date: TODAY, sessions: [run('today', TODAY)] });
  const m: any = { min: '45', km: '8.18', pace: '5:30' };
  if (o.hr != null) m.hr = String(o.hr);
  sessions.today = { completed: true, metrics: m, ...(o.rpe != null ? { rpe: String(o.rpe) } : {}) };
  if (o.temp != null) { activities.a1 = { id: 'a1', sport: 'run', source: 'healthfit', date: TODAY, sessionId: 'today', min: 45, km: 8.18, paceSecKm: 330, ...(o.hr != null ? { avgHr: o.hr } : {}), tempC: o.temp }; sessions.today.activityId = 'a1'; }
  const trend: any[] = [];
  for (let k = 30; k >= 1; k--) trend.push({ date: C.addDays(TODAY, -k), sleepHours: 7.8, restingHR: 50, hrv: 70 });
  trend.push({ date: TODAY, ...(o.sleep != null ? { sleepHours: o.sleep } : {}), restingHR: 50, hrv: 70, ...(o.feel != null ? { feel: o.feel } : {}) });
  const weeks = [{ weekNumber: 1, startDate: C.addDays(TODAY, -45), endDate: C.addDays(TODAY, 6), days: days.sort((a, b) => a.date.localeCompare(b.date)) }];
  const state: any = { sessions, activities, customWorkouts: {}, adjustments: {}, trend, illnessPeriods: [], settings: {}, coachMsgs: {}, profile };
  const ctx: any = { today: TODAY, now: Date.parse(TODAY + 'T18:00:00Z'), profile, state, baseWeeks: weeks, goals: [], planMeta: {} };
  const item = doneItems(ctx, TODAY, TODAY).find(d => d.key === 'today')!;
  return { ctx, item };
}
// jede Form, in der Schlaf/Morgenwerte als Grund für den Puls behauptet werden
const SLEEP_CAUSES_HR = /(erklärt|wegen|liegt[^.]*an|passt zu)[^.]*(Puls)|Puls[^.]*(wegen|weil|durch)[^.]*(Schlaf|Morgenwert)/i;

describe('Prüfer erkennt Ursachen ohne Daten', () => {
  test('wenig Schlaf, kein Puls eingetragen: „Schlaf erklärt Puls“ ist unbelegt', () => {
    const { ctx } = world({ sleep: 5.5, hr: null });
    const f = claimFacts(ctx);
    expect(unsupportedCauses('Der wenige Schlaf erklärt den höheren Puls.', f)).not.toEqual([]);
    expect(unsupportedCauses('Dein Puls war wegen des kurzen Schlafs höher.', f)).not.toEqual([]);
    expect(unsupportedCauses('Morgenwerte: du hast nur 5,5 h geschlafen. Das erklärt einen höheren Puls oft schon.', f)).not.toEqual([]);
    // neutral bleibt erlaubt
    expect(unsupportedCauses('Du hast nur 5,5 h geschlafen, mach heute lieber locker.', f)).toEqual([]);
  });
  test('wenig Schlaf, Puls normal (bei gleicher Pace wie sonst): weiterhin unbelegt', () => {
    const { ctx } = world({ sleep: 5.5, hr: 141 });
    expect(unsupportedCauses('Der wenige Schlaf erklärt den höheren Puls.', claimFacts(ctx))).not.toEqual([]);
  });
  test('wenig Schlaf, Puls 8 Schläge über dem 6-Wochen-Schnitt bei gleicher Pace: belegt', () => {
    const { ctx } = world({ sleep: 5.5, hr: 148 });
    expect(unsupportedCauses('Der wenige Schlaf erklärt den höheren Puls.', claimFacts(ctx))).toEqual([]);
  });
  test('Puls erhöht, aber genug geschlafen: Schlaf ist nicht der Grund', () => {
    const { ctx } = world({ sleep: 8.2, hr: 148 });
    expect(unsupportedCauses('Der wenige Schlaf erklärt den höheren Puls.', claimFacts(ctx))).not.toEqual([]);
  });
  test('Hitze ohne Temperatur: unbelegt; mit 29 °C und erhöhtem Puls: belegt', () => {
    expect(unsupportedCauses('Bei der Hitze ist dein höherer Puls normal.', claimFacts(world({ hr: 148 }).ctx))).not.toEqual([]);
    expect(unsupportedCauses('Bei der Hitze ist dein höherer Puls normal.', claimFacts(world({ hr: 148, temp: 29 }).ctx))).toEqual([]);
    expect(unsupportedCauses('Bei der Hitze ist dein höherer Puls normal.', claimFacts(world({ hr: 141, temp: 29 }).ctx))).not.toEqual([]);
  });
  test('Müdigkeit ohne RPE/Gefühl: unbelegt', () => {
    const f = claimFacts(world({ hr: 141 }).ctx);
    expect(unsupportedCauses('Du bist langsamer, weil du müde bist.', f)).not.toEqual([]);
    expect(unsupportedCauses('Die Müdigkeit macht dich langsamer.', f)).not.toEqual([]);
    expect(unsupportedCauses('Die Einheit war schwer, das spricht für Müdigkeit: Anstrengung 7/10.', f)).not.toEqual([]);
  });
  test('Müdigkeit mit Gefühl „müde“ und RPE 7 bei lockerer Einheit: belegt', () => {
    const f = claimFacts(world({ hr: 141, rpe: 7, feel: 4 }).ctx);
    expect(unsupportedCauses('Die Anstrengung 7/10 passt zu deiner Müdigkeit heute.', f)).toEqual([]);
  });
  test('allgemeines Wissen, Fragen und Prüf-Hinweise sind keine Behauptung', () => {
    const f = claimFacts(world({}).ctx);
    for (const t of ['Hitze erhöht die Entkopplung.', 'Hast du schlecht geschlafen, oder warum war der Puls höher?', 'Lockere Läufe mit 6 Schlägen mehr Puls als letzte Woche. Mögliche Gründe prüfen: Schlaf, Hitze, beginnender Infekt.'])
      expect(unsupportedCauses(t, f), t).toEqual([]);
  });
  test('Regel-Coach entfernt den unbelegten Satz, der Rest bleibt', () => {
    const { ctx } = world({ sleep: 5.5, hr: null });
    const t = stripUnsupported('Gute Einheit. Der wenige Schlaf erklärt den höheren Puls. Morgen locker.', claimFacts(ctx));
    expect(t).not.toMatch(/erklärt/); expect(t).toMatch(/Gute Einheit/); expect(t).toMatch(/Morgen locker/);
  });
});

describe('Bewertung nach der Einheit (Regel-Coach)', () => {
  test('5,5 h Schlaf, kein Puls: neutral, kein Zusammenhang mit dem Puls', () => {
    const { ctx, item } = world({ sleep: 5.5, hr: null });
    const t = autoReview(ctx, item, 'full');
    expect(t).toMatch(/5,5 h geschlafen/); expect(t).not.toMatch(SLEEP_CAUSES_HR); expect(t).toMatch(/lieber locker/);
    expect(unsupportedClaims(t, claimFacts(ctx, TODAY))).toEqual([]);
  });
  test('5,5 h Schlaf, Puls normal: kein Zusammenhang', () => {
    const { ctx, item } = world({ sleep: 5.5, hr: 141 });
    const t = autoReview(ctx, item, 'full');
    expect(t).not.toMatch(SLEEP_CAUSES_HR);
  });
  test('5,5 h Schlaf, Puls bei gleichem Tempo +8: Zusammenhang mit Zahl erlaubt', () => {
    const { ctx, item } = world({ sleep: 5.5, hr: 148 });
    const r = reviewOne(ctx, item);
    expect(r.better.join(' ')).toMatch(/8 Schläge über deinem 6-Wochen-Schnitt/);
    const t = autoReview(ctx, item, 'full');
    expect(unsupportedClaims(t, claimFacts(ctx, TODAY))).toEqual([]);
  });
  test('lockere Einheit mit RPE 7 ohne Schlaf-/Temperaturwerte: keine erfundene Ursache', () => {
    const { ctx, item } = world({ hr: 141, rpe: 7 });
    const t = autoReview(ctx, item, 'full');
    expect(t).toMatch(/7\/10/); expect(t).not.toMatch(/Hitze|spricht für/);
  });
  test('Engine-Nachricht nach der Einheit und Chat-Bewertung: nie Ursache ohne beide Daten', () => {
    for (const o of [{ sleep: 5.5, hr: null }, { sleep: 5.5, hr: 141 }, { sleep: 4.5, hr: null, feel: 5 }, { hr: 141, temp: null, rpe: 6 }]) {
      const { ctx } = world(o as any);
      const out = runEngine(ctx, { type: 'activity', sessionIds: ['today'] });
      const texts = [...out.messages.map(m => m.text), converse(ctx, {}, 'Wie war mein Lauf heute?').reply.text];
      for (const t of texts) { expect(t, JSON.stringify(o)).not.toMatch(SLEEP_CAUSES_HR); expect(unsupportedCauses(t, claimFacts(ctx, TODAY)), t).toEqual([]); }
    }
  });
});

describe('KI-Anweisungen enthalten die Regel', () => {
  test('kostenlose KI und Claude', () => {
    const { ctx } = world({});
    expect(coachSkill(ctx, 'App')).toMatch(/nur, wenn beide Werte/);
    expect(COACHING_HANDBOOK).toMatch(/nur, wenn beide Werte/);
  });
});
