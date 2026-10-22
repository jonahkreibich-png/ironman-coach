/* Auftrag 10: kein Plateau, passende Intensität je Phase, lockere Tage nach Wettkämpfen. Alle 10 Test-Personen und die Person mit festem
   Wochenaufbau (wie im Auftrag beschrieben). */
import { test, expect, describe } from 'vitest';
import { PERSONAS, PERSONA_TODAY as today } from '../../fixtures/personas';
import { patternPlan, profile as patProfile } from '../../fixtures/pattern-person';
import { applyOnboarding } from '../../shared/onboarding';
import { easyAfterDays } from '../../shared/periodize';
import { isIntense } from '../../shared/rules';
import * as C from '../../shared/core';

const dow = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
const own = (w: any) => C.planDays([w]).flatMap((d: any) => d.sessions).filter((s: any) => s && s.sport !== 'rest' && s.sport !== 'football' && !s.race);
// Lernstufen (Gehen/Laufen, Kraul lernen) steigen erst, wenn eine Stufe geklappt hat: sie zählen nicht als „gleiche Woche“
const sig = (w: any) => own(w).filter((s: any) => !s.stage && s.sport !== 'strength').map((s: any) => `${s.sport}:${s.title}`).sort().join('|');
const plans = [...PERSONAS.map(p => { const r = applyOnboarding(p.answers, today); return [p.id, r.gen!.plan, r.profile, r.goals] as const; }),
  (() => { const r = patternPlan(true); return ['fester-wochenaufbau', { ...r.plan, weeks: r.plan.weeks.filter((w: any) => w.startDate >= '2026-10-19') }, patProfile, r.gen.plan.meta.timeline.goals] as const; })()];

describe.each(plans)('%s', (_id, plan, prof, goals) => {
  const weeks = plan.weeks;
  test('keine 4 fast gleichen Wochen hintereinander, höchstens 3 gleiche Schlüsseleinheiten in Folge', () => {
    let same = 1;
    for (let i = 1; i < weeks.length; i++) { same = sig(weeks[i]) === sig(weeks[i - 1]) && sig(weeks[i]) ? same + 1 : 1; expect(same).toBeLessThan(4); }
    const keys = weeks.map((w: any) => own(w).filter((s: any) => s.hard && !/test/i.test(s.title)).map((s: any) => `${s.sport}:${s.title.replace(/\s*\(.*\)$/, '')}`).sort().join('|'));
    let rep = 1;
    for (let i = 1; i < keys.length; i++) { rep = keys[i] && keys[i] === keys[i - 1] ? rep + 1 : 1; expect(rep).toBeLessThanOrEqual(3); }
  });
  test('Intensität passt zur Phase: Aufbau/spezifisch mit Rad-Schlüsseleinheit, Lauf-Qualität, Grundlage mit Steigerungen/Hügeln/Fahrtspiel', () => {
    const runOk = !(prof.rules || []).some((r: any) => r.kind === 'runEasy') && !/knie/i.test(JSON.stringify(prof.notes || []));
    let bikeWeeks = 0, bikeHard = 0, runWeeks = 0, runQ = 0, baseWeeks = 0, baseVar = 0, both = 0, either = 0;
    // Auftrag 14: unter 18 höchstens 2 harte Tage; mit einem Spiel pro Woche wechseln sich Rad- und Lauf-Qualität ab
    const cautious = (+(String(today).slice(0, 4)) - ((prof as any).birthYear || 1990)) < 18 && !!((prof as any).teamSport && ((prof as any).teamSport.gameDays || []).length);
    for (const w of weeks) {
      if (w.isRecoveryWeek || w.entry || w.reduced || ['taper', 'race'].includes(w.phase)) continue;
      const ss = own(w);
      const bikes = ss.filter((s: any) => s.sport === 'bike'), runs = ss.filter((s: any) => s.sport === 'run' && !s.stage && !/Koppel|Wechsel/.test(s.title));
      if (w.phase === 'build' || w.phase === 'specific') {
        if (bikes.length >= 2) { bikeWeeks++; if (bikes.some((s: any) => s.hard)) bikeHard++; }
        if (runs.length >= 2 && runOk) { runWeeks++; if (runs.some((s: any) => s.hard)) runQ++; }
        if (bikes.length >= 2 && runs.length >= 2) { both++; if (bikes.some((s: any) => s.hard) || runs.some((s: any) => s.hard)) either++; }
      } else if (w.phase === 'base' && runs.length >= 2) { baseWeeks++; if (runs.some((s: any) => /Steigerung|Hügel|Fahrtspiel/.test(s.title + ' ' + s.description))) baseVar++; }
    }
    // Auftrag 17: höchstens 2 eigene harte Einheiten plus Spiel; Lauf-Qualität nur an einem Lauftag ohne harten Nachbartag, im langen Lauf nur
    // in den letzten 8 Wochen vor einem Laufziel. Deshalb gibt es Pläne mit wenig Lauf-Qualität; die Rad-Schlüsseleinheit bleibt.
    if (cautious) { if (both) expect(either / both).toBeGreaterThanOrEqual(0.8); if (bikeWeeks) expect(bikeHard / bikeWeeks).toBeGreaterThanOrEqual(0.35); }
    else if (bikeWeeks) expect(bikeHard / bikeWeeks).toBeGreaterThanOrEqual(0.7);
    if (baseWeeks >= 3) expect(baseVar / baseWeeks).toBeGreaterThanOrEqual(0.5);
  });
  test('nie zwei harte Lauftage hintereinander, kein harter Lauf am Tag nach einem Spiel', () => {
    const days = C.planDays(weeks);
    days.forEach((d: any, i: number) => {
      const hardRun = d.sessions.some((s: any) => s.sport === 'run' && s.hard && !s.race && !/test/i.test(s.title));
      if (!hardRun || i === 0) return;
      const prev = days[i - 1];
      expect(prev.sessions.some((s: any) => s.sport === 'run' && s.hard && !s.race)).toBe(false);
      expect(prev.sessions.some((s: any) => s.sport === 'football' && /Spiel/.test(s.title))).toBe(false);
    });
  });
  test('nach jedem Wettkampf lockere Tage (Sprint 3, Olympisch 5, Mittel 10, Lang/Marathon 14), danach erst Aufbau', () => {
    const races = C.planDays(weeks).flatMap((d: any) => d.sessions.filter((s: any) => s.race).map((s: any) => ({ date: d.date, type: ((goals as any[]).find(g => g.id === s.goalId) || {}).type })));
    for (const r of races) {
      const n = easyAfterDays(r.type || 'tri_sprint');
      for (const d of C.planDays(weeks).filter((x: any) => x.date > r.date && x.date <= C.addDays(r.date, n)))
        d.sessions.filter((s: any) => !s.fixed && !s.race && s.sport !== 'football').forEach((s: any) => expect(isIntense(s)).toBe(false));
    }
  });
  test('Schwimmen steigert sich sichtbar: Meter pro Einheit stehen dran und steigen über den Plan', () => {
    const sw = C.planDays(weeks).flatMap((d: any) => d.sessions.filter((s: any) => s.sport === 'swim' && !s.race && !/test/i.test(s.title)));
    if (sw.length < 6) return;
    sw.forEach((s: any) => expect(s.plannedKm).toBeGreaterThan(0));
    const m = sw.map((s: any) => s.plannedKm);
    const first = m.slice(0, 4).reduce((a: number, b: number) => a + b, 0) / 4, best = Math.max(...m);
    expect(best).toBeGreaterThan(first);
    void dow;
  });
});

