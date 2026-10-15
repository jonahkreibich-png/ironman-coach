/* Auftrag 4: fünf Test-Personen durchlaufen den kompletten Fragebogen und die ersten 4 Planwochen.
   Der Plan wird automatisch auf Plausibilität geprüft (C4). Diese Tests bleiben für immer im Testpaket. */
import { test, expect, describe } from 'vitest';
import { PERSONAS, PERSONA_TODAY as today } from '../../fixtures/personas';
import { BLOCKS, visibleQuestions, missingRequired, applyOnboarding, understood } from '../../shared/onboarding';
import { checkPlan, checkSession } from '../../shared/plancheck';
import { isIntense } from '../../shared/rules';
import { totals } from '../../shared/workouts';

const all = (weeks: any[]) => weeks.flatMap((w: any) => w.days.flatMap((d: any) => d.sessions.map((s: any) => ({ ...s, date: d.date, week: w.weekNumber }))));
const run = (id: string) => {
  const p = PERSONAS.find(x => x.id === id)!;
  const r = applyOnboarding(p.answers, today);
  // die ersten 4 vollen Wochen (dazu die angebrochene Woche ab heute, Auftrag 11)
  const ws = r.gen!.plan.weeks; return { ...r, weeks: ws.slice(0, ws[0] && ws[0].partial ? 5 : 4) };
};

describe.each(PERSONAS.map(p => [p.id, p] as const))('Test-Person %s', (_id, p) => {
  test('Fragebogen komplett: alle Blöcke sichtbar, keine Pflichtfrage offen, Zusammenfassung vollständig', () => {
    for (const b of BLOCKS) expect(visibleQuestions(b, p.answers).length).toBeGreaterThan(0);
    expect(missingRequired(p.answers)).toEqual([]);
    const u = understood(p.answers, today);
    expect(u.map(x => x.label)).toEqual(['Ziele', 'Training bisher', 'Sportarten und Häufigkeit', 'Tage', 'Teamsport', 'Können', 'Einschränkungen', 'Kraft']);
    u.forEach(x => expect(x.text.length).toBeGreaterThan(1));
  });
  test('erste 4 Planwochen: alle Planungsregeln eingehalten', () => {
    const r = applyOnboarding(p.answers, today);
    expect(r.gen).not.toBeNull();
    const weeks = r.gen!.plan.weeks.slice(0, 4);
    const issues = checkPlan(weeks, r.profile, r.goals, today);
    expect(issues).toEqual([]);
    // jede Woche sagt, worauf sie hinarbeitet
    weeks.forEach((w: any) => expect(w.headline).toMatch(/^Woche \d+ von \d+ · (Grundlage|Aufbau|Wettkampfspezifisch|Tapering|Wettkampf) → /));
    // jede Einheit: Titel, Dauer, Distanz und Beschreibung aus denselben Zahlen, mit Warum
    for (const s of all(weeks).filter((x: any) => x.sport !== 'rest' && !x.race && x.sport !== 'football')) {
      expect(checkSession(s)).toEqual([]);
      expect(s.description).toMatch(/Warum: /);
      if (s.spec && s.sport !== 'strength') expect(s.description).toMatch(/Wie hart: /);
      expect(totals(s.spec).min).toBe(s.plannedMinutes);
    }
  });
});

