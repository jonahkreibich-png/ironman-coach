/* Auftrag 19, Punkt 3: drei Plan-Ansichten (A Liste, B Raster, C Mix) auf iPhone-Breite, hell und dunkel,
   für die aktuelle Woche, eine Erholungswoche und die Wettkampfwoche. Prüft das Layout (kein seitliches Scrollen,
   7 Tage sichtbar, Antippen zeigt Details) und legt Bildschirmfotos für plan-varianten.html ab. */
import { test, expect, type Page } from '@playwright/test';
import { seed, open, TODAY } from './helpers';
import { replanPlan } from '../../shared/replan';
import { oldPlan, profile, goals, state } from '../../fixtures/pattern-person';

/* Plan wie bei Jonah: fester Wochenaufbau mit Fußball, Halbmarathon am 4.4.2027 als Zwischenziel, Ironman 2029 */
let PLAN: any = null;
function plan() {
  if (!PLAN) {
    const gl: any[] = [...goals, { id: 'g-hm', type: 'run_half', name: 'Halbmarathon', date: '2027-04-04', priority: 'B' }];
    PLAN = replanPlan(oldPlan(), profile as any, gl, TODAY, { state: state(), adjustments: {}, from: '2026-10-19' })!.plan;
  }
  return PLAN;
}
function weeks() {
  const ws = plan().weeks;
  const cur = ws.findIndex((w: any) => w.startDate <= TODAY && w.endDate >= TODAY);
  const rec = ws.findIndex((w: any, i: number) => i > cur && w.isRecoveryWeek);
  const race = ws.findIndex((w: any) => w.days.some((d: any) => d.sessions.some((s: any) => s.race)));
  return { cur, rec, race };
}
async function seedPlan(page: Page) {
  await seed(page, { extra: d => { d.plan = plan(); } });
}
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

for (const v of ['A', 'B', 'C'] as const) {
  test(`Ansicht ${v}: 7 Tage, kein seitliches Scrollen, Antippen zeigt die Einheit`, async ({ page }) => {
    await seedPlan(page);
    await open(page, `/?go=plan&planv=${v}`);
    expect(await noSideScroll(page)).toBe(true);
    if (v === 'A') await expect(page.locator('.pday')).toHaveCount(7);
    if (v === 'B') { await expect(page.locator('.pg-d')).toHaveCount(7); await expect(page.locator('.pg-det')).toBeVisible(); }
    if (v === 'C') { await expect(page.locator('.pm-c')).toHaveCount(7); await expect(page.locator('.cday')).toHaveCount(7); await expect(page.locator('.cday.open')).toHaveCount(1); }
    // anderen Tag antippen (B, C), dann die erste Einheit öffnen
    if (v !== 'A') {
      const other = page.locator(v === 'B' ? '.pg-d:not(.rest):not(.on)' : '.cday:not(.rest):not(.open) .cday-h').first();
      await other.click();
      if (v === 'C') await expect(page.locator('.cday.open')).toHaveCount(1);
    }
    await page.locator('.pr.wo [data-act="sess-open"]').first().click();
    await expect(page.locator('#sheetPanel')).toBeVisible();
  });
}

test('Bildschirmfotos aller Ansichten (aktuelle Woche, Erholungswoche, Wettkampfwoche; hell und dunkel)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Fotos nur einmal');
  test.setTimeout(120000);
  const W = weeks();
  expect(W.rec).toBeGreaterThan(-1); expect(W.race).toBeGreaterThan(-1);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPlan(page);
  for (const dark of [false, true]) {
    await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
    for (const v of ['A', 'B', 'C'] as const) {
      for (const [name, i] of [['aktuell', W.cur], ['erholung', W.rec], ['wettkampf', W.race]] as const) {
        await open(page, `/?go=plan&planv=${v}`);
        if (name === 'aktuell') await page.locator('[data-act="plan-today"]').click(); else await page.locator(`[data-act="plan-week"][data-i="${i}"]`).click();
        // in der Wettkampfwoche den Wettkampftag zeigen
        if (name === 'wettkampf' && v !== 'A') {
          const day = plan().weeks[i].days.find((d: any) => d.sessions.some((s: any) => s.race)).date;
          await page.locator(`[data-act="plan-pick"][data-date="${day}"]`).first().click();
        }
        expect(await noSideScroll(page)).toBe(true);
        await page.addStyleTag({ content: '.top{position:static!important}.tabbar{display:none!important}' });
        // Ausschnitt: von der Wochenleiste bis zum Knopf „Extra-Einheit“ (ganze Woche, ohne Kopf- und Fußleiste)
        const box = await page.evaluate(() => { const a = (document.querySelector('.wkbar') as HTMLElement).getBoundingClientRect(); const b = (document.querySelector('[data-act="custom-add"]') as HTMLElement).getBoundingClientRect(); return { y: a.top + window.scrollY - 6, h: b.bottom - a.top + 14 }; });
        await page.screenshot({ path: `test-results/a19-plan-${v}-${name}-${dark ? 'dunkel' : 'hell'}.png`, fullPage: true, clip: { x: 0, y: box.y, width: 390, height: box.h } });
      }
    }
  }
});
