import { describe, expect, test } from 'vitest';
import { legacySwimReview, swimSkillUpdate } from '../../shared/swimskill';
import * as W from '../../shared/workouts';

const today = '2026-10-20';
const scan = (profile: any, crawl: number, pull = 0) => swimSkillUpdate(profile, [], {}, today, { crawl, pull, authoritative: true });
const apply = (profile: any, update: any) => ({ ...profile, skills: { ...profile.skills, ...update?.skills } });

describe('Korrigierte Schwimmnachweise', () => {
  test('abgeleitete 100 m werden bei korrigiertem Ergebnis zu 50 m', () => {
    const first = apply({ skills: { swimBreast: true } }, scan({ skills: { swimBreast: true } }, 100));
    const corrected = scan(first, 50);
    expect(corrected?.skills.swimCrawlM).toBe(50);
    expect(corrected?.stage).toEqual({ ladder: 'swim', n: 3 });
    expect(scan(apply(first, corrected), 50)).toBeNull();
  });

  test('geloeschte Nachweise entfernen die abgeleitete Behauptung', () => {
    const initial = { skills: { swimCrawl: 'no', swimBreast: true } };
    const derived = apply(initial, scan(initial, 200, 100));
    const removed = scan(derived, 0);
    expect(removed?.skills.swimCrawlM).toBeNull();
    expect(removed?.skills.swimPullM).toBeNull();
    expect(removed?.skills.swimCrawl).toBe('no');
    expect(removed?.stage).toEqual({ ladder: 'swimBreast', n: 0 });
    expect(scan(apply(derived, removed), 0)).toBeNull();
  });

  test('verbleibender echter 100-m-Nachweis haelt die 100 m', () => {
    const initial = { skills: { swimCrawlM: 25, swimCrawl: 'some' } };
    const derived = apply(initial, scan(initial, 100));
    expect(scan(derived, 100)).toBeNull();
    expect(scan(derived, 50)?.skills.swimCrawlM).toBe(50);
  });

  test('urspruengliche eigene Angabe bleibt nach Loeschung erhalten', () => {
    const initial = { skills: { swimCrawlM: 50, swimCrawl: 'some' } };
    const derived = apply(initial, scan(initial, 100));
    expect(scan(derived, 0)?.skills.swimCrawlM).toBe(50);
  });

  test('manuelle Profilkorrektur bleibt auch bei wiederholtem Scan geschuetzt', () => {
    const initial = { skills: { swimCrawlM: 25, swimCrawl: 'some' } };
    const derived = apply(initial, scan(initial, 100));
    const manuallyCorrected = { ...derived, skills: { ...derived.skills, swimCrawlM: 50 } };
    const reconciled = scan(manuallyCorrected, 100);
    expect(reconciled?.skills.swimCrawlM).toBe(50);
    expect(scan(apply(manuallyCorrected, reconciled), 100)).toBeNull();
    expect(scan(apply(manuallyCorrected, reconciled), 0)).toBeNull();
  });

  test('direkte Coachangabe wird durch spaetere leere Scans nicht entfernt', () => {
    const initial = { skills: { swimCrawlM: 25, swimCrawl: 'some' } };
    const derived = apply(initial, scan(initial, 100));
    const reported = swimSkillUpdate(derived, [], {}, today, { crawl: 200 });
    expect(reported?.skills.swimCrawlM).toBe(200);
    expect(scan(apply(derived, reported), 0)).toBeNull();
    expect(swimSkillUpdate(apply(derived, reported), [], {}, today, { crawl: 50 })).toBeNull();
  });

  test('Korrektur erstellt sichere Vorschlaege fuer kuenftige Lern- und normale Einheiten', () => {
    const initial = { skills: { swimCrawlM: 25, swimCrawl: 'some', swimBreast: true } };
    const derived = apply(initial, scan(initial, 200));
    const learner = { ...W.build(W.swimLearn({}, { ladder: 'swim', n: 4 })), id: 'learn' };
    const normal = { ...W.build(W.swimNormal({}, 'endurance', 40, 'base', 200)), id: 'normal' };
    const weeks = [{ days: [{ date: '2026-10-21', sessions: [learner, normal] }, { date: today, sessions: [{ ...learner, id: 'past' }] }] }];
    const corrected = swimSkillUpdate(derived, weeks, {}, today, { crawl: 50, pull: 0, authoritative: true });
    expect(corrected?.adjustments.map(a => a.sessionId)).toEqual(['learn', 'normal']);
    for (const a of corrected!.adjustments) {
      expect(a.set.stage.n).toBe(3);
      for (const s of a.set.spec.steps.filter((s: any) => s.mode === 'crawl')) expect(s.m).toBeLessThanOrEqual(50);
    }
    expect(learner.stage?.n).toBe(4);
    expect(normal.stage).toBeUndefined();
  });

  test('Pull-Korrektur und manuelle Kraul-Angabe werden getrennt behandelt', () => {
    const initial = { skills: { swimCrawlM: 50, swimCrawl: 'some' } };
    const derived = apply(initial, scan(initial, 100, 200));
    derived.skills.swimCrawlM = 75;
    const corrected = scan(derived, 25, 50);
    expect(corrected?.skills.swimCrawlM).toBe(75);
    expect(corrected?.skills.swimPullM).toBe(50);
  });

  test('neue Vorschlaege verwenden aktuelles Material und Becken statt altem Einheit-Kontext', () => {
    const initial = { skills: { swimCrawlM: 25, swimCrawl: 'some', swimBreast: true, swimGear: [], poolM: 25 } };
    const derived = apply(initial, scan(initial, 100));
    const stale = { ...W.build(W.swimLearn({ gear: ['board', 'buoy'], pool: 50 }, { ladder: 'swim', n: 4, pull: 100 })), id: 'stale' };
    const weeks = [{ days: [{ date: '2026-10-21', sessions: [stale] }] }];
    const corrected = swimSkillUpdate(derived, weeks, {}, today, { crawl: 50, authoritative: true });
    const suggestion = corrected!.adjustments[0].set;
    expect(suggestion.spec.ctx.gear).toEqual([]);
    expect(suggestion.spec.ctx.pool).toBe(25);
    expect(suggestion.description).not.toMatch(/Kickbrett|Pull Buoy/);
    expect(suggestion.spec.steps.every((s: any) => !s.gear?.length)).toBe(true);
  });

  test('unklare alte 100 m werden nur als pruefbarer 50-m-Vorschlag angeboten', () => {
    const legacy = { skills: { swimCrawlM: 100, swimCrawl: 'some', swimBreast: true, swimGear: [], poolM: 25 } };
    const unit = { ...W.build(W.swimLearn({ gear: ['board', 'buoy'] }, { ladder: 'swim', n: 4 })), id: 'legacy' };
    const weeks = [{ days: [{ date: '2026-10-21', sessions: [unit] }] }];
    const before = JSON.stringify({ legacy, weeks });
    expect(swimSkillUpdate(legacy, weeks, {}, today, { crawl: 50, authoritative: true })).toBeNull();
    const review = legacySwimReview(legacy, weeks, {}, today, { crawl: 50, authoritative: true });
    expect(review?.reviewOnly).toBe(true);
    expect(review?.skills.swimCrawlM).toBe(50);
    expect(review?.adjustments[0].set.stage.n).toBe(3);
    expect(review?.text).toMatch(/prüfen/i);
    expect(review?.adjustments[0].set.description).not.toMatch(/Kickbrett|Pull Buoy/);
    expect(JSON.stringify({ legacy, weeks })).toBe(before);
  });

  test('Legacy-Pruefung erfindet bei leeren Ergebnissen oder eigenen neueren Angaben keine Korrektur', () => {
    const legacy = { skills: { swimCrawlM: 100, swimCrawl: 'some' } };
    expect(legacySwimReview(legacy, [], {}, today, { crawl: 0, authoritative: true })).toBeNull();
    expect(legacySwimReview(legacy, [], {}, today, { crawl: 100, authoritative: true })).toBeNull();
    const explicit = apply(legacy, swimSkillUpdate(legacy, [], {}, today, { crawl: 200 }));
    expect(legacySwimReview(explicit, [], {}, today, { crawl: 50, authoritative: true })).toBeNull();
    expect(scan(explicit, 50)).toBeNull();
  });
});
