/* Auftrag 37: Einheiten übersichtlich – ein „Ablauf“ je Einheit (Aufwärmen → Sätze mit Wiederholungen → Ausklang; Kraft: Übungen),
   Bearbeiten im Fenster, abgehakt = wie geplant (Auftrag 38: ohne Knopf), Rückgängig, aufgeräumte Seite, Nachtragen mit Datum. Echte Eingabe wie ein Mensch
   (Antippen, Tippen, Verlassen des Felds), in WebKit (iPhone) und Chromium. */
import { test, expect } from './storage-harness';
import { type Page } from '@playwright/test';
import { seed, open, openPlanSession, stored, TODAY, narrowText } from './helpers';
import * as W from '../../shared/workouts';
import { doneItems, ivEvalOf } from '../../shared/coach/review';

const CTX: W.PaceCtx = { runThrSec: 300, lthrRun: 170, lthrBike: 160, css: 120, breast100: 165, bikeKmh: 30, pool: 25, gear: ['buoy', 'board'] };
const SWIM = W.build(W.swimSession(CTX, 'css', [{ part: 'main', reps: 3, m: 100, zone: 3, mode: 'breast', restSec: 20 }], 200, 100));
const RUN = W.build(W.runIntervals(CTX, 4, 3, 2, 4));
const BIKE = W.build(W.bikeIntervals(CTX, 3, 5, 4, 3));
const BRICK = W.build({ sport: 'bike', kind: 'brick', ctx: CTX, steps: [{ part: 'warm', min: 15, zone: 1 }, { part: 'main', min: 40, zone: 2 }, { part: 'cool', min: 5, zone: 1 }] } as any);
const BRICK_RUN = W.build(W.runEasy(CTX, 20, { kind: 'brick' } as any));
const STRENGTH = W.build(W.strengthArea('core'));
const D1 = '2026-10-12', D2 = '2026-10-13'; // Mo, Di vor heute (Mi)

async function seed37(page: Page, extra?: (d: any) => void) {
  await seed(page, { extra: (d: any) => {
    const days = d.plan.weeks.flatMap((w: any) => w.days);
    const day = days.find((x: any) => x.date === TODAY);
    day.sessions.push({ id: 's37', sport: 'swim', ...SWIM }, { id: 'r37', sport: 'run', ...RUN }, { id: 'b37', sport: 'bike', ...BIKE },
      { id: 'k37b', sport: 'bike', ...BRICK, title: 'Koppel Rad 60 min' }, { id: 'k37r', sport: 'run', ...BRICK_RUN, title: 'Koppel Lauf 20 min' }, { id: 'st37', sport: 'strength', ...STRENGTH });
    days.find((x: any) => x.date === D2).sessions.push({ id: 'm37b', sport: 'run', title: 'Lockerer Lauf', plannedMinutes: 40, zone: 'Zone 2' });
    days.find((x: any) => x.date === D1).sessions.push({ id: 'm37a', sport: 'bike', title: 'Rad locker', plannedMinutes: 60, zone: 'Zone 2' });
    d.sessions = { ...(d.sessions || {}), s37: { completed: true, metrics: {} }, r37: { completed: true, metrics: {} }, b37: { completed: true, metrics: {} }, k37b: { completed: true, metrics: {} }, k37r: { completed: true, metrics: {} }, st37: { completed: true, metrics: {} } };
    d.profile = { ...(d.profile || {}), sports: ['swim', 'bike', 'run', 'strength'], skills: { ...((d.profile || {}).skills || {}), swimCrawl: 'yes', swimCrawlM: 400, swimBreast: 'yes', swimGear: ['buoy', 'board'] } };
    if (extra) extra(d);
  } });
}
const sheet = (page: Page) => page.locator('#sheetPanel');
const sub = (page: Page) => page.locator('#subPanel');
const ab = (page: Page) => sheet(page).locator('.ablauf');
async function human(loc: ReturnType<Page['locator']>, raw: string) { await loc.click(); await loc.fill(''); await loc.pressSequentially(raw, { delay: 5 }); await loc.blur(); }
/* offene Bereiche der Seite (die Coach-Bewertung kommt nach dem Eintragen neu dazu – das ist kein Aufklappen) */
const openDetails = (page: Page) => page.evaluate(() => Array.from(document.querySelectorAll('#sheetPanel details[open]')).map(d => d.getAttribute('data-key') || (d.querySelector('summary')?.textContent || '').trim().slice(0, 30)).filter(k => k !== 'coach-review').sort());
const ctxOf = (state: any, plan: any) => ({ today: TODAY, now: Date.now(), state, baseWeeks: plan.weeks, planMeta: plan.meta || {}, profile: state.profile, goals: [] } as any);
async function closeSub(page: Page) { await sub(page).locator('[data-act="sub-close"].btn').click(); await expect(page.locator('#sub')).toBeHidden(); }

