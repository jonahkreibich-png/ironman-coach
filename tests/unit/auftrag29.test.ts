/* Auftrag 29: Stabilisierung – jeder gemeldete Fehler mit Test (vorher rot, jetzt grün).
   1. Dauer aus einer Quelle: Anpassungen (Ampel, Pause, Schmerz, Chat …) bauen Titel/Dauer/Beschreibung aus den Bausteinen.
   2. Eingaben: Einheiten, Komma/Punkt, Tausenderpunkt, Schrittlänge cm/m, keine stille Umwandlung.
   3. Coach-Prüfer: jede genannte Zahl gegen die gespeicherten Ist-Werte, 300 Fälle inkl. nachträglich korrigierter Werte.
   4. Extra-Einheit erst ohne Werte gespeichert, Werte nachgetragen: Dauer überall dieselbe (kein „+ ?“).
   5. Negative Werte (Entkopplung, Temperatur) fallen nicht mehr still weg. */
import { describe, test, expect } from 'vitest';
import * as C from '../../shared/core';
import * as W from '../../shared/workouts';
import { consistencyIssues } from '../../shared/plancheck';
import { checkField, parseInput, INPUTS, inputDisplay } from '../../shared/validate';
import { checkValueClaims, type ValueFacts } from '../../shared/coach/claims';
import { daySummary } from '../../shared/plan-summary26';
import { effectiveActivity, resultNumber } from '../../shared/results';
import { readIvValue } from '../../web/src/views/intervalsui';

const ctx: W.PaceCtx = { bikeKmh: 25, lthrBike: 160, lthrRun: 170, runThrSec: 300, bikeName: 'Gravelbike', css: 140 };
const S = (part: any, o: any) => ({ part, ...o });
/* Jonahs Einheit vom 7.11.: „Ausfahrt 52 min mit 12 min Sweet Spot (Gravelbike)“ */
const jonahSpec = (): W.Spec => ({ sport: 'bike', kind: 'longq', ctx, steps: [S('warm', { min: 15, zone: 1 }), S('main', { min: 5, zone: 2 }), S('main', { reps: 1, min: 12, zone: 3, restMin: 4 }), S('main', { min: 10, zone: 2 }), S('cool', { min: 10, zone: 1 })] } as any);
function weekWith(sessions: any[], date = '2026-11-07') { return [{ weekNumber: 1, startDate: '2026-11-02', endDate: '2026-11-08', days: [{ date, sessions }] }]; }
const effective = (weeks: any[], adj: Record<string, any>) => C.planDays(C.applyAdjustments(weeks, adj))[0].sessions[0];

