import { test, expect } from '@playwright/test';
import { seed, open, stored, TODAY } from './helpers';

test('Belastungswerte speichern, Widersprüche kennzeichnen und zur Automatik zurückkehren', async ({ page }) => {
  await seed(page, { extra: d => { d.trend = []; d.sessions = {}; d.customWorkouts = {}; d.activities = {}; } });
  await open(page, '/?go=werte');
  await expect(page.locator('#app .chart')).toHaveCount(0);
  await page.locator('[data-act="load-edit"]').click();
  await page.fill('#load-ctl', '42'); await page.locator('#load-ctl').press('Tab');
  await page.fill('#load-atl', '49'); await page.locator('#load-atl').press('Tab');
  await expect.poll(async () => (await stored(page)).trend.find((p: any) => p.date === TODAY)?.atl).toBe(49);
  await expect(page.locator('#load-tsb')).toHaveAttribute('placeholder', '-7');
  await page.fill('#load-tsb', '10'); await page.locator('#load-tsb').press('Tab');
  await expect(page.locator('[data-load-editor] .banner.warn')).toContainText('Widerspruch');
  await page.locator('[data-act="load-undo"]').click();
  await expect(page.locator('[data-load-editor] .banner.warn')).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.reload();
  await expect(page.locator('[data-load-values]')).toContainText('von Hand');
  await page.locator('[data-act="load-edit"]').click();
  await page.locator('[data-act="load-reset-all"]').click();
  await expect.poll(async () => Object.keys((await stored(page)).trend.find((p: any) => p.date === TODAY)._manual)).toEqual([]);
  await expect(page.locator('[data-load-history] summary')).toContainText('Änderungsverlauf');
});

test('ungültige und rückdatierte Eingaben verändern keine fremden Tageswerte', async ({ page }) => {
  await seed(page); await open(page, '/?go=werte');
  await page.locator('[data-act="load-edit"]').click();
  await page.fill('#load-ctl', '-1'); await page.locator('#load-ctl').press('Tab');
  expect((await stored(page)).trend.find((p: any) => p.date === TODAY)?._manual?.ctl).not.toBe(true);
  await page.fill('#load-date', '2026-10-01'); await page.locator('#load-date').press('Tab');
  await page.fill('#load-ctl', '30,5'); await page.locator('#load-ctl').press('Tab');
  await expect.poll(async () => (await stored(page)).trend.find((p: any) => p.date === '2026-10-01')?.ctl).toBe(30.5);
});
