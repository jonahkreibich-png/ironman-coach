/* Auftrag 20, Punkt 2: kleine Plan-Korrekturen für alle Nutzer – Schwimm-Dauer realistisch, Lauf-Qualität in der Grundlage sichtbar
   (Steigerungen / Hügelsprints im Wechsel), Koppellauf kurz und etwa jede 3. Woche ab dem Aufbau, Teamsport mit viel Laufen zählt halb. */
import { describe, expect, test } from 'vitest';
import * as W from '../../shared/workouts';
import * as K from '../../shared/keysessions';
import * as C from '../../shared/core';
import { applyOnboarding } from '../../shared/onboarding';
import { minFreqOf, teamRunCredit, bigDay, RUN_TEAM_RE } from '../../shared/trainingrules';
import { defaultProfile, type Profile } from '../../shared/profile';
import { manyUsers20, MANY20_TODAY } from '../../fixtures/users20';

const ctx: W.PaceCtx = { runThrSec: 339, lthrRun: 170, css: null, breast100: 150, crawl100: 145, pool: 25, gear: ['board', 'buoy'], swimMPerMin: 16.1 };
// 1.200 m Kraul lernen mit kurzen schnellen Stücken (wie in Jonahs Plan)
const swim1200: W.Spec = { sport: 'swim', kind: 'swimlearn', ctx, stage: { ladder: 'swim', n: 3 }, steps: [
  { part: 'warm', m: 200, zone: 1, mode: 'breast' },
  { part: 'main', reps: 6, m: 25, zone: 1, mode: 'kick', restSec: 30, gear: ['board'] },
  { part: 'main', reps: 4, m: 25, zone: 1, mode: 'drill', restSec: 20, drill: 'catchup' },
  { part: 'main', reps: 2, m: 25, zone: 1, mode: 'drill', restSec: 20, drill: 'breath3' },
  { part: 'main', reps: 8, m: 25, zone: 3, mode: 'crawl', restSec: 45 },
  { part: 'main', reps: 4, m: 25, zone: 3, mode: 'pull', restSec: 30, gear: ['buoy'] },
  { part: 'main', reps: 2, m: 50, zone: 2, mode: 'crawl', restSec: 25 },
  { part: 'main', reps: 2, m: 100, zone: 2, mode: 'breast', restSec: 25 },
  { part: 'cool', m: 100, zone: 1, mode: 'breast' }] };

describe('Auftrag 20: Schwimm-Dauer realistisch', () => {
  test('1.200 m dauern mit eigenem Tempo und Pausen etwa 45-55 min (vorher 75 min)', () => {
    const S = W.swimSums(swim1200);
    expect(S.meters).toBe(1200);
    expect(S.min).toBeGreaterThanOrEqual(42);
    expect(S.min).toBeLessThanOrEqual(56);
    // die eigene Pace mit vielen Pausen verlängert die Pausen nur noch um höchstens ein Viertel plus 2 min
    const noRate = W.swimSums({ ...swim1200, ctx: { ...ctx, swimMPerMin: null } });
    expect(S.restMin).toBeLessThanOrEqual(noRate.restMin * 1.25 + 2.01);
  });
  test('ohne gemessenes Tempo: Standard wie bisher; mit Tempo von der Uhr kürzer', () => {
    const def = W.swimSums({ ...swim1200, ctx: { ...ctx, crawl100: null, breast100: 165 } });
    expect(W.swimSums(swim1200).swimMin).toBeLessThan(def.swimMin);
  });
  test('eigenes Tempo ohne Pausen aus den Einheiten (Median, ab 2 Einheiten)', () => {
    const today = '2026-10-24';
    const act = (id: string, d: string, pace: number) => ({ id, sport: 'swim', date: d, source: 'healthfit', sources: ['healthfit'], min: 40, km: 0.8, swim: { pace100: pace, poolLengthM: 25 } });
    const state: any = { sessions: {}, customWorkouts: {}, activities: { a: act('a', '2026-10-17', 143), b: act('b', '2026-10-20', 145), c: act('c', '2026-10-10', 160) } };
    expect(C.swimPace100(state, [], today)).toBe(145);
    expect(C.swimPace100({ ...state, activities: { a: state.activities.a } }, [], today)).toBeNull();
  });
});

describe('Auftrag 20: Lauf-Qualität in der Grundlage sichtbar', () => {
  const run = { runThrSec: 339, lthrRun: 170 } as W.PaceCtx;
  test('im Wechsel Steigerungen und Hügelsprints, klar benannt', () => {
    K.setLibEnv({ terrain: { hills: null } });
    const a = W.build(K.runStridesHills(run, 45, 0, 6)), b = W.build(K.runStridesHills(run, 45, 1, 6));
    expect(a.title).toMatch(/^Lockerer Lauf \d+ min mit Steigerungen$/);
    expect(b.title).toMatch(/^Lockerer Lauf \d+ min mit Hügelsprints$/);
    // Hügel unbekannt: Ersatz steht dabei
    expect(b.description).toMatch(/Steigerungen in der Ebene/);
    K.setLibEnv(null);
  });
  test('ohne Hügel: Lauf-ABC + Steigerungen statt Hügelsprints; Achillessehne: nur Steigerungen', () => {
    K.setLibEnv({ terrain: { hills: false } });
    expect(W.build(K.runStridesHills(run, 45, 1, 6)).title).toMatch(/Lauf-ABC/);
    K.setLibEnv({ terrain: { hills: true }, excludes: ['achilles'] });
    expect(W.build(K.runStridesHills(run, 45, 1, 6)).title).toMatch(/Steigerungen/);
    K.setLibEnv(null);
  });
  test('Hügelsprints nie in einem Lauf unter 30 min (sonst „locker“ mit Zone 3), dann Steigerungen', () => {
    const sp: W.Spec = { sport: 'run', kind: 'hills', ctx: run, steps: [{ part: 'warm', min: 5, zone: 1 }, { part: 'main', min: 5, zone: 2 }, { part: 'main', reps: 5, min: 0.25, zone: 3, restMin: 1 }, { part: 'cool', min: 5, zone: 1 }] };
    const b = W.build(sp);
    expect(b.title).toMatch(/mit Steigerungen/);
    expect(b.zone).toBe('Zone 2');
  });
});

