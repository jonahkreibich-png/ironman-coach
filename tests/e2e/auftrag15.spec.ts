/* Auftrag 15: Fragebogen auf iPhone-Breite (WebKit wie Safari): kein Eingabefeld (Datum, Zahl, Auswahl, Text) ragt aus dem
   Bildschirm, seiner Karte oder seinem Feld – auf allen Seiten, mit allen Feldern sichtbar (mehrere Ziele, alle Sportarten, Teamsport
   mit Saison-Datum, Freiwasser). Dazu: nur gewählte Sportarten im Plan nach dem Fragebogen. */
import { test, expect, type Page } from '@playwright/test';
import { TODAY } from './helpers';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

async function fresh(page: Page) {
  await page.addInitScript(() => { if (sessionStorage.getItem('__f')) return; localStorage.clear(); localStorage.setItem('ec_ui', JSON.stringify({ seenRelease: '9.9.9' })); sessionStorage.setItem('__f', '1'); });
  await page.clock.setFixedTime(new Date(`${TODAY}T07:30:00+02:00`));
}
/* Jedes sichtbare Eingabefeld liegt im Bildschirm, in seinem Feld (.fld) und in seiner Karte */
async function fieldProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth; const out: string[] = [];
    // Safari auf dem iPhone zeichnet Datums- und Zeitfelder mit eigener Mindestbreite (etwa 250 px), solange die System-Darstellung
    // aktiv ist; WebKit auf dem PC tut das nicht. Das wird hier nachgestellt: nur Felder mit eigener Darstellung (appearance: none) passen sich an.
    for (const el of Array.from(document.querySelectorAll('input[type="date"], input[type="time"], input[type="month"]')) as HTMLElement[]) {
      const cs = getComputedStyle(el) as any;
      if ((cs.webkitAppearance || cs.appearance) !== 'none') el.style.minWidth = '250px';
    }
    if (document.documentElement.scrollWidth > W + 1) out.push(`Seite scrollt seitlich (${document.documentElement.scrollWidth} > ${W})`);
    for (const el of Array.from(document.querySelectorAll('input, select, textarea')) as HTMLElement[]) {
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || (el as HTMLInputElement).type === 'hidden' || (el as HTMLInputElement).type === 'file') continue;
      const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
      const name = `${el.tagName.toLowerCase()}[type=${(el as HTMLInputElement).type || ''}]#${el.id}`;
      if (r.right > W + 1 || r.left < -1) out.push(`${name} ragt aus dem Bildschirm (${Math.round(r.left)}..${Math.round(r.right)} bei ${W})`);
      for (const box of [el.closest('.fld'), el.closest('.card')].filter(Boolean) as HTMLElement[]) {
        const b = box.getBoundingClientRect();
        if (r.right > b.right + 1 || r.left < b.left - 1) out.push(`${name} ragt aus ${box.className.split(' ')[0]} (${Math.round(r.left)}..${Math.round(r.right)} statt ${Math.round(b.left)}..${Math.round(b.right)})`);
      }
    }
    return [...new Set(out)];
  });
}

test.describe('Fragebogen: Eingabefelder auf iPhone-Breite', () => {
  test.skip(({ browserName }) => browserName !== 'webkit', 'iPhone-Darstellung (Safari/WebKit)');
  test.use({ userAgent: IPHONE_UA, hasTouch: true });
  for (const w of [320, 375, 390, 430]) {
    test(`${w} px: kein Feld ragt heraus (alle Seiten, Datum, Zahl, Auswahl)`, async ({ page }) => {
      test.setTimeout(90000);
      await page.setViewportSize({ width: w, height: 800 });
      await fresh(page);
      await page.goto('/?go=onboarding');
      await expect(page.locator('#app')).not.toBeEmpty();
      const problems: string[] = [];
      // Seite 1: zwei Ziele mit Datum (das Datumsfeld ragte gleich am Anfang heraus)
      for (let k = 0; k < 2; k++) if (await page.locator('[data-act="ob-goal-add"]').count()) await page.locator('[data-act="ob-goal-add"]').click();
      const dates = page.locator('input[type="date"]');
      expect(await dates.count()).toBeGreaterThan(0);
      for (let k = 0; k < await dates.count(); k++) await dates.nth(k).fill('2027-06-13');
      (await fieldProblems(page)).forEach(p => problems.push(`Seite 1: ${p}`));
      // alle Seiten, mit möglichst vielen sichtbaren Feldern
      for (let i = 1; i < 9; i++) {
        const b = page.locator(`[data-act="ob-jump"][data-i="${i}"]`); if (!(await b.count())) break;
        await b.click(); await page.waitForTimeout(40);
        for (const s of ['swim', 'bike', 'run', 'strength']) { const c = page.locator(`[data-act="ob-multi"][data-q="sports"][data-v="${s}"][aria-pressed="false"]`); if (await c.count()) await c.click(); }
        for (const q of ['teamYes', 'teamGames', 'openWater']) { const y = page.locator(`[data-act="ob-yn"][data-q="${q}"][data-v="1"]:not(.on)`); if (await y.count()) await y.click(); }
        const sel = page.locator('select#q-swimCrawl'); if (await sel.count()) await sel.selectOption('yes');
        for (const n of ['swimCrawlM', 'runContinuousMin', 'bikeLongestMin', 'teamTrainingMinutes']) { const f = page.locator(`#q-${n}`); if (await f.count()) await f.fill('45'); }
        const d2 = page.locator('input[type="date"]'); for (let k = 0; k < await d2.count(); k++) await d2.nth(k).fill('2027-03-01');
        await page.waitForTimeout(40);
        (await fieldProblems(page)).forEach(p => problems.push(`Seite ${i + 1}: ${p}`));
      }
      expect(problems).toEqual([]);
    });
  }
});
