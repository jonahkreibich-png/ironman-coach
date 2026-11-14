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