test('Schwimmen 3 × 100 m Brust: 2. auf Kraul – Bewertung mit Kraul-Tempo; Pull Buoy und Titel für den Satz; nichts klappt auf', async ({ page }) => {
  test.setTimeout(120000);
  await seed37(page); await open(page, '/?go=plan'); await openPlanSession(page, 's37');
  // ein Ablauf: Einschwimmen → Satz → Ausschwimmen, keine aufklappenden Bereiche darin
  await expect(ab(page).locator('.ab-item')).toHaveCount(3);
  await expect(ab(page).locator('.ab-item').nth(0)).toContainText('Einschwimmen');
  await expect(ab(page).locator('.ab-set-t')).toHaveText('3 × 100 m Brust');
  await expect(ab(page).locator('.ab-item').nth(2)).toContainText('Ausschwimmen');
  await expect(ab(page).locator('details')).toHaveCount(0);
  const openBefore = await openDetails(page);
  // Satz-Fenster: ganzer Satz gleich 2:20
  await ab(page).locator('.ab-set-h').click();
  await expect(sub(page).locator('[data-ab-sheet="set"]')).toBeVisible();
  await human(sub(page).locator('#iv-same-0-sec'), '2:20');
  await expect(sub(page).locator('.ab-rep').nth(2)).toContainText('2:20');
  // 2. Wiederholung antippen → nur diese: Kraul, 1:41
  await sub(page).locator('.ab-rep[data-iv-row="1"]').click();
  await expect(sub(page).locator('[data-ab-sheet="rep"]')).toBeVisible();
  await expect(page.locator('#subPanel .sheet-h h2')).toHaveText('2. von 3 × 100 m Brust');
  await sub(page).locator('#iv-row-1-stroke').selectOption('crawl');
  await human(sub(page).locator('#iv-1-sec'), '1:41');
  await expect(sub(page).locator('.iv-why')).toContainText('1:41/100 m');
  await closeSub(page);
  // Hinweis „Übernommen“ mit Rückgängig; Liste zeigt die Abweichung
  await expect(page.locator('#toast')).toContainText('Übernommen');
  const rep2 = ab(page).locator('.ab-rep[data-iv-row="1"]');
  await expect(rep2).toContainText('1:41');
  await expect(rep2).toContainText('Kraul (statt Brust)');
  await expect(ab(page).locator('.ab-set-t')).toHaveText(/3 × 100 m \(2 Brust, 1 Kraul\)/);
  // Bewertung mit Kraul-Tempo: das Ziel ist das Kraul-Ziel, nicht das Brust-Ziel
  const st = await stored(page); const plan = await page.evaluate(() => JSON.parse(localStorage.getItem('ec_plan') || '{}'));
  expect(st.sessions.s37.metrics.intervals[1]).toMatchObject({ stroke: 'crawl', sec: 101, m: 100 });
  const done = doneItems(ctxOf(st, plan), TODAY, TODAY).find(d => d.key === 's37')!;
  const e = ivEvalOf(ctxOf(st, plan), done)!;
  const l1 = e.lines.find(l => l.row && l.row.sec === 101)!; const l0 = e.lines.find(l => l.row && l.row.sec === 140)!;
  expect(l1.diff).toContain('Kraul statt Brust');
  const goal = (w: string) => (/Ziel (\d+:\d\d)-(\d+:\d\d)/.exec(w) || []).slice(1).join('-');
  expect(goal(l1.why)).not.toBe(''); expect(goal(l1.why)).not.toBe(goal(l0.why));
  // Pull Buoy für den ganzen Satz, eigener Titel
  await ab(page).locator('.ab-set-h').click();
  await sub(page).locator('[data-act="iv-gear"][data-g="buoy"]').click();
  await human(sub(page).locator('#iv-set-0-title'), 'Brust-Serie');
  await closeSub(page);
  await expect(ab(page).locator('.ab-set-t')).toHaveText('Brust-Serie (3 × 100 m)');
  const st2 = await stored(page);
  expect(st2.sessions.s37.metrics.intervals.map((r: any) => r.gear)).toEqual([['buoy'], ['buoy'], ['buoy']]);
  expect(st2.sessions.s37.metrics.intervals[0].title).toBe('Brust-Serie');
  // beim Ändern klappt in der Seite nichts auf
  expect(await openDetails(page)).toEqual(openBefore);
  // neu laden: alles noch da
  await page.reload(); await expect(page.locator('#app')).not.toBeEmpty(); await openPlanSession(page, 's37');
  await expect(ab(page).locator('.ab-set-t')).toHaveText('Brust-Serie (3 × 100 m)');
  await expect(ab(page).locator('.ab-rep[data-iv-row="1"]')).toContainText('Kraul (statt Brust)');
});

