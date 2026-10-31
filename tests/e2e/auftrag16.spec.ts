/* Auftrag 16: kostenlose KI-Antworten im Coach (nachgebautes Workers-AI-Modell im Test-Server).
   Einmal kurz fragen (ohne Konto legt die App eins an), Antwort als Strom mit Kennzeichnung, Zähler „KI-Fragen heute“,
   „Nein, ohne KI“ → Regel-Coach, unter 16 nur mit Eltern, Planänderung nur als Vorschlag, Rückfall bei Fehler, Verbrauch für den Betreiber.
   Außerdem Punkt 1: ein lockerer langer Lauf mit automatischen Runden wird in der Bewertung nicht als Intervall bezeichnet. */
import { test, expect, type Page } from '@playwright/test';
import { seed, TODAY } from './helpers';

const send = async (page: Page, text: string) => { await page.fill('#coach-in', text); await page.locator('[data-act="coach-send"]').click(); };
async function prepare(page: Page, request: any, o: { mode?: string; birthYear?: number } = {}) {
  await request.post('/__reset');
  await request.post('/api/setup', { data: { name: 'iPhone Betreiber' } }); // Betreiber = Nutzer 1
  await request.post('/__fake-ai', { data: { on: true, mode: o.mode } });
  await seed(page, { extra: d => { d.profile = { ...(d.profile || {}), name: 'Mama', ...(o.birthYear ? { birthYear: o.birthYear } : {}) }; } });
}
test.describe('Kostenlose KI im Coach', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'Server-Abläufe einmal reichen (Chromium)');
  test.afterEach(async ({ request }) => { await request.post('/__fake-ai', { data: { on: false } }); });

  test('ohne Konto: einmal fragen → Konto, KI antwortet als Strom mit Kennzeichnung, Zähler', async ({ page, request }) => {
    test.setTimeout(60000);
    await prepare(page, request);
    await page.goto('/?go=coach');
    const card = page.locator('[data-free-consent]');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Werte von Oura bekommt die KI nie');
    await expect(card).toContainText('privates Konto');
    await card.locator('[data-act="free-yes"]').click();
    await expect(card).toHaveCount(0, { timeout: 10000 });
    expect(await page.evaluate(() => !!localStorage.getItem('ec_sync_auth'))).toBe(true);
    await expect(page.locator('#app')).toContainText('KI antwortet (kostenlos)', { timeout: 10000 });
    await send(page, 'Warum ist Schlaf wichtig?');
    const ans = page.locator('.feed .msg.coach').last();
    await expect(ans).toContainText('Schlaf ist die wichtigste Erholung', { timeout: 10000 });
    await expect(page.locator('[data-by-ai]').last()).toHaveText('KI-Antwort');
    await expect(page.locator('[data-free-count]')).toContainText('KI-Fragen heute: 1 von 30', { timeout: 10000 });
    // nach dem Neuladen nicht noch einmal fragen
    await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
    await expect(page.locator('[data-free-consent]')).toHaveCount(0);
  });

  test('„Nein, ohne KI“: Regel-Coach antwortet, Einschalten später in den Einstellungen', async ({ page, request }) => {
    await prepare(page, request);
    await page.goto('/?go=coach');
    await page.locator('[data-free-consent] [data-act="free-no"]').click();
    await expect(page.locator('[data-free-consent]')).toHaveCount(0);
    await send(page, 'Was steht morgen an?');
    await expect(page.locator('.feed .msg.coach').last()).not.toHaveClass(/typing/, { timeout: 10000 });
    await expect(page.locator('[data-by-ai]')).toHaveCount(0);
    expect(await page.evaluate(() => !!localStorage.getItem('ec_sync_auth'))).toBe(false);
    await page.goto('/?go=coachset');
    await expect(page.locator('[data-act="free-open"]')).toBeVisible();
  });

  test('unter 16: nur mit Zustimmung eines Elternteils', async ({ page, request }) => {
    await prepare(page, request, { birthYear: +TODAY.slice(0, 4) - 14 });
    await page.goto('/?go=coach');
    const card = page.locator('[data-free-consent]');
    await card.locator('[data-act="free-yes"]').click();
    await expect(page.locator('#toast')).toContainText('Elternteil');
    await expect(card).toBeVisible();
    // mittig scrollen: oben läge das Häkchen unter der festen Kopfzeile
    await card.locator('#free-parent').evaluate(el => el.scrollIntoView({ block: 'center' }));
    await card.locator('#free-parent').check({ force: true });
    await card.locator('[data-act="free-yes"]').click();
    await expect(card).toHaveCount(0, { timeout: 10000 });
  });

  test('Planänderung der KI nur als Vorschlag; Übernehmen wendet an', async ({ page, request }) => {
    test.setTimeout(60000);
    await prepare(page, request);
    await page.goto('/?go=coach');
    await page.locator('[data-free-consent] [data-act="free-yes"]').click();
    await expect(page.locator('#app')).toContainText('KI antwortet (kostenlos)', { timeout: 10000 });
    await send(page, 'Ich habe morgen keine Zeit, streich das Training');
    const prop = page.locator('.feed .msg.proposal').last();
    await expect(prop).toBeVisible({ timeout: 10000 });
    await expect(prop.locator('[data-act="prop"][data-ok="1"]')).toBeVisible();
    await prop.locator('[data-act="prop"][data-ok="1"]').click();
    await expect(page.locator('#toast')).toContainText('Bestätigt', { timeout: 10000 });
  });

  test('KI gerade nicht verfügbar (Kontingent leer): Regel-Coach antwortet mit Hinweis', async ({ page, request }) => {
    await prepare(page, request, { mode: 'error' });
    await page.goto('/?go=coach');
    await page.locator('[data-free-consent] [data-act="free-yes"]').click();
    await expect(page.locator('#app')).toContainText('KI antwortet (kostenlos)', { timeout: 10000 });
    await send(page, 'Was steht morgen an?');
    await expect(page.locator('#toast')).toContainText('Regel-Coach antwortet', { timeout: 10000 });
    await expect(page.locator('.feed .msg.coach', { hasText: /^Morgen/ }).last()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-by-ai]')).toHaveCount(0);
  });

  test('Betreiber sieht den Verbrauch unter Betreiber', async ({ page, request }) => {
    await request.post('/__reset');
    const admin = await (await request.post('/api/setup', { data: { name: 'iPhone Betreiber' } })).json();
    await request.post('/__fake-ai', { data: { on: true } });
    await seed(page);
    await page.goto('/?go=coach');
    await page.evaluate(a => { localStorage.setItem('ec_sync_auth', JSON.stringify({ token: a.token, deviceId: a.deviceId, connectedAt: Date.now() })); localStorage.setItem('ec_owner', '1'); }, admin);
    await page.goto('/?go=betreiber');
    await expect(page.locator('[data-wai]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-wai]')).toContainText('10000');
  });
});