describe('1. Dauer aus einer Quelle', () => {
  test('Jonahs Fall: Ampel gelb setzt Titel/Dauer/Beschreibung ohne Bausteine → alles wieder stimmig', () => {
    const base = { id: 's1', ...W.build(jonahSpec()) };
    expect(base.title).toBe('Ausfahrt 52 min mit 12 min Sweet Spot (Gravelbike)');
    expect(base.plannedMinutes).toBe(52);
    // genau die gespeicherte Anpassung aus den echten Daten
    const adj = { a: { id: 'a', type: 'modify', sessionId: 's1', createdAt: 1, set: { title: 'Zone 2 statt: Ausfahrt 52 min mit 12 min Sweet Spot (Gravelbike)', zone: 'Zone 2', plannedMinutes: 40, plannedKm: 15, description: 'Ampel gelb. Statt Intervallen eine lockere Zone-2-Einheit, 20 % kürzer.' } } };
    // ohne Angleichung wäre es widersprüchlich (so stand es bei Jonah)
    const raw = { ...base, ...adj.a.set };
    expect(consistencyIssues(raw).join(' ')).toMatch(/Bausteine ergeben 52 min/);
    const s = effective(weekWith([base]), adj);
    expect(consistencyIssues(s)).toEqual([]);
    expect(s.plannedMinutes).toBe(40);
    expect(W.totals(s.spec).min).toBe(40);
    expect(s.title).toBe('Zone 2 statt: Ausfahrt mit Sweet Spot (Gravelbike)');
    expect(s.title).not.toMatch(/52|12 min/);
    expect(s.description).toMatch(/^Ampel gelb\./);
    expect(s.description).toMatch(/Gesamt: 40 min/);
    expect(s.spec.steps.every((x: any) => (x.zone || 2) <= 2)).toBe(true);
  });
  // alle Arten, wie Anpassungen in der App entstehen, auf allen Sportarten
  const bases: [string, () => W.Spec][] = [
    ['Rad Sweet Spot', () => W.bikeSweetSpot(ctx, 2, 12, 75)], ['Rad lang', () => jonahSpec()], ['Lauf Intervalle', () => W.runIntervals(ctx, 5, 4, 2)],
    ['Lauf locker', () => W.runEasy(ctx, 45)], ['Lauf Tempo', () => W.runTempo(ctx, 20)], ['Rad locker', () => W.bikeEasy(ctx, 60)],
    ['Schwimmen', () => W.swimSession(ctx, 'endurance', [S('main', { reps: 6, m: 100, zone: 2, mode: 'crawl', restSec: 20 })] as any)]
  ];
  const sets: [string, (s: any) => any][] = [
    ['Ampel gelb (Tagesanpassung)', s => ({ title: 'Zone 2 statt: ' + s.title, zone: 'Zone 2', plannedMinutes: Math.round(s.plannedMinutes * 0.8 / 5) * 5, plannedKm: s.plannedKm ? Math.round(s.plannedKm * 8) / 10 : null, description: 'Ampel gelb. Statt Intervallen eine lockere Zone-2-Einheit, 20 % kürzer.' })],
    ['Ampel rot', s => ({ title: 'Locker statt: ' + s.title, plannedMinutes: Math.min(25, s.plannedMinutes), plannedKm: null, zone: 'Zone 1', description: 'Ampel rot. Heute Ruhetag oder höchstens 20-30 min ganz locker.' })],
    ['Pause (nur Minuten)', s => ({ plannedMinutes: Math.round(s.plannedMinutes * 0.7 / 5) * 5, plannedKm: s.plannedKm ? s.plannedKm * 0.7 : null })],
    ['Chat „locker“ ohne Bausteine', s => ({ title: 'Locker statt: ' + s.title, zone: 'Zone 2', plannedMinutes: Math.min(45, s.plannedMinutes), plannedKm: null, hard: false, spec: null, description: 'Auf deinen Wunsch locker in Zone 2 statt hart.' })],
    ['Schnupfen', s => ({ title: 'Locker und kurz statt: ' + s.title, zone: 'Zone 1-2', plannedMinutes: Math.min(30, s.plannedMinutes), plannedKm: null, hard: false, long: false, description: 'Hals-Regel: nur locker und kurz.' })],
    ['Extra-Einheit davor hart', s => ({ title: 'Zone 2 statt: ' + s.title, zone: 'Zone 2', plannedMinutes: Math.round(s.plannedMinutes * 0.8 / 5) * 5, plannedKm: s.plannedKm ? Math.round(s.plannedKm * 8) / 10 : null, description: 'Nach der harten Extra-Einheit locker in Zone 2, 20 % kürzer.' })]
  ];
  for (const [bn, mk] of bases) for (const [sn, set] of sets) test(`${bn} + ${sn}: Titel, Beschreibung, Dauer, Distanz und Bausteine stimmen überein`, () => {
    const base = { id: 's1', ...W.build(mk()) };
    expect(consistencyIssues(base)).toEqual([]);
    const s = effective(weekWith([base]), { a: { id: 'a', type: 'modify', sessionId: 's1', createdAt: 1, set: set(base) } });
    expect(consistencyIssues(s)).toEqual([]);
  });
  test('zwei Anpassungen hintereinander (Wochenumfang, dann Ampel) bleiben stimmig', () => {
    const base = { id: 's1', ...W.build(W.bikeSweetSpot(ctx, 2, 12, 75)) };
    const short = W.build(W.bikeSweetSpot(ctx, 1, 12, 52));
    const adj = { v: { id: 'v', type: 'modify', sessionId: 's1', createdAt: 1, set: { title: short.title, plannedMinutes: short.plannedMinutes, plannedKm: short.plannedKm, description: short.description, spec: short.spec } },
      d: { id: 'd', type: 'modify', sessionId: 's1', createdAt: 2, set: { title: 'Zone 2 statt: ' + short.title, zone: 'Zone 2', plannedMinutes: 40, plannedKm: 15, description: 'Ampel gelb.' } } };
    expect(consistencyIssues(effective(weekWith([base]), adj))).toEqual([]);
  });
  test('Prüfung erkennt Widersprüche: Titel-Minuten, Beschreibung, Meter', () => {
    const b = { id: 'x', ...W.build(W.runEasy(ctx, 45)) };
    expect(consistencyIssues({ ...b, title: 'Lockerer Lauf 60 min' }).join()).toMatch(/Titel sagt 60 min/);
    expect(consistencyIssues({ ...b, description: b.description.replace(/Gesamt: 45 min/, 'Gesamt: 50 min') }).join()).toMatch(/Beschreibung sagt 50 min/);
    const sw = { id: 'y', ...W.build(W.swimSession(ctx, 'endurance', [S('main', { reps: 6, m: 100, zone: 2, mode: 'crawl', restSec: 20 })] as any)) };
    expect(consistencyIssues({ ...sw, plannedKm: 1.5 }).join()).toMatch(/Distanz|m, geplant/);
  });
});

