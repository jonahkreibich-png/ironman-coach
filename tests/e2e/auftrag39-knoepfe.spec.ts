/* Auftrag 39, Fehlersuche: jeden sichtbaren Knopf jedes Bildschirms einmal drücken (Demo-Nutzer mit Uhr-Daten und ein Nutzer mit wenig
   Daten). Nach jedem Klick: keine Fehler/Abstürze, keine kaputten Texte, kein seitlicher Überlauf. Knöpfe, die Daten endgültig löschen,
   Konten/Verbindungen/Push/Sync ändern oder Dateien laden, werden ausgelassen (eigene Tests). */
import { test, expect } from './storage-harness';
import { type Page } from '@playwright/test';
import { seed } from './helpers';

const SCREENS = ['heute', 'plan', 'coach', 'fortschritt', 'mehr', 'profil', 'werte', 'zonen', 'ausruestung', 'coachset', 'mitteilungen', 'beruecksichtigungen', 'einstellungen', 'essen', 'vorlagen', 'strength', 'lexikon'];
const SKIP = /del|delete|remove|reset|logout|abmelden|acc-|sync|push|conn-|backup|export|import|file|fb-send|invite|ob-apply|stage-apply|stage-confirm|restore|wipe|clear|ill-start|inj|lang|sprache|install|update|reload|tab-|go-tab|nav|back|sheet-close|sub-close|theme|set-theme|demo|welcome|copy|share|link|mail/i;
const BAD = /\bNaN\b|\bundefined\b|\bnull\b|\bInfinity\b|\[object |\d,0 (?:min|Minuten)\b/;

async function go(page: Page, sc: string) { for (let i = 0; i < 3; i++) { try { await page.goto('/?go=' + sc); break; } catch (e) { await page.waitForTimeout(400); } } await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'ready', { timeout: 15000 }); }
async function check(page: Page, where: string, found: string[]) {
  const r = await page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const t = ['#app', '#sheetPanel', '#subPanel'].map(s => { const e = document.querySelector(s) as HTMLElement | null; return e && e.offsetParent !== null ? e.innerText : ''; }).join('\n');
    return { over: document.documentElement.scrollWidth > W + 1, failed: document.querySelector('[data-failed]')?.getAttribute('data-failed') || null, t };
  });
  if (r.over) found.push(`${where}: seitlicher Überlauf`);
  if (r.failed) found.push(`${where}: Bereich ${r.failed} konnte nicht geladen werden`);
  const m = BAD.exec(r.t); if (m) found.push(`${where}: „${m[0]}“ …${r.t.slice(Math.max(0, m.index - 40), m.index + 30).replace(/\s+/g, ' ')}…`);
}

for (const who of ['demo', 'frisch'] as const) {
  test(`Knöpfe: jeder sichtbare Knopf auf jedem Bildschirm (${who === 'demo' ? 'Demo mit Uhr-Daten' : 'wenig Daten'})`, async ({ page, browserName }) => {
    // WebKit: der Rundgang (auftrag39-rundgang) deckt die Bildschirme ab; 650 Klicks dauern in WebKit unter Last über 10 min
    test.skip(browserName === 'webkit', 'Knopf-Roboter nur Chromium');
    test.setTimeout(600000);
    const errors: string[] = []; const found: string[] = [];
    page.on('pageerror', e => errors.push('Fehler: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|ERR_CONNECTION|404|status of 40[0-9]/i.test(m.text())) errors.push('Konsole: ' + m.text().slice(0, 160)); });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    await seed(page, who === 'frisch' ? { extra: (d: any) => { d.sessions = {}; d.activities = {}; d.trend = []; d.customWorkouts = {}; } } : {});
    let clicks = 0;
    for (const sc of SCREENS) {
      await go(page, sc);
      const acts = await page.evaluate((skip) => [...new Set([...document.querySelectorAll('#app [data-act]')].filter(e => (e as HTMLElement).offsetParent !== null && !(e as HTMLButtonElement).disabled)
        .map(e => (e as HTMLElement).dataset.act + '|' + Object.entries((e as HTMLElement).dataset).filter(([k]) => k !== 'act').map(([k, v]) => k + '=' + v).join('&')))].filter(a => !new RegExp(skip, 'i').test(a.split('|')[0])).slice(0, 25), SKIP.source);
      for (const a of acts) {
        const [act, rest] = a.split('|'); const sel = `#app [data-act="${act}"]` + (rest ? rest.split('&').filter(Boolean).slice(0, 2).map(kv => { const [k, v] = kv.split('='); return `[data-${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${(v || '').replace(/"/g, '\\"')}"]`; }).join('') : '');
        const el = page.locator(sel).first();
        if (!(await el.count()) || !(await el.isVisible().catch(() => false))) continue;
        const nErr = errors.length;
        await el.click({ timeout: 3000 }).catch(() => {});
        clicks++;
        await page.waitForTimeout(120);
        await check(page, `${sc} → ${act}`, found);
        if (errors.length > nErr) found.push(`${sc} → ${act}: ${errors.slice(nErr).join(' / ')}`);
        // im geöffneten Fenster jeden Knopf einmal (Fenster jeweils neu öffnen)
        if (await page.locator('#sheet:not([hidden])').count()) {
          const inner = await page.evaluate((skip) => [...new Set([...document.querySelectorAll('#sheetPanel [data-act]')].filter(e => (e as HTMLElement).offsetParent !== null && !(e as HTMLButtonElement).disabled)
            .map(e => (e as HTMLElement).dataset.act!))].filter(x => !new RegExp(skip, 'i').test(x)).slice(0, 12), SKIP.source);
          for (const ia of inner) {
            if (!(await page.locator('#sheet:not([hidden])').count())) { await go(page, sc); const again = page.locator(sel).first(); if (!(await again.count())) break; await again.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(100); }
            const b = page.locator(`#sheetPanel [data-act="${ia}"]`).first();
            if (!(await b.count()) || !(await b.isVisible().catch(() => false))) continue;
            const n2 = errors.length;
            await b.click({ timeout: 3000 }).catch(() => {}); clicks++;
            await page.waitForTimeout(120);
            await check(page, `${sc} → ${act} → ${ia}`, found);
            if (errors.length > n2) found.push(`${sc} → ${act} → ${ia}: ${errors.slice(n2).join(' / ')}`);
            if (await page.locator('#sub:not([hidden])').count()) await page.keyboard.press('Escape');
          }
        }
        // Fenster schließen, zurück zum Bildschirm
        for (let i = 0; i < 2; i++) if (await page.locator('#sub:not([hidden]), #sheet:not([hidden])').count()) await page.keyboard.press('Escape');
        if (!page.url().includes('go=' + sc)) await go(page, sc);
      }
    }
    console.log('KLICKS', clicks);
    expect(clicks).toBeGreaterThan(40);
    expect([...new Set([...found, ...errors.map(e => 'allgemein: ' + e)])]).toEqual([]);
  });
}
