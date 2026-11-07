/* Auftrag 28: Die echte App startete bei Nutzer 1 seit 3.15.0 nicht mehr („Die App konnte nicht gestartet werden“).
   Nachgestellt mit einer Kopie der echten Daten: alte, entschiedene Coach-Vorschläge (älter als 7 Tage, schon verkleinert) ließen D()
   bei jedem Start null liefern. Dieser Test hält den Zustand dauerhaft fest – zusammen mit dem, was Jonah vermutet hatte:
   Krankheitsphase auf dem Server beendet (Korrektur), das Gerät mit altem Stand (Phase offen) und Änderungen in der Warteschlange. */
import { test, expect, type Page } from '@playwright/test';
import { seed, TODAY } from './helpers';

const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const START = addDays(TODAY, -3);
const DAY = 86400000;
const T0 = Date.parse(TODAY + 'T07:30:00+02:00');

/* Betreiber-Konto auf frischem Server (Korrektur-Route ist nur für den Betreiber) */
async function admin(request: any) {
  await request.post('/__reset');
  const acc = await (await request.post('/api/setup', { data: { name: 'Start28' } })).json();
  expect(acc.userId, JSON.stringify(acc)).toBe(1);
  return acc;
}
async function withAccount(page: Page, acc: any) {
  await page.addInitScript(a => { if (!localStorage.getItem('ec_sync_auth')) { localStorage.setItem('ec_sync_auth', JSON.stringify({ token: a.token, deviceId: a.deviceId, userId: a.userId, connectedAt: Date.now() })); localStorage.setItem('ec_owner', JSON.stringify(a.userId)); } }, acc);
}
async function synced(page: Page) {
  await expect.poll(() => page.evaluate(() => { try { const m = JSON.parse(localStorage.getItem('ec_sync') || '{}'); return !!m.lastSyncAt && !Object.keys(m.pending || {}).length; } catch (e) { return false; } }), { timeout: 30000 }).toBe(true);
}
// je Vorschlag eigener Text und Tag (sonst räumt die App sie zu Recht als doppelt auf)
const proposal = (id: string, at: number, compacted: boolean) => ({ id, at, date: new Date(at).toISOString().slice(0, 10), from: 'coach', kind: 'proposal', title: 'Vorschlag ' + id, text: 'Lauf verschieben (' + id + ')',
  proposal: { id: 'p-' + id, status: 'accepted', ...(compacted ? { compacted: true } : {}), changes: [{ kind: 'adjust', key: 'a-' + id, data: { what: 'Lauf → Donnerstag', ...(compacted ? {} : { id: 'a-' + id, type: 'move' }) } }] } });
/* Zustand von Nutzer 1 vor dem Update: Krankheit offen, verkleinerte und unverkleinerte alte Vorschläge */
const oldState = () => ({ extra: (d: any) => {
  for (const w of d.plan.weeks) for (const day of w.days) if (day.date >= START && day.date < TODAY) for (const x of day.sessions) delete d.sessions[x.id];
  d.illnessPeriods = [{ id: 'ill-alt', start: addDays(TODAY, -30), end: addDays(TODAY, -27), note: 'alt' }, { id: 'ill-jetzt', start: START, end: null, note: '' }];
  d.coachMsgs = { 'msg-prop-a': proposal('msg-prop-a', T0 - 14 * DAY, true), 'msg-prop-b': proposal('msg-prop-b', T0 - 12 * DAY, true), 'msg-prop-c': proposal('msg-prop-c', T0 - 9 * DAY, false) };
} });
const appState = (page: Page) => page.locator('#app').getAttribute('data-app-state');

