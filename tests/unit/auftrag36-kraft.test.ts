/* Auftrag 36, Punkt 2: Kraft-Score aus den eingetragenen Übungen (nicht nur Regelmäßigkeit) und „Wie letztes Mal“. */
import { describe, expect, test } from 'vitest';
import { exerciseCats, repsOf, epley, exerciseLoad, lastStrengthExercises } from '../../shared/strength';
import { sportScores, STRENGTH_NO_EX_HINT } from '../../shared/scores';
import { defaultProfile } from '../../shared/profile';
import { addDays } from '../../shared/core';

const today = '2026-11-16';
const prof = (birthYear = 1990) => ({ ...defaultProfile(), birthYear, weightKg: 75, sports: ['strength', 'run'], weeklyHours: 6 } as any);
const act = (date: string, exercises: any[] | null, min = 40) => ({ id: 'k' + date, sport: 'strength', date, min, source: 'manual', name: 'Kraft', ...(exercises ? { exercises } : {}) } as any);
const score = (acts: any[], p = prof()) => sportScores({ today, activities: acts, trend: [], illness: [], profile: p, goal: null } as any, ['strength'])[0];
const FULL = (kg: number) => [
  { name: 'Kniebeuge', sets: 3, reps: '8', kg }, { name: 'Ausfallschritt', sets: 3, reps: '10/Seite', kg: 10 }, { name: 'Unterarmstütz', sets: 3, reps: '45 s', kg: null },
  { name: 'Rudern am Band', sets: 3, reps: '12', kg: null }, { name: 'Liegestütz', sets: 3, reps: '10', kg: null }
];

describe('Auftrag 36: Kraft auswerten', () => {
  test('Übungen den Triathlon-Bereichen zuordnen, Wiederholungen und Haltezeiten lesen, Epley', () => {
    expect(exerciseCats('Bulgarian Split Squat')).toEqual(expect.arrayContaining(['single', 'legs']));
    expect(exerciseCats('Klimmzug')).toEqual(['pull']);
    expect(exerciseCats('Beinpresse')).toEqual(['legs']);
    expect(exerciseCats('Pallof Press')).toEqual(['core']);
    expect(repsOf('8-10')).toEqual({ reps: 9, holdSec: null });
    expect(repsOf('45 s')).toEqual({ reps: null, holdSec: 45 });
    expect(repsOf('1 min')).toEqual({ reps: null, holdSec: 60 });
    expect(repsOf('3×12')).toEqual({ reps: 12, holdSec: null });
    expect(Math.round(epley(100, 5))).toBe(117);
    // Körpergewicht zählt bei Übungen ohne Zusatzgewicht (Liegestütz ≈ 65 %)
    expect(Math.round(exerciseLoad({ name: 'Liegestütz', sets: 3, reps: '10' }, 80)!.e1rmKg!)).toBe(Math.round(epley(52, 10)));
    // unter 18: kein Maximalwert aus schweren Sätzen (unter 6 Wiederholungen)
    expect(exerciseLoad({ name: 'Kniebeuge', sets: 3, reps: '3', kg: 60 }, 60, true)!.e1rmKg).toBeNull();
    expect(exerciseLoad({ name: 'Kniebeuge', sets: 3, reps: '3', kg: 60 }, 60, false)!.e1rmKg).toBeGreaterThan(60);
  });

  test('ohne Übungen: ehrlich „nur Regelmäßigkeit bekannt“ mit Hinweis', () => {
    const acts = [0, 3, 7, 10, 14, 17, 21, 24].map(d => act(addDays(today, -d), null));
    const s = score(acts);
    expect(s.parts.map(p => p.key)).toEqual(['reg']);
    expect(s.why[0]).toBe(STRENGTH_NO_EX_HINT);
  });

  test('mit Übungen: Umfang, Abdeckung, Steigerung, Dauer; Steigerung und volle Abdeckung heben den Score', () => {
    const days = [0, 3, 7, 10, 14, 17, 21, 24, 28, 31, 35, 38, 42, 45, 49, 52];
    const rising = days.map(d => act(addDays(today, -d), FULL(40 + (52 - d) / 1.5)));
    const flat = days.map(d => act(addDays(today, -d), FULL(40)));
    const partial = days.map(d => act(addDays(today, -d), [{ name: 'Kniebeuge', sets: 3, reps: '8', kg: 40 }]));
    const r = score(rising), f = score(flat), p = score(partial);
    expect(r.parts.map(x => x.key)).toEqual(['reg', 'vol', 'cover', 'prog', 'dur']);
    expect(r.parts.find(x => x.key === 'cover')!.value).toBe('5 von 5 Bereichen');
    expect(p.parts.find(x => x.key === 'cover')!.value).toMatch(/^1 von 5 Bereichen \(fehlt: einbeinig\/Stabilität, Rumpf, Oberkörper Zug, Oberkörper Druck\)$/);
    expect(r.parts.find(x => x.key === 'prog')!.raw).toBeGreaterThan(0.01);
    expect(r.parts.find(x => x.key === 'prog')!.value).toMatch(/Körpergewicht/);
    expect(Math.abs(f.parts.find(x => x.key === 'prog')!.raw!)).toBeLessThan(0.01);
    expect(r.score).toBeGreaterThan(f.score);
    expect(f.score).toBeGreaterThan(p.score);
    // Pause: Regelmäßigkeit und Dauer sinken, der Score fällt
    const paused = days.filter(d => d >= 28).map(d => act(addDays(today, -d), FULL(40)));
    expect(score(paused).score).toBeLessThan(f.score);
  });

  test('„Wie letztes Mal“: Übungen und Gewichte der letzten Krafteinheit mit Übungen, nie die eigene', () => {
    const list = [
      { date: '2026-11-10', id: 'a', exercises: [{ name: 'Kniebeuge', sets: 3, reps: '8', kg: 45 }] },
      { date: '2026-11-13', id: 'b', exercises: [] },
      { date: '2026-11-14', id: 'c', exercises: [{ name: 'Rudern', sets: 3, reps: '12', kg: 20, restSec: 60 }] },
      { date: '2026-11-16', id: 'today', exercises: [{ name: 'heute', sets: 1, reps: '1', kg: 1 }] }
    ];
    expect(lastStrengthExercises(list, '2026-11-16', 'today')).toEqual({ date: '2026-11-14', exercises: [{ name: 'Rudern', sets: 3, reps: '12', kg: 20, restSec: 60 }] });
    expect(lastStrengthExercises(list.slice(1, 2), '2026-11-16', 'x')).toBeNull();
  });
});
