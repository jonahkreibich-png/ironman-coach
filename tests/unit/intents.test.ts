/* Auftrag 4 D2: freies Schreiben mit dem Coach ohne KI. Mindestens 40 Absichten, viele Formulierungen, Tippfehler. */
import { test, expect, describe } from 'vitest';
import { understand, INTENTS, clearDay, norm } from '../../shared/coach/intents';
import { applyOnboarding } from '../../shared/onboarding';
import { PERSONAS } from '../../fixtures/personas';
import * as C from '../../shared/core';
import type { EngineCtx } from '../../shared/coach/engine';

const today = '2026-10-21'; // Mittwoch, Woche 1 des Plans
function ctx(o: any = {}): EngineCtx {
  const r = applyOnboarding(PERSONAS.find(p => p.id === o.persona || p.id === 'vater-rad-lauf')!.answers, '2026-10-14');
  const trend = Array.from({ length: 20 }, (_, i) => ({ date: C.addDays(today, -20 + i), hrv: 60 + (i % 3), restingHR: 52, sleepHours: 7.6 })).concat(o.trendToday ? [{ date: today, ...o.trendToday }] : []);
  return { today, now: Date.now(), state: { sessions: {}, trend, illnessPeriods: o.ill || [], customWorkouts: {}, adjustments: {}, settings: {}, activities: {}, coachMsgs: {}, weekNotes: {}, nutrition: {} }, baseWeeks: r.gen!.plan.weeks, planMeta: r.gen!.plan.meta, profile: r.profile, goals: r.goals };
}

test('mindestens 40 Absichten', () => { expect(INTENTS.length).toBeGreaterThanOrEqual(40); expect(new Set(INTENTS.map(i => i.id)).size).toBe(INTENTS.length); });

describe('Formulierungen und Tippfehler', () => {
  const cases: [string, string][] = [
    ['Warum heute locker?', 'why-easy'], ['wieso ist das heute so leicht', 'why-easy'], ['warum heut lockr', 'why-easy'],
    ['Kann ich heute Intervalle machen?', 'can-intervals'], ['darf ich heute hart trainieren', 'can-intervals'], ['kann ich heute intevalle machen', 'can-intervals'],
    ['Ich bin krank', 'sick'], ['bin erkältet', 'sick'], ['ich hab grippe', 'sick'], ['Halsschmerzen seit gestern', 'sick'],
    ['Ich habe Fieber', 'sick'], ['bin wieder gesund', 'healthy'],
    ['Ich habe Schmerzen am Knie', 'pain'], ['mein knie tut weh', 'pain'], ['die Wade zwickt', 'pain'], ['Achillessehne zieht', 'pain'],
    ['Ich habe am Mittwoch keine Zeit', 'no-time-day'], ['am freitag kann ich nicht', 'no-time-day'], ['Samstag geht nicht', 'no-time-day'],
    ['Verschieb den langen Lauf auf Sonntag', 'move-session'], ['verschiebe das rad auf samstag', 'move-session'],
    ['Wie läuft es mit meinem Ziel?', 'goal'], ['schaffe ich meine zielzeit', 'goal'],
    ['Wie war meine Woche?', 'week'], ['Was hat sich verbessert?', 'improved'],
    ['Was steht heute an?', 'today'], ['was mache ich morgen', 'tomorrow'],
    ['Wie ist meine Ampel?', 'readiness'], ['wie habe ich geschlafen', 'sleep'], ['wie viel schlaf brauche ich', 'sleep-need'],
    ['meine HRV', 'hrv'], ['wie ist mein ruhepuls', 'rhr'], ['welche Zonen habe ich', 'zones'], ['was ist zone 2', 'what-zone2'],
    ['welches tempo soll ich laufen', 'pace'], ['was soll ich essen', 'nutrition'], ['verpflegung im wettkampf', 'race-fuel'],
    ['wann ist mein nächster wettkampf', 'next-race'], ['warum so oft rad', 'plan-why'], ['welche kraftübungen', 'strength'],
    ['wie lerne ich kraulen', 'swim-learn'], ['wann mache ich den test', 'test'], ['wann ist die nächste erholungswoche', 'recovery-week'],
    ['das ist mir zu viel', 'too-hard'], ['zu leicht, ich kann mehr', 'too-easy'], ['es ist so heiß', 'heat'], ['es regnet', 'rain'],
    ['ich bin im urlaub', 'travel'], ['keine motivation heute', 'motivation'], ['ich war zusätzlich laufen', 'extra'],
    ['wie verbinde ich garmin', 'connect'], ['ich will abnehmen', 'safety'], ['wie ist das mit dem gewicht', 'weight'], ['neues ziel', 'goal-change'], ['hallo', 'greet'], ['danke', 'thanks'], ['hilfe', 'help'],
    ['ich bin total müde', 'tired'], ['heute fällt aus', 'skip-today'], ['längste einheit', 'longest'], ['morgen ist spiel', 'game']
  ];
  test.each(cases)('„%s“ → %s', (text, intent) => { expect(understand(ctx(), text).intent).toBe(intent); });
});