test('Schwimmen: Einschwimmen ändern, Ausschwimmen löschen und wieder hinzufügen; Gesamtwerte passen zum Ablauf', async ({ page }) => {
  test.setTimeout(120000);
  await seed37(page); await open(page, '/?go=plan'); await openPlanSession(page, 's37');
  await ab(page).locator('button[data-key="sec:warm"]').click();
  await expect(sub(page).locator('[data-ab-sheet="sec"]')).toBeVisible();
  await human(sub(page).locator('#sec-warm-meters'), '300');
  await human(sub(page).locator('#sec-warm-min'), '7');
  await closeSub(page);
  await expect(ab(page).locator('button[data-key="sec:warm"]')).toContainText('300 m');
  // Ausschwimmen löschen (Hinweis mit Rückgängig), dann über „+ Abschnitt / Satz“ wieder anlegen
  await ab(page).locator('button[data-key="sec:cool"]').click();
  await sub(page).locator('[data-act="sec-del"]').click();
  await expect(page.locator('#sub')).toBeHidden();
  await expect(page.locator('#toast')).toContainText('Abschnitt gelöscht');
  await expect(ab(page).locator('button[data-key="sec:cool"]')).toHaveCount(0);
  await ab(page).locator('[data-act="ab-add"]').click();
  await sub(page).locator('[data-act="sec-add"][data-p="cool"]').click();
  await expect(sub(page).locator('[data-ab-sheet="sec"][data-sec-part="cool"]')).toBeVisible();
  await human(sub(page).locator('#sec-cool-meters'), '100');
  await human(sub(page).locator('#sec-cool-min'), '3');
  await closeSub(page);
  await expect(ab(page).locator('button[data-key="sec:cool"]')).toContainText('100 m');
  // Satz: ganzer Satz 2:30 mit 20 s Pause → Gesamtwerte aus dem Ablauf (300 + 300 + 100 m; 7 + 3×2:30 + 2×0:20 + 3 min)
  await ab(page).locator('.ab-set-h').click();
  await human(sub(page).locator('#iv-same-0-sec'), '2:30');
  await closeSub(page);
  const st = await stored(page);
  expect(st.sessions.s37.metrics.meters).toBe('700');
  expect(st.sessions.s37.metrics.min).toBe(String(Math.round((7 + 7.5 + 40 / 60 + 3) * 10) / 10));
  expect(st.sessions.s37.metricsSrc.meters).toBe('sections');
});

