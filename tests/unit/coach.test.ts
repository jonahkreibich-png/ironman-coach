/* Testsammlung Coach (kostenloser Modus): Engine-Texte, Schnellfragen, Warnzeichen, Plan-Code, Zusammenfassung.
   Die KI-Fälle mit simulierten Antworten stehen in server/test/ai.test.ts. */
import { test, expect, describe } from 'vitest';
import * as C from '../../shared/core';
import { runEngine, sessionComment, type EngineCtx } from '../../shared/coach/engine';
import { answerQuick } from '../../shared/coach/quick';
import { checkMessage, checkData } from '../../shared/coach/safety';
import { checkPlanCode, PLAN_FORMAT_HINT } from '../../shared/coach/plancode';
import { buildContext } from '../../shared/coach/summary';
import { defaultProfile } from '../../shared/profile';
import { generatePlan } from '../../shared/plangen';
import { validateWeeks } from '../../shared/rules';

const TODAY = '2026-10-14'; // Mittwoch
const A = C.addDays;
function week(mon: string, n: number) {
  return { weekNumber: n, label: 'Woche ' + n, startDate: mon, endDate: A(mon, 6), days: [
    { date: mon, sessions: [{ id: `w${n}-mo`, sport: 'rest', title: 'Ruhetag' }] },
    { date: A(mon, 1), sessions: [{ id: `w${n}-di`, sport: 'run', title: 'Lockerer Lauf', zone: 'Zone 2', plannedMinutes: 40 }] },
    { date: A(mon, 2), sessions: [{ id: `w${n}-mi`, sport: 'bike', title: 'Sweet-Spot 3×8', zone: 'Zone 3-4', plannedMinutes: 60 }] },
    { date: A(mon, 3), sessions: [{ id: `w${n}-do`, sport: 'run', title: 'Lockerer Lauf', zone: 'Zone 2', plannedMinutes: 40 }] },
    { date: A(mon, 4), sessions: [{ id: `w${n}-fr`, sport: 'football', title: 'Spiel', time: '18:30' }] },
    { date: A(mon, 5), sessions: [{ id: `w${n}-sa`, sport: 'run', title: 'Langer Lauf', zone: 'Zone 2', plannedMinutes: 80 }] },
    { date: A(mon, 6), sessions: [{ id: `w${n}-so`, sport: 'bike', title: 'Lange Ausfahrt', zone: 'Zone 2', plannedMinutes: 150 }] }
  ] };
}
const weeks = [week('2026-10-05', 1), week('2026-10-12', 2), week('2026-10-19', 3)];
function trend(today: any = {}, days = 28) {
  const out: any[] = [];
  for (let i = days; i >= 1; i--) out.push({ date: A(TODAY, -i), hrv: 70 + ((i % 5) - 2) * 5, restingHR: 50 + (i % 3) - 1, sleepHours: 8.6, sleepQuality: 8, ctl: 40, atl: 42 });
  if (today) out.push({ date: TODAY, ctl: 40, atl: 42, ...today });
  return out;
}
function ctx(o: any = {}): EngineCtx {
  const profile = { ...defaultProfile(), name: 'Alex Test', birthYear: 2009, thresholds: { ...defaultProfile().thresholds, lthrRun: 172, lthrBike: 165 }, ...(o.profile || {}) };
  return {
    today: o.today || TODAY, now: 1_800_000_000_000,
    state: { sessions: {}, customWorkouts: {}, trend: trend(o.todayValues === undefined ? { hrv: 71, restingHR: 50, sleepHours: 8.7, sleepQuality: 8 } : o.todayValues), illnessPeriods: [], weekNotes: {}, adjustments: {}, nutrition: {}, settings: { lthrRun: 172, lthrBike: 165, readiness: { rhrMax: 56, hrvMin: 65, tempMax: 0.5 } }, activities: {}, coachMsgs: {}, coachNotes: {}, nutritionProfile: { age: 17, heightCm: 180, weightKg: 70, pal: 1.4 }, ...(o.state || {}) },
    baseWeeks: weeks, planMeta: { runIntervalsAllowed: true, ...(o.meta || {}) }, profile, goals: o.goals || [{ id: 'g', type: 'tri_olympic', name: 'Stadttriathlon', date: '2027-07-04', priority: 'A' }]
  } as any;
}
const allText = (out: any) => out.messages.map((m: any) => (m.title || '') + ' ' + m.text).join(' | ');
const clean = (s: string) => { expect(s).not.toMatch(/undefined|NaN|\bnull\b|\[object/); };

describe('Krankheit', () => {
  test('1 Fieber über drei Tage in den Notizen → dringender Hinweis auf Arzt', () => {
    const t = trend({ hrv: 50, restingHR: 58, illness: 'Fieber 38,6' });
    t[t.length - 2].illness = 'Fieber 38,9'; t[t.length - 3].illness = 'fieber, Halsweh';
    const out = runEngine(ctx({ state: { trend: t } }), { type: 'trend', dates: [TODAY] });
    const w = out.messages.find(m => m.kind === 'warning')!;
    expect(w.text).toMatch(/Arzt/); expect(w.important).toBe(true);
  });
  test('2 „Ich habe Fieber“ im Chat → kein Training, Stufenplan, Arzt bei über 39 °C', () => {
    const h = checkMessage('Ich hab seit heute Fieber, kann ich locker laufen?');
    expect(h.find(x => x.flag === 'fever')!.text).toMatch(/kein Training.*24-48 h.*39 °C/s);
  });
  test('3 Krankheit gestartet → Einheiten ausgesetzt, Nachricht mit Arzt-Hinweis', () => {
    const out = runEngine(ctx({ state: { illnessPeriods: [{ id: 'i', start: TODAY, end: null }] } }), { type: 'illness' });
    expect(allText(out)).toMatch(/ausgesetzt.*symptomfrei/s);
    expect(out.adjustments).toHaveLength(0);
  });
  test('4 Fieber vorbei → Willkommen zurück mit Stufenplan', () => {
    const out = runEngine(ctx({ state: { illnessPeriods: [{ id: 'i', start: A(TODAY, -4), end: A(TODAY, -1) }] } }), { type: 'illness' });
    expect(allText(out)).toMatch(/Tag 1 noch Pause.*Tag 2-3.*ab Tag 6/s);
  });
  test('5 Wann wieder einsteigen? (Wiedereinstieg) → nur locker, Intervalle ab Tag 6', () => {
    const a = answerQuick(ctx({ state: { illnessPeriods: [{ id: 'i', start: A(TODAY, -5), end: A(TODAY, -2) }] } }), 'why-easy');
    expect(a).toMatch(/Krankheit.*Tag 6/s);
  });
  test('6 Intervalle während Krankheit → Antwort nennt Stufenplan statt Datum', () => {
    expect(answerQuick(ctx({ state: { illnessPeriods: [{ id: 'i', start: A(TODAY, -1), end: null }] } }), 'intervals')).toMatch(/Stufenplan/);
  });
});

describe('Schmerzen', () => {
  test('7 Leistenschmerz 3/10 → keine Lauf-Intensität, Begründung nennt Leiste', () => {
    const w = weeks.map(x => ({ ...x, days: x.days.map(d => d.date === TODAY ? { ...d, sessions: [{ id: 'iv', sport: 'run', title: 'Lauf-Intervalle 5×3 min', zone: 'Zone 4', plannedMinutes: 50 }] } : d) }));
    const c = ctx({ state: { sessions: { 'w2-di': { completed: true, notes: 'Leiste zieht leicht, 3/10' } } } });
    c.baseWeeks = w;
    const out = runEngine(c, { type: 'trend', dates: [TODAY] });
    const msg = out.messages.find(m => m.kind === 'adjust')!;
    expect(msg.text).toMatch(/Schmerz \(Leiste\)/);
    expect(out.adjustments[0].set.zone).toBe('Zone 2');
  });
  test('8 Starker Schmerz 7/10 → ärztlich oder physiotherapeutisch abklären', () => {
    const h = checkData({ trend: trend({ hrv: 70, illness: 'Knie stechend 7/10' }), sessions: {} }, TODAY);
    expect(h.find(x => x.flag === 'pain')!.text).toMatch(/abklären/);
  });
  test('9 Brustschmerz im Chat → sofort Notruf 112, kein Training', () => {
    expect(checkMessage('Beim Laufen hatte ich Brustschmerzen und Atemnot')[0].text).toMatch(/112/);
  });
  test('10 Medikamente oder Diagnose → Verweis an den Arzt', () => {
    expect(checkMessage('Soll ich Ibuprofen nehmen?').some(h => h.flag === 'medication')).toBe(true);
    expect(checkMessage('Ist das ein Ermüdungsbruch?').some(h => h.flag === 'medication')).toBe(true);
  });
});

describe('Erholung und Ampel', () => {
  test('11 Schlecht geschlafen vor Intervallen → Zone 2 statt Sweet Spot, Text mit echten Zahlen', () => {
    const out = runEngine(ctx({ todayValues: { hrv: 55, restingHR: 51, sleepHours: 5.5, sleepQuality: 4 } }), { type: 'trend', dates: [TODAY] });
    const adj = out.adjustments.find(a => a.sessionId === 'w2-mi')!;
    expect(adj.set.title).toMatch(/^(Zone 2|Locker) statt/);
    const t = allText(out);
    expect(t).toMatch(/nur 5,5 h geschlafen/);
    expect(t).toMatch(/HFV liegt \d+ % unter/);
    clean(t);
  });
  test('12 Rote Ampel → Ruhetag oder 20-30 min locker, wichtige Nachricht', () => {
    const out = runEngine(ctx({ todayValues: { hrv: 45, restingHR: 57, sleepHours: 6, bodyTemp: 0.6 } }), { type: 'trend', dates: [TODAY] });
    expect(out.adjustments[0].set.plannedMinutes).toBeLessThanOrEqual(25);
    expect(out.messages.find(m => m.kind === 'adjust')!.important).toBe(true);
    expect(allText(out)).toMatch(/Temperatur ist um 0,6 °C erhöht/);
  });
  test('13 Morgen-Briefing bei grün: Ampel, Einheit und Pulsbereich', () => {
    const out = runEngine(ctx(), { type: 'trend', dates: [TODAY] });
    const b = out.messages.find(m => m.kind === 'briefing')!;
    expect(b.text).toMatch(/Alex/); expect(b.text).toMatch(/Sweet-Spot 3×8 \(60 min\)/); expect(b.text).toMatch(/\d+-\d+ bpm/);
    clean(b.text);
  });
  test('14 Keine Morgenwerte → Briefing bittet darum, keine Anpassung', () => {
    const out = runEngine(ctx({ todayValues: null }), { type: 'daily' });
    expect(out.messages.find(m => m.kind === 'briefing')!.text).toMatch(/Ampel unsicher – noch keine Morgenwerte/);
  });
  test('15 Warum heute locker? bei gelb → Gründe mit Zahlen', () => {
    const c = ctx({ todayValues: { hrv: 56, restingHR: 54, sleepHours: 8.6 } });
    expect(answerQuick(c, 'why-easy')).toMatch(/Gelb|Rot/);
    expect(answerQuick(c, 'why-easy')).toMatch(/Ruhepuls ist \d+ Schläge höher/);
  });
  test('16 Übertraining: HFV eine Woche niedrig und Ruhepuls hoch → Hinweis', () => {
    const t = trend(null, 35).map((p, i, a) => i >= a.length - 7 ? { ...p, hrv: 52, restingHR: 57 } : p);
    expect(checkData({ trend: t, sessions: {}, illnessPeriods: [] }, TODAY).some(h => h.flag === 'overtraining')).toBe(true);
  });
  test('17 Nachrichten-IDs sind stabil: zweiter Lauf erzeugt keine Doppelten', () => {
    const c = ctx({ todayValues: { hrv: 55, sleepHours: 5.5 } });
    const a = runEngine(c, { type: 'trend', dates: [TODAY] });
    a.messages.forEach(m => { c.state.coachMsgs[m.id] = m; }); a.adjustments.forEach(x => { c.state.adjustments[x.id] = x; });
    expect(runEngine(c, { type: 'trend', dates: [TODAY] }).messages).toHaveLength(0);
  });
});

describe('Teamsport und Plan', () => {
  test('18 Verpasste Intervalle vor dem Spiel → nie auf den Tag vor dem Spiel, keine zwei harten Tage', () => {
    const c = ctx({ today: '2026-10-15', state: {} });
    c.state.trend = trend({ hrv: 71, restingHR: 50, sleepHours: 8.6 }).map((p: any) => ({ ...p, date: p.date === TODAY ? '2026-10-15' : p.date }));
    const out = runEngine(c, { type: 'trend', dates: ['2026-10-15'] });
    const mv = out.adjustments.find(a => a.type === 'move');
    if (mv) { expect(mv.to).not.toBe('2026-10-15'); expect(['2026-10-16']).not.toContain(mv.to); }
    const after = C.applyAdjustments(weeks, Object.fromEntries(out.adjustments.map(a => [a.id, a])));
    expect(validateWeeks([after[1]], {}, [after[0]]).filter(v => v.rule === 'hardDays')).toEqual([]);
  });
  test('19 Spiel Freitag und langer Lauf Samstag: Wochenplan bleibt regelkonform', () => {
    expect(validateWeeks([weeks[1]], {}, [weeks[0]]).filter(v => v.rule === 'hardDays')).toEqual([]);
  });
  test('20 Ziel in 6 statt 12 Wochen: Generator hält trotzdem alle Regeln ein', () => {
    const r = generatePlan({ profile: { ...defaultProfile(), birthYear: 1998, weeklyHours: 8 }, goal: { id: 'g', type: 'tri_sprint', name: 'Sprint', date: A(TODAY, 42), priority: 'A' }, today: TODAY, currentWeeklyHours: 5 });
    expect(r.violations).toEqual([]);
    expect(r.plan.weeks.length).toBeLessThanOrEqual(7);
    expect(answerQuick(ctx({ goals: [{ id: 'g', type: 'tri_olympic', name: 'Olympisch', date: A(TODAY, 42), priority: 'A' }] }), 'goal')).toMatch(/knapp/);
  });
  test('21 Wann wieder Intervalle? → nächstes Datum und Ampel-Hinweis', () => {
    const a = answerQuick(ctx({ today: '2026-10-15' }), 'intervals');
    expect(a).toMatch(/Mittwoch, 21\.10\./); expect(a).toMatch(/Ampel/);
  });
  test('22 Lauf-Intervalle nicht freigegeben → Antwort sagt das', () => {
    expect(answerQuick(ctx({ meta: { runIntervalsAllowed: false } }), 'intervals')).toMatch(/nicht freigegeben/);
  });
});

describe('Essen', () => {
  test('23 Drei Tage zu wenig gegessen → freundlicher Hinweis', () => {
    const nutrition: any = {}; for (let i = 1; i <= 3; i++) nutrition[A(TODAY, -i)] = { kcal: 1700 };
    const out = runEngine(ctx({ state: { nutrition } }), { type: 'nutrition' });
    expect(allText(out)).toMatch(/deutlich unter dem Zielbereich/);
  });
  test('24 Mehrere Tage sehr wenig → Hinweis auf Hilfe (Minderjährig: Nummer gegen Kummer)', () => {
    const nutrition: any = {}; for (let i = 1; i <= 5; i++) nutrition[A(TODAY, -i)] = { kcal: 1200 };
    const out = runEngine(ctx({ state: { nutrition } }), { type: 'nutrition' });
    const w = out.messages.find(m => m.kind === 'warning')!;
    expect(w.text).toMatch(/116 111/);
  });
  test('25 Abnehm-Wunsch im Chat → Genug essen geht vor, Hilfe-Nummern', () => {
    expect(checkMessage('Ich will abnehmen, kann ich weniger essen?').find(h => h.flag === 'eating')!.text).toMatch(/Genug zu essen/);
  });
});

describe('Einheiten-Kommentare und Wochenrückblick', () => {
  const act = (o: any) => ({ id: 'a' + Math.random(), source: 'healthfit', sources: ['healthfit'], sport: 'run', date: TODAY, startMs: 0, indoor: false, min: 45, km: 7.5, avgHr: 145, speedKmh: 10, paceSecKm: 360, tempC: 14, laps: [], intervals: null, swim: null, decouplingPct: null, ...o });
  test('26 Gleiche Runde mit weniger Puls → „6 Schläge weniger Puls als bei derselben Runde vor 2 Wochen“', () => {
    const old = act({ id: 'old', date: A(TODAY, -14), avgHr: 151 });
    const c = ctx({ state: { activities: { old } } });
    expect(sessionComment(c, act({ id: 'new' }), { title: 'Lockerer Lauf', sport: 'run' })).toMatch(/6 Schläge weniger Puls als bei derselben Runde vor 2 Wochen/);
  });
  test('27 Intervalle: Gleichmäßigkeit und Erholung in den Pausen', () => {
    const t = sessionComment(ctx(), act({ intervals: { count: 5, hrDriftPct: 2.1, dropPct: 1, recoveryHrDrop: 31 } }), { title: 'Lauf-Intervalle 5×3 min', sport: 'run', zone: 'Zone 4' });
    expect(t).toMatch(/5 Intervalle, sehr gleichmäßig/); expect(t).toMatch(/31 Schläge/);
  });
  test('28 Schwimmen: weniger Züge pro Bahn wird gelobt', () => {
    const old = act({ id: 'o', sport: 'swim', date: A(TODAY, -7), swim: { strokesPerLength: 21 } });
    const t = sessionComment(ctx({ state: { activities: { o: old } } }), act({ sport: 'swim', km: 1.5, swim: { strokesPerLength: 19.5, longestContinuousM: 500 } }), null);
    expect(t).toMatch(/19,5 Züge pro Bahn \(vorher 21\)/); expect(t).toMatch(/500 m am Stück/);
  });
  test('29 Neue Einheit über die Engine → Kommentar-Nachricht, ohne Fehltexte', () => {
    const a = act({ id: 'x1', sessionId: 'w2-mi', sport: 'bike', km: 30, speedKmh: 30 });
    const out = runEngine(ctx({ state: { activities: { x1: a } } }), { type: 'activity', activityIds: ['x1'] });
    const m = out.messages.find(x => x.kind === 'session')!;
    // Auftrag 12: Bewertung in 3 Teilen statt kurzem Kommentar
    expect(m.title).toBe('Bewertung: Sweet-Spot 3×8'); clean(m.text); expect(m.text).toMatch(/Gut:[\s\S]*Besser:[\s\S]*Nächste Tage:/);
  });
  test('30 Wochenrückblick am Sonntag: Umsetzung, Ampel, nächste Woche mit Stunden', () => {
    const c = ctx({ today: '2026-10-18' });
    c.state.trend = trend(null, 34).map((p: any) => ({ ...p }));
    const out = runEngine(c, { type: 'weekly' });
    const w = out.messages.find(m => m.kind === 'week')!;
    expect(w.text).toMatch(/Deine Woche: \d+ von \d+ Einheiten/); expect(w.text).toMatch(/Nächste Woche: \d+ Einheiten, [\d,]+ h/);
    clean(w.text);
  });
  test('31 Wie war meine Woche? → Zahlen der Woche', () => {
    const a = answerQuick(ctx({ state: { sessions: { 'w2-di': { completed: true } } } }), 'week');
    expect(a).toMatch(/1 von \d+ Einheiten erledigt/);
  });
  test('32 Was hat sich verbessert? → nutzt die Scores', () => {
    const a = answerQuick(ctx(), 'improved', { scores: [{ sport: 'run', trend: [{ score: 40 }, { score: 46 }], why: ['+3 Laufen: 6 Schläge weniger Puls bei gleicher Pace wie vor 3 Wochen'] }] });
    expect(a).toMatch(/Laufen \+6 in 6 Wochen: 6 Schläge weniger Puls/);
  });
  test('33 Wie läuft es mit dem Ziel? → Prognose als Bereich oder fehlender Test', () => {
    expect(answerQuick(ctx(), 'goal', { prognosis: { ok: false, missing: ['Schwimmtest 400/200 m'] } })).toMatch(/Schwimmtest/);
    expect(answerQuick(ctx(), 'goal', { prognosis: { ok: true, confidence: 'mittel', total: { low: 8400, high: 9000, best: 8700 }, improve: 'Am meisten bringt dir eine um 5 % höhere Radschwelle: etwa 4 min schneller.' } })).toMatch(/2:20 h bis 2:30 h/);
  });
});

describe('Plan-Code und „Mit Claude besprechen“', () => {
  test('34 Fehler in einfachen Worten', () => {
    expect(checkPlanCode('Hier ist dein Plan!', { weeks: [] }).errors[0]).toMatch(/kein Plan-Code/);
    expect(checkPlanCode('{"weeks":[{"weekNumber":3,"startDate":"2026-10-19","days":[{"date":"2026-10-19","sessions":[{"sport":"rudern","title":"x"}]}]}]}', { weeks }).errors[0]).toMatch(/unbekannter Sport "rudern"/);
    expect(checkPlanCode('{"weeks":[{"weekNumber":3,"startDate":"2026-10-19","days":[{"date":"2026-10-30","sessions":[]}]}]}', { weeks }).errors.join()).toMatch(/liegt nicht in dieser Woche/);
  });
  test('35 Zwei harte Tage hintereinander im Code → Übernahme gesperrt', () => {
    const w3 = JSON.parse(JSON.stringify(weeks[2]));
    w3.days[1].sessions = [{ id: 'x1', sport: 'run', title: 'Intervalle 6×3 min', zone: 'Zone 4', plannedMinutes: 50 }];
    w3.days[2].sessions = [{ id: 'x2', sport: 'bike', title: 'Schwelle 3×10', zone: 'Zone 4', plannedMinutes: 60 }];
    const r = checkPlanCode('```json\n' + JSON.stringify({ mode: 'merge', weeks: [w3] }) + '\n```', { meta: {}, weeks });
    expect(r.ok).toBe(false); expect(r.errors.join()).toMatch(/beide hart/);
  });
  test('36 Gültiger Code: Vorschau „ersetzt“/„neu“ und zusammengeführter Plan', () => {
    const w4 = JSON.parse(JSON.stringify(weeks[2])); w4.weekNumber = 4; w4.startDate = '2026-10-26'; w4.days.forEach((d: any, i: number) => { d.date = A('2026-10-26', i); d.sessions.forEach((s: any) => { s.id = s.id.replace('w3', 'w4'); }); });
    const w3 = JSON.parse(JSON.stringify(weeks[2])); w3.days[6].sessions[0].plannedMinutes = 160;
    const r = checkPlanCode(JSON.stringify({ weeks: [w3, w4] }), { meta: {}, weeks });
    expect(r.ok).toBe(true);
    expect(r.preview.map(p => p.status)).toEqual(['ersetzt', 'neu']);
    expect(r.plan.weeks).toHaveLength(4);
  });
  test('37 Zusammenfassung für Claude: Profil, Ziel, Plan, Werte, Frage und Format-Hinweis', () => {
    const s = buildContext(ctx(), { question: 'Soll ich am Samstag länger laufen?', forShare: true, appName: 'Stamio' });
    expect(s).toMatch(/## Profil/); expect(s).toMatch(/Stadttriathlon/); expect(s).toMatch(/## Plan nächste 14 Tage/);
    expect(s).toMatch(/Soll ich am Samstag länger laufen/); expect(s).toContain(PLAN_FORMAT_HINT);
    expect(s.length).toBeLessThan(12000);
    clean(s);
  });
});
