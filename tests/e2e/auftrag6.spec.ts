/* Auftrag 6, Punkt 1: Bestätigen statt sofort ändern. Ein Tipp ins Wochenraster merkt nur vor; der Plan ändert sich erst mit „Übernehmen“. */
import { test, expect } from '@playwright/test';
import { seed, open, stored } from './helpers';

const snapshot = (page: any) => page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('ec_state_v2') || 'null');
  return { plan: localStorage.getItem('ec_plan'), rules: JSON.stringify((st.profile || {}).rules || []), notes: JSON.stringify((st.profile || {}).notes || []), adjustments: JSON.stringify(st.adjustments || {}), goals: JSON.stringify(st.goals || {}) };
});

test('versehentlicher Tipp ins Wochenraster → Verwerfen → Plan und Regeln unverändert', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=beruecksichtigungen');
  const before = await snapshot(page);
  const cell = page.locator('[data-act="rule-cell"][data-s="run"][data-d="3"]');
  const was = (await cell.getAttribute('class'))!.match(/\b(yes|soft|no)\b/)![1];
  await cell.click();
  // nur die Anzeige ändert sich: Feld markiert, Leiste unten
  await expect(cell).toHaveClass(/\bchg\b/);
  await expect(page.locator('[data-stage-bar]')).toContainText('1 Änderung übernehmen');
  await expect(page.locator('[data-stage-bar]')).toContainText('Verwerfen');
  expect(await snapshot(page)).toEqual(before);
  await page.locator('[data-act="stage-discard"]').click();
  await expect(page.locator('[data-stage-bar]')).toHaveCount(0);
  await expect(cell).toHaveClass(new RegExp('\\b' + was + '\\b'));
  await expect(cell).not.toHaveClass(/\bchg\b/);
  expect(await snapshot(page)).toEqual(before);
});

test('zurück auf den alten Wert zählt nicht als Änderung', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=beruecksichtigungen');
  const cell = page.locator('[data-act="rule-cell"][data-s="bike"][data-d="2"]');
  await cell.click(); await cell.click();
  await expect(page.locator('[data-stage-bar]')).toContainText('1 Änderung');
  await cell.click(); // geht → lieber nicht → geht nicht → geht
  await expect(page.locator('[data-stage-bar]')).toHaveCount(0);
});

test('Übernehmen zeigt vorher, was sich im Plan ändert; erst „Übernehmen“ speichert', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=beruecksichtigungen');
  const before = await snapshot(page);
  for (const d of [1, 2, 3, 4, 5]) await page.locator(`[data-act="rule-cell"][data-s="run"][data-d="${d}"]`).click({ clickCount: 1 }).then(() => page.locator(`[data-act="rule-cell"][data-s="run"][data-d="${d}"]`).click());
  await expect(page.locator('[data-stage-bar]')).toContainText('5 Änderungen übernehmen');
  await page.locator('[data-act="stage-apply"]').click();
  const sheet = page.locator('[data-stage-sheet]');
  await expect(sheet).toContainText('Laufen Mo: geht nicht');
  await expect(sheet.locator('[data-stage-preview]')).toBeVisible();
  // Zurück: noch nichts gespeichert
  await page.locator('[data-act="stage-back"]').click();
  expect(await snapshot(page)).toEqual(before);
  await page.locator('[data-act="stage-apply"]').click();
  await page.locator('[data-act="stage-confirm"]').click();
  await expect(page.locator('[data-replanned]')).toBeVisible({ timeout: 5000 });
  const after = await snapshot(page);
  expect(after.rules).not.toEqual(before.rules);
  expect(after.plan).not.toEqual(before.plan);
  const msgs = Object.values((await stored(page)).coachMsgs) as any[];
  expect(msgs.some(m => /Plan angepasst/.test(m.title || ''))).toBe(true);
});

test('Bildschirm mit offenen Änderungen verlassen → App fragt nach (Verwerfen / Weiter bearbeiten)', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=beruecksichtigungen');
  const before = await snapshot(page);
  await page.locator('[data-act="rule-cell"][data-s="run"][data-d="3"]').click();
  await page.locator('[data-act="go-tab"][data-tab="heute"]').click();
  await expect(page.locator('[data-stage-leave]')).toContainText('1 Änderung vorgemerkt');
  await page.locator('[data-act="stage-stay"]').click();
  await expect(page.locator('.view[data-view="beruecksichtigungen"]')).toBeVisible();
  await page.locator('[data-act="back"]').click();
  await expect(page.locator('[data-stage-leave]')).toBeVisible();
  await page.locator('[data-stage-leave] [data-act="stage-discard"]').click();
  await expect(page.locator('.view[data-view="beruecksichtigungen"]')).toHaveCount(0);
  expect(await snapshot(page)).toEqual(before);
});

test('Profil: Erfahrung wird vorgemerkt; Name wird sofort gespeichert; Zeit nur im Wochenraster', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=profil');
  const before = await snapshot(page);
  // Auftrag 11: Zeit nur einmal (Wochenraster unter Berücksichtigungen), im Profil nur die Zusammenfassung
  await expect(page.locator('#pf-wh')).toHaveCount(0);
  await expect(page.locator('[data-week-link]')).toContainText('Wochenraster');
  await page.fill('#pf-exp', '7'); await page.locator('#pf-exp').blur();
  await expect(page.locator('[data-stage-bar]')).toContainText('1 Änderung');
  await page.fill('#pf-name', 'Testname'); await page.locator('#pf-name').blur();
  await expect.poll(async () => (await stored(page)).profile.name).toBe('Testname');
  expect((await snapshot(page)).plan).toEqual(before.plan);
  await page.locator('[data-act="stage-apply"]').click();
  await expect(page.locator('[data-stage-sheet]')).toContainText('Jahre Ausdauersport');
  await page.locator('[data-act="stage-confirm"]').click();
  await expect(page.locator('[data-replanned]')).toBeVisible({ timeout: 5000 });
  const p = (await stored(page)).profile;
  expect(p.experienceYears).toBe(7); expect(p.name).toBe('Testname');
});
