/* Auftrag 17, Punkt 1 (dauerhafter Regressionstest): Soll und Ist nie verwechseln.
   Fall aus Jonahs Daten: geplant waren 100-m-Stücke Kraul, geschafft und eingetragen 50 m; die Uhr meldet „100 m am Stück“,
   weil sie Brust und Kraul zusammenzählt. Nie „100 m geschafft“, keine Stufe 100 m, kein Bestwert 100 m – in keinem Teil der App.
   Dazu: nachträgliche Korrektur 100 → 50 m rechnet Stufe, Können und kommende Einheiten neu und sagt „Korrigiert: …“. */
import { describe, expect, test } from 'vitest';
import * as C from '../../shared/core';
import * as W from '../../shared/workouts';
import { defaultProfile } from '../../shared/profile';
import { swimBests, swimSkillUpdate } from '../../shared/swimskill';
import { reviewOne, doneItems, autoReview } from '../../shared/coach/review';
import { buildContext } from '../../shared/coach/summary';
import { converse } from '../../shared/coach/dialog';
import { runEngine } from '../../shared/coach/engine';
import { sportScores, legacyActivities } from '../../shared/scores';
import { analyze } from '../../shared/coach/analysis';

const ctxW = { breast100: 165, gear: ['board', 'buoy'], pool: 25 } as W.PaceCtx;
const learn = (id: string, n: number) => ({ id, sport: 'swim', ...W.build(W.swimLearn(ctxW, { ladder: 'swim', n, breast: true }, 'Kraul lernen', 45)) });
/* 2 Wochen: Sa 17.10. Stufe 4 (50-m-Stücke), Di 20.10. Stufe 5 (100-m-Stücke), danach kommende Schwimmeinheiten */
const weeks = [
  { weekNumber: 5, startDate: '2026-10-12', endDate: '2026-10-18', days: [{ date: '2026-10-17', sessions: [learn('sa17', 3)] }] },
  { weekNumber: 6, startDate: '2026-10-19', endDate: '2026-10-25', days: [{ date: '2026-10-20', sessions: [learn('di20', 4)] }, { date: '2026-10-24', sessions: [learn('sa24', 4)] }] },
  { weekNumber: 7, startDate: '2026-10-26', endDate: '2026-11-01', days: [{ date: '2026-10-27', sessions: [learn('di27', 4)] }, { date: '2026-10-31', sessions: [learn('sa31', 4)] }] }
];
const today = '2026-10-20';
/* Uhr: 100 m „am Stück“, aber gemischte Lagen (Brust und Kraul), so wie HealthFit es liefert */
const watch = (id: string, date: string, sessionId: string, cont: number) => ({ id, sport: 'swim', source: 'healthfit', date, sessionId, min: 47, km: 0.9, avgHr: 115,
  swim: { poolLengthM: 25, longestContinuousM: cont, byStroke: { breaststroke: 300, freestyle: 550, drill: 50 }, strokesPerLength: 15.2, metersPerStroke: 1.64 } });
