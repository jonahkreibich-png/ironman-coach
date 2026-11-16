/* Auftrag 36, Punkt 4/5: Funde der großen Simulation als dauerhafte, schnelle Tests (Ursachen im Generator, in der Anpassung und im
   Daten-Check). Die Simulation selbst läuft im großen Test (scripts/grosser-test.mjs). */
import { describe, expect, test } from 'vitest';
import * as C from '../../shared/core';
import { applyOnboarding } from '../../shared/onboarding';
import { checkTrainingRules } from '../../shared/trainingrules';
import { dataCheck } from '../../shared/datacheck';
import { sportScores } from '../../shared/scores';
import { PERSONAS } from '../../fixtures/personas';
import { defaultProfile } from '../../shared/profile';

const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const START = '2026-11-16';
const plan = (id: string) => { const p = PERSONAS.find(x => x.id === id)!; const r: any = applyOnboarding(copy(p.answers), START); return { r, weeks: r.gen.plan.weeks, profile: r.profile, goals: r.goals }; };
const rules = (o: any, weeks = o.weeks, from = START) => checkTrainingRules(weeks, o.profile, { from, today: from, goals: o.goals, goalType: (o.goals[0] || {}).type });

describe('Auftrag 36: Plan-Regeln – Ursachen behoben', () => {
  test('Wettkampf kurz vor Planbeginn (10 km am Samstag, Plan ab Montag): keine harte Einheit in den lockeren Tagen danach', () => {
    const o = plan('laeuferin-hm');
    expect(o.goals.some((g: any) => g.date === '2026-11-14')).toBe(true);
    expect(rules(o).filter(i => i.rule === 'afterRace')).toEqual([]);
  });
  test('frische Pläne aller Test-Personen ohne Regel-Verstoß (u. a. Erholungswoche nach geplanter reduzierter Woche)', () => {
    for (const p of PERSONAS) { const o = plan(p.id); expect(rules(o).map(i => `${p.id}: ${i.msg}`)).toEqual([]); }
  });
  test('vom Coach gekürzte Woche (Umfang −20 %): Rückkehr zum Plan ist kein Sprung (lange Einheit, Erholungswoche)', () => {
    const o = plan('erfahren-md-marathon');
    const adj: Record<string, any> = {};
    // Wochen 2 und 3 je 20 % gekürzt, wie die Wochenanpassung (Kennung „-vol-“, Grund „Umfang -20 %“)
    for (const w of o.weeks.slice(1, 3)) for (const d of w.days) for (const s of d.sessions) if (s.plannedMinutes && s.sport !== 'rest') adj[`g-vol-${s.id}`] = { id: `g-vol-${s.id}`, type: 'modify', sessionId: s.id, set: { plannedMinutes: Math.round(s.plannedMinutes * 0.8 / 5) * 5 }, reason: 'Umfang -20 %' };
    // dazu ein langer Lauf, den die Tagesanpassung auf 25 min gekürzt hat (Titel bleibt „Langer Lauf …“ nur im Original)
    const lr = o.weeks[2].days.flatMap((d: any) => d.sessions).find((s: any) => s.sport === 'run' && (s.long || /^Lang/.test(s.title)));
    if (lr) adj[`daily-x-${lr.id}`] = { id: `daily-x-${lr.id}`, type: 'modify', sessionId: lr.id, set: { title: 'Locker statt: ' + lr.title, plannedMinutes: 25 }, reason: 'Ampel rot' };
    const eff = C.applyAdjustments(o.weeks, adj);
    expect(eff[1].reducedByCoach && eff[2].reducedByCoach).toBe(true);
    expect(rules(o, eff, eff[1].startDate).filter(i => i.rule === 'longStep' || i.rule === 'recoveryDepth')).toEqual([]);
  });
  test('Erholungswoche nach einem A/B-Wettkampf wird nicht mit einer Aufbauwoche vor dem Rennen verglichen', () => {
    const o = plan('olympisch-erfahren');
    const weeks = copy(o.weeks);
    const ri = weeks.findIndex((w: any) => w.days.some((d: any) => d.sessions.some((s: any) => s.race)));
    expect(ri).toBeGreaterThan(0);
    // neue Saison: Erholungswoche direkt nach Rennwoche + Übergangswoche, sehr klein
    const rec = weeks[ri + 2]; if (rec) { rec.isRecoveryWeek = true; rec.days.forEach((d: any) => { d.sessions = d.sessions.filter((s: any) => s.sport === 'rest' || s.race).slice(0, 1); }); rec.days[1].sessions = [{ id: 'mini', sport: 'run', title: 'Lockerer Lauf 20 min', plannedMinutes: 20 }]; }
    weeks[ri + 1].phase = 'race';
    expect(rules(o, weeks).filter(i => i.rule === 'recoveryDepth' && i.week === (rec || {}).weekNumber)).toEqual([]);
  });
  test('nachgeholte Einheit (abgebrochen) und ihr Original zählen zusammen einmal als harte Einheit', () => {
    const o = plan('laeuferin-hm');
    const w = o.weeks.find((x: any) => !x.isRecoveryWeek && x.startDate >= '2026-11-23' && x.days.some((d: any) => d.sessions.some((s: any) => C.isHard(s) && !s.race)))!;
    const d = w.days.find((d: any) => d.sessions.some((s: any) => C.isHard(s) && !s.race))!; const s0 = d.sessions.find((s: any) => C.isHard(s) && !s.race)!;
    const free = w.days.find((x: any) => x.date > C.addDays(d.date, 1) && !x.sessions.some((y: any) => y.sport !== 'rest'))!;
    const adj = { 'redo-x': { id: 'redo-x', type: 'add', to: free.date, session: { ...copy(s0), id: s0.id + '-nach', nachVon: d.date } } };
    expect(rules(o, C.applyAdjustments(o.weeks, adj), w.startDate).filter(i => i.rule === 'hardCount' && i.week === w.weekNumber)).toEqual([]);
  });
  test('Wiedereinstieg nach einer Pause (Tempo → Zone 2, kürzer): keine Pflicht-Qualität und kein „Sprung“ danach', () => {
    const o = plan('laeuferin-hm');
    const w = o.weeks.find((x: any) => x.startDate >= '2026-11-30' && !x.isRecoveryWeek && x.days.some((d: any) => d.sessions.some((s: any) => s.sport === 'run' && C.isHard(s))))!;
    const adj: any = {};
    for (const d of w.days) for (const s of d.sessions) if (s.sport === 'run') adj['pause-' + s.id] = { id: 'pause-' + s.id, type: 'modify', sessionId: s.id, set: { ...(C.isHard(s) ? { title: 'Zone 2 statt: ' + s.title, zone: 'Zone 2', hard: false } : {}), plannedMinutes: Math.round(s.plannedMinutes * 0.6 / 5) * 5 }, reason: 'Wiedereinstieg nach 17 Tagen Pause' };
    const eff = C.applyAdjustments(o.weeks, adj);
    expect(eff.find((x: any) => x.weekNumber === w.weekNumber).returnWeek).toBe(true);
    expect(rules(o, eff, w.startDate).filter(i => ['goalQuality', 'longStep'].includes(i.rule))).toEqual([]);
  });
});

