/* Auftrag 8 in der App: unter jeder Woche Umfang und Steigerung zur letzten Aufbauwoche, Testfelder nur bei Tests. */
import { test, expect } from '@playwright/test';
import { seed, open, TODAY, openPlanSession } from './helpers';

test('Plan: Wochenkopf rechts kurz „erledigt/geplant · Stunden“, Steigerung als eigene Zeile links', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=plan');
  await expect(page.locator('[data-week-count]')).toContainText(/\d+\/\d+/);
  await expect(page.locator('[data-week-count]')).toContainText(/\d+(,\d)? h/);
  const chips = page.locator('[data-act="plan-week"]');
  await chips.nth(Math.min(2, (await chips.count()) - 1)).click();
  await expect(page.locator('[data-week-volume]')).toHaveText(/^[+−±]\d+ % zur letzten Aufbauwoche$/);
  await expect(page.locator('[data-week-count]')).not.toContainText('%');
});

test('Testfelder erscheinen nur beim Test (Radtest: Ø-Puls und Ø-Watt der 20 min)', async ({ page }) => {
  const demo = await seed(page, { extra: d => {
    const days = d.plan.weeks.flatMap((w: any) => w.days);
    const day = days.find((x: any) => x.date < TODAY && x.sessions.some((s: any) => s.sport === 'bike'));
    const bike = day.sessions.find((s: any) => s.sport === 'bike');
    bike.title = 'Radtest 20 min';
    const other = days.find((x: any) => x.date < TODAY && x !== day && x.sessions.some((s: any) => s.sport === 'bike')).sessions.find((s: any) => s.sport === 'bike');
    d.sessions = { ...(d.sessions || {}), [bike.id]: { completed: true }, [other.id]: { completed: true } };
    d.__ids = [bike.id, other.id];
  } });
  const [testId, otherId] = (demo as any).__ids;
  const openSess = async (id: string) => {
    await open(page, '/?go=plan');
    await openPlanSession(page, id);
  };
  await openSess(testId);
  await expect(page.locator('#sheetPanel #fd-testHr')).toBeVisible();
  await expect(page.locator('#sheetPanel #fd-testPower')).toBeVisible();
  await openSess(otherId);
  await expect(page.locator('#sheetPanel [data-fields="bike"]')).toBeVisible();
  await expect(page.locator('#sheetPanel #fd-testHr')).toHaveCount(0);
});

test('Plan: Zeitleiste mit Phasen und Zielen, Platzhalter gekennzeichnet (Auftrag 9)', async ({ page }) => {
  await seed(page, { extra: d => {
    d.plan.meta.timeline = { from: '2026-10-19', to: '2029-09-16', segments: [
      { phase: 'base', from: '2026-10-19', to: '2027-02-21', goalId: 's' }, { phase: 'build', from: '2027-02-22', to: '2027-05-09', goalId: 's' }, { phase: 'specific', from: '2027-05-10', to: '2027-06-06', goalId: 's' }, { phase: 'race', from: '2027-06-07', to: '2027-06-13', goalId: 's' },
      { phase: 'base', from: '2027-06-14', to: '2029-05-31', goalId: 'A' }, { phase: 'taper', from: '2029-06-01', to: '2029-09-08', goalId: 'A' }, { phase: 'race', from: '2029-09-09', to: '2029-09-16', goalId: 'A' }],
      goals: [{ id: 's', name: 'Sprint-Triathlon', date: '2027-06-13', priority: 'C', placeholder: true }, { id: 'A', name: 'Ironman', date: '2029-09-15', priority: 'A' }] };
  } });
  await open(page, '/?go=plan');
  const tl = page.locator('[data-timeline]');
  await expect(tl).toBeVisible();
  await expect(tl.locator('.tl-seg')).toHaveCount(7);
  await expect(tl).toContainText('Sprint-Triathlon');
  await expect(tl).toContainText('Platzhalter');
  await expect(tl.locator('[data-tl-now]')).toContainText(/Jetzt: /);
});
