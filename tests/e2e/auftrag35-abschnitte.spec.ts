/* Auftrag 35, Punkt 1: Abschnitte (Aufwärmen, Hauptteil, Ausklang) wie ein Mensch eintragen, neu laden, gleiche Zahl in Einheit,
   Gesamtwerten und Coach-Kontext; ungültige Eingabe; Schwimmen mit vier Abschnitten; Intervalle nur mit Aufwärmen/Ausklang;
   Uhrdaten: Hauptteil automatisch erkannt, Grenze korrigieren. Läuft in WebKit (iPhone) und Chromium. */
import { test, expect } from './storage-harness';
import { type Page } from '@playwright/test';
import { seed, open, openPlanSession, stored, TODAY } from './helpers';
import { doneItems, reviewOne } from '../../shared/coach/review';
import { valueFacts } from '../../shared/coach/claims';

const SPEC_EASY = { sport: 'run', kind: 'easy', ctx: { runThrSec: 300, lthrRun: 170 }, steps: [{ part: 'warm', min: 10, zone: 1 }, { part: 'main', min: 45, zone: 2 }, { part: 'cool', min: 5, zone: 1 }] };
const SPEC_IV = { sport: 'run', kind: 'intervals', ctx: { runThrSec: 300, lthrRun: 170 }, steps: [{ part: 'warm', min: 15, zone: 1 }, { part: 'main', reps: 4, min: 4, zone: 4, restMin: 2 }, { part: 'cool', min: 10, zone: 1 }] };
const SPEC_SWIM = { sport: 'swim', kind: 'technique', ctx: { css: 120 }, steps: [{ part: 'warm', m: 200, zone: 1, mode: 'easy' }, { part: 'main', reps: 4, m: 50, zone: 2, mode: 'drill' }, { part: 'main', reps: 4, m: 100, zone: 3, mode: 'crawl', restSec: 20 }, { part: 'cool', m: 100, zone: 1, mode: 'easy' }] };
function series() {
  const hr: number[] = [], m: number[] = [];
  for (let i = 0; i < 60; i++) { if (i < 10) { hr.push(105 + Math.round(i * 3.4)); m.push(150); } else if (i < 55) { hr.push(146 + (i % 3) - 1); m.push(165); } else { hr.push(126); m.push(120); } }
  return { step: 60, hr, hx: hr.map(h => h + 4), m };
}
async function seedIt(page: Page, withWatch = false) {
  await seed(page, { extra: (d: any) => {
    const day = d.plan.weeks.flatMap((w: any) => w.days).find((x: any) => x.date === TODAY);
    day.sessions.push({ id: 's35-run', sport: 'run', title: 'Lockerer Lauf 60 min', plannedMinutes: 60, zone: 'Zone 2', spec: SPEC_EASY });
    day.sessions.push({ id: 's35-iv', sport: 'run', title: 'Lauf-Intervalle 4×4 min', plannedMinutes: 55, zone: 'Zone 4', hard: true, spec: SPEC_IV });
    day.sessions.push({ id: 's35-swim', sport: 'swim', title: 'Schwimmen Technik', plannedMinutes: 35, zone: 'Zone 3', spec: SPEC_SWIM });
    d.settings = { ...d.settings, lthrRun: 170, lthrBike: 160 };
    if (withWatch) {
      d.activities = { ...(d.activities || {}), 'file-run-35': { id: 'file-run-35', source: 'file', sources: ['file'], sport: 'run', date: TODAY, startMs: Date.parse(TODAY + 'T06:00:00Z'), indoor: false, min: 60, km: 9.6, avgHr: 139, maxHr: 156, laps: [], intervals: null, swim: null, hrZones: null, decouplingPct: 2.1, efficiency: null, speedKmh: 9.6, paceSecKm: 375, series: series(), sessionId: 's35-run' } };
      d.sessions = { ...(d.sessions || {}), 's35-run': { completed: true, activityId: 'file-run-35', source: 'file', metrics: { min: '60', km: '9.6', hr: '139' }, metricsAuto: { min: '60', km: '9.6', hr: '139' }, metricsSrc: { min: 'file', km: 'file', hr: 'file' } } };
    }
  } });
}
/* Auftrag 35: neuer Bereich bei 320 px ohne Überlauf (Seite scrollt nicht seitlich, nichts ragt aus dem Blatt) */
async function noOverflow(page: any, sel: string) {
  await page.setViewportSize({ width: 320, height: 700 });
  const bad = await page.evaluate((s: string) => { const W = document.documentElement.clientWidth; const out: string[] = []; if (document.documentElement.scrollWidth > W + 1) out.push('Seite scrollt seitlich'); document.querySelectorAll(s + ' *').forEach(el => { const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1) && !el.closest('.scroll-x')) out.push(el.tagName + ' ' + (el.textContent || '').trim().slice(0, 30)); }); return out.slice(0, 5); }, sel);
  expect(bad).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
}

