import { describe, expect, test } from 'vitest';
import { sportScores, estimatesAt, legacyActivities } from '../../shared/scores';
import { defaultProfile } from '../../shared/profile';
import { addDays } from '../../shared/core';
import type { Activity } from '../../shared/activity/analyze';

const today = '2026-10-20';
const profile = { ...defaultProfile(), birthYear: 2000, thresholds: { ...defaultProfile().thresholds, lthrRun: 170, thresholdPaceRunSec: 300 } };
const base = { today, profile, goal: null, illness: [], trend: [] };
function run(id: string, days: number, extra: Partial<Activity> = {}): Activity {
  return { id, sport: 'run', date: addDays(today, -days), source: 'healthfit', sources: ['healthfit'], min: 45,
    avgHr: 170, speedKmh: 12, km: 9, laps: [], indoor: false, ...extra } as Activity;
}
const score = (activities: Activity[], at = today) => sportScores({ ...base, today: at, activities }, ['run'])[0];

describe('Qualität der Fitness-Schätzung', () => {
  test('ein Training bekommt unabhängig von der Anzahl identischer Runden eine Stimme', () => {
    const normal = [2, 4, 6].map(d => run('normal' + d, d));
    const lap = { kind: 'work', sec: 300, speed: 5, avgHr: 170 };
    const one = run('interval', 1, { avgHr: null, speedKmh: null, laps: [lap] as any });
    const repeated = { ...one, laps: Array(40).fill(lap) };
    expect(score([...normal, repeated]).parts[0].raw).toBe(score([...normal, one]).parts[0].raw);
  });
  test('ein alter langer Lauf verschwindet an einem Ruhetag nicht aus der Fähigkeit; lange Pause: langsamer Formverlust (Auftrag 19)', () => {
    const activities = [run('long', 41, { min: 120, avgHr: 140 }), run('recent', 2, { avgHr: 140 })];
    expect(score(activities, addDays(today, 2)).score).toBe(score(activities).score);
    // 32 Tage ohne Lauf: etwas weniger, aber kein Absturz; der lange Lauf zählt weiter
    const later = score(activities, addDays(today, 30));
    expect(later.score).toBeLessThan(score(activities).score);
    expect(later.score).toBeGreaterThanOrEqual(score(activities).score - 5);
    expect(later.parts.find(p => p.key === 'long')!.raw).toBe(120);
    expect(score(activities, addDays(today, 30)).confidence).toBeLessThan(score(activities).confidence);
  });
  test('fehlende Schwimmstrecke ist unbekannt und kein Nullpunkt', () => {
    const [s] = sportScores({ ...base, activities: [] }, ['swim']);
    expect(s.parts.find(p => p.key === 'cont')!.sub).toBeNull();
  });
  test('Einheiten ohne verwertbare Leistungsdaten erhöhen die Sicherheit nicht', () => {
    const valid = [run('valid', 2)];
    const empty = [1, 3, 4, 5, 6, 7].map(d => run('empty' + d, d, { avgHr: null, speedKmh: null, min: 10 }));
    expect(score([...valid, ...empty]).confidence).toBe(score(valid).confidence);
  });
  test('bekannt später aktualisierte Profil-Schwellen fließen nicht in historische Schätzungen ein', () => {
    const future = { ...profile, thresholds: { ...profile.thresholds, thresholdPaceRunSec: 200, trendAt: today } };
    expect(estimatesAt({ ...base, profile: future, activities: [] }, addDays(today, -10)).runThrSpeed).toBeNull();
  });
  test('ein schlechter oder besserer Profilwert überstimmt neue gemessene Läufe nicht', () => {
    const activities = [run('a', 1, { speedKmh: 15 })];
    const result = estimatesAt({ ...base, activities }, today);
    expect(result.runThrSpeed).toBeCloseTo(15 / 3.6);
  });
  test('gleiche Pulstempo-Daten zählen nicht nochmals als eigener Fitness-Anteil', () => {
    const s = score([run('easy', 1, { avgHr: 140 })]);
    expect(s.parts.find(p => p.key === 'eff')!.weight).toBe(0);
  });
  test('unendliche Dauer kann kein Ausdauer-Rekord werden', () => {
    const s = score([run('valid', 1, { avgHr: 140 }), run('broken', 0, { min: Infinity, avgHr: 140 })]);
    expect(Number.isFinite(s.score)).toBe(true);
    expect(Number.isFinite(s.parts.find(p => p.key === 'long')!.raw)).toBe(true);
  });
  test('geplante Kraftvorlagen zählen vor dem Erledigen nicht als Training', () => {
    const activities = legacyActivities({ customWorkouts: { [today]: [
      { id: 'draft', sport: 'strength', completed: false, plannedMinutes: 30 },
      { id: 'done', sport: 'strength', completed: true, plannedMinutes: 30 },
      { id: 'old', sport: 'strength', plannedMinutes: 30 }
    ] } }, [], profile);
    expect(activities.map(a => a.id)).toEqual(['sess-done', 'sess-old']);
  });
});
