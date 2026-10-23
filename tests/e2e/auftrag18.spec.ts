/* Auftrag 18, Punkt 3: Plan-Tab. Wochenleiste bleibt bei der gewählten Woche (mittig), öffnet bei der aktuellen Woche,
   Knopf „Heute“, kompakte Woche (eine Zeile oben, 7 Tage mit Ruhetag), Details beim Antippen. */
import { test, expect, type Page } from '@playwright/test';
import { seed, open, TODAY } from './helpers';

/* Abstand der gewählten Woche zur Mitte der Leiste (in px) und ob sie ganz sichtbar ist */
async function barState(page: Page) {
  return page.evaluate(() => {
    const bar = document.getElementById('wkbar')!; const on = bar.querySelector('.wkc.on') as HTMLElement;
    const b = bar.getBoundingClientRect(), r = on.getBoundingClientRect();
    return { off: Math.round((r.left + r.width / 2) - (b.left + b.width / 2)), visible: r.left >= b.left - 1 && r.right <= b.right + 1, i: +on.dataset.i!, atStart: bar.scrollLeft < 2, atEnd: bar.scrollLeft + bar.clientWidth >= bar.scrollWidth - 2 };
  });
}
const centered = (s: { off: number; visible: boolean; atStart: boolean; atEnd: boolean }) => s.visible && (Math.abs(s.off) <= 30 || (s.atStart && s.off < 0) || (s.atEnd && s.off > 0));

test('Wochenleiste: öffnet mittig bei der aktuellen Woche und bleibt bei der gewählten Woche', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=plan');
  const cur = await page.evaluate(() => (document.querySelector('.wkc.now') as HTMLElement).dataset.i);
  let s = await barState(page);
  expect(String(s.i)).toBe(cur);
  expect(centered(s)).toBe(true);
  const n = await page.locator('[data-act="plan-week"]').count();
  for (const k of [n - 1, Math.floor(n / 2), 0, 3]) {
    await page.locator(`[data-act="plan-week"][data-i="${k}"]`).click();
    s = await barState(page);
    expect(s.i).toBe(k);
    expect(centered(s), `Woche ${k}: ${JSON.stringify(s)}`).toBe(true);
  }
  // „Heute“: zurück zur aktuellen Woche, heutiger Tag markiert
  await page.locator('[data-act="plan-today"]').click();
  s = await barState(page);
  expect(String(s.i)).toBe(cur);
  expect(centered(s)).toBe(true);
  await expect(page.locator(`.cday.today[data-day="${TODAY}"]`)).toBeVisible();
});

test('Woche kompakt: eine Zeile oben, 7 Tage, Ruhetag sichtbar, Details beim Antippen', async ({ page }) => {
  await seed(page, { extra: d => {
    const w = d.plan.weeks.find((x: any) => x.startDate <= TODAY && x.endDate >= TODAY);
    const day = w.days.find((x: any) => x.date > TODAY);
    day.sessions = [{ id: 'rest-x', sport: 'rest', title: 'Ruhetag' }];
  } });
  await open(page, '/?go=plan');
  await expect(page.locator('[data-week-head]')).toBeVisible();
  await expect(page.locator('[data-week-count]')).toContainText(/\d+\/\d+/);
  await expect(page.locator('.cday')).toHaveCount(7);
  await expect(page.locator('.cday.rest').first()).toContainText('Ruhetag');
  // jede Einheit: Symbol, Titel; Dauer steht im Titel oder daneben
  // Auftrag 19: nur der aufgeklappte Tag zeigt seine Einheiten: einen Tag mit Training öffnen
  const td = page.locator('.cday.open:not(.rest)');
  if (!(await td.count())) await page.locator('.cday:not(.rest) .cday-h').first().click();
  const rows = page.locator('.cday.open .pr.wo');
  expect(await rows.count()).toBeGreaterThan(0);
  const first = rows.first();
  await expect(first.locator('.ic')).toBeVisible();
  await first.locator('[data-act="sess-open"]').click();
  await expect(page.locator('#sheetPanel')).toBeVisible();
});

test('Wochen-Chips zeigen Phase, Datum und Symbole (Erholung, Test, Wettkampf)', async ({ page }) => {
  await seed(page, { extra: d => {
    const ws = d.plan.weeks; const w = ws[ws.length - 1];
    w.isRecoveryWeek = true; w.days[6].sessions = [{ id: 'race-x', sport: 'run', title: 'Halbmarathon', race: true, plannedMinutes: 110 }];
  } });
  await open(page, '/?go=plan');
  const last = page.locator('[data-act="plan-week"]').last();
  await expect(last).toHaveAttribute('aria-label', /Erholungswoche/);
  await expect(last).toHaveAttribute('aria-label', /Wettkampf/);
  await expect(last.locator('.wkc-dot')).toHaveCount(1);
  await expect(last.locator('.wkc-d')).toHaveText(/^\d{1,2}\.\d{1,2}\.$/);
});

for (const w of [320, 430]) for (const dark of [false, true]) {
  test(`Bildschirmfoto Plan ${w} px ${dark ? 'dunkel' : 'hell'}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
    await seed(page);
    await open(page, '/?go=plan');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/a18-plan-${w}-${dark ? 'dark' : 'light'}.png`, fullPage: true });
  });
}