describe('2. Eingaben wie ein Mensch', () => {
  const cases: [string, string, any, any][] = [
    // Schrittlänge: Einheit cm, 102 und 1,02 m werden erkannt (gespeichert in m wie von der Uhr)
    ['run', 'strideLen', '102', '1.02'], ['run', 'strideLen', '102 cm', '1.02'], ['run', 'strideLen', '1,02 m', '1.02'], ['run', 'strideLen', '1,02', '1.02'], ['run', 'strideLen', '1.02', '1.02'],
    ['run', 'strideLen', '10', null], ['run', 'strideLen', '400 cm', null],
    ['run', 'min', '45', '45'], ['run', 'min', '45 min', '45'], ['run', 'min', '1:30', '90'], ['run', 'min', '1 h 5', '65'], ['run', 'min', '1,5 h', '90'], ['run', 'min', 'abc', null],
    ['run', 'km', '10,5', '10.5'], ['run', 'km', '10.5', '10.5'], ['run', 'km', '10500 m', '10.5'], ['run', 'km', '1.5', '1.5'],
    ['swim', 'meters', '1500', '1500'], ['swim', 'meters', '1.500', '1500'], ['swim', 'meters', '1,5 km', '1500'], ['swim', 'meters', '1.500 m', '1500'],
    ['run', 'hr', '150', '150'], ['run', 'hr', '150 bpm', '150'], ['run', 'hr', '150 kg', null], ['run', 'hr', '20', null], ['run', 'hr', '155,5', '155.5'],
    ['run', 'decoupling', '3', '3'], ['run', 'decoupling', '3 %', '3'], ['run', 'decoupling', '-2,1', '-2.1'], ['run', 'decoupling', '4,5%', '4.5'],
    ['bike', 'fluid', '750', '750'], ['bike', 'fluid', '0,75 l', '750'], ['bike', 'power', '210 W', '210'], ['bike', 'speed', '27,4 km/h', '27.4'],
    ['run', 'pace', '5:30', '5:30'], ['run', 'pace', '530', '5:30'], ['swim', 'pace100', '2:27', '2:27']
  ];
  for (const [sp, k, raw, want] of cases) test(`${sp}.${k} „${raw}“ → ${want ?? 'abgelehnt'}`, () => {
    const r = checkField(sp, k, raw);
    if (want == null) { expect(r.ok).toBe(false); expect(r.msg).toBeTruthy(); }
    else { expect(r.ok).toBe(true); expect(r.value).toBe(want); }
  });
  test('Umrechnung in eine andere Einheit wird immer gemeldet (keine stille Umwandlung)', () => {
    expect(checkField('run', 'strideLen', '1,02 m').note).toMatch(/102 cm/);
    expect(checkField('run', 'min', '1:30').note).toMatch(/90 min/);
    expect(checkField('swim', 'meters', '1,5 km').note).toMatch(/1500 m/);
    expect(checkField('run', 'hr', '150').note).toBeUndefined();
  });
  test('Anzeige: Schrittlänge in cm, deutsches Komma', () => {
    expect(inputDisplay('run', 'strideLen', '1.02')).toBe('102');
    expect(inputDisplay('run', 'efficiency', '1.3')).toBe('1,3');
    expect(inputDisplay('run', 'efficiency', '1,3')).toBe('1,3');
  });
  test('Morgenwerte, Profil, Essen: Einheiten und Grenzen', () => {
    expect(parseInput(INPUTS.trend.sleepHours, '7:30').value).toBe(7.5);
    expect(parseInput(INPUTS.trend.sleepHours, '7,5 h').value).toBe(7.5);
    expect(parseInput(INPUTS.trend.restingHR, '52 bpm').value).toBe(52);
    expect(parseInput(INPUTS.trend.hrv, '1200').ok).toBe(false);
    expect(parseInput(INPUTS.profile.heightCm, '1,80 m').value).toBe(180);
    expect(parseInput(INPUTS.profile.heightCm, '1,80').value).toBe(180);
    expect(parseInput(INPUTS.profile.weightKg, '72,5 kg').value).toBe(72.5);
    expect(parseInput(INPUTS.profile.birthYear, '197').ok).toBe(false);
    expect(parseInput(INPUTS.food.kcal, '2.400').value).toBe(2400);
    expect(parseInput(INPUTS.skills.swimCrawlM, 'viel').ok).toBe(false);
  });
  test('Intervalle: keine stille Rundung mehr', () => {
    expect(readIvValue('hr', 'num', '155,5', 'run')).toEqual({ ok: true, v: 155.5 });
    expect(readIvValue('m', 'num', '1,2 km', 'swim')).toEqual({ ok: true, v: 1200 });
    expect(readIvValue('hr', 'num', '300', 'run').ok).toBe(false);
  });
});

