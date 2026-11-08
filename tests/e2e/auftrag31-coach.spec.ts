/* Auftrag 31, Teil 1: Coach-Tab ruckelte beim Öffnen.
   Ursache (Profil mit Kopie der echten Daten): bei jedem Zeichnen wurde alles neu berechnet und jede Nachricht neu geprüft
   (verifyCoachText baute für jede Nachricht den ganzen Plan neu auf). Mit Nutzer 1 ~500 ms bis zum ersten Bild, mit 1.000 Nachrichten über 3 s.
   Jetzt: Berechnungen bleiben beim Tab-Wechsel erhalten, Prüf-Grundlagen je Datenstand einmal, nur die letzten 30 Nachrichten werden gezeichnet,
   ältere beim Hochscrollen. Dieser Test hält das mit einem großen Verlauf (1.000 Nachrichten) fest. */
import { test, expect, type Page } from '@playwright/test';
import { seed, open, TODAY } from './helpers';

const N = 1000;
function bigHistory(d: any) {
  const base = Date.parse(`${TODAY}T07:00:00+02:00`);
  d.coachMsgs = d.coachMsgs || {};
  for (let i = 0; i < N; i++) {
    const at = base - (N - i) * 4 * 60000; const user = i % 2 === 0; const id = `msg-big-${String(i).padStart(4, '0')}`;
    d.coachMsgs[id] = user ? { id, at, date: TODAY, kind: 'user', from: 'user', text: `Frage ${i}: Wie gehe ich die Einheit morgen an?` }
      : { id, at, date: TODAY, kind: 'answer', from: 'coach', chat: true, intent: 'smalltalk', text: `Antwort ${i}: Locker anfangen, nach 20 Minuten entscheiden. Am Montag 13.10. war der Puls ruhig.` };
  }
}
/* Antippen eines Tabs bis zum nächsten Bild (Zeichnen + Layout), in ms */
const tapTab = (page: Page, tab: string) => page.evaluate(async t => {
  const t0 = performance.now();
  (document.querySelector(`#tabs [data-tab="${t}"]`) as HTMLElement).click();
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  return performance.now() - t0;
}, tab);
const drawn = (page: Page) => page.locator('#app .feed [data-msg]').count();

test('Coach mit 1.000 Nachrichten: schnell offen, nur die letzten 30 gezeichnet, ältere beim Hochscrollen', async ({ page }) => {
  await seed(page, { extra: bigHistory });
  await open(page);
  await page.waitForTimeout(1500);
  const first = await tapTab(page, 'coach');
  await expect(page.locator('#app .feed')).toBeVisible();
  expect(await drawn(page)).toBeLessThanOrEqual(30);
  expect(await drawn(page)).toBeGreaterThanOrEqual(25);
  await expect(page.locator('[data-feed-more]')).toBeVisible();
  // vorher über 3 s; großzügige Grenze für langsame Rechner
  expect(first, `erstes Öffnen ${Math.round(first)} ms`).toBeLessThan(800);
  // erneutes Öffnen ohne Datenänderung: nichts wird neu berechnet
  const again: number[] = [];
  for (let i = 0; i < 3; i++) { await tapTab(page, 'heute'); await page.waitForTimeout(300); again.push(await tapTab(page, 'coach')); await page.waitForTimeout(300); }
  again.sort((a, b) => a - b);
  expect(again[1], `erneutes Öffnen ${again.map(Math.round).join('/')} ms`).toBeLessThan(400);

  // „Ältere Nachrichten“: 30 mehr, die gerade sichtbare Nachricht bleibt an ihrer Stelle
  const ref = page.locator('#app .feed [data-msg]').first();
  const id = await ref.getAttribute('data-msg');
  await ref.scrollIntoViewIfNeeded();
  const y0 = await page.locator(`[data-msg="${id}"]`).evaluate(e => e.getBoundingClientRect().top);
  await page.locator('[data-feed-more]').click();
  expect(await drawn(page)).toBeGreaterThanOrEqual(55);
  const y1 = await page.locator(`[data-msg="${id}"]`).evaluate(e => e.getBoundingClientRect().top);
  expect(Math.abs(y1 - y0)).toBeLessThan(4);

  // Hochscrollen (wie mit dem Finger) lädt weitere nach
  const before = await drawn(page);
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.mouse.move(195, 400);
  await page.mouse.wheel(0, -600);
  await expect.poll(() => drawn(page)).toBeGreaterThan(before);

  // Tab verlassen und zurück: wieder nur die letzten 30, unten im Gespräch
  await tapTab(page, 'plan'); await tapTab(page, 'coach');
  expect(await drawn(page)).toBeLessThanOrEqual(30);
});

test('Tab-Wechsel: alle Tabs schnell bis zum ersten Bild (auch mit großem Verlauf)', async ({ page }) => {
  await seed(page, { extra: bigHistory });
  await open(page);
  await page.waitForTimeout(1500);
  const tabs = ['plan', 'coach', 'fortschritt', 'mehr', 'heute'];
  const res: Record<string, number[]> = Object.fromEntries(tabs.map(t => [t, []]));
  for (let r = 0; r < 3; r++) for (const t of tabs) { res[t].push(await tapTab(page, t)); await page.waitForTimeout(250); }
  for (const t of tabs) {
    const v = [...res[t]].sort((a, b) => a - b)[1];
    // Ziel unter 100 ms auf dem Gerät; hier großzügig, damit langsame Testrechner nicht stören
    expect(v, `${t}: ${res[t].map(Math.round).join('/')} ms`).toBeLessThan(400);
  }
});
