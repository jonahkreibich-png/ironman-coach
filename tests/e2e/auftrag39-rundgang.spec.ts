/* Auftrag 39, Punkt 2: große Fehlersuche – die App ausprobieren wie verschiedene Nutzer (18 Testnutzer aus den 60 erfundenen
   Profilen: alle Sportarten, Ziele, Niveaus, Teamsport, krank, jung/alt, wenig Daten; dazu der Demo-Nutzer mit Uhr-Daten).
   Je Nutzer echte Aktionen: Heute, Plan (Einheiten öffnen, abhaken, Dauer eintippen, Ablauf-Teil öffnen, Rückgängig), Umwandeln mit
   Rückgängig, Coach-Frage und Folgefrage, Fortschritt (Score öffnen), alle Unterseiten von Mehr, neues Ziel, dunkel, große Schrift
   bei 320 px, Querformat und zurück, App-Wechsel. Geprüft: keine Fehler/Abstürze, keine kaputten Texte (NaN, undefined, null,
   [object …], negative Dauer), kein seitlicher Überlauf, kein „konnte nicht geladen werden“. */
import { test, expect } from './storage-harness';
import { type Page } from '@playwright/test';
import { manyUsers, MANY_TODAY } from '../../fixtures/manyusers';
import { simulate } from '../helpers/many-sim';
import { seed, TODAY } from './helpers';

const PICK = ['n02-fitness', 'n06-fitness', 'n08-fitness', 'n16-fitness', 'n20-run-5k', 'n22-run-half', 'n25-tri-sprint', 'n28-tri-long', 'n30-aquathlon',
  'n31-bike-event', 'n32-swim-goal', 'n37-tri-supersprint', 'n49-tri-long', 'n51-swim-goal', 'n53-fitness', 'n57-mama', 'n58-laeufer-6x', 'n60-team-tri'];
const USERS = manyUsers().filter(u => PICK.includes(u.id));
const SUBS = ['profil', 'werte', 'verbindungen', 'konto', 'daten', 'zonen', 'ausruestung', 'coachset', 'mitteilungen', 'beruecksichtigungen', 'einstellungen', 'essen', 'lexikon', 'vorlagen', 'strength'];
const BAD = /\bNaN\b|\bundefined\b|\bnull\b|\bInfinity\b|\[object |\{\{|(?<![\w-])-\d+ (?:min|km|m)\b|\bvon 0 (?:min|km)\b/;

async function problems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth; const out: string[] = [];
    if (document.documentElement.scrollWidth > W + 1) out.push(`Seite scrollt seitlich (${document.documentElement.scrollWidth} > ${W})`);
    if (document.querySelector('[data-failed]')) out.push('Bereich konnte nicht geladen werden: ' + document.querySelector('[data-failed]')!.getAttribute('data-failed'));
    return out;
  });
}
async function look(page: Page, where: string, found: string[]) {
  await page.waitForTimeout(60);
  (await problems(page)).forEach(p => found.push(`${where}: ${p}`));
  const t = await page.evaluate(() => [document.querySelector('#app'), document.querySelector('#sheetPanel'), document.querySelector('#subPanel')].map(e => (e && (e as HTMLElement).offsetParent !== null) ? (e as HTMLElement).innerText : '').join('\n'));
  const m = BAD.exec(t); if (m) found.push(`${where}: Text „${m[0]}“: …${t.slice(Math.max(0, m.index - 50), m.index + 40).replace(/\s+/g, ' ')}…`);
}
async function tryDo(found: string[], what: string, fn: () => Promise<void>) {
  try { await fn(); } catch (e: any) { found.push(`${what}: ${String(e && e.message || e).split('\n')[0].slice(0, 160)}`); }
}
const closeAll = async (page: Page) => { for (let i = 0; i < 3; i++) { if (await page.locator('#sub:not([hidden])').count() || await page.locator('#sheet:not([hidden])').count()) await page.keyboard.press('Escape'); } };

