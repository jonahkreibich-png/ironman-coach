import { test, expect, type Page } from '@playwright/test';
import { seed, open, stored, TODAY } from './helpers';

const tab = (page: Page, id: string) => page.locator(`.tab[data-tab="${id}"]`);
async function errorsDuring(page: Page, fn: () => Promise<void>) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await fn();
  return errors;
}

test.describe('Grundfunktionen', () => {
  test.beforeEach(async ({ page }) => { await seed(page); await open(page); });

  test('alle Tabs und Unterseiten zeigen Inhalt ohne Fehler', async ({ page }) => {
    const errors = await errorsDuring(page, async () => {
      for (const id of ['heute', 'plan', 'coach', 'fortschritt', 'mehr']) {
        await tab(page, id).click();
        await expect(tab(page, id)).toHaveAttribute('aria-current', 'page');
        await expect(page.locator(`.view[data-view="${id}"]`)).not.toBeEmpty();
      }
      for (const sub of ['werte', 'essen', 'profil', 'verbindungen', 'einstellungen', 'daten', 'onboarding', 'generator']) {
        await tab(page, 'mehr').click();
        await page.locator(`[data-act="go-sub"][data-sub="${sub}"]`).first().click();
        await expect(page.locator(`.view[data-view="${sub}"]`)).not.toBeEmpty();
        await expect(page.locator('.top-title')).not.toHaveText(/^(sub|tab)\./);
        await page.locator('[data-act="back"]').click();
      }
    });
    expect(errors).toEqual([]);
    // Kein Text-Schlüssel darf sichtbar sein (fehlende Übersetzung)
    await expect(page.locator('body')).not.toContainText(/\b(heute|sess|coach|prog|conn|set|data)\.[a-z][a-zA-Z]+\b/);
  });

  test('Einheit abhaken und wieder lösen (1 Tipp)', async ({ page }) => {
    const btn = page.locator('.answer [data-act="sess-toggle"]').first();
    const sid = await btn.getAttribute('data-sid');
    await btn.click();
    await expect(page.locator(`.answer [data-act="sess-toggle"][data-sid="${sid}"]`)).toHaveAttribute('aria-pressed', 'true');
    expect((await stored(page)).sessions[sid!].completed).toBe(true);
    await page.locator(`.answer [data-act="sess-toggle"][data-sid="${sid}"]`).click();
    expect((await stored(page)).sessions[sid!].completed).toBe(false);
  });

  test('Einheit öffnen und Messwert von Hand eintragen', async ({ page }) => {
    await tab(page, 'plan').click();
    const open = page.locator('[data-act="sess-open"]').first();
    const sid = await open.getAttribute('data-sid');
    await open.click();
    await expect(page.locator('#sheet')).toBeVisible();
    await expect(page.locator('#sheetPanel')).toContainText('Gemessen');
    await page.fill('#sm-min', '95'); await page.locator('#sm-min').blur();
    await expect.poll(async () => ((await stored(page)).sessions[sid!] || {}).metrics?.min).toBe('95');
    await page.locator('#sheetPanel [data-act="sheet-close"]').first().click();
    await expect(page.locator('#sheet')).toBeHidden();
  });

  test('Morgenwerte eintragen: von Hand bleibt, Quelle wird angezeigt', async ({ page }) => {
    await page.locator('.top [data-act="checkin-open"]').click();
    await page.fill('#ck-hrv', '71');
    await page.locator('#ck-hrv').blur();
    await page.fill('#ck-restingHR', '49');
    await page.locator('#ck-restingHR').blur();
    const s = await stored(page);
    const p = s.trend.find((x: any) => x.date === TODAY);
    expect(p.hrv).toBe(71);
    expect(p.restingHR).toBe(49);
    expect(p._src.hrv).toBe('manual');
    await expect(page.locator('label[for="ck-hrv"] .src.manual')).toBeVisible();
  });

  test('Krankheitsmodus starten und beenden', async ({ page }) => {
    await page.locator('.answer details summary').click();
    await page.locator('[data-act="ill-start"]').click();
    await expect(page.locator('.status-word')).toHaveText('Krank');
    expect((await stored(page)).illnessPeriods.some((p: any) => p.start === TODAY && !p.end)).toBe(true);
    await page.locator('[data-act="ill-end"]').click();
    await expect(page.locator('.status-word')).not.toHaveText('Krank');
  });

  test('Mit Claude besprechen: Zusammenfassung ohne Oura-Daten', async ({ page }) => {
    await tab(page, 'coach').click();
    await page.locator('[data-act="claude-open"]').click();
    await expect(page.locator('#sheetPanel')).toContainText('Zusammenfassung');
    const preview = await page.locator('#sheetPanel pre').textContent();
    expect(preview && preview.length).toBeGreaterThan(200);
    expect(preview).not.toMatch(/oura/i);
  });

  test('Schnellfrage beantwortet der kostenlose Coach', async ({ page }) => {
    await tab(page, 'coach').click();
    await page.locator('[data-act="quick"]').first().click();
    await expect(page.locator('.msg')).toHaveCount(2);
  });

  test('Darstellung: dunkel und Heute-Variante B', async ({ page }) => {
    await tab(page, 'mehr').click();
    await page.locator('[data-sub="einstellungen"]').click();
    await page.locator('[data-act="set-theme"][data-v="dark"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('[data-act="set-variant"][data-v="feed"]').click();
    await tab(page, 'heute').click();
    await expect(page.locator('.answer')).toHaveCount(0);
    await expect(page.locator('.view[data-view="heute"] .msg.coach')).toBeVisible();
  });

  test('Ziel anlegen und Score-Erklärung öffnen', async ({ page }) => {
    await tab(page, 'mehr').click();
    await page.locator('[data-sub="profil"]').click();
    await page.locator('[data-act="goal-new"]').click();
    await page.selectOption('#g-type', 'run_10k');
    await page.fill('#g-date', '2027-04-18'); await page.locator('#g-date').blur();
    await page.locator('[data-act="goal-save"]').click();
    expect(Object.values((await stored(page)).goals).some((g: any) => g.type === 'run_10k' && g.date === '2027-04-18')).toBe(true);
    await tab(page, 'fortschritt').click();
    await page.locator('[data-act="score-open"]').first().click();
    await expect(page.locator('#sheetPanel')).toContainText('Warum dieser Wert?');
  });
});

test('Start ohne Daten: Fragebogen bis zum Plan', async ({ page }) => {
  await seed(page, { noPlan: true });
  await open(page);
  await expect(page.locator('.welcome')).toBeVisible();
  await page.locator('[data-act="ob-start"]').click();
  // Block 1: Ziel
  await page.locator('[data-act="ob-goal-add"]').click();
  await page.selectOption('#og-type-0', 'tri_sprint');
  await page.fill('#og-date-0', '2027-06-20'); await page.locator('#og-date-0').blur();
  await page.locator('[data-act="ob-next"]').click();
  // Block 2: Person
  await page.fill('#q-birthYear', '1995'); await page.locator('#q-birthYear').blur();
  await page.fill('#q-injuries', 'keine'); await page.locator('#q-injuries').blur();
  await page.locator('[data-act="ob-next"]').click();
  // Block 3: Hintergrund
  for (const s of ['swim', 'bike', 'run']) await page.locator(`[data-act="ob-multi"][data-q="sports"][data-v="${s}"]`).click();
  await page.fill('#q-weeklyHoursNow', '5'); await page.locator('#q-weeklyHoursNow').blur();
  await page.locator('[data-act="ob-next"]').click();
  // Block 4: Zeit
  for (const d of ['2', '4', '6']) await page.locator(`[data-act="ob-win-add"][data-d="${d}"]`).click();
  await page.fill('#q-weeklyHours', '7'); await page.locator('#q-weeklyHours').blur();
  await page.fill('#q-maxDayHours', '2.5'); await page.locator('#q-maxDayHours').blur();
  // Rest überspringen
  for (let i = 0; i < 5; i++) await page.locator('[data-act="ob-skip"]').click();
  await expect(page.locator('h2', { hasText: 'Dein Plan' })).toBeVisible();
  await expect(page.locator('.card', { hasText: 'In 5 Sätzen' }).locator('p')).toHaveCount(5);
  await page.locator('[data-act="ob-apply"]').click();
  await page.waitForURL(/\/$|go=heute/);
  await expect(tab(page, 'heute')).toBeVisible();
  const plan = await page.evaluate(() => JSON.parse(localStorage.getItem('ec_plan') || 'null'));
  expect(plan.weeks.length).toBeGreaterThan(4);
});

test('Sync einrichten, Verbindungen und Kurzbefehl-Schlüssel', async ({ page, request }) => {
  await request.post('/__reset');
  await seed(page);
  await open(page, '/?go=daten');
  await page.locator('summary', { hasText: 'Server zum ersten Mal einrichten' }).click();
  await page.locator('[data-act="sync-setup"]').click();
  await expect(page.locator('[data-sync-status]').first()).toContainText('Abgeglichen');
  await page.locator('[data-act="back"]').click();
  await page.locator('[data-sub="verbindungen"]').click();
  await page.locator('[data-act="conn-open"][data-id="shortcut"]').click();
  await page.locator('[data-act="key-new"]').click();
  await expect(page.locator('#sheetPanel code').first()).toContainText('sk_');
  // Schlüssel funktioniert: Werte per Kurzbefehl senden
  const key = (await page.locator('#sheetPanel code').first().textContent())!.trim();
  const res = await request.post('/api/ingest/shortcut', { headers: { 'X-Ingest-Key': key }, data: { date: TODAY, hrv: 66, ruhepuls: 51, schlaf: '7,6' } });
  expect(res.ok()).toBe(true);
});
