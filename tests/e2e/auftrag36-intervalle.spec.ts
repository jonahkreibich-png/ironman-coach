/* Auftrag 36/37, Punkt 1: Intervalle nach dem Training bearbeiten – wie ein Mensch, per Klick und Eingabe.
   Auftrag 37: Sätze und Wiederholungen stehen im Ablauf; Antippen öffnet ein Fenster nur für diesen Teil.
   Schwimmen: Sätze gruppiert, „ganzer Satz gleich“, Pull Buoy für den Satz, eigener Titel, eine Wiederholung abweichend, neu laden,
   gespeicherter Wert = Anzeige = Coach-Kontext (Kraul am Stück, Pull Buoy, Coach-Text „mit Pull Buoy“), ungültige Eingabe, Satz
   hinzufügen/verschieben/löschen. Laufen: Art „bergauf“ und Untergrund für den Satz. Überlauf: 320 px und große Schrift. */
import { test, expect } from './storage-harness';
import { type Page } from '@playwright/test';
import { seed, open, openPlanSession, stored, TODAY, narrowText } from './helpers';
import * as W from '../../shared/workouts';
import { doneItems, valsOf, ivEvalOf } from '../../shared/coach/review';
import { ivDiffNotes } from '../../shared/intervals';

const CTX: W.PaceCtx = { runThrSec: 300, lthrRun: 170, lthrBike: 160, css: 120, breast100: 165, pool: 25, gear: ['buoy', 'board'] };
const SWIM = W.build(W.swimSession(CTX, 'css', [{ part: 'main', reps: 4, m: 100, zone: 3, mode: 'crawl', restSec: 20 }, { part: 'main', reps: 4, m: 50, zone: 3, mode: 'pull', restSec: 20 }], 200, 100));
const RUN = W.build(W.runIntervals(CTX, 5, 4, 2, 4));

async function seedIv(page: Page) {
  await seed(page, { extra: (d: any) => {
    const day = d.plan.weeks.flatMap((w: any) => w.days).find((x: any) => x.date === TODAY);
    day.sessions.push({ id: 'iv-swim', sport: 'swim', ...SWIM }, { id: 'iv-run', sport: 'run', ...RUN });
    d.sessions = { ...(d.sessions || {}), 'iv-swim': { completed: true, metrics: { min: '45', meters: '1500' } }, 'iv-run': { completed: true, metrics: { min: '50' } } };
    d.profile = { ...(d.profile || {}), sports: ['swim', 'bike', 'run'], skills: { ...((d.profile || {}).skills || {}), swimCrawl: 'yes', swimCrawlM: 400, swimGear: ['buoy', 'board'] } };
  } });
}
const sheet = (page: Page) => page.locator('#sheetPanel');
const sub = (page: Page) => page.locator('#subPanel');
const box = (page: Page) => sheet(page).locator('[data-intervals]');
const set = (page: Page, i: number) => box(page).locator(`[data-iv-set="${i}"]`);
const openSet = async (page: Page, i: number) => { await set(page, i).locator('.ab-set-h').click(); await expect(sub(page).locator('[data-ab-sheet="set"]')).toBeVisible(); };
const openRep = async (page: Page, i: number) => { await box(page).locator(`.ab-rep[data-iv-row="${i}"]`).click(); await expect(sub(page).locator(`[data-ab-sheet="rep"][data-iv-row="${i}"]`)).toBeVisible(); };
const done = async (page: Page) => { await sub(page).locator('[data-act="sub-close"].btn').click(); await expect(page.locator('#sub')).toBeHidden(); };
async function human(page: Page, sel: string, raw: string) { const el = sub(page).locator(sel); await el.click(); await el.fill(''); await el.pressSequentially(raw, { delay: 5 }); await el.blur(); }
const ctxOf = (state: any, plan: any) => ({ today: TODAY, now: Date.now(), state, baseWeeks: plan.weeks, planMeta: plan.meta || {}, profile: state.profile, goals: [] } as any);

