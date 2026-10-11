// Bestandsaufnahme der alten App: Screenshots aller Bildschirme (390 px, hell/dunkel) und Tap-Zählung.
// Aufruf: node scripts/shots-legacy.mjs <ordner-der-alten-app> <ausgabe-ordner>
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { makeDemo } from '../fixtures/demo.mjs';

const appDir = process.argv[2], out = process.argv[3];
fs.mkdirSync(out, { recursive: true });
const TODAY = '2026-10-14';
const demo = makeDemo(TODAY);
const plan = demo.plan; const state = { ...demo }; delete state.plan;
const srv = spawn(process.execPath, ['scripts/static-server.mjs', appDir, '4181'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 700));

const browser = await chromium.launch();
async function ctx(scheme) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, serviceWorkers: 'block', timezoneId: 'Europe/Berlin', locale: 'de-DE' });
  await c.addInitScript(([p, s]) => { if (!localStorage.getItem('ironman_plan')) { localStorage.setItem('ironman_plan', p); localStorage.setItem('ironman_dashboard_v2', s); } }, [JSON.stringify(plan), JSON.stringify(state)]);
  const page = await c.newPage();
  await page.clock.setFixedTime(new Date(TODAY + 'T07:30:00+02:00'));
  return { c, page };
}
const views = ['heute', 'plan', 'werte', 'fortschritt', 'essen'];
const report = { screens: {}, taps: {} };
for (const scheme of ['light', 'dark']) {
  const { c, page } = await ctx(scheme);
  await page.goto('http://localhost:4181/');
  for (const v of views) {
    await page.click(`.tab[data-go="${v}"]`);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(out, `alt-${v}-${scheme}.png`), fullPage: true });
    if (scheme === 'light') report.screens[v] = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, panels: document.querySelectorAll('.panel').length, buttons: document.querySelectorAll('#app button').length, inputs: document.querySelectorAll('#app input, #app textarea, #app select').length, words: document.querySelector('#app').innerText.split(/\s+/).length }));
  }
  await page.click('[data-act="settings-open"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(out, `alt-einstellungen-${scheme}.png`), fullPage: true });
  if (scheme === 'light') report.screens.einstellungen = await page.evaluate(() => ({ height: document.querySelector('#sheetPanel').scrollHeight, words: document.querySelector('#sheetPanel').innerText.split(/\s+/).length }));
  await c.close();
}

// Tap-Zählung der 5 Alltagsaufgaben (kürzester Weg)
{
  const { c, page } = await ctx('light');
  await page.goto('http://localhost:4181/');
  let taps = 0; const tap = async sel => { taps++; await page.click(sel); await page.waitForTimeout(100); };
  // 1) Wie geht es mir heute? Ampel steht auf Heute oben
  report.taps.wieGehtEsMir = { taps: 0, note: 'Ampel oben auf Heute sichtbar' };
  // 2) Was steht morgen an? Tipp auf Morgen im Wochenstreifen → Plan mit geöffnetem Tag
  taps = 0; const tomorrow = '2026-10-15';
  await tap(`.tile-day[data-date="${tomorrow}"]`);
  report.taps.morgen = { taps, note: 'Wochenstreifen → Plan, Tag geöffnet' };
  // 3) Einheit korrigieren (gestrige Einheit: Minuten ändern)
  await page.click('.tab[data-go="heute"]'); taps = 0;
  await tap('.tab[data-go="plan"]');
  const y = '2026-10-13';
  await tap(`#day-${y} .day-h`);
  await tap(`#day-${y} details.mx summary`);
  await tap(`#day-${y} details.mx input[data-f="m.min"]`);
  report.taps.korrigieren = { taps, note: 'Plan → Tag öffnen → Daten aufklappen → Feld' };
  // 4) Bericht an den Coach schicken (Wochenbericht teilen)
  await page.click('.tab[data-go="heute"]'); taps = 0;
  await tap('.appbar [data-act="export-open"]');
  await tap('[data-act="export-mode"][data-mode="week"]');
  await tap('[data-act="export-copy"]');
  report.taps.bericht = { taps, note: 'Export → Wochenbericht → Kopieren, dann in Claude einfügen (+ App-Wechsel)' };
  await page.keyboard.press('Escape');
  // 5) Wie hat sich mein Schwimmen entwickelt?
  await page.click('.tab[data-go="heute"]'); taps = 0;
  await tap('.tab[data-go="fortschritt"]');
  report.taps.schwimmen = { taps, note: 'Fortschritt (Schwimmen ist vorausgewählt), dann scrollen' };
  await c.close();
}
await browser.close();
srv.kill();
fs.writeFileSync(path.join(out, 'alt-bericht.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
