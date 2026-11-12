/* Auftrag 34: Komplett-Prüfung – dauerhafte Tests für jeden Fix (jeder scheiterte mit dem Code von 3.21.0).
   Erfundene Test-Nutzer (fixtures/personas), keine echten Daten. */
import { test, expect, describe } from 'vitest';
import { world } from '../helpers/chat-world';
import * as C from '../../shared/core';
import { analyze, seenInsight } from '../../shared/coach/analysis';
import { morningBriefing, sessLabel, runEngine } from '../../shared/coach/engine';
import { doneItems, reviewOne, valsOf, autoReview } from '../../shared/coach/review';
import { valueStory, storyText, STORY_METRICS, shownNewBest } from '../../shared/valuestory';
import { dataCheck, orphanAdjustmentIds } from '../../shared/datacheck';
import { ivLimit } from '../../shared/intervals';
import { planUpkeep, upkeepText } from '../../shared/replan';
import { checkTrainingRules } from '../../shared/trainingrules';
import { trendCards } from '../../shared/trends';
import { coachSkill } from '../../shared/coach/freeai';
import * as W from '../../shared/workouts';

const T0 = '2026-10-21';
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => C.addDays(from, i));

describe('Texte nach Geschlecht', () => {
  // zwei Infekte in 3 Monaten + zweimal „müde“ → „Mehrere Warnzeichen zusammen“
  const tired = (sex: any) => {
    const w = world('vater-rad-lauf', T0); w.profile = { ...w.profile, sex };
    w.state.illnessPeriods = [{ id: 'i1', start: C.addDays(T0, -60), end: C.addDays(T0, -55) }, { id: 'i2', start: C.addDays(T0, -30), end: C.addDays(T0, -26) }];
    const done = w.days().filter((d: any) => d.date < T0 && d.date >= C.addDays(T0, -9)).flatMap((d: any) => d.sessions.filter((s: any) => s.sport !== 'rest')).slice(0, 2);
    done.forEach((s: any) => { w.state.sessions[s.id] = { completed: true, feel: 5, metrics: { min: '30' } }; });
    return analyze(w.ctx() as any, 'morning').insights.find(i => i.id === 'reds');
  };
  test('Männer: kein Zyklus-Hinweis', () => { const r = tired('m'); expect(r).toBeTruthy(); expect(r!.tip).not.toMatch(/Zyklus|Frauen|Periode/); });
  test('Frauen: Zyklus-Hinweis in der Du-Form', () => { const r = tired('f'); expect(r!.tip).toMatch(/deines Zyklus/); expect(r!.tip).not.toMatch(/Bei Frauen/); });
  test('ohne Angabe: neutral', () => { const r = tired(null); expect(r!.tip).toMatch(/Falls du einen Zyklus hast/); });
  test('KI-Anweisung kennt das Geschlecht (kein Zyklus bei Männern)', () => {
    const w = world('vater-rad-lauf', T0); w.profile = { ...w.profile, sex: 'm' };
    expect(coachSkill(w.ctx() as any, 'Test')).toMatch(/männlich: Zyklus oder Periode nie erwähnen/);
  });
});

describe('Analyse-Hinweise nur bei neuer Erkenntnis', () => {
  // „Zu wenig Schlaf“ als Beispiel: gleicher Kern → keine neue Mitteilung, deutlich anders → neue
  const run = (w: any, today: string, sleep: number) => {
    for (const d of days(C.addDays(today, -6), 7)) { w.state.trend = w.state.trend.filter((p: any) => p.date !== d); w.state.trend.push({ date: d, sleepHours: sleep, restingHR: 52, hrv: 60 }); }
    w.today = today; w.now = Date.parse(today + 'T07:00:00Z');
    const r = analyze(w.ctx() as any, 'morning'); r.messages.forEach((m: any) => { w.state.coachMsgs[m.id] = m; });
    return r.messages.filter((m: any) => m.id.startsWith('msg-ana-sleep-'));
  };
  test('gleiche Erkenntnis in der nächsten Woche: keine neue Mitteilung', () => {
    const w = world('vater-rad-lauf', T0);
    expect(run(w, T0, 6.2).length).toBe(1);
    expect(run(w, C.addDays(T0, 7), 6.3).length).toBe(0);
    expect(run(w, C.addDays(T0, 14), 6.1).length).toBe(0);
  });
  test('deutlich schlechter: neue Mitteilung; nach 4 Wochen darf sie wiederkommen', () => {
    const w = world('vater-rad-lauf', T0);
    run(w, T0, 6.9);
    expect(run(w, C.addDays(T0, 7), 5.2).length).toBe(1);
    expect(run(w, C.addDays(T0, 7 + 35), 5.2).length).toBe(1);
  });
  test('alte Mitteilung ohne Kern: gleicher Titel gilt als gleich', () => {
    const msgs = { 'msg-ana-eff-down-2026-11-02': { id: 'msg-ana-eff-down-2026-11-02', date: '2026-11-03', at: 1, title: 'Aerobe Effizienz sinkt' } };
    expect(seenInsight(msgs, { id: 'eff-down', title: 'Aerobe Effizienz sinkt', sig: 'down|2' } as any, '2026-11-09')).toBe(true);
  });
});

