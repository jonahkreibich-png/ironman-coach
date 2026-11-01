/* Auftrag 27: „Ich bin wieder gesund“ (und „Ich bin krank“, Schmerzen/verletzt und deren Ende) im echten Ablauf:
   Knopf antippen → Phase beenden → speichern → Sync zum Server → Einheiten ab heute nicht mehr krank → Wiedereinstieg → Rückgängig.
   Ursache des Fehlers (1.11., echte Daten: Phase vom 30.10. blieb auf dem Server offen): Jeder Hintergrund-Abgleich liest den Zustand
   frisch ein und ersetzt alle Objekte; der Zwischenspeicher der abgeleiteten Daten zeigte weiter auf die alte Phase. Der Knopf setzte
   das Ende an dieser veralteten Kopie, gespeichert wurde der echte Zustand ohne Ende. */
import { test, expect, type Page } from '@playwright/test';
import { seed, TODAY, YESTERDAY } from './helpers';

const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const START = addDays(TODAY, -3);

async function account(request: any) {
  let acc = await (await request.post('/api/setup', { data: { name: 'Gesund' } })).json();
  if (!acc.token) acc = await (await request.post('/api/setup', { data: { signup: true, name: 'Gesund', userName: 'SYNTHETIC' } })).json();
  expect(acc.token, JSON.stringify(acc)).toBeTruthy();
  return acc;
}
async function withAccount(page: Page, acc: any) {
  await page.addInitScript(a => { if (!localStorage.getItem('ec_sync_auth')) { localStorage.setItem('ec_sync_auth', JSON.stringify({ token: a.token, deviceId: a.deviceId, userId: a.userId, connectedAt: Date.now() })); localStorage.setItem('ec_owner', JSON.stringify(a.userId)); } }, acc);
}
const sickSeed = (extra?: (d: any) => void) => ({ extra: (d: any) => {
  // während der Krankheit nichts erledigt (erledigt geht vor krank)
  for (const w of d.plan.weeks) for (const day of w.days) if (day.date >= START && day.date < TODAY) for (const x of day.sessions) delete d.sessions[x.id];
  d.illnessPeriods = [{ id: 'ill-alt', start: addDays(TODAY, -30), end: addDays(TODAY, -27), note: 'alt' }, { id: 'ill-jetzt', start: START, end: null, note: '' }]; extra?.(d); } });
async function synced(page: Page) {
  await expect.poll(() => page.evaluate(() => { try { const m = JSON.parse(localStorage.getItem('ec_sync') || '{}'); return !!m.lastSyncAt && !Object.keys(m.pending || {}).length; } catch (e) { return false; } }), { timeout: 30000 }).toBe(true);
}
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('ec_state_v2') || '{}'));
async function serverIllness(request: any, acc: any) {
  const r = await (await request.post('/api/sync', { headers: { Authorization: 'Bearer ' + acc.token }, data: { since: 0, changes: [] } })).json();
  return (r.records || []).filter((x: any) => x.kind === 'illness' && !x.deleted).map((x: any) => x.data);
}
const healthyBtn = (page: Page) => page.locator('[data-act="ill-end"]');

test.describe('Wieder gesund', () => {
  test('nach einem Hintergrund-Abgleich: Tippen beendet die Phase, Einheiten ab heute nicht mehr krank, Server hat das Ende', async ({ page, request }) => {
    test.setTimeout(90000);
    const acc = await account(request);
    await seed(page, sickSeed()); await withAccount(page, acc);
    await page.goto('/');
    await synced(page);
    // weiterer Abgleich wie beim Wechsel zurück in die App (liest den Zustand frisch ein)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await synced(page);
    await expect(healthyBtn(page)).toBeVisible();
    await healthyBtn(page).tap();
    await expect(page.locator('#toast')).toContainText('Wiedereinstieg ab heute');
    await expect(healthyBtn(page)).toHaveCount(0);
    await expect(page.locator('[data-view="heute"]')).toContainText('Wiedereinstieg, Tag 1');
    // Einheiten heute wieder abhakbar (nicht mehr „krank“)
    await expect(page.locator('[data-view="heute"] .check').first()).toBeVisible();
    await expect(page.locator('#storage-status')).toHaveAttribute('data-status', 'saved');
    const st = await stored(page);
    expect(st.illnessPeriods.find((p: any) => p.id === 'ill-jetzt').end).toBe(YESTERDAY);
    expect(st.illnessPeriods.find((p: any) => p.id === 'ill-alt').end).toBe(addDays(TODAY, -27));
    await expect.poll(async () => (await serverIllness(request, acc)).find((p: any) => p.id === 'ill-jetzt')?.end, { timeout: 20000 }).toBe(YESTERDAY);
  });
});

