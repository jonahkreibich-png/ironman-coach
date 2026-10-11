/* Auftrag 4: Fehler aus dem ersten Test, nachgestellt auf iPhone-Breite (Chromium und WebKit). Diese Tests bleiben im Paket. */
import { test, expect, type Page } from '@playwright/test';
import { seed, open, stored, TODAY } from './helpers';

const tab = (page: Page, id: string) => page.locator(`.tab[data-tab="${id}"]`);
const next = (page: Page) => page.locator('[data-act="ob-next"]').click();
async function fill(page: Page, sel: string, v: string) { await page.fill(sel, v); await page.locator(sel).blur(); }
const auth = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('ec_sync_auth') || 'null'));

test('A1/B/F2/A4/A5: Test-Person „Vater“ füllt den ganzen Fragebogen aus, sieht die Zusammenfassung und bekommt einen passenden Plan', async ({ page }) => {
  await seed(page, { noPlan: true });
  await open(page);
  await page.locator('[data-act="ob-start"]').click();
  // 1 Ziele mit eigener Wunschzeit (Zeitfelder ohne Doppelpunkt)
  await page.locator('[data-act="ob-goal-add"]').click();
  await page.selectOption('#og-type-0', 'bike_event');
  await fill(page, '#og-date-0', '2027-03-21');
  await fill(page, '#og-name-0', 'Radmarathon 150 km');
  await fill(page, '#og-time-0-h', '6'); await fill(page, '#og-time-0-m', '30');
  await expect(page.locator('[data-realism="0"]')).toContainText(/realistisch|ehrgeizig/);
  await page.locator('[data-act="ob-goal-add"]').click();
  await page.selectOption('#og-type-1', 'run_10k');
  await fill(page, '#og-date-1', '2026-12-31');
  await page.selectOption('#og-prio-1', 'C');
  await next(page);
  // 2 Person
  await fill(page, '#q-birthYear', '1976'); await fill(page, '#q-injuries', 'keine');
  await next(page);
  // 3 Sportarten: Rad, Laufen, Kraft (kein Schwimmen)
  for (const s of ['bike', 'run', 'strength']) await page.locator(`[data-act="ob-multi"][data-q="sports"][data-v="${s}"]`).click();
  await fill(page, '#q-weeklyHoursNow', '5');
  await next(page);
  // 4 Können und Räder
  await expect(page.locator('#q-swimCrawl')).toHaveCount(0);
  await fill(page, '#q-runContinuousMin', '40'); await fill(page, '#q-bikeLongestMin', '150');
  await page.locator('[data-act="ob-multi"][data-q="bikes"][data-v="gravel"]').click();
  await next(page);
  // 5 kein Teamsport
  await page.locator('[data-act="ob-yn"][data-q="teamYes"][data-v="0"]').click();
  await expect(page.locator('[data-qid="teamGameDays"]')).toHaveCount(0);
  await next(page);
  // 6 Zeit pro Tag (keine Uhrzeiten), Häufigkeit
  await expect(page.locator('input[type="time"]')).toHaveCount(0);
  for (const [d, v] of [['2', '2'], ['3', '1'], ['4', '2'], ['6', '3'], ['0', '3']]) await page.locator(`[data-act="ob-dl"][data-d="${d}"][data-v="${v}"]`).click();
  await fill(page, '#q-weeklyHours', '7'); await fill(page, '#q-maxDayHours', '3.5');
  await expect(page.locator('[data-qid="freq"]')).toContainText('Verfügbar sind 5 Trainingstage');
  await page.locator('[data-act="ob-freq"][data-s="strength"][data-d="1"]').click(); // 1-2× → 2×
  await expect(page.locator('[data-freq="strength"]')).toHaveText('2×');
  await next(page);
  // 7 Berücksichtigungen
  await fill(page, '#q-notes', 'Knie links zwickt beim Bergablaufen');
  await next(page); await next(page); await next(page);
  // F2: Das habe ich verstanden
  await expect(page.locator('h2', { hasText: 'Das habe ich verstanden' })).toBeVisible();
  await expect(page.locator('[data-u="Teamsport"]')).toContainText('kein Teamsport');
  await expect(page.locator('[data-u="Ziele"]')).toContainText('Wunschzeit 6:30 h');
  await expect(page.locator('[data-u="Kraft"]')).toContainText('2×');
  await page.locator('[data-act="ob-confirm"]').click();
  await expect(page.locator('.plan-explain')).toContainText('Phasen bis Radmarathon 150 km');
  await page.locator('[data-act="ob-apply"]').click();
  await page.waitForURL(/go=plan|\/$/);
  await expect(tab(page, 'plan')).toBeVisible();
  await tab(page, 'plan').click();
  await expect(page.locator('[data-week-head]')).toContainText(/Woche 1 von \d+ → Radmarathon 150 km/);
  const plan = await page.evaluate(() => JSON.parse(localStorage.getItem('ec_plan') || 'null'));
  const all = plan.weeks.slice(0, 4).flatMap((w: any) => w.days.flatMap((d: any) => d.sessions));
  expect(all.some((s: any) => s.sport === 'swim')).toBe(false);
  expect(all.filter((s: any) => s.sport === 'strength').length).toBeGreaterThanOrEqual(6);
  expect(all.find((s: any) => s.sport === 'strength').description).toMatch(/\d×\d+/);
  // keine Werte einer anderen Person, keine Spieltage, kein Fußball
  const st = await stored(page);
  expect(st.profile.thresholds.lthrRun).not.toBe(170); expect(st.profile.thresholds.thresholdPaceRunSec).not.toBe(339);
  for (const where of ['plan', 'coach', 'mehr']) { await tab(page, where).click(); await expect(page.locator('#app')).not.toContainText(/Fußball|Spieltag/); }
  await page.locator('[data-act="go-sub"][data-sub="essen"]').click();
  expect(await page.locator('#food-type option').allTextContents()).not.toContain('Spieltag');
  await page.locator('[data-act="back"]').click();
  await tab(page, 'plan').click();
  await page.locator('[data-act="custom-add"]').click();
  expect(await page.locator('#ca-sport option').allTextContents()).not.toContain('Teamsport');
});

