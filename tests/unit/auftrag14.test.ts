/* Auftrag 14: Ampel (ein Wert), Titel passt zur Zone, Intensität als feste Regel im Plan-Generator, Schwimmen genau und realistisch.
   Erfundene Werte und Test-Personen, keine echten Daten. */
import { test, expect, describe } from 'vitest';
import * as C from '../../shared/core';
import * as W from '../../shared/workouts';
import { runEngine } from '../../shared/coach/engine';
import { PERSONAS, PERSONA_TODAY } from '../../fixtures/personas';
import { NEW_USERS, NEWUSER_TODAY } from '../../fixtures/newusers';
import { randomUsers, RANDOM_TODAY } from '../../fixtures/randomusers';
import { patternPlan, profile as patProfile } from '../../fixtures/pattern-person';
import { applyOnboarding } from '../../shared/onboarding';
import { generatePlan, paceCtx } from '../../shared/plangen';
import { checkIntensity, titleZoneIssue, isHardSession, levelOf, intensityStats } from '../../shared/intensity';
import { defaultProfile, withEstimates } from '../../shared/profile';

const T = '2026-10-17';
const FB = { sleepNeed: [7, 9] };
const day = (i: number) => C.addDays(T, -i);
function base(n: number, extra: (i: number) => any = () => ({})) {
  const out: any[] = [];
  for (let i = n; i >= 1; i--) out.push({ date: day(i), hrv: 70 + ((i % 5) - 2) * 4, restingHR: 50 + (i % 3) - 1, sleepHours: 8, sleepQuality: 8, ...extra(i) });
  return out;
}

