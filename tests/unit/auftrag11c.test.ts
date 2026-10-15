/* Auftrag 11, Punkt 7: Rundum-Check mit fünf sehr unterschiedlichen neuen Nutzern (Fragebogen → erster Plan → erste Woche → Coach) */
import { describe, expect, test } from 'vitest';
import { NEW_USERS, NEWUSER_TODAY as today } from '../../fixtures/newusers';
import { applyOnboarding, understood, missingRequired } from '../../shared/onboarding';
import { checkPlan } from '../../shared/plancheck';
import { explainDay } from '../../shared/coach/explain';
import * as C from '../../shared/core';

describe.each(NEW_USERS.map(u => [u.id, u] as const))('%s', (_id, u) => {
  const r = applyOnboarding(u.answers, today, undefined, { from: today });
  const weeks = r.gen!.plan.weeks;
  const all = C.planDays(weeks.slice(0, 8)).flatMap((d: any) => d.sessions.map((s: any) => ({ ...s, date: d.date })));
  test('Fragebogen vollständig, Zusammenfassung ohne „nach Plan“ und mit deutschen Kommas', () => {
    expect(missingRequired(u.answers)).toEqual([]);
    const txt = understood(u.answers, today).map(x => x.text).join(' | ');
    expect(txt).not.toMatch(/nach Plan|\d\.\d h/);
  });
  test('Plan beginnt heute, Planprüfung ohne Befund, keine falschen Hinweise', () => {
    expect(weeks[0].partial).toBe(true);
    expect(C.planDays(weeks).find((d: any) => d.date === today)).toBeTruthy();
    expect(checkPlan(weeks.slice(0, 8), r.profile, r.goals, today)).toEqual([]);
    expect(r.gen!.conflicts).toEqual([]);
  });
  test('verständliche Einheiten: keine „0.25 min“, nichts „Langes“ unter 50/75 min, keine leeren Einheiten', () => {
    for (const s of all.filter((x: any) => x.sport !== 'rest')) {
      expect(s.description || '').not.toMatch(/\d\.\d+ min/);
      expect(s.title).not.toMatch(/^Langer Lauf [1-4]\d min|^Lange Ausfahrt [1-6]\d min/);
      if (!s.fixed && !s.race) expect(s.plannedMinutes).toBeGreaterThanOrEqual(15);
    }
  });
  test('Tests nur, wenn das Können passt', () => {
    const sk = r.profile.skills || {};
    if (sk.swimCrawl === 'no') expect(all.some((s: any) => /Kraul-Check|Schwimmtest/.test(s.title))).toBe(false);
    if ((sk.bikeLongestMin ?? 999) < 75) expect(all.some((s: any) => /Radtest/.test(s.title))).toBe(false);
    if (!((sk.swimCrawlM || 0) >= 400)) expect(all.some((s: any) => s.title === 'Schwimmtest 400/200 m')).toBe(false);
  });
  test('Coach erklärt die erste geplante Einheit', () => {
    const first = C.planDays(weeks).find((d: any) => d.date >= today && d.sessions.some((s: any) => s.sport !== 'rest'))!;
    const ctx: any = { today, now: 0, state: { sessions: {}, adjustments: {}, trend: [], illnessPeriods: [], customWorkouts: {}, coachMsgs: {} }, baseWeeks: weeks, planMeta: r.gen!.plan.meta, profile: r.profile, goals: r.goals };
    const t = explainDay(ctx, first.date, null).text;
    expect(t).toMatch(/Hauptteil|Training|Übungen|Spiel/);
    expect(t).not.toMatch(/Spiel\/Training|undefined|NaN/);
  });
});
