// Screenshot eines Bildschirms mit Demo-Daten (390 px). Aufruf: node scripts/shot.mjs ausgabe.png "/?go=plan" [light|dark] [Selektor zum Hinscrollen|0] [voll 0/1] [ec_ui-JSON]
import { chromium } from '@playwright/test';
import { makeDemo } from '../fixtures/demo.mjs';
const [out, url, theme = 'light', scroll = '0', full = '0', extra = ''] = process.argv.slice(2);
const TODAY = '2026-10-14';
const demo = makeDemo(TODAY); const plan = demo.plan; const state = { ...demo }; delete state.plan;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: theme, locale: 'de-DE', timezoneId: 'Europe/Berlin', serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.clock.setFixedTime(new Date(`${TODAY}T07:30:00+02:00`));
await page.addInitScript(([p, s, x]) => { localStorage.clear(); localStorage.setItem('ec_plan', p); localStorage.setItem('ec_state_v2', s); localStorage.setItem('ec_ui', JSON.stringify({ seenRelease: '9.9.9', ...(x ? JSON.parse(x) : {}) })); }, [JSON.stringify(plan), JSON.stringify(state), extra]);
await page.goto('http://localhost:4180' + url);
await page.waitForSelector('#app > *'); await page.waitForTimeout(300);
if (scroll !== '0') { await page.evaluate(y => { const el = document.querySelector(y); if (el) el.scrollIntoView(); else window.scrollTo(0, +y); }, scroll); await page.waitForTimeout(150); }
await page.screenshot({ path: out, fullPage: full === '1' });
await b.close();