describe('Ampel: ein Wert, Farbe passt immer', () => {
  test('Papas Fall: Ruhepuls und HFV erst seit 1 Tag, 5,3 h Schlaf → gelb, Ring, Wort und Satz gleich', () => {
    const tr = [{ date: day(1), restingHR: 46 }, { date: T, restingHR: 53, hrv: 65, sleepHours: 5.3, sleepQuality: 6 }];
    const R = C.readinessFor(tr, [], T, FB);
    expect(R.level).toBe(1);
    expect(R.score).toBeGreaterThanOrEqual(45); expect(R.score).toBeLessThanOrEqual(69);
    expect(C.levelOfScore(R.score)).toBe(R.level);
    expect(C.READY_WORDS[R.level]).toBe('Locker');
    expect(C.readinessLine(R)).toMatch(/^Gelb \(\d+\/100\): lockerer trainieren/);
    expect(R.crits.find((c: any) => c.k === 'Schlaf').st).toBe('warn');
    expect(R.crits.find((c: any) => c.k === 'Ruhepuls').st).toBe('none');
  });
  test('nur Ruhepuls am Morgen → „Ampel unsicher“, kein Grün', () => {
    const R = C.readinessFor([{ date: day(1), restingHR: 46 }, { date: T, restingHR: 46 }], [], T, FB);
    expect(R.level).toBe(3); expect(R.score).toBeNull(); expect(R.uncertain).toBe('few');
    expect(C.readinessLine(R)).toMatch(/^Ampel unsicher – nur Ruhepuls von heute/);
  });
  test('keine Morgenwerte von heute → „Ampel unsicher – keine Morgenwerte“, mit Hinweis auf gestern', () => {
    const tr = base(28); tr[tr.length - 1] = { ...tr[tr.length - 1], restingHR: 58 };
    const R = C.readinessFor(tr, [], T, FB);
    expect(R.level).toBe(3); expect(R.uncertain).toBe('none');
    expect(C.readinessLine(R)).toMatch(/^Ampel unsicher – keine Morgenwerte/);
    expect(R.staleLevel).toBe(2);
  });
  test('alles normal → grün ab 70', () => {
    const R = C.readinessFor([...base(28), { date: T, hrv: 71, restingHR: 50, sleepHours: 8, sleepQuality: 8 }], [], T, FB);
    expect(R.level).toBe(0); expect(R.score).toBeGreaterThanOrEqual(70); expect(C.readinessLine(R)).toMatch(/^Grün/);
  });
  test('krank → rot, Einzelwert Krankheit rot', () => {
    const R = C.readinessFor([...base(10), { date: T, sleepHours: 8, restingHR: 50 }], [{ start: day(1), end: null }], T, FB);
    expect(R.level).toBe(2); expect(R.crits.find((c: any) => c.k === 'Krankheit').st).toBe('bad');
  });
  test('Belastung: hohe Müdigkeit gegenüber der Fitness zählt, ohne Trainingsverlauf nicht', () => {
    const p = { date: T, hrv: 70, restingHR: 50, sleepHours: 8 };
    const hi = C.readinessFor([...base(28), p], [], T, { ...FB, load: { ctl: 40, atl: 90 } });
    expect(hi.crits.find((c: any) => c.k === 'Belastung').st).toBe('bad'); expect(hi.level).toBe(2);
    const lo = C.readinessFor([...base(28), p], [], T, { ...FB, load: { ctl: 2, atl: 15 } });
    expect(lo.crits.find((c: any) => c.k === 'Belastung').st).toBe('none'); expect(lo.level).toBe(0);
  });
  test('Gefühl und Muskelkater zählen (sehr müde, starker Muskelkater → mindestens gelb)', () => {
    const R = C.readinessFor([...base(28), { date: T, hrv: 70, restingHR: 50, sleepHours: 8, feel: 5, soreness: 3 }], [], T, FB);
    expect(R.level).toBeGreaterThanOrEqual(1); expect(R.reasons.join(' ')).toMatch(/sehr müde.*starker Muskelkater/);
  });
  test('500 zufällige Tage: Stufe passt immer zum Wert und zu den Einzelwerten', () => {
    let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 500; k++) {
      const n = Math.floor(r() * 30);
      const tr = base(n);
      const p: any = { date: T };
      if (r() < 0.8) p.hrv = Math.round(40 + r() * 50); if (r() < 0.8) p.restingHR = Math.round(44 + r() * 14);
      if (r() < 0.8) p.sleepHours = Math.round((4 + r() * 5) * 10) / 10; if (r() < 0.3) p.bodyTemp = Math.round((r() * 0.8 - 0.2) * 100) / 100;
      if (r() < 0.3) p.feel = 1 + Math.floor(r() * 5); if (r() < 0.3) p.soreness = Math.floor(r() * 4);
      const load = r() < 0.5 ? { ctl: 10 + r() * 60, atl: 10 + r() * 100 } : null;
      const R = C.readinessFor([...tr, p], r() < 0.1 ? [{ start: T, end: null }] : [], T, { ...FB, load });
      if (R.level === 3) { expect(R.score).toBeNull(); continue; }
      expect(C.levelOfScore(R.score)).toBe(R.level);
      if (R.crits.some((c: any) => c.st === 'bad')) expect(R.level).toBe(2);
      else if (R.crits.some((c: any) => c.st === 'warn')) expect(R.level).toBeGreaterThanOrEqual(1);
      if (R.level === 0) expect(R.crits.every((c: any) => c.st === 'ok' || c.st === 'none')).toBe(true);
    }
  });
  test('Morgen-Nachricht wird erneuert, wenn später weitere Werte kommen (gleicher Wert wie der Ring)', () => {
    const prof = withEstimates({ ...defaultProfile(), birthYear: 1977, sports: ['run'] } as any, T);
    const weeks = [{ weekNumber: 1, startDate: C.addDays(T, -5), days: [{ date: T, sessions: [{ id: 'x', sport: 'run', title: 'Lockerer Lauf 40 min', plannedMinutes: 40, zone: 'Zone 2' }] }] }];
    const state: any = { trend: [{ date: day(1), restingHR: 46 }, { date: T, restingHR: 46 }], sessions: {}, adjustments: {}, coachMsgs: {}, settings: {}, illnessPeriods: [] };
    const ctx = () => ({ today: T, now: Date.now(), state, baseWeeks: weeks, planMeta: {}, profile: prof, goals: [] });
    const first = runEngine(ctx(), { type: 'trend', dates: [T] }).messages.find(m => m.kind === 'briefing')!;
    expect(first.text).toMatch(/Ampel unsicher/);
    state.coachMsgs[first.id] = first;
    state.trend[1] = { date: T, restingHR: 53, hrv: 65, sleepHours: 5.3, sleepQuality: 6 };
    const second = runEngine(ctx(), { type: 'trend', dates: [T] }).messages.find(m => m.kind === 'briefing')!;
    const R = C.readinessFor(state.trend, [], T, { sleepNeed: [7, 9], load: null });
    expect(second.id).toBe(first.id);
    expect(second.text).toMatch(new RegExp(`Ampel gelb \\(${R.score}/100\\)`));
    expect(second.readiness).toEqual({ level: R.level, score: R.score });
  });
});

