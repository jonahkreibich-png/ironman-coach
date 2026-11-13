/* Auftrag 35, Punkt 2: Kontrast auf allen Bildschirmen, so wie sie wirklich gezeichnet werden (WCAG 2.1 AA).
   tests/unit/contrast26.test.ts prüft die Farb-Token; hier wird gemessen, was im Browser ankommt: jede sichtbare Schrift gegen den
   tatsächlichen Hintergrund (halbdurchsichtige Karten, Pillen, Knöpfe übereinander gerechnet, Deckkraft der Eltern eingerechnet),
   Text 4,5:1, große Schrift 3:1, Symbole in Knöpfen 3:1, ausgewählte Zustände (Haken, Chips, Tabs) inbegriffen.
   Alle Tabs und Unterseiten plus geöffnete Einheit, hell und dunkel. Ausgenommen nur, was WCAG ausnimmt: deaktivierte Knöpfe. */
import { test, expect } from './storage-harness';
import { type Page } from '@playwright/test';
import fs from 'node:fs';
// @ts-ignore – reines JS ohne Typen
import { makeDemo } from '../../fixtures/demo.mjs';
import { TODAY } from './helpers';

const MAIN = fs.readFileSync('web/src/main.ts', 'utf8');
const TABS = [...MAIN.matchAll(/\{ id: '(\w+)', icon: '\w+', render: /g)].map(m => m[1]);
const SUBS = [...(/const SUBS: Record<string, \(\) => string> = \{([\s\S]*?)\n\};/.exec(MAIN) || ['', ''])[1].matchAll(/(\w+): /g)].map(m => m[1]);

async function prepare(page: Page, dark: boolean) {
  const demo = makeDemo(TODAY); const plan = demo.plan; const st: any = { ...demo }; delete st.plan;
  // eine erledigte Einheit heute, damit der Haken (an) mitgeprüft wird
  const today = plan.weeks.flatMap((w: any) => w.days).find((d: any) => d.date === TODAY);
  const s = today && today.sessions.find((x: any) => x.sport !== 'rest');
  if (s) st.sessions = { ...(st.sessions || {}), [s.id]: { completed: true, metrics: { min: '45', km: '8', hr: '142' }, metricsSrc: { min: 'manual' } } };
  await page.addInitScript(([p, x]) => {
    if (!sessionStorage.getItem('__keep35')) { localStorage.clear(); localStorage.setItem('ec_ui', JSON.stringify({ seenRelease: '9.9.9' })); localStorage.setItem('ec_plan', p as string); localStorage.setItem('ec_state_v2', x as string); sessionStorage.setItem('__keep35', '1'); }
  }, [JSON.stringify(plan), JSON.stringify(st)] as any);
  await page.clock.setFixedTime(new Date(`${TODAY}T07:30:00+02:00`));
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce' });
}

/* Misst im Browser. Liefert die Stellen unter der Grenze. */
export async function contrastIssues(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    type C = [number, number, number, number];
    const parse = (s: string): C | null => {
      const m = /rgba?\(([^)]+)\)/.exec(s); if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
      const c = /color\(srgb ([^)]+)\)/.exec(s); if (c) { const p = c[1].split(/[ /]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1]; }
      return null;
    };
    const over = (top: C, bot: C): C => { const a = top[3] + bot[3] * (1 - top[3]); if (!a) return [0, 0, 0, 0]; return [0, 1, 2].map(i => (top[i] * top[3] + bot[i] * bot[3] * (1 - top[3])) / a).concat(a) as C; };
    const lum = (c: C) => { const l = c.slice(0, 3).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
    const ratio = (a: C, b: C) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const rootCs = getComputedStyle(document.documentElement);
    const rootBg = parse(rootCs.backgroundColor) || [255, 255, 255, 1];
    // Verlauf oben (grad-top) bis 34 % der Höhe: für Elemente oben beide Farben prüfen
    const top = (() => { const v = rootCs.getPropertyValue('--grad-top').trim(); const d = document.createElement('i'); d.style.color = v; document.body.appendChild(d); const c = parse(getComputedStyle(d).color); d.remove(); return c; })();
    /* Hintergrund unter einem Element: alle Hintergrundfarben der Vorfahren übereinander, Deckkraft der Vorfahren */
    function backs(el: Element): { bgs: C[]; op: number } {
      // je Ebene die möglichen Farben: Hintergrundfarbe, bei Verläufen (Glas-Knöpfe) jede Farbe des Verlaufs
      const layers: C[][] = []; let op = 1; let opaque = false;
      for (let e: Element | null = el; e && !opaque; e = e.parentElement) {
        const cs = getComputedStyle(e);
        op *= +cs.opacity;
        const grad = /gradient/.test(cs.backgroundImage) ? (cs.backgroundImage.match(/rgba?\([^)]+\)|color\(srgb[^)]+\)/g) || []).map(parse).filter((x): x is C => !!x) : [];
        if (grad.length && e !== document.body && e !== document.documentElement) { layers.push(grad); if (grad.every(g => g[3] >= 1)) opaque = true; }
        const b = parse(cs.backgroundColor); if (b && b[3] > 0) { layers.push([b]); if (b[3] >= 1) opaque = true; }
      }
      const bases: C[] = [rootBg];
      const r = el.getBoundingClientRect(); if (top && r.top < innerHeight * 0.34 && !el.closest('.sheet')) bases.push(top);
      // Reihenfolge: layers[0] ist die oberste Ebene
      let all: C[] = bases;
      for (let i = layers.length - 1; i >= 0; i--) all = layers[i].flatMap(l => all.map(b => over(l, b)));
      return { bgs: all.slice(0, 24), op };
    }
    const out: string[] = [];
    const desc = (el: Element) => `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''} „${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 36)}“`;
    const visible = (el: Element) => {
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden]')) return false;
      for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) if (!(d as HTMLDetailsElement).open && !el.closest('summary')) return false;
      const r = el.getBoundingClientRect(); return r.width >= 1 && r.height >= 1;
    };
    const disabled = (el: Element) => !!el.closest('button:disabled, [aria-disabled="true"], input:disabled, select:disabled, .tablens-copy, [inert]');
    // Text
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const el = n.parentElement; if (!el || seen.has(el) || !(n.textContent || '').trim()) continue; seen.add(el);
      if (!visible(el) || disabled(el) || el.closest('svg, script, style, noscript')) continue;
      // nur Text, der Buchstaben oder Ziffern trägt (Trennzeichen „·“ zählt nicht)
      if (!/[\p{L}\p{N}]/u.test(n.textContent || '')) continue;
      const cs = getComputedStyle(el); const fg = parse(cs.color); if (!fg) continue;
      const size = parseFloat(cs.fontSize); const bold = +cs.fontWeight >= 700;
      const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      const { bgs, op } = backs(el);
      for (const bg of bgs) { const c = over([fg[0], fg[1], fg[2], fg[3] * op], bg); const r = ratio(c, bg); if (r < need - 0.02) { out.push(`Text ${desc(el)}: ${r.toFixed(2)} < ${need}`); break; } }
    }
    // Platzhalter in leeren Feldern (Soll-Werte stehen grau im Feld): wie Text 4,5:1
    for (const inp of Array.from(document.querySelectorAll('input[placeholder], textarea[placeholder]')) as HTMLInputElement[]) {
      if (!inp.placeholder.trim() || inp.value || !visible(inp) || disabled(inp)) continue;
      const fg = parse(getComputedStyle(inp, '::placeholder').color); if (!fg) continue;
      const { bgs, op } = backs(inp);
      for (const bg of bgs) { const c = over([fg[0], fg[1], fg[2], fg[3] * op], bg); const r = ratio(c, bg); if (r < 4.48) { out.push(`Platzhalter ${desc(inp)} „${inp.placeholder.slice(0, 20)}“: ${r.toFixed(2)} < 4.5`); break; } }
    }
    // Symbole (Linien in Knöpfen, Haken, Tabs): 3:1
    for (const svg of Array.from(document.querySelectorAll('button svg, a svg, .check svg, .pill svg'))) {
      if (!visible(svg) || disabled(svg) || svg.closest('.tablens-copy')) continue;
      const host = svg.parentElement!; const cs = getComputedStyle(svg); const fg = parse(cs.color); if (!fg) continue;
      const { bgs, op } = backs(host);
      for (const bg of bgs) { const c = over([fg[0], fg[1], fg[2], fg[3] * op], bg); const r = ratio(c, bg); if (r < 2.98) { out.push(`Symbol in ${desc(host)}: ${r.toFixed(2)} < 3`); break; } }
    }
    return [...new Set(out)];
  });
}