describe('Bestwert / Tageswert: „wird länger“ nur, wenn es wirklich länger wird', () => {
  const pts = [100, 25, 25, 25, 50, 50, 75].map((v, i) => ({ date: C.addDays('2026-10-01', i * 3), v }));
  const st = valueStory(pts, true);
  test('75 m bei Bestwert 100 m: kein „geht nach oben“', () => {
    expect(st.trend).toBe('up'); // der Median steigt …
    const t = storyText(st, { ...STORY_METRICS.crawl, today: '2026-10-20' });
    expect(t).toMatch(/dein Bestwert sind 100 m/); expect(t).not.toMatch(/nach oben/);
  });
  test('gleiche angezeigte Zahl ist kein neuer Bestwert (6:41 nach 6:41)', () => {
    const s2 = valueStory([{ date: '2026-11-02', v: 401.2 }, { date: '2026-11-08', v: 400.9 }], false);
    expect(s2.isNewBest).toBe(true); expect(shownNewBest(s2, STORY_METRICS.run5k.fmt)).toBe(false);
    expect(storyText(s2, { ...STORY_METRICS.run5k, today: '2026-11-09' })).not.toMatch(/neuer Bestwert/);
  });
  test('neuer Bestwert und „schwächer“ nie im selben Text', () => {
    const s3 = valueStory([380, 370, 365, 400, 402, 360].map((v, i) => ({ date: C.addDays('2026-10-01', i * 4), v })), false);
    const t = storyText(s3, { ...STORY_METRICS.run5k, today: '2026-10-25' });
    expect(t).toMatch(/neuer Bestwert/); expect(t).not.toMatch(/schwächer/);
  });
  test('Analyse meldet „Kraul am Stück“ nicht bei einem Tag unter dem Bestwert', () => {
    const w = world('jugend-langdistanz', T0);
    const swims = w.days().filter((d: any) => d.date < T0).flatMap((d: any) => d.sessions.filter((s: any) => s.sport === 'swim').map((s: any) => ({ s, date: d.date })));
    const vals = [100, 25, 50, 50, 75];
    swims.slice(-vals.length).forEach((x: any, i: number) => { w.state.sessions[x.s.id] = { completed: true, metrics: { min: '40', meters: '1000', longestCrawl: String(vals[i]) } }; });
    if (swims.length >= vals.length) {
      const ins = analyze(w.ctx() as any, 'morning').insights.find(i => i.id === 'swim-crawl');
      expect(ins ? ins.title : '').not.toMatch(/wird länger/);
    }
  });
});

describe('Bewertung: Morgenwerte höchstens einmal am Tag und nur, wenn wichtig', () => {
  const setup = () => {
    const w = world('erfahren-md-marathon', T0);
    const day = w.days().find((d: any) => d.date < T0 && d.date > C.addDays(T0, -7) && d.sessions.filter((s: any) => s.sport !== 'rest').length >= 1)!;
    w.state.trend.push({ date: day.date, sleepHours: 5.8, restingHR: 50, hrv: 70 });
    return { w, day };
  };
  test('lockere Einheit nach kurzer Nacht: kein „Morgenwerte … Mach heute lieber locker“', () => {
    const { w, day } = setup();
    const easy = { id: 'x-easy', sport: 'run', title: 'Lockerer Lauf 40 min', plannedMinutes: 40, zone: 'Zone 2' };
    w.state.customWorkouts = { [day.date]: [{ ...easy, completed: true, metrics: { min: '40', km: '7', hr: '135' } }] };
    const d = doneItems(w.ctx() as any, day.date, day.date).find(x => x.key === 'x-easy')!;
    const r = reviewOne(w.ctx() as any, d);
    expect(r.better.join(' ')).not.toMatch(/Morgenwerte/);
  });
  test('zwei harte Einheiten am Tag: der Hinweis steht nur bei der ersten', () => {
    const { w, day } = setup();
    const hard = (id: string) => ({ id, sport: 'run', title: 'Lauf-Intervalle 5×3 min', hard: true, plannedMinutes: 45, completed: true, metrics: { min: '45', km: '9', hr: '160' } });
    w.state.customWorkouts = { [day.date]: [hard('h1'), hard('h2')] };
    const ctx = w.ctx() as any;
    const items = doneItems(ctx, day.date, day.date).filter(x => x.key === 'h1' || x.key === 'h2');
    const texts = items.map(d => reviewOne(ctx, d).better.join(' '));
    expect(texts.filter(t => /Morgenwerte/.test(t)).length).toBeLessThanOrEqual(1);
    expect(texts.join(' ')).not.toMatch(/Mach heute lieber locker/);
  });
});

