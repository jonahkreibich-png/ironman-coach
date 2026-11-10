/* Auftrag 33: Tab-Leiste exakt wie iOS 26 (Fitness-App). Fehler, die diese Tests vorher zeigten (3.20.0):
   1. nach dem Runterscrollen brauchte es mehrere Tipps (Leiste geschrumpft, der erste Tipp vergrößerte sie nur)
   2. doppelte Beschriftung beim Überscrollen (Linse und Kopie der Tabs in eigener Ebene in body, gegen die Leiste verschoben)
   3. Flackern bei schnellen Wechseln (Hochspringen/Neu-Ausmessen löste Zusammenklappen aus, Größe sprang)
   4. „Fortschritt“ ragte aus der Linse
   Dazu: Bildrate beim Ziehen und Antippen (WebKit = Safari-Engine), mit Touch. */
import { test, expect, type Page } from '@playwright/test';
import { seed, open } from './helpers';

const TABS = ['heute', 'plan', 'coach', 'fortschritt', 'mehr'];
const center = async (page: Page, id: string) => { const b = await page.locator(`#tabs .tab[data-tab="${id}"]`).boundingBox(); return { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 }; };
const quiet = (page: Page) => expect.poll(() => page.evaluate(() => { const w = window as any; return (document.querySelector('.tabbar-body') as HTMLElement).getAnimations().length + (w.__lensState().gliding ? 1 : 0) + (w.__lensState().pending ? 1 : 0) + (w.__barState().pressed ? 1 : 0); }), { timeout: 4000 }).toBe(0);
const rects = (page: Page) => page.evaluate(() => {
  const r = (s: string) => { const e = document.querySelector(s) as HTMLElement; const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, w: q.width, h: q.height }; };
  return { bar: r('.tabbar'), body: r('.tabbar-body'), lens: r('.tab-lens'), on: r('#tabs .tab.on') };
});
/* Finger-Geste nachmachen (WebKit kennt in Playwright nur „tap“): Zeiger-Ereignisse wie vom Touchscreen */
async function touch(page: Page, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', x: number, y: number) {
  await page.evaluate(([type, x, y]) => {
    const el = (type === 'pointerdown' ? document.elementFromPoint(x as number, y as number) : document.querySelector('#tabs')) as HTMLElement;
    el.dispatchEvent(new PointerEvent(type as string, { bubbles: true, cancelable: true, pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: x as number, clientY: y as number }));
  }, [type, x, y] as const);
}

test('Fehler 1: nach dem Runterscrollen wechselt ein einziger Fingertipp den Tab (Leiste bleibt voll, wie in der Fitness-App)', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=plan');
  await quiet(page);
  const rest = await rects(page);
  await page.evaluate(() => { document.body.style.minHeight = '5000px'; });
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 150); await page.waitForTimeout(30); }
  await page.evaluate(() => window.dispatchEvent(new Event('touchmove')));
  await page.waitForTimeout(500);
  const after = await rects(page);
  expect(after.body).toEqual(rest.body);
  expect(await page.locator('.tabbar.mini, .tabbar-body.mini').count()).toBe(0);
  for (const id of ['coach', 'heute', 'fortschritt']) {
    const c = await center(page, id);
    await page.touchscreen.tap(c.x, c.y);
    await expect(page.locator(`[data-view="${id}"]`)).toBeVisible();
    await quiet(page);
    await page.evaluate(() => window.scrollTo(0, 3000)); await page.waitForTimeout(200);
  }
});

