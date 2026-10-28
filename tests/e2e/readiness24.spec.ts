import { test, expect } from './storage-harness';
import { seed, open, stored, writeStored } from './helpers';

import { readiness24Fixture, READINESS24_TODAY as today, READINESS24_YELLOW_SLEEP } from '../../fixtures/readiness24';

async function yellowState(page: any) {
  await seed(page, { today, extra: readiness24Fixture });
}
for (const width of [320, 768]) test(`Ampel Heute und Coach gleich; Korrektur und Neustart bleiben konsistent (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await yellowState(page);
  await open(page, '/?go=heute'); await expect(page.locator('.answer.l1')).toBeVisible();
  await page.goto('/?go=coach'); await expect(page.locator('[data-now]')).toContainText(/gelb/i);
  await page.fill('#coach-in', 'Wie ist meine Ampel?'); await page.locator('[data-act="coach-send"]').click();
  const message = page.locator('.feed .msg.coach').last();
  await expect(message).toContainText(/gelb/i, { timeout: 10000 }); await expect(message).not.toContainText(/Ampel rot/i);
  const saved = await stored(page); expect(saved.trend.find((p: any) => p.date === today).sleepHours).toBe(READINESS24_YELLOW_SLEEP);
  saved.trend.find((p: any) => p.date === today).sleepHours = 8.5; await writeStored(page, saved);
  await page.reload(); await expect(page.locator('[data-now]')).toContainText(/grün/i);
  await page.goto('/?go=heute'); await expect(page.locator('.answer.l0')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});
