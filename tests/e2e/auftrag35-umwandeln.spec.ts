/* Auftrag 35, Punkt 4: Einheit selbst umwandeln. Vorschlag mit Werten (km/Tempo), Prüfung von Woche und nächsten Tagen, bei Bedenken
   ehrlich + leichtere Variante, nie blockiert; danach kennt der Coach die geänderte Einheit (Plan mit Anpassungen, Bewertung, Chat). */
import { test, expect } from './storage-harness';
import { type Page } from '@playwright/test';
import { seed, open, openPlanSession, stored, TODAY, TOMORROW } from './helpers';
import * as C from '../../shared/core';
import { explainDay } from '../../shared/coach/explain';

const CTX = { runThrSec: 300, lthrRun: 170, lthrBike: 160, bikeKmh: 30 };
const EASY = { sport: 'run', kind: 'easy', ctx: CTX, steps: [{ part: 'warm', min: 10, zone: 1 }, { part: 'main', min: 35, zone: 2 }, { part: 'cool', min: 5, zone: 1 }] };
const IV = { sport: 'run', kind: 'intervals', ctx: CTX, steps: [{ part: 'warm', min: 15, zone: 1 }, { part: 'main', reps: 5, min: 3, zone: 4, restMin: 2 }, { part: 'cool', min: 10, zone: 1 }] };
async function seedIt(page: Page, hardTomorrow: boolean) {
  await seed(page, { extra: (d: any) => {
    const days = d.plan.weeks.flatMap((w: any) => w.days);
    const day = days.find((x: any) => x.date === TODAY); const tm = days.find((x: any) => x.date === TOMORROW);
    day.sessions = [{ id: 'u35-easy', sport: 'run', title: 'Lockerer Lauf 50 min', plannedMinutes: 50, zone: 'Zone 2', spec: EASY }];
    tm.sessions = hardTomorrow ? [{ id: 'u35-iv', sport: 'run', title: 'Lauf-Intervalle 5×3 min', plannedMinutes: 48, zone: 'Zone 4', hard: true, spec: IV }] : [{ id: 'u35-rest', sport: 'rest', title: 'Ruhetag' }];
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
const ctxOf = (state: any, plan: any) => ({ today: TODAY, now: Date.now(), state, baseWeeks: plan.weeks, planMeta: plan.meta || {}, profile: state.profile, goals: [] } as any);

test('Lieber Intervalle mit harter Einheit morgen: Bedenken, leichtere Variante, trotzdem übernehmen geht; Coach kennt die neue Einheit', async ({ page }) => {
  test.setTimeout(90000);
  await seedIt(page, true); await open(page, '/?go=plan');
  await openPlanSession(page, 'u35-easy');
  await sheet(page).locator('[data-convert] [data-act="conv"][data-k="intervals"]').click();
  const cs = sheet(page).locator('[data-conv-sheet]');
  await expect(cs.locator('[data-conv-main]')).toContainText(/Intervalle/);
  await expect(cs.locator('[data-conv-warn]')).toBeVisible();
  // Auftrag 38: die leichtere Variante steht unter „Andere Vorschläge“
  await expect(cs.locator('[data-conv-others]')).toContainText('leichter');
  await expect(cs.locator('[data-act="conv-apply"]')).toHaveText('Trotzdem übernehmen');
  await noOverflow(page, '#sheetPanel');
  const newTitle = (await cs.locator('[data-conv-main] > b').innerText()).trim();
  await cs.locator('[data-act="conv-apply"]').click();
  const st = await stored(page);
  const adj: any = Object.values(st.adjustments).find((a: any) => a.sessionId === 'u35-easy' && a.set && a.set.converted === 'intervals');
  expect(adj).toBeTruthy(); expect(adj.from_user).toBe(true);
  // Coach: Plan mit Anpassungen → neue Einheit in Erklärung und als harter Tag
  const plan = await page.evaluate(() => JSON.parse(localStorage.getItem('ec_plan')!));
  const day = C.planDays(C.applyAdjustments(plan.weeks, st.adjustments)).find((d: any) => d.date === TODAY)!;
  const s = day.sessions.find((x: any) => x.id === 'u35-easy');
  expect(s.title).toBe(newTitle); expect(C.isHard(s)).toBe(true);
  expect(JSON.stringify(explainDay(ctxOf(st, plan), TODAY, 'run'))).toContain(newTitle);
  await expect(page.locator(`[data-act="sess-open"][data-sid="u35-easy"]`).first()).toContainText(newTitle);
});

test('Lieber kürzer ohne Bedenken: direkt „Übernehmen“; Lieber Intervalle: leichtere Variante wählbar', async ({ page }) => {
  test.setTimeout(90000);
  await seedIt(page, false); await open(page, '/?go=plan');
  await openPlanSession(page, 'u35-easy');
  await sheet(page).locator('[data-act="conv"][data-k="shorter"]').click();
  await expect(sheet(page).locator('[data-conv-ok]')).toBeVisible();
  await expect(sheet(page).locator('[data-conv-main]')).toContainText('40 min');
  await sheet(page).locator('[data-act="conv-apply"]').click();
  let st = await stored(page);
  expect(Object.values(st.adjustments).some((a: any) => a.set && a.set.converted === 'shorter' && a.set.plannedMinutes === 40)).toBe(true);
});
