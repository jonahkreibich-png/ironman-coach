// nur lokal (Auftrag 34): Bilder der Tab-Leiste in Zeitlupe beim Antippen
import { test } from '@playwright/test';
import { seed, open } from './helpers';
test.skip(!process.env.BLICK, 'nur lokal');
test.use({ colorScheme: process.env.LIGHT ? 'light' : 'dark' });
test('Blick', async ({ page, browserName }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => { (window as any).__lensSlow = 8; });
  await seed(page); await open(page, '/?go=heute'); await page.waitForTimeout(800);
  const bar = (await page.locator('.tabbar').boundingBox())!;
  const clip = { x: 0, y: bar.y - 20, width: 390, height: bar.height + 40 };
  await page.screenshot({ path: `scratch/a34/frames/app-${browserName}-0ruhe.png`, clip });
  const b = (await page.locator('#tabs .tab[data-tab="coach"]').boundingBox())!;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  for (let i = 1; i <= 12; i++) { await page.waitForTimeout(160); await page.screenshot({ path: `scratch/a34/frames/app-${browserName}-${String(i).padStart(2, '0')}.png`, clip }); }
});
