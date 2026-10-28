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


test('aktive eigene Trainingsänderungen bleiben bei neuer Schwimmstufe erhalten',()=>{
 const profile={skills:{swimCrawlM:25,swimCrawl:'some',swimBreast:true}};
 const session=(id:string)=>({...W.build(W.swimLearn({}, {ladder:'swim',n:2})),id,sport:'swim'});
 const weeks=[{days:[{date:'2026-10-21',sessions:[session('manual'),session('undone'),session('ordinary')]}]}];
 const adjustments={own:{id:'own',type:'modify',sessionId:'manual',from_user:true,set:{description:'Meine eigene Technikübung'}},old:{id:'old',type:'modify',sessionId:'undone',from_user:true,undone:true,set:{description:'Zurückgenommen'}}};
 const update=swimSkillUpdate(profile,weeks,adjustments,today,{crawl:100,authoritative:true});
 expect(update?.skills.swimCrawlM).toBe(100);
 expect(update?.adjustments.map(a=>a.sessionId)).toEqual(['undone','ordinary']);
 const explicit=swimSkillUpdate(profile,weeks,adjustments,today,{crawl:100});
 expect(explicit?.skills.swimCrawlM).toBe(100);
 expect(explicit?.adjustments.map(a=>a.sessionId)).toEqual(['undone','ordinary']);
});

/* Auftrag 21: Am 27.10. „längste Strecke mit Pull Buoy“ = 100 m eingetragen, der Coach meldete „Bestätigt: 100 m Kraul am Stück, 50 m mit
   Pull Buoy“ und erwähnte die 100 m Pull Buoy nicht. Ursache: Kraul (eigene Angabe, blieb für immer stehen) und Pull Buoy (nur 2 Einheiten)
   liefen über verschiedene Regeln, und „Bestätigt“ stand auch ohne Nachweis da. Jetzt: ein Weg, gleiche Regel, Bestwert wird gemeldet. */
import { swimBests } from '../../shared/swimskill';
describe('Auftrag 21: Kraul und Pull Buoy über denselben Weg', () => {
  const day = '2026-10-27';
  const mk = (dates: [string, number, number][]) => {
    const sessions: any = {}; const days: any[] = [];
    dates.forEach(([date, crawl, pull], i) => { sessions['s' + i] = { completed: true, metrics: { longestCrawl: String(crawl), longestPull: String(pull) }, metricsManual: { longestPull: true } }; days.push({ date, sessions: [{ id: 's' + i, sport: 'swim', title: 'Schwimmen' }] }); });
    return { state: { sessions, customWorkouts: {}, activities: {} }, weeks: [{ days }] };
  };
  const hist = mk([['2026-10-17', 50, 50], ['2026-10-20', 50, 50], ['2026-10-24', 50, 50], ['2026-10-27', 100, 100]]);
  const own = { skills: { swimCrawl: 'some', swimCrawlM: 100, swimPullM: 50, swimBreast: true, swimEvidence: { crawl: { value: 100, baseline: 100, manual: true }, mode: { value: 'some', baseline: 'some', manual: true } } } };
  test('neue 100 m mit Pull Buoy werden gemeldet; Kraul und Pull Buoy mit derselben Begründung', () => {
    const b = swimBests(hist.state, hist.weeks, day);
    expect(b).toMatchObject({ best: 100, bestPull: 100, crawl: 50, pull: 50, bestPullDate: '2026-10-27' });
    const u = swimSkillUpdate(own, hist.weeks, {}, day, b, 1)!;
    expect(u.silent).toBeUndefined();
    expect(u.text).not.toMatch(/^Bestätigt/);
    expect(u.text).toMatch(/Kraul am Stück: 100 m \(deine Angabe, in einer Einheit bestätigt\)/);
    expect(u.text).toMatch(/Pull Buoy am Stück: 50 m \(in 2 Einheiten geschafft\); am 27\.10\. 100 m geschafft \(Bestwert\)/);
    // dieselbe Meldung nur einmal: gleiche Kennung bei jedem Lauf (App und Server), danach nichts mehr
    expect(swimSkillUpdate(own, hist.weeks, {}, day, b, 999)!.key).toBe(u.key);
    expect(swimSkillUpdate(apply(own, u), hist.weeks, {}, day, b, 2)).toBeNull();
  });
  test('zweite Einheit mit 100 m Pull Buoy: übernommen, genau wie beim Kraul', () => {
    const two = mk([['2026-10-17', 50, 50], ['2026-10-20', 50, 50], ['2026-10-27', 100, 100], ['2026-10-31', 100, 100]]);
    const b = swimBests(two.state, two.weeks, '2026-10-31');
    const u = swimSkillUpdate(own, two.weeks, {}, '2026-10-31', b, 1)!;
    expect(u.skills.swimPullM).toBe(100);
    expect(u.text).toMatch(/Neu bestätigt: 100 m mit Pull Buoy am Stück|Pull Buoy am Stück: 100 m/);
  });
  test('eigene Angabe bleibt nicht für immer stehen: spätere Einheiten belegen mehr', () => {
    const p = { skills: { swimCrawl: 'some', swimCrawlM: 100, swimEvidence: { crawl: { value: 100, baseline: 100, manual: true, at: '2026-10-01' } } } };
    const later = mk([['2026-10-10', 200, 0], ['2026-10-20', 200, 0]]);
    const u = swimSkillUpdate(p, later.weeks, {}, day, swimBests(later.state, later.weeks, day), 1)!;
    expect(u.skills.swimCrawlM).toBe(200);
    // Pull Buoy genauso
    const pp = { skills: { swimPullM: 100, swimEvidence: { pull: { value: 100, baseline: 100, manual: true, at: '2026-10-01' } } } };
    const lp = mk([['2026-10-10', 0, 200], ['2026-10-20', 0, 200]]);
    expect(swimSkillUpdate(pp, lp.weeks, {}, day, swimBests(lp.state, lp.weeks, day), 1)!.skills.swimPullM).toBe(200);
  });
});
