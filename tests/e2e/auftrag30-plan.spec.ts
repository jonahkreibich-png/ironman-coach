/* Auftrag 30, Punkt 6: Übersicht mit Symbolen und Intensität.
   Kleine Icons an Einheiten und Tagen (⚡ hart, 🎯 Test, 🏁 Wettkampf, 🔗 Koppel, 🌙 Erholung, 🛠 Technik, ↔ lang, ✎ angepasst) – einheitlich im
   App-Stil (SVG, keine Emojis), Farbstreifen je Intensität, Tests als eigene Karte mit Ablauf und „frisch sein“, Zeile oben je Woche,
   Legende im Lexikon. Layout hell/dunkel, große Schrift, 320–430 px. */
import { test, expect } from './storage-harness';
import { type Page } from '@playwright/test';
import fs from 'node:fs';
import { seed, open, TODAY } from './helpers';

async function seedPlan(page: Page, font = 0) {
  await seed(page, { extra: (d: any) => {
    const days = d.plan.weeks.flatMap((w: any) => w.days);
    const day = days.find((x: any) => x.date === TODAY);
    day.sessions = day.sessions.filter((s: any) => s.sport !== 'rest');
    day.sessions.push({ id: 'p30-test', sport: 'run', title: 'Lauftest 30 min', plannedMinutes: 50, hard: true, spec: { sport: 'run', kind: 'test', title: 'Lauftest 30 min', steps: [{ part: 'warm', min: 15, zone: 1 }, { part: 'main', min: 30, zone: 4 }, { part: 'cool', min: 5, zone: 1 }] } });
    day.sessions.push({ id: 'p30-brick', sport: 'bike', title: 'Lange Ausfahrt 2 h + Koppellauf 15 min', plannedMinutes: 135 });
  } });
  if (font) await page.addInitScript(px => { const set = () => { document.documentElement.style.fontSize = px + 'px'; }; if (document.documentElement) set(); document.addEventListener('DOMContentLoaded', set); }, font);
}

test('Symbole, Farbstreifen, Test-Karte, Wochenzeile und Legende', async ({ page }) => {
  await seedPlan(page);
  await open(page, '/?go=plan');
  // Zeile oben in der Woche: „… harte Einheit(en) · 1 Test · x,y h“
  await expect(page.locator('[data-week-line]')).toHaveText(/^(keine harte Einheit|\d+ harte Einheit(en)?) · 1 Test · \d+(,\d)? h$/);
  if (!(await page.locator('[data-test-card]').count())) await page.locator(`.cday-h[data-date="${TODAY}"]`).click();
  // Test als eigene Karte mit Ablauf und „frisch sein“
  const card = page.locator('[data-test-card]');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Lauftest'); await expect(card).toContainText('Ablauf'); await expect(card).toContainText('Frisch sein');
  // Symbole als SVG-Icons (kein Emoji), mit Beschriftung für Screenreader
  const row = (sid: string) => page.locator(`.pr:has([data-sid="${sid}"])`);
  await expect(row('p30-test').locator('[data-mark="test"] svg')).toHaveCount(1);
  await expect(row('p30-brick').locator('[data-mark="brick"]')).toHaveAttribute('aria-label', 'Koppel');
  await expect(row('p30-brick').locator('[data-mark="long"]')).toHaveCount(1);
  expect(await page.locator('.pr-marks').evaluateAll(els => els.map(e => e.textContent || '').join(''))).not.toMatch(/\p{Extended_Pictographic}/u);
  // Farbstreifen je Intensität
  await expect(row('p30-test')).toHaveAttribute('data-band', 'hard');
  await expect(row('p30-brick')).toHaveAttribute('data-band', 'moderate');
  const stripe = await row('p30-test').evaluate(e => getComputedStyle(e, '::before').backgroundColor);
  expect(stripe).not.toBe('rgba(0, 0, 0, 0)');
  // Tageskopf zeigt die wichtigsten Symbole
  await expect(page.locator(`#day-${TODAY} .cday-m [data-mark="test"]`)).toHaveCount(1);
  // Legende im Lexikon: alle Symbole und die drei Streifen
  await open(page, '/?go=lexikon');
  await page.locator('[data-legend] summary').click();
  for (const k of ['hard', 'test', 'race', 'brick', 'recovery', 'technique', 'long', 'adjusted']) await expect(page.locator(`[data-legend-mark="${k}"] svg`)).toHaveCount(1);
  await expect(page.locator('[data-legend-band]')).toHaveCount(3);
});

/* Layout: hell/dunkel, normale und große Schrift, 320–430 px – nichts ragt heraus, nichts wird abgeschnitten */
async function overflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth; const out: string[] = [];
    const desc = (el: Element) => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className || '').split(/\s+/).slice(0, 2).join('.')} „${(el.textContent || '').trim().slice(0, 30)}“`;
    if (document.documentElement.scrollWidth > W + 1) out.push('Seite scrollt seitlich');
    for (const el of Array.from(document.querySelectorAll('.plan-c *'))) {
      const cs = getComputedStyle(el); if (cs.display === 'none' || el.closest('[hidden]')) continue;
      const r = el.getBoundingClientRect(); if (r.width < 1) continue;
      let p = el.parentElement, scroll = false; for (; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') { scroll = true; break; } } if (scroll) continue;
      if (r.right > W + 1 || r.left < -1) out.push(desc(el) + ' ragt heraus');
      const card = el.parentElement && el.parentElement.closest('.card, .pr-testcard');
      if (card && cs.position !== 'absolute') { const c = card.getBoundingClientRect(); if (r.right > c.right + 2 || r.left < c.left - 2) out.push(desc(el) + ' ragt aus seinem Feld'); }
    }
    return [...new Set(out)].slice(0, 10);
  });
}
for (const w of [320, 390, 430]) for (const dark of [false, true]) for (const font of [16, 28]) {
  test(`Plan-Übersicht passt: ${w} px, ${dark ? 'dunkel' : 'hell'}, Schrift ${font} px`, async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'Layout in WebKit (iPhone)');
    await page.setViewportSize({ width: w, height: 800 });
    await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
    await seedPlan(page, font);
    await open(page, '/?go=plan');
    if (!(await page.locator('[data-test-card]').count())) await page.locator(`.cday-h[data-date="${TODAY}"]`).click();
    await expect(page.locator('[data-test-card]')).toBeVisible();
    expect(await overflow(page)).toEqual([]);
    if (w === 390 && font === 16) { fs.mkdirSync('docs/previews', { recursive: true }); await page.locator('.plan-c').screenshot({ path: `docs/previews/plan-auftrag30-${dark ? 'dunkel' : 'hell'}.png` }); }
  });
}
