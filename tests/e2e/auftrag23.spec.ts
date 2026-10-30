/* Auftrag 23: Prognose für jedes Ziel (nach Datum, Platzhalter gekennzeichnet, weite Ziele als gerundeter Bereich), Wunschzeit je Disziplin
   ohne Plan-Änderung, Fortschritt einklappbar (Zustand gemerkt), Tab-Leiste mit Glas-Linse (Halten, Wischen, Loslassen öffnet, Antippen sofort,
   „Bewegung reduzieren“ ohne Animation, hell und dunkel ohne Überstand). Läuft in Chromium und WebKit. */
import { test, expect, type Page } from '@playwright/test';
import { seed, open, TODAY } from './helpers';

const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const HM = addDays(TODAY, 172), OLY = addDays(TODAY, 320);
const withGoals = (d: any) => {
  d.goals = {
    'g-im': { id: 'g-im', type: 'tri_long', name: 'Ironman', date: '2029-09-15', priority: 'A', outcome: 'finish' },
    'g-hm': { id: 'g-hm', type: 'run_half', name: 'Halbmarathon', date: HM, priority: 'B', outcome: 'time', targetTimeSec: 5400 },
    'g-oly': { id: 'g-oly', type: 'tri_olympic', name: 'Olympische Distanz', date: null, priority: 'B', outcome: 'finish' }
  };
  d.plan.meta.placeholders = [{ id: 'g-oly', name: 'Olympische Distanz', date: OLY }];
};

test('Prognose je Ziel: nach Datum, Platzhalter mit Hinweis, weites Ziel als gerundeter Bereich mit Sicherheit und „zuletzt aktualisiert“', async ({ page }) => {
  await seed(page, { extra: withGoals });
  await open(page, '/?go=fortschritt');
  const cards = page.locator('[data-prognoses] details[data-fold^="prog-"]');
  await expect(cards).toHaveCount(3);
  expect(await cards.evaluateAll(els => els.map(e => (e as HTMLElement).dataset.fold))).toEqual(['prog-g-hm', 'prog-g-oly', 'prog-g-im']);
  // Platzhalter
  const oly = page.locator('details[data-fold="prog-g-oly"]');
  await expect(oly.locator(':scope > summary')).toContainText('Platzhalter');
  await expect(oly.locator('[data-placeholder]')).toContainText('Platzhalter-Datum');
  // Ironman 2029: gerundeter Bereich, „wenn du den Plan durchziehst“, Sicherheit am Wettkampftag niedrig
  const im = page.locator('details[data-fold="prog-g-im"]');
  await expect(im.locator('[data-race]')).toHaveText(/^ca\. \d+(:\d\d)?–\d+(:\d\d)? h$/);
  await expect(im).toContainText('wenn du den Plan durchziehst');
  await expect(im.locator('[data-conf]')).toContainText('am Wettkampftag: niedrig');
  await expect(im.locator('[data-updated]')).toContainText('Zuletzt aktualisiert');
  // Warum? nennt die Entwicklung je Sportart
  await im.locator('summary', { hasText: 'Warum diese Prognose?' }).click();
  await expect(im.locator('[data-prog-why]')).toContainText('Entwicklung bis zum Rennen');
  await expect(im.locator('[data-prog-why] li').first()).toContainText(/Schwimmen|Rad|Laufen/);
  // Halbmarathon: Wunschzeit 1:30 je Disziplin und Einordnung; Laufziel zeigt andere Distanzen heute und am Renntag
  const hm = page.locator('details[data-fold="prog-g-hm"]');
  await expect(hm.locator('[data-wish] [data-verdict]')).toHaveText(/realistisch|ambitioniert|sehr unwahrscheinlich/);
  await expect(hm.locator('[data-wish-row="run"]')).toContainText('nötig, Prognose');
  await hm.locator('summary', { hasText: 'Andere Distanzen' }).click();
  await expect(hm.locator('.ptable.three').last()).toContainText('Marathon');
});

