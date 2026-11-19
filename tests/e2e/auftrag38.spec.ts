/* Auftrag 38: Ablauf vollständig, Gemachtes gilt überall, einfacher eintragen, Umwandeln mit Vorschau. Echte Eingabe wie ein Mensch
   (Antippen, Tippen, Verlassen des Felds), WebKit (iPhone) und Chromium. Beispiele aus Jonahs Plan (Lauf 19.11., Rad 18.11.), gelten
   für alle Nutzer: die Einheiten werden aus denselben Bausteinen gebaut wie jeder Plan. */
import { test, expect } from './storage-harness';
import { type Page } from '@playwright/test';
import { seed, open, openPlanSession, stored, TODAY, TOMORROW } from './helpers';
import * as W from '../../shared/workouts';
import * as C from '../../shared/core';
import { runEasyForm } from '../../shared/workoutbuild';
import { doneItems, autoReview, reviewAnswer } from '../../shared/coach/review';
import { contextParts } from '../../shared/coach/freeai';

const CTX: W.PaceCtx = { runThrSec: 300, lthrRun: 170, lthrBike: 160, bikeKmh: 30, ftp: 250 };
const HILLS = W.build(runEasyForm('run.hillsprints', 0, CTX, 41)!);
const SS = W.build(W.bikeSweetSpot(CTX, 2, 8));
const EASY = W.build(W.runEasy(CTX, 50));
async function seed38(page: Page) {
  await seed(page, { extra: (d: any) => {
    const days = d.plan.weeks.flatMap((w: any) => w.days);
    const day = days.find((x: any) => x.date === TODAY); const tm = days.find((x: any) => x.date === TOMORROW);
    day.sessions = [{ id: 'h38', sport: 'run', ...HILLS }, { id: 'b38', sport: 'bike', hard: true, ...SS }, { id: 'e38', sport: 'run', ...EASY }];
    void tm;
    d.sessions = { ...(d.sessions || {}), h38: { completed: true, metrics: {} }, b38: { completed: true, metrics: {} } };
  } });
}
const sheet = (page: Page) => page.locator('#sheetPanel');
const sub = (page: Page) => page.locator('#subPanel');
const ab = (page: Page) => sheet(page).locator('.ablauf');
async function human(loc: ReturnType<Page['locator']>, raw: string) { await loc.click(); await loc.fill(''); await loc.pressSequentially(raw, { delay: 5 }); await loc.blur(); }
async function closeSub(page: Page) { await sub(page).locator('[data-act="sub-close"].btn').click(); await expect(page.locator('#sub')).toBeHidden(); }
const ctxOf = (state: any, plan: any) => ({ today: TODAY, now: Date.now(), state, baseWeeks: plan.weeks, planMeta: plan.meta || {}, profile: state.profile, goals: [] } as any);
const planOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('ec_plan') || '{}'));

test('Lauf mit Hügelsprints: Ablauf zeigt 10 min Aufwärmen + 20 min Z2 + 6 × 10 s Hügel + 5 min Ausklang, Summe = Einheit, Sprints ohne Puls/Pace', async ({ page }) => {
  test.setTimeout(90000);
  await seed38(page); await open(page, '/?go=plan'); await openPlanSession(page, 'h38');
  const items = ab(page).locator('.ab-list > .ab-item');
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toContainText('Aufwärmen'); await expect(items.nth(0)).toContainText('10 min');
  await expect(items.nth(1).locator('.ab-set-t')).toHaveText('20 min Zone 2');
  await expect(items.nth(2).locator('.ab-set-t')).toHaveText('6 × 10 s bergauf');
  await expect(items.nth(3)).toContainText('Ausklang'); await expect(items.nth(3)).toContainText('5 min');
  await expect(ab(page).locator('[data-sum-plan]')).toHaveText(`${HILLS.plannedMinutes} min`);
  expect(HILLS.plannedMinutes).toBe(41);
  // abgehakt ohne Werte: still wie geplant – Summe gemacht = geplant
  await expect(ab(page).locator('[data-sum-done]')).toContainText('41 min');
  const sprint = items.nth(2).locator('.ab-rep').first();
  await expect(sprint).toContainText('fast maximal');
  await expect(sprint).not.toContainText('Puls');
  await expect(sprint).not.toContainText('/km');
  await expect(sprint).toContainText('wie geplant');
});