/* alle Pläne: Test-Personen, neue Nutzer, 10 Zufalls-Nutzer, fester Wochenaufbau */
const PLANS: { id: string; weeks: any[]; profile: any; today: string; opts: any }[] = [
  ...PERSONAS.map(p => { const r = applyOnboarding(p.answers, PERSONA_TODAY); return { id: p.id, weeks: r.gen!.plan.weeks, profile: r.profile, today: PERSONA_TODAY, opts: r.gen!.plan.meta.intensityOpts }; }),
  ...NEW_USERS.map(p => { const r = applyOnboarding(p.answers, NEWUSER_TODAY); return { id: p.id, weeks: r.gen!.plan.weeks, profile: r.profile, today: NEWUSER_TODAY, opts: r.gen!.plan.meta.intensityOpts }; }),
  ...randomUsers().map(p => { const r = applyOnboarding(p.answers, RANDOM_TODAY); return { id: p.id, weeks: r.gen!.plan.weeks, profile: r.profile, today: RANDOM_TODAY, opts: r.gen!.plan.meta.intensityOpts }; }),
  (() => { const r = patternPlan(true); return { id: 'fester-wochenaufbau', weeks: r.plan.weeks.filter((w: any) => w.startDate >= '2026-10-19'), profile: patProfile, today: '2026-10-14', opts: r.plan.meta.intensityOpts }; })()
];
const all = (weeks: any[]) => C.planDays(weeks).flatMap((d: any) => d.sessions.map((s: any) => ({ ...s, date: d.date })));

describe('Titel passt zur Zone', () => {
  test('„Lockerer Lauf … mit Hügelsprints“ ist Zone 2, Puls im Bereich von Zone 2', () => {
    const ctx = paceCtx(withEstimates({ ...defaultProfile(), birthYear: 1977 } as any, T), false, null, T);
    const s = W.build({ sport: 'run', kind: 'hills', ctx, steps: [{ part: 'main', min: 49, zone: 2 }, { part: 'main', reps: 8, min: 0.25, zone: 3, restMin: 0.75 }] });
    expect(s.title).toMatch(/^Lockerer Lauf .* mit Hügelsprints$/); expect(s.zone).toBe('Zone 2');
  });
  for (const p of PLANS) test(p.id + ': kein Titel widerspricht der Zone', () => {
    for (const s of all(p.weeks)) expect(titleZoneIssue(s), `${s.date} ${s.title}`).toBeNull();
  });
});

