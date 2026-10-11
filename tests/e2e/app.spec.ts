import { test, expect } from '@playwright/test';
import { seed, open, stored, TODAY } from './helpers';

test.describe('Grundfunktionen', () => {
  test.beforeEach(async ({ page }) => { await seed(page); await open(page); });

  test('alle Tabs zeigen Inhalt', async ({ page }) => {
    for (const tab of ['heute', 'plan', 'werte', 'fortschritt', 'essen']) {
      await page.click(`.tab[data-go="${tab}"]`);
      await expect(page.locator(`.tab[data-go="${tab}"]`)).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('#app h1')).toBeVisible();
    }
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.reload();
    expect(errors).toEqual([]);
  });

  test('Einheit abhaken und wieder lösen', async ({ page }) => {
    const card = page.locator('#app .wo[data-sid]').first();
    const sid = await card.getAttribute('data-sid');
    await card.locator('[data-act="sess-toggle"]').click();
    await expect(page.locator(`.wo[data-sid="${sid}"]`).first()).toHaveClass(/is-done/);
    expect((await stored(page)).sessions[sid!].completed).toBe(true);
    await page.locator(`.wo[data-sid="${sid}"] [data-act="sess-toggle"]`).first().click();
    expect((await stored(page)).sessions[sid!].completed).toBe(false);
  });

  test('Morgenwerte eintragen', async ({ page }) => {
    await page.locator('#checkin summary').click();
    await page.fill('#h-hrv', '81');
    await page.fill('#h-restingHR', '47');
    await page.click('[data-act="checkin-save"][data-prefix="h"]');
    const st = await stored(page);
    const p = st.trend.find((x: any) => x.date === TODAY);
    expect(p.hrv).toBe(81);
    expect(p.restingHR).toBe(47);
  });

  test('Krankheitsmodus starten und beenden', async ({ page }) => {
    await page.click('[data-act="ill-start"]');
    await expect(page.locator('.ready')).toContainText('Krank');
    await page.click('[data-act="ill-end"]');
    const st = await stored(page);
    const last = st.illnessPeriods[st.illnessPeriods.length - 1];
    expect(last.start).toBe(TODAY);
    expect(last.end).toBe(TODAY);
  });

  test('Export für den Chat und Wochenbericht', async ({ page }) => {
    await page.click('.appbar [data-act="export-open"]');
    await expect(page.locator('#ex-text')).toHaveValue(/Training vom 14\.10\./);
    await page.click('[data-act="export-mode"][data-mode="week"]');
    await expect(page.locator('#ex-text')).toHaveValue(/Wochenbericht/);
  });
});

test('Willkommen ohne Daten', async ({ page }) => {
  await seed(page, { noPlan: true });
  await open(page);
  await expect(page.locator('.welcome')).toBeVisible();
});