test('A7: Pace in Min und Sek getrennt eintragen (Zahlentastatur), geschätzte Werte sind markiert', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=einstellungen');
  const m = page.locator('#z-tp-m');
  await expect(m).toHaveAttribute('inputmode', 'numeric');
  await expect(page.locator('#z-tp-s')).toHaveAttribute('inputmode', 'numeric');
  await fill(page, '#z-tp-m', '5'); await fill(page, '#z-tp-s', '45');
  await expect.poll(async () => (await stored(page)).profile?.thresholds?.thresholdPaceRunSec).toBe(345);
  expect((await stored(page)).profile.thresholds.estimated || []).not.toContain('thresholdPaceRunSec');
  // CSS ebenso
  await fill(page, '#z-css-m', '1'); await fill(page, '#z-css-s', '58');
  await expect.poll(async () => (await stored(page)).profile?.thresholds?.cssSec).toBe(118);
});

test('A7: Pace bei einer Einheit mit getrennten Feldern', async ({ page }) => {
  await seed(page);
  await open(page);
  await tab(page, 'plan').click();
  const run = page.locator('[data-act="sess-open"]').filter({ hasText: /Lauf/ }).first();
  const sid = await run.getAttribute('data-sid');
  await run.click();
  if (!(await page.locator('#sm-pace-m').count())) await page.locator('#sheetPanel [data-act="sess-toggle"]').first().click();
  await fill(page, '#sm-pace-m', '5'); await fill(page, '#sm-pace-s', '30');
  await expect.poll(async () => ((await stored(page)).sessions[sid!] || {}).metrics?.pace).toBe('5:30');
});

test('D: freies Schreiben mit dem Coach ohne KI, Aktion erst nach Bestätigung', async ({ page }) => {
  await seed(page);
  await open(page);
  await tab(page, 'coach').click();
  await page.fill('#coach-in', 'Ich bin krank');
  await page.locator('[data-act="coach-send"]').click();
  await expect(page.locator('.msg').last()).toContainText('Krankheitsphase eintragen');
  expect((await stored(page)).illnessPeriods.some((p: any) => !p.end)).toBe(false);
  await page.locator('[data-act="chat-action"]').first().click();
  await expect.poll(async () => (await stored(page)).illnessPeriods.some((p: any) => !p.end)).toBe(true);
  // Unbekanntes: ehrliche Antwort mit Vorschlägen
  await page.fill('#coach-in', 'Was kostet ein Eis?');
  await page.locator('[data-act="coach-send"]').click();
  await expect(page.locator('.msg').last()).toContainText('verstehe ich leider noch nicht');
  await expect(page.locator('.msg').last().locator('[data-act="chat-say"]')).not.toHaveCount(0);
});