describe('Auftrag 20: Koppellauf und großer Tag', () => {
  test('lange Ausfahrt plus Koppellauf ist immer ein großer Tag (Tag danach locker und kürzer)', () => {
    const d = { date: '2027-03-06', sessions: [{ sport: 'bike', title: 'Lange Ausfahrt 75 min', plannedMinutes: 75, long: true }, { sport: 'run', title: 'Koppellauf 10 min (direkt nach dem Rad)', plannedMinutes: 10 }] };
    expect(bigDay(d).big).toBe(true);
  });
  test('Triathlon-Nutzer: Koppellauf 10-15 min, höchstens einer in 3 Wochen, nie in Grundlage/Erholung, Tag danach ohne langen oder harten Lauf', () => {
    const tri = manyUsers20().filter(u => /tri-/.test(u.id)).slice(0, 6);
    let n = 0;
    for (const u of tri) {
      const r = applyOnboarding(u.answers, MANY20_TODAY); if (!r.gen) continue;
      const weeks = r.gen.plan.weeks; const D = C.planDays(weeks);
      const bw: number[] = [];
      weeks.forEach((w: any, i: number) => w.days.forEach((d: any) => d.sessions.filter((s: any) => /^Koppellauf/.test(s.title || '') && !/Generalprobe/.test(s.title || '') && !s.cancelled).forEach((s: any) => {
        n++; bw.push(i);
        expect(s.plannedMinutes, `${u.id} ${d.date}`).toBeLessThanOrEqual(15);
        expect(w.phase === 'base' || w.isRecoveryWeek, `${u.id} ${d.date}`).toBe(false);
        const nx = D.find((x: any) => x.date === C.addDays(d.date, 1));
        if (nx) for (const y of nx.sessions.filter((z: any) => z.sport === 'run' && !z.race)) expect(!!y.hard || /^Langer Lauf/.test(y.title || ''), `${u.id} ${nx.date} ${y.title}`).toBe(false);
      })));
      for (let k = 1; k < bw.length; k++) expect(bw[k] - bw[k - 1], u.id).toBeGreaterThanOrEqual(2);
    }
    expect(n).toBeGreaterThan(0);
  });
});

describe('Auftrag 20: Teamsport mit viel Laufen zählt halb', () => {
  const base = (team: string, days: number[]): Profile => ({ ...defaultProfile(), sports: ['run', 'swim', 'bike'] as any, weeklyHours: 8, teamSport: { name: team, trainingDays: days.slice(0, 1), trainingMinutes: 90, gameDays: days.slice(1), gameMinutes: 90, seasonFrom: null, seasonTo: null } as any });
  const w = { startDate: '2026-11-02', cycleGoalType: 'run_half' };
  test('Fußball, Handball, Basketball zählen; Volleyball nicht', () => {
    expect(RUN_TEAM_RE.test('Fußball') && RUN_TEAM_RE.test('Handball') && RUN_TEAM_RE.test('Basketball') && RUN_TEAM_RE.test('Hockey')).toBe(true);
    expect(RUN_TEAM_RE.test('Volleyball')).toBe(false);
    expect(teamRunCredit(w, base('Fußball', [1, 5]))).toBe(1);
    expect(teamRunCredit(w, base('Fußball', [1]))).toBe(0.5);
    expect(teamRunCredit(w, base('Volleyball', [1, 5]))).toBe(0);
  });
  test('vor einem Laufziel: 2 Fußball-Termine ersetzen den dritten Lauf, mindestens 2 eigene Läufe bleiben', () => {
    expect((minFreqOf(w, base('Fußball', [1, 5]), [], {}) as any).run).toBe(2);
    expect((minFreqOf(w, { ...base('Fußball', [1, 5]), teamSport: null }, [], {}) as any).run).toBe(3);
    expect((minFreqOf(w, base('Fußball', [1]), [], {}) as any).run).toBe(2.5);
  });
  test('Triathlon: mit 2 Fußball-Terminen reicht 1 eigener Lauf; beim Wegnehmen für den Ruhetag zählt der Fußball nicht', () => {
    const t = { startDate: '2026-11-02', cycleGoalType: 'tri_olympic' };
    expect((minFreqOf(t, base('Fußball', [1, 5]), [], {}) as any).run).toBe(1);
    expect((minFreqOf(t, base('Fußball', [1, 5]), [], {}, true) as any).run).toBe(2);
  });
});
