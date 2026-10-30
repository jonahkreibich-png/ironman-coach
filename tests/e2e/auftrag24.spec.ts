/* Auftrag 24: Prognose nur für Ziele, die zu den gewählten Sportarten passen (sonst ein kurzer Hinweis beim Ziel und im Fortschritt),
   keine fremde Sportart in Scores und Prognose; „Warum?“ nennt, woraus die Hochrechnung stammt; heute ≠ Wettkampftag.
   Läuft in Chromium und WebKit. */
import { test, expect } from '@playwright/test';
import { seed, open, TODAY } from './helpers';

const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

test('Triathlon-Ziel ohne Laufen: keine Prognose und kein Lauf-Score, ein Hinweis im Fortschritt und beim Ziel im Profil', async ({ page }) => {
  await seed(page, { extra: d => {
    d.profile = { ...(d.profile || {}), sports: ['swim', 'bike', 'strength'] };
    d.goals = { 'g-tri': { id: 'g-tri', type: 'tri_olympic', name: 'Triathlon', date: addDays(TODAY, 270), priority: 'A', outcome: 'finish' },
      'g-sw': { id: 'g-sw', type: 'swim_goal', name: 'Schwimmen 1,5 km', date: addDays(TODAY, 120), priority: 'B', outcome: 'finish' } };
  } });
  await open(page, '/?go=fortschritt');
  const hint = page.locator('[data-goal-mismatch="g-tri"]');
  await expect(hint).toHaveCount(1);
  await expect(hint).toContainText('Dein Ziel enthält Laufen, das trainierst du bisher nicht – Ziel ändern oder Laufen hinzufügen?');
  await expect(page.locator('[data-prognosis="g-tri"]')).toHaveCount(0);
  await expect(page.locator('[data-prognosis="g-sw"]')).toHaveCount(1);
  // keine fremde Sportart: kein Lauf-Score, in der Schwimm-Prognose kein Laufen/Rad
  await expect(page.locator('.score[data-sport="run"]')).toHaveCount(0);
  await page.evaluate(() => document.querySelectorAll('[data-prognosis] details').forEach(d => (d as HTMLDetailsElement).open = true));
  const txt = await page.locator('[data-prognosis="g-sw"]').innerText();
  expect(txt).not.toMatch(/Laufen|Lauf-|Rad |Radtest|Ausfahrt/);
  // Profil: Hinweis direkt am Ziel, mit „Ziel ändern“ und „Laufen hinzufügen“
  await hint.locator('[data-act="go-sub"]').click();
  const ph = page.locator('[data-view="profil"] [data-goal-mismatch="g-tri"]');
  await expect(ph).toContainText('Dein Ziel enthält Laufen');
  await expect(ph.locator('[data-act="goal-open"]')).toHaveText('Ziel ändern');
  await expect(ph.locator('[data-act="pf-sport"][data-s="run"]')).toContainText('hinzufügen');
  await expect(page.locator('[data-view="profil"] [data-goal-mismatch="g-sw"]')).toHaveCount(0);
  // „Laufen hinzufügen“ wählt Laufen aus (wie der Chip bei den Sportarten), der Hinweis verschwindet
  await ph.locator('[data-act="pf-sport"][data-s="run"]').click();
  await expect(page.locator('[data-view="profil"] .chip[data-s="run"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-view="profil"] [data-goal-mismatch="g-tri"]')).toHaveCount(0);
});

test('heute und Wettkampftag verschieden (274 Tage), „Warum?“ nennt die Herkunft der Hochrechnung', async ({ page }) => {
  await seed(page, { extra: d => {
    d.profile = { ...(d.profile || {}), sports: ['swim', 'bike', 'run'], birthYear: 1977 };
    d.goals = { 'g-oly': { id: 'g-oly', type: 'tri_olympic', name: 'Triathlon', date: addDays(TODAY, 274), priority: 'A', outcome: 'finish' } };
  } });
  await open(page, '/?go=fortschritt');
  const card = page.locator('[data-prognosis="g-oly"]');
  await expect(card).toHaveCount(1);
  const today = await card.locator('[data-range]').innerText(), race = await card.locator('[data-race]').innerText();
  expect(race).not.toBe(today);
  await page.evaluate(() => document.querySelectorAll('[data-prognosis] details').forEach(d => (d as HTMLDetailsElement).open = true));
  await expect(card.locator('[data-prog-why]')).toContainText(/Hochrechnung aus typischer Entwicklung|aus deinem Trend der letzten \d+ Wochen/);
});