test('Schwimmen: Satz gleich, Pull Buoy, Titel, eine Wiederholung abweichend – neu laden, überall gleich, Coach sagt „mit Pull Buoy“', async ({ page }) => {
  test.setTimeout(90000);
  await seedIv(page); await open(page, '/?go=plan');
  await openPlanSession(page, 'iv-swim');
  await expect(box(page)).toBeVisible();
  await expect(set(page, 0).locator('.iv-set-t')).toHaveText('4 × 100 m Kraul');
  await expect(set(page, 1).locator('.iv-set-t')).toHaveText('4 × 50 m Kraul · Pull Buoy');
  // kompakt: 8 Zeilen, keine Felder in der Liste
  await expect(box(page).locator('.iv-row')).toHaveCount(8);
  await expect(page.locator('#iv-0-sec')).toHaveCount(0);
  // ganzer Satz gleich: alle 4 × 100 m in 1:55
  await openSet(page, 0);
  await human(page, '#iv-same-0-sec', '1:55');
  await expect(sub(page).locator('.ab-rep').first()).toContainText('1:55');
  await expect(sub(page).locator('.ab-rep').nth(3)).toContainText('1:55');
  // Pull Buoy für den ganzen Satz, eigener Titel
  await sub(page).locator('[data-act="iv-gear"][data-g="buoy"]').click();
  await human(page, '#iv-set-0-title', 'Hauptserie');
  await done(page);
  await expect(set(page, 0).locator('.iv-set-t')).toHaveText('Hauptserie (4 × 100 m)');
  // eine Wiederholung abweichend: Nr. 2 in 2:05
  await openRep(page, 1);
  await human(page, '#iv-1-sec', '2:05');
  // ungültig: Meldung, alter Wert bleibt
  await human(page, '#iv-1-sec', '9:99');
  await expect(page.locator('#toast')).toContainText('Minuten:Sekunden');
  await done(page);
  await expect(set(page, 0).locator('[data-iv-row="1"]')).toContainText('2:05');
  // neu laden: alles noch da
  await expect.poll(async () => (await stored(page)).sessions['iv-swim']?.metrics?.intervals?.[1]?.sec).toBe(125);
  await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
  await openPlanSession(page, 'iv-swim');
  await expect(set(page, 0).locator('.iv-set-t')).toHaveText('Hauptserie (4 × 100 m)');
  await expect(set(page, 0).locator('[data-iv-row="1"]')).toContainText('2:05');
  await expect(set(page, 0).locator('[data-iv-row="0"]')).toContainText('1:55');
  // gespeichert = Anzeige = Coach-Kontext
  const st = await stored(page); const plan = await page.evaluate(() => JSON.parse(localStorage.getItem('ec_plan') || '{}'));
  const rows = st.sessions['iv-swim'].metrics.intervals;
  expect(rows.slice(0, 4).map((r: any) => r.sec)).toEqual([115, 125, 115, 115]);
  expect(rows[0]).toMatchObject({ m: 100, stroke: 'crawl', gear: ['buoy'], title: 'Hauptserie', ti: 0 });
  const done0 = doneItems(ctxOf(st, plan), TODAY, TODAY).find(d => d.key === 'iv-swim')!;
  const v = valsOf(done0);
  expect(v.longest ?? null).toBeNull();
  expect(v.longestPull).toBe(100);
  const notes = ivDiffNotes(ivEvalOf(ctxOf(st, plan), done0));
  expect(notes[0]).toContain('mit Pull Buoy statt ohne Hilfsmittel');
  expect(notes.join(' ')).not.toMatch(/ohne Pull Buoy/);
});

