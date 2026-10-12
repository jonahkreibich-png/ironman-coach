/* Auftrag 5 A1/A4: Regel-Modell und Plan. Harte Regeln werden nie verletzt, weiche möglichst eingehalten (mit Erklärung),
   unmögliche Wünsche führen zu einem klaren Hinweis mit Lösungen, Wochenraster und Regeln passen zusammen. */
import { test, expect, describe } from 'vitest';
import { PERSONAS, PERSONA_TODAY as today } from '../../fixtures/personas';
import { applyOnboarding } from '../../shared/onboarding';
import { generatePlan } from '../../shared/plangen';
import { hardViolations, rulesOf, cellOf, setCell, evaluate, describe as say, dayLimit, type Rule } from '../../shared/constraints';
import { parseFor, parseRules } from '../../shared/ruleparse';
import { defaultProfile } from '../../shared/profile';

const dow = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
const sessions = (weeks: any[]) => weeks.flatMap((w: any) => w.days.flatMap((d: any) => d.sessions.filter((s: any) => s.sport !== 'rest' && !s.race).map((s: any) => ({ ...s, date: d.date }))));

describe('Keine harte Regel verletzt: alle Test-Personen, 16 Wochen', () => {
  test.each(PERSONAS.map(p => [p.id, p] as const))('%s', (_id, p) => {
    const r = applyOnboarding(p.answers, today);
    const rules = rulesOf(r.profile, parseFor(today));
    expect(hardViolations(r.gen!.plan.weeks.slice(0, 16), rules)).toEqual([]);
  });
});

test('Vater-Profil: 3 Läufe gewünscht, nur Sa/So erlaubt → klarer Hinweis mit zwei Lösungen, Plan hat 2 Läufe', () => {
  const p = PERSONAS.find(x => x.id === 'vater-regeln')!;
  const r = applyOnboarding(p.answers, today);
  const c = r.gen!.conflicts.find(x => x.sport === 'run')!;
  expect(c).toBeTruthy();
  expect(c.text).toBe('Du möchtest 3× Laufen pro Woche, deine Regeln erlauben Laufen nur Sa und So. Der Plan plant deshalb 2× ein.');
  expect(c.options.map(o => o.id)).toEqual(['fewer', 'allow']);
  expect(c.options[0].label).toBe('2 Läufe am Wochenende, dafür einer länger');
  // nie Mittwoch (ausdrücklich verboten) und nie Dienstag (ganz frei) als Vorschlag
  expect([3, 2]).not.toContain(c.options[1].day);
  expect(c.options[1].label).toMatch(/^Laufen auch am \w+ erlauben\?$/);
  const w1 = r.gen!.plan.weeks[0];
  expect(sessions([w1]).filter((s: any) => s.sport === 'run').length).toBe(2);
  // der Hinweis steht auch in der Plan-Erklärung
  expect(r.gen!.plan.meta.explain.join(' ')).toContain('deine Regeln erlauben Laufen nur Sa und So');
});

test('Lösung „Laufen auch am Montag erlauben“ wirkt: Regel wird erweitert, Konflikt verschwindet', () => {
  const p = PERSONAS.find(x => x.id === 'vater-regeln')!;
  const r = applyOnboarding(p.answers, today);
  let rules: Rule[] = rulesOf(r.profile, parseFor(today)).map(x => ({ ...x, source: 'text' as const }));
  const day = r.gen!.conflicts[0].options[1].day!;
  rules = setCell(rules, 'run', day, 'yes');
  const g = generatePlan({ profile: r.profile, goals: r.goals, today, rules });
  expect(g.conflicts.filter(c => c.sport === 'run')).toEqual([]);
  expect(hardViolations(g.plan.weeks.slice(0, 8), rules)).toEqual([]);
  expect(sessions(g.plan.weeks.slice(0, 1)).filter((s: any) => s.sport === 'run').map((s: any) => dow(s.date)).sort()).toEqual([0, day, 6].sort());
});

test('Weiche Regel: langer Lauf lieber sonntags; ist Sonntag ein Rennen, ausnahmsweise ein anderer Tag mit Erklärung', () => {
  const profile = { ...defaultProfile(), birthYear: 1990, sports: ['run'] as any, weeklyHours: 5, dayLoad: { 0: 3, 1: 1, 2: 2, 3: 1, 4: 2, 5: 0, 6: 3 } as any, freq: { run: [3, 3] } as any, notes: ['langer Lauf lieber sonntags'] };
  const goals = [{ id: 'hm', type: 'run_half', name: 'Halbmarathon', date: '2027-03-21', priority: 'A' }, { id: '10k', type: 'run_10k', name: 'Stadtlauf', date: '2026-11-15', priority: 'C' }] as any;
  const g = generatePlan({ profile: profile as any, goals, today });
  const longs = sessions(g.plan.weeks.slice(0, 6)).filter((s: any) => /Langer Lauf/.test(s.title));
  expect(longs.length).toBeGreaterThan(2);
  for (const l of longs) {
    // Rennwoche (Rennen So 15.11.): nicht am Vortag, sondern früher in der Woche, mit Begründung
    if (l.date >= '2026-11-09' && l.date <= '2026-11-15') { expect(l.ruleNote).toMatch(/^Langer Lauf ausnahmsweise am (Montag|Dienstag|Mittwoch|Donnerstag|Freitag), weil Sonntag dein Rennen ist.$/); expect(l.description).toContain('Ausnahme: Langer Lauf ausnahmsweise'); }
    else { expect(dow(l.date)).toBe(0); expect(l.ruleNote).toBeUndefined(); }
  }
  expect(longs.some((l: any) => l.date >= '2026-11-09' && l.date <= '2026-11-15')).toBe(true);
});