test('Fortschritt einklappbar: Zustand bleibt nach Neuladen, eingeklappt steht das Wichtigste in der Kopfzeile', async ({ page }) => {
  await seed(page, { extra: withGoals });
  await open(page, '/?go=fortschritt');
  const hm = page.locator('details[data-fold="prog-g-hm"]');
  await expect(hm).toHaveAttribute('open', '');
  await hm.locator(':scope > summary').click();
  await expect(hm).not.toHaveAttribute('open', '');
  await expect(hm.locator(':scope > summary [data-fold-sum]')).toHaveText(/^ca\. \d:\d\d–\d:\d\d$/);
  const trends = page.locator('details[data-fold="trends"]');
  await trends.locator(':scope > summary').click();
  await expect(trends).not.toHaveAttribute('open', '');
  await expect(trends.locator(':scope > summary [data-fold-sum]')).toBeVisible();
  await page.reload();
  await expect(page.locator('details[data-fold="prog-g-hm"]')).not.toHaveAttribute('open', '');
  await expect(page.locator('details[data-fold="trends"]')).not.toHaveAttribute('open', '');
  await expect(page.locator('details[data-fold="prog-g-im"]')).toHaveAttribute('open', '');
  // wieder aufklappen geht und wird ebenso gemerkt
  await page.locator('details[data-fold="trends"] > summary').click();
  await page.reload();
  await expect(page.locator('details[data-fold="trends"]')).toHaveAttribute('open', '');
});

test('Wunschzeit speichern ändert den Plan nicht', async ({ page }) => {
  await seed(page, { extra: withGoals });
  await open(page, '/?go=profil');
  const before = await page.evaluate(() => localStorage.getItem('ec_plan'));
  await page.locator('[data-act="goal-open"][data-id="g-hm"]').click();
  await page.locator('[data-k="targetTimeSec"]').first().fill('2');
  await page.locator('[data-k="targetTimeSec"]').first().dispatchEvent('change');
  await page.locator('[data-act="goal-save"]').click();
  await page.locator('[data-act="stage-apply"]').click();
  await expect(page.locator('[data-plan-same]')).toBeVisible();
  await page.locator('[data-act="stage-confirm"]').click();
  expect(await page.evaluate(() => localStorage.getItem('ec_plan'))).toBe(before);
});

/* ---------- Tab-Leiste ---------- */
async function tabCenter(page: Page, id: string) {
  const b = await page.locator(`#tabs .tab[data-tab="${id}"]`).boundingBox();
  return { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 };
}
const lensX = (page: Page) => page.evaluate(() => { const l = document.querySelector('.tab-lens') as HTMLElement | null; if (!l) return null; const r = l.getBoundingClientRect(); return r.left + r.width / 2; });

test('Linse: Halten zeigt sie, sie folgt dem Finger, Loslassen öffnet den Tab darunter; Antippen bleibt sofort', async ({ page }) => {
  await seed(page);
  await open(page, '/');
  const h = await tabCenter(page, 'heute'), c = await tabCenter(page, 'coach'), f = await tabCenter(page, 'fortschritt');
  // normales Antippen: sofort, ohne Linse
  await page.mouse.click(f.x, f.y);
  await expect(page.locator('[data-view="fortschritt"]')).toBeVisible();
  await expect(page.locator('.tab-lens.on')).toHaveCount(0);
  // Halten
  await page.mouse.move(h.x, h.y); await page.mouse.down();
  await page.waitForTimeout(350);
  await expect(page.locator('.tab-lens.on')).toHaveCount(1);
  await expect(page.locator('#tabs .tab.peek')).toHaveAttribute('data-tab', 'heute');
  // Wischen zum Coach: Linse folgt, Coach hervorgehoben
  for (let i = 1; i <= 10; i++) await page.mouse.move(h.x + (c.x - h.x) * i / 10, h.y);
  await expect(page.locator('#tabs .tab.peek')).toHaveAttribute('data-tab', 'coach');
  await expect.poll(async () => Math.abs((await lensX(page))! - c.x), { timeout: 2000 }).toBeLessThan(6);
  // Linse bleibt in der Leiste (verdeckt keine Inhalte)
  const lb = await page.locator('.tab-lens').boundingBox(); const bb = await page.locator('.tabbar').boundingBox();
  expect(lb!.y).toBeGreaterThanOrEqual(bb!.y - 6);
  await page.mouse.up();
  await expect(page.locator('[data-view="coach"]')).toBeVisible();
  await expect(page.locator('.tab-lens.on')).toHaveCount(0, { timeout: 3000 });
  // danach normales Antippen wieder sofort (kein verschluckter Klick)
  await page.mouse.click(f.x, f.y);
  await expect(page.locator('[data-view="fortschritt"]')).toBeVisible();
});

