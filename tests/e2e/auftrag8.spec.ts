/* Auftrag 8 in der App: unter jeder Woche Umfang und Steigerung zur letzten Aufbauwoche, Testfelder nur bei Tests. */
import { test, expect } from '@playwright/test';
import { seed, open, TODAY } from './helpers';

test('Plan: jede Woche zeigt „Umfang X h (+Y % zur letzten Aufbauwoche)“', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=plan');
  const vol = page.locator('[data-week-volume]');
  await expect(vol).toBeVisible();
  await expect(vol).toContainText(/^Umfang \d+(,\d)? h/);
  // eine spätere Woche hat eine Bezugswoche
  const chips = page.locator('[data-act="plan-week"]');
  await chips.nth(Math.min(2, (await chips.count()) - 1)).click();
  await expect(page.locator('[data-week-volume]')).toContainText(/Umfang \d+(,\d)? h \([+−±]\d+ % zur letzten Aufbauwoche\)/);
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
    for (let i = 0; i < 12 && !(await page.locator(`[data-act="sess-open"][data-sid="${id}"]`).count()); i++) await page.locator('[data-act="plan-week"]').nth(i).click();
    await page.locator(`[data-act="sess-open"][data-sid="${id}"]`).click();
  };
  await openSess(testId);
  await expect(page.locator('#sheetPanel #fd-testHr')).toBeVisible();
  await expect(page.locator('#sheetPanel #fd-testPower')).toBeVisible();
  await openSess(otherId);
  await expect(page.locator('#sheetPanel [data-fields="bike"]')).toBeVisible();
  await expect(page.locator('#sheetPanel #fd-testHr')).toHaveCount(0);
});
