/* Auftrag 35 (Fund beim Release 3.23.0): Die Tab-Leiste führt einen Tipp zwei Bilder später aus (Glas-Animation bleibt flüssig).
   Wurde in dieser Lücke schon eine Unterseite geöffnet, kam der alte Tab-Tipp danach an und warf die Unterseite wieder hinaus bzw. löste
   den Knopf „Zurück“ unter dem Finger ab (app.spec, auch in 3.22.0 etwa jeder zweite Lauf). Jetzt verfällt ein verspäteter Tab-Tipp. */
import { test, expect } from '@playwright/test';
import { seed, open } from './helpers';

const SUBS = ['werte', 'essen', 'profil', 'verbindungen', 'konto', 'zonen', 'ausruestung', 'mitteilungen', 'darstellung', 'coachset', 'einheiten', 'sprache', 'daten', 'ueber'];
test('Schnell „Mehr“ und gleich eine Unterseite: die Unterseite bleibt, „Zurück“ bleibt greifbar (3 Durchgänge)', async ({ page }) => {
  test.setTimeout(120000);
  await seed(page); await open(page);
  for (let round = 0; round < 3; round++) for (const sub of SUBS) {
    await page.locator('.tab[data-tab="mehr"]').click();
    await page.locator(`[data-act="go-sub"][data-sub="${sub}"]`).first().click();
    await page.waitForTimeout(60);
    await expect(page.locator(`.view[data-view="${sub}"]`), `Unterseite ${sub} (Durchgang ${round + 1})`).not.toBeEmpty({ timeout: 3000 });
    await page.locator('[data-act="back"]').click({ timeout: 3000 });
    await expect(page.locator('.view[data-view="mehr"]')).not.toBeEmpty();
  }
});

/* Fund beim zweiten Release-Versuch 3.23.0: Auf einem langsamen Gerät (Bilder kommen spät) ließ ein älterer Tab-Tipp den neueren verfallen –
   man landete auf dem vorletzten Tab, die Linse sprang zurück. Der neueste Tipp gewinnt immer. */
test('Langsames Gerät: zwei schnelle Tab-Tipps – der letzte gewinnt, die Linse bleibt dort', async ({ page }) => {
  await seed(page); await open(page);
  const center = async (p: any, id: string) => { const r = await p.locator(`.tab[data-tab="${id}"]`).boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  await page.evaluate(() => { const o = window.requestAnimationFrame.bind(window); (window as any).requestAnimationFrame = (cb: FrameRequestCallback) => o(t => { setTimeout(() => cb(t), 80); }); });
  for (const [a, b] of [['plan', 'coach'], ['fortschritt', 'heute'], ['mehr', 'plan']]) {
    // direkt auf die Stelle tippen (ohne Playwrights Warten auf Ruhe – das ließe die Lücke verstreichen)
    const pa = await center(page, a), pb = await center(page, b);
    await page.touchscreen.tap(pa.x, pa.y); await page.touchscreen.tap(pb.x, pb.y);
    await expect(page.locator(`.view[data-view="${b}"]`), `${a} → ${b}`).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.locator(`.view[data-view="${b}"]`), `${a} → ${b} bleibt`).toBeVisible();
    await expect(page.locator(`.tab[data-tab="${b}"]`)).toHaveAttribute('aria-current', 'page');
    const off = await page.evaluate((id) => { const l = document.querySelector('.tab-lens')!.getBoundingClientRect(), t = document.querySelector(`.tab[data-tab="${id}"]`)!.getBoundingClientRect(); return Math.abs((l.left + l.width / 2) - (t.left + t.width / 2)); }, b);
    expect(off, 'Linse am Tab ' + b).toBeLessThan(2);
  }
});

/* Fund beim selben Lauf (app.spec): Tipp auf einen Tab und sofort auf eine Einheit, bevor der neue Tab steht – das Blatt ging auf und der
   verspätete Tab-Tipp schloss es gleich wieder. Das Öffnen des Blatts ist die neuere Handlung und bleibt. */
test('Langsames Gerät: Tab antippen und sofort eine Einheit öffnen – das Blatt bleibt offen', async ({ page }) => {
  await seed(page); await open(page);
  const box = async (sel: string) => { const r = (await page.locator(sel).first().boundingBox())!; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  const t = await box('.tab[data-tab="plan"]'), s = await box('.answer [data-act="sess-open"]');
  await page.evaluate(() => { const o = window.requestAnimationFrame.bind(window); (window as any).requestAnimationFrame = (cb: FrameRequestCallback) => o(tm => { setTimeout(() => cb(tm), 80); }); });
  await page.touchscreen.tap(t.x, t.y); await page.touchscreen.tap(s.x, s.y);
  await expect(page.locator('#sheet')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.locator('#sheet'), 'Blatt bleibt offen').toBeVisible();
  const off = await page.evaluate(() => { const on = document.querySelector('.tab[aria-current="page"]')!.getBoundingClientRect(), l = document.querySelector('.tab-lens')!.getBoundingClientRect(); return Math.abs((l.left + l.width / 2) - (on.left + on.width / 2)); });
  expect(off, 'Linse am aktiven Tab').toBeLessThan(2);
});