describe('Rad und Lauf: Fortschritt der Schlüsseleinheiten', () => {
  test('Rad: Sweet Spot → Schwelle/Over-Unders → kurz: VO2max, lang: Wettkampftempo', () => {
    const ol = applyOnboarding(PERSONAS.find(p => p.id === 'olympisch-erfahren')!.answers, today).gen!.plan;
    const ld = applyOnboarding(PERSONAS.find(p => p.id === 'langdistanz-profi')!.answers, today).gen!.plan;
    const titles = (p: any, phase: string) => p.weeks.filter((w: any) => w.phase === phase).flatMap((w: any) => own(w).filter((s: any) => s.sport === 'bike' && s.hard).map((s: any) => s.title));
    expect(titles(ol, 'base').join(' ')).toMatch(/Sweet Spot/);
    expect(titles(ol, 'build').join(' ')).toMatch(/an der Schwelle|Over-Unders/);
    expect(titles(ol, 'specific').join(' ')).toMatch(/sehr hart/);
    expect(titles(ld, 'specific').join(' ')).toMatch(/Wettkampftempo/);
  });
  test('Lauf: Aufbau Schwelle, spezifisch Wettkampftempo (Halbmarathon-Tempo vor Mittel-, 10-km-Tempo vor Olympisch)', () => {
    const ol = applyOnboarding(PERSONAS.find(p => p.id === 'olympisch-erfahren')!.answers, today).gen!.plan;
    const runs = (p: any, phase: string) => p.weeks.filter((w: any) => w.phase === phase).flatMap((w: any) => own(w).filter((s: any) => s.sport === 'run' && s.hard).map((s: any) => s.title + ' ' + s.description)).join(' ');
    expect(runs(ol, 'build')).toMatch(/Schwelle/);
    expect(runs(ol, 'specific')).toMatch(/10-km-Tempo/);
  });
  // Auftrag 17: Do liegt zwischen Mi (Rad hart) und Fr (Spiel): nie hart. Tempo im langen Lauf nur in den letzten 8 Wochen vor einem Laufziel,
  // nur jede 2. Woche – hier (Ironman 2029, kein Laufziel) also nie; der lange Lauf bleibt locker.
  test('fester Wochenaufbau (Mi Rad hart, Fr Spiel, 17 Jahre): Do nie hart, langer Lauf locker ohne Laufziel, höchstens Spiel + 1 harte Einheit', () => {
    const p = patternPlan(true).plan;
    const build = p.weeks.filter((w: any) => w.phase === 'build' && !w.isRecoveryWeek && !w.reduced);
    expect(build.length).toBeGreaterThan(0);
    for (const w of build) {
      const sun = w.days.find((d: any) => dow(d.date) === 0), thu = w.days.find((d: any) => dow(d.date) === 4);
      expect(thu.sessions.filter((s: any) => s.sport === 'run').some((s: any) => s.hard)).toBe(false);
      const wed = w.days.find((d: any) => dow(d.date) === 3);
      const bikeKey = wed.sessions.some((s: any) => s.sport === 'bike' && s.hard);
      // unter 18 höchstens 2 harte Tage (Spiel + eine Qualität), ab 18 höchstens 2 eigene plus Spiel
      const adult = +w.startDate.slice(0, 4) - 2009 >= 18;
      expect(w.days.filter((d: any) => d.sessions.some((s: any) => s.hard || /Spiel/.test(s.title))).length).toBeLessThanOrEqual(adult ? 3 : 2);
      void bikeKey;
      expect(sun.sessions.some((s: any) => s.sport === 'run' && s.spec && s.spec.kind === 'longq')).toBe(false);
    }
    expect(build.filter((w: any) => w.days.some((d: any) => dow(d.date) === 3 && d.sessions.some((s: any) => s.sport === 'bike' && s.hard))).length).toBeGreaterThanOrEqual(Math.floor(build.length / 2));
  });
});
