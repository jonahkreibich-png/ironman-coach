/* Auftrag 5 C: Nichts darf aus dem Bildschirm ragen. Jeder Bildschirm (automatisch aus web/src/main.ts gelesen, neue laufen mit)
   in jedem Zustand (leer, normal, sehr voll mit langen Texten, Fehler) wird auf 320, 375, 390 und 430 px sowie mit 130 % Zoom
   (390 px / 1,3 = 300 px CSS-Breite) in WebKit geprüft, hell und dunkel, dazu geöffnete Sheets.
   Regeln: die Seite scrollt nie seitlich, kein sichtbares Element ragt über den Rand. Tabellen und Diagramme dürfen nur in ihrem
   eigenen Kasten scrollen (der Kasten selbst muss passen). */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
// @ts-ignore – reines JS ohne Typen
import { makeDemo } from '../../fixtures/demo.mjs';
import { TODAY } from './helpers';

const MAIN = fs.readFileSync('web/src/main.ts', 'utf8');
const TABS = [...MAIN.matchAll(/\{ id: '(\w+)', icon: '\w+', render: /g)].map(m => m[1]);
const SUBS = [...(/const SUBS: Record<string, \(\) => string> = \{([\s\S]*?)\n\};/.exec(MAIN) || ['', ''])[1].matchAll(/(\w+): /g)].map(m => m[1]);
const WIDTHS: [string, number][] = [['320', 320], ['375', 375], ['390', 390], ['430', 430], ['zoom130', 300]];
const LONG = 'Donaudampfschifffahrtsgesellschaftskapitänsmützenhalterung';

test.skip(({ browserName }) => browserName !== 'webkit', 'Layout wird in WebKit (iPhone) geprüft');

test('Bildschirme werden aus dem Code gefunden', () => {
  expect(TABS).toEqual(['heute', 'plan', 'coach', 'fortschritt', 'mehr']);
  expect(SUBS.length).toBeGreaterThanOrEqual(11);
});

type State = 'leer' | 'normal' | 'voll' | 'fehler';
function data(state: State) {
  const demo = makeDemo(TODAY);
  if (state === 'voll') {
    demo.profile = { ...(demo.profile || {}), name: 'Maximilian-Alexander von Hohenzollern-Sigmaringen', sports: ['swim', 'bike', 'run', 'strength', 'football'], teamSport: { name: 'Fußball ' + LONG, trainingDays: [1, 5], trainingMinutes: 90, gameDays: [6], gameMinutes: 90 },
      notes: [`${LONG} ${LONG}`, 'kann mittwochs nicht laufen, nur Samstag oder Sonntag', 'Schwimmbad nur Di, Mi und So', 'Urlaub vom 20.12. bis 6.1.', 'https://sehr-lange-adresse.example.com/pfad/zu/einer/datei/die/niemand/umbrechen/will'] };
    demo.goals = { g1: { id: 'g1', type: 'tri_long', name: 'Langdistanz ' + LONG, date: '2027-07-18', priority: 'A' }, g2: { id: 'g2', type: 'run_half', name: 'Halbmarathon am Bodensee mit sehr langem Namen', date: '2026-11-22', priority: 'B', targetTimeSec: 6300 } };
    const msgs: any = {};
    for (let i = 0; i < 30; i++) msgs['m' + i] = { id: 'm' + i, at: Date.parse(TODAY + 'T06:00:00Z') - i * 3600e3, date: TODAY, kind: i % 3 ? 'answer' : 'adjust', from: i % 2 ? 'coach' : 'user', title: i % 2 ? 'Plan angepasst: ' + LONG : undefined, text: `${LONG} ${'Wort '.repeat(30)} https://example.com/${LONG}`, actions: i === 1 ? [{ label: 'Ja, ' + LONG, kind: 'say', payload: 'x' }] : [] };
    demo.coachMsgs = msgs;
  }
  return demo;
}
async function prepare(page: Page, state: State, dark: boolean) {
  const demo = data(state);
  const plan = demo.plan; const st: any = { ...demo }; delete st.plan;
  await page.addInitScript(([p, s, empty, err]) => {
    if (sessionStorage.getItem('__keep')) return;
    localStorage.clear();
    localStorage.setItem('ec_ui', JSON.stringify({ seenRelease: '9.9.9' }));
    if (!empty) { localStorage.setItem('ec_plan', p as string); localStorage.setItem('ec_state_v2', s as string); }
    if (err) { localStorage.setItem('ec_sync_auth', JSON.stringify({ token: 'ungueltig', deviceId: 'dev-x', userId: 2 })); localStorage.setItem('ec_err_log', JSON.stringify([{ msg: 'TypeError: ' + 'x'.repeat(200), where: 'plan.ts:1', at: 1 }])); }
  }, [JSON.stringify(plan), JSON.stringify(st), state === 'leer', state === 'fehler']);
  await page.clock.setFixedTime(new Date(`${TODAY}T07:30:00+02:00`));
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
}
/* Was ragt heraus? Elemente in einem eigenen Scroll-Kasten zählen nicht, der Kasten selbst schon. */
async function overflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const out: string[] = [];
    const desc = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}${(el as HTMLElement).dataset && (el as HTMLElement).dataset.act ? `[${(el as HTMLElement).dataset.act}]` : ''} „${(el.textContent || '').trim().slice(0, 40)}“`;
    if (document.documentElement.scrollWidth > W + 1) out.push(`Seite scrollt seitlich (${document.documentElement.scrollWidth} > ${W})`);
    const scroller = (el: Element) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll') return p; } return null; };
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden]') || el.closest('[aria-hidden="true"]') && el.tagName !== 'svg') continue;
      const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
      if (cs.position === 'fixed' && (r.top > window.innerHeight || r.bottom < 0)) continue;
      if (scroller(el)) continue;
      if (r.right > W + 1 || r.left < -1) out.push(`${desc(el)} ragt heraus (${Math.round(r.left)}..${Math.round(r.right)} bei ${W})`);
      // Text, der abgeschnitten wird, ohne „…“
      if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== 'ellipsis' && el.children.length === 0 && (el.textContent || '').trim()) out.push(`${desc(el)} schneidet Text ab`);
    }
    return [...new Set(out)].slice(0, 15);
  });
}
const SCREENS = (state: State) => state === 'leer' ? ['/', '/?go=onboarding', '/?go=daten', '/?go=verbindungen', '/?go=feedback', '/?invite=ABCDEFGH', '#intro'] : [...TABS.map(x => '/?go=' + x), ...SUBS.map(x => '/?go=' + x)];

for (const [wname, w] of WIDTHS) {
  for (const dark of [false, true]) {
    for (const state of ['leer', 'normal', 'voll', 'fehler'] as State[]) {
      if (dark && state === 'fehler') continue;
      test(`${wname} px, ${dark ? 'dunkel' : 'hell'}, ${state}`, async ({ page }) => {
        test.setTimeout(120000);
        await page.setViewportSize({ width: w, height: 760 });
        await prepare(page, state, dark);
        const problems: string[] = [];
        for (const url of SCREENS(state)) {
          if (url === '#intro') {
            // Begrüßung neuer Tester mit Wiederherstellungscode, alle 3 Seiten
            await page.evaluate(() => { sessionStorage.setItem('__keep', '1'); localStorage.removeItem('ec_invite'); localStorage.setItem('ec_intro', '1'); localStorage.setItem('ec_rc_show', 'ABCD-EFGH-JKLM-NPQR'); });
            await page.goto('/');
            for (let i = 1; i <= 3; i++) { await expect(page.locator(`[data-intro="${i}"]`)).toBeVisible(); (await overflow(page)).forEach(p => problems.push(`Begrüßung ${i}: ${p}`)); if (i < 3) await page.locator('[data-act="intro-next"]').click(); }
            continue;
          }
          await page.goto(url);
          await expect(page.locator('#app')).not.toBeEmpty();
          await page.waitForTimeout(60);
          (await overflow(page)).forEach(p => problems.push(`${url}: ${p}`));
          // Fragebogen: alle Blöcke und die Zusammenfassung
          if (url.endsWith('onboarding')) {
            for (let i = 1; i < 9; i++) { const b = page.locator(`[data-act="ob-jump"][data-i="${i}"]`); if (!(await b.count())) break; await b.click(); (await overflow(page)).forEach(p => problems.push(`${url} Block ${i + 1}: ${p}`)); }
          }
          // Sheets: Einheit, Werte eintragen, Coach-Notizen, Plan bearbeiten
          if (state !== 'leer') {
            const sheets: [string, string][] = url.endsWith('=heute') ? [['[data-act="checkin-open"]', 'Werte'], ['[data-act="sess-open"]', 'Einheit']] : url.endsWith('=coach') ? [['[data-act="notes-open"]', 'Notizen']] : url.endsWith('=plan') ? [['[data-act="sess-open"]', 'Einheit']] : [];
            for (const [sel, name] of sheets) {
              const b = page.locator(sel).first(); if (!(await b.count())) continue;
              await b.click(); await page.waitForTimeout(60);
              (await overflow(page)).forEach(p => problems.push(`${url} Sheet ${name}: ${p}`));
              await page.keyboard.press('Escape');
            }
          }
        }
        expect(problems).toEqual([]);
      });
    }
  }
}

/* Wörter in Tab-Leiste und Knöpfen dürfen nicht mitten im Wort getrennt werden */
for (const [wname, w] of WIDTHS) test(`${wname} px: Tab-Beschriftungen einzeilig`, async ({ page }) => {
  await page.setViewportSize({ width: w, height: 760 });
  await prepare(page, 'normal', false);
  await page.goto('/?go=heute');
  const lines = await page.locator('.tab span').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight || '14'))));
  lines.forEach(n => expect(n).toBeLessThanOrEqual(1));
  const cut = await page.locator('.tab span').evaluateAll(els => els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
  expect(cut).toEqual([]);
});