test('Fehler 2: Überscrollen oben und unten – Leiste und Linse bewegen sich nicht, keine doppelte Beschriftung (Bildvergleich)', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=plan');
  await quiet(page);
  const clip = await page.evaluate(() => { const r = (document.querySelector('.tabbar') as HTMLElement).getBoundingClientRect(); return { x: 0, y: Math.floor(r.top - 30), width: 390, height: Math.ceil(r.height + 60) }; });
  // nur Leiste und Linse vergleichen (Inhalt dahinter ausblenden; der Weichzeichner zeigt sonst den wechselnden Inhalt)
  const shot = async () => { await page.addStyleTag({ content: '#app, .top { visibility: hidden !important; }' }); const b = await page.screenshot({ clip }); await page.evaluate(() => document.querySelectorAll('style').forEach(s => { if (s.textContent && s.textContent.includes('visibility: hidden !important')) s.remove(); })); return b; };
  const base = await shot();
  const labels = () => page.evaluate(() => {
    const bar = (document.querySelector('.tabbar') as HTMLElement).getBoundingClientRect();
    const hits: string[] = [];
    document.querySelectorAll('body *').forEach(e => { if (e.children.length) return; const t = (e.textContent || '').trim(); if (!t) return; const r = e.getBoundingClientRect(); if (r.width && r.bottom > bar.top - 40 && r.top < bar.bottom + 40 && getComputedStyle(e).visibility !== 'hidden' && ['Heute', 'Plan', 'Coach', 'Fortschritt', 'Mehr'].includes(t)) hits.push(t); });
    return hits.sort();
  });
  expect(await labels()).toEqual(['Coach', 'Fortschritt', 'Heute', 'Mehr', 'Plan']);
  // keine Kopie der Tabs und keine eigene Linsen-Ebene in body mehr; die Linse hängt in der Kapsel
  expect(await page.locator('.ltab, .tab-lens-wrap, .tab-lens-in').count()).toBe(0);
  expect(await page.evaluate(() => !!document.querySelector('.tabbar-body > .tab-lens'))).toBe(true);
  // Gummiband: über das Ende hinaus (iOS verschiebt dabei den Inhalt) – unten und oben
  for (const dir of ['unten', 'oben']) {
    await page.evaluate(d => { const max = document.documentElement.scrollHeight; window.scrollTo(0, d === 'unten' ? max : 0); const app = document.getElementById('app')!; app.style.transform = `translateY(${d === 'unten' ? -120 : 120}px)`; window.dispatchEvent(new Event('scroll')); window.dispatchEvent(new Event('resize')); if (window.visualViewport) window.visualViewport.dispatchEvent(new Event('resize')); }, dir);
    await page.waitForTimeout(1000);
    expect(await labels(), dir).toEqual(['Coach', 'Fortschritt', 'Heute', 'Mehr', 'Plan']);
    const r = await rects(page);
    expect(Math.abs((r.lens.l + r.lens.w / 2) - (r.on.l + r.on.w / 2)), dir).toBeLessThan(1);
    expect(Math.abs((r.lens.t + r.lens.h / 2) - (r.on.t + r.on.h / 2)), dir).toBeLessThan(1);
    expect((await shot()).equals(base), 'Leiste unverändert beim Überscrollen ' + dir).toBe(true);
    await page.evaluate(() => { document.getElementById('app')!.style.transform = ''; });
  }
});

