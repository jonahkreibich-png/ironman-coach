/* Auftrag 27: Design B + C greift überall (hell und dunkel): Hintergrund aus theme.css, Verlauf oben (dezentes Petrol) hinter allem,
   Kopfzeile in der Verlaufsfarbe – auch im Fragebogen, auf Unterseiten von Mehr und im geöffneten Blatt. Farben aus scripts/palettes.mjs. */
import { test, expect } from '@playwright/test';
import { seed } from './helpers';
// @ts-ignore reines JS
import { THEME } from '../../scripts/palettes.mjs';

const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
for (const mode of ['dark', 'light'] as const) {
  test(`B + C ${mode === 'dark' ? 'dunkel' : 'hell'}: Hintergrund, Verlauf und Kopfzeile auf allen Bildschirmarten`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: mode });
    await seed(page);
    const t = THEME[mode];
    for (const [url, open] of [['/?go=heute', ''], ['/?go=plan', ''], ['/?go=zonen', ''], ['/?go=onboarding', ''], ['/?go=heute', '[data-act="sess-open"]']]) {
      await page.goto(url); await expect(page.locator('#app > .view')).toBeVisible();
      if (open) { await page.locator(open).first().click(); await expect(page.locator('#sheetPanel')).toBeVisible(); }
      const s = await page.evaluate(() => ({
        html: getComputedStyle(document.documentElement).backgroundColor,
        grad: getComputedStyle(document.body, '::before').backgroundImage,
        fixed: getComputedStyle(document.body, '::before').position,
        top: getComputedStyle(document.querySelector('.top')!).backgroundColor,
        scheme: getComputedStyle(document.documentElement).colorScheme
      }));
      expect(s.html, url).toBe(rgb(t.bg));
      expect(s.grad, url).toContain(rgb(t['grad-top']));
      expect(s.fixed).toBe('fixed');
      expect(s.scheme).toContain(mode);
      // Kopfzeile: Verlaufsfarbe (72 %), als color(srgb r g b / a) oder rgba()
      const nums = (s.top.match(/[0-9.]+/g) || []).map(Number); const sc = s.top.startsWith('color(') ? 255 : 1;
      const want = [1, 3, 5].map(i => parseInt(t['grad-top'].slice(i, i + 2), 16));
      expect(nums.slice(0, 3).map(v => Math.round(v * sc)), url).toEqual(want);
    }
  });
}
