/* Auftrag 35, Punkt 3: Lauf- und Radeinheiten in Minuten oder km (Heute, Plan, Einheit geöffnet). Wahl wird gemerkt (auch nach Neuladen),
   Intervalle in Metern mit Zeit pro Stück, Gesamtstrecke und -dauer gleich in beiden Ansichten, Rolle drinnen ohne Umschalter. */
import { test, expect } from './storage-harness';
import { type Page } from '@playwright/test';
import { seed, open, openPlanSession, stored, TODAY } from './helpers';

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

test('Minuten oder km: umschalten auf Heute, gilt in Plan und Einheit, bleibt nach Neuladen, Summen passen', async ({ page }) => {
  test.setTimeout(90000);
  await seedIt(page); await open(page, '/?go=heute');
  const hero = page.locator('.session-hero').filter({ hasText: 'Lauf-Intervalle' });
  await expect(hero).toContainText(/49 min · ca\. [\d,]+ km/);
  const kmMin = (await hero.locator('.m').innerText()).match(/ca\. ([\d,]+) km/)![1];
  await hero.locator('[data-act="plan-view"][data-v="km"]').click();
  await expect(hero.locator('[data-act="plan-view"][data-v="km"]')).toHaveAttribute('aria-pressed', 'true');
  await noOverflow(page, '.answer');
  await expect(hero.locator('.m')).toContainText(new RegExp(`^${kmMin} km · ca\\. \\d+ min`));
  // Rolle drinnen: kein Umschalter, bleibt in Minuten
  await expect(page.locator('.session-hero').filter({ hasText: 'Rolle' }).locator('[data-plan-view]')).toHaveCount(0);
  expect((await stored(page)).settings.planView).toBe('km');
  await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
  // Einheit geöffnet: Intervalle in Metern mit Zeit pro Stück und Zieltempo, Gesamtzeile mit derselben Strecke
  await open(page, '/?go=plan'); await openPlanSession(page, 'k35-iv');
  // Auftrag 37: die Schritte in Worten stehen unter „Mehr: Anleitung“, der Umschalter im Kopf
  await sheet(page).locator('details.sess-more > summary').click();
  const st = sheet(page).locator('[data-structure]');
  await expect(st).toHaveAttribute('data-view', 'km');
  await expect(st.locator('[data-part="main"]')).toContainText(/4 × 600 m an der Schwelle in ca\. \d:\d\d \(\d:\d\d–\d:\d\d\/km\), dazwischen 300 m traben/);
  await expect(st.locator('[data-total]')).toContainText(`Gesamt: ${kmMin} km, ca.`);
  // zurück auf Minuten: gleiche Strecke in der Gesamtzeile
  await sheet(page).locator('[data-kopf] [data-act="plan-view"][data-v="min"]').click();
  await expect(sheet(page).locator('[data-structure]')).toHaveAttribute('data-view', 'min');
  await expect(sheet(page).locator('[data-total]')).toContainText(`Gesamt: 49 min, ca. ${kmMin} km`);
  await expect(sheet(page).locator('[data-structure] [data-part="main"]')).toContainText('4×3 min');
  await page.keyboard.press('Escape');
  // Plan-Zeile folgt der Wahl
  await expect(page.locator('[data-what]').filter({ hasText: 'einlaufen' }).first()).toContainText(/4×3 min/);
  await page.locator('[data-what] [data-act="plan-view"][data-v="km"]').first().click();
  await expect(page.locator('[data-what]').filter({ hasText: 'einlaufen' }).first()).toContainText(/4 × 600 m an der Schwelle, 300 m traben dazwischen/);
});
