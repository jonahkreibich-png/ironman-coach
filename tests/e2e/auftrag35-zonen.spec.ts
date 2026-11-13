/* Auftrag 35, Punkt 5: Zonen-Seite – Vorschlag neuer Puls-Zonen aus Uhrdaten (vorher/nachher, Übernehmen, Nicht jetzt),
   Herkunft und Datum je Wert. WebKit (iPhone) und Chromium. */
import { test, expect } from './storage-harness';
import { type Page } from '@playwright/test';
import { seed, open, stored, TODAY } from './helpers';

const series = (peak: number) => { const hr = Array.from({ length: 40 }, (_, i) => (i === 30 ? peak - 3 : 150)); return { step: 60, hr, hx: hr.map(h => h + 3), m: hr.map(() => 200) }; };
async function seedIt(page: Page) {
  await seed(page, { extra: (d: any) => {
    const a = (id: string, date: string, mx: number) => ({ id, source: 'file', sources: ['file'], sport: 'run', date, startMs: Date.parse(date + 'T07:00:00Z'), min: 40, km: 7, avgHr: 150, maxHr: mx, laps: [], intervals: null, swim: null, hrZones: null, series: series(mx) });
    d.activities = { ...(d.activities || {}), z1: a('z1', '2026-10-01', 205), z2: a('z2', '2026-10-08', 204) };
  } });
}

/* Auftrag 35: neuer Bereich bei 320 px ohne Überlauf (Seite scrollt nicht seitlich, nichts ragt aus dem Blatt) */
async function noOverflow(page: any, sel: string) {
  await page.setViewportSize({ width: 320, height: 700 });
  const bad = await page.evaluate((s: string) => { const W = document.documentElement.clientWidth; const out: string[] = []; if (document.documentElement.scrollWidth > W + 1) out.push('Seite scrollt seitlich'); document.querySelectorAll(s + ' *').forEach(el => { const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1) && !el.closest('.scroll-x')) out.push(el.tagName + ' ' + (el.textContent || '').trim().slice(0, 30)); }); return out.slice(0, 5); }, sel);
  expect(bad).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
}

test('Puls-Zonen-Vorschlag: vorher/nachher, Übernehmen, Herkunft mit Datum, nach Neuladen weg', async ({ page }) => {
  test.setTimeout(90000);
  await seedIt(page); await open(page, '/?go=zonen');
  const card = page.locator('[data-hr-suggest]');
  await expect(card).toBeVisible();
  const line = await card.locator('[data-hr-change="maxHr"] b').innerText();
  const to = +line.split('→')[1].trim();
  expect(to).toBeGreaterThan(150);
  await expect(card.locator('[data-hr-change="maxHr"]')).toContainText('2 Einheiten mit höherem Maximalpuls');
  await noOverflow(page, '[data-hr-suggest]');
  await card.locator('[data-act="hr-suggest-apply"]').click();
  await expect(page.locator('[data-hr-suggest]')).toHaveCount(0);
  await expect(page.locator('#z-max')).toHaveValue(String(to));
  const dd = `${TODAY.slice(8)}.${TODAY.slice(5, 7)}.${TODAY.slice(0, 4)}`;
  await expect(page.locator('[data-origin="maxHr"]')).toContainText(`aus deinen Uhrdaten, ${dd}`);
  expect((await stored(page)).profile.thresholds.origin.maxHr).toEqual({ src: 'aus deinen Uhrdaten', at: TODAY });
  await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
  await expect(page.locator('[data-hr-suggest]')).toHaveCount(0);
  // von Hand ändern: Herkunft „von dir eingetragen“ mit Datum
  const el = page.locator('#z-lr'); await el.click(); await el.fill(''); await el.pressSequentially('171'); await el.blur();
  await expect(page.locator('[data-origin="lthrRun"]')).toContainText(`von dir eingetragen, ${dd}`);
});

test('Puls-Zonen-Vorschlag: „Nicht jetzt“ blendet ihn aus', async ({ page }) => {
  await seedIt(page); await open(page, '/?go=zonen');
  await page.locator('[data-act="hr-suggest-dismiss"]').click();
  await expect(page.locator('[data-hr-suggest]')).toHaveCount(0);
  await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
  await expect(page.locator('[data-hr-suggest]')).toHaveCount(0);
  await expect(page.locator('[data-origins]')).toBeVisible();
});