describe('Briefing ohne doppelte Angaben', () => {
  test('„Langer Lauf 60 min (60 min)“ → „Langer Lauf 60 min“', () => {
    expect(sessLabel({ title: 'Langer Lauf 60 min', plannedMinutes: 60 })).toBe('Langer Lauf 60 min');
    expect(sessLabel({ title: 'Kraft Ganzkörper 25 min', plannedMinutes: 25 })).toBe('Kraft Ganzkörper 25 min');
    expect(sessLabel({ title: 'Schwimmen: Technik (1.350 m)', plannedMinutes: 56 })).toBe('Schwimmen: Technik (1.350 m) (56 min)');
    expect(sessLabel({ title: 'Lockerer Lauf 160 min', plannedMinutes: 60 })).toBe('Lockerer Lauf 160 min (60 min)');
  });
  test('ganzes Morgen-Briefing: keine „X min (X min)“', () => {
    for (const id of ['jugend-langdistanz', 'vater-rad-lauf', 'laeuferin-hm', 'einsteiger-sprint', 'erfahren-md-marathon']) {
      const w = world(id, T0);
      for (const d of days(T0, 14)) { w.today = d; const m = morningBriefing(w.ctx() as any, d, []); expect(m.text).not.toMatch(/(\d+) min \(\1 min\)/); }
    }
  });
});

describe('Wochenrückblick in klaren Sätzen', () => {
  test('vor einer Erholungswoche: kein „Umfang 0 %“, kein doppeltes „Stufe bleibt“', () => {
    for (const id of ['jugend-langdistanz', 'einsteiger-sprint', 'vater-rad-lauf']) {
      const w = world(id, T0);
      const rec = w.weeks().find((x: any) => x.isRecoveryWeek && x.startDate > T0); if (!rec) continue;
      const sun = C.addDays(rec.startDate, -1); w.today = sun;
      const r = runEngine(w.ctx() as any, { type: 'weekly' } as any);
      const week = r.messages.find((m: any) => m.kind === 'week')!;
      expect(week.text).not.toMatch(/Umfang 0 %|Umfang [+-]?\d+ %:/);
      expect(week.text).not.toMatch(/Stufe bleibt:.*Stufe bleibt/);
      expect(week.text).toMatch(/Erholungswoche/);
    }
  });
});

describe('Daten-Check', () => {
  test('Schwimm-Zugfrequenz 16/min ist kein Widerspruch (Laufen weiterhin geprüft)', () => {
    expect(ivLimit('cad', 'swim')![0]).toBeLessThanOrEqual(16); expect(ivLimit('cad', 'run')![0]).toBeGreaterThan(16);
    const w = world('jugend-langdistanz', T0);
    w.state.customWorkouts = { [C.addDays(T0, -1)]: [{ id: 'sw1', sport: 'swim', title: 'Schwimmen', completed: true, metrics: { min: '43', meters: '1500', intervals: [{ sec: 1703, m: 1000, hr: 141, cad: 31 }, { sec: 141, m: 50, hr: 143, cad: 16 }] } }] };
    const r = dataCheck({ state: w.state, baseWeeks: w.plan.weeks, profile: w.profile, goals: Object.values(w.goals), today: T0 });
    expect(r.findings.map(f => f.text).join(' ')).not.toMatch(/Intervall: cad/);
  });
  test('verwaiste Anpassungen werden sicher entfernt (erledigte bleiben)', () => {
    const w = world('vater-rad-lauf', T0);
    w.state.adjustments = { o1: { id: 'o1', type: 'modify', sessionId: 'g999999w1-mo-1', set: { plannedMinutes: 30 } }, o2: { id: 'o2', type: 'cancel', sessionId: 'g999999w1-di-1' }, o3: { id: 'o3', type: 'modify', sessionId: 'g999999w1-mi-1', set: {} } };
    w.state.sessions = { 'g999999w1-mi-1': { completed: true } };
    expect(orphanAdjustmentIds(w.plan.weeks, w.state).sort()).toEqual(['o1', 'o2']);
    const r = dataCheck({ state: w.state, baseWeeks: w.plan.weeks, profile: w.profile, goals: Object.values(w.goals), today: T0 });
    expect(r.fixes.filter(f => f.kind === 'adjust').map(f => f.key).sort()).toEqual(['o1', 'o2']);
  });
});

