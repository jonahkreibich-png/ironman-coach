/* Auftrag 29 (Ergänzung): „Anders trainiert als geplant“ – für alle Sportarten.
   Geplant Intervalle → Zone 2 gemacht, kürzer gemacht, andere Sportart, App-Anpassung wegen Krankheit/Temperatur.
   Titel, Coach-Bewertung, Belastung und Scores nutzen nur das Gemachte; ausgefallene Schlüsseleinheit wird nur nach Regeln nachgeholt. */
import { describe, test, expect } from 'vitest';
import * as C from '../../shared/core';
import { world, CHAT_TODAY } from '../helpers/chat-world';
import { actualTitle, actualSport, plannedLine, changedOf } from '../../shared/results';
import { doneItems, reviewItem } from '../../shared/coach/review';
import { legacyActivities } from '../../shared/scores';
import { consistencyIssues } from '../../shared/plancheck';

const SPORTS = ['run', 'bike', 'swim', 'strength', 'football'];
const OTHER: Record<string, string> = { run: 'bike', bike: 'swim', swim: 'run', strength: 'run', football: 'run' };
const done = (min: number, extra: any = {}) => ({ completed: true, metrics: { min: String(min), hr: '135' }, metricsSrc: { min: 'manual', hr: 'manual' }, ...extra });

describe('Titel zeigt, was wirklich gemacht wurde', () => {
  const s = { id: 'x', sport: 'bike', title: 'Rad-Intervalle 2×12 min Sweet Spot (Gravelbike)', plannedMinutes: 75, hard: true };
  test('Zone 2 statt Intervalle', () => {
    const st = done(60, { asPlanned: false, changed: { kind: 'easy', reason: 'tired' } });
    expect(actualTitle(s, st)).toBe('Rad Zone 2 · 60 min');
    expect(plannedLine(s, st)).toBe('geplant: Rad-Intervalle 2×12 min Sweet Spot (Gravelbike) · Grund: müde');
  });
  test('kürzer, andere Intervalle, andere Sportart', () => {
    expect(actualTitle(s, done(40, { asPlanned: false, changed: { kind: 'shorter' } }))).toBe('Rad-Intervalle Sweet Spot (Gravelbike) · 40 min');
    expect(actualTitle(s, done(70, { asPlanned: false, changed: { kind: 'otherIntervals' } }))).toBe('Rad: andere Intervalle · 70 min');
    const os = done(45, { asPlanned: false, changed: { kind: 'otherSport', sport: 'run' } });
    expect(actualTitle(s, os)).toBe('Laufen · 45 min'); expect(actualSport(s, os)).toBe('run');
  });
  test('so wie geplant: unverändert', () => {
    const st = done(75, { asPlanned: true });
    expect(changedOf(st)).toBeNull(); expect(actualTitle(s, st)).toBe(s.title); expect(plannedLine(s, st)).toBe('');
  });
});

/* echte Pläne einer Test-Person: je Sportart eine Einheit in der laufenden Woche */
function scenario(sport: string) {
  const W = world('jugend-langdistanz');
  const day = W.days().filter((d: any) => d.date <= CHAT_TODAY).reverse().find((d: any) => d.sessions.some((s: any) => s.sport === sport))
    || W.days().find((d: any) => d.sessions.some((s: any) => s.sport === sport));
  const s = day && day.sessions.find((x: any) => x.sport === sport);
  return { W, s, date: day && day.date };
}