describe('Intensität als feste Regel', () => {
  // Bekannte Grenze: zufall-6 hat nur montags Platz für Hartes (Spiel Sa, Training Di); Rad und Lauf wechseln sich ab.
  // Auftrag 15: triathlet-50m-freiwasser läuft 5×, radelt 4× und schwimmt 3× pro Woche; mit „gleiche Sportart nicht an zwei Tagen hintereinander“
  // bleibt in einer Aufbauwoche kein freier Tag für einen harten Lauf (Rad und Schwimmen sind dort hart).
  const KNOWN: Record<string, string[]> = { 'zufall-6': ['missing'], 'triathlet-50m-freiwasser': ['missing'] };
  for (const p of PLANS) test(p.id + ': nie zwei harte Tage nebeneinander, Zahl harter Tage, 80 % locker, keine Wiederholung, Intensität je Phase', () => {
    const id = p.id;
    const iss = checkIntensity(p.weeks, p.profile, p.today, p.opts || {}).filter(i => !(KNOWN[id] || []).includes(i.rule));
    expect(iss.map(i => i.msg)).toEqual([]);
    expect(intensityStats(p.weeks, p.profile).easyShare).toBeGreaterThanOrEqual(0.75);
  });
  test('Einsteiger: in der Grundlage nichts Hartes außer Spielen und Tests', () => {
    for (const p of PLANS.filter(x => levelOf(x.profile) === 'beginner')) for (const w of p.weeks.filter((w: any) => w.phase === 'base'))
      for (const s of all([w])) if (isHardSession(s) && !s.fixed && !s.race && !/test|Spiel/i.test(s.title)) throw new Error(`${p.id}: ${s.title}`);
  });
  test('unter 18 und ab 60: kein VO2max, höchstens 2 harte Tage pro Woche', () => {
    for (const p of PLANS) {
      const age = p.profile.birthYear ? +p.today.slice(0, 4) - p.profile.birthYear : 30;
      if (age >= 18 && age < 60) continue;
      expect(all(p.weeks).filter((s: any) => /VO2max/.test(s.title) && (+s.date.slice(0, 4) - p.profile.birthYear < 18 || +s.date.slice(0, 4) - p.profile.birthYear >= 60)).map((s: any) => s.title), p.id).toEqual([]);
    }
  });
  test('5/10 km: VO2max im Aufbau; Rad-Event: lange Anstiege; Halbmarathon: Schwelle und Wettkampftempo', () => {
    const run10 = PLANS.find(p => p.id === 'zufall-2')!; // 10 km, 15 Jahre: kein VO2max, dafür Schwelle
    expect(all(run10.weeks).some((s: any) => /Schwelle|10-km-Tempo/.test(s.title))).toBe(true);
    const r5 = generatePlan({ profile: withEstimates({ ...defaultProfile(), birthYear: 1990, experienceYears: 5, sports: ['run'], freq: { run: [4, 4] }, weeklyHours: 6, skills: { runContinuousMin: 80 } } as any, T), goals: [{ id: 'g', type: 'run_5k', name: '5 km', date: '2027-04-18', priority: 'A' }], today: T });
    expect(all(r5.plan.weeks).some((s: any) => /Lauf-Intervalle \d×\d min sehr hart/.test(s.title))).toBe(true);
    const ev = PLANS.find(p => p.id === 'rad-event')!;
    // Auftrag 19: Berg-Intervalle nur mit Hügeln in der Nähe (Profil), sonst Ersatz auf der Rolle: Kraftausdauer mit niedriger Trittfrequenz
    expect(all(ev.weeks).some((s: any) => /^Rad-Intervalle \d×\d+ min (am Anstieg|Kraftausdauer)/.test(s.title))).toBe(true);
    const hm = PLANS.find(p => p.id === 'laeufer-ohne-rad')!;
    expect(all(hm.weeks).some((s: any) => /an der Schwelle|Schwellenlauf|Schwellen-Intervalle/.test(s.title))).toBe(true);
    expect(all(hm.weeks).some((s: any) => /Halbmarathon-Tempo/.test(s.title + ' ' + s.description))).toBe(true);
  });
  test('Intervalle steigen von Woche zu Woche (Schwellenlauf erst 3×8, später länger)', () => {
    const p = PLANS.find(x => x.id === 'laeufer-ohne-rad')!;
    // Auftrag 19: Name aus der Einheiten-Bibliothek („Schwellen-Intervalle 3×8 min“)
    const thr = all(p.weeks).filter((s: any) => /^(Lauf-Intervalle (\d)×(\d+) min an der Schwelle|Schwellen-Intervalle (\d)×(\d+) min)/.test(s.title)).map((s: any) => { const m = /(\d)×(\d+)/.exec(s.title)!; return +m[1] * +m[2]; });
    expect(thr.length).toBeGreaterThan(2); expect(Math.max(...thr)).toBeGreaterThan(thr[0]);
  });
  test('Jede Qualitätseinheit beschreibt Aufwärmen, Hauptteil mit Wiederholungen × Dauer und Pausen, Ausklang und wofür sie gut ist', () => {
    const p = PLANS.find(x => x.id === 'olympisch-erfahren')!;
    for (const s of all(p.weeks).filter((s: any) => isHardSession(s) && !s.race && !s.fixed && !/test/i.test(s.title) && s.sport !== 'swim')) {
      expect(s.description, s.title).toMatch(/Aufwärmen: .*\n?Hauptteil: .*(\d+×|\d+ min)/s);
      expect(s.description, s.title).toMatch(/Warum: /);
      expect(s.description, s.title).toMatch(/Puls|W|\/km|km\/h/);
    }
  });
});

