/* Aufnahme der Tab-Leiste für docs/ (nur auf Wunsch: RECORD=1, optional BASE=<Adresse einer anderen Fassung> und NAME=<Dateiname>).
   Zeigt beide Abläufe: Antippen eines anderen Tabs und Halten + Ziehen über alle Tabs und zurück. SLOW=4 spielt die Feder in Zeitlupe. */
import { test, type Page } from '@playwright/test';
import { seed, open } from './helpers';

test.skip(!process.env.RECORD, 'nur für Aufnahmen');
test.use({ video: { mode: 'on', size: { width: 390, height: 844 } }, ...(process.env.BASE ? { baseURL: process.env.BASE } : {}) });

async function c(page: Page, id: string) { const b = await page.locator(`#tabs .tab[data-tab="${id}"]`).boundingBox(); return { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 }; }

test('Aufnahme Tab-Leiste', async ({ page, browserName }) => {
  const slow = +(process.env.SLOW || 1);
  test.setTimeout(60000 * slow);
  if (slow !== 1) await page.addInitScript(s => { (window as any).__lensSlow = s; }, slow);
  await seed(page);
  await open(page, '/');
  await page.waitForTimeout(800);
  const ids = ['heute', 'plan', 'coach', 'fortschritt', 'mehr'];
  const p: Record<string, { x: number; y: number }> = {};
  for (const id of ids) p[id] = await c(page, id);
  const wait = (ms: number) => page.waitForTimeout(ms * slow);
  // 1) Antippen: Heute → Mehr → Plan → Fortschritt → Heute
  for (const id of ['mehr', 'plan', 'fortschritt', 'heute']) { await page.mouse.click(p[id].x, p[id].y); await wait(900); }
  // 2) Halten + Ziehen über alle Tabs und zurück, Loslassen auf „Coach“
  await page.mouse.move(p.heute.x, p.heute.y); await page.mouse.down(); await wait(450);
  const path = [...ids, ...ids.slice(0, -1).reverse().slice(0, 2)];
  for (let i = 1; i < path.length; i++) {
    const a = p[path[i - 1]], b = p[path[i]];
    for (let k = 1; k <= 10; k++) { await page.mouse.move(a.x + (b.x - a.x) * k / 10, a.y); await page.waitForTimeout(14 * slow); }
    await wait(150);
  }
  await page.mouse.up(); await wait(1200);
  // 3) schnelles Wischen nach rechts
  await page.mouse.move(p.heute.x, p.heute.y); await page.mouse.down();
  for (let k = 1; k <= 4; k++) await page.mouse.move(p.heute.x + (p.mehr.x - p.heute.x) * k / 4, p.heute.y);
  await page.mouse.up(); await wait(1400);
  const v = page.video()!;
  await page.close();
  await v.saveAs(`docs/tabbar-${process.env.NAME || 'neu'}-${browserName}${slow !== 1 ? '-zeitlupe' : ''}.webm`);
});
