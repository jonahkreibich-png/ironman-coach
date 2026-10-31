/* Auftrag 12: Coach schreibt wie im Chat (Punkte, Text baut sich auf, Antippen zeigt alles, Knöpfe danach, „Bewegung reduzieren“),
   Bewertung von Trainings, Scores mit drei Marken, Prognose heute und am Renntag, Rad-Zonen in km/h, hell und dunkel ohne Überstand. */
import { test, expect, type Page } from '@playwright/test';
import { seed, open, stored } from './helpers';

const send = async (page: Page, text: string) => { await page.fill('#coach-in', text); await page.locator('[data-act="coach-send"]').click(); };
const lastCoach = (page: Page) => page.locator('.feed .msg.coach').last();
const noOverflow = async (page: Page) => {
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push('Seite ' + document.documentElement.scrollWidth);
    document.querySelectorAll('.msg, .card, .mbar, .prow').forEach(el => { const r = (el as HTMLElement).getBoundingClientRect(); if (r.right > window.innerWidth + 1) out.push((el as HTMLElement).className + ' ' + Math.round(r.right)); });
    return out;
  });
  expect(bad).toEqual([]);
};

test('Coach schreibt: erst drei Punkte, dann baut sich der Text auf, Knöpfe erst danach', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=coach');
  await send(page, 'Wie war meine Woche?');
  const msg = lastCoach(page);
  await expect(msg).toHaveClass(/typing/);
  await expect(msg.locator('.dots')).toBeVisible();
  await expect(msg.locator('.dots')).toContainText('Coach schreibt');
  // während des Schreibens: keine Knöpfe in der Antwort
  await expect(msg.locator('.suggest')).toHaveCount(0);
  // Text wächst, am Ende steht alles da (3 Teile) und die Animation ist vorbei
  await expect(msg.locator('.mt')).toContainText('Gut:', { timeout: 8000 });
  await expect(page.locator('.feed .msg.typing')).toHaveCount(0, { timeout: 10000 });
  const txt = await lastCoach(page).locator('.mt').textContent();
  expect(txt).toMatch(/Gut:[\s\S]*Besser:[\s\S]*Nächste Tage:/);
});

test('Antippen zeigt sofort alles', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=coach');
  await send(page, 'Wie war meine Woche?');
  const msg = lastCoach(page);
  await expect(msg).toHaveClass(/typing/);
  await msg.click();
  await expect(page.locator('.feed .msg.typing')).toHaveCount(0, { timeout: 1000 });
  await expect(lastCoach(page).locator('.mt')).toContainText('Nächste Tage:');
});

test('„Bewegung reduzieren“: Antwort ohne Animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page);
  await open(page, '/?go=coach');
  await send(page, 'Wie war mein Lauf?');
  await expect(page.locator('.feed .msg.typing')).toHaveCount(0);
  await expect(lastCoach(page).locator('.mt')).toContainText(/Gut:|keine/);
});

test('hell und dunkel: Chat, Scores und Prognose ragen nicht heraus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page);
  for (const theme of ['light', 'dark']) {
    await open(page, '/?go=darstellung');
    await page.locator(`[data-act="set-theme"][data-v="${theme}"]`).click();
    await open(page, '/?go=coach');
    await send(page, 'Wie war meine Woche?');
    await expect(lastCoach(page).locator('.mt')).toContainText('Nächste Tage:');
    await noOverflow(page);
    await open(page, '/?go=fortschritt');
    await expect(page.locator('[data-prognosis]')).toBeVisible();
    await noOverflow(page);
  }
});

test('Scores: Stufe, drei Marken mit eigener Position, „Was am meisten bringt“, gezählte Einheiten', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=fortschritt');
  await expect(page.locator('.score .lvl').first()).not.toBeEmpty();
  await page.locator('[data-act="score-open"][data-sport="run"]').click();
  const sheet = page.locator('[data-score-sheet]');
  await expect(sheet).toContainText('Für dein Ziel nötig');
  await expect(sheet).toContainText('Nächstes Etappenziel');
  await expect(sheet.locator('.mbar .mk').first()).toBeVisible();
  await expect(sheet.locator('[data-conf]')).toContainText('Sicherheit');
  await expect(sheet).not.toContainText(/ · Ziel /);
  await sheet.locator('summary', { hasText: 'Diese Einheiten zählen' }).click();
  await expect(sheet.locator('.list .li').first()).toBeVisible();
});

test('Prognose: heute und am Renntag, je Disziplin, Pacing-Plan', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=fortschritt');
  const card = page.locator('[data-prognosis]');
  await expect(card).toContainText('Wenn du heute starten würdest');
  await expect(card).toContainText('Erwartet am');
  await expect(card.locator('[data-race]')).toBeVisible();
  for (const d of ['Schwimmen', 'Rad', 'Laufen', 'Wechsel']) await expect(card.locator('.prow', { hasText: d }).first()).toBeVisible();
  await card.locator('summary', { hasText: 'Pacing-Plan' }).click();
  await expect(card).toContainText(/Puls \d+/);
});

test('Einstellungen: Rad-Zonen auch in km/h mit Hinweis auf Wind und Steigung', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=zonen');
  await expect(page.locator('[data-speed-zones]')).toBeVisible();
  await expect(page.locator('.tbl', { hasText: 'km/h' }).first()).toBeVisible();
  await expect(page.getByText('flache Strecken ohne Wind').first()).toBeVisible();
});

test('Abhaken einer Einheit: Bewertung kommt automatisch in den Coach', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=heute');
  await page.locator('[data-act="sess-toggle"]:visible').first().click();
  await expect.poll(async () => Object.keys((await stored(page)).coachMsgs || {}).filter(k => k.startsWith('msg-review-')).length, { timeout: 6000 }).toBeGreaterThan(0);
  const st = await stored(page);
  const m: any = Object.values(st.coachMsgs).find((x: any) => x.id.startsWith('msg-review-'));
  expect(m.title).toMatch(/^Bewertung: /);
  expect(m.text).toMatch(/Gut:[\s\S]*Besser:[\s\S]*Nächste Tage:/);
});