test('Abgehakt = still wie geplant + eine Abweichung; Rückgängig (mehrere Schritte); Diagramm öffnet dasselbe Fenster', async ({ page }) => {
  test.setTimeout(120000);
  await seed37(page);
  await open(page, '/?go=plan'); await openPlanSession(page, 'r37');
  // Auftrag 38: keine Knöpfe „Wie geplant / Anders gemacht“ mehr – abgehakt ohne Werte gilt still „wie geplant (nicht gemessen)“
  await expect(sheet(page).locator('[data-act="fd-asplanned"]')).toHaveCount(0);
  await expect(ab(page).locator('.ab-rep')).toHaveCount(4);
  for (let i = 0; i < 4; i++) await expect(ab(page).locator('.ab-rep').nth(i)).toContainText('wie geplant');
  let st = await stored(page);
  expect(st.sessions.r37.completed).toBe(true);
  // eine Abweichung: 3. Wiederholung mit Puls 172 (Pace 4:05)
  await ab(page).locator('.ab-rep[data-iv-row="2"]').click();
  await human(sub(page).locator('#iv-2-pace'), '4:05');
  await human(sub(page).locator('#iv-2-hr'), '172');
  await closeSub(page);
  await expect(ab(page).locator('.ab-rep[data-iv-row="2"]')).toContainText('4:05/km');
  await expect(ab(page).locator('.ab-rep[data-iv-row="1"]')).toContainText('wie geplant');
  st = await stored(page);
  expect(st.sessions.r37.metrics.intervals[2].plan).toBeUndefined();
  expect(st.sessions.r37.metrics.intervals[1].hr ?? null).toBeNull();
  // Diagramm antippen → dasselbe Fenster (Wiederholung)
  const hit = sheet(page).locator('.dia-hit[data-key="rep:2"]').first();
  await hit.dispatchEvent('click');
  await expect(sub(page).locator('[data-ab-sheet="rep"][data-iv-row="2"]')).toBeVisible();
  await page.locator('#sub [data-act="sub-close"].icon-btn').click();
  // Rückgängig: Wiederholung löschen → Hinweis „Rückgängig“ → wieder da
  await ab(page).locator('.ab-rep[data-iv-row="3"]').click();
  await sub(page).locator('[data-act="iv-del"]').click();
  await expect(ab(page).locator('.ab-rep')).toHaveCount(3);
  await page.locator('#toast .toast-act').click();
  await expect(ab(page).locator('.ab-rep')).toHaveCount(4);
  // mehrere Schritte nacheinander: RPE 7, dann Gefühl, dann zweimal „↶ Rückgängig“
  await sheet(page).locator('[data-act="fd-rpe"][data-v="7"]').click();
  await sheet(page).locator('[data-act="fd-feel"]').first().click();
  await expect(sheet(page).locator('[data-undo-btn]')).toBeVisible();
  await sheet(page).locator('[data-undo-btn]').click();
  await expect(sheet(page).locator('[data-act="fd-feel"].on')).toHaveCount(0);
  await expect(sheet(page).locator('[data-act="fd-rpe"][data-v="7"]')).toHaveClass(/on/);
  await sheet(page).locator('[data-undo-btn]').click();
  await expect(sheet(page).locator('[data-act="fd-rpe"].on')).toHaveCount(0);
  st = await stored(page);
  expect(st.sessions.r37.rpe || '').toBe('');
});