test('Rad 2 × 8 → per [+] 3 × 10, Aufwärmen 10 statt 15: Titel, Geplant/Gemacht, Coach-Bewertung und Chat nennen 3 × 10, Belastung steigt', async ({ page }) => {
  test.setTimeout(120000);
  await seed38(page); await open(page, '/?go=plan');
  const before = await stored(page); const plan = await planOf(page);
  const loadBefore = C.sessionLoad(SS, before.sessions.b38, { ftp: 250, lthrBike: 160 });
  await openPlanSession(page, 'b38');
  await ab(page).locator('.ab-set-h').first().click();
  const top = sub(page).locator('[data-set-top]');
  await expect(top.locator('[data-set-reps]')).toHaveText('2');
  await top.locator('[data-act="iv-count"][data-d="1"]').click();
  await expect(top.locator('[data-set-reps]')).toHaveText('3');
  await human(top.locator('[data-ch="iv-same"][data-f="sec"]'), '10');
  await expect(sub(page).locator('.ab-rep')).toHaveCount(3);
  await closeSub(page);
  await expect(ab(page).locator('.ab-set-t').first()).toContainText('3 × 10 min');
  await ab(page).locator('button[data-key="sec:warm"]').click();
  await human(sub(page).locator('#sec-warm-min'), '10');
  await closeSub(page);
  // Kopf: Geplant und Gemacht nebeneinander, die Änderung in Worten
  await expect(sheet(page).locator('[data-kopf-plan]')).toContainText('45 min');
  await expect(sheet(page).locator('[data-kopf-done]')).toContainText('58 min');
  await expect(sheet(page).locator('[data-kopf-changes]')).toContainText('3 × 10 min statt 2 × 8 min');
  await expect(sheet(page).locator('[data-kopf-changes]')).toContainText('Aufwärmen 10 statt 15 min');
  await expect(ab(page).locator('[data-sum-done]')).toHaveText('58 min');
  await page.keyboard.press('Escape');
  // Titel in der Liste: das Gemachte, darunter „geplant: …“
  const row = page.locator('[data-act="sess-open"][data-sid="b38"]').first();
  await expect(row).toContainText('Rad 3 × 10 min Sweet Spot, statt 2 × 8 min');
  await expect(row).toContainText(`geplant: ${SS.title}`);
  await page.reload(); await expect(page.locator('[data-act="sess-open"][data-sid="b38"]').first()).toContainText('Rad 3 × 10 min Sweet Spot');
  // Coach (Bewertung, Chat, KI-Kontext) und Belastung lesen das Gemachte
  const st = await stored(page);
  const ctx = ctxOf(st, plan);
  const d = doneItems(ctx, TODAY, TODAY).find(x => x.key === 'b38')!;
  expect(d.title).toBe('Rad 3 × 10 min Sweet Spot, statt 2 × 8 min');
  const review = autoReview(ctx, d, 'full');
  expect(review).toContain('3 × 10 min statt 2 × 8 min – mehr Sweet-Spot-Zeit (30 min statt 16 min), gut');
  const chat = reviewAnswer(ctx, 'Wie war mein Training heute?');
  expect(chat && chat.text).toContain('3 × 10 min');
  expect(contextParts(ctx).last7).toContain('IST anders als geplant: 3 × 10 min statt 2 × 8 min');
  expect(C.sessionLoad(SS, st.sessions.b38, { ftp: 250, lthrBike: 160 })).toBeGreaterThan(loadBefore);
});

test('Gleicher Satz neu hinzugefügt → Frage „Zu Satz 1 hinzufügen?“; Ja führt zusammen', async ({ page }) => {
  test.setTimeout(90000);
  await seed38(page); await open(page, '/?go=plan'); await openPlanSession(page, 'b38');
  await ab(page).locator('[data-act="ab-add"]').click();
  await sub(page).locator('[data-act="iv-add"]').click();
  const ask = sub(page).locator('[data-merge-ask]');
  await expect(ask).toContainText('Zu Satz 1');
  await expect(ask).toContainText('hinzufügen?');
  await ask.locator('[data-act="iv-merge"]').click();
  await expect(ab(page).locator('.ab-set-t')).toHaveCount(1);
  await expect(ab(page).locator('.ab-set').first().locator('.ab-rep')).toHaveCount(3);
});