test.describe('Krank, gesund, Rückgängig', () => {
  test('am selben Tag krank und wieder gesund: Phase verschwindet (Versehen), kein Wiedereinstieg', async ({ page }) => {
    await seed(page, { extra: d => { d.illnessPeriods = []; } });
    await page.goto('/');
    await page.locator('[data-act="ill-start"]').tap();
    await expect(page.locator('#toast')).toContainText('Gute Besserung');
    await expect(healthyBtn(page)).toBeVisible();
    await healthyBtn(page).tap();
    await expect(healthyBtn(page)).toHaveCount(0);
    await expect(page.locator('[data-view="heute"]')).not.toContainText('Wiedereinstieg');
    await expect(page.locator('#storage-status')).toHaveAttribute('data-status', 'saved');
    expect((await stored(page)).illnessPeriods).toEqual([]);
  });

  test('zwei offene Phasen und alte Phasen: alle laufenden enden, vergangene Tage bleiben krank, Rückgängig stellt alles her', async ({ page }) => {
    await seed(page, sickSeed(d => { d.illnessPeriods.push({ id: 'ill-doppelt', start: addDays(TODAY, -2), end: null, note: '' }); }));
    await page.goto('/');
    await healthyBtn(page).tap();
    await expect(healthyBtn(page)).toHaveCount(0);
    await expect(page.locator('#storage-status')).toHaveAttribute('data-status', 'saved');
    let st = await stored(page);
    expect(st.illnessPeriods.map((p: any) => [p.id, p.end])).toEqual([['ill-alt', addDays(TODAY, -27)], ['ill-jetzt', YESTERDAY], ['ill-doppelt', YESTERDAY]]);
    await expect(page.locator(`.wd[data-date="${YESTERDAY}"]`)).toHaveClass(/sick/);
    await expect(page.locator(`.wd[data-date="${TODAY}"]`)).not.toHaveClass(/sick/);
    await page.locator('#tabs [data-act="go-tab"][data-tab="coach"]').tap();
    await page.locator('[data-act="chat-undo"]').last().tap();
    await expect(page.locator('#storage-status')).toHaveAttribute('data-status', 'saved');
    st = await stored(page);
    expect(st.illnessPeriods.filter((p: any) => !p.end).map((p: any) => p.id).sort()).toEqual(['ill-doppelt', 'ill-jetzt']);
  });

  test('Rückgängig direkt in der Bestätigung', async ({ page }) => {
    await seed(page, sickSeed());
    await page.goto('/');
    await healthyBtn(page).tap();
    await page.locator('#toast .toast-act').tap();
    await expect(healthyBtn(page)).toBeVisible();
    await expect(page.locator('#storage-status')).toHaveAttribute('data-status', 'saved');
    expect((await stored(page)).illnessPeriods.find((p: any) => p.id === 'ill-jetzt').end).toBeNull();
  });

  test('Doch noch krank im Wiedereinstieg öffnet die Phase wieder', async ({ page }) => {
    await seed(page, { extra: d => { d.illnessPeriods = [{ id: 'ill-x', start: addDays(TODAY, -5), end: addDays(TODAY, -2), note: '' }]; } });
    await page.goto('/');
    await expect(page.locator('[data-view="heute"]')).toContainText('Wiedereinstieg');
    await page.locator('[data-act="ill-reopen"]').tap();
    await expect(healthyBtn(page)).toBeVisible();
    await expect(page.locator('#storage-status')).toHaveAttribute('data-status', 'saved');
    expect((await stored(page)).illnessPeriods[0].end).toBeNull();
  });
});