const sheet = (page: Page) => page.locator('#sheetPanel');
/* Auftrag 37: Abschnitte stehen im Ablauf; Antippen öffnet das Fenster des Abschnitts (dieselben Felder) */
async function openSec(page: Page, sid: string) {
  await openPlanSession(page, sid);
  await expect(sheet(page).locator('[data-sections]')).toBeVisible();
}
async function partSheet(page: Page, part: string) {
  if (await page.locator(`#subPanel [data-ab-sheet="sec"][data-sec-part="${part}"]`).isVisible()) return;
  if (await page.locator('#sub').isVisible()) await page.locator('#sub [data-act="sub-close"].btn').click();
  await sheet(page).locator(`button[data-key="sec:${part}"]`).click();
  await expect(page.locator(`#subPanel [data-ab-sheet="sec"][data-sec-part="${part}"]`)).toBeVisible();
}
const closeSub = async (page: Page) => { if (await page.locator('#sub').isVisible()) await page.locator('#sub [data-act="sub-close"].btn').click(); };
async function markDone(page: Page, sid: string) { await openPlanSession(page, sid); await page.keyboard.press('Escape'); await page.locator(`[data-act="sess-toggle"][data-sid="${sid}"]`).first().click(); }
async function typeIn(page: Page, id: string, raw: string) {
  const part = /^sec-b-/.test(id) ? null : id.split('-')[1];
  if (part) await partSheet(page, part); else if (!(await page.locator('#subPanel #' + id).isVisible())) await partSheet(page, 'main');
  const el = page.locator('#subPanel #' + id); await el.click(); await el.fill(''); await el.pressSequentially(raw, { delay: 5 }); await el.blur();
}
const ctxOf = (state: any, plan: any) => ({ today: TODAY, now: Date.now(), state, baseWeeks: plan.weeks, planMeta: plan.meta || {}, profile: state.profile, goals: [] } as any);

test('Abschnitte von Hand: eintippen, neu laden, Gesamtwerte, Zone im Hauptteil, Coach bewertet nur den Hauptteil', async ({ page }) => {
  test.setTimeout(120000);
  await seedIt(page); await open(page, '/?go=plan');
  await markDone(page, 's35-run');
  await openSec(page, 's35-run');
  // geplante Minuten stehen grau im Feld
  await partSheet(page, 'warm');
  await expect(page.locator('#subPanel #sec-warm-min')).toHaveAttribute('placeholder', '10');
  await typeIn(page, 'sec-warm-min', '10'); await typeIn(page, 'sec-warm-hr', '118');
  await typeIn(page, 'sec-main-min', '45 min'); await typeIn(page, 'sec-main-km', '7,5 km'); await typeIn(page, 'sec-main-hr', '147 bpm'); await typeIn(page, 'sec-main-maxHr', '158');
  await typeIn(page, 'sec-cool-min', '5'); await typeIn(page, 'sec-cool-hr', '124');
  // ungültig: Meldung, alter Wert bleibt
  await typeIn(page, 'sec-main-hr', '400');
  await expect(page.locator('.toast').last()).toContainText(/Puls/);
  await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
  await openSec(page, 's35-run');
  await partSheet(page, 'main');
  await expect(page.locator('#subPanel #sec-main-hr')).toHaveValue('147');
  await expect(page.locator('#subPanel #sec-main-km')).toHaveValue('7,5');
  await expect(page.locator('#subPanel #sec-main-min')).toHaveValue('45');
  await noOverflow(page, '#subPanel');
  await closeSub(page);
  await noOverflow(page, '#sheetPanel');
  await expect(sheet(page).locator('button[data-key="sec:main"]')).toContainText('45 min · 7,5 km · Puls 147');
  await expect(sheet(page).locator('[data-sec-main]')).toHaveText('Hauptteil 45 min, Ø Puls 147 (Zone 2)');
  // Gesamtwerte aus den Abschnitten: 60 min, Ø Puls zeitgewichtet
  await expect(sheet(page).locator('#fd-min')).toHaveValue('60');
  await expect(sheet(page).locator('#fd-hr')).toHaveValue(String(Math.round((10 * 118 + 45 * 147 + 5 * 124) / 60)));
  await expect(sheet(page).locator('[data-zone]')).toContainText('Zone 2 wie geplant (Hauptteil)');
  const st = await stored(page);
  expect(st.sessions['s35-run'].metrics.sections.find((r: any) => r.part === 'main')).toMatchObject({ part: 'main', min: '45', km: '7.5', hr: '147', maxHr: '158' });
  // Coach-Kontext: dieselben Funktionen wie die Bewertung
  const plan = await page.evaluate(() => JSON.parse(localStorage.getItem('ec_plan')!));
  const ctx = ctxOf(st, plan);
  const d = doneItems(ctx, TODAY, TODAY).find(x => x.key === 's35-run')!;
  const r = reviewOne(ctx, d);
  expect(r.good.join(' ')).toContain('Puls im Hauptteil Ø 147 in Zone 2');
  expect(r.good.join(' ')).toContain('10 min Aufwärmen und 5 min Ausklang nicht mitgezählt');
  expect(r.better.join(' ')).not.toMatch(/zu locker|eher locker/);
  expect(valueFacts(ctx).items.some(x => x.v.hr === 147)).toBe(true);
});