test('Urlaub: im Zeitraum kein Training, Prüfungszeit nur kurz und locker', () => {
  const profile = { ...defaultProfile(), birthYear: 1990, sports: ['run', 'bike'] as any, weeklyHours: 6, dayLoad: { 0: 3, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 3 } as any, notes: ['Urlaub vom 2.11. bis 8.11.', 'vom 16.11. bis 22.11. Prüfungen, wenig Zeit'] };
  const g = generatePlan({ profile: profile as any, goals: [{ id: 'm', type: 'run_10k', name: '10 km', date: '2027-02-28', priority: 'A' }] as any, today });
  const all = sessions(g.plan.weeks.slice(0, 6));
  expect(all.filter((s: any) => s.date >= '2026-11-02' && s.date <= '2026-11-08')).toEqual([]);
  const exam = all.filter((s: any) => s.date >= '2026-11-16' && s.date <= '2026-11-22');
  expect(exam.length).toBeGreaterThan(0);
  exam.forEach((s: any) => { expect(s.plannedMinutes).toBeLessThanOrEqual(40); expect(!!s.hard).toBe(false); });
});

test('Höchstdauer: Mo-Fr höchstens 45 min wird eingehalten', () => {
  const profile = { ...defaultProfile(), birthYear: 1985, sports: ['run', 'bike', 'swim'] as any, weeklyHours: 8, maxDayHours: 3, dayLoad: { 0: 3, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 3 } as any, skills: { swimCrawl: 'yes', swimCrawlM: 1500 }, notes: ['Mo-Fr höchstens 45 min'] };
  const g = generatePlan({ profile: profile as any, goals: [{ id: 'o', type: 'tri_olympic', name: 'OD', date: '2027-06-27', priority: 'A' }] as any, today });
  for (const w of g.plan.weeks.slice(0, 8)) for (const d of w.days) {
    if ([1, 2, 3, 4, 5].includes(dow(d.date))) expect(d.sessions.reduce((a: number, s: any) => a + (s.plannedMinutes || 0), 0), d.date).toBeLessThanOrEqual(45);
  }
});

test('Knie: keine Lauf-Intervalle im Plan, Tipp gegen Bergablaufen', () => {
  const p = PERSONAS.find(x => x.id === 'vater-rad-lauf')!; // „Knie links zwickt beim Bergablaufen“
  const r = applyOnboarding(p.answers, today);
  const runs = sessions(r.gen!.plan.weeks.slice(0, 12)).filter((s: any) => s.sport === 'run');
  expect(runs.some((s: any) => /intervall|tempo|schwelle/i.test(s.title))).toBe(false);
  expect(runs.some((s: any) => /bergab/i.test(s.description || ''))).toBe(true);
});

describe('Wochenraster', () => {
  const rules = parseRules('kann mittwochs nicht laufen, nur Samstag oder Sonntag', today).rules;
  test('Zellen aus den Regeln', () => {
    expect(cellOf(rules, 'run', 3).state).toBe('no');
    expect(cellOf(rules, 'run', 1).state).toBe('no');
    expect(cellOf(rules, 'run', 6).state).toBe('yes');
    expect(cellOf(rules, 'bike', 3).state).toBe('yes');
    // kein Training an Tagen ohne Zeit
    expect(cellOf([], 'bike', 5, { 5: 0, 6: 2 }).state).toBe('no');
  });
  test('Feld ändern ändert die Regeln, nicht nur die Anzeige', () => {
    let r2 = setCell(rules, 'run', 5, 'yes');
    expect(cellOf(r2, 'run', 5).state).toBe('yes');
    expect(cellOf(r2, 'run', 3).state).toBe('no');
    r2 = setCell(r2, 'bike', 2, 'soft');
    expect(cellOf(r2, 'bike', 2).state).toBe('soft');
    r2 = setCell(r2, 'bike', 2, 'no');
    expect(cellOf(r2, 'bike', 2).state).toBe('no');
    expect(r2.filter(x => x.sport === 'bike' && x.days?.includes(2)).length).toBe(1);
    r2 = setCell(r2, 'run', 3, 'yes');
    expect(cellOf(r2, 'run', 3).state).toBe('yes');
  });
  test('Tag ganz frei: eine Sportart wieder erlauben, die anderen bleiben gesperrt', () => {
    const off = parseRules('dienstags gar nichts', today).rules;
    const r2 = setCell(off, 'swim', 2, 'yes');
    expect(cellOf(r2, 'swim', 2).state).toBe('yes');
    expect(cellOf(r2, 'run', 2).state).toBe('no');
    expect(cellOf(r2, 'strength', 2).state).toBe('no');
  });
});

test('Regeln einzeln: Teamsport-Termine und Wettkämpfe sind nie betroffen', () => {
  const rules: Rule[] = [{ id: 'x', kind: 'dayOff', strength: 'hard', days: [6] }];
  expect(evaluate(rules, { sport: 'football', title: 'Fußball: Spiel' }, '2026-10-17').hard).toEqual([]);
  expect(evaluate(rules, { sport: 'run', race: true }, '2026-10-17').hard).toEqual([]);
  expect(evaluate(rules, { sport: 'run' }, '2026-10-17').hard.length).toBe(1);
  expect(dayLimit(rules, '2026-10-17').cap).toBe(0);
  expect(say(rules[0])).toBe('Sa: gar kein Training');
});