test.describe('Sync zwischen Geräten', () => {
  test('zwei Geräte: Ende auf dem iPhone erscheint auf dem PC, der PC überschreibt es nicht', async ({ page, browser, request }) => {
    test.setTimeout(120000);
    const acc = await account(request);
    await seed(page, sickSeed()); await withAccount(page, acc);
    await page.goto('/'); await synced(page);
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-DE', timezoneId: 'Europe/Berlin', serviceWorkers: 'block' });
    const pc = await ctx2.newPage();
    await pc.clock.setFixedTime(new Date(`${TODAY}T07:30:00+02:00`));
    const planRaw = await page.evaluate(() => localStorage.getItem('ec_plan'));
    await pc.addInitScript(([a, p]: any) => { if (sessionStorage.getItem('__s')) return; sessionStorage.setItem('__s', '1'); localStorage.clear(); localStorage.setItem('ec_ui', JSON.stringify({ seenRelease: '9.9.9' })); localStorage.setItem('ec_plan', p); localStorage.setItem('ec_sync_auth', JSON.stringify({ token: a.token, deviceId: a.deviceId, userId: a.userId, connectedAt: Date.now() })); localStorage.setItem('ec_owner', JSON.stringify(a.userId)); }, [acc, planRaw]);
    await pc.goto('/'); await synced(pc);
    await pc.reload();
    await expect(pc.locator('[data-act="ill-end"]')).toBeVisible({ timeout: 15000 });
    await healthyBtn(page).tap();
    await expect.poll(async () => (await serverIllness(request, acc)).find((p: any) => p.id === 'ill-jetzt')?.end, { timeout: 20000 }).toBe(YESTERDAY);
    await pc.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(pc.locator('[data-act="ill-end"]')).toHaveCount(0, { timeout: 15000 });
    await expect(pc.locator('[data-view="heute"]')).toContainText('Wiedereinstieg, Tag 1');
    await pc.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await synced(pc);
    expect((await serverIllness(request, acc)).find((p: any) => p.id === 'ill-jetzt').end).toBe(YESTERDAY);
    await ctx2.close();
  });

  test('offline gedrückt, später synchronisiert: Server bekommt das Ende', async ({ page, request }) => {
    test.setTimeout(90000);
    const acc = await account(request);
    await seed(page, sickSeed()); await withAccount(page, acc);
    await page.goto('/'); await synced(page);
    await page.route('**/api/sync', r => r.abort('internetdisconnected'));
    await healthyBtn(page).tap();
    await expect(healthyBtn(page)).toHaveCount(0);
    await page.waitForTimeout(2500);
    expect((await serverIllness(request, acc)).find((p: any) => p.id === 'ill-jetzt').end).toBeNull();
    await page.reload(); await expect(page.locator('[data-view="heute"]')).toBeVisible();
    await expect(healthyBtn(page)).toHaveCount(0);
    await page.unroute('**/api/sync');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(async () => (await serverIllness(request, acc)).find((p: any) => p.id === 'ill-jetzt')?.end, { timeout: 20000 }).toBe(YESTERDAY);
  });
});

test.describe('Verletzung', () => {
  const since = addDays(TODAY, -2).split('-').reverse().join('.');
  const injured = () => ({ extra: (d: any) => {
    d.illnessPeriods = [];
    d.profile = { ...(d.profile || {}), rules: [{ id: 'r-knie', kind: 'body', body: 'knee', noIntervals: true, source: 'chat', text: `Knie: Beschwerden seit ${since}` }], notes: [`Knie: Beschwerden seit ${since}`] };
    const tp = d.trend.find((x: any) => x.date === addDays(TODAY, -2)); tp.illness = 'Knie 5/10';
  } });
  test('Wieder schmerzfrei auf Heute hebt Beschwerden auf, Rückgängig stellt sie her', async ({ page }) => {
    await seed(page, injured());
    await page.goto('/');
    const card = page.locator('[data-injury]');
    await expect(card).toContainText('Knie');
    await card.locator('[data-act="inj-end"]').tap();
    await expect(page.locator('#toast')).toContainText('Beschwerden vorbei');
    await expect(page.locator('[data-injury]')).toHaveCount(0);
    await expect(page.locator('#storage-status')).toHaveAttribute('data-status', 'saved');
    let st = await stored(page);
    expect(st.settings.painClearedOn).toBe(TODAY);
    expect(st.profile.rules.map((r: any) => r.id)).toEqual([]);
    await page.locator('#toast .toast-act').tap();
    await expect(page.locator('[data-injury]')).toBeVisible();
    await expect(page.locator('#storage-status')).toHaveAttribute('data-status', 'saved');
    st = await stored(page);
    expect(st.settings.painClearedOn).toBeUndefined();
    expect(st.profile.rules.map((r: any) => r.id)).toEqual(['r-knie']);
  });
  test('Coach: Ich bin wieder schmerzfrei schlägt das Beenden vor, ja übernimmt', async ({ page }) => {
    await seed(page, injured());
    await page.goto('/?go=coach');
    await page.locator('#coach-in').fill('Ich bin wieder schmerzfrei');
    await page.locator('[data-act="coach-send"]').tap();
    await expect(page.locator('.feed .msg.coach').last()).toContainText('Beschwerden (Knie) beenden');
    await page.locator('#coach-in').fill('ja');
    await page.locator('[data-act="coach-send"]').tap();
    await expect(page.locator('.feed .msg.coach').last()).toContainText('Beschwerden vorbei');
    await page.locator('#tabs [data-act="go-tab"][data-tab="heute"]').tap();
    await expect(page.locator('[data-injury]')).toHaveCount(0);
  });
});