const SCREENS = [...TABS.map(x => '/?go=' + x), ...SUBS.map(x => '/?go=' + x)];
for (const dark of [false, true]) {
  test(`Kontrast aller Bildschirme ${dark ? 'dunkel' : 'hell'} (WCAG AA)`, async ({ page }) => {
    test.setTimeout(240000);
    await prepare(page, dark);
    const bad: string[] = [];
    for (const url of SCREENS) {
      await page.goto(url); await page.waitForSelector('main', { state: 'attached' }); await page.waitForTimeout(250);
      // alle Aufklapper öffnen, damit auch ihr Inhalt geprüft wird
      await page.evaluate(() => document.querySelectorAll('main details').forEach(d => ((d as HTMLDetailsElement).open = true)));
      (await contrastIssues(page)).forEach(x => bad.push(`${url}: ${x}`));
    }
    // geöffnete Einheit (Sheet) mit Werten
    await page.goto('/?go=heute'); await page.waitForTimeout(250);
    const open = page.locator('[data-act="sess-open"]').first();
    if (await open.count()) { await open.click(); await page.waitForSelector('.sheet'); await page.evaluate(() => document.querySelectorAll('.sheet details').forEach(d => ((d as HTMLDetailsElement).open = true))); await page.waitForTimeout(200); (await contrastIssues(page)).forEach(x => bad.push(`Einheit: ${x}`)); }
    expect([...new Set(bad)]).toEqual([]);
  });
}

test('Erledigt-Haken: weiß auf vollem Grün, hell und dunkel', async ({ page }) => {
  for (const dark of [false, true]) {
    await prepare(page, dark);
    await page.goto('/?go=heute');
    const on = page.locator('.check.on').first();
    await expect(on).toBeVisible();
    const c = await on.evaluate(el => { const cs = getComputedStyle(el); return { bg: cs.backgroundColor, color: cs.color, stroke: getComputedStyle(el.querySelector('svg')!).strokeWidth }; });
    expect(c.color).toBe('rgb(255, 255, 255)');
    expect(c.bg).toBe(dark ? 'rgb(23, 135, 69)' : 'rgb(8, 107, 54)');
    expect(parseFloat(c.stroke)).toBeGreaterThanOrEqual(3);
    // Wochenansicht im Plan: derselbe Haken
    await page.goto('/?go=plan');
    const pl = page.locator('.check.on').first();
    if (await pl.count()) expect(await pl.evaluate(el => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
  }
});
