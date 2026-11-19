/* Auftrag 35/38: Lauf- und Radeinheiten mit Minuten und km zugleich (Heute, Plan, Einheit geöffnet), ohne Umschalter. */
import { test, expect } from './storage-harness';
import { type Page } from '@playwright/test';
import { seed, open, openPlanSession, TODAY } from './helpers';

const CTX = { runThrSec: 300, lthrRun: 170, lthrBike: 160, bikeKmh: 30 };
const IV = { sport: 'run', kind: 'intervals', ctx: CTX, steps: [{ part: 'warm', min: 15, zone: 1, note: 'mit 3 kurzen Steigerungen' }, { part: 'main', reps: 4, min: 3, zone: 4, restMin: 2 }, { part: 'cool', min: 10, zone: 1 }] };
const INDOOR = { sport: 'bike', kind: 'easy', ctx: { ...CTX, indoor: true }, noDistance: true, steps: [{ part: 'main', min: 45, zone: 2 }] };
async function seedIt(page: Page) {
  await seed(page, { extra: (d: any) => {
    const day = d.plan.weeks.flatMap((w: any) => w.days).find((x: any) => x.date === TODAY);
    day.sessions = [{ id: 'k35-iv', sport: 'run', title: 'Lauf-Intervalle 4×3 min', plannedMinutes: 49, zone: 'Zone 4', hard: true, spec: IV }, { id: 'k35-in', sport: 'bike', title: 'Rolle locker 45 min', plannedMinutes: 45, zone: 'Zone 2', spec: INDOOR }];
  } });
}
/* Auftrag 35: neuer Bereich bei 320 px ohne Überlauf (Seite scrollt nicht seitlich, nichts ragt aus dem Blatt) */
async function noOverflow(page: any, sel: string) {
  await page.setViewportSize({ width: 320, height: 700 });
  const bad = await page.evaluate((s: string) => { const W = document.documentElement.clientWidth; const out: string[] = []; if (document.documentElement.scrollWidth > W + 1) out.push('Seite scrollt seitlich'); document.querySelectorAll(s + ' *').forEach(el => { const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1) && !el.closest('.scroll-x')) out.push(el.tagName + ' ' + (el.textContent || '').trim().slice(0, 30)); }); return out.slice(0, 5); }, sel);
  expect(bad).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
}

const sheet = (page: Page) => page.locator('#sheetPanel');

/* Auftrag 38: kein Umschalter mehr – überall Minuten UND km (Heute, Plan, Einheit), Intervalle „4×3 min (ca. 600 m)“ */
test('Minuten und km zusammen: Heute, Einheit und Plan ohne Umschalter, Summen passen', async ({ page }) => {
  test.setTimeout(90000);
  await seedIt(page); await open(page, '/?go=heute');
  const hero = page.locator('.session-hero').filter({ hasText: 'Lauf-Intervalle' });
  await expect(hero).toContainText(/49 min · ca\. [\d,]+ km/);
  const kmMin = (await hero.locator('.m').innerText()).match(/ca\. ([\d,]+) km/)![1];
  await expect(page.locator('[data-plan-view], [data-act="plan-view"]')).toHaveCount(0);
  await noOverflow(page, '.answer');
  // Einheit geöffnet: Intervalle mit Minuten und Strecke je Stück, Gesamtzeile mit derselben Strecke
  await open(page, '/?go=plan'); await openPlanSession(page, 'k35-iv');
  await expect(sheet(page).locator('[data-act="plan-view"]')).toHaveCount(0);
  await sheet(page).locator('details.sess-more > summary').click();
  const st = sheet(page).locator('[data-structure]');
  await expect(st.locator('[data-part="main"]')).toContainText(/4×3 min \(ca\. \d+ m\) hart/);
  await expect(st.locator('[data-total]')).toContainText(`Gesamt: 49 min, ca. ${kmMin} km`);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-what]').filter({ hasText: 'einlaufen' }).first()).toContainText(/4×3 min/);
  await expect(page.locator('[data-what] [data-act="plan-view"]')).toHaveCount(0);
});