describe('Schwimmen genau und realistisch', () => {
  const papa = withEstimates({ ...defaultProfile(), birthYear: 1977, sex: 'm', sports: ['swim', 'bike', 'run'], experienceYears: 3,
    skills: { swimCrawl: 'yes', swimCrawlM: 25, swimBreast: true, poolM: 25, runContinuousMin: 110, bikeLongestMin: 180 } } as any, T);
  const goals = [{ id: 'g', type: 'tri_olympic' as const, name: 'Triathlon', date: '2027-07-18', priority: 'A' as const }];
  test('Papa (kann kraulen, 25 m am Stück): kein „Kraul lernen“, keine Kraul-Stücke über 25 m', () => {
    expect(W.swimLadderStart(papa.skills)).toBeNull();
    const g = generatePlan({ profile: papa, goals, today: T, from: T, maxWeeks: 12 });
    const sw = all(g.plan.weeks).filter((s: any) => s.sport === 'swim' && !/test/i.test(s.title));
    expect(sw.length).toBeGreaterThan(5);
    for (const s of sw) {
      expect(s.title).not.toMatch(/Kraul lernen/);
      for (const st of s.spec.steps.filter((x: any) => x.mode === 'crawl' || x.mode === 'pull')) expect(st.m, s.title).toBeLessThanOrEqual(25);
    }
  });
  test('ohne Hilfsmittel: kein Kickbrett, kein Pull Buoy; mit Kickbrett: „mit Kickbrett“', () => {
    const none = generatePlan({ profile: papa, goals, today: T, from: T, maxWeeks: 6 });
    const txt = all(none.plan.weeks).filter((s: any) => s.sport === 'swim').map((s: any) => s.description).join('\n');
    expect(txt).not.toMatch(/Kickbrett|Pull Buoy|Flossen|Paddles|Schnorchel/);
    const withBoard = generatePlan({ profile: { ...papa, skills: { ...papa.skills, swimGear: ['board'] } }, goals, today: T, from: T, maxWeeks: 6 });
    const txt2 = all(withBoard.plan.weeks).filter((s: any) => s.sport === 'swim').map((s: any) => s.description).join('\n');
    expect(txt2).not.toMatch(/Pull Buoy/);
    const learner = W.build(W.swimLearn({ breast100: 165, gear: ['board'] }, { ladder: 'swim', n: 1, breast: true }));
    expect(learner.description).toMatch(/Kraul-Beinschlag mit Kickbrett, 30 s Pause – Fokus: Beine aus der Hüfte/);
  });
  test('jede Einheit als Liste: Einschwimmen, Technik, Hauptteil, Ausschwimmen; Zeilen mit Wdh × Strecke, Lage, Pause, Fokus; Übungen erklärt; Summe', () => {
    const g = generatePlan({ profile: { ...papa, skills: { ...papa.skills, swimGear: ['board', 'buoy'] } }, goals, today: T, from: T, maxWeeks: 4 });
    for (const s of all(g.plan.weeks).filter((s: any) => s.sport === 'swim' && !/test/i.test(s.title))) {
      expect(s.description).toMatch(/^Einschwimmen:\n• /m); expect(s.description).toMatch(/^Technik:\n• \d+×\d+ m Kraul-(Technik|Beinschlag).* – Fokus: /m);
      expect(s.description).toMatch(/^Hauptteil:\n• /m); expect(s.description).toMatch(/^Ausschwimmen:\n• /m);
      expect(s.description).toMatch(/^Übungen:\n• [^:]+: .+ – .+/m);
      expect(s.description).toMatch(/^Summe: [\d.]+ m · ca\. \d+ min \(schwimmen \d+ min, Pausen \d+ min\)$/m);
    }
  });
  test('Meter und Zeit passen: nie schneller als die persönliche Pace, Pausen eingerechnet (alle Pläne)', () => {
    for (const p of PLANS) for (const s of all(p.weeks).filter((s: any) => s.sport === 'swim' && s.spec && s.spec.steps)) {
      const m = Math.round((s.plannedKm || 0) * 1000); if (!m) continue;
      const S = W.swimSums(s.spec);
      expect(Math.abs(S.min - s.plannedMinutes), `${p.id} ${s.title}`).toBeLessThanOrEqual(1);
      const per100 = s.plannedMinutes * 60 / (m / 100);
      const crawl = W.swimPace(s.spec.ctx, 2, 'crawl');
      expect(per100, `${p.id} ${s.title}: ${m} m in ${s.plannedMinutes} min`).toBeGreaterThanOrEqual(Math.min(crawl, 120));
      expect(per100, `${p.id} ${s.title}`).toBeLessThanOrEqual(420);
    }
  });
  test('Papas alte Einheit „Stufe 3: 950 m in 32 min“ wäre ehrlich gerechnet länger', () => {
    const ctx = paceCtx(papa, false, null, T);
    const sp = W.swimLearn(ctx, { ladder: 'swim', n: 2, breast: true }, 'x', 32);
    const S = W.swimSums(sp);
    expect(S.min).toBeLessThanOrEqual(40);
    expect(S.min * 60 / (S.meters / 100)).toBeGreaterThan(32 * 60 / 9.5);
    expect(S.meters).toBeLessThan(950);
  });
});