test('C5: Plan bearbeiten – Einheit ändern, als fest markieren, rückgängig und Original', async ({ page }) => {
  await seed(page);
  await open(page);
  await tab(page, 'plan').click();
  await page.locator('[data-act="edit-toggle"]').click();
  await expect(page.locator('[data-edit-bar]')).toBeVisible();
  const row = page.locator('[data-act="sess-edit"]').first();
  const sid = await row.getAttribute('data-sid');
  await row.click();
  await page.fill('#ed-min', '25');
  await page.locator('#ed-lock').check();
  await page.locator('[data-act="edit-save"]').click();
  if (await page.locator('[data-act="edit-anyway"]').isVisible().catch(() => false)) await page.locator('[data-act="edit-anyway"]').click();
  await expect.poll(async () => Object.values((await stored(page)).adjustments).some((a: any) => a.from_user && a.sessionId === sid && a.set && a.set.locked)).toBe(true);
  await expect(page.locator(`[data-act="sess-edit"][data-sid="${sid}"]`)).toHaveClass(/locked/);
  await page.locator('[data-act="edit-restore"]').click();
  await expect.poll(async () => Object.values((await stored(page)).adjustments).filter((a: any) => a.from_user).every((a: any) => a.undone)).toBe(true);
});

test('C3: Berücksichtigung eintragen, Plan passt die kommenden Wochen an, Coach erklärt es', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=beruecksichtigungen');
  await page.fill('#cons-new', 'Knie zwickt'); await page.locator('[data-act="cons-add"]').click();
  await expect(page.locator('[data-cons-list]')).toContainText('berücksichtigt');
  await page.fill('#cons-new', 'Mondphase beachten'); await page.locator('[data-act="cons-add"]').click();
  await expect(page.locator('[data-cons-list]')).toContainText('noch nicht berücksichtigt');
  await expect(page.locator('[data-replanned]')).toBeVisible({ timeout: 5000 });
  const msgs = Object.values((await stored(page)).coachMsgs) as any[];
  expect(msgs.some(m => /Plan angepasst/.test(m.title || ''))).toBe(true);
});

