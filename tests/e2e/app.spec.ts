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
    await expect(page.locator('#sheetPanel')).toContainText('Werte');
    await page.fill('#fd-min', '95'); await page.locator('#fd-min').blur();
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

  test('Kein „Mit Claude besprechen“ mehr: der Coach ist in der App', async ({ page }) => {
    await tab(page, 'coach').click();
    await expect(page.locator('[data-act="claude-open"]')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Claude');
    await expect(page.locator('#coach-in')).toBeVisible();
  });

  test('Schnellfrage beantwortet der kostenlose Coach', async ({ page }) => {
    await tab(page, 'coach').click();
    // Auftrag 24: der Tab wird erst nach dem Start der Linsen-Animation aufgebaut (zwei Frames), also auf den Coach warten
    await expect(page.locator('[data-view="coach"]')).toBeVisible();
    // Auftrag 20: Hinweise des Coaches (z. B. „Score neu berechnet“) können schon da sein: Frage und Antwort kommen dazu
    const before = await page.locator('.msg').count();
    await page.locator('[data-act="chat-say"]').first().click();
    await expect(page.locator('.msg')).toHaveCount(before + 2);
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
    // Auftrag 6: Ziel erst vorgemerkt, dann übernommen
    expect(Object.values((await stored(page)).goals).some((g: any) => g.type === 'run_10k' && g.date === '2027-04-18')).toBe(false);
    await page.locator('[data-act="stage-apply"]').click(); await page.locator('[data-act="stage-confirm"]').click();
    expect(Object.values((await stored(page)).goals).some((g: any) => g.type === 'run_10k' && g.date === '2027-04-18')).toBe(true);
    await tab(page, 'fortschritt').click();
    await page.locator('[data-act="score-open"]').first().click();
    await expect(page.locator('#sheetPanel')).toContainText('Warum dieser Wert?');
  });
});

/* Der Fragebogen-Durchlauf steht seit Auftrag 4 in auftrag4.spec.ts (Test-Person „Vater“). */

test('Sync einrichten, Verbindungen und Kurzbefehl-Schlüssel', async ({ page, request }) => {
  await request.post('/__reset');
  await seed(page);
  await open(page, '/?go=daten');
  await page.locator('summary', { hasText: 'Ich habe schon ein Konto' }).click(); await page.locator('summary', { hasText: 'Einrichtungscode' }).click();
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
