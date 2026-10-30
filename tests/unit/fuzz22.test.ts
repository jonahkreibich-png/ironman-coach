/* Auftrag 22: Zufallstests (Fuzzing). Plan-Generator, Coach, Scores, Intervalle und Eingabeprüfung mit tausenden zufälligen,
   auch unsinnigen Profilen und Eingaben. Nichts darf abstürzen; Trainingsregeln, Soll/Ist und „keine internen Texte“ müssen halten.
   Fester Startwert (wiederholbar); Anzahl über FUZZ_N (Standard 1000, vor großen Releases z. B. FUZZ_N=5000). */
import { describe, expect, test } from 'vitest';
import { applyOnboarding } from '../../shared/onboarding';
import { sanitizeProfile } from '../../shared/sanity';
import { checkTrainingRules } from '../../shared/trainingrules';
import { converse } from '../../shared/coach/dialog';
import { internalLeaks } from '../../shared/coach/claims';
import { sportScores } from '../../shared/scores';
import { evaluateIntervals, plannedIntervals } from '../../shared/intervals';
import { checkField, crossCheck, cleanImported } from '../../shared/validate';
import { dataCheck } from '../../shared/datacheck';
import { mainGoal } from '../../shared/goals';
import * as C from '../../shared/core';

const N = Number(process.env.FUZZ_N) || 1000;
const TODAY = '2026-10-29';
function rng(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const r = rng(2222);
const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
const junk = () => pick<any>([null, undefined, '', 'abc', -5, 0, 1e9, NaN, '12,5', ' 7 ', '197', [], {}, true, '<script>', '😀', 'x'.repeat(300)]);
const sometimes = <T,>(v: T): any => (r() < 0.12 ? junk() : v);
const GOALS = ['run_5k', 'run_10k', 'run_half', 'run_marathon', 'tri_sprint', 'tri_olympic', 'tri_middle', 'tri_long', 'bike_event', 'fitness', 'swim_event', 'quatsch'];
const SPORTS = ['run', 'bike', 'swim', 'strength'];
function randomAnswers(i: number): any {
  const days = pick([3, 10, 14, 30, 60, 120, 250, 400, 900, 1825, -20]);
  const date = C.addDays(TODAY, days);
  const sports = SPORTS.filter(() => r() < 0.55);
  const hours = pick([0, 0.5, 1, 2, 4, 6, 9, 14, 20, 35]);
  return {
    goals: r() < 0.05 ? [] : [{ id: 'g' + i, type: sometimes(pick(GOALS)), name: 'Ziel', date: sometimes(date), priority: pick(['A', 'B', 'C', 'Z']), timeMode: 'total' }],
    birthYear: sometimes(pick([1930, 1945, 1960, 1975, 1990, 2005, 2012, 2020, 197, 2030])), sex: pick(['f', 'm', 'x', undefined]),
    injuries: pick(['keine', 'Knie links', '', 'Achillessehne 5/10']), medical: r() < 0.1, sports: r() < 0.03 ? [] : sports.length ? sports : ['run'],
    experienceYears: sometimes(pick([0, 0.5, 1, 3, 10, 40])), weeklyHoursNow: sometimes(Math.max(0, hours - 1)),
    runContinuousMin: sometimes(pick([0, 5, 20, 60, 180])), bikeLongestMin: sometimes(pick([0, 30, 120, 600])), bikes: pick([[], ['road'], ['gravel', 'trainer'], ['mtb'], ['trainer']]), powerMeter: r() < 0.3, trainerType: pick([undefined, 'smart', 'basic']),
    swimCrawl: pick(['no', 'some', 'yes', undefined]), swimCrawlM: sometimes(pick([0, 25, 100, 400, 3000])), swimBreast: r() < 0.7, poolM: pick(['25', '50', 'beides', undefined]), openWater: r() < 0.2,
    swimGear: pick([[], ['board'], ['buoy', 'board', 'fins'], ['paddles', 'snorkel']]),
    teamYes: r() < 0.2, teamName: 'Fußball', teamTrainingDays: pick([[], [2], [1, 3]]), teamTrainingMinutes: 90, teamGameDays: pick([[], [6], [0]]), teamGameMinutes: 90,
    dayLoad: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, pick([0, 0, 1, 2, 3])])), weeklyHours: sometimes(hours), maxDayHours: sometimes(pick([0, 0.5, 1, 2, 4, 10])),
    notes: pick([[], ['Montags nie'], ['nur morgens', 'Mittwoch Schwimmbad zu']]), wantTests: r() < 0.5
  };
}