test('Fehler 3: 20 schnelle Wechsel – Leiste behält in jedem Bild ihre Größe, kein Springen, eine Linse, landet am letzten Tab', async ({ page }) => {
  test.setTimeout(60000);
  await seed(page);
  await open(page, '/');
  await quiet(page);
  const rest = await rects(page);
  const c: Record<string, { x: number; y: number }> = {}; for (const t of TABS) c[t] = await center(page, t);
  await page.evaluate(() => {
    const w = window as any; w.__fr = []; w.__stop = false;
    const loop = () => {
      const r = (s: string) => (document.querySelector(s) as HTMLElement).getBoundingClientRect();
      const b = r('.tabbar'), k = r('.tabbar-body');
      const lenses = [...document.querySelectorAll('.tab-lens')].length + document.querySelectorAll('.ltab, .tab-lens-wrap').length;
      w.__fr.push({ t: performance.now(), bw: b.width, bh: b.height, bt: b.top, bl: b.left, kw: k.width, kh: k.height, lenses, mini: document.querySelectorAll('.mini').length });
      if (!w.__stop) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  const seq = ['plan', 'coach', 'fortschritt', 'mehr', 'heute', 'mehr', 'plan', 'fortschritt', 'coach', 'heute', 'fortschritt', 'plan', 'mehr', 'coach', 'heute', 'plan', 'mehr', 'fortschritt', 'heute', 'coach'];
  for (const id of seq) { await page.touchscreen.tap(c[id].x, c[id].y); await page.waitForTimeout(70); }
  await expect(page.locator('[data-view="coach"]')).toBeVisible();
  await quiet(page);
  const fr: any[] = await page.evaluate(() => { (window as any).__stop = true; return (window as any).__fr; });
  expect(fr.length).toBeGreaterThan(30);
  for (const f of fr) {
    // Ebene mit dem Weichzeichner: in jedem Bild exakt gleich
    expect([f.bw, f.bh, f.bt, f.bl]).toEqual([rest.bar.w, rest.bar.h, rest.bar.t, rest.bar.l]);
    // sichtbare Kapsel: gibt höchstens ein paar Prozent elastisch nach, schrumpft nie sichtbar
    expect(f.kw).toBeGreaterThan(rest.body.w * 0.985); expect(f.kw).toBeLessThan(rest.body.w * 1.06);
    expect(f.kh).toBeGreaterThan(rest.body.h * 0.985); expect(f.kh).toBeLessThan(rest.body.h * 1.06);
    expect(f.lenses).toBe(1); expect(f.mini).toBe(0);
  }
  // kein Springen: von Bild zu Bild ändert sich die Breite der Kapsel nur wenig (vorher: Schrumpfen auf 88 % = 42 px auf einmal; hier
  // höchstens 2 % je Bild – unter Volllast liest requestAnimationFrame die Compositor-Animation leicht versetzt)
  for (let i = 1; i < fr.length; i++) expect(Math.abs(fr[i].kw - fr[i - 1].kw) / Math.max(1, (fr[i].t - fr[i - 1].t) / 16.7), 'Bild ' + i).toBeLessThan(7);
  const end = await rects(page);
  expect(end.body).toEqual(rest.body);
  expect(Math.abs((end.lens.l + end.lens.w / 2) - (end.on.l + end.on.w / 2))).toBeLessThan(1);
  // das Neu-Ausmessen (ResizeObserver, Nachmessen nach 120/350/800 ms) löst nichts aus
  await page.evaluate(() => { window.dispatchEvent(new Event('resize')); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => (document.querySelector('.tab-lens') as HTMLElement).getAnimations().length)).toBe(0);
  expect((await rects(page)).lens).toEqual(end.lens);
});

for (const variant of [{ name: 'Deutsch', lang: '' }, { name: 'Englisch', lang: 'en' }, { name: 'große Schrift', lang: '', big: true }, { name: 'quer', lang: '', wide: true }]) {
  test(`Fehler 4: jede Beschriftung liegt vollständig in der Markierung und im Tropfen (${variant.name})`, async ({ page }) => {
    await seed(page);
    if (variant.wide) await page.setViewportSize({ width: 844, height: 390 });
    if (variant.big) await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'html { font-size: 24px !important; } .tab span { font-size: var(--tab-fs, 15px) !important; }'; document.head.appendChild(s); }); });
    await open(page, '/');
    if (variant.lang) {
      await open(page, '/?go=sprache');
      await page.locator(`[data-act="set-pf"][data-k="lang"][data-v="${variant.lang}"]`).click();
      await expect(page.locator('#tabs .tab[data-tab="fortschritt"] span')).toHaveText('Progress');
    }
    await quiet(page);
    for (const id of TABS) {
      const c = await center(page, id);
      await page.mouse.click(c.x, c.y);
      await expect(page.locator(`#tabs .tab.on[data-tab="${id}"]`)).toHaveCount(1);
      await quiet(page);
      const r = await page.evaluate(id => {
        const lens = (document.querySelector('.tab-lens') as HTMLElement).getBoundingClientRect();
        const sp = document.querySelector(`#tabs .tab[data-tab="${id}"] span`) as HTMLElement; const s = sp.getBoundingClientRect();
        return { left: s.left - lens.left, right: lens.right - s.right, top: s.top - lens.top, bottom: lens.bottom - s.bottom, cut: sp.scrollWidth - sp.clientWidth, text: sp.textContent };
      }, id);
      expect(r.cut, `${r.text}: nicht abgeschnitten`).toBeLessThanOrEqual(0);
      expect(r.left, `${r.text}: links in der Markierung`).toBeGreaterThanOrEqual(2);
      expect(r.right, `${r.text}: rechts in der Markierung`).toBeGreaterThanOrEqual(2);
      expect(r.top).toBeGreaterThanOrEqual(0); expect(r.bottom).toBeGreaterThanOrEqual(0);
    }
  });
}

