/* Auftrag 19: „Krank oder verletzt?“ sichtbar auf Heute. Krank: Plan pausiert sofort (Einheiten als krank markiert), „Wieder gesund“
   beendet es. Schmerzen: der Coach fragt wo und wie stark und plant danach schonender (ohne KI, feste Gesprächsführung). */
import { test, expect } from '@playwright/test';
import { seed, open, stored, TODAY } from './helpers';

test('Krank: ein Tipp auf Heute trägt die Krankheit ein, Wieder gesund beendet sie', async ({ page }) => {
  await seed(page);
  await open(page, '/');
  const row = page.locator('[data-health]');
  await expect(row).toBeVisible();
  await row.locator('[data-act="ill-start"]').click();
  await expect(page.locator('[data-act="ill-end"]')).toBeVisible();
  await expect(page.locator('[data-health]')).toHaveCount(0);
  let st = await stored(page);
  expect(st.illnessPeriods.some((p: any) => p.start === TODAY && !p.end)).toBe(true);
  await page.locator('[data-act="ill-end"]').click();
  st = await stored(page);
  expect(st.illnessPeriods.every((p: any) => p.end)).toBe(true);
});

test('Schmerzen: Coach fragt wo und wie stark, danach ist der Plan schonender', async ({ page }) => {
  await seed(page);
  await open(page, '/');
  await page.locator('[data-health] [data-act="coach-ask"]').click();
  await expect(page.locator('#app')).toContainText('Wo tut es weh?');
  await page.locator('[data-chat-options] button', { hasText: 'Knie' }).click();
  await expect(page.locator('#app')).toContainText('Wie stark sind die Schmerzen (Knie)');
  await page.locator('[data-chat-options] button', { hasText: 'Mittel' }).click();
  await expect(page.locator('#app')).toContainText('Ab 4 von 10');
  await page.locator('[data-chat-options] button').first().click();
  await expect.poll(async () => { const st = await stored(page); return JSON.stringify(st.profile || {}).includes('knee'); }).toBe(true);
});