describe('Geschätzte Watt nie wie gemessene', () => {
  const ride = () => {
    const w = world('vater-rad-lauf', T0); w.profile = { ...w.profile, powerMeter: false, trainerType: null } as any;
    const day = C.addDays(T0, -1);
    w.state.customWorkouts = { [day]: [{ id: 'r1', sport: 'bike', title: 'Rad Indoor', completed: true, metrics: { min: '30', power: '225', hr: '136', indoor: 'in' }, metricsSrc: { power: 'manual' } }] };
    return { w, day };
  };
  test('Rolle ohne Wattmessung: Watt nur als Schätzung angezeigt, nicht als Messwert', () => {
    const { w, day } = ride(); const ctx = w.ctx() as any;
    const d = doneItems(ctx, day, day).find(x => x.key === 'r1')!;
    const v = valsOf(d); expect(v.power).toBeNull(); expect(v.powerEst).toBe(225);
    const text = autoReview(ctx, d, 'full'); expect(text).toMatch(/ca\. 225 W \(geschätzt/); expect(text).not.toMatch(/(^|[^.] )225 W[,.]/);
  });
  test('mit Wattmesser zählen die Watt', () => {
    const { w, day } = ride(); w.profile = { ...w.profile, powerMeter: true, trainerType: 'smart' } as any;
    const d = doneItems(w.ctx() as any, day, day).find(x => x.key === 'r1')!;
    expect(valsOf(d).power).toBe(225);
  });
  test('Trends: geschätzte Watt nicht als Rad-Bestwert', () => {
    const { w } = ride();
    const acts = Array.from({ length: 6 }, (_, i) => ({ id: 'a' + i, sport: 'bike', date: C.addDays(T0, -i * 3 - 1), min: 40, avgHr: 135, avgPower: 220 + i, indoor: true, laps: [], source: 'manual' }));
    const cards = trendCards({ today: T0, period: '3m', activities: acts as any, trend: [], illness: [], profile: w.profile, state: w.state, weeks: w.plan.weeks } as any);
    expect(JSON.stringify(cards)).not.toMatch(/22\d W/);
  });
});

describe('Plan-Pflege: ältere Pläne erfüllen die Trainingsregeln (Erholungswoche 60–70 %)', () => {
  // eine Erholungswoche künstlich auf ~95 % der Aufbauwoche bringen (so sahen ältere Pläne aus)
  const flat = (id: string) => {
    const w = world(id, T0);
    const weeks = w.plan.weeks; const i = weeks.findIndex((x: any) => x.isRecoveryWeek && x.startDate > C.addDays(T0, 7));
    const rec = weeks[i];
    rec.days.forEach((d: any) => d.sessions.forEach((s: any, k: number) => { if (s.spec && !s.stage && ['run', 'bike', 'swim'].includes(s.sport)) { const rb = W.rebuildScaled(s, 1.45); if (rb) d.sessions[k] = { ...s, ...rb }; } }));
    return { w, rec };
  };
  for (const id of ['vater-rad-lauf', 'jugend-langdistanz', 'erfahren-md-marathon']) test(`${id}: Verstoß wird behoben, danach grün`, () => {
    const { w, rec } = flat(id);
    const goals = Object.values(w.goals) as any[];
    const before = checkTrainingRules(C.applyAdjustments(w.plan.weeks, w.state.adjustments), w.profile, { from: T0, today: T0, goals, goalType: goals[0].type }).filter(x => x.rule === 'recoveryDepth' && x.week === rec.weekNumber);
    expect(before.length).toBe(1);
    const up = planUpkeep(w.plan.weeks, w.state, w.profile, goals, T0, 1000, w.plan.meta);
    expect(up.adjustments.length).toBeGreaterThan(0);
    up.adjustments.forEach(a => { w.state.adjustments[a.id] = a; });
    const after = checkTrainingRules(C.applyAdjustments(w.plan.weeks, w.state.adjustments), w.profile, { from: T0, today: T0, goals, goalType: goals[0].type }).filter(x => x.rule === 'recoveryDepth');
    expect(after).toEqual([]);
    expect(upkeepText(up)).toMatch(/rückgängig/);
    // Rückgängig gemacht → die Pflege fasst diese Einheiten nicht wieder an
    up.adjustments.forEach(a => { w.state.adjustments[a.id] = { ...a, undone: true }; });
    const again = planUpkeep(w.plan.weeks, w.state, w.profile, goals, C.addDays(T0, 1), 2000, w.plan.meta);
    const touched = new Set(up.adjustments.map(a => a.sessionId));
    expect(again.adjustments.filter(a => touched.has(a.sessionId))).toEqual([]);
  });
  test('ohne Verstoß: keine Änderung', () => {
    const w = world('vater-rad-lauf', T0);
    expect(planUpkeep(w.plan.weeks, w.state, w.profile, Object.values(w.goals) as any, T0, 1, w.plan.meta).adjustments).toEqual([]);
  });
});