test('Einheiten-Seite: Reihenfolge Kopf → Ablauf → Gesamtwerte → Gefühl/Notiz; Gesamtwerte der Uhr eingeklappt', async ({ page }) => {
  test.setTimeout(90000);
  await seed37(page); await open(page, '/?go=plan'); await openPlanSession(page, 's37');
  const order = await page.evaluate(() => {
    const p = document.querySelector('#sheetPanel .sess-page')!; const want = ['[data-kopf]', '.ablauf', '.totals', '[data-feel]', '.sess-more'];
    return want.map(sel => { const el = p.querySelector(sel); return el ? Array.prototype.indexOf.call(p.querySelectorAll('*'), el) : -1; });
  });
  expect(order.every(x => x >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  await expect(sheet(page).locator('[data-kopf-date]')).toContainText('Mi, 14.10.');
  // keine alten Bereiche mehr (Intervall-Liste, Abschnitte, Schrittliste oben)
  await expect(sheet(page).locator('details.iv-det, .iv-more, .sec-card')).toHaveCount(0);
  await expect(sheet(page).locator('[data-structure]')).toBeHidden();
});

test('Nachtragen: Wochentag + Datum je Einheit, nach Datum sortiert; „Nachtragen“ öffnet den richtigen Tag, „Nicht gemacht“ nur diese', async ({ page }) => {
  test.setTimeout(90000);
  await seed37(page); await open(page, '/');
  await page.locator('[data-act="missed-open"]').click();
  const labels = await sheet(page).locator('[data-missed-label]').allTextContents();
  expect(labels.some(l => l.startsWith('Mo, 12.10. · Rad locker 60 min'))).toBe(true);
  expect(labels.some(l => l.startsWith('Di, 13.10. · Lockerer Lauf 40 min'))).toBe(true);
  const dates = await sheet(page).locator('[data-missed]').evaluateAll(els => els.map(e => e.getAttribute('data-date')));
  expect([...dates].sort()).toEqual(dates);
  // „Nicht gemacht“ nur für eine
  await sheet(page).locator('[data-missed="m37a"] [data-act="missed-skip"]').click();
  await expect(sheet(page).locator('[data-missed="m37a"]')).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('nicht gemacht');
  // „Nachtragen“ öffnet die Einheit vom Dienstag
  await sheet(page).locator('[data-missed="m37b"] [data-act="missed-enter"]').click();
  await expect(sheet(page).locator('[data-kopf-date]')).toContainText('Di, 13.10.');
  await expect(page.locator('#sheetPanel .sheet-h h2')).toHaveText('Lockerer Lauf');
  const st = await stored(page);
  expect(st.sessions.m37a.skipped).toBe(true);
});

/* dasselbe für Laufen, Rad, Koppel (Rad + Lauf) und Kraft */
for (const [sid, sport] of [['r37', 'run'], ['b37', 'bike'], ['k37b', 'bike'], ['k37r', 'run']] as const) {
  test(`${sid} (${sport}): Satz bzw. Hauptteil ändern, Aufwärmen ändern/löschen/hinzufügen, wie geplant, Rückgängig, Diagramm`, async ({ page }) => {
    test.setTimeout(120000);
    await seed37(page);
    await open(page, '/?go=plan'); await openPlanSession(page, sid);
    await expect(ab(page).locator('.ab-item').first()).toContainText('Aufwärmen');
    await expect(ab(page).locator('.ab-item').last()).toContainText(/Ausklang|Hauptteil/);
    const openBefore = await openDetails(page);
    // abgehakt ohne Werte: still wie geplant
    await expect(ab(page).locator('.ab-row', { hasText: 'wie geplant' }).first()).toBeVisible();
    // Aufwärmen ändern
    await ab(page).locator('button[data-key="sec:warm"]').click();
    await human(sub(page).locator('#sec-warm-min'), '12');
    await human(sub(page).locator('#sec-warm-hr'), '125');
    await closeSub(page);
    await expect(ab(page).locator('button[data-key="sec:warm"]')).toContainText('12 min');
    await expect(ab(page).locator('button[data-key="sec:warm"]')).toContainText('Puls 125');
    // Satz (Intervalle) bzw. Hauptteil
    if (await ab(page).locator('.ab-set-h').count()) {
      await ab(page).locator('.ab-set-h').first().click();
      await sub(page).locator('#iv-set-' + (await sub(page).locator('[data-ch="iv-same"]').first().getAttribute('id'))!.split('-')[2] + '-type').selectOption('hill');
      await human(sub(page).locator('[data-ch="iv-same"][data-f="hr"]'), '158');
      await closeSub(page);
      await expect(ab(page).locator('.ab-set-t').first()).toContainText('bergauf');
      await expect(ab(page).locator('.ab-rep').first()).toContainText('Puls 158');
    } else {
      await ab(page).locator('button[data-key="sec:main"]').click();
      await human(sub(page).locator('#sec-main-hr'), '141');
      await closeSub(page);
      await expect(ab(page).locator('button[data-key="sec:main"]')).toContainText('Puls 141');
    }
    // Aufwärmen löschen → Rückgängig → wieder da; löschen und über „+“ wieder hinzufügen
    await ab(page).locator('button[data-key="sec:warm"]').click();
    await sub(page).locator('[data-act="sec-del"]').click();
    await expect(ab(page).locator('button[data-key="sec:warm"]')).toHaveCount(0);
    await page.locator('#toast .toast-act').click();
    await expect(ab(page).locator('button[data-key="sec:warm"]')).toContainText('12 min');
    await ab(page).locator('button[data-key="sec:warm"]').click();
    await sub(page).locator('[data-act="sec-del"]').click();
    await ab(page).locator('[data-act="ab-add"]').click();
    await sub(page).locator('[data-act="sec-add"][data-p="warm"]').click();
    await human(sub(page).locator('#sec-warm-min'), '10');
    await closeSub(page);
    await expect(ab(page).locator('button[data-key="sec:warm"]')).toContainText('10 min');
    // Diagramm antippen → dasselbe Fenster (nur bei Einheiten mit mehreren Schritten; der Koppel-Lauf ist ein Stück): Hauptteil bzw. Satz
    if (await sheet(page).locator('[data-diagram]').count()) {
      const hit = sheet(page).locator('.dia-hit').nth(1); const key = await hit.getAttribute('data-key');
      await hit.dispatchEvent('click');
      await expect(sub(page).locator('[data-ab-sheet]')).toBeVisible();
      expect(key).toMatch(/^(sec|rep|set):/);
      await page.locator('#sub [data-act="sub-close"].icon-btn').click();
    }
    expect(await openDetails(page)).toEqual(openBefore);
    const st = await stored(page);
    expect(st.sessions[sid].metrics.sections.find((r: any) => r.part === 'warm')).toMatchObject({ min: '10' });
  });
}

test('Kraft: Übungen als Liste, Fenster je Übung, wie geplant + Gewicht, hinzufügen, löschen, Rückgängig', async ({ page }) => {
  test.setTimeout(120000);
  await seed37(page);
  await open(page, '/?go=plan'); await openPlanSession(page, 'st37');
  const n = (STRENGTH.spec.exercises || []).length;
  await expect(ab(page).locator('.ab-ex')).toHaveCount(n);
  await expect(ab(page).locator('.ab-ex').first()).toContainText('wie geplant');
  await ab(page).locator('.ab-ex').first().locator('.ab-row').click();
  await human(sub(page).locator('#ex-0-kg'), '12,5');
  await closeSub(page);
  await expect(ab(page).locator('.ab-ex').first()).toContainText('12,5 kg');
  await ab(page).locator('[data-act="fd-ex-add"]').click();
  await expect(sub(page).locator('[data-ab-sheet="ex"]')).toBeVisible();
  await human(sub(page).locator(`#ex-${n}-name`), 'Pallof Press');
  await human(sub(page).locator(`#ex-${n}-sets`), '3');
  await human(sub(page).locator(`#ex-${n}-reps`), '10');
  await closeSub(page);
  await expect(ab(page).locator('.ab-ex')).toHaveCount(n + 1);
  await expect(ab(page).locator('.ab-ex').last()).toContainText('Pallof Press');
  await ab(page).locator('.ab-ex').last().locator('.ab-row').click();
  await sub(page).locator('[data-act="fd-ex-del"]').click();
  await expect(ab(page).locator('.ab-ex')).toHaveCount(n);
  await page.locator('#toast .toast-act').click();
  await expect(ab(page).locator('.ab-ex')).toHaveCount(n + 1);
  const st = await stored(page);
  expect(st.sessions.st37.metrics.exercises[0]).toMatchObject({ kg: 12.5 });
  expect(st.sessions.st37.metrics.exercises[0].plan).toBeUndefined();
  expect(st.sessions.st37.metrics.exercises[1].plan).toBe(true);
});

for (const w of [320, 375, 430]) test(`Überlauf ${w} px, große Schrift: Ablauf und Fenster ragen nicht heraus, kein zu schmaler Text`, async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: w, height: 800 });
  await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '22px'; }); });
  await seed37(page); await open(page, '/?go=plan');
  const check = async () => {
    const over = await page.evaluate(() => { const s = document.querySelector('#sheetPanel') as HTMLElement; const u = document.querySelector('#subPanel') as HTMLElement; return { page: document.scrollingElement!.scrollWidth - window.innerWidth, sheet: s.scrollWidth - s.clientWidth, sub: u.scrollWidth - u.clientWidth }; });
    expect(over).toEqual({ page: 0, sheet: 0, sub: 0 });
    expect(await narrowText(page)).toEqual([]);
  };
  await openPlanSession(page, 's37');
  await ab(page).locator('.ab-set-h').click();
  await human(sub(page).locator('#iv-set-0-title'), 'Sehr lange Hauptserie mit Pull Buoy und Paddles');
  await check();
  await sub(page).locator('.ab-rep[data-iv-row="1"]').click();
  await sub(page).locator('#iv-row-1-stroke').selectOption('crawl');
  await check();
  await closeSub(page); await check();
  await ab(page).locator('button[data-key="sec:warm"]').click(); await check(); await closeSub(page);
  await page.locator('#sheet .sheet-h [data-act="sheet-close"]').click();
  await openPlanSession(page, 'st37');
  await ab(page).locator('.ab-ex').first().locator('.ab-row').click(); await check();
});
