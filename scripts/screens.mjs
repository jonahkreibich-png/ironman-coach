// Screenshots der neuen Oberfläche (390 px, hell und dunkel) mit erfundenen Demo-Daten, dazu Kennzahlen je Bildschirm.
// Voraussetzung: npm run build und ein laufender Test-Server (node scripts/test-server.mjs 4180).
// Aufruf: node scripts/screens.mjs [ausgabeordner]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { makeDemo } from '../fixtures/demo.mjs';

const out = process.argv[2] || 'docs/design/nachher';
const BASE = 'http://localhost:4180';
const TODAY = '2026-10-14';
fs.mkdirSync(out, { recursive: true });
const demo = makeDemo(TODAY);
const plan = demo.plan; const state = { ...demo }; delete state.plan;

const SCREENS = [
  ['heute', '/?go=heute'], ['heute-feed', '/?go=heute', { heuteVariant: 'feed' }], ['plan', '/?go=plan'], ['coach', '/?go=coach'],
  ['fortschritt', '/?go=fortschritt'], ['mehr', '/?go=mehr'], ['werte', '/?go=werte'], ['essen', '/?go=essen'],
  ['einstellungen', '/?go=einstellungen'], ['onboarding', '/?go=onboarding'], ['start', '/', null, true]
];
const browser = await chromium.launch();
const report = {};
for (const theme of ['light', 'dark']) {
  for (const [name, url, ui, noPlan] of SCREENS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: theme, locale: 'de-DE', timezoneId: 'Europe/Berlin', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date(`${TODAY}T07:30:00+02:00`));
    await page.addInitScript(([p, s, u, np]) => {
      localStorage.clear();
      if (!np) { localStorage.setItem('ec_plan', p); localStorage.setItem('ec_state_v2', s); }
      if (u) localStorage.setItem('ec_ui', u);
    }, [JSON.stringify(plan), JSON.stringify(state), ui ? JSON.stringify(ui) : '', !!noPlan]);
    await page.goto(BASE + url);
    await page.waitForSelector('#app > *');
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(out, `neu-${name}-${theme}.png`), fullPage: false });
    if (theme === 'light') {
      report[name] = await page.evaluate(() => {
        const app = document.getElementById('app');
        return {
          height: Math.round(app.scrollHeight), cards: app.querySelectorAll('.card, .answer, .list').length,
          buttons: app.querySelectorAll('button').length, inputs: app.querySelectorAll('input, select, textarea').length,
          words: (app.innerText.match(/\S+/g) || []).length
        };
      });
    }
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(path.join(out, 'neu-bericht.json'), JSON.stringify({ today: TODAY, screens: report }, null, 2));
console.log(JSON.stringify(report, null, 1));
