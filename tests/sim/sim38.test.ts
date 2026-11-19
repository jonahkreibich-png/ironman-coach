/* Auftrag 38: Simulation – 30 Testnutzer (erfundene Personen aus der großen Simulation, verschiedene Sportarten, Ziele, Niveaus) je 6 Wochen.
   Sie haken Einheiten ab und ändern regelmäßig im Ablauf wie in der App: Wiederholungen [+]/[−], Dauer bzw. Strecke für den ganzen Satz,
   Aufwärmen, neuen Satz hinzufügen – oder tragen nichts ein (gilt still „wie geplant“). Geprüft wird überall das Gemachte:
   Titel (Liste, Coach), Coach-Bewertung, KI-Kontext, Belastung (TSS), Woche, Scores; Summe des Ablaufs = Gesamtdauer. */
import { describe, test, expect } from 'vitest';
import * as C from '../../shared/core';
import { users36, SIM36_START } from '../helpers/sim36';
import { applyOnboarding } from '../../shared/onboarding';
import { ivRowsFor, doneSummary, doneSentence, doneTitle } from '../../shared/ablauf';
import { plannedIntervals, stampRows, ivGroups, targetOfRow, rowHasValues, type IvRow } from '../../shared/intervals';
import { applyTotals, applySections, plannedPart, sectionsOf } from '../../shared/sections';
import { setSessionMetricManual } from '../../shared/activity/merge';
import { doneItems, autoReview, ivThr } from '../../shared/coach/review';
import { contextParts } from '../../shared/coach/freeai';
import { legacyActivities } from '../../shared/scores';

const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const WEEKS = 6;
const users = users36().slice(0, 30);

