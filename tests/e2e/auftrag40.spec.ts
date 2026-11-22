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

/* Release 3.28.0 (erster Lauf rot): seit der Aufteilung (Vorschlag 13) holte der Browser den Coach-Teil erst, nachdem die Hauptdatei
   gelesen war – nach dem Laden der Seite. Fiel das Netz genau dann aus, startete die App nicht („Die App konnte nicht gestartet werden“).
   Jetzt werden alle Teile mit der Seite angefordert: ist die Seite geladen, ist der ganze App-Code da. */
test('Alle Teile des App-Codes kommen mit der Seite: Netz direkt nach dem Laden weg → App startet trotzdem', async ({ page, context }) => {
  await seed(page);
  // Teile langsam ausliefern (wie ein schwaches Netz)
  await page.route(/\/assets\/[^/]+\.js$/, async route => { await new Promise(r => setTimeout(r, 400)); await route.continue(); });
  await page.goto('/?go=heute');
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => (document.getElementById('app') as HTMLElement).dataset.appState), { timeout: 15000 }).toBe('ready');
  const pre = await page.evaluate(() => [...document.querySelectorAll('link[rel="modulepreload"]')].map(l => (l.getAttribute('href') || '').replace(/^.*\//, '').split('-')[0]));
  for (const part of ['main', 'logik', 'coach', 'texte']) expect(pre, 'vorab geladen: ' + part).toContain(part);
  await context.setOffline(false);
});