test('Umwandeln: Vorschau Vorher → Nachher, andere Vorschläge, Rückgängig, Original wiederherstellen nach Neuladen', async ({ page }) => {
  test.setTimeout(120000);
  await seed38(page); await open(page, '/?go=plan'); await openPlanSession(page, 'e38');
  await sheet(page).locator('[data-convert] [data-act="conv"][data-k="intervals"]').click();
  const cs = sheet(page).locator('[data-conv-sheet]');
  const cmp = cs.locator('[data-conv-compare]');
  for (const k of ['title', 'amount', 'ablauf', 'load', 'week']) await expect(cmp.locator(`[data-cmp="${k}"]`)).toBeVisible();
  await expect(cmp.locator('[data-cmp="title"]')).toContainText(EASY.title);
  const others = cs.locator('[data-conv-others] [data-act="conv-pick"]');
  expect(await others.count()).toBeGreaterThanOrEqual(2);
  // anderen Vorschlag wählen: Vorschau wechselt
  const t0 = (await cs.locator('[data-conv-main] > b').innerText()).trim();
  await others.first().click();
  const t1 = (await sheet(page).locator('[data-conv-main] > b').innerText()).trim();
  expect(t1).not.toBe(t0);
  await sheet(page).locator('[data-act="conv-apply"]').click();
  // Rückgängig direkt danach
  await expect(page.locator('#toast')).toContainText('Umgewandelt');
  await page.locator('#toast .toast-act').click();
  await expect.poll(async () => Object.values((await stored(page)).adjustments).filter((a: any) => a.sessionId === 'e38' && !a.undone).length).toBe(0);
  await openPlanSession(page, 'e38'); await expect(page.locator('#sheetPanel .sheet-h h2')).toHaveText(EASY.title); await page.keyboard.press('Escape');
  // nochmals umwandeln, neu laden, Original wiederherstellen
  await openPlanSession(page, 'e38');
  await sheet(page).locator('[data-convert] [data-act="conv"][data-k="intervals"]').click();
  await sheet(page).locator('[data-act="conv-apply"]').click();
  // erst gespeichert (wie ein Mensch, der nicht in derselben Millisekunde neu lädt), dann neu laden
  await expect.poll(async () => Object.values((await stored(page)).adjustments).filter((a: any) => a.sessionId === 'e38' && !a.undone).length).toBe(1);
  await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
  await openPlanSession(page, 'e38');
  await expect(sheet(page).locator('[data-conv-orig]')).toContainText(EASY.title);
  await sheet(page).locator('[data-act="conv-restore"]').click();
  await expect(page.locator('#toast')).toContainText('Original wiederhergestellt');
  await expect(sheet(page).locator('[data-conv-orig]')).toHaveCount(0);
  const st = await stored(page);
  expect(Object.values(st.adjustments).filter((a: any) => a.sessionId === 'e38' && !a.undone)).toHaveLength(0);
});

test('Heute ohne min/km-Umschalter; Minuten und km stehen zusammen und passen bei 320-430 px', async ({ page }) => {
  test.setTimeout(90000);
  await seed38(page); await open(page, '/?go=heute');
  await expect(page.locator('[data-plan-view], [data-act="plan-view"]')).toHaveCount(0);
  for (const w of [320, 360, 390, 430]) {
    await page.setViewportSize({ width: w, height: 800 });
    const bad = await page.evaluate(() => {
      const W = document.documentElement.clientWidth; const out: string[] = [];
      if (document.documentElement.scrollWidth > W + 1) out.push('Seite scrollt seitlich');
      document.querySelectorAll('.session-hero *').forEach(el => { const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) out.push(el.tagName + ' ' + (el.textContent || '').trim().slice(0, 30)); });
      document.querySelectorAll('.session-hero .t, .session-hero .m').forEach(el => { const e = el as HTMLElement; if (e.scrollWidth > e.clientWidth + 1) out.push('abgeschnitten: ' + e.textContent); });
      return out.slice(0, 5);
    });
    expect(bad, `${w} px`).toEqual([]);
  }
});
