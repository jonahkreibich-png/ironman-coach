/* Auftrag 19, Punkt 3 (Jonahs Wahl: Variante C): oben Balken je Tag, darunter jeder Tag als Zeile; heute ist aufgeklappt,
   ein Tipp klappt einen Tag auf (nochmal: zu). Im aufgeklappten Tag steht unter jeder Einheit kurz, was man tun soll. */
import { test, expect, type Page } from '@playwright/test';
import { seed, open, TODAY as T0 } from './helpers';
// ein Tag im neu geplanten Abschnitt (ab 19.10.), damit jede Einheit ihren Aufbau hat
const TODAY = '2026-10-21';
import { replanPlan } from '../../shared/replan';
import { oldPlan, profile, goals, state } from '../../fixtures/pattern-person';

let PLAN: any = null;
const plan = () => PLAN || (PLAN = replanPlan(oldPlan(), profile as any, [...goals, { id: 'g-hm', type: 'run_half', name: 'Halbmarathon', date: '2027-04-04', priority: 'B' }] as any, T0, { state: state(), adjustments: {}, from: '2026-10-19' })!.plan);
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

test('Woche: 7 Balken, 7 Tage, heute offen mit Kurzbeschreibung, Antippen klappt auf und zu', async ({ page }) => {
  await seed(page, { today: TODAY, extra: d => { d.plan = plan(); } });
  await open(page, '/?go=plan');
  await expect(page.locator('.pm-c')).toHaveCount(7);
  await expect(page.locator('.cday')).toHaveCount(7);
  await expect(page.locator(`.cday.open[data-day="${TODAY}"]`)).toBeVisible();
  // unter jeder Einheit (mit Aufbau) kurz, was zu tun ist (ist heute Ruhetag: ersten Tag mit Training öffnen)
  if (await page.locator('.cday.open.rest').count()) await page.locator('.cday:not(.rest) .cday-h').first().click();
  const rows = page.locator('.cday.open .pr.wo');
  const whats = page.locator('.cday.open [data-what]');
  expect(await whats.count()).toBeGreaterThan(0);
  expect(await whats.count()).toBeLessThanOrEqual(await rows.count());
  await expect(whats.first()).toHaveText(/\d/);
  // anderen Tag mit Training aufklappen: genau einer offen, dann wieder zu
  const other = page.locator('.cday:not(.rest):not(.open) .cday-h').first();
  const day = await other.getAttribute('data-date');
  await other.click();
  await expect(page.locator('.cday.open')).toHaveCount(1);
  await expect(page.locator(`.cday.open[data-day="${day}"] [data-what]`).first()).toBeVisible();
  await page.locator(`.cday[data-day="${day}"] .cday-h`).click();
  await expect(page.locator('.cday.open')).toHaveCount(0);
  // Balken antippen öffnet den Tag, „Heute“ springt zurück
  await page.locator(`.pm-c[data-date="${day}"]`).click();
  await expect(page.locator(`.cday.open[data-day="${day}"]`)).toBeVisible();
  await page.locator('[data-act="plan-today"]').click();
  await expect(page.locator(`.cday.open[data-day="${TODAY}"]`)).toBeVisible();
  // Einheit antippen zeigt die Details (Tag mit Training öffnen)
  await page.locator(`.cday[data-day="${day}"] .cday-h`).click();
  await page.locator('.cday.open .pr.wo [data-act="sess-open"]').first().click();
  await expect(page.locator('#sheetPanel')).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
});

for (const w of [320, 390, 430]) for (const dark of [false, true]) {
  test(`Plan-Tab ${w} px ${dark ? 'dunkel' : 'hell'}: nichts ragt heraus`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
    await seed(page, { today: TODAY, extra: d => { d.plan = plan(); } });
    await open(page, '/?go=plan');
    expect(await noSideScroll(page)).toBe(true);
    const out = await page.evaluate(() => [...document.querySelectorAll('.pmix *, .cdays *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).length);
    expect(out).toBe(0);
    await page.screenshot({ path: `test-results/a19-plan-c-${w}-${dark ? 'dunkel' : 'hell'}.png`, fullPage: true });
  });
}