describe('3. Coach-Prüfer: 300 Fälle', () => {
  // kleiner fester Zufallsgenerator, damit die Fälle wiederholbar sind
  let seed = 2929; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const de = (x: number, d = 0) => (d ? x.toFixed(d) : String(Math.round(x))).replace('.', ',');
  const today = '2026-11-07';
  const METRICS: { k: string; scope: 'session' | 'trend'; gen: () => number; say: (v: string, when: string) => string; dec: number }[] = [
    { k: 'dec', scope: 'session', gen: () => Math.round((rnd() * 12 - 2) * 10) / 10, dec: 1, say: (v, w) => `Dein Lauf ${w}: aerobe Entkopplung ${v} %.` },
    { k: 'hr', scope: 'session', gen: () => 120 + Math.floor(rnd() * 60), dec: 0, say: (v, w) => `Dein Lauf ${w} hatte einen Ø Puls von ${v}.` },
    { k: 'power', scope: 'session', gen: () => 150 + Math.floor(rnd() * 150), dec: 0, say: (v, w) => `Deine Ausfahrt ${w}: Leistung ${v} W.` },
    { k: 'rpe', scope: 'session', gen: () => 2 + Math.floor(rnd() * 8), dec: 0, say: (v, w) => `Dein Lauf ${w} war RPE ${v}.` },
    { k: 'restingHR', scope: 'trend', gen: () => 42 + Math.floor(rnd() * 25), dec: 0, say: (v, w) => `Dein Ruhepuls lag ${w} bei ${v}.` },
    { k: 'hrv', scope: 'trend', gen: () => 25 + Math.floor(rnd() * 80), dec: 0, say: (v, w) => `Deine HFV war ${w} ${v} ms.` },
    { k: 'sleepHours', scope: 'trend', gen: () => Math.round((4 + rnd() * 5) * 2) / 2, dec: 1, say: (v, w) => `Du hast ${w} ${v} h geschlafen.` }
  ];
  const WHEN: [string, string][] = [['heute', today], ['gestern', C.addDays(today, -1)], ['am Mittwoch', '2026-11-04'], ['am 5.11.', '2026-11-05']];
  const facts = (k: string, scope: string, date: string, v: number): ValueFacts => {
    const sport = k === 'power' ? 'bike' : 'run';
    return scope === 'trend' ? { items: [], trend: { [date]: { [k]: v } } } : { items: [{ date, sport, v: { [k]: v } }, { date: '2026-10-20', sport, v: { [k]: v + 7 } }], trend: {} };
  };
  let n = 0;
  for (let i = 0; i < 100; i++) {
    const M = pick(METRICS); const [when, date] = pick(WHEN);
    const stored = M.gen(); let wrong = M.gen(); if (Math.abs(wrong - stored) < (M.dec ? 0.2 : 2)) wrong = stored + (M.dec ? 1.5 : 9);
    const f = facts(M.k, M.scope, date, stored);
    // a) richtiger Wert bleibt unverändert
    test(`#${++n} ${M.k} ${when}: richtiger Wert ${de(stored, M.dec)} bleibt`, () => {
      const t = M.say(de(stored, M.dec), when);
      expect(checkValueClaims(t, f, today).text).toBe(t);
    });
    // b) falscher Wert wird auf den gespeicherten Wert berichtigt
    test(`#${++n} ${M.k} ${when}: falscher Wert ${de(wrong, M.dec)} → ${de(stored, M.dec)}`, () => {
      const r = checkValueClaims(M.say(de(wrong, M.dec), when), f, today);
      expect(r.text).toContain(de(stored, M.dec).replace(/,0$/, ''));
      expect(r.text.replace(/\d{1,2}\.\d{1,2}\./g, '')).not.toContain(de(wrong, M.dec));
    });
    // c) nachträglich korrigiert: dieselbe alte Nachricht zeigt den neuen gespeicherten Wert
    test(`#${++n} ${M.k} ${when}: nach Korrektur ${de(stored, M.dec)} → ${de(wrong, M.dec)} gilt der neue Wert`, () => {
      const old = M.say(de(stored, M.dec), when);
      const r = checkValueClaims(old, facts(M.k, M.scope, date, wrong), today);
      expect(r.text).toContain(de(wrong, M.dec).replace(/,0$/, ''));
    });
  }
  test('Ziele, Bereiche, Durchschnitte und Fragen werden nicht verändert', () => {
    const f: ValueFacts = { items: [{ date: today, sport: 'run', v: { hr: 150, dec: 3 } }], trend: {} };
    for (const t of ['Halte den Puls unter 140.', 'Im Schnitt deiner letzten Läufe lag die Entkopplung bei 4,5 %.', 'Ziel: Entkopplung unter 5 %.', 'War dein Puls heute über 160?', 'Bleib bei Puls 130-145.'])
      expect(checkValueClaims(t, f, today).text).toBe(t);
  });
  test('ohne gespeicherten Wert fällt die Behauptung weg', () => {
    const r = checkValueClaims('Gut gemacht. Dein Lauf am Montag hatte eine Entkopplung von 2 %.', { items: [], trend: {} }, today);
    expect(r.text).toBe('Gut gemacht.');
  });
  test('Jonahs Meldung: „Etappenziel erreicht, aerobe Entkopplung 4,5 %“ bei eingetragenen 3 %', () => {
    const f: ValueFacts = { items: [{ date: '2026-11-04', sport: 'run', v: { dec: 3 } }], trend: {} };
    expect(checkValueClaims('Laufen: Etappenziel erreicht, aerobe Entkopplung 4,5 % (Ziel war 5,0 %).', f, today).text).toBe('Laufen: Etappenziel erreicht, aerobe Entkopplung 3 % (Ziel war 5,0 %).');
  });
});