test('Bildrate: Halten, Ziehen und Antippen mit dem Finger laufen flüssig (Rechenzeit je Bild klein, Bildabstand wie ohne Leiste)', async ({ page }) => {
  await seed(page);
  await open(page, '/');
  await quiet(page);
  const c: Record<string, { x: number; y: number }> = {}; for (const t of TABS) c[t] = await center(page, t);
  /* Finger-Bewegung komplett in der Seite: ein Ereignis pro Bild (wie ein echter Finger), Bildabstände per requestAnimationFrame.
     Über den Testprozess gesteuert springt die Messung in WebKit zwischen 16 und 21 ms – das ist die Taktung der Fernsteuerung, nicht die App. */
  const run = (pts: { x: number; y: number }[], target: 'tabs' | 'pad') => page.evaluate(([pts, target]) => new Promise<number>(res => {
    const pad = document.getElementById('x-pad') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'x-pad' });
    const fire = (type: string, p: { x: number; y: number }) => {
      const el = (target === 'pad' ? pad : type === 'pointerdown' ? document.elementFromPoint(p.x, p.y) : document.querySelector('#tabs')) as HTMLElement;
      el.dispatchEvent(new PointerEvent(type, { bubbles: target !== 'pad', cancelable: true, pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: p.x, clientY: p.y }));
    };
    const fr: number[] = []; let i = 0, last = 0;
    fire('pointerdown', pts[0]);
    const loop = (t: number) => { if (last) fr.push(t - last); last = t; i++; if (i < pts.length) { fire('pointermove', pts[i]); requestAnimationFrame(loop); } else { (window as any).__frLast = fr; res(fr.reduce((a, x) => a + x, 0) / Math.max(1, fr.length)); } };
    requestAnimationFrame(loop);
  }), [pts, target] as const);
  const path: { x: number; y: number }[] = [];
  for (let i = 0; i <= 60; i++) path.push({ x: c.heute.x + (c.mehr.x - c.heute.x) * i / 60, y: c.heute.y });
  // Start-Arbeit der App (Abgleich, Mitteilungs-Prüfung nach 2,5 s) abwarten; Vergleich: dieselben Ereignisse an ein leeres Element, direkt davor und danach
  await page.waitForTimeout(3500);
  const base1 = await run(path, 'pad');
  await page.evaluate(() => { const p = (window as any).__lensPerf; p.n = 0; p.total = 0; p.max = 0; });
  const drag = await run(path, 'tabs');
  await touch(page, 'pointercancel', c.mehr.x, c.mehr.y); await quiet(page); await page.waitForTimeout(500);
  const base2 = await run(path, 'pad');
  const base = Math.max(base1, base2);
  await quiet(page);
  const drag2a = await run(path, 'tabs');
  await touch(page, 'pointercancel', c.mehr.x, c.mehr.y); await quiet(page); await page.waitForTimeout(500);
  // aufgewärmt: bester von zwei Durchgängen (eine kurze Last des Rechners soll den Test nicht entscheiden)
  const drag2 = Math.min(drag2a, await run(path, 'tabs'));
  await touch(page, 'pointerup', c.coach.x, c.coach.y);
  await expect(page.locator('[data-view="coach"]')).toBeVisible();
  await quiet(page);
  const perf = await page.evaluate(() => (window as any).__lensPerf);
  console.log('Bildrate', test.info().project.name, 'ohne', base.toFixed(1), 'Ziehen', drag.toFixed(1), drag2.toFixed(1), 'ms/Bild; Rechenzeit', (perf.total / perf.n).toFixed(2), 'max', perf.max.toFixed(2));
  // aufgewärmt wie ohne Leiste (60 Bilder/s); die allererste Geste nach dem Start braucht in WebKit unter Windows etwas länger (Ebenen anlegen)
  expect(drag2).toBeLessThan(Math.max(18, base * 1.12));
  expect(drag).toBeLessThan(24);
  expect(perf.n).toBeGreaterThan(20);
  expect(perf.total / perf.n).toBeLessThan(3);
  // Antippen: die Animation ist vorausberechnet (läuft im Compositor), nur transform und opacity werden animiert
  await page.touchscreen.tap(c.plan.x, c.plan.y);
  const props = await page.evaluate(() => [...document.querySelectorAll('.tabbar *'), document.querySelector('.tabbar-body')!].flatMap(e => (e as HTMLElement).getAnimations().filter(a => !(a instanceof CSSTransition)).flatMap(a => (a.effect as KeyframeEffect).getKeyframes().flatMap(k => Object.keys(k).filter(x => !['offset', 'easing', 'composite', 'computedOffset'].includes(x))))));
  expect([...new Set(props)].sort()).toEqual(['opacity', 'transform']);
  await expect(page.locator('[data-view="plan"]')).toBeVisible();
});

test('„Bewegung reduzieren“: kein Tropfen, keine Verformung, kein Weg – die Markierung wechselt direkt', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page);
  await open(page, '/');
  await quiet(page);
  const rest = await rects(page);
  const m = await center(page, 'mehr');
  await page.touchscreen.tap(m.x, m.y);
  await expect(page.locator('[data-view="mehr"]')).toBeVisible();
  const r = await rects(page);
  expect(r.body).toEqual(rest.body);
  expect(Math.abs((r.lens.l + r.lens.w / 2) - (r.on.l + r.on.w / 2))).toBeLessThan(1);
  expect([r.lens.w, r.lens.h]).toEqual([rest.lens.w, rest.lens.h]);
  expect(await page.evaluate(() => [...document.querySelectorAll('.tabbar, .tabbar *')].reduce((n, e) => n + (e as HTMLElement).getAnimations().length, 0))).toBe(0);
});
