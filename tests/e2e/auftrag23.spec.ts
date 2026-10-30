/* Auftrag 23: Prognose für jedes Ziel (nach Datum, Platzhalter gekennzeichnet, weite Ziele als gerundeter Bereich), Wunschzeit je Disziplin
   ohne Plan-Änderung, Fortschritt einklappbar (Zustand gemerkt), Tab-Leiste mit Glas-Linse (Halten, Wischen, Loslassen öffnet, Antippen sofort,
   „Bewegung reduzieren“ ohne Animation, hell und dunkel ohne Überstand). Läuft in Chromium und WebKit. */
import { test, expect, type Page } from '@playwright/test';
import { seed, open, TODAY } from './helpers';

const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const HM = addDays(TODAY, 172), OLY = addDays(TODAY, 320);
const withGoals = (d: any) => {
  d.goals = {
    'g-im': { id: 'g-im', type: 'tri_long', name: 'Ironman', date: '2029-09-15', priority: 'A', outcome: 'finish' },
    'g-hm': { id: 'g-hm', type: 'run_half', name: 'Halbmarathon', date: HM, priority: 'B', outcome: 'time', targetTimeSec: 5400 },
    'g-oly': { id: 'g-oly', type: 'tri_olympic', name: 'Olympische Distanz', date: null, priority: 'B', outcome: 'finish' }
  };
  d.plan.meta.placeholders = [{ id: 'g-oly', name: 'Olympische Distanz', date: OLY }];
};

test('Prognose je Ziel: nach Datum, Platzhalter mit Hinweis, weites Ziel als gerundeter Bereich mit Sicherheit und „zuletzt aktualisiert“', async ({ page }) => {
  await seed(page, { extra: withGoals });
  await open(page, '/?go=fortschritt');
  const cards = page.locator('[data-prognoses] details[data-fold^="prog-"]');
  await expect(cards).toHaveCount(3);
  expect(await cards.evaluateAll(els => els.map(e => (e as HTMLElement).dataset.fold))).toEqual(['prog-g-hm', 'prog-g-oly', 'prog-g-im']);
  // Platzhalter
  const oly = page.locator('details[data-fold="prog-g-oly"]');
  await expect(oly.locator(':scope > summary')).toContainText('Platzhalter');
  await expect(oly.locator('[data-placeholder]')).toContainText('Platzhalter-Datum');
  // Ironman 2029: gerundeter Bereich, „wenn du den Plan durchziehst“, Sicherheit am Wettkampftag niedrig
  const im = page.locator('details[data-fold="prog-g-im"]');
  await expect(im.locator('[data-race]')).toHaveText(/^ca\. \d+(:\d\d)?–\d+(:\d\d)? h$/);
  await expect(im).toContainText('wenn du den Plan durchziehst');
  await expect(im.locator('[data-conf]')).toContainText('am Wettkampftag: niedrig');
  await expect(im.locator('[data-updated]')).toContainText('Zuletzt aktualisiert');
  // Warum? nennt die Entwicklung je Sportart
  await im.locator('summary', { hasText: 'Warum diese Prognose?' }).click();
  await expect(im.locator('[data-prog-why]')).toContainText('Entwicklung bis zum Rennen');
  await expect(im.locator('[data-prog-why] li').first()).toContainText(/Schwimmen|Rad|Laufen/);
  // Halbmarathon: Wunschzeit 1:30 je Disziplin und Einordnung; Laufziel zeigt andere Distanzen heute und am Renntag
  const hm = page.locator('details[data-fold="prog-g-hm"]');
  await expect(hm.locator('[data-wish] [data-verdict]')).toHaveText(/realistisch|ambitioniert|sehr unwahrscheinlich/);
  await expect(hm.locator('[data-wish-row="run"]')).toContainText('nötig, Prognose');
  await hm.locator('summary', { hasText: 'Andere Distanzen' }).click();
  await expect(hm.locator('.ptable.three').last()).toContainText('Marathon');
});

test('Fortschritt einklappbar: Zustand bleibt nach Neuladen, eingeklappt steht das Wichtigste in der Kopfzeile', async ({ page }) => {
  await seed(page, { extra: withGoals });
  await open(page, '/?go=fortschritt');
  const hm = page.locator('details[data-fold="prog-g-hm"]');
  await expect(hm).toHaveAttribute('open', '');
  await hm.locator(':scope > summary').click();
  await expect(hm).not.toHaveAttribute('open', '');
  await expect(hm.locator(':scope > summary [data-fold-sum]')).toHaveText(/^ca\. \d:\d\d–\d:\d\d$/);
  const trends = page.locator('details[data-fold="trends"]');
  await trends.locator(':scope > summary').click();
  await expect(trends).not.toHaveAttribute('open', '');
  await expect(trends.locator(':scope > summary [data-fold-sum]')).toBeVisible();
  await page.reload();
  await expect(page.locator('details[data-fold="prog-g-hm"]')).not.toHaveAttribute('open', '');
  await expect(page.locator('details[data-fold="trends"]')).not.toHaveAttribute('open', '');
  await expect(page.locator('details[data-fold="prog-g-im"]')).toHaveAttribute('open', '');
  // wieder aufklappen geht und wird ebenso gemerkt
  await page.locator('details[data-fold="trends"] > summary').click();
  await page.reload();
  await expect(page.locator('details[data-fold="trends"]')).toHaveAttribute('open', '');
});

test('Wunschzeit speichern ändert den Plan nicht', async ({ page }) => {
  await seed(page, { extra: withGoals });
  await open(page, '/?go=profil');
  const before = await page.evaluate(() => localStorage.getItem('ec_plan'));
  await page.locator('[data-act="goal-open"][data-id="g-hm"]').click();
  await page.locator('[data-k="targetTimeSec"]').first().fill('2');
  await page.locator('[data-k="targetTimeSec"]').first().dispatchEvent('change');
  await page.locator('[data-act="goal-save"]').click();
  await page.locator('[data-act="stage-apply"]').click();
  await expect(page.locator('[data-plan-same]')).toBeVisible();
  await page.locator('[data-act="stage-confirm"]').click();
  expect(await page.evaluate(() => localStorage.getItem('ec_plan'))).toBe(before);
});

/* ---------- Tab-Leiste ---------- */
async function tabCenter(page: Page, id: string) {
  const b = await page.locator(`#tabs .tab[data-tab="${id}"]`).boundingBox();
  return { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 };
}
/* Halten, Wischen, Antippen, Einrasten, Bildrate und „Bewegung reduzieren“ der Linse: tests/e2e/tabbar.spec.ts (Auftrag 24) */

test('hell und dunkel: Prognosen und Linse ragen nicht heraus', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(th => localStorage.setItem('theme_pref', th as string), theme);
    await seed(page, { extra: withGoals });
    await open(page, '/?go=fortschritt');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, theme).toBeLessThanOrEqual(0);
    const bad = await page.evaluate(() => [...document.querySelectorAll('[data-prognoses] .card, .prow, [data-wish] .li')].filter(el => el.getBoundingClientRect().right > window.innerWidth + 1).length);
    expect(bad, theme).toBe(0);
    await page.screenshot({ path: `test-results/a23-fortschritt-${theme}-${test.info().project.name}.png`, fullPage: true });
    const h = await tabCenter(page, 'heute');
    await page.mouse.move(h.x, h.y); await page.mouse.down(); await page.waitForTimeout(400);
    await page.screenshot({ path: `test-results/a23-linse-${theme}-${test.info().project.name}.png`, clip: { x: 0, y: 844 - 120, width: 390, height: 120 } });
    await page.mouse.up();
  }
});