describe('Auftrag 36: Daten-Check und Scores', () => {
  test('eigene Änderung mit „Trotzdem übernehmen“ ist kein Plan-Fehler, dieselbe Änderung von der App schon', () => {
    const o = plan('laeuferin-hm');
    const days = C.planDays(o.weeks).filter((d: any) => d.date >= '2026-11-23');
    // eine lockere Einheit direkt nach einem harten Tag wird zu Intervallen (zwei harte Tage hintereinander)
    const i = days.findIndex((d: any, k: number) => k > 0 && d.sessions.some((x: any) => C.isHard(x) && !x.race) && days[k + 1] && days[k + 1].sessions.some((x: any) => x.sport === 'run' && !C.isHard(x)));
    expect(i).toBeGreaterThan(0);
    const e = days[i + 1].sessions.find((x: any) => x.sport === 'run' && !C.isHard(x))!;
    const mv = (group: string, override: boolean) => ({ [group + '-cv']: { id: group + '-cv', group, type: 'modify', sessionId: e.id, set: { title: 'Lauf-Intervalle 5×3 min', zone: 'Zone 5', hard: true, spec: null }, ...(override ? { override: true } : {}) } });
    const run = (adjustments: any) => dataCheck({ state: { profile: o.profile, sessions: {}, adjustments, customWorkouts: {}, coachMsgs: {} }, baseWeeks: o.weeks, profile: o.profile, goals: o.goals, today: START }).findings.filter(f => f.group === 'rules');
    expect(run(mv('auto-x', false)).length).toBeGreaterThan(0);
    expect(run(mv('user-123', true))).toEqual([]);
  });
  test('Obergrenze ohne Test stufenlos: die 15. gleiche Fahrt hebt den Rad-Score nicht sprunghaft (vorher 50 → 65)', () => {
    const today = '2026-11-16';
    const ride = (i: number) => ({ id: 'r' + i, sport: 'bike', date: C.addDays(today, -2 * i), min: 60, km: 33, speedKmh: 33, avgHr: 135, source: 'file', name: 'Ausfahrt' });
    const prof: any = { ...defaultProfile(), birthYear: 1990, sports: ['bike'], weeklyHours: 8, thresholds: { ...defaultProfile().thresholds, lthrBike: 165 } };
    const sc = (n: number) => sportScores({ today, activities: Array.from({ length: n }, (_, i) => ride(i)), trend: [], illness: [], profile: prof, goal: null } as any, ['bike'])[0].score;
    for (const n of [14, 39]) expect(Math.abs(sc(n + 1) - sc(n))).toBeLessThanOrEqual(3);
  });
  test('Kraft-Score: Krafteinheiten ohne Gefühl/Puls nach einer mit RPE zählen (vorher fielen sie aus der Auswahl)', () => {
    const today = '2026-11-16';
    const ex = [{ name: 'Kniebeuge', sets: 3, reps: '8', kg: 40 }, { name: 'Rudern', sets: 3, reps: '12', kg: 20 }];
    const acts = [{ id: 'a', sport: 'strength', date: '2026-11-02', min: 30, rpe: 6 }, { id: 'b', sport: 'strength', date: '2026-11-14', min: 40, exercises: ex }] as any[];
    const sc = sportScores({ today, activities: acts, trend: [], illness: [], profile: { ...defaultProfile(), weightKg: 70, sports: ['strength'] }, goal: null } as any, ['strength'])[0];
    expect(sc.parts.map(p => p.key)).toContain('cover');
  });
});