const manual50 = (activityId: string) => ({ completed: true, activityId, metrics: { min: '47', meters: '900', longestCrawl: '50' }, metricsSrc: { min: 'manual', meters: 'manual', longestCrawl: 'manual' }, metricsAuto: { longestCrawl: '100' }, rpe: '4' });
function world() {
  const profile: any = { ...defaultProfile(), name: 'Test', birthYear: 2008, sports: ['swim', 'bike', 'run'], skills: { swimCrawl: 'some', swimCrawlM: 25, swimBreast: true, swimGear: ['board', 'buoy'], poolM: 25 } };
  const state: any = { sessions: { sa17: manual50('w17'), di20: manual50('w20') }, activities: { w17: watch('w17', '2026-10-17', 'sa17', 75), w20: watch('w20', today, 'di20', 100) },
    customWorkouts: {}, adjustments: {}, trend: [], illnessPeriods: [], settings: {}, coachMsgs: {}, profile };
  const ctx: any = { today, now: 1, profile, state, baseWeeks: weeks, goals: [], planMeta: {} };
  return { profile, state, ctx };
}
/* Behauptungen einer 100-m-Leistung (der Titel der geplanten Einheit darf genannt werden, er ist das Soll) */
const NO_100 = /100 m (?:Kraul )?(?:am Stück )?(?:geschafft|erreicht)|Geschafft: 100|geschafft 100 m|Etappenziel erreicht.*100 m|Neu bestätigt: 100|100 m Kraul am Stück, neue Bestmarke|neue Bestmarke \(vorher|IST: 100|nächste Stufe: 100/;

describe('geplant 100 m, gemacht 50 m: nie 100 m als Leistung', () => {
  test('Nachweise: nur die eingetragenen 50 m, die Uhr (gemischte Lagen) zählt nicht als Kraul', () => {
    const { state } = world();
    const b = swimBests(state, weeks, today);
    expect(b.best).toBe(50); expect(b.crawl).toBe(50); // zweimal 50 m (17.10. und 20.10.)
    expect(C.swimProofs(state, weeks, today).map(p => p.crawl)).toEqual([50, 50]);
  });
  test('Können im Profil: 50 m, nicht 100 m', () => {
    const { profile, state } = world();
    const u = swimSkillUpdate(profile, weeks, {}, today, swimBests(state, weeks, today), 1)!;
    expect(u.skills.swimCrawlM).toBe(50);
    expect(u.text).not.toMatch(/100 m/);
    expect(u.adjustments.every(a => a.set.stage.n === 3)).toBe(true); // 50-m-Stücke
  });
  test('Wochen-Anpassung: Stufe passend zu 50 m (keine 100-m-Stücke)', () => {
    const { state } = world();
    const r = C.weeklyAdjustments(state, weeks, '2026-10-25', { planMeta: {} });
    const st = r.adjustments.filter((a: any) => /-stage-/.test(a.id));
    expect(st.length).toBeGreaterThan(0);
    st.forEach((a: any) => { expect(a.set.stage.n).toBe(3); expect(a.set.description).not.toMatch(/100 m Kraul/); });
  });
  test('Bewertung: SOLL 100 m, IST 50 m, kein „100 m geschafft“', () => {
    const { ctx } = world();
    const d = doneItems(ctx, today, today).find(x => x.key === 'di20')!;
    const r = reviewOne(ctx, d);
    const all = [...r.good, ...r.better, ...r.next].join(' ');
    expect(all).not.toMatch(NO_100);
    expect(all).toMatch(/Geplant: 100 m Kraul am Stück. Geschafft: 50 m/);
    expect(all).toMatch(/50 m Kraul am Stück wie zuletzt/);
    expect(autoReview(ctx, d, 'full')).not.toMatch(NO_100);
  });
  test('Coach-Engine nach der Aufzeichnung: keine 100-m-Behauptung, keine 100-m-Stufe', () => {
    const { ctx } = world();
    const out = runEngine(ctx, { type: 'activity', activityIds: ['w20'] } as any);
    expect(out.messages.map(m => m.text).join('\n')).not.toMatch(NO_100);
    expect(out.adjustments.some((a: any) => a.set && a.set.stage && a.set.stage.n >= 4)).toBe(false);
  });
  test('Scores: Kraul am Stück 50 m, kein Etappenziel 100 m', () => {
    const { state, profile } = world();
    const acts = [...C.recordedActivities(state), ...legacyActivities(state, weeks, profile)];
    const s = sportScores({ today, activities: acts as any, trend: [], illness: [], profile, goal: null, calibration: null, manualAdjust: {}, stages: { 'swim.cont': { target: 100, from: 50, set: '2026-10-10' } } } as any, ['swim'])[0];
    const cont = s.parts.find(p => p.key === 'cont')!;
    expect(cont.raw).toBe(50);
    expect(s.reached.map(r => r.text).join(' ')).not.toMatch(/100 m/);
  });
  test('Coach-Kontext (für die KI): IST 50 m, SOLL nur als Plan', () => {
    const { ctx } = world();
    const text = buildContext(ctx);
    expect(text).toMatch(/"longestCrawlM":50/);
    expect(text).not.toMatch(/"longestCrawlM":100/);
    expect(text).toMatch(/SOLL ist nur ein Plan/);
  });
  test('Regel-Coach im Chat: keine 100-m-Behauptung', () => {
    const { ctx } = world();
    for (const q of ['Wie war mein Schwimmen heute?', 'Wie weit kann ich kraulen?', 'Was ist meine Schwimm-Stufe?', 'Wie war mein letztes Training?']) {
      const r = converse(ctx, {}, q).reply;
      expect(r.text, q).not.toMatch(NO_100);
    }
  });
  test('Analyse („Was der Coach sieht“): Kraul-Verlauf nur aus eingetragenen Werten', () => {
    const { ctx } = world();
    const a = analyze(ctx, 'view');
    expect(JSON.stringify(a)).not.toMatch(/auf 100 m|100 m \(/);
  });
});

describe('Korrektur 100 → 50 m: alles Abhängige neu, „Korrigiert: …“', () => {
  test('zweimal 100 m eingetragen → Stufe 100 m; eine Einheit auf 50 m korrigiert → Stufe und Können zurück, mit Meldung', () => {
    const { profile, state } = world();
    state.sessions.sa17 = { ...manual50('w17'), metrics: { ...manual50('w17').metrics, longestCrawl: '100' } };
    state.sessions.di20 = { ...manual50('w20'), metrics: { ...manual50('w20').metrics, longestCrawl: '100' } };
    const up = swimSkillUpdate(profile, weeks, {}, today, swimBests(state, weeks, today), 1)!;
    expect(up.skills.swimCrawlM).toBe(100);
    expect(up.text).toMatch(/Neu bestätigt: 100 m.*2 Einheiten/);
    const p2 = { ...profile, skills: { ...profile.skills, ...up.skills } };
    const adj: any = {}; up.adjustments.forEach(a => { adj[a.id] = { ...a, createdAt: 1 }; });
    // Korrektur: am 20.10. waren es doch nur 50 m
    state.sessions.di20 = manual50('w20');
    state.profile = p2; state.adjustments = adj;
    const fix = swimSkillUpdate(p2, weeks, adj, today, swimBests(state, weeks, today), 2)!;
    expect(fix.skills.swimCrawlM).toBe(50);
    expect(fix.text).toMatch(/^Korrigiert: Kraul am Stück jetzt 50 m statt 100 m/);
    expect(fix.adjustments.length).toBeGreaterThan(0);
    fix.adjustments.forEach(a => expect(a.set.stage.n).toBe(3));
    // keine Endlosschleife: derselbe Stand ergibt keine weitere Änderung
    const p3 = { ...p2, skills: { ...p2.skills, ...fix.skills } };
    expect(swimSkillUpdate(p3, weeks, adj, today, swimBests(state, weeks, today), 3)).toBeNull();
  });
  test('eigene Profilangabe wird nicht stillschweigend überschrieben', () => {
    const { profile, state } = world();
    const own = { ...profile, skills: { ...profile.skills, swimCrawlM: 75, swimEvidence: { crawl: { value: 75, baseline: 75, manual: true } } } };
    const u = swimSkillUpdate(own, weeks, {}, today, swimBests(state, weeks, today), 1);
    expect(u ? u.skills.swimCrawlM : 75).toBe(75);
  });
  test('Bewertung nach Korrektur beginnt mit „Korrigiert:“ und die alte Behauptung gilt nicht mehr', () => {
    const { ctx, state } = world();
    state.sessions.di20 = { ...manual50('w20'), metrics: { ...manual50('w20').metrics, longestCrawl: '100' } };
    const first = runEngine(ctx, { type: 'activity', activityIds: ['w20'] } as any).messages.find(m => m.id === 'msg-review-di20')!;
    state.coachMsgs[first.id] = first;
    state.sessions.di20 = manual50('w20');
    const again = runEngine(ctx, { type: 'activity', activityIds: ['w20'], sessionIds: ['di20'] } as any).messages.find(m => m.id === 'msg-review-di20')!;
    expect(again.text).toMatch(/^Korrigiert:/);
    expect(again.text).not.toMatch(NO_100);
  });
});

describe('Stufe nur nach Nachweis', () => {
  test('einmal 100 m reicht nicht, zweimal in verschiedenen Einheiten schon; nie nach Zeit', () => {
    const { state } = world();
    state.sessions.di20 = { ...manual50('w20'), metrics: { ...manual50('w20').metrics, longestCrawl: '100' } };
    expect(C.swimStageVerdict(state, weeks, today, 4).n).toBe(3);
    state.sessions.sa17 = { ...manual50('w17'), metrics: { ...manual50('w17').metrics, longestCrawl: '100' } };
    expect(C.swimStageVerdict(state, weeks, today, 3).n).toBe(4);
    // nur Dauer und leichte RPE, keine Strecke: Stufe bleibt
    const none = world().state; none.sessions = { sa17: { completed: true, metrics: { min: '45' }, rpe: '3' }, di20: { completed: true, metrics: { min: '47' }, rpe: '3' } }; none.activities = {};
    none.profile.skills.swimEvidence = { crawl: { value: 50, baseline: 50 } }; none.profile.skills.swimCrawlM = 50;
    expect(C.swimStageVerdict(none, weeks, today, 3).n).toBe(3);
  });
  test('zweimal kürzer als geplant → eine Stufe leichter', () => {
    const { state } = world();
    state.profile.skills.swimEvidence = { crawl: { value: 50, baseline: 50 } };
    state.sessions.sa17 = { ...manual50('w17'), metrics: { ...manual50('w17').metrics, longestCrawl: '25' } };
    state.sessions.di20 = { ...manual50('w20'), metrics: { ...manual50('w20').metrics, longestCrawl: '25' } };
    const v = C.swimStageVerdict(state, weeks, today, 4);
    expect(v.n).toBe(3); expect(v.why).toMatch(/leichter/);
  });
});

/* Auftrag 17, Punkt 6: behauptete Leistungen werden deterministisch gegen die Daten geprüft (Regel-Coach und KI) */
import { claimFacts, unsupportedClaims, stripUnsupported } from '../../shared/coach/claims';
describe('Behauptungs-Prüfer', () => {
  test('erkennt erfundene Leistungen, lässt Pläne, Ziele und Bedingungen stehen', () => {
    const { ctx } = world();
    const f = claimFacts(ctx);
    expect(f.crawlBest).toBe(50); expect(f.crawlConfirmed).toBe(50);
    const bad = ['Super, du hast 100 m Kraul am Stück geschafft!', 'Etappenziel erreicht, Kraul am Stück 100 m (Ziel war 100 m).', 'Neue Stufe: 100-m-Stücke Kraul.', 'Eingetragen: 100 m Kraul am Stück. Deine Schwimm-Stufe: 100-m-Stücke Kraul.', 'Du bist gestern 25 km gelaufen.'];
    for (const t of bad) expect(unsupportedClaims(t, f), t).not.toEqual([]);
    const ok = ['Geplant waren 100 m Kraul am Stück, geschafft hast du 50 m.', 'Die nächste Stufe kommt, wenn du 100 m in 2 Einheiten schaffst.', '50 m Kraul am Stück geschafft, sauber!', 'Am Sonntag steht ein langer Lauf über 90 min an.', 'Wie weit schaffst du 100 m?'];
    for (const t of ok) expect(unsupportedClaims(t, f), t).toEqual([]);
  });
  test('Regel-Coach: unbelegte Sätze werden entfernt, der Rest bleibt', () => {
    const { ctx } = world();
    const t = stripUnsupported('Gute Einheit. Du hast 100 m Kraul am Stück geschafft. Weiter so.', claimFacts(ctx));
    expect(t).not.toMatch(/100 m/); expect(t).toMatch(/Gute Einheit/); expect(t).toMatch(/Weiter so/);
  });
});

import {compactContext} from '../../shared/coach/freeai';
import {explainDay} from '../../shared/coach/explain';
test('Pull-Nachweise erlauben keine erfundenen unaided Behauptungen und umgekehrt',()=>{
 const {ctx,state}=world(); state.sessions.sa17.metrics.longestPull='100'; state.sessions.di20.metrics.longestPull='100';
 const f=claimFacts(ctx); expect(f).toMatchObject({pullBest:100,pullConfirmed:100,crawlBest:50});
 expect(unsupportedClaims('Du hast 100 m Kraul mit Pull Buoy am Stück geschafft.',f)).toEqual([]);
 expect(unsupportedClaims('Du hast 50 m Kraul ohne Pull Buoy und 100 m Kraul mit Pull Buoy am Stück geschafft.',f)).toEqual([]);
 expect(unsupportedClaims('Du hast 100 m Kraul ohne Pull Buoy geschafft.',f)).not.toEqual([]);
 expect(unsupportedClaims('Du hast 100 m Kraul mit Pull Buoy und 100 m Kraul ohne Pull Buoy geschafft.',f)).not.toEqual([]);
 expect(unsupportedClaims('Du hast 150 m mit Pull Buoy am Stück geschafft.',f)).not.toEqual([]);
});
test('kompakter Kontext unterscheidet beide Bestwerte und Bestätigung von Profilangaben',()=>{
 const {ctx,state,profile}=world(); profile.skills.swimCrawlM=200; profile.skills.swimPullM=300;
 state.sessions.di20.metrics.longestCrawl='100'; state.sessions.di20.metrics.longestPull='100'; state.sessions.sa17.metrics.longestPull='50';
 const text=compactContext(ctx); expect(text).toMatch(/Kraul ohne Hilfsmittel.*Bestwert 100 m.*bestätigt 50 m/); expect(text).toMatch(/Pull Buoy.*Bestwert 100 m.*bestätigt 50 m/);
 expect(text).toMatch(/Profilangabe.*200 m.*300 m/); expect(text).toMatch(/IST erledigt.*Pull Buoy am Stück 100 m/);
});
test('Trainingserklärung benennt Bestwert100 statt falscher Behauptung aktuell50',()=>{
 const {ctx,state,profile}=world(); profile.skills.swimCrawlM=50; state.sessions.di20.metrics.longestCrawl='100';
 const text=explainDay(ctx,'2026-10-24','swim').text; expect(text).toMatch(/Bestwert 100 m.*bestätigt 50 m/); expect(text).not.toMatch(/Du kraulst gerade 50/);
});

/* Auftrag 21: Nach einem App-Update stand bei alten Bewertungen „Korrigiert: … mit deinen geänderten Werten“, obwohl nichts geändert war.
   Korrigiert nur bei geänderten Eingaben; neue Formulierung wird still übernommen. */
import { reviewChange, reviewInputSig } from '../../shared/coach/review';
describe('Auftrag 21: Bewertung nur nach geänderten Werten „korrigiert“', () => {
  const ctx = { state: { sessions: { s1: { completed: true, metrics: { min: '40', hr: '140' }, rpe: '4' } }, activities: {}, customWorkouts: {} } };
  test('gleiche Werte, neuer Text: still; geänderte Werte: Korrektur; alte Meldung ohne Fingerabdruck: still', () => {
    const sig = reviewInputSig(ctx, 's1');
    const old = { id: 'msg-review-s1', text: 'alter Text', inputSig: sig };
    expect(reviewChange(old, 'alter Text', sig)).toBe('same');
    expect(reviewChange(old, 'neuer Text nach Update', sig)).toBe('quiet');
    const changed = { state: { ...ctx.state, sessions: { s1: { ...ctx.state.sessions.s1, metrics: { min: '30', hr: '140' } } } } };
    expect(reviewChange(old, 'neuer Text', reviewInputSig(changed, 's1'))).toBe('corrected');
    expect(reviewChange({ id: 'msg-review-s1', text: 'Lauf (Di 27.10.): 40 min.\nalter Text' }, 'Lauf (Di 27.10.): 40 min.\nneuer Text nach Update', sig)).toBe('quiet');
    expect(reviewChange({ id: 'msg-review-s1', text: '100 m geschafft' }, 'Schwimmen (Di 27.10.): 30 min, 50 m.', sig)).toBe('corrected');
    expect(reviewChange(null, 'Text', sig)).toBe('corrected');
  });
});