test('Linse: Wischen startet sie sofort; flüssig (Bildrate wie ohne Linse, Rechenzeit je Frame weit unter 16,7 ms)', async ({ page }) => {
  await seed(page);
  await open(page, '/');
  const h = await tabCenter(page, 'heute'), m = await tabCenter(page, 'mehr');
  // Bildrate ohne Linse als Vergleich (Browser ohne Bildschirm und Grafikkarte takten nicht immer mit 60 Hz)
  const startFr = () => page.evaluate(() => { (window as any).__fr = []; (window as any).__stop = false; let last = 0; const loop = (t: number) => { if (last) (window as any).__fr.push(t - last); last = t; if (!(window as any).__stop) requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
  const stopFr = async () => { await page.evaluate(() => { (window as any).__stop = true; }); const fr: number[] = await page.evaluate(() => (window as any).__fr); return fr.reduce((a, x) => a + x, 0) / Math.max(1, fr.length); };
  // gleiche Bewegung über dem Inhalt (ohne Linse), Fingertempo etwa 0,6 s über die Leiste
  await startFr(); await page.mouse.move(40, 300); await page.mouse.down();
  for (let i = 1; i <= 30; i++) { await page.mouse.move(40 + 300 * i / 30, 300); await page.waitForTimeout(20); }
  await page.mouse.up(); const base = await stopFr();
  const drag = async (to: { x: number }) => {
    await startFr();
    await page.mouse.move(h.x, h.y); await page.mouse.down();
    await page.mouse.move(h.x + 20, h.y);
    await expect(page.locator('.tab-lens.on')).toHaveCount(1);
    for (let i = 1; i <= 30; i++) { await page.mouse.move(h.x + (to.x - h.x) * i / 30, h.y); await page.waitForTimeout(20); }
    const avg = await stopFr(); await page.mouse.up(); return avg;
  };
  const cold = await drag(m);
  await expect(page.locator('[data-view="mehr"]')).toBeVisible();
  await expect(page.locator('.tab-lens.on')).toHaveCount(0, { timeout: 3000 });
  const warm = await drag(await tabCenter(page, 'plan'));
  await expect(page.locator('[data-view="plan"]')).toBeVisible();
  console.log('Linse', test.info().project.name, 'ohne', base.toFixed(1), 'erste Geste', cold.toFixed(1), 'danach', warm.toFixed(1), 'ms/Frame');
  // erste Geste nach dem Öffnen: Browser rastert die Ebene zum ersten Mal (in WebKit ohne Grafikkarte 22-33 ms), nur grob prüfen
  expect(cold).toBeLessThan(Math.max(18, base * 2.5));
  expect(warm).toBeLessThan(Math.max(17.5, base * 1.15));
  const perf = await page.evaluate(() => (window as any).__lensPerf);
  console.log('Linse Rechenzeit', (perf.total / perf.n).toFixed(2), 'ms im Mittel, max', perf.max.toFixed(2));
  expect(perf.n).toBeGreaterThan(20);
  expect(perf.total / perf.n).toBeLessThan(4);
  expect(perf.max).toBeLessThan(12);
});

test('Linse bei „Bewegung reduzieren“: keine Animation, springt direkt von Tab zu Tab', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page);
  await open(page, '/');
  const h = await tabCenter(page, 'heute'), p = await tabCenter(page, 'plan');
  await page.mouse.move(h.x, h.y); await page.mouse.down();
  await page.waitForTimeout(300);
  await expect(page.locator('.tab-lens.on')).toHaveCount(1);
  expect(Math.abs((await lensX(page))! - h.x)).toBeLessThan(2);
  await page.mouse.move(p.x - 5, h.y);
  await page.waitForTimeout(40);
  expect(Math.abs((await lensX(page))! - p.x)).toBeLessThan(2);
  expect(await page.locator('.tab-lens').evaluate(e => getComputedStyle(e).transitionDuration)).toMatch(/^0s/);
  await page.mouse.up();
  await expect(page.locator('[data-view="plan"]')).toBeVisible();
  await expect(page.locator('.tab-lens.on')).toHaveCount(0);
});

test('hell und dunkel: Prognosen und Linse ragen nicht heraus', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(th => localStorage.setItem('theme_pref', th as string), theme);
    await seed(page, { extra: withGoals });
    await open(page, '/?go=fortschritt');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, theme).toBeLessThanOrEqual(0);
    const bad = await page.evaluate(() => [...document.querySelectorAll('[data-prognoses] .card, .prow, [data-wish] .li')].filter(el => el.getBoundingClientRect().right > window.innerWidth + 1).length);
    expect(bad, theme).toBe(0);
    await page.screenshot({ path: `test-results/a23-fortschritt-${theme}-${test.info().project.name}.png`, fullPage: true });
    const h = await tabCenter(page, 'heute');
    await page.mouse.move(h.x, h.y); await page.mouse.down(); await page.waitForTimeout(400);
    await page.screenshot({ path: `test-results/a23-linse-${theme}-${test.info().project.name}.png`, clip: { x: 0, y: 844 - 120, width: 390, height: 120 } });
    await page.mouse.up();
  }
});