test('Punkt 1: lockerer langer Lauf mit automatischen Runden – Bewertung ohne „Intervall“', async ({ page }) => {
  await seed(page, { extra: d => {
    const day = d.plan.weeks.flatMap((w: any) => w.days).find((x: any) => x.date === TODAY);
    const s = { id: 'lr-test', sport: 'run', title: 'Langer Lauf 55 min', plannedMinutes: 55, zone: 'Zone 2', long: true };
    day.sessions = [s];
    const laps = Array.from({ length: 8 }, (_, i) => ({ n: i + 1, sec: 410 + (i % 3) * 4, m: 1000, avgHr: 145 + Math.floor(i / 2), maxHr: 152, speed: 2.44, power: 185, kind: 'steady' }));
    d.activities = { ...(d.activities || {}), 'act-lr': { id: 'act-lr', source: 'healthfit', sources: ['healthfit'], sport: 'run', date: TODAY, startMs: Date.parse(TODAY + 'T06:00:00Z'), min: 56, km: 8, avgHr: 148, paceSecKm: 416, laps, intervals: null, sessionId: 'lr-test' } };
    d.sessions = { ...(d.sessions || {}), 'lr-test': { completed: true, activityId: 'act-lr', rpe: '4' } };
  } });
  await page.goto('/?go=coach');
  await send(page, 'Wie war mein Training heute?');
  const msg = page.locator('.feed .msg.coach').last();
  await expect(msg).toContainText('Nächste Tage', { timeout: 10000 });
  const txt = await msg.innerText();
  expect(txt).not.toMatch(/Intervall(?!e\))|prüf die Runden|nur Zone/);
  expect(txt).toMatch(/Gleichmäßig gelaufen/);
});
