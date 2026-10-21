import { describe, expect, test } from 'vitest';
import { defaultProfile } from '../../shared/profile';
import { valsOf, reviewOne } from '../../shared/coach/review';
import { buildContext } from '../../shared/coach/summary';
import { swimBests, parseSwimSkill, swimSkillUpdate } from '../../shared/swimskill';
import * as C from '../../shared/core';
import { runEngine } from '../../shared/coach/engine';
import { swimStats } from '../../shared/activity/analyze';
import { evidenceSignature } from '../../shared/results';

const today = '2026-10-20';
const planned: any = { id: 'swim-1', sport: 'swim', title: '100 m Kraul', plannedMinutes: 40, stage: { ladder: 'swim', n: 4 }, spec: { steps: [{ mode: 'crawl', m: 100 }] } };
const weeks = [{ days: [{ date: today, sessions: [planned] }] }];
function setup() {
  const profile = defaultProfile(); profile.skills = { swimCrawl: 'some', swimCrawlM: 50 };
  const st = { completed: true, activityId: 'a', metrics: { longestCrawl: '50', meters: '500', min: '30' }, metricsSrc: { longestCrawl: 'manual', meters: 'manual', min: 'manual' }, rpe: 4 };
  const act: any = { id: 'a', sport: 'swim', source: 'file', date: today, sessionId: 'swim-1', min: 40, km: 0.8, swim: { longestContinuousM: 100, byStroke: { freestyle: 800 } } };
  const state: any = { sessions: { 'swim-1': st }, activities: { a: act }, customWorkouts: {}, adjustments: {}, trend: [], settings: {}, profile };
  const ctx: any = { today, now: 1, profile, state, baseWeeks: weeks, goals: [], planMeta: {} };
  const d: any = { key: 'swim-1', date: today, sport: 'swim', title: planned.title, planned, st, act, custom: false };
  return { profile, st, act, state, ctx, d };
}
describe('SOLL und IST bleiben getrennt', () => {
  test('Vorschläge erkennen Änderungen unabhängig von der Reihenfolge synchronisierter Datensätze', () => {
    const a = { sessions: { a: { metrics: { longestCrawl: 50 } }, b: { metrics: { min: 30 } } } };
    const b = { sessions: { b: { metrics: { min: 30 } }, a: { metrics: { longestCrawl: 50 } } } };
    expect(evidenceSignature(a)).toBe(evidenceSignature(b));
    b.sessions.a.metrics.longestCrawl = 100;
    expect(evidenceSignature(a)).not.toBe(evidenceSignature(b));
    expect(evidenceSignature({ ...a, coachMsgs: { m: { text: '100 m geschafft' } } })).toBe(evidenceSignature(a));
  });
  test('Vorschläge akzeptieren dieselben Zusatztrainings nach einem Sync, aber keine Ausrüstungsänderung', () => {
    const a: any = { customWorkouts: { [today]: [{ id: 'c', sport: 'swim', metrics: { min: '30' } }, { id: 'b', sport: 'run', metrics: { min: '20' } }] }, profile: { skills: { swimGear: ['buoy'] } } };
    const b = structuredClone(a); b.customWorkouts[today].reverse().forEach((w: any) => { w.date = today; });
    expect(evidenceSignature(a)).toBe(evidenceSignature(b));
    b.profile.skills.swimGear = [];
    expect(evidenceSignature(a)).not.toBe(evidenceSignature(b));
  });
  test('manuell 50 m hat vor importierten 100 m Vorrang', () => {
    const { d } = setup(); expect(valsOf(d)).toMatchObject({ longest: 50, min: 30, meters: 500 });
  });
  test('Coach behauptet bei 50 m keinen 100-m-Erfolg', () => {
    const { ctx, d } = setup(); const r = reviewOne(ctx, d);
    expect(r.good.join(' ')).toContain('50 m Kraul');
    expect(r.good.join(' ')).not.toMatch(/100 m.*(?:geschafft|Bestmarke|am Stück)/);
    expect(r.better.join(' ')).toMatch(/100.*50|50.*100/);
  });
  test('heutiger Coachkontext enthält getrenntes Ergebnis und Planziel', () => {
    const { ctx } = setup(); const text = buildContext(ctx);
    expect(text).toContain('IST'); expect(text).toContain('50'); expect(text).toContain('SOLL');
  });
  test('Schwimmstufe wird nicht aus Dauer und leichter RPE abgeleitet', () => {
    expect(C.stageVerdict(planned, { completed: true, metrics: { min: 40, longestCrawl: 50 }, rpe: 4 }, null).ok).toBe(false);
    expect(C.stageVerdict(planned, { completed: true, metrics: { min: 40 }, rpe: 4 }, null).ok).toBe(false);
  });
  test('abgehakt ohne Ergebnisdauer erzeugt keine tatsächliche Planbelastung', () => {
    const { state } = setup(); state.activities = {}; state.sessions['swim-1'] = { completed: true };
    expect(C.dailyLoadEntries(state, weeks)).toEqual([]);
  });
  test('moderne Zusatzpläne ohne Ergebnis bleiben unbekannt; historische manuelle Zusatzlogs bleiben erhalten', () => {
    const d: any = { sport: 'run', custom: true, st: { id: 'legacy', sport: 'run', plannedMinutes: 40 }, act: null };
    expect(valsOf(d).min).toBe(40); // Alte Zusatzlog-Maske speicherte die eingegebene Dauer in plannedMinutes.
    d.st.completed = true; expect(valsOf(d).min).toBeNull();
    delete d.st.completed; d.st.metricsManual = { min: true }; expect(valsOf(d).min).toBeNull();
  });
  test('Dauerkorrektur entwertet importierte Belastung, schützt aber manuelle Effizienz', () => {
    const { state, st, act } = setup(); act.sport = 'run'; act.avgHr = 150; act.km = 5; act.icuLoad = 100;
    state.sessions['swim-1'] = { ...st, icuLoad: 100, metrics: { min: '10', hr: '150', efficiency: '99' }, metricsSrc: { min: 'manual', efficiency: 'manual' } };
    const plan = [{ days: [{ date: today, sessions: [{ id: 'swim-1', sport: 'run', plannedMinutes: 60 }] }] }];
    expect(C.dailyLoadEntries(state, plan)[0].load).toBeLessThan(30);
    expect((C.recordedActivities(state)[0] as any).efficiency).toBe(99);
  });
  test('Schwimmbestwerte beachten manuelle Korrektur und ignorieren Entwürfe', () => {
    const { state } = setup(); state.customWorkouts[today] = [{ id: 'draft', sport: 'swim', completed: false, metrics: { longestCrawl: 400 } }];
    // Auftrag 17: ein einzelner Wert ist ein Bestwert, bestätigt (Stufe) erst nach 2 Einheiten
    expect(swimBests(state, weeks, today).best).toBe(50);
    expect(swimBests(state, weeks, today).crawl).toBe(0);
  });
  test('gemischte Schwimmstile belegen keinen Kraulrekord', () => {
    const { state, st, act } = setup(); st.metrics = {} as any; st.metricsSrc = {} as any;
    act.swim = { longestContinuousM: 500, byStroke: { breaststroke: 450, freestyle: 50 } };
    expect(swimBests(state, weeks, today).crawl).toBe(0);
  });
  test('50 m Gesamtdistanz kann keinen importierten 100-m-Kraulrekord belegen', () => {
    const { st, d, state } = setup(); st.metrics.meters = '50'; delete (st.metrics as any).longestCrawl; delete (st.metricsSrc as any).longestCrawl;
    expect(valsOf(d).longest).toBeNull(); expect(swimBests(state, weeks, today).crawl).toBe(0);
    expect(reviewOne(setup().ctx, d).better.join(' ')).toMatch(/Widerspruch/);
  });
  test.each(['Ich kann noch keine 100 m Kraul am Stück', 'Geplant waren 100 m Kraul, aber ich habe nur 50 m geschafft', 'Kann ich jetzt 100 m Kraul schaffen?'])('Chattext ist ohne eindeutigen Leistungsnachweis kein Rekord: %s', text => {
    expect(parseSwimSkill(text)).toBeNull();
  });
  test('korrigierte importierte Leistung fließt auch in Scores ein', () => {
    const { state } = setup(); const a: any = C.recordedActivities(state)[0];
    expect(a.swim.longestContinuousM).toBe(50); expect(a.km).toBe(0.5); expect(a.min).toBe(30);
  });
  test('leeres manuelles Feld fällt nicht wieder auf die Uhr zurück', () => {
    const { st, d } = setup(); delete (st.metrics as any).longestCrawl; (st as any).metricsManual = { longestCrawl: true };
    expect(valsOf(d).longest).toBeNull();
  });
  test('erneute Bewertung ersetzt erkennbar eine veraltete Behauptung, auch rückdatiert', () => {
    const { ctx, state } = setup(); ctx.today = '2026-11-01';
    state.coachMsgs = { 'msg-review-swim-1': { id: 'msg-review-swim-1', text: '100 m geschafft', kind: 'session', date: today, at: 1 } };
    const r = runEngine(ctx, { type: 'activity', activityIds: ['a'] });
    const m = r.messages.find(x => x.id === 'msg-review-swim-1');
    expect(m).toBeTruthy(); expect(m!.text).toContain('50 m'); expect(m!.title).toMatch(/aktualisiert/i);
  });
  test('Bahnen mit Brust und unbekanntem Stil werden nicht als Kraul summiert', () => {
    const raw: any = { poolLengthM: 25, totals: {}, lengths: [
      { active: true, start: 0, sec: 30, stroke: 'freestyle' }, { active: true, start: 30, sec: 30, stroke: 'freestyle' },
      { active: true, start: 60, sec: 30, stroke: 'breaststroke' }, { active: true, start: 90, sec: 30 }
    ] };
    const s = swimStats(raw); expect(s.longestContinuousM).toBe(100); expect(s.longestCrawlM).toBe(50); expect(s.byStroke.unknown).toBe(25);
  });
});