test('Schwimmen: vier Abschnitte; Intervalle: nur Aufwärmen und Ausklang zusätzlich zu den Wiederholungen', async ({ page }) => {
  test.setTimeout(90000);
  await seedIt(page); await open(page, '/?go=plan');
  await markDone(page, 's35-swim');
  await openSec(page, 's35-swim');
  // Auftrag 37: Einschwimmen → Technik → Satz (die Hauptserie) → Ausschwimmen in einer Liste
  await expect(sheet(page).locator('.ab-item')).toHaveCount(4);
  await expect(sheet(page).locator('.ab-sec[data-sec-part]')).toHaveCount(3);
  await expect(sheet(page).locator('[data-sec-part="tech"]')).toContainText('Technik');
  await expect(sheet(page).locator('.ab-item').nth(2)).toContainText('4 × 100 m Kraul');
  await partSheet(page, 'warm');
  await expect(page.locator('#subPanel #sec-warm-meters')).toHaveAttribute('placeholder', '200');
  await typeIn(page, 'sec-tech-meters', '200 m'); await typeIn(page, 'sec-tech-min', '6'); await typeIn(page, 'sec-tech-pace100', '2:55');
  await expect(page.locator('#subPanel #sec-tech-pace100')).toHaveValue('2:55');
  await closeSub(page);
  await expect(sheet(page).locator('button[data-key="sec:tech"]')).toContainText('200 m');
  await page.keyboard.press('Escape');
  await markDone(page, 's35-iv');
  await openSec(page, 's35-iv');
  await expect(sheet(page).locator('.ab-sec[data-sec-part]')).toHaveCount(2);
  await expect(sheet(page).locator('[data-sec-part="main"]')).toHaveCount(0);
  await expect(sheet(page).locator('[data-intervals]')).toBeVisible();
});

test('Uhrdaten: Hauptteil automatisch erkannt, Grenze korrigieren und zurücksetzen', async ({ page }) => {
  test.setTimeout(90000);
  await seedIt(page, true); await open(page, '/?go=plan');
  await openSec(page, 's35-run');
  await expect(sheet(page).locator('[data-sec-main]')).toContainText(/^Hauptteil 4\d min, Ø Puls 14\d \(Zone 2\), 100 % der Zeit in Zone 2$/);
  await partSheet(page, 'main');
  await expect(page.locator('#subPanel [data-sec-bounds]')).toContainText('Aufwärmen bis Minute 10');
  await expect(page.locator('#subPanel [data-sec-bounds]')).toContainText('Ausklang ab Minute 55');
  await typeIn(page, 'sec-b-warm', '15');
  await expect(sheet(page).locator('[data-sec-main]')).toContainText('Hauptteil 40 min');
  expect((await stored(page)).sessions['s35-run'].metrics.sectionBounds).toEqual({ warm: 15, cool: null });
  await typeIn(page, 'sec-b-cool', '5');
  await expect(page.locator('.toast').last()).toContainText('nach dem Aufwärmen');
  await page.locator('#subPanel [data-act="sec-bound-reset"]').click();
  await closeSub(page);
  await expect(sheet(page).locator('[data-sec-main]')).toContainText(/Hauptteil 4[45] min/);
  // Gesamtwerte der Uhr bleiben unverändert (nur der Hauptteil wird anders bewertet)
  await expect(sheet(page).locator('#fd-hr')).toHaveValue('139');
});