async function tour(page: Page, found: string[]) {
  await page.goto('/?go=heute'); await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'ready', { timeout: 15000 });
  await look(page, 'Heute', found);
  // Plan: Einheiten öffnen, abhaken, Dauer, Ablauf, Rückgängig
  await page.goto('/?go=plan'); await look(page, 'Plan', found);
  const n = Math.min(4, await page.locator('[data-act="sess-open"]').count());
  for (let i = 0; i < n; i++) await tryDo(found, `Einheit ${i + 1}`, async () => {
    await closeAll(page);
    await page.locator('[data-act="sess-open"]').nth(i).click();
    await expect(page.locator('#sheetPanel')).toBeVisible();
    await look(page, `Einheit ${i + 1}`, found);
    const tog = page.locator('#sheetPanel [data-act="sess-toggle"]').first();
    if (await tog.count() && i === 0) { await tog.click(); await look(page, `Einheit ${i + 1} abgehakt`, found); }
    const min = page.locator('#sheetPanel #fd-min');
    if (i === 0 && await min.count() && await min.isVisible()) { await min.click(); await min.fill(''); await min.pressSequentially('4530'); await min.blur(); await look(page, 'Dauer 45:30', found); }
    const part = page.locator('#sheetPanel .ablauf .ab-row, #sheetPanel .ablauf .ab-set-h, #sheetPanel .ablauf button[data-key^="sec:"]').first();
    if (await part.count() && await part.isVisible()) { await part.click(); await page.waitForTimeout(80); await look(page, `Einheit ${i + 1} Ablauf-Teil`, found); await page.keyboard.press('Escape'); }
    const undo = page.locator('#sheetPanel [data-act="undo-one"], #sheetPanel [data-act="ab-undo"]').first();
    if (await undo.count() && await undo.isVisible()) { await undo.click(); await look(page, `Einheit ${i + 1} Rückgängig`, found); }
    // Umwandeln (vor dem Training)
    const conv = page.locator('#sheetPanel [data-act="conv"]').first();
    if (i > 0 && await conv.count() && await conv.isVisible()) {
      await conv.click(); await page.waitForTimeout(100); await look(page, 'Umwandeln', found);
      const ap = page.locator('[data-act="conv-apply"]').first();
      if (await ap.count()) { await ap.click(); await page.waitForTimeout(100); await look(page, 'Umwandeln übernommen', found); const u = page.locator('#toast .toast-act').first(); if (await u.count()) await u.click(); }
    }
    await closeAll(page);
  });
  // Coach: Frage und Folgefrage
  await tryDo(found, 'Coach', async () => {
    await page.goto('/?go=coach'); await look(page, 'Coach', found);
    const inp = page.locator('#coach-in');
    if (await inp.count()) {
      for (const q of ['Wie war meine Woche?', 'Und was mache ich morgen?']) {
        await inp.fill(q); await page.locator('[data-act="coach-send"]').click();
        await expect(page.locator('.feed .msg.me, .feed .msg.user').last()).toContainText(q, { timeout: 10000 }).catch(() => {});
        const last = page.locator('.feed .msg.coach').last();
        await expect(last).not.toHaveClass(/typing/, { timeout: 15000 });
        await expect(last).toContainText(/\S/);
        if (process.env.SHOW_COACH) console.log('COACH', q, '→', (await last.innerText()).replace(/\s+/g, ' ').slice(0, 400));
        await look(page, 'Coach: ' + q, found);
      }
    }
  });
  // Fortschritt: Score öffnen
  await tryDo(found, 'Fortschritt', async () => {
    await page.goto('/?go=fortschritt'); await look(page, 'Fortschritt', found);
    const so = page.locator('[data-act="score-open"]').first(); if (await so.count()) { await so.click(); await page.waitForTimeout(100); await look(page, 'Score', found); await closeAll(page); }
  });
  // Unterseiten
  for (const sc of SUBS) await tryDo(found, sc, async () => { await page.goto('/?go=' + sc); await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'ready', { timeout: 15000 }); await look(page, sc, found); });
  // neues Ziel anlegen (Fenster)
  await tryDo(found, 'Ziel', async () => { await page.goto('/?go=profil'); const b = page.locator('[data-act="goal-new"]'); if (await b.count()) { await b.click(); await look(page, 'Neues Ziel', found); await closeAll(page); } });
  // dunkel, große Schrift bei 320 px, Querformat und zurück, App-Wechsel
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; });
  for (const sc of ['heute', 'plan', 'coach', 'fortschritt']) await tryDo(found, `${sc} groß/dunkel`, async () => { await page.goto('/?go=' + sc); await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; }); await look(page, `${sc} (320 px, 24 px Schrift, dunkel)`, found); });
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await page.setViewportSize({ width: 844, height: 390 }); await page.goto('/?go=plan'); await look(page, 'Plan quer', found);
  await page.setViewportSize({ width: 430, height: 900 }); await page.waitForTimeout(400); await look(page, 'Plan zurück hochkant', found);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
  await page.waitForTimeout(300); await look(page, 'nach App-Wechsel', found);
}

function watch(page: Page, errors: string[]) {
  page.on('pageerror', e => errors.push('Fehler: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|ERR_CONNECTION|404|status of 40[0-9]/i.test(m.text())) errors.push('Konsole: ' + m.text().slice(0, 160)); });
}

for (const u of USERS) {
  test(`Rundgang ${u.id}: ${u.label.slice(0, 60)}`, async ({ page, browserName }) => {
    test.skip(browserName === 'webkit' && USERS.indexOf(u) % 3 !== 0, 'WebKit: jeder dritte Nutzer');
    test.setTimeout(180000);
    const sim = simulate(u, MANY_TODAY);
    expect(sim.plan, 'Plan für ' + u.id).toBeTruthy();
    const st: any = { ...sim.state, profile: { ...sim.profile, updatedAt: 1 }, goals: Object.fromEntries(sim.goals.map((g: any) => [g.id, g])), settings: { ...(sim.state.settings || {}), planRules15: 'x' } };
    const errors: string[] = []; watch(page, errors);
    await page.addInitScript(([p, s]) => {
      if (sessionStorage.getItem('__m')) return;
      localStorage.clear(); localStorage.setItem('ec_ui', JSON.stringify({ seenRelease: '9.9.9' }));
      localStorage.setItem('ec_plan', p as string); localStorage.setItem('ec_state_v2', s as string); sessionStorage.setItem('__m', '1');
    }, [JSON.stringify(sim.plan), JSON.stringify(st)]);
    await page.clock.setFixedTime(new Date(`${sim.today}T07:30:00+01:00`));
    const found: string[] = [];
    await tour(page, found);
    expect([...new Set([...errors, ...found])]).toEqual([]);
  });
}

test('Rundgang Demo-Nutzer mit Uhr-Daten (viele Daten)', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = []; watch(page, errors);
  await seed(page); void TODAY;
  const found: string[] = [];
  await tour(page, found);
  expect([...new Set([...errors, ...found])]).toEqual([]);
});
