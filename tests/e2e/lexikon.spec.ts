import { test, expect } from './storage-harness';
import { seed, open, stored } from './helpers';

const legacyStrength = { id: 'lexikon-legacy', name: 'SYNTHETIC Lexikon-Kraft', updatedAt: 1, exercises: [{ name: 'Kniebeuge', sets: 3, reps: '8', kg: 20, restSec: 60 }] };

test('Mehr öffnet durchsuchbares Lexikon nach Themen; Kraftvorlagen bleiben erreichbar', async ({ page }) => {
  await seed(page, { extra: d => { d.strengthTemplates = { [legacyStrength.id]: JSON.parse(JSON.stringify(legacyStrength)) }; } }); await open(page, '/?go=mehr');
  await expect(page.locator('[data-sub="vorlagen"]')).toBeVisible();
  await page.locator('[data-sub="lexikon"]').click();
  await expect(page.locator('.top-title')).toHaveText('Begriffe / Lexikon');
  const cards = page.locator('[data-lexicon-term]');
  await expect(page.locator('.lexicon-topic')).toHaveCount(7);
  await expect(page.locator('[data-lexicon-term="Lauf-Intervalle"]')).toBeVisible();
  await page.getByLabel('Begriff suchen').fill('functional power');
  await expect(cards).toHaveCount(1); await expect(cards).toContainText('FTP');
  await page.getByLabel('Thema', { exact: true }).selectOption('planning');
  await expect(page.getByText('Kein Begriff gefunden.', { exact: false })).toBeVisible();
  await page.getByLabel('Begriff suchen').fill('');
  const names = await cards.evaluateAll(els => els.map(el => el.getAttribute('data-lexicon-term')!));
  expect(names.length).toBeGreaterThan(5);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'de')));
  await page.getByLabel('Thema', { exact: true }).selectOption('');
  await page.getByLabel('Begriff suchen').fill('ATL/CTL');
  await expect(page.locator('[data-lexicon-term="ATL/CTL"]')).toContainText('keine Verletzung voraus');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-act="back"]').click();
  await page.locator('[data-sub="vorlagen"]').click();
  await expect(page.locator('.top-title')).toHaveText('Trainingsvorlagen');
  await expect(page.locator('[data-training-template="legacy-strength:lexikon-legacy"]')).toContainText(legacyStrength.name);
  await page.locator('[data-sub="strength"]').click();
  await expect(page.locator('.top-title')).toHaveText('Kraftvorlagen');
  await expect(page.locator('[data-strength-template="lexikon-legacy"]')).toContainText('Kniebeuge');
  expect((await stored(page)).strengthTemplates[legacyStrength.id]).toEqual(legacyStrength);
});

test('normale Ansichten und Einheiten erhalten keine automatischen Begriffe-Blöcke', async ({ page }) => {
  await seed(page); await open(page, '/?go=plan');
  await expect(page.locator('[data-terms]')).toHaveCount(0);
  await page.locator('[data-act="sess-open"]').first().click();
  await expect(page.locator('#sheetPanel')).toBeVisible();
  await expect(page.locator('[data-terms]')).toHaveCount(0);
  await expect(page.locator('#sheetPanel')).not.toContainText('Begriffe:');
});

test('Begriffs-Link in Werte öffnet das Lexikon beim Begriff', async ({ page }) => {
  await seed(page); await open(page, '/?go=werte');
  await page.locator('[data-act="lex"][data-q="HFV"]').first().click();
  await expect(page.locator('.top-title')).toHaveText('Begriffe / Lexikon');
  await expect(page.getByLabel('Begriff suchen')).toHaveValue('HFV');
  await expect(page.locator('[data-lexicon-term="HFV"]')).toBeVisible();
});
