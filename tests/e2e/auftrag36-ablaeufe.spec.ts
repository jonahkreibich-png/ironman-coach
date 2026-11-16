/* Auftrag 36: weitere echte Abläufe per Klick – Kraft „Wie letztes Mal“ (Übungen und Gewichte übernehmen, ein Gewicht ändern, neu laden),
   Kraft-Score aus den Übungen, Gesamt-Form „Warum?“ (Frische und Leistungs-Scores zählen nicht doppelt), Prognose mit ehrlichem Hinweis,
   wenn Schwelle und VO2max der Uhr weit auseinanderliegen. */
import { test, expect } from './storage-harness';
import { type Page } from '@playwright/test';
import { seed, open, openPlanSession, stored, TODAY, YESTERDAY } from './helpers';

const EX = [{ name: 'Kniebeuge', sets: 3, reps: '8', kg: 40 }, { name: 'Ausfallschritt', sets: 3, reps: '10', kg: 10 }, { name: 'Unterarmstütz', sets: 3, reps: '45 s', kg: null }, { name: 'Rudern am Band', sets: 3, reps: '12', kg: null }, { name: 'Liegestütz', sets: 3, reps: '10', kg: null }];
async function seedStrength(page: Page, withLast = true) {
  await seed(page, { extra: (d: any) => {
    const days = d.plan.weeks.flatMap((w: any) => w.days);
    days.find((x: any) => x.date === YESTERDAY).sessions.push({ id: 'k-gestern', sport: 'strength', title: 'Kraft Ganzkörper', plannedMinutes: 40 });
    days.find((x: any) => x.date === TODAY).sessions.push({ id: 'k-heute', sport: 'strength', title: 'Kraft Ganzkörper', plannedMinutes: 40 });
    d.sessions = { ...(d.sessions || {}), ...(withLast ? { 'k-gestern': { completed: true, metrics: { min: '40', exercises: EX }, metricsSrc: { min: 'manual', exercises: 'manual' } } } : {}), 'k-heute': { completed: true, metrics: { min: '40' }, metricsSrc: { min: 'manual' } } };
    d.profile = { ...(d.profile || {}), weightKg: 72, sports: [...new Set([...((d.profile || {}).sports || []), 'strength'])] };
  } });
}
const sheet = (page: Page) => page.locator('#sheetPanel');

test('Kraft: „Wie letztes Mal“ übernimmt Übungen und Gewichte, ein Gewicht ändern, neu laden', async ({ page }) => {
  await seedStrength(page); await open(page, '/?go=plan');
  await openPlanSession(page, 'k-heute');
  const btn = sheet(page).locator('[data-act="fd-ex-last"]');
  await expect(btn).toContainText('Wie letztes Mal (13.10.: 5 Übungen mit Gewichten)');
  await btn.click();
  await expect(page.locator('#toast')).toContainText('vom 13.10. übernommen');
  const kg = sheet(page).locator('[data-exercises] input[data-f="kg"]').first();
  await expect(kg).toHaveValue('40');
  await kg.fill('42,5'); await kg.blur();
  await expect.poll(async () => (await stored(page)).sessions['k-heute']?.metrics?.exercises?.[0]?.kg).toBe(42.5);
  await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
  await openPlanSession(page, 'k-heute');
  await expect(sheet(page).locator('[data-exercises] input[data-f="name"]').nth(4)).toHaveValue('Liegestütz');
  await expect(sheet(page).locator('[data-exercises] input[data-f="kg"]').first()).toHaveValue('42.5');
});

test('Kraft-Score: mit Übungen Umfang, Abdeckung und Steigerung; ohne Übungen ehrlich „nur Regelmäßigkeit bekannt“', async ({ page }) => {
  await seedStrength(page); await open(page, '/?go=fortschritt');
  await page.locator('[data-act="score-open"][data-sport="strength"]').click();
  await expect(sheet(page).locator('[data-part="cover"]')).toContainText('Abdeckung Triathlon');
  await expect(sheet(page).locator('[data-part="cover"]')).toContainText('5 von 5 Bereichen');
  await expect(sheet(page).locator('[data-part="vol"]')).toBeVisible();
});
test('Kraft-Score ohne Übungen: Hinweis, wie man mit wenig Aufwand mehr einträgt', async ({ page }) => {
  await seedStrength(page, false); await open(page, '/?go=fortschritt');
  await page.locator('[data-act="score-open"][data-sport="strength"]').click();
  await expect(sheet(page)).toContainText('Nur Regelmäßigkeit bekannt');
  await expect(sheet(page)).toContainText('Wie letztes Mal');
});

test('Gesamt-Form „Warum?“: zählt die Belastung, Frische und Leistungs-Scores nicht doppelt', async ({ page }) => {
  await seed(page); await open(page, '/?go=fortschritt');
  const why = page.locator('[data-form-why]');
  await why.locator('summary').click();
  await expect(why).toContainText('Zählt: deine Trainingsbelastung');
  await expect(why).toContainText('Frische (TSB');
  await expect(why).toContainText('sonst würde Leistung doppelt zählen');
});

test('Prognose: Schwelle hochgerechnet und VO2max der Uhr weit auseinander → ehrlicher Hinweis und Lauftest-Vorschlag', async ({ page }) => {
  await seed(page, { extra: (d: any) => {
    d.profile = { ...(d.profile || {}), sports: [...new Set([...((d.profile || {}).sports || []), 'run'])], thresholds: { ...((d.profile || {}).thresholds || {}), thresholdPaceRunSec: 339, source: 'Trend aus deinen Einheiten (04.11.)', estimated: [], vo2max: 57.5 } };
    d.trend = [...(d.trend || []), { date: YESTERDAY, vo2max: 57.5 }];
    d.goals = { 'g-10': { id: 'g-10', type: 'run_10k', name: '10 km Frühjahr', date: '2027-03-14', priority: 'A' } };
  } });
  await open(page, '/?go=fortschritt');
  const src = page.locator('[data-sources]').first();
  // die Demo-Tageswerte haben eigene VO2max-Werte (neuester gewinnt); die Schwelle kommt aus den Läufen
  await expect(src).toContainText(/Deine Uhr schätzt VO2max 5\d,\d – das passt zu einer Schwelle von etwa 3:\d\d\/km/);
  await expect(src).toContainText('aus lockeren Läufen hochgerechnet');
  await expect(page.locator('[data-missing]').first()).toContainText('30-min-Lauftest');
});
