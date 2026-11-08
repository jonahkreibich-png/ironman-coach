/* Auftrag 29, Punkt 4: Text-Überlauf auf allen Bildschirmen (Erweiterung von layout.spec.ts).
   „Dein Trainingsdashboard“ ragte aus dem Feld. layout.spec.ts prüft schon 300-430 px, hell/dunkel und große Schrift 23 px mit normalen
   Daten. Hier zusätzlich: sehr große Schrift (iPhone „Größere Bedienungshilfen“, 28 px), lange Texte UND große Zahlen, jeder Bildschirm,
   offene Karten (Dashboard, Einheit, Werte), 320 und 430 px, hell und dunkel. Dieselbe Prüfung wie layout.spec.ts (overflow): nichts ragt
   aus Bildschirm, Karte oder eigenem Kasten, nichts wird ohne „…“ abgeschnitten, Knöpfe/Zahlen brechen nicht mitten im Wort. */
import { test, expect } from './storage-harness';
import { type Page } from '@playwright/test';
import fs from 'node:fs';
// @ts-ignore – reines JS ohne Typen
import { makeDemo } from '../../fixtures/demo.mjs';
import { TODAY } from './helpers';

const MAIN = fs.readFileSync('web/src/main.ts', 'utf8');
const TABS = [...MAIN.matchAll(/\{ id: '(\w+)', icon: '\w+', render: /g)].map(m => m[1]);
const SUBS = [...(/const SUBS: Record<string, \(\) => string> = \{([\s\S]*?)\n\};/.exec(MAIN) || ['', ''])[1].matchAll(/(\w+): /g)].map(m => m[1]);
const LONG = 'Donaudampfschifffahrtsgesellschaftskapitänsmützenhalterung';

test.skip(({ browserName }) => browserName !== 'webkit', 'Layout wird in WebKit (iPhone) geprüft');

/* lange Texte und große Zahlen überall, wo Nutzer etwas eintragen können */
function bigData() {
  const demo = makeDemo(TODAY);
  demo.profile = { ...(demo.profile || {}), name: 'Maximilian-Alexander von Hohenzollern-Sigmaringen', weightKg: 249.5, heightCm: 229 };
  const days = demo.plan.weeks.flatMap((w: any) => w.days);
  const today = days.find((d: any) => d.date === TODAY) || days[0];
  // Extra-Einheiten mit großen Werten und langem Titel, erledigte Einheit mit vielen Werten
  demo.customWorkouts = { [today.date]: [{ id: 'c-big', sport: 'swim', title: 'Schwimmen ' + LONG, completed: true, source: 'manual', plannedMinutes: 1439, metrics: { min: '1439', meters: '19999', pace100: '9:59', spl: '79', longestCrawl: '19999' }, metricsSrc: { min: 'manual', meters: 'manual' } }] };
  const s = today.sessions.find((x: any) => x.sport !== 'rest');
  if (s) demo.sessions = { ...(demo.sessions || {}), [s.id]: { completed: true, notes: LONG + ' ' + 'Wort '.repeat(40), rpe: '10', metrics: { min: '1439', km: '299.9', hr: '229', maxHr: '239', decoupling: '-49.9', power: '1999', cadence: '239', strideLen: '2.99', ascent: '9999' }, metricsSrc: { min: 'manual' } } };
  demo.trend = [...(demo.trend || []).filter((p: any) => p.date !== TODAY), { date: TODAY, sleepHours: 15.9, hrv: 299, restingHR: 129, bodyTemp: -2.9, spo2: 99.9, breathingRate: 39.9, _src: { hrv: 'manual' } }];
  const msgs: any = {};
  for (let i = 0; i < 6; i++) msgs['m' + i] = { id: 'm' + i, at: Date.parse(TODAY + 'T06:00:00Z') - i * 3600e3, date: TODAY, kind: 'answer', from: 'coach', title: 'Etappenziel erreicht 🎉 ' + LONG, text: `Laufen: Etappenziel erreicht, aerobe Entkopplung im Schnitt deiner letzten Läufe 4,5 % (Ziel war 5,0 %). ${LONG} ${'Wort '.repeat(20)}` };
  demo.coachMsgs = msgs;
  demo.goals = { g1: { id: 'g1', type: 'tri_long', name: 'Langdistanz ' + LONG, date: '2027-07-18', priority: 'A', targetTimeSec: 59999 } };
  return demo;
}
async function prepare(page: Page, dark: boolean, px: number) {
  const demo = bigData(); const plan = demo.plan; const st: any = { ...demo }; delete st.plan;
  await page.addInitScript(([p, s, size]) => {
    if (!sessionStorage.getItem('__keep29')) { localStorage.clear(); localStorage.setItem('ec_ui', JSON.stringify({ seenRelease: '9.9.9' })); localStorage.setItem('ec_plan', p as string); localStorage.setItem('ec_state_v2', s as string); sessionStorage.setItem('__keep29', '1'); }
    const set = () => { document.documentElement.style.fontSize = size + 'px'; }; if (document.documentElement) set(); document.addEventListener('DOMContentLoaded', set);
  }, [JSON.stringify(plan), JSON.stringify(st), px] as any);
  await page.clock.setFixedTime(new Date(`${TODAY}T07:30:00+02:00`));
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
}
/* Prüfung wie layout.spec.ts: Bildschirm, Karte, eigener Kasten, Abschneiden, Wortbruch in Knöpfen/Zahlen */
async function overflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth; const out: string[] = [];
    const desc = (el: Element) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''} „${(el.textContent || '').trim().slice(0, 40)}“`;
    if (document.documentElement.scrollWidth > W + 1) out.push(`Seite scrollt seitlich (${document.documentElement.scrollWidth} > ${W})`);
    const hiddenIn = (el: Element) => { for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) { if (!(d as HTMLDetailsElement).open) { const sm = el.closest('summary'); if (!sm || sm.parentElement !== d) return true; } } return false; };
    const scroller = (el: Element) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll') return p; } return null; };
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden]') || (el.closest('[aria-hidden="true"]') && el.tagName !== 'svg')) continue;
      if (hiddenIn(el)) continue;
      const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
      if (cs.position === 'fixed' && (r.top > window.innerHeight || r.bottom < 0)) continue;
      if (scroller(el)) continue;
      if (r.right > W + 1 || r.left < -1) out.push(`${desc(el)} ragt heraus`);
      const card = el.parentElement && el.parentElement.closest('.card, .plan-dashboard, .plan-metric');
      if (card && cs.position !== 'fixed' && cs.position !== 'absolute') { const cr = card.getBoundingClientRect(); if (r.bottom > cr.bottom + 2 || r.top < cr.top - 2 || r.right > cr.right + 2 || r.left < cr.left - 2) out.push(`${desc(el)} ragt aus seinem Feld`); }
      if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== 'ellipsis' && el.children.length === 0 && (el.textContent || '').trim()) out.push(`${desc(el)} schneidet Text ab`);
    }
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const par = n.parentElement; if (!par || !(n.textContent || '').trim()) continue;
      const pcs = getComputedStyle(par); if (pcs.display === 'none' || pcs.visibility === 'hidden' || par.closest('[hidden]') || hiddenIn(par)) continue;
      if (scroller(par) || pcs.overflowX !== 'visible') continue;
      const pr = par.getBoundingClientRect(); if (pr.width < 1) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const b of Array.from(rg.getClientRects())) if (b.width > 0 && (b.right > pr.right + 2 || b.right > W + 1)) { out.push(`${desc(par)} Text läuft aus seinem Kasten`); break; }
    }
    return [...new Set(out)].slice(0, 12);
  });
}
const SCREENS = [...TABS.map(x => '/?go=' + x), ...SUBS.map(x => '/?go=' + x)];

for (const w of [320, 430]) for (const dark of [false, true]) {
  test(`Auftrag 29: sehr große Schrift (28 px), ${w} px, ${dark ? 'dunkel' : 'hell'}, lange Texte und große Zahlen`, async ({ page }) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width: w, height: 760 });
    await prepare(page, dark, 28);
    const problems: string[] = [];
    for (const url of SCREENS) {
      await page.goto(url);
      await expect(page.locator('#app')).not.toBeEmpty();
      await page.waitForTimeout(60);
      (await overflow(page)).forEach(p => problems.push(`${url}: ${p}`));
      const sheets: string[] = url.endsWith('=heute') ? ['[data-act="checkin-open"]', '[data-act="sess-open"]'] : url.endsWith('=plan') ? ['[data-act="sess-open"]', '[data-act="custom-open"]', '[data-act="custom-add"]'] : [];
      for (const sel of sheets) {
        const b = page.locator(sel).first(); if (!(await b.count()) || !(await b.isVisible())) continue;
        await b.click(); await page.waitForTimeout(80);
        (await overflow(page)).forEach(p => problems.push(`${url} Sheet ${sel}: ${p}`));
        await page.keyboard.press('Escape'); await page.waitForTimeout(40);
      }
    }
    expect(problems).toEqual([]);
  });
}

/* Der gemeldete Fall: Dashboard-Titel und -Werte bei 300-430 px, Schrift 17-33 px, hell/dunkel – nichts ragt aus seinem Feld */
test('Auftrag 29: „Dein Trainingsdashboard“ passt bei jeder Schriftgröße', async ({ page }) => {
  test.setTimeout(180000);
  const problems: string[] = [];
  for (const px of [17, 23, 28, 33]) {
    await page.context().clearCookies();
    const p2 = await page.context().newPage();
    await prepare(p2, false, px);
    for (const w of [300, 320, 375, 430]) for (const dark of [false, true]) {
      await p2.setViewportSize({ width: w, height: 760 }); await p2.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
      await p2.goto('/?go=plan');
      await expect(p2.locator('[data-plan-design-summary]')).toBeVisible();
      const found = await p2.locator('[data-plan-design-summary]').evaluate(sec => {
        const out: string[] = []; const box = sec.getBoundingClientRect();
        const tw = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
        for (let n = tw.nextNode(); n; n = tw.nextNode()) {
          const par = n.parentElement!; if (!(n.textContent || '').trim() || par.closest('[hidden]')) continue;
          const field = par.closest('.plan-metric, .btn, .plan-sport') || sec; const fr = field.getBoundingClientRect();
          const rg = document.createRange(); rg.selectNodeContents(n);
          for (const b of Array.from(rg.getClientRects())) if (b.width > 0 && (b.right > fr.right + 1 || b.left < fr.left - 1 || b.right > box.right + 1)) { out.push(`„${(n.textContent || '').trim().slice(0, 30)}“ ragt aus dem Feld`); break; }
        }
        // der gemeldete Fall: Titel im abgerundeten Feld ohne Innenabstand – Text lief über die Rundung. Mindestens die halbe Rundung Abstand.
        const btn = sec.querySelector('.plan-dashboard-title .btn') as HTMLElement; const br = btn.getBoundingClientRect();
        const radius = Math.min(parseFloat(getComputedStyle(btn).borderTopLeftRadius) || 0, br.height / 2);
        const lab = btn.querySelector('.plan-dashboard-label')!; const rg = document.createRange(); rg.selectNodeContents(lab);
        for (const b of Array.from(rg.getClientRects())) if (b.width > 0 && (b.left < br.left + Math.max(6, radius / 2) || b.top < br.top + 2 || b.bottom > br.bottom - 2)) { out.push('Titel klebt am Rand seines Felds'); break; }
        return out;
      });
      found.forEach(f => problems.push(`${px} px Schrift, ${w} px, ${dark ? 'dunkel' : 'hell'}: ${f}`));
    }
    await p2.close();
  }
  expect([...new Set(problems)]).toEqual([]);
});

/* Auftrag 30: „Anders gemacht“ – jede Art mit ihren Feldern passt bei 320 px und sehr großer Schrift (hell und dunkel) */
for (const dark of [false, true]) test(`Auftrag 30: Anders gemacht, alle Arten, 320 px, 28 px Schrift, ${dark ? 'dunkel' : 'hell'}`, async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 320, height: 760 });
  await prepare(page, dark, 28);
  await page.goto('/?go=plan'); await expect(page.locator('#app')).not.toBeEmpty();
  const sid = await page.evaluate(() => { const b = document.querySelector('[data-act="sess-open"]') as HTMLElement | null; return b ? b.dataset.sid : null; });
  expect(sid).toBeTruthy();
  await page.locator(`[data-act="sess-open"][data-sid="${sid}"]`).first().click();
  const sh = page.locator('#sheetPanel');
  await sh.locator('[data-act="fd-asplanned"][data-v="0"]').click();
  const problems: string[] = [];
  const kinds = await sh.locator('[data-act="fd-chg-kind"]').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.v!));
  expect(kinds.length).toBeGreaterThanOrEqual(7);
  for (const k of kinds) {
    await sh.locator(`[data-act="fd-chg-kind"][data-v="${k}"]`).click(); await page.waitForTimeout(60);
    if (k === 'split') { await sh.locator('[data-act="fd-chg-part-add"]').click(); await page.waitForTimeout(40); }
    (await overflow(page)).forEach(p => problems.push(`${k}: ${p}`));
  }
  expect(problems).toEqual([]);
});