describe('Besonderheiten der Personen', () => {
  test('Jugendlicher mit Fußball: Training Mo/Fr im Plan, Spieltag Sa hart, am Freitag nichts Hartes zusätzlich, Kraul nur in kurzen Stücken', () => {
    const { weeks, profile } = run('jugend-langdistanz');
    // die angebrochene erste Woche (Plan ab heute, Auftrag 11) hat Mo/Di noch keinen Plan
    for (const w of weeks.filter((x: any) => !x.partial)) {
      const byDow = (d: number) => w.days.find((x: any) => new Date(x.date + 'T12:00:00Z').getUTCDay() === d);
      expect(byDow(1).sessions.some((s: any) => s.title === 'Fußball-Training')).toBe(true);
      expect(byDow(5).sessions.some((s: any) => s.title === 'Fußball-Training')).toBe(true);
      expect(byDow(5).sessions.filter((s: any) => s.sport !== 'football').some(isIntense)).toBe(false);
    }
    const swims = all(weeks).filter((s: any) => s.sport === 'swim');
    expect(swims.length).toBeGreaterThan(0);
    swims.forEach((s: any) => s.spec.steps.filter((st: any) => st.mode === 'crawl').forEach((st: any) => expect(st.m).toBeLessThanOrEqual(50)));
    // Schwimmbad nur Di, Mi, So
    swims.forEach((s: any) => expect([0, 2, 3]).toContain(new Date(s.date + 'T12:00:00Z').getUTCDay()));
    // C-Rennen ohne Tapering im Plan
    const race = all(weeks).find((s: any) => s.race);
    expect(race && race.title).toBe('Stadt-Sprint');
    expect(weeks.find((w: any) => w.races.length).headline).toContain('mit Stadt-Sprint am Sonntag');
    expect(profile.thresholds.estimated).toEqual(expect.arrayContaining(['lthrRun']));
  });
  test('Vater-Typ: kein Schwimmen, kein Teamsport/Spieltag, Kraft 2× mit Übungen, Gravelbike draußen, Knie: keine Lauf-Intensität', () => {
    const { weeks } = run('vater-rad-lauf');
    const s = all(weeks);
    expect(s.some((x: any) => x.sport === 'swim')).toBe(false);
    expect(s.some((x: any) => x.sport === 'football' || /spiel|fußball/i.test(x.title))).toBe(false);
    weeks.forEach((w: any) => { if (w.phase !== 'race') expect(w.days.flatMap((d: any) => d.sessions).filter((x: any) => x.sport === 'strength').length).toBe(2); });
    const str = s.find((x: any) => x.sport === 'strength');
    expect(str.description).toMatch(/Kniebeuge.*\d×\d+/);
    expect(str.description).toMatch(/schmerzfrei/);
    expect(s.filter((x: any) => x.sport === 'bike' && !x.race).some((x: any) => /Gravelbike/.test(x.title))).toBe(true);
    expect(s.filter((x: any) => x.sport === 'run' && !x.race).some(isIntense)).toBe(false);
    expect(s.find((x: any) => x.sport === 'run').description).toMatch(/Knie/);
  });
  test('Läuferin: 10 km (B) mit kurzem Tapering und Erholung, beide Wunschzeiten, 4 Läufe pro Woche', () => {
    const { weeks, goals } = run('laeuferin-hm');
    expect(goals.map(g => g.targetTimeSec)).toEqual([6900, 3120]);
    const raceDay = '2026-11-14';
    const s = all(weeks);
    expect(s.find((x: any) => x.race && x.date === raceDay).title).toBe('10-km-Rennen');
    const near = s.filter((x: any) => !x.race && x.date >= '2026-11-10' && x.date <= '2026-11-17');
    expect(near.some(isIntense)).toBe(false);
    weeks.filter((w: any) => !w.races.length && !w.isRecoveryWeek && !w.partial).forEach((w: any) => expect(w.days.flatMap((d: any) => d.sessions).filter((x: any) => x.sport === 'run').length).toBe(4));
    expect(weeks[0].headline).toBe('Woche 1 von 10 · Aufbau → 10-km-Rennen'); // Phase und nächstes Ziel (Auftrag 9)
  });
  test('Einsteigerin: Brust plus Kraul-Technik, Lauf-Geh-Wechsel, kein Schwimmen im Winter', () => {
    const r = applyOnboarding(PERSONAS.find(x => x.id === 'einsteiger-sprint')!.answers, today);
    const weeks = r.gen!.plan.weeks;
    const s = all(weeks);
    expect(s.filter((x: any) => x.sport === 'run').every((x: any) => /Lauf-Geh-Wechsel|Langer|Lockerer/.test(x.title))).toBe(true);
    expect(s.filter((x: any) => x.sport === 'run').slice(0, 4).every((x: any) => /Lauf-Geh-Wechsel/.test(x.title))).toBe(true);
    // Oktober: Schwimmen mit Brust und Kraul-Technik, ab November kein Schwimmbad
    const oct = s.filter((x: any) => x.sport === 'swim' && x.date < '2026-11-01');
    expect(oct.length).toBeGreaterThan(0);
    oct.forEach((x: any) => expect(x.title).toMatch(/Brust und Kraul/));
    expect(s.some((x: any) => x.sport === 'swim' && x.date >= '2026-11-02' && x.date <= '2027-03-28')).toBe(false);
    expect(r.gen!.dropped.some(d => /kein Schwimmbad/.test(d))).toBe(true);
  });
  test('Erfahrener: Marathon (B) und Mitteldistanz (A) beide im Plan, Watt in der Beschreibung bei FTP, Intervalle auf der Rolle', () => {
    const p = PERSONAS.find(x => x.id === 'erfahren-md-marathon')!;
    const r = applyOnboarding(p.answers, today);
    const weeks = r.gen!.plan.weeks;
    const s = all(weeks);
    expect(s.find((x: any) => x.race && x.date === '2027-04-11').title).toBe('Frühjahrsmarathon');
    expect(s.find((x: any) => x.race && x.date === '2027-06-27').title).toBe('Mitteldistanz');
    expect(r.goals[0].targetTimeSec).toBe(2100 + 9600 + 6300 + 240);
    expect(s.filter((x: any) => x.sport === 'bike' && isIntense(x) && !x.race).every((x: any) => /Rolle/.test(x.title))).toBe(true);
    expect(checkPlan(weeks, r.profile, r.goals, today).filter(i => i.rule === 'goals')).toEqual([]);
  });
});
