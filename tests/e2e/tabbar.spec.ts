/* Tab-Leiste wie in iOS 26 (Auftrag 23, überarbeitet in Auftrag 24): genau EIN Linsen-Element (Markierung des aktiven Tabs = Zieh-Linse),
   Feder statt fester Animation (Gleiten mit leichtem Überschwingen, Dehnen in Bewegungsrichtung), weiches Einrasten am nächsten Tab,
   flüssig (Rechenzeit je Frame, Gleiten läuft als Web-Animation weiter, während der neue Tab aufgebaut wird), „Bewegung reduzieren“.
   Läuft in Chromium und WebKit (Safari-Engine). */
import { test, expect, type Page } from '@playwright/test';
import { seed, open } from './helpers';

const TABS = ['heute', 'plan', 'coach', 'fortschritt', 'mehr'];
async function tabCenter(page: Page, id: string) {
  const b = await page.locator(`#tabs .tab[data-tab="${id}"]`).boundingBox();
  return { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 };
}
const lensBox = (page: Page) => page.evaluate(() => { const l = document.querySelector('.tab-lens') as HTMLElement; const r = l.getBoundingClientRect(); return { x: r.left + r.width / 2, w: r.width, h: r.height, y: r.top }; });

/* Prüft in jedem Frame: wie viele Linsen sind sichtbar? (Linsen-Elemente + Tabs mit eigener Markierungsfläche) und wo steht die Linse */
async function startAudit(page: Page) {
  await page.evaluate(() => {
    const w = window as any; w.__audit = { maxLenses: 0, frames: [] as { x: number; sx: number; s: number; t: number }[], stop: false };
    const restW = (document.querySelector('#tabs') as HTMLElement).getBoundingClientRect().width / 5;
    const loop = (t: number) => {
      const lenses = [...document.querySelectorAll<HTMLElement>('.tab-lens')].filter(e => { const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05; }).length;
      const pills = [...document.querySelectorAll<HTMLElement>('#tabs .tab')].filter(e => { const cs = getComputedStyle(e); return cs.backgroundImage !== 'none' || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent'); }).length;
      w.__audit.maxLenses = Math.max(w.__audit.maxLenses, lenses + pills);
      const l = document.querySelector('.tab-lens') as HTMLElement; const r = l.getBoundingClientRect();
      w.__audit.frames.push({ x: r.left + r.width / 2, sx: r.width / restW, s: r.height, t });
      if (!w.__audit.stop) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}
async function stopAudit(page: Page) {
  return page.evaluate(() => { const w = window as any; w.__audit.stop = true; return w.__audit as { maxLenses: number; frames: { x: number; sx: number; s: number; t: number }[] }; });
}
const settledAt = async (page: Page, id: string) => {
  const c = await tabCenter(page, id);
  await expect.poll(async () => Math.abs((await lensBox(page)).x - c.x), { timeout: 3000 }).toBeLessThan(1.5);
  await expect.poll(() => page.evaluate(() => (window as any).__lensState().gliding), { timeout: 3000 }).toBe(false);
};

test('genau ein Linsen-Element: steht in Ruhe am aktiven Tab, kein zweiter Hintergrund am Tab', async ({ page }) => {
  await seed(page);
  await open(page, '/');
  await expect(page.locator('.tab-lens')).toHaveCount(1);
  await settledAt(page, 'heute');
  // der aktive Tab hat keine eigene Fläche mehr (das war die zweite Linse)
  const bg = await page.locator('#tabs .tab.on').evaluate(e => { const cs = getComputedStyle(e); return cs.backgroundImage + '|' + cs.backgroundColor; });
  expect(bg).toBe('none|rgba(0, 0, 0, 0)');
  // Linse so groß wie ein Tab, innerhalb der Leiste
  const lb = await lensBox(page), tb = await page.locator('#tabs .tab.on').boundingBox(), bb = await page.locator('.tabbar').boundingBox();
  expect(Math.abs(lb.w - tb!.width)).toBeLessThan(2);
  expect(lb.y).toBeGreaterThanOrEqual(bb!.y);
  // Neuladen auf einem anderen Tab: Linse dort, nicht bei „Heute“
  await open(page, '/?go=fortschritt');
  await settledAt(page, 'fortschritt');
  await expect(page.locator('.tab-lens')).toHaveCount(1);
});

test('Antippen: Linse gleitet mit Feder (mehrere Zwischenbilder, leichtes Überschwingen, Dehnen), nie zwei Linsen', async ({ page }) => {
  await seed(page);
  await open(page, '/');
  await settledAt(page, 'heute');
  const h = await tabCenter(page, 'heute'), m = await tabCenter(page, 'mehr');
  await startAudit(page);
  await page.mouse.click(m.x, m.y);
  await expect(page.locator('[data-view="mehr"]')).toBeVisible();
  await settledAt(page, 'mehr');
  const a = await stopAudit(page);
  expect(a.maxLenses).toBe(1);
  const xs = a.frames.map(f => f.x);
  const between = xs.filter(x => x > h.x + 10 && x < m.x - 10);
  expect(between.length, 'Zwischenbilder beim Gleiten').toBeGreaterThanOrEqual(5);          // gleitet, springt nicht
  const over = Math.max(...xs) - m.x;
  expect(over, 'Überschwingen').toBeGreaterThan(0.5);                                       // Feder: kurz über das Ziel hinaus
  expect(over).toBeLessThan(m.x - h.x > 200 ? 25 : 12);                                     // aber nur leicht
  expect(Math.max(...a.frames.map(f => f.sx)), 'Dehnung in Bewegungsrichtung').toBeGreaterThan(1.06);
  expect(a.frames[a.frames.length - 1].sx).toBeLessThan(1.01);                              // in Ruhe wieder rund
  // zurück zu „Plan“: gleitet ebenso, dann Ruhe
  await startAudit(page);
  const p = await tabCenter(page, 'plan');
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('[data-view="plan"]')).toBeVisible();
  await settledAt(page, 'plan');
  expect((await stopAudit(page)).maxLenses).toBe(1);
  // ein Klick = eine Navigation (nichts doppelt, nichts verschluckt)
  await page.mouse.click(h.x, h.y);
  await expect(page.locator('[data-view="heute"]')).toBeVisible();
  await settledAt(page, 'heute');
});

test('Antippen mit dem Finger (Touch): Linse gleitet, der Tab öffnet nach dem Start der Animation, ein Tipp = eine Navigation', async ({ page }) => {
  await seed(page);
  await open(page, '/');
  await settledAt(page, 'heute');
  const f = await tabCenter(page, 'fortschritt');
  await startAudit(page);
  await page.touchscreen.tap(f.x, f.y);
  await expect(page.locator('[data-view="fortschritt"]')).toBeVisible();
  await settledAt(page, 'fortschritt');
  const a = await stopAudit(page);
  expect(a.maxLenses).toBe(1);
  expect(a.frames.filter(x => x.x > 60 && x.x < f.x - 10).length).toBeGreaterThanOrEqual(4);
  const t = await tabCenter(page, 'plan');
  await page.touchscreen.tap(t.x, t.y);
  await expect(page.locator('[data-view="plan"]')).toBeVisible();
  await settledAt(page, 'plan');
});

test('Halten + Ziehen über alle Tabs und zurück: Linse vergrößert, folgt, hebt den Tab darunter hervor, rastet ein', async ({ page }) => {
  await seed(page);
  await open(page, '/');
  await settledAt(page, 'heute');
  const c: Record<string, { x: number; y: number }> = {};
  for (const t of TABS) c[t] = await tabCenter(page, t);
  const rest = await lensBox(page);
  await startAudit(page);
  await page.mouse.move(c.heute.x, c.heute.y); await page.mouse.down();
  await page.waitForTimeout(350);
  await expect(page.locator('.tab-lens.pressed')).toHaveCount(1);
  await expect.poll(async () => (await lensBox(page)).h / rest.h, { timeout: 2000 }).toBeGreaterThan(1.12);    // beim Drücken größer
  // hin
  for (let i = 1; i < TABS.length; i++) {
    const from = c[TABS[i - 1]], to = c[TABS[i]];
    for (let k = 1; k <= 8; k++) { await page.mouse.move(from.x + (to.x - from.x) * k / 8, from.y); await page.waitForTimeout(12); }
    await expect(page.locator('#tabs .tab.peek')).toHaveAttribute('data-tab', TABS[i]);
  }
  await expect.poll(async () => Math.abs((await lensBox(page)).x - c.mehr.x), { timeout: 2000 }).toBeLessThan(25);
  // zurück bis „Plan“
  for (let i = TABS.length - 2; i >= 1; i--) {
    const from = c[TABS[i + 1]], to = c[TABS[i]];
    for (let k = 1; k <= 8; k++) { await page.mouse.move(from.x + (to.x - from.x) * k / 8, from.y); await page.waitForTimeout(12); }
    await expect(page.locator('#tabs .tab.peek')).toHaveAttribute('data-tab', TABS[i]);
  }
  // während des Ziehens wurde nicht navigiert
  await expect(page.locator('[data-view="heute"]')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('[data-view="plan"]')).toBeVisible();
  await settledAt(page, 'plan');
  await expect(page.locator('.tab-lens.pressed')).toHaveCount(0);
  const end = await lensBox(page);
  expect(Math.abs(end.h - rest.h)).toBeLessThan(1);                                       // wieder normal groß
  const a = await stopAudit(page);
  expect(a.maxLenses, 'nie zwei Linsen').toBe(1);
  // danach normales Antippen sofort wieder möglich (kein verschluckter Klick)
  await page.mouse.click(c.coach.x, c.coach.y);
  await expect(page.locator('[data-view="coach"]')).toBeVisible();
});

test('schnelles Wischen: Linse dehnt sich, landet am Ziel-Tab, öffnet ihn', async ({ page }) => {
  await seed(page);
  await open(page, '/');
  await settledAt(page, 'heute');
  const h = await tabCenter(page, 'heute'), m = await tabCenter(page, 'mehr');
  await startAudit(page);
  await page.mouse.move(h.x, h.y); await page.mouse.down();
  await page.mouse.move(h.x + (m.x - h.x) * 0.35, h.y);
  await page.mouse.move(h.x + (m.x - h.x) * 0.7, h.y);
  await page.mouse.move(m.x, m.y);
  await page.mouse.up();
  await expect(page.locator('[data-view="mehr"]')).toBeVisible();
  await settledAt(page, 'mehr');
  const a = await stopAudit(page);
  expect(a.maxLenses).toBe(1);
  expect(Math.max(...a.frames.map(f => f.sx))).toBeGreaterThan(1.06);
});

test('Loslassen zwischen zwei Tabs: rastet am nächsten ein', async ({ page }) => {
  await seed(page);
  await open(page, '/');
  await settledAt(page, 'heute');
  const p = await tabCenter(page, 'plan'), co = await tabCenter(page, 'coach');
  const mid = (p.x + co.x) / 2;
  // knapp rechts der Mitte → Coach
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForTimeout(300);
  for (let k = 1; k <= 6; k++) { await page.mouse.move(p.x + (mid + 6 - p.x) * k / 6, p.y); await page.waitForTimeout(16); }
  await page.mouse.up();
  await expect(page.locator('[data-view="coach"]')).toBeVisible();
  await settledAt(page, 'coach');
  // knapp links der Mitte → Plan
  await page.mouse.move(co.x, co.y); await page.mouse.down(); await page.waitForTimeout(300);
  for (let k = 1; k <= 6; k++) { await page.mouse.move(co.x + (mid - 6 - co.x) * k / 6, co.y); await page.waitForTimeout(16); }
  await page.mouse.up();
  await expect(page.locator('[data-view="plan"]')).toBeVisible();
  await settledAt(page, 'plan');
});

test('Tab-Wechsel ohne Geste (Tastatur, Knopf im Inhalt): dieselbe Linse gleitet mit', async ({ page }) => {
  await seed(page);
  await open(page, '/');
  await settledAt(page, 'heute');
  await page.locator('#tabs .tab[data-tab="coach"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-view="coach"]')).toBeVisible();
  await settledAt(page, 'coach');
  await page.evaluate(() => { const b = document.createElement('button'); b.dataset.act = 'go-tab'; b.dataset.tab = 'fortschritt'; b.id = 'x-go'; document.getElementById('app')!.prepend(b); });
  await page.locator('#x-go').click();
  await expect(page.locator('[data-view="fortschritt"]')).toBeVisible();
  await settledAt(page, 'fortschritt');
  await expect(page.locator('.tab-lens')).toHaveCount(1);
});

test('flüssig: Rechenzeit je Frame klein, Gleiten läuft als Web-Animation (Compositor) weiter, während der neue Tab aufgebaut wird', async ({ page }) => {
  await seed(page);
  await open(page, '/');
  await settledAt(page, 'heute');
  const h = await tabCenter(page, 'heute');
  const startFr = () => page.evaluate(() => { (window as any).__fr = []; (window as any).__stop = false; let last = 0; const loop = (t: number) => { if (last) (window as any).__fr.push(t - last); last = t; if (!(window as any).__stop) requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
  const stopFr = async () => { await page.evaluate(() => { (window as any).__stop = true; }); const fr: number[] = await page.evaluate(() => (window as any).__fr); return fr.reduce((a, x) => a + x, 0) / Math.max(1, fr.length); };
  // Vergleich: gleiche Bewegung über dem Inhalt (ohne Linse)
  await startFr(); await page.mouse.move(40, 300); await page.mouse.down();
  for (let i = 1; i <= 30; i++) { await page.mouse.move(40 + 300 * i / 30, 300); await page.waitForTimeout(20); }
  await page.mouse.up(); const base = await stopFr();
  const drag = async (to: { x: number }) => {
    await startFr();
    await page.mouse.move(h.x, h.y); await page.mouse.down();
    await page.mouse.move(h.x + 20, h.y);
    await expect(page.locator('.tab-lens.pressed')).toHaveCount(1);
    for (let i = 1; i <= 30; i++) { await page.mouse.move(h.x + (to.x - h.x) * i / 30, h.y); await page.waitForTimeout(20); }
    const avg = await stopFr(); await page.mouse.up(); return avg;
  };
  const cold = await drag(await tabCenter(page, 'mehr'));
  await expect(page.locator('[data-view="mehr"]')).toBeVisible();
  await settledAt(page, 'mehr');
  const warm = await drag(await tabCenter(page, 'plan'));
  await expect(page.locator('[data-view="plan"]')).toBeVisible();
  await settledAt(page, 'plan');
  console.log('Linse', test.info().project.name, 'ohne', base.toFixed(1), 'erste Geste', cold.toFixed(1), 'danach', warm.toFixed(1), 'ms/Frame');
  expect(cold).toBeLessThan(Math.max(18, base * 2.5));
  expect(warm).toBeLessThan(Math.max(17.5, base * 1.15));
  const perf = await page.evaluate(() => (window as any).__lensPerf);
  console.log('Linse Rechenzeit', (perf.total / perf.n).toFixed(2), 'ms im Mittel, max', perf.max.toFixed(2));
  expect(perf.n).toBeGreaterThan(20);
  expect(perf.total / perf.n).toBeLessThan(4);
  expect(perf.max).toBeLessThan(12);
  // Antippen: die Animation läuft schon, bevor der neue Tab gebaut wird, und nur transform wird animiert
  const info = await page.evaluate(() => new Promise<any>(res => {
    const lens = document.querySelector('.tab-lens') as HTMLElement; const app = document.getElementById('app')!;
    const b = document.querySelector('#tabs .tab[data-tab="fortschritt"]') as HTMLElement; const r = b.getBoundingClientRect();
    let runningAtRender: string[] | null = null, renderMs = 0;
    const mo = new MutationObserver(() => { if (runningAtRender) return; runningAtRender = lens.getAnimations().map(a => a.playState); const t0 = performance.now(); requestAnimationFrame(() => { renderMs = performance.now() - t0; }); });
    mo.observe(app, { childList: true });
    const t0 = performance.now();
    const ev = (type: string) => b.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, isPrimary: true }));
    ev('pointerdown'); ev('pointerup'); b.click();
    const props = lens.getAnimations().flatMap(a => ((a.effect as KeyframeEffect).getKeyframes()).flatMap(k => Object.keys(k).filter(x => !['offset', 'easing', 'composite', 'computedOffset'].includes(x))));
    setTimeout(() => { mo.disconnect(); res({ runningAtRender, props: [...new Set(props)], navMs: 0, t: performance.now() - t0, renderMs }); }, 600);
  }));
  console.log('Antippen', test.info().project.name, JSON.stringify(info));
  expect(info.props).toEqual(['transform']);
  expect(info.runningAtRender, 'Animation läuft, während der Tab aufgebaut wird').toContain('running');
  await expect(page.locator('[data-view="fortschritt"]')).toBeVisible();
});

test('„Bewegung reduzieren“: keine Feder, keine Vergrößerung, Linse wechselt direkt', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page);
  await open(page, '/');
  await settledAt(page, 'heute');
  const h = await tabCenter(page, 'heute'), p = await tabCenter(page, 'plan'), m = await tabCenter(page, 'mehr');
  const rest = await lensBox(page);
  // Antippen: kein Zwischenbild
  await startAudit(page);
  await page.mouse.click(m.x, m.y);
  await expect(page.locator('[data-view="mehr"]')).toBeVisible();
  const a = await stopAudit(page);
  expect(a.frames.filter(f => f.x > h.x + 10 && f.x < m.x - 10).length).toBe(0);
  expect(Math.abs((await lensBox(page)).x - m.x)).toBeLessThan(1.5);
  // Halten: keine Vergrößerung, springt von Tab zu Tab
  await page.mouse.move(h.x, h.y); await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.move(p.x - 5, h.y);
  await page.waitForTimeout(60);
  const lb = await lensBox(page);
  expect(Math.abs(lb.x - p.x)).toBeLessThan(1.5);
  expect(Math.abs(lb.h - rest.h)).toBeLessThan(1);
  expect(await page.evaluate(() => (document.querySelector('.tab-lens') as HTMLElement).getAnimations().length)).toBe(0);
  await page.mouse.up();
  await expect(page.locator('[data-view="plan"]')).toBeVisible();
  expect(Math.abs((await lensBox(page)).x - p.x)).toBeLessThan(1.5);
});