describe('4. Extra-Einheit: erst ohne Werte gespeichert, dann nachgetragen', () => {
  test('Dauer kommt aus den eingetragenen Minuten (kein „+ ?“)', () => {
    const day = { date: '2026-11-06', sessions: [] };
    const st: any = { sessions: {}, activities: {}, customWorkouts: { '2026-11-06': [{ id: 'c1', sport: 'swim', title: 'Schwimmen', completed: true, source: 'manual', plannedMinutes: null, metrics: {} }] } };
    expect(daySummary(day, st).unknownPlannedMinutes).toBe(1);
    st.customWorkouts['2026-11-06'][0].metrics = { min: '43', meters: '1000' };
    const s = daySummary(day, st);
    expect(s.plannedMinutes).toBe(43); expect(s.actualMinutes).toBe(43); expect(s.unknownPlannedMinutes).toBe(0); expect(s.extras[0].actualMinutes).toBe(43);
  });
});

describe('5. Negative Werte bleiben erhalten', () => {
  test('Entkopplung −2,1 % und −3 °C', () => {
    expect(resultNumber('-2,1')).toBeNull();
    expect(resultNumber('-2,1', true)).toBe(-2.1);
    const a = effectiveActivity({ id: 'a', sport: 'run', min: 40 }, { metrics: { decoupling: '-2.1', temp: '-3' }, metricsSrc: { decoupling: 'manual', temp: 'manual' } });
    expect(a.decouplingPct).toBe(-2.1); expect(a.tempC).toBe(-3);
  });
});