describe('Fehlersuche 17.10.', () => {
  test('„Fussballspiel (abends)“ zählt als Spiel, „Spielvereinigung“ nicht', () => {
    expect(C.isGame({ sport: 'football', title: 'Fussballspiel (abends)' })).toBe(true);
    expect(C.isGame({ sport: 'football', title: 'Fußball: Spiel' })).toBe(true);
    expect(C.isGame({ sport: 'football', title: 'Spielvereinigung Training' })).toBe(false);
  });
  test('Puls für Zone 1: „unter 150 bpm“ statt „0-150 bpm“', () => {
    expect(C.zoneBpm({ sport: 'bike', zone: 'Zone 1' }, { lthrBike: 170 }, null)).toMatch(/^unter \d+ bpm$/);
    expect(C.zoneBpm({ sport: 'run', zone: 'Zone 2' }, { lthrRun: 170 }, null)).toMatch(/^\d+-\d+ bpm$/);
  });
  test('Spiel mit RPE 7 wird nicht als „zu hart für eine lockere Einheit“ bewertet; harte Extra-Einheit nicht als „geplant war Zone 2“', () => {
    const prof = withEstimates({ ...defaultProfile(), birthYear: 1977, sports: ['run', 'football'], thresholds: { ...defaultProfile().thresholds, lthrRun: 155 } } as any, T);
    const weeks = [{ weekNumber: 1, startDate: C.addDays(T, -6), days: [{ date: day(1), sessions: [{ id: 'm', sport: 'football', title: 'Fussballspiel (abends)', plannedMinutes: 70 }] }] }];
    const state: any = { sessions: { m: { completed: true, rpe: '7', metrics: { min: '70' } } }, customWorkouts: { [day(1)]: [{ id: 'c1', date: day(1), sport: 'run', title: 'Laufen', plannedMinutes: 63, rpe: '7', metrics: { min: '63', km: '11.35', hr: '164', pace: '5:38' } }] }, trend: [], adjustments: {}, coachMsgs: {}, settings: {}, illnessPeriods: [], activities: {} };
    const out = runEngine({ today: T, now: Date.now(), state, baseWeeks: weeks, planMeta: {}, profile: prof, goals: [] }, { type: 'activity' });
    const txt = out.messages.filter(m => m.id.startsWith('msg-review-')).map(m => m.text).join('\n');
    expect(txt).toMatch(/Fussballspiel/);
    expect(txt).not.toMatch(/für eine lockere Einheit ist hoch/);
    expect(txt).not.toMatch(/geplant war Zone/);
    expect(txt).toMatch(/harte Einheit, keine lockere/);
  });
});
