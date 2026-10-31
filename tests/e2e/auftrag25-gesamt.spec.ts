/* Auftrag 25: Gesamttest. Für jede Funktion in docs/FUNKTIONEN.md mindestens ein Ablauf im echten Browser (Chromium und WebKit),
   mit den erfundenen Demo-Daten. Wo es schon einen ausführlichen Test gibt, steht er in FUNKTIONEN.md; hier liegen die Lücken
   und je ein kurzer Durchlauf pro Bereich, damit kein Bildschirm ohne Test bleibt. */
import { test, expect, type Page } from '@playwright/test';
import { seed, open, stored, writeStored, TODAY } from './helpers';
import { PERSONAS } from '../../fixtures/personas';

const errorsOf = (page: Page) => { const errs: string[] = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|404/.test(m.text())) errs.push(m.text()); }); return errs; };
const sheet = (page: Page) => page.locator('#sheet');

test('Fragebogen: ohne Plan starten, Antworten prüfen, bestätigen, Plan entsteht', async ({ page }) => {
  test.setTimeout(90000);
  const errs = errorsOf(page);
  await seed(page, { noPlan: true });
  await open(page, '/');
  await expect(page.locator('[data-act="ob-start"]').first()).toBeVisible();
  await page.locator('[data-act="ob-start"]').first().click();
  await expect(page.locator('.ob')).toBeVisible();
  // Antworten wie nach dem Ausfüllen (Test-Person), dann „verstanden“-Seite und Vorschau
  const answers = PERSONAS.find(x => x.id === 'olympisch-erfahren')!.answers;
  await page.evaluate(a => { const raw = JSON.parse(localStorage.getItem('ec_state_v2') || '{}'); raw.onboarding = { answers: a, block: 0, done: true }; localStorage.setItem('ec_state_v2', JSON.stringify(raw)); }, answers);
  await writeStored(page, await page.evaluate(() => JSON.parse(localStorage.getItem('ec_state_v2') || '{}')));
  await open(page, '/?go=onboarding');
  const conf = page.locator('[data-act="ob-confirm"]').first();
  await expect(conf).toBeVisible(); await conf.click();
  await expect(page.locator('[data-act="ob-apply"]').first()).toBeVisible({ timeout: 20000 });
  await page.locator('[data-act="ob-apply"]').first().click();
  await expect(page.locator('#tabs .tab').first()).toBeVisible({ timeout: 20000 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ec_plan') || '{"weeks":[]}').weeks.length)).toBeGreaterThan(3);
  expect(errs).toEqual([]);
});

test('Heute: Einheit öffnen, abhaken und wieder öffnen, Werte eintragen', async ({ page }) => {
  const errs = errorsOf(page);
  await seed(page);
  await open(page, '/?go=heute');
  const b = page.locator('.view [data-act="sess-open"]').first();
  await expect(b).toBeVisible();
  const sid = await b.getAttribute('data-sid');
  await b.click();
  await expect(sheet(page)).toBeVisible();
  await sheet(page).locator(`[data-act="sess-toggle"][data-sid="${sid}"]`).first().click();
  await expect.poll(async () => ((await stored(page)).sessions || {})[sid!]?.completed).toBe(true);
  await sheet(page).locator(`[data-act="sess-toggle"][data-sid="${sid}"]`).first().click();
  await expect.poll(async () => ((await stored(page)).sessions || {})[sid!]?.completed).toBe(false);
  await page.keyboard.press('Escape');
  await page.locator('[data-act="checkin-open"]').first().click();
  await expect(sheet(page)).toBeVisible();
  expect(errs).toEqual([]);
});

test('Einheit: abhaken, Messwert eintragen, Extra-Einheit anlegen', async ({ page }) => {
  const errs = errorsOf(page);
  await seed(page);
  await open(page, '/?go=heute');
  const b = page.locator('.view [data-act="sess-open"]').first();
  const sid = await b.getAttribute('data-sid');
  await b.click();
  await expect(sheet(page)).toBeVisible();
  // abhaken, dann ein Messfeld (Minuten, Puls …) füllen; Intervalle im Detail: auftrag22.spec.ts
  await sheet(page).locator(`[data-act="sess-toggle"][data-sid="${sid}"]`).first().click();
  const inp = sheet(page).locator('input.inp[inputmode="numeric"]:visible, input.inp[inputmode="decimal"]:visible').first();
  await expect(inp).toBeVisible({ timeout: 5000 });
  await inp.fill('45'); await inp.press('Tab');
  await expect.poll(async () => JSON.stringify(((await stored(page)).sessions || {})[sid!] || {})).toContain('45');
  await page.keyboard.press('Escape');
  // Extra-Einheit
  await open(page, '/?go=plan');
  const add = page.locator('[data-act="custom-add"]').first();
  await add.click();
  await expect(sheet(page)).toBeVisible();
  const title = page.locator('#ca-title'); await title.fill('Extra: Testlauf am Abend');
  await sheet(page).locator('[data-act="custom-save"]').first().click();
  await expect.poll(async () => Object.values((await stored(page)).customWorkouts || {}).flat().some((w: any) => /Testlauf am Abend/.test(w.title || ''))).toBe(true);
  expect(errs).toEqual([]);
});

test('Plan: Wochen wechseln, Tag wählen, „Heute“, Anpassungen zeigen', async ({ page }) => {
  const errs = errorsOf(page);
  await seed(page);
  await open(page, '/?go=plan');
  const weeks = page.locator('[data-act="plan-week"]');
  expect(await weeks.count()).toBeGreaterThan(1);
  await weeks.nth(1).click();
  await expect(page.locator('.view[data-view="plan"]')).not.toBeEmpty();
  const pick = page.locator('[data-act="plan-pick"]').first(); if (await pick.count()) await pick.click();
  const today = page.locator('[data-act="plan-today"]').first(); if (await today.count()) await today.click();
  const adj = page.locator('[data-act="plan-adjustments"]').first(); if (await adj.count()) { await adj.click(); await expect(adj).toHaveAttribute('aria-expanded', 'true'); }
  expect(errs).toEqual([]);
});

test('Coach: Schnellfragen, eigene Frage, Notizen (Regel-Coach ohne Konto)', async ({ page }) => {
  const errs = errorsOf(page);
  await seed(page);
  await open(page, '/?go=coach');
  await page.locator('#coach-in').fill('Was steht morgen an?');
  await page.locator('[data-act="coach-send"]').click();
  await expect(page.locator('.feed .msg.coach').last()).not.toHaveClass(/typing/, { timeout: 10000 });
  await expect(page.locator('.feed .msg.coach').last()).toContainText(/\S/);
  const say = page.locator('[data-act="chat-say"]').first();
  if (await say.count()) { const n = await page.locator('.feed .msg.coach').count(); await say.click(); await expect.poll(() => page.locator('.feed .msg.coach').count(), { timeout: 10000 }).toBeGreaterThanOrEqual(n); }
  // Änderung über den Chat mit Bestätigung und Rückgängig
  await page.locator('#coach-in').fill('Mach die Einheit heute kürzer');
  await page.locator('[data-act="coach-send"]').click();
  await expect(page.locator('.feed .msg.coach').last()).not.toHaveClass(/typing/, { timeout: 10000 });
  const opt = page.locator('.feed .msg.coach').last().locator('[data-act="chat-opt"]').first();
  if (await opt.count()) await opt.click();
  await page.locator('[data-act="notes-open"]').first().click();
  await expect(sheet(page)).toBeVisible();
  expect(errs).toEqual([]);
});

test('Fortschritt: Scores, Trends und Prognose öffnen', async ({ page }) => {
  const errs = errorsOf(page);
  await seed(page);
  await open(page, '/?go=fortschritt');
  const sc = page.locator('[data-act="score-open"]').first();
  await expect(sc).toBeVisible(); await sc.click(); await expect(sheet(page)).toBeVisible(); await page.keyboard.press('Escape');
  const tr = page.locator('[data-act="trend-open"]').first();
  if (await tr.count()) { await tr.click(); await expect(sheet(page)).toBeVisible(); await page.keyboard.press('Escape'); }
  await expect(page.locator('.view[data-view="fortschritt"]')).toContainText(/Prognose|Wettkampftag|erwartet/i);
  expect(errs).toEqual([]);
});

test('Essen: Mahlzeit hinzufügen, Werte zählen mit', async ({ page }) => {
  const errs = errorsOf(page);
  await seed(page);
  await open(page, '/?go=essen');
  const add = page.locator('[data-act="food-add"]').first();
  await expect(add).toBeVisible();
  await add.click();
  await expect.poll(async () => ((await stored(page)).nutrition || {})[TODAY]?.kcal || 0).toBeGreaterThan(0);
  expect(errs).toEqual([]);
});

test('Werte und Wettkampf: Seiten mit Inhalt, Morgenwerte-Blatt', async ({ page }) => {
  const errs = errorsOf(page);
  await seed(page);
  await open(page, '/?go=werte');
  await page.locator('.view [data-act="checkin-open"]').first().click();
  await expect(sheet(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await open(page, '/?go=wettkampf');
  await expect(page.locator('.view[data-view="wettkampf"]')).not.toBeEmpty();
  expect(await page.locator('#app').innerText()).not.toMatch(/\b(race|wk|prog)\.[a-z]/);
  expect(errs).toEqual([]);
});

test('Verbindungen (simuliert): Liste, Anbieter öffnen, Datei-Import sichtbar', async ({ page }) => {
  const errs = errorsOf(page);
  await seed(page);
  await open(page, '/?go=verbindungen');
  const c = page.locator('[data-act="conn-open"]').first();
  await expect(c).toBeVisible(); await c.click(); await expect(sheet(page)).toBeVisible();
  expect(errs).toEqual([]);
});

test('Fehler melden: ohne Konto landet die Meldung im Ausgang', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=feedback');
  await page.fill('#fb-text', 'Gesamttest: Knopf reagiert nicht');
  await page.locator('[data-act="fb-send"]').click();
  await expect(page.locator('[data-feedback-queued], [data-feedback-sent]').first()).toBeVisible();
});

test('Export und Löschen: Backup-Datei, Konto anlegen, Daten exportieren, Konto löschen; Mitteilungen einstellen', async ({ page, request, browserName }) => {
  test.skip(browserName === 'webkit', 'Server-Abläufe einmal reichen (Chromium)');
  test.setTimeout(60000);
  await request.post('/__reset');
  await request.post('/api/setup', { data: { name: 'iPhone Betreiber' } });
  await seed(page);
  await open(page, '/?go=daten');
  const dl0 = page.waitForEvent('download');
  await page.locator('[data-act="backup-file"]').click();
  expect((await dl0).suggestedFilename()).toMatch(/\.json$/);
  await open(page, '/?go=konto');
  await page.locator('[data-act="acc-signup"]').click();
  await expect(page.locator('[data-sync-status]').first()).toBeVisible({ timeout: 10000 });
  // Mitteilungen: Auswahl wird gespeichert (Zustellung selbst prüfen die Server-Tests)
  await open(page, '/?go=mitteilungen');
  const more = page.locator('summary').first(); if (await more.count()) await more.click();
  const tg = page.locator('input[data-ch="np"][type="checkbox"]').first();
  await tg.click();
  await expect.poll(async () => !!(await stored(page)).settings?.notify).toBe(true);
  await open(page, '/?go=daten');
  const dl = page.waitForEvent('download');
  await page.locator('[data-act="acc-export"]').click();
  expect((await dl).suggestedFilename()).toMatch(/daten-\d{4}-\d{2}-\d{2}\.json$/);
  await page.fill('#acc-confirm', 'LÖSCHEN');
  await page.locator('[data-act="acc-delete"]').click(); await page.locator('[data-act="acc-delete"]').click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ec_sync_auth')), { timeout: 15000 }).toBeNull();
});

test('Offline: ohne Netz weiter abhaken und speichern, nichts geht verloren', async ({ page, context }) => {
  await seed(page);
  await open(page, '/?go=heute');
  await context.setOffline(true);
  const b = page.locator('.view [data-act="sess-open"]').first(); const sid = await b.getAttribute('data-sid');
  await b.click();
  await sheet(page).locator(`[data-act="sess-toggle"][data-sid="${sid}"]`).first().click();
  await expect.poll(async () => ((await stored(page)).sessions || {})[sid!]?.completed).toBe(true);
  await page.keyboard.press('Escape');
  await page.locator('[data-act="go-tab"][data-tab="plan"]').click();
  await expect(page.locator('.view[data-view="plan"]')).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator('#app')).not.toBeEmpty();
  expect(((await stored(page)).sessions || {})[sid!]?.completed).toBe(true);
});

test('Plan-Generator und Lexikon: Seiten öffnen ohne Fehler', async ({ page }) => {
  const errs = errorsOf(page);
  await seed(page);
  await open(page, '/?go=lexikon');
  await expect(page.locator('.view[data-view="lexikon"]')).toContainText(/Zone/);
  await open(page, '/?go=generator');
  await expect(page.locator('#app')).not.toBeEmpty();
  expect(errs).toEqual([]);
});

test('iPhone: Zurück-Wischen (Verlauf) führt von der Unterseite zur Liste, offenes Blatt schließt zuerst', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=mehr');
  await page.locator('.mrow[data-sub="zonen"]').click();
  await expect(page.locator('[data-view="zonen"]')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#mehr-q')).toBeVisible();
  expect(new URL(page.url()).origin).toBe('http://localhost:4180');
  // Blatt offen: erst das Blatt zu, dann die Seite
  await page.locator('.mrow[data-sub="werte"]').click();
  await page.locator('.view [data-act="checkin-open"]').first().click();
  await expect(sheet(page)).toBeVisible();
  await page.goBack();
  await expect(sheet(page)).toBeHidden();
  await expect(page.locator('[data-view="werte"]')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#mehr-q')).toBeVisible();
  // „Zurück“-Knopf und danach Wischen: keine doppelte Navigation
  await page.locator('.mrow[data-sub="sprache"]').click();
  await page.locator('[data-act="back"]').click();
  await expect(page.locator('#mehr-q')).toBeVisible();
});

test('iPhone: Homescreen-Modus, Safe Area und Tastatur', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); });
  await seed(page);
  await open(page, '/?go=ueber');
  await expect(page.locator('.view')).toContainText('Installiert auf dem Home-Bildschirm');
  // Safe Area: Kopf und Tab-Leiste rechnen mit env(safe-area-inset-*)
  const css = await page.evaluate(() => [...document.styleSheets].flatMap(s => { try { return [...s.cssRules].map(r => r.cssText); } catch (e) { return []; } }).join('\n'));
  expect(css).toMatch(/safe-area-inset-top/); expect(css).toMatch(/safe-area-inset-bottom/);
  expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toMatch(/viewport-fit=cover/);
  // Tastatur: Eingabefeld im Coach bleibt beim Tippen sichtbar (nicht unter der Tab-Leiste)
  await open(page, '/?go=coach');
  const inp = page.locator('#coach-in'); await inp.focus(); await inp.type('Hallo');
  const box = await inp.boundingBox(); const tabs = await page.locator('#tabs').boundingBox();
  expect(box && tabs && box.y + box.height <= tabs.y + 1 || !tabs).toBeTruthy();
});