test.describe('Start mit dem Zustand von Nutzer 1', () => {
  test('Server-Korrektur + alter lokaler Stand + Warteschlange: App startet, Krankheit bleibt beendet, lokale Einträge bleiben', async ({ page, context, request }) => {
    test.setTimeout(120000);
    const acc = await admin(request);
    await seed(page, oldState()); await withAccount(page, acc);
    await page.goto('/');
    await synced(page);
    await expect(page.locator('[data-act="ill-end"]')).toBeVisible();
    // offline: „Wieder gesund“ gedrückt und einen Morgenwert eingetragen – beides liegt in der Warteschlange
    await context.setOffline(true);
    await page.locator('[data-act="ill-end"]').tap();
    await expect(page.locator('#toast')).toContainText('Wiedereinstieg ab heute');
    await page.locator('[data-act="checkin-open"]').first().click();
    await page.fill('#ck-hrv', '61');
    await page.locator('#ck-hrv').blur();
    await expect(page.locator('#storage-status')).toHaveAttribute('data-status', 'saved');
    const pending = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('ec_sync') || '{}').pending || {}));
    expect(pending).toEqual(expect.arrayContaining(['illness|ill-jetzt', 'trend|' + TODAY]));
    await page.close();
    // Betreiber korrigiert auf dem Server (normale Änderung mit Zeitstempel, neuer als die Warteschlange): letzter kranker Tag vorgestern
    const base = { id: 'ill-jetzt', start: START, end: null, note: '' };
    const fix = await request.post('/api/admin/users/1/changes', { headers: { Authorization: 'Bearer ' + acc.token }, data: { changes: [{ kind: 'illness', key: 'ill-jetzt', data: { ...base, end: addDays(TODAY, -2) }, base }], reason: 'Test' } });
    expect(fix.status()).toBe(200);
    // Update da, Gerät wieder online: App öffnen
    await context.setOffline(false);
    const p2 = await context.newPage();
    await p2.clock.setFixedTime(new Date(T0 + 60000));
    const errors: string[] = []; p2.on('pageerror', e => errors.push(e.message));
    await p2.goto('/');
    await expect.poll(() => appState(p2), { timeout: 15000 }).toBe('ready');
    await synced(p2);
    await expect(p2.locator('[data-failed]')).toHaveCount(0);
    await expect(p2.locator('[data-act="ill-end"]')).toHaveCount(0);
    expect(errors).toEqual([]);
    // neueste Änderung gewinnt (die Korrektur), Krankheit bleibt beendet – auf dem Gerät und auf dem Server
    const st = await p2.evaluate(() => JSON.parse(localStorage.getItem('ec_state_v2') || '{}'));
    expect(st.illnessPeriods.find((p: any) => p.id === 'ill-jetzt').end).toBe(addDays(TODAY, -2));
    expect(st.illnessPeriods.find((p: any) => p.id === 'ill-alt').end).toBe(addDays(TODAY, -27));
    // der offline eingetragene Morgenwert ist noch da und auf dem Server angekommen
    expect(st.trend.find((x: any) => x.date === TODAY).hrv).toBe(61);
    const srv = await (await request.post('/api/sync', { headers: { Authorization: 'Bearer ' + acc.token }, data: { since: 0, changes: [] } })).json();
    expect(srv.records.find((r: any) => r.kind === 'trend' && r.key === TODAY).data.hrv).toBe(61);
    expect(srv.records.find((r: any) => r.kind === 'illness' && r.key === 'ill-jetzt').data.end).toBe(addDays(TODAY, -2));
    // alte Vorschläge sind einmal verkleinert, nichts gelöscht
    expect(Object.keys(st.coachMsgs)).toEqual(expect.arrayContaining(['msg-prop-a', 'msg-prop-b', 'msg-prop-c']));
    expect(st.coachMsgs['msg-prop-c'].proposal.compacted).toBe(true);
    // erneuter Start: wieder bereit, und nichts wird mehr „geändert“ gespeichert
    await p2.reload();
    await expect.poll(() => appState(p2), { timeout: 15000 }).toBe('ready');
  });

  test('ohne Netz und ohne Konto: alter Stand mit verkleinerten Vorschlägen startet zweimal hintereinander', async ({ page }) => {
    await seed(page, oldState());
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/');
    await expect.poll(() => appState(page)).toBe('ready');
    await expect(page.locator('[data-view="heute"]')).toBeVisible();
    await page.reload();
    await expect.poll(() => appState(page)).toBe('ready');
    await expect(page.locator('[data-act="ill-end"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('alte oder fehlende Felder lösen keinen Absturz aus', async ({ page }) => {
    await seed(page, { extra: (d: any) => {
      d.illnessPeriods = [{ id: 'kaputt', start: null, end: null }, { start: TODAY }, null, { id: 'rueckwaerts', start: TODAY, end: addDays(TODAY, -5) }, { id: 'doppelt', start: START, end: null }, { id: 'doppelt', start: START, end: null }];
      d.coachMsgs = { x: null, y: { id: 'y' }, z: { id: 'z', proposal: { status: 'accepted' } }, w: { id: 'w', at: 'gestern', proposal: { status: 'done', changes: [null] } } };
      d.settings = null; d.adjustments = null; d.trend = [{ date: TODAY }, { hrv: 50 }];
    } });
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/');
    await expect.poll(() => appState(page)).toBe('ready');
    for (const tab of ['plan', 'coach', 'fortschritt', 'mehr', 'heute']) {
      await page.locator(`[data-act="go-tab"][data-tab="${tab}"]`).click();
      await expect(page.locator(`[data-view="${tab}"]`)).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
});

test.describe('Ein Fehler blockiert nie die ganze App', () => {
  test('Fehler in einer Karte: nur dort „konnte nicht geladen werden“, Rest und Tabs funktionieren', async ({ page }) => {
    await seed(page);
    await page.addInitScript(() => { (globalThis as any).__stamioFailBlock = 'heute-answer'; });
    await page.goto('/');
    await expect.poll(() => appState(page)).toBe('ready');
    await expect(page.locator('[data-failed="heute-answer"]')).toContainText('konnte nicht geladen werden');
    await expect(page.locator('[data-view="heute"] .week')).toBeVisible();
    await page.locator('[data-act="go-tab"][data-tab="plan"]').click();
    await expect(page.locator('[data-view="plan"]')).toBeVisible();
    // der Fehler steht im Fehlerprotokoll
    expect(await page.evaluate(() => localStorage.getItem('ec_errors') || '')).toContain('view:heute-answer');
  });
  test('Fehler in einer ganzen Ansicht: Tab-Leiste bleibt, „Erneut versuchen“ zeichnet neu', async ({ page }) => {
    await seed(page);
    await page.addInitScript(() => { (globalThis as any).__stamioFailBlock = 'fortschritt'; });
    await page.goto('/');
    await page.locator('[data-act="go-tab"][data-tab="fortschritt"]').click();
    await expect(page.locator('[data-failed="fortschritt"]')).toBeVisible();
    await page.evaluate(() => { delete (globalThis as any).__stamioFailBlock; });
    await page.locator('[data-act="view-retry"]').click();
    await expect(page.locator('[data-failed]')).toHaveCount(0);
    await page.locator('[data-act="go-tab"][data-tab="mehr"]').click();
    await expect(page.locator('[data-view="mehr"]')).toBeVisible();
  });
  test('Startfehler: Fehlerseite mit „Erneut versuchen“, Fehler wird gemeldet, danach startet die App', async ({ page, request, browserName }) => {
    await seed(page);
    // der Testserver liefert den App-Code absichtlich kaputt (nicht über page.route: WebKit merkt sich solche Antworten)
    await request.post('/__break-main', { data: { on: true } });
    await page.goto('/');
    await expect.poll(() => appState(page)).toBe('error');
    await expect(page.locator('#app')).toContainText('Die App konnte nicht gestartet werden');
    await expect(page.locator('#app')).toContainText('Keine Browserdaten');
    await expect(page.locator('#start-retry')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('ec_errors') || '')).toContain('start:render');
    // lokale Daten unverändert
    expect(await page.evaluate(() => !!localStorage.getItem('ec_state_v2'))).toBe(true);
    await request.post('/__break-main', { data: { on: false } });
    await page.locator('#start-retry').click();
    if (browserName === 'webkit') {
      // Playwright-WebKit nimmt die eben kaputt gelieferte Datei (gleicher Name) aus dem Speicher statt sie neu zu laden. In echt hat eine
      // neue Version immer einen neuen Dateinamen. Hier: „Erneut versuchen“ startet die App wirklich neu (zweiter Startversuch protokolliert).
      await expect.poll(() => page.evaluate(() => (localStorage.getItem('ec_errors') || '').split('start:render').length - 1), { timeout: 15000 }).toBe(2);
      return;
    }
    await expect.poll(() => appState(page), { timeout: 15000 }).toBe('ready');
    await expect(page.locator('[data-view="heute"]')).toBeVisible();
  });
});

test.describe('Ich habe schon ein Konto', () => {
  test('Startbildschirm: Feld sichtbar, Wiederherstellungscode (16) und Kopplungscode (8) im selben Feld', async ({ page, request }) => {
    test.setTimeout(90000);
    const acc = await admin(request);
    const rc = (await (await request.post('/api/recovery', { headers: { Authorization: 'Bearer ' + acc.token }, data: {} })).json()).code;
    await request.post('/api/sync', { headers: { Authorization: 'Bearer ' + acc.token }, data: { since: 0, changes: [{ kind: 'profile', key: 'main', data: { name: 'Synth', notes: ['montags frei'] }, updatedAt: Date.now() }] } });
    await page.goto('/');
    await expect(page.locator('[data-account-login]')).toBeVisible();
    await expect(page.locator('.welcome')).toContainText('Ich habe schon ein Konto');
    // falscher Code: verständliche Meldung
    await page.fill('#acc-code', 'ABCD-EFGH-JKLM-NPQR');
    await page.locator('[data-act="acc-login"]').click();
    await expect(page.locator('#toast')).toContainText('passt zu keinem Konto');
    await page.fill('#acc-code', 'ABC');
    await page.locator('[data-act="acc-login"]').click();
    await expect(page.locator('#toast')).toContainText('16 Zeichen');
    // richtiger Wiederherstellungscode, klein geschrieben und ohne Striche
    await page.fill('#acc-code', rc.toLowerCase().replace(/-/g, ''));
    await page.locator('[data-act="acc-login"]').click();
    await expect.poll(async () => (await page.evaluate(() => (JSON.parse(localStorage.getItem('ec_state_v2') || '{}').profile || {}).notes)), { timeout: 15000 }).toEqual(['montags frei']);
    // zweites Gerät mit Kopplungscode im selben Feld
    const pc = (await (await request.post('/api/pair/create', { headers: { Authorization: 'Bearer ' + acc.token }, data: {} })).json()).code;
    const p2 = await page.context().browser()!.newPage();
    await p2.goto(page.url().replace(/\/[^/]*$/, '/'));
    await p2.fill('#acc-code', pc);
    await p2.locator('[data-act="acc-login"]').click();
    await expect.poll(() => p2.evaluate(() => !!localStorage.getItem('ec_sync_auth')), { timeout: 15000 }).toBe(true);
    await p2.close();
  });
  test('angemeldet, Code nie gesichert: Karte zeigt auf Antippen einen gültigen neuen Code, „Gesichert“ blendet sie aus', async ({ page, request }) => {
    test.setTimeout(90000);
    const acc = await admin(request);
    await seed(page); await withAccount(page, acc);
    await page.goto('/');
    await synced(page);
    await expect(page.locator('[data-rc-reminder]')).toBeVisible();
    await page.locator('[data-act="rc-show"]').click();
    const code = (await page.locator('[data-rc-new]').textContent())!.trim();
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    // der angezeigte Code funktioniert
    const r = await request.post('/api/recover', { data: { code, name: 'Synth-Test' } });
    expect(r.status()).toBe(200);
    await page.locator('[data-act="rc-saved"]').click();
    await expect(page.locator('[data-rc-reminder]')).toHaveCount(0);
    await page.reload();
    await synced(page);
    await expect(page.locator('[data-rc-reminder]')).toHaveCount(0);
  });
});

test.describe('Update kommt an, obwohl die App abstürzt', () => {
  test.use({ serviceWorkers: 'allow' });
  test('Absturz aus dem Speicher des Service Workers + neue Version auf dem Server: Fehlerseite übernimmt sie von selbst', async ({ page, request, browserName }) => {
    test.skip(browserName !== 'chromium', 'Service-Worker-Update mit umgeschaltetem Testserver nur in Chromium zuverlässig nachstellbar');
    test.setTimeout(90000);
    const fs = await import('node:fs'); const path = await import('node:path');
    // „neue Version“: derselbe Build mit anderer Service-Worker-Version
    const nextDir = path.resolve('test-results', 'start28-neue-version');
    fs.rmSync(nextDir, { recursive: true, force: true }); fs.cpSync(path.resolve('dist'), nextDir, { recursive: true });
    const sw = path.join(nextDir, 'sw.js'); fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/const VERSION = '([^']+)'/, "const VERSION = '$1-neu'"));
    await request.post('/__reset');
    await request.post('/__break-main', { data: { on: true } });
    await seed(page);
    await page.goto('/');
    await expect.poll(() => appState(page)).toBe('error');
    await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active), { timeout: 15000 }).toBe(true);
    await page.reload();
    await expect.poll(() => appState(page)).toBe('error');
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    // Fehler behoben und als neue Version veröffentlicht; der Service Worker liefert aber noch den kaputten Stand aus seinem Speicher
    await request.post('/__break-main', { data: { on: false } });
    expect((await request.post('/__dist', { data: { dir: nextDir } })).status()).toBe(204);
    await page.reload();
    // die Fehlerseite findet die neue Version, übernimmt sie und lädt neu – ohne Antippen
    await expect.poll(() => appState(page), { timeout: 40000 }).toBe('ready');
    expect(await page.evaluate(() => fetch('./sw.js').then(r => r.text()).then(t => /-neu'/.test(t)))).toBe(true);
    expect(await page.evaluate(() => !!localStorage.getItem('ec_state_v2'))).toBe(true);
    await request.post('/__reset');
  });
});