describe(`Zufallstests mit ${N} Profilen bzw. Eingaben`, () => {
  test('Plan-Generator: kein Absturz, Pläne gültiger Profile halten die Trainingsregeln', () => {
    const n = Math.max(60, Math.round(N / 5)); let plans = 0; const broken: string[] = [];
    for (let i = 0; i < n; i++) {
      const a = randomAnswers(i);
      let res: any;
      try { res = applyOnboarding(a, TODAY); } catch (e: any) { broken.push(`Absturz ${i}: ${String(e && e.message).slice(0, 120)} ${JSON.stringify(a).slice(0, 200)}`); continue; }
      if (!res.gen) continue;
      plans++;
      const p = sanitizeProfile(res.profile, TODAY).profile;
      // Profile mit unsinnigen Zeiten (0 h, Tageslimit 0) können keinen regelkonformen Plan haben – dort zählt nur „kein Absturz“
      if (!(p.weeklyHours >= 2 && p.maxDayHours >= 1)) continue;
      const iss = checkTrainingRules(res.gen.plan.weeks, p, { from: TODAY, today: TODAY, goals: res.goals, goalType: (mainGoal(res.goals, TODAY) || ({} as any)).type || null });
      const hard = iss.filter(x => ['restDay', 'hardAdjacent', 'teenHours', 'maxSports'].includes(x.rule));
      if (hard.length) { broken.push(`Regel ${i}: ${hard[0].rule} ${hard[0].msg} ${JSON.stringify(a).slice(0, 300)}`); }
      for (const w of res.gen.plan.weeks) for (const d of w.days) for (const s of d.sessions) {
        if (!Number.isFinite(s.plannedMinutes ?? 0) || (s.plannedMinutes ?? 0) < 0) broken.push(`Dauer ${i}: ${s.title} ${s.plannedMinutes}`);
        if (internalLeaks(`${s.title}. ${s.description || ''}`).length) broken.push(`interner Text ${i}: ${s.title}`);
        if (/undefined|NaN|null/.test(`${s.title} ${s.description || ''}`)) broken.push(`kaputter Text ${i}: ${s.title}`);
      }
    }
    expect(broken.slice(0, 10)).toEqual([]);
    expect(plans).toBeGreaterThan(n * 0.5);
  }, 600_000);

  test('Coach: zufällige und unsinnige Eingaben – kein Absturz, keine internen Texte', () => {
    const base = applyOnboarding(randomAnswers(1), TODAY);
    const plan = base.gen!.plan;
    const ctx: any = { today: TODAY, now: Date.parse(TODAY + 'T10:00:00Z'), state: { sessions: {}, trend: [], illnessPeriods: [], adjustments: {}, coachMsgs: {}, settings: {}, activities: {}, customWorkouts: {}, profile: base.profile }, baseWeeks: plan.weeks, planMeta: plan.meta || {}, profile: base.profile, goals: base.goals };
    const words = ['heute', 'morgen', 'locker', 'tausch', 'Montag', 'keine Zeit', 'krank', 'Knie', 'Schmerz 7/10', 'wie war', 'Woche', 'Ziel', 'Intervalle', 'schneller', '?', '!!!', '😀', 'DROP TABLE', '<b>', '12:30', '30.02.', 'asdfgh', ''];
    let dialog: any = {}; const broken: string[] = [];
    for (let i = 0; i < N; i++) {
      const say = Array.from({ length: 1 + Math.floor(r() * 5) }, () => pick(words)).join(' ') + (r() < 0.02 ? 'x'.repeat(3000) : '');
      try {
        const out = converse(ctx, dialog, say); dialog = r() < 0.7 ? out.dialog : {};
        const texts = [out.reply.text, ...(out.reply.options || []).map((o: any) => o.label)];
        for (const t of texts) { if (internalLeaks(t).length) broken.push(`„${say}“: ${internalLeaks(t)[0]}`); if (/undefined|NaN|\[object/.test(t)) broken.push(`„${say}“: ${t.slice(0, 120)}`); }
      } catch (e: any) { broken.push(`Absturz „${say.slice(0, 60)}“: ${String(e && e.message).slice(0, 120)}`); }
    }
    expect(broken.slice(0, 10)).toEqual([]);
  }, 600_000);

  test('Scores: unsinnige Aufzeichnungen und Werte – kein Absturz, Ergebnis immer gültig', () => {
    const base = applyOnboarding(randomAnswers(2), TODAY);
    const broken: string[] = [];
    for (let k = 0; k < Math.max(50, N / 10); k++) {
      const acts = Array.from({ length: Math.floor(r() * 40) }, (_, i) => ({ id: `a${k}-${i}`, source: pick(['manual', 'healthfit', 'intervals']), sport: pick(['run', 'bike', 'swim', 'strength', 'football']), date: C.addDays(TODAY, -Math.floor(r() * 400)),
        min: sometimes(pick([5, 30, 60, 240])), km: sometimes(pick([0, 5, 42, 180])), avgHr: sometimes(pick([60, 140, 170, 250])), avgPower: sometimes(pick([100, 220, 2000])), speedKmh: sometimes(pick([3, 12, 35, 120])),
        laps: r() < 0.3 ? [{ kind: 'work', sec: sometimes(600), speed: sometimes(4), avgHr: sometimes(165), power: sometimes(230) }] : [], swim: null, indoor: r() < 0.2 })) as any[];
      try {
        const sc = sportScores({ today: TODAY, activities: acts, trend: [], illness: [], profile: base.profile, goal: base.goals[0] } as any, ['run', 'bike', 'swim', 'strength']);
        for (const x of sc) if (!(Number.isFinite(x.score) && x.score >= 0 && x.score <= 120)) broken.push(`${x.sport}: ${x.score}`);
      } catch (e: any) { broken.push(`Absturz: ${String(e && e.message).slice(0, 160)}`); }
    }
    expect(broken.slice(0, 10)).toEqual([]);
  }, 600_000);

  test('Intervalle und Eingabeprüfung: zufällige Zeilen – kein Absturz, Soll zählt nie als Ist', () => {
    const base = applyOnboarding({ ...randomAnswers(3), sports: ['run', 'bike', 'swim'], goals: [{ id: 'g', type: 'tri_olympic', name: 'T', date: C.addDays(TODAY, 120), priority: 'A' }], weeklyHours: 8, maxDayHours: 2 }, TODAY);
    const sessions = C.planDays(base.gen!.plan.weeks).flatMap((d: any) => d.sessions).filter((s: any) => plannedIntervals(s).length);
    expect(sessions.length).toBeGreaterThan(3);
    const broken: string[] = [];
    for (let i = 0; i < N; i++) {
      const s = pick(sessions);
      const rows = Array.from({ length: Math.floor(r() * 8) }, () => ({ sec: sometimes(pick([30, 240, 600])), m: sometimes(pick([50, 100])), hr: sometimes(150), maxHr: sometimes(170), pace: sometimes(pick(['4:30', '5:59', '99:99'])), power: sometimes(220), pace100: sometimes('1:55'), rpe: sometimes(7), restSec: sometimes(120), restHr: sometimes(120), aborted: r() < 0.1 }));
      const manual = r() < 0.5;
      const st = { completed: true, metrics: { intervals: rows }, ...(manual ? { metricsSrc: { intervals: 'manual' }, metricsManual: { intervals: true } } : { metricsSrc: { intervals: 'intervals' } }) };
      try {
        const e = evaluateIntervals(s, st, null, { lthrRun: 170, lthrBike: 165, ftp: 250 }, s.sport);
        if (e && e.done > rows.length) broken.push(`mehr gemacht als eingetragen: ${e.done} > ${rows.length}`);
        const empty = evaluateIntervals(s, { completed: true }, null, {}, s.sport);
        if (empty && (empty.done || empty.inTarget)) broken.push('Soll als Ist gezählt');
        if (e && !Number.isFinite(e.inTarget + e.done + e.missing)) broken.push('Zahlen ungültig');
        C.ladderVerdictOf(s, st, null, { lthrRun: 170, lthrBike: 165 });
      } catch (err: any) { broken.push(`Absturz: ${String(err && err.message).slice(0, 160)} ${JSON.stringify(rows).slice(0, 160)}`); }
      // Eingabeprüfung und Import mit Müll
      try { checkField(pick(['run', 'bike', 'swim', 'xyz']), pick(['hr', 'km', 'pace', 'pace100', 'min', 'power', 'unbekannt']), junk()); crossCheck(pick(['run', 'bike', 'swim']), { km: junk(), min: junk(), hr: junk(), maxHr: junk(), meters: junk() }); cleanImported('run', { min: junk(), km: junk(), hr: junk() }); }
      catch (err: any) { broken.push(`Prüfung abgestürzt: ${String(err && err.message).slice(0, 120)}`); }
    }
    expect(broken.slice(0, 10)).toEqual([]);
  }, 600_000);

  test('Daten-Check mit kaputten Zuständen: kein Absturz', () => {
    const base = applyOnboarding(randomAnswers(4), TODAY);
    const broken: string[] = [];
    for (let i = 0; i < Math.max(50, N / 10); i++) {
      const state: any = { sessions: { x: { completed: sometimes(true), metrics: { hr: junk(), km: junk(), min: junk(), intervals: pick([junk(), [{ hr: 300 }], [null]]) }, skipped: r() < 0.1 } },
        customWorkouts: pick([{}, { '2026-10-28': [null, { id: 'c', sport: 'run' }] }, junk()]), coachMsgs: pick([{}, { a: null, b: { id: 'b', text: 'x' } }]), adjustments: pick([{}, { a: { id: 'a', type: 'modify', sessionId: 'nix' } }, { b: null }]), activities: pick([{}, { a: { id: 'a', sport: 'run', date: '2026-10-28', startMs: 1 }, b: { id: 'b', sport: 'run', date: '2026-10-28', startMs: 2 } }]) };
      try { dataCheck({ state, baseWeeks: base.gen ? base.gen.plan.weeks : [], profile: base.profile, goals: base.goals, today: TODAY }); }
      catch (e: any) { broken.push(String(e && e.message).slice(0, 160)); }
    }
    expect(broken.slice(0, 5)).toEqual([]);
  }, 600_000);
});