describe('Alle Sportarten: Coach bewertet das Gemachte, Belastung und Scores zählen nur das Gemachte', () => {
  for (const sport of SPORTS) {
    for (const kind of ['easy', 'shorter', 'otherSport'] as const) test(`${sport}: ${kind}`, () => {
      const { W, s, date } = scenario(sport);
      if (!s) return; // Sportart kommt in diesem Plan nicht vor
      const W2 = world('jugend-langdistanz', date);
      const change = kind === 'otherSport' ? { kind, sport: OTHER[sport], reason: 'pain' } : { kind, reason: kind === 'shorter' ? 'time' : 'tired' };
      W2.state.sessions[s.id] = done(kind === 'shorter' ? Math.max(10, Math.round((s.plannedMinutes || 40) / 2)) : 40, { asPlanned: false, changed: change });
      const ctx: any = W2.ctx();
      const d = doneItems(ctx, date, date).find(x => x.key === s.id)!;
      expect(d).toBeTruthy();
      expect(d.sport).toBe(kind === 'otherSport' ? OTHER[sport] : sport);
      expect(d.title).toBe(actualTitle(s, W2.state.sessions[s.id]));
      const r = reviewItem(ctx, d);
      expect(r.text).toContain(d.title.split(' · ')[0]);
      if (kind === 'easy') expect(r.text).toMatch(/kein Problem, Zone 2|Lockerer als geplant/);
      if (kind === 'otherSport') expect(r.text).toMatch(/zählt als/);
      // keine Bewertung gegen die geplanten Intervalle, wenn locker/andere Sportart
      if (kind !== 'shorter') expect(r.text).not.toMatch(/Intervall(e)? (zu|nicht) (hart|geschafft)|Zone [345] (verfehlt|nicht erreicht)/);
      // Belastung: Sportart des Gemachten, locker
      const loads = C.dailyLoadEntries(W2.state, C.applyAdjustments(W2.plan.weeks, {})).filter((x: any) => x.key === 'session:' + s.id);
      expect(loads.length).toBe(1); expect(loads[0].sport).toBe(d.sport);
      // Scores (Einträge ohne Aufzeichnung): Sportart und Titel des Gemachten
      const la = legacyActivities(W2.state, W2.plan.weeks, W2.profile).find(a => a.id === 'sess-' + s.id);
      if (la) { expect(la.sport).toBe(d.sport); expect(la.name).toBe(d.title); }
    });
  }
  test('locker statt hart: weniger Belastung als die geplante harte Einheit', () => {
    const { s, date } = scenario('bike'); if (!s) return;
    const W2 = world('jugend-langdistanz', date);
    const hard = { ...s, hard: true, zone: 'Zone 4', title: 'Rad-Intervalle 4×8 min an der Schwelle' };
    const a = C.sessionLoad(hard, { completed: true, metrics: { min: '60' } });
    const b = C.sessionLoad(hard, { completed: true, metrics: { min: '60' }, asPlanned: false, changed: { kind: 'easy' } });
    expect(b).toBeLessThan(a); void W2;
  });
});

describe('Ausgefallene Schlüsseleinheit: nachholen nur nach Regeln', () => {
  test('nie neben einer anderen harten Einheit, nur einmal, nicht stapeln', () => {
    const W = world('jugend-langdistanz');
    const days = W.days();
    const key = days.flatMap((d: any) => d.sessions.map((s: any) => ({ d, s }))).find((x: any) => C.isKey(x.s) && !C.isTestOrRace(x.s) && x.d.date >= W.today);
    if (!key) return;
    const W2 = world('jugend-langdistanz', C.addDays(key.d.date, 1));
    W2.state.sessions[key.s.id] = done(40, { asPlanned: false, changed: { kind: 'easy', reason: 'tired' } });
    const adj = C.dailyAdjustments(W2.state, W2.plan.weeks, W2.today, {});
    const redo = adj.filter((a: any) => /^redo-/.test(a.id));
    expect(redo.length).toBeLessThanOrEqual(1);
    if (redo.length) {
      const eff = C.planDays(C.applyAdjustments(W2.plan.weeks, Object.fromEntries(adj.map((a: any, i: number) => [a.id, { ...a, createdAt: i }]))));
      const at = (dt: string) => (eff.find((d: any) => d.date === dt) || { sessions: [] }).sessions.filter((s: any) => !s.cancelled);
      const to = redo[0].to;
      for (const dt of [C.addDays(to, -1), C.addDays(to, 1)]) expect(at(dt).some((s: any) => C.isHard(s) && s.id !== key.s.id + '-nach')).toBe(false);
      expect(at(to).filter((s: any) => C.isHard(s)).length).toBe(1);
      // zweiter Lauf am selben Tag: nichts Neues (nicht stapeln)
      const again = C.dailyAdjustments({ ...W2.state, adjustments: Object.fromEntries(adj.map((a: any, i: number) => [a.id, { ...a, createdAt: i }])) }, W2.plan.weeks, W2.today, {});
      expect(again.filter((a: any) => /^redo-/.test(a.id)).length).toBe(0);
    }
    // so wie geplant gemacht: kein Nachholen
    const W3 = world('jugend-langdistanz', C.addDays(key.d.date, 1));
    W3.state.sessions[key.s.id] = done(60, { asPlanned: true });
    expect(C.dailyAdjustments(W3.state, W3.plan.weeks, W3.today, {}).filter((a: any) => /^redo-/.test(a.id))).toEqual([]);
  });
});