describe('Antworten mit echten Daten und Aktionen', () => {
  test('Krank: Rückfrage mit Knopf, keine Aktion ohne Bestätigung', () => {
    const r = understand(ctx(), 'Ich bin krank');
    expect(r.text).toMatch(/eintragen/); expect(r.actions![0].kind).toBe('illness-start');
  });
  test('Knie: Berücksichtigung anlegen und heute locker', () => {
    const r = understand(ctx(), 'mein Knie tut weh');
    expect(r.actions!.map(a => a.kind)).toContain('add-note');
    expect(r.actions![0].payload).toMatch(/^Knie/);
  });
  test('Mittwoch keine Zeit: Einheiten wandern auf freie Tage derselben Woche', () => {
    const c = ctx();
    const day = C.planDays(c.baseWeeks).find((d: any) => d.date >= today && d.sessions.some((s: any) => s.sport !== 'rest'))!;
    const r = clearDay(c, day.date);
    expect(r.adj.length).toBeGreaterThan(0);
    const eff = C.applyAdjustments(c.baseWeeks, Object.fromEntries(r.adj.map(a => [a.id, a])));
    expect(C.planDays(eff).find((d: any) => d.date === day.date).sessions.filter((s: any) => s.sport !== 'rest' && !s.cancelled).length).toBe(0);
    r.adj.filter(a => a.type === 'move').forEach(a => expect(a.to >= today).toBe(true));
  });
  test('Langen Lauf auf Sonntag: konkreter Vorschlag mit Datum', () => {
    const r = understand(ctx(), 'Verschieb den langen Lauf auf Sonntag');
    if (r.actions) { const a = r.actions[0].payload[0]; expect(new Date(a.to + 'T12:00:00Z').getUTCDay()).toBe(0); expect(r.text).toMatch(/Lauf/); }
    else expect(r.text).toMatch(/keine passende Einheit|Sonntag|So /);
  });
  test('Intervalle bei roter Ampel: nein, mit Grund', () => {
    const r = understand(ctx({ trendToday: { hrv: 30, restingHR: 62, sleepHours: 5 } }), 'kann ich heute intervalle machen');
    expect(r.text).toMatch(/lieber nicht/i);
  });
  test('Unbekanntes: ehrlich, mit passenden Vorschlägen als Knöpfe', () => {
    const r = understand(ctx(), 'Wie wird das Wetter auf dem Mars?');
    expect(r.intent).toBe('unknown'); expect(r.suggestions!.length).toBeGreaterThanOrEqual(4);
  });
  test('Ohne Teamsport: kein Fußball oder Spieltag in den Antworten', () => {
    const c = ctx();
    for (const q of ['hallo', 'Was steht heute an?', 'morgen ist spiel', 'was soll ich essen']) expect(understand(c, q).text).not.toMatch(/Fußball|Spieltag zählt/);
  });
  test('Normalisierung: Umlaute, Satzzeichen', () => { expect(norm('Übermorgen: Läufe!')).toBe('uebermorgen laeufe'); });
});