test('Schwimmen: Satz hinzufügen (Brust), verschieben, löschen; Lage einer Wiederholung ändern', async ({ page }) => {
  test.setTimeout(90000);
  await seedIv(page); await open(page, '/?go=plan');
  await openPlanSession(page, 'iv-swim');
  await sheet(page).locator('[data-act="ab-add"]').click();
  await sub(page).locator('[data-act="iv-add"]').click();
  // das Fenster zeigt gleich den neuen Satz
  await expect(sub(page).locator('[data-ab-sheet="set"][data-iv-set="2"]')).toBeVisible();
  await expect(box(page).locator('.iv-set')).toHaveCount(3);
  await sub(page).locator('#iv-set-8-stroke').selectOption('breast');
  await sub(page).locator('.ab-rep[data-iv-row="8"]').click();
  await human(page, '#iv-8-m', '50');
  await human(page, '#iv-8-sec', '0:58');
  await done(page);
  await expect(set(page, 2).locator('.iv-set-t')).toContainText('Brust');
  // nach oben schieben: wird Satz 2 (das Fenster bleibt beim verschobenen Satz)
  await openSet(page, 2);
  await sub(page).locator('[data-act="iv-set-move"][data-dir="-1"]').click();
  await expect(set(page, 1).locator('.iv-set-t')).toContainText('Brust');
  await expect(sub(page).locator('[data-ab-sheet="set"][data-iv-set="1"]')).toBeVisible();
  // Satz löschen (Rückgängig statt Sicherheitsfrage)
  await sub(page).locator('[data-act="iv-set-del"]').click();
  await expect(page.locator('#sub')).toBeHidden();
  await expect(box(page).locator('.iv-set-t', { hasText: 'Brust' })).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('Satz gelöscht');
  // Lage einer einzelnen Wiederholung im ersten Satz: Rücken
  await openRep(page, 0);
  await sub(page).locator('#iv-row-0-stroke').selectOption('back');
  await human(page, '#iv-0-sec', '2:10');
  await done(page);
  await expect(set(page, 0).locator('[data-iv-row="0"]')).toContainText('Rücken (statt Kraul)');
  const st = await stored(page);
  expect(st.sessions['iv-swim'].metrics.intervals[0]).toMatchObject({ stroke: 'back', sec: 130 });
  expect(st.sessions['iv-swim'].metrics.intervals.some((r: any) => r.stroke === 'breast')).toBe(false);
});

test('Laufen: Art bergauf und Untergrund für den Satz, Titel; Bewertung über Puls', async ({ page }) => {
  test.setTimeout(90000);
  await seedIv(page); await open(page, '/?go=plan');
  await openPlanSession(page, 'iv-run');
  await expect(set(page, 0).locator('.iv-set-t')).toHaveText('5 × 4 min Zone 4');
  await openSet(page, 0);
  await sub(page).locator('#iv-set-0-type').selectOption('hill');
  await sub(page).locator('#iv-set-0-terrain').selectOption('trail');
  await human(page, '#iv-same-0-hr', '166');
  await human(page, '#iv-same-0-sec', '4:00');
  await done(page);
  await expect(set(page, 0).locator('.iv-set-t')).toHaveText('5 × 4 min bergauf · Zone 4');
  const st = await stored(page);
  expect(st.sessions['iv-run'].metrics.intervals[4]).toMatchObject({ type: 'hill', terrain: 'trail', hr: 166, sec: 240 });
  await openRep(page, 0);
  await expect(sub(page).locator('.iv-why')).toContainText('Puls 166');
});

for (const w of [320, 390]) test(`Überlauf ${w} px, große Schrift: Intervall-Sätze und Fenster ragen nicht heraus, kein zu schmaler Text`, async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: w, height: 800 });
  await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '22px'; }); });
  await seedIv(page); await open(page, '/?go=plan');
  await openPlanSession(page, 'iv-swim');
  await openSet(page, 0);
  await sub(page).locator('[data-act="iv-gear"][data-g="buoy"]').click();
  await human(page, '#iv-set-0-title', 'Sehr lange Hauptserie mit Pull Buoy und Paddles');
  await sub(page).locator('.ab-rep[data-iv-row="0"]').click();
  const over = await page.evaluate(() => { const s = document.querySelector('#sheetPanel') as HTMLElement; const u = document.querySelector('#subPanel') as HTMLElement; return { page: document.scrollingElement!.scrollWidth - window.innerWidth, sheet: s.scrollWidth - s.clientWidth, sub: u.scrollWidth - u.clientWidth }; });
  expect(over).toEqual({ page: 0, sheet: 0, sub: 0 });
  expect(await narrowText(page)).toEqual([]);
});