describe('Anpassung durch die App (Krankheit, Temperatur): neuer Titel, keine vermischten Titel', () => {
  test('alle Einheiten einer Woche mit Anpassung „Locker und kurz statt“ bleiben stimmig', () => {
    const W = world('jugend-langdistanz');
    const list = W.sessions(W.today, C.addDays(W.today, 6)).filter((s: any) => s.sport !== 'football');
    const adj: any = {};
    list.forEach((s: any, i: number) => { adj['ill-' + s.id] = { id: 'ill-' + s.id, type: 'modify', sessionId: s.id, createdAt: i, reason: 'leicht erhöhte Temperatur', set: { title: 'Locker und kurz statt: ' + s.title, zone: 'Zone 1-2', plannedMinutes: Math.min(30, s.plannedMinutes || 30), plannedKm: null, hard: false, long: false, description: 'Leicht erhöhte Temperatur: nur locker und kurz.' } }; });
    const eff = C.planDays(C.applyAdjustments(W.plan.weeks, adj)).flatMap((d: any) => d.sessions).filter((s: any) => adj['ill-' + s.id]);
    expect(eff.length).toBe(list.length);
    for (const s of eff) {
      expect(consistencyIssues(s), s.title).toEqual([]);
      expect(s.title).toMatch(/^Locker und kurz statt: /);
      expect(s.title.replace(/^Locker und kurz statt: /, '')).not.toMatch(/\d+ min|\d+×/);
      expect(s._orig && s._orig.title).toBeTruthy();
    }
  });
});