test.describe('mit Server', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'Server-Abläufe einmal reichen (Chromium)');

  test('A1/F4/F1: fremde Daten auf dem Gerät landen nicht im neuen Konto; Abmelden macht das Gerät frei; Meldung kommt beim Betreiber an', async ({ page, request }) => {
    await request.post('/__reset');
    // Betreiber richtet den Server ein und legt einen Test-Nutzer an
    const admin = await (await request.post('/api/setup', { data: { name: 'iPhone Betreiber' } })).json();
    const inv = await (await request.post('/api/admin/testusers', { headers: { Authorization: 'Bearer ' + admin.token }, data: { note: 'Test: Papa' } })).json();
    // Gerät mit Daten einer anderen Person (nie verbunden)
    await seed(page);
    await open(page, '/?go=daten');
    await page.locator('summary', { hasText: 'Einladung' }).click();
    await expect(page.locator('#keep-inv')).not.toBeChecked();
    await page.fill('#inv-code', inv.code); await page.fill('#inv-name', 'Papa');
    await page.locator('[data-act="sync-invite"]').click();
    await page.waitForLoadState('load');
    await expect(page.locator('.welcome')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.welcome')).not.toContainText('FUER-JONAH');
    expect(await page.evaluate(() => localStorage.getItem('ec_plan'))).toBeNull();
    const st = await stored(page);
    expect(Object.keys((st || {}).sessions || {}).length).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('ec_owner'))).toBe('2');
    // auf dem Server liegt für den neuen Nutzer nichts Fremdes
    const me = await auth(page);
    const recs = await (await request.post('/api/sync', { headers: { Authorization: 'Bearer ' + me.token }, data: { since: 0, changes: [] } })).json();
    expect(recs.records.filter((r: any) => ['plan', 'session', 'trend', 'illness', 'milestone'].includes(r.kind))).toEqual([]);
    // F1: Meldung schicken
    await page.locator('[data-act="go-sub"][data-sub="feedback"]').click();
    await page.fill('#fb-text', 'Test: Verbinden im Fragebogen');
    await page.locator('[data-act="fb-send"]').click();
    await expect(page.locator('[data-feedback-sent]')).toBeVisible();
    const fb = await (await request.get('/api/admin/feedback', { headers: { Authorization: 'Bearer ' + admin.token } })).json();
    expect(fb.feedback[0]).toMatchObject({ user: 'Papa', text: 'Test: Verbinden im Fragebogen' });
    expect(fb.feedback[0].screen).toContain('start');
    // Abmelden: Gerät frei für die nächste Person
    await page.locator('[data-act="back"]').click().catch(() => {});
    await open(page, '/?go=daten');
    const out = page.locator('[data-act="sign-out"]'); await out.click(); await out.click();
    await page.waitForLoadState('load');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ec_sync_auth'))).toBeNull();
    expect((await request.get('/api/me', { headers: { Authorization: 'Bearer ' + me.token } })).status()).toBe(401);
    // F4: Betreiber setzt den Test-Nutzer zurück
    const users = (await (await request.get('/api/admin/users', { headers: { Authorization: 'Bearer ' + admin.token } })).json()).users;
    expect(users.find((u: any) => u.id === 2)).toMatchObject({ test: true, name: 'Papa' });
  });

  test('A2/A3: „Verbinden“ im Fragebogen öffnet den Anbieter und kehrt mit allen Antworten an dieselbe Stelle zurück', async ({ page, request }) => {
    await request.post('/__reset');
    await seed(page, { noPlan: true });
    await open(page, '/?go=daten');
    await page.locator('summary', { hasText: 'Server zum ersten Mal einrichten' }).click();
    await page.locator('[data-act="sync-setup"]').click();
    await expect(page.locator('[data-sync-status]').first()).toBeVisible();
    await page.locator('[data-act="back"]').click();
    await page.locator('[data-act="ob-start"]').click();
    await fill(page, '#q-why', 'Gesund bleiben');
    await page.locator('[data-act="ob-jump"][data-i="7"]').click();
    await expect(page.locator('[data-connect-list]')).toBeVisible();
    // Garmin: geführter Weg über intervals.icu in 3 Schritten
    await page.locator('[data-act="conn-open"][data-id="garmin"]').click();
    await expect(page.locator('[data-guide] li')).toHaveCount(3);
    await expect(page.locator('#sheetPanel [data-act="conn-open"][data-id="intervals"]')).toBeVisible();
    await page.locator('#sheetPanel [data-act="sheet-close"]').click();
    // WHOOP ohne Server-Schlüssel: klare Erklärung und Alternative statt Knopf ohne Wirkung
    await page.locator('[data-act="conn-open"][data-id="whoop"]').click();
    await expect(page.locator('[data-not-configured]')).toContainText('noch nicht freigeschaltet');
    await expect(page.locator('#sheetPanel [data-act="conn-open"][data-id="shortcut"]')).toBeVisible();
    await page.locator('#sheetPanel [data-act="sheet-close"]').click();
    // Oura (Schlüssel im Test gesetzt): Start mit Rückkehr in den Fragebogen; der Anbieter wird simuliert
    await page.route('https://cloud.ouraring.com/**', r => r.fulfill({ status: 302, headers: { Location: 'http://localhost:4180/?go=mehr&open=onboarding&verbunden=oura' } }));
    const startReq = page.waitForRequest(r => r.url().includes('/api/connect/oura/start'));
    await page.locator('[data-act="conn-open"][data-id="oura"]').click();
    await page.locator('#sheetPanel [data-act="conn-start"]').click();
    expect(JSON.parse((await startReq).postData() || '{}').returnTo).toBe('onboarding');
    await page.waitForURL(/\/$|go=/);
    await expect(page.locator('.ob-block[data-block="devices"]')).toBeVisible({ timeout: 10000 });
    await expect.poll(async () => { try { return ((await stored(page)) || {}).onboarding?.answers?.why; } catch (e) { return null; } }).toBe('Gesund bleiben');
  });
});
void TODAY;

test('A1: alte, auf dem Gerät gespeicherte Standardwerte einer anderen Person werden durch eigene Schätzungen ersetzt', async ({ page }) => {
  await seed(page, { extra: d => { d.settings = { ...d.settings, lthrRun: 170, lthrBike: 165, thresholdPaceRunSec: 339, thresholdSpeedBikeKmh: 28, readiness: { rhrMax: 65, hrvMin: 35, tempMax: 0.5 } }; d.profile = { birthYear: 1976, sports: ['bike', 'run'], thresholds: { lthrRun: 170, lthrBike: 162, thresholdPaceRunSec: 339, thresholdSpeedBikeKmh: 28 } }; } });
  await open(page, '/?go=einstellungen');
  await expect(page.locator('[data-estimated]')).toBeVisible();
  const th = (await stored(page)).profile.thresholds;
  expect(th.lthrRun).not.toBe(170); expect(th.thresholdPaceRunSec).not.toBe(339); expect(th.thresholdSpeedBikeKmh).not.toBe(28);
  expect(th.lthrRun).toBe(Math.round((208 - 0.7 * 50) * 0.89));
  expect((await stored(page)).settings.readiness.hrvMin).toBeUndefined();
});
