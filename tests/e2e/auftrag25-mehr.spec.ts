/* Auftrag 25: Mehr-Tab wie die iOS-Einstellungen. Profilkarte, Suche, Gruppen in fester Reihenfolge, jede Zeile öffnet eine Seite
   (höchstens 2 Ebenen), nichts von den alten Seiten „Einstellungen“ und „Daten und Geräte“ ist verloren. */
import { test, expect } from '@playwright/test';
import { seed, open, stored } from './helpers';

test.beforeEach(async ({ page }) => { await seed(page); });

test('Gruppen in der richtigen Reihenfolge, jede Zeile öffnet eine Seite mit Inhalt', async ({ page }) => {
  await open(page, '/?go=mehr');
  await expect(page.locator('#mehr-q')).toBeVisible();
  await expect(page.locator('.profile-card')).toBeVisible();
  const heads = await page.locator('.mgroup .sec-h h2').allTextContents();
  expect(heads).toEqual(['Training', 'Werte und Essen', 'Einstellungen', 'Hilfe']);
  const subs = await page.locator('.mrow').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.sub));
  expect(subs.slice(0, 2)).toEqual(['konto', 'profil']);
  for (const want of ['zonen', 'ausruestung', 'verbindungen', 'mitteilungen', 'darstellung', 'coachset', 'einheiten', 'sprache', 'daten', 'lexikon', 'feedback', 'ueber']) expect(subs).toContain(want);
  expect(subs.indexOf('verbindungen')).toBeLessThan(subs.indexOf('mitteilungen'));
  expect(subs.indexOf('daten')).toBeLessThan(subs.indexOf('lexikon'));
  expect(subs.indexOf('feedback')).toBeLessThan(subs.indexOf('ueber'));
  for (const sub of subs) {
    await page.locator(`.mrow[data-sub="${sub}"]`).click();
    await expect(page.locator(`[data-view="${sub}"]`)).toBeVisible();
    await expect.poll(async () => (await page.locator('#app').innerText()).trim().length, { message: sub }).toBeGreaterThan(20);
    const txt = await page.locator('#app').innerText();
    expect(txt, sub).not.toMatch(/\b(sub|mehr|set|data|acc|gear)\.[a-zA-Z]/);
    await expect(page.locator('.top-title')).not.toHaveText(/sub\./);
    await page.locator('[data-act="back"]').click();
    await expect(page.locator('#mehr-q')).toBeVisible();
  }
});

test('nichts verloren: alle Bereiche der alten Seiten sind noch erreichbar', async ({ page }) => {
  const where: [string, string[]][] = [
    ['zonen', ['Zonen und Schwellen', 'Tests', 'Ampel-Grenzwerte', 'Score-Korrektur']],
    ['mitteilungen', ['Mitteilungen']], ['darstellung', ['Darstellung']], ['coachset', ['KI-Coach', 'Coach-Nachrichten']],
    ['beruecksichtigungen', ['Krankheitsphasen']], ['ausruestung', ['Laufschuhe']], ['einheiten', ['Einheiten']], ['sprache', ['Sprache']],
    ['konto', ['E-Mail', 'Konto']], ['daten', ['Backup', 'Datenschutz']], ['ueber', ['App', 'Fehlerprotokoll']]
  ];
  for (const [sub, heads] of where) {
    await open(page, '/?go=' + sub);
    const h = await page.locator('.sec-h h2').allTextContents();
    for (const x of heads) expect(h, sub).toContain(x);
  }
});

test('Suche filtert Zeilen, ohne Treffer kommt ein Hinweis', async ({ page }) => {
  await open(page, '/?go=mehr');
  await page.locator('#mehr-q').fill('puls');
  await expect(page.locator('.mrow[data-sub="zonen"]')).toBeVisible();
  await expect(page.locator('.mrow[data-sub="sprache"]')).toBeHidden();
  await expect(page.locator('#mehr-q')).toBeFocused();
  await page.locator('#mehr-q').fill('Schuhe');
  await expect(page.locator('.mrow:visible')).toHaveCount(1);
  await expect(page.locator('.mrow[data-sub="ausruestung"]')).toBeVisible();
  await page.locator('#mehr-q').fill('qqqxyz');
  await expect(page.locator('[data-mehr-empty]')).toBeVisible();
  await page.locator('#mehr-q').fill('');
  await expect(page.locator('[data-mehr-empty]')).toBeHidden();
  await expect(page.locator('.mrow[data-sub="sprache"]')).toBeVisible();
});

test('Profilbild wählen und entfernen, E-Mail freiwillig mit Prüfung', async ({ page }) => {
  await open(page, '/?go=profil');
  // 400 × 300 px PNG erzeugen und hochladen
  const png = await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d')!; g.fillStyle = '#e8491a'; g.fillRect(0, 0, 400, 300); return c.toDataURL('image/png').split(',')[1]; });
  await page.locator('#pf-photo').setInputFiles({ name: 'ich.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.locator('[data-photo] img.avatar')).toBeVisible();
  const s = await stored(page);
  expect(s.profile.photo).toMatch(/^data:image\/jpeg;base64,/);
  expect(s.profile.photo.length).toBeLessThan(60000);
  await open(page, '/?go=mehr');
  await expect(page.locator('.profile-card img.avatar')).toBeVisible();
  await open(page, '/?go=profil');
  await page.locator('[data-act="pf-photo-del"]').click();
  await expect(page.locator('[data-photo] .avatar.ph')).toBeVisible();
  expect((await stored(page)).profile.photo).toBeUndefined();
  await open(page, '/?go=konto');
  await page.locator('#acc-email').fill('kein-mail');
  await page.locator('#acc-email').blur();
  await expect(page.locator('.toast')).toContainText('E-Mail-Adresse');
  expect((await stored(page)).profile.email).toBeUndefined();
  await page.locator('#acc-email').fill('test@beispiel.de');
  await page.locator('#acc-email').blur();
  await expect.poll(async () => (await stored(page)).profile.email).toBe('test@beispiel.de');
});

test('Einheiten und Sprache: Auswahl gilt sofort, alte Links führen weiter', async ({ page }) => {
  await open(page, '/?go=einheiten');
  await page.locator('[data-act="set-pf"][data-v="imperial"]').click();
  await expect(page.locator('[data-act="set-pf"][data-v="imperial"]')).toHaveAttribute('aria-checked', 'true');
  expect((await stored(page)).profile.units).toBe('imperial');
  await open(page, '/?go=mehr');
  await expect(page.locator('.mrow[data-sub="einheiten"] .v')).toContainText('imperial');
  await open(page, '/?go=einstellungen');
  await expect(page.locator('#mehr-q')).toBeVisible();
});
