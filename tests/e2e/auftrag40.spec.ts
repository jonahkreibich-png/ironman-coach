/* Auftrag 40: die Vorschläge aus Auftrag 39 – Browser-Tests (WebKit iPhone und Chromium). */
import { test, expect } from './storage-harness';
import { seed, open } from './helpers';

test('Vorschlag 12: Hinweis „Neue Version“ verdeckt kein offenes Fenster (320 px, große Schrift), erscheint nach dem Schließen wieder', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await seed(page); await open(page, '/?go=plan');
  await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; const el = document.createElement('div'); el.id = 'upd'; el.className = 'upd'; el.setAttribute('role', 'status'); el.innerHTML = '<span>Neue Version der App ist da.</span><button class="btn small" id="upd-go">Aktualisieren</button>'; document.body.appendChild(el); });
  await expect(page.locator('#upd')).toBeVisible();
  await page.locator('[data-act="sess-open"]').first().click();
  await expect(page.locator('#sheetPanel')).toBeVisible();
  await expect(page.locator('#upd')).toBeHidden();
  // Titel und Schließen-Knopf sind antippbar (nichts liegt darüber)
  const close = page.locator('#sheetPanel [data-act="sheet-close"]');
  const top = await close.evaluate(b => { const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && (hit === b || b.contains(hit)); });
  expect(top).toBe(true);
  await close.click();
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('#upd')).toBeVisible();
});
