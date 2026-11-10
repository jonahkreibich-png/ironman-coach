/* Auftrag 33 (beim Testen gefunden, Fehler bestand schon in 3.20.0): Zwei schnelle Änderungen am selben Datensatz – die zweite, während die
   erste noch zum Server unterwegs ist. Die zweite behielt den Ausgangsstand von VOR der ersten Änderung. Hatte die erste ein Feld neu
   angelegt (z. B. „Auch in der Schule ruhig“ an → Schulzeiten mit Standardwerten gespeichert) und die zweite änderte genau dieses Feld,
   sah der Server einen Konflikt, behielt seinen Wert und schickte ihn zurück: die eingetippte Uhrzeit war weg (in WebKit ~1 von 10 Läufen).
   Hier wird der Abgleich künstlich verzögert, damit es jedes Mal passiert. */
import { test, expect } from '@playwright/test';
import { seed, open, stored } from './helpers';
import { account, api, fakePush, connect } from './push-helpers';

test('zweite Eingabe während der erste Abgleich läuft: bleibt erhalten, auf dem Server und nach dem Neuladen', async ({ page, request }) => {
  const acc = await account(request);
  await seed(page);
  await fakePush(page, 'x');
  await connect(page, acc);
  await open(page, '/?go=mitteilungen');
  await page.waitForTimeout(2500);                                      // erster Abgleich nach dem Start ist durch
  // Abgleich mit der ersten Änderung abfangen und verzögern: die zweite Eingabe entsteht, während er unterwegs ist
  let inflight: () => void = () => {};
  const sent = new Promise<void>(r => { inflight = r; });
  await page.route('**/api/sync', async route => { const body = route.request().postData() || ''; if (body.includes('"schoolQuiet":true')) inflight(); await new Promise(r => setTimeout(r, 1500)); await route.continue(); });
  await page.locator('label:has(#np-school), [for="np-school"]').first().click();
  await sent;                                                            // erste Änderung ist jetzt zum Server unterwegs
  const start = page.locator('input[data-p="schoolStart"]');
  await start.fill('08:05'); await start.blur();
  await expect.poll(async () => (await stored(page)).settings?.notify?.schoolStart).toBe('08:05');
  // beide Abgleiche abwarten, dann noch einmal
  await page.waitForTimeout(3500);
  await page.unroute('**/api/sync');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(async () => (await stored(page)).settings?.notify?.schoolStart, { timeout: 8000 }).toBe('08:05');
  const server = await api(request, acc.token, 'post', '/api/sync', { since: 0, changes: [] });
  const rec = server.records.find((r: any) => r.kind === 'settings');
  expect(rec.data.settings.notify.schoolQuiet).toBe(true);
  expect(rec.data.settings.notify.schoolStart).toBe('08:05');
  await page.reload();
  await expect(page.locator('input[data-p="schoolStart"]')).toHaveValue('08:05');
  await expect(page.locator('#np-school')).toBeChecked();
});