/* ---------- Auftrag 30: alle Arten von „Anders gemacht“ mit passenden Feldern ---------- */
import { changeZone, effectiveSession, changeKeepsStage, intervalsMode, changeText, omitOptions, changeParts, plannedLoadDropped as dropped30 } from '../../shared/results';
describe('Auftrag 30: alle Arten – Titel, Zone, Belastung, Stufe, Intervall-Liste, Coach-Kurzform', () => {
  const ss = { id: 'y', sport: 'bike', title: 'Rad-Intervalle 2×12 min Sweet Spot', plannedMinutes: 75, hard: true, zone: 'Zone 3' };
  const easyRun = { id: 'z', sport: 'run', title: 'Lockerer Lauf 45 min', plannedMinutes: 45, zone: 'Zone 2' };
  const swim = { id: 's', sport: 'swim', title: 'Schwimmen 1.200 m Technik', plannedMinutes: 45 };
  const brick = { id: 'b', sport: 'bike', title: 'Lange Ausfahrt 2 h + Koppellauf 15 min', plannedMinutes: 135 };
  const ch = (min: number, changed: any) => done(min, { asPlanned: false, changed });
  test('lockerer mit tatsächlicher Zone (Standard Zone 2)', () => {
    expect(actualTitle(ss, ch(60, { kind: 'easy', zone: 1 }))).toBe('Rad Zone 1 · 60 min');
    expect(changeZone(ch(60, { kind: 'easy' }), ss)).toBe(2);
    expect(effectiveSession(ss, ch(60, { kind: 'easy', zone: 1 }))).toMatchObject({ zone: 'Zone 1', hard: false, spec: null });
  });
  test('härter: Zone, Belastung höher als geplant locker, eigene Intervall-Liste', () => {
    const st = ch(45, { kind: 'harder', zone: 4 });
    expect(actualTitle(easyRun, st)).toBe('Laufen härter (Zone 4) · 45 min');
    // ohne Puls/RPE zählt die tatsächliche Zone (mit Puls zählt der gemessene Puls)
    expect(C.sessionLoad(easyRun, { completed: true, metrics: { min: '45' }, asPlanned: false, changed: { kind: 'harder', zone: 4 } })).toBeGreaterThan(C.sessionLoad(easyRun, { completed: true, metrics: { min: '45' } }));
    expect(intervalsMode(st)).toBe('free'); expect(changeKeepsStage(st)).toBe(false);
    expect(changeZone(ch(45, { kind: 'harder' }), easyRun)).toBe(4);
  });
  test('kürzer / länger: Dauer aus dem Feld (eine Quelle), Belastung folgt der tatsächlichen Dauer', () => {
    expect(actualTitle(easyRun, ch(70, { kind: 'longer' }))).toBe('Lockerer Lauf · 70 min');
    expect(C.sessionLoad(easyRun, ch(70, { kind: 'longer' }))).toBeGreaterThan(C.sessionLoad(easyRun, ch(30, { kind: 'shorter' })));
    expect(changeKeepsStage(ch(70, { kind: 'longer' }))).toBe(true);
  });
  test('abgebrochen nach X min: Titel, Härte fällt weg (Nachholen nach Regeln), keine Stufe', () => {
    const st = ch(25, { kind: 'aborted', reason: 'pain' });
    expect(actualTitle(ss, st)).toBe('Rad-Intervalle Sweet Spot · abgebrochen nach 25 min');
    expect(dropped30(st)).toBe(true); expect(changeKeepsStage(st)).toBe(false);
    expect(changeText(ss, st)).toBe('abgebrochen nach 25 min, Grund: Schmerzen');
  });
  test('drinnen / draußen je Sportart', () => {
    expect(actualTitle(easyRun, ch(45, { kind: 'place', place: 'in' }))).toBe('Lockerer Lauf 45 min · Laufband');
    expect(actualTitle(swim, ch(45, { kind: 'place', place: 'out' }))).toBe('Schwimmen 1.200 m Technik · Freiwasser');
    expect(changeKeepsStage(ch(45, { kind: 'place', place: 'in' }))).toBe(true);
  });
  test('aufgeteilt: Teile mit je Dauer, Summe, keine Intervall-Liste, kein langer Lauf', () => {
    const st = ch(55, { kind: 'split', parts: [30, 25] });
    expect(changeParts(st)).toEqual([30, 25]);
    expect(actualTitle(easyRun, st)).toBe('Lockerer Lauf · 2 Teile (30 + 25 min)');
    expect(intervalsMode(st)).toBe('none'); expect(effectiveSession({ ...easyRun, long: true }, st).long).toBe(false);
  });
  test('ohne Teil: Koppel, Hilfsmittel, nur Brust – Auswahl passt zur Einheit', () => {
    expect(omitOptions(brick).map(x => x[0])).toContain('brick');
    expect(omitOptions(swim).map(x => x[0])).toEqual(expect.arrayContaining(['aids', 'breastOnly']));
    expect(omitOptions(easyRun).map(x => x[0])).not.toContain('breastOnly');
    expect(actualTitle(brick, ch(120, { kind: 'omit', omit: 'brick' }))).toBe('Lange Ausfahrt 2 h · ohne Koppellauf');
    expect(actualTitle(swim, ch(45, { kind: 'omit', omit: 'breastOnly' }))).toBe('Schwimmen 1.200 m Technik · nur Brust');
    expect(changeKeepsStage(ch(45, { kind: 'omit', omit: 'breastOnly' }))).toBe(false);
    expect(changeKeepsStage(ch(45, { kind: 'omit', omit: 'aids' }))).toBe(true);
  });
  test('Grund Motivation; unbekannte Art zählt nicht als Änderung', () => {
    expect(plannedLine(ss, ch(60, { kind: 'easy', reason: 'motivation' }))).toBe('geplant: Rad-Intervalle 2×12 min Sweet Spot · Grund: Motivation');
    expect(changedOf(ch(60, { kind: 'quatsch' }))).toBeNull();
  });
  for (const kind of ['harder', 'longer', 'aborted', 'place', 'split', 'omit', 'otherIntervals'] as const) test(`Coach bewertet das Gemachte: ${kind}`, () => {
    const { s, date } = scenario('bike'); if (!s) return;
    const W2 = world('jugend-langdistanz', date);
    const extra: any = { place: { place: 'in' }, split: { parts: [40, 20] }, omit: { omit: 'warmup' }, harder: { zone: 5 } };
    W2.state.sessions[s.id] = ch(kind === 'aborted' ? 20 : 60, { kind, ...(extra[kind] || {}) });
    const ctx: any = W2.ctx();
    const d = doneItems(ctx, date, date).find(x => x.key === s.id)!;
    expect(d.title).toBe(actualTitle(s, W2.state.sessions[s.id]));
    const r = reviewItem(ctx, d);
    expect(r.text).toMatch({ harder: /Härter als geplant \(Zone 5\)/, longer: /Länger als geplant/, aborted: /Nach 20 min abgebrochen/, place: /Rolle statt wie geplant/, split: /In 2 Teilen gemacht \(40 \+ 20 min\)/, omit: /ohne Ein-\/Auslaufen/, otherIntervals: /Andere Intervalle/ }[kind]);
    const loads = C.dailyLoadEntries(W2.state, C.applyAdjustments(W2.plan.weeks, {})).filter((x: any) => x.key === 'session:' + s.id);
    expect(loads.length).toBe(1);
  });
});