function simulate(u: ReturnType<typeof users36>[number]) {
  let rng = 3801 + u.id.split('').reduce((n, c) => n + c.charCodeAt(0), 0);
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  const failures: string[] = []; const fail = (ok: boolean, t: string) => { if (!ok && failures.length < 30) failures.push(t); };
  const init = applyOnboarding(copy(u.answers), SIM36_START);
  if (!init.gen) return { failures: ['kein Plan'], changed: 0, silent: 0 };
  const profile: any = init.profile; const plan: any = init.gen.plan;
  const state: any = { profile, sessions: {}, customWorkouts: {}, trend: [], illnessPeriods: [], adjustments: {}, coachMsgs: {}, settings: {}, activities: {}, rules: [] };
  const thr = ivThr(profile);
  const ctx = (date: string) => ({ today: date, now: Date.parse(date + 'T19:00:00Z'), state, baseWeeks: plan.weeks, planMeta: plan.meta || {}, profile, goals: init.goals } as any);
  let changed = 0, silent = 0;
  for (let day = 0; day < WEEKS * 7; day++) {
    const date = C.addDays(SIM36_START, day);
    const d = C.planDays(C.applyAdjustments(plan.weeks, state.adjustments)).find((x: any) => x.date === date); if (!d) continue;
    for (const s of d.sessions) {
      if (s.sport === 'rest' || s.cancelled || random() > u.diligence) continue;
      let st: any = { completed: true, notes: '', metrics: {} };
      const endurance = ['run', 'bike', 'swim'].includes(s.sport) && s.spec;
      const targets = endurance ? plannedIntervals(s, thr) : [];
      const op = endurance ? Math.floor(random() * 6) : 5; // 0 [+], 1 [−], 2 Dauer, 3 Aufwärmen, 4 neuer Satz, 5 nichts
      if (endurance && op < 5) {
        let rows: IvRow[] = ivRowsFor(s, st, null, thr, s.sport).rows;
        const groups = ivGroups(rows, targets, s.sport);
        const hard = groups.filter(g => g.target && !g.target.steady);
        const g = hard.length ? hard[Math.floor(random() * hard.length)] : null;
        if (op === 0 && g) { const last = rows[g.idx[g.idx.length - 1]]; rows.splice(g.idx[g.idx.length - 1] + 1, 0, { set: last.set ?? g.target!.set, ti: null, zone: g.target!.zone }); }
        else if (op === 1 && g && g.idx.length > 1) rows.splice(g.idx[g.idx.length - 1], 1);
        else if (op === 2 && g) { const t = g.target!; g.idx.forEach(i => { rows[i] = { ...rows[i], ...(s.sport === 'swim' ? { m: (t.m || 100) + 50 } : { sec: Math.round((t.sec || 60) * 1.25) }) }; }); }
        else if (op === 4) rows.push({ set: 1000 + day, ti: null, zone: 4, sec: s.sport === 'swim' ? null : 180, m: s.sport === 'swim' ? 100 : null }, { set: 1000 + day, ti: null, zone: 4, sec: s.sport === 'swim' ? null : 180, m: s.sport === 'swim' ? 100 : null });
        if (op === 3) {
          const pm = plannedPart(s, 'warm');
          if (pm) st = applySections(st, [{ part: 'warm', ...(s.sport === 'swim' ? { meters: String(pm + 100) } : { min: String(Math.max(5, pm - 5)) }) }] as any, s.sport, undefined, 'manual', targets, s);
        } else if (op !== 3 && rows.length) {
          const stamped = stampRows(rows, targets, s.sport);
          st = applyTotals(setSessionMetricManual(st, 'intervals', stamped), s.sport, stamped, targets, s);
        }
      }
      state.sessions[s.id] = st;
      const ds = endurance ? doneSummary(s, st, null, thr, s.sport) : null;
      if (ds && ds.changed) changed++; else silent++;
      // Summe des Ablaufs = Gesamtdauer (wenn eine Gesamtdauer aus dem Ablauf entstand)
      if (st.metricsSrc && st.metricsSrc.min === 'sections' && s.sport !== 'swim') {
        const rows: IvRow[] = (st.metrics.intervals || []);
        const secs = sectionsOf(s, st, null, thr, s.sport).rows;
        let sum = 0;
        for (const p of ['warm', 'cool'] as const) { const r = secs.find(x => x.part === p); sum += r && r.min != null ? +r.min : plannedPart(s, p) || 0; }
        const setKey = (r: any, i: number) => (r.set != null ? 's' + r.set : 'i' + i);
        rows.forEach((r, i) => {
          const t = targetOfRow(rows, targets, i); if (!rowHasValues(r) && !t) return;
          sum += (r.sec ?? (rowHasValues(r) ? 0 : t ? t.sec || 0 : 0)) / 60;
          const lastInSet = !rows[i + 1] || setKey(rows[i + 1], i + 1) !== setKey(r, i);
          const setRest = rows.map((x, j) => (setKey(x, j) === setKey(r, i) ? targetOfRow(rows, targets, j) : null)).find(x => x && x.restSec)?.restSec || 0;
          sum += (r.restSec ?? (t && t.restSec ? t.restSec : !lastInSet ? setRest : 0)) / 60;
        });
        if (!targets.length && !rows.length) sum += plannedPart(s, 'main') || 0;
        fail(Math.abs(sum - +st.metrics.min) < 0.6, `${u.id} ${date} ${s.title}: Summe Ablauf ${Math.round(sum * 10) / 10} ≠ Gesamtdauer ${st.metrics.min}`);
      }
      if (!ds || !ds.changed) continue;
      // überall das Gemachte
      const items = doneItems(ctx(date), date, date); const di = items.find(x => x.key === s.id);
      fail(!!di, `${u.id} ${date}: Einheit fehlt im Coach`);
      if (!di) continue;
      fail(di.title === ds.title && doneTitle(s, st, null, thr) === ds.title, `${u.id} ${date}: Titel Coach „${di.title}“ ≠ Gemacht „${ds.title}“`);
      const rv = autoReview(ctx(date), di, 'full');
      fail(rv.includes(ds.changes[0]), `${u.id} ${date}: Coach-Bewertung ohne „${ds.changes[0]}“: ${rv.slice(0, 160)}`);
      fail(!/undefined|NaN|\[object/.test(rv + doneSentence(ds)), `${u.id} ${date}: kaputter Text`);
      const k = contextParts(ctx(date)).last7;
      fail(k.includes('IST anders als geplant: ' + ds.short.slice(0, 30)), `${u.id} ${date}: KI-Kontext ohne Änderung`);
      // Belastung aus der Gesamtdauer des Gemachten; mehr Belastungszeit → mehr Last als geplant
      const ld = C.sessionLoad(s, st, profile.thresholds || {});
      fail(Number.isFinite(ld) && ld >= 0, `${u.id} ${date}: Belastung ${ld}`);
      if (ds.more === 'more' && st.metrics.min && +st.metrics.min > (s.plannedMinutes || 0)) fail(ld > C.sessionLoad(s, { completed: true, metrics: {} }, profile.thresholds || {}), `${u.id} ${date}: mehr gemacht, Belastung nicht höher`);
      // Woche: dieselbe Belastung (je Einheit genau einmal)
      const entries = C.dailyLoadEntries ? C.dailyLoadEntries(state, C.applyAdjustments(plan.weeks, state.adjustments)).filter((e: any) => e.key === 'session:' + s.id) : [];
      if (C.dailyLoadEntries && st.metrics.min) fail(entries.length === 1 && entries[0].load === ld, `${u.id} ${date}: Woche zählt Belastung ${entries.map((e: any) => e.load).join(',')} statt ${ld}`);
      // Scores: Name und Dauer des Gemachten
      const sa = legacyActivities(state, plan.weeks, profile).find(a => a.id === 'sess-' + s.id);
      if (st.metrics.min) fail(!!sa && sa.name === ds.title && sa.min === Math.round(+st.metrics.min), `${u.id} ${date}: Scores ${sa ? sa.name + ' ' + sa.min : 'fehlt'} statt ${ds.title} ${st.metrics.min}`);
    }
  }
  return { failures, changed, silent };
}

describe('Auftrag 38: Simulation, 30 Testnutzer ändern Wiederholungen, Dauer und Sätze', () => {
  test('30 verschiedene Nutzer', () => { expect(users.length).toBe(30); });
  let total = 0;
  for (const u of users) test(`${u.id}: ${WEEKS} Wochen`, () => {
    const r = simulate(u); total += r.changed;
    expect(r.failures).toEqual([]);
    expect(r.changed + r.silent).toBeGreaterThan(5);
  }, 600_000);
  test('insgesamt viele geänderte Einheiten geprüft', () => { console.log('Sim38 geänderte Einheiten:', total); expect(total).toBeGreaterThan(150); });
});
