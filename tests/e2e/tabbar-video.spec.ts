/* Aufnahme der Tab-Leiste für docs/ (nur auf Wunsch: RECORD=1, optional BASE=<Adresse einer anderen Fassung> und NAME=<Dateiname>).
   Auftrag 33: gleicher Ablauf wie die iPhone-Aufnahme der Fitness-App (docs/vergleich/ios26-fitness-tableiste.mp4), damit beide
   nebeneinander verglichen werden können: Ruhe → Halten auf dem linken Tab und zurückziehen → Antippen, Antippen → Halten und lange hin
   und her ziehen → Scrollen (Leiste bleibt) → Antippen. Dunkler Modus wie im Video. SLOW=4 spielt alles in Zeitlupe.
   Auftrag 34: TOUCH=1 – mit Touch wie am iPhone (Antippen über den Touchscreen, Halten/Ziehen als Touch-Zeiger). */
import { test, type Page } from '@playwright/test';
import { seed, open } from './helpers';

test.skip(!process.env.RECORD, 'nur für Aufnahmen');
test.use({ video: { mode: 'on', size: { width: 390, height: 844 } }, colorScheme: 'dark', ...(process.env.BASE ? { baseURL: process.env.BASE } : {}) });

async function c(page: Page, id: string) { const b = await page.locator(`#tabs .tab[data-tab="${id}"]`).boundingBox(); return { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 }; }

test('Aufnahme Tab-Leiste', async ({ page, browserName }) => {
  const slow = +(process.env.SLOW || 1);
  test.setTimeout(90000 * slow);
  if (slow !== 1) await page.addInitScript(s => { (window as any).__lensSlow = s; }, slow);
  await seed(page);
  await open(page, '/?go=plan');
  await page.waitForTimeout(600);
  const ids = ['heute', 'plan', 'coach', 'fortschritt', 'mehr'];
  const p: Record<string, { x: number; y: number }> = {};
  for (const id of ids) p[id] = await c(page, id);
  const wait = (ms: number) => page.waitForTimeout(ms * slow);
  const T = !!process.env.TOUCH;
  // Touch-Zeiger (pointerType „touch“) direkt an der Leiste – Playwright kann in WebKit kein Touch-Ziehen
  const tp = (type: string, x: number, y: number) => page.evaluate(([type, x, y]) => { const hit = document.elementFromPoint(x as number, y as number) as HTMLElement | null; const el = (hit && hit.closest('#tabs')) ? hit : document.getElementById('tabs')!; el.dispatchEvent(new PointerEvent(type as string, { bubbles: true, cancelable: true, pointerId: 21, pointerType: 'touch', isPrimary: true, clientX: x as number, clientY: y as number })); }, [type, x, y] as const);
  let at = { x: 0, y: 0 };
  const mv = async (x: number, y: number) => { at = { x, y }; if (T) await tp('pointermove', x, y); else await page.mouse.move(x, y); };
  const dn = async () => { if (T) await tp('pointerdown', at.x, at.y); else await page.mouse.down(); };
  const up = async () => { if (T) await tp('pointerup', at.x, at.y); else await page.mouse.up(); };
  const glide = async (from: { x: number; y: number }, to: { x: number; y: number }, ms: number) => { const n = Math.max(4, Math.round(ms / 16)); for (let k = 1; k <= n; k++) { await mv(from.x + (to.x - from.x) * k / n, from.y); await page.waitForTimeout(16 * slow); } };
  const tap = async (id: string) => { if (T) { await page.touchscreen.tap(p[id].x, p[id].y); return; } await page.mouse.move(p[id].x, p[id].y); await page.mouse.down(); await page.waitForTimeout(70 * slow); await page.mouse.up(); };
  // 0–1 s Ruhe
  await wait(1000);
  // 1,1 s: Halten auf dem linken Tab, 0,8 s halten, zurück zum aktiven ziehen, loslassen (Video: Trainings → Trends)
  await mv(p.heute.x, p.heute.y); await dn(); await wait(800);
  await glide(p.heute, p.plan, 200); await up(); await wait(700);
  // 2,7 s / 3,5 s: Antippen, Antippen
  await tap('coach'); await wait(800);
  await tap('mehr'); await wait(700);
  // 4,4–7,6 s: Halten und lange hin und her ziehen
  await mv(p.mehr.x, p.mehr.y); await dn(); await wait(250);
  await glide(p.mehr, p.coach, 350); await glide(p.coach, p.plan, 250); await glide(p.plan, p.heute, 300);
  await glide(p.heute, p.coach, 450); await glide(p.coach, p.mehr, 400); await glide(p.mehr, p.plan, 600);
  await glide(p.plan, p.heute, 300);
  await up(); await wait(400);
  // 7,7–11 s: Scrollen, die Leiste bleibt
  await page.mouse.move(195, 400);
  for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 110); await page.waitForTimeout(90 * slow); }
  for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, -130); await page.waitForTimeout(90 * slow); }
  await wait(300);
  // 11–13 s: Antippen
  await tap('plan'); await wait(600);
  await tap('coach'); await wait(500);
  await tap('plan'); await wait(1200);
  const v = page.video()!;
  await page.close();
  await v.saveAs(`docs/vergleich/${process.env.NAME || 'meine-app-neu'}-${browserName}${T ? '-touch' : ''}${slow !== 1 ? '-zeitlupe' : ''}.webm`);
});
