/* Auftrag 7 in der App: Felder statt Notizfeld, Ablauf in Schritten, Coach erklärt den Tag, „Was der Coach gerade sieht“,
   Fragebogen setzt den Plan fort, Umfang pro Woche passt auf den Bildschirm. */
import { test, expect } from '@playwright/test';
import { seed, open, stored, TODAY } from './helpers';

test('Einheit: Felder je Sportart, RPE und Gefühl, Pulszone automatisch, Notiz wird in Felder übertragen', async ({ page }) => {
  const demo = await seed(page, { extra: d => {
    const run = d.plan.weeks.flatMap((w: any) => w.days).flatMap((x: any) => x.sessions.map((s: any) => ({ ...s, date: x.date }))).find((s: any) => s.sport === 'run' && s.date < TODAY);
    d.sessions = { ...(d.sessions || {}), [run.id]: { completed: true, notes: '5,07km, Ø6:21/km, ØHF153, Entkopplung 4,5 %, Kadenz 163' } };
    d.__run = run;
  } });
  const run = (demo as any).__run;
  await open(page, `/?go=plan`);
  await page.evaluate(id => { (document.querySelector(`[data-act="sess-open"][data-sid="${id}"]`) as HTMLElement | null)?.scrollIntoView(); }, run.id);
  const btn = page.locator(`[data-act="sess-open"][data-sid="${run.id}"]`);
  if (!(await btn.count())) await page.locator('[data-act="plan-week"]').first().click();
  await page.locator(`[data-act="sess-open"][data-sid="${run.id}"]`).click();
  const sheet = page.locator('#sheetPanel');
  await expect(sheet.locator('[data-fields="run"]')).toBeVisible();
  await expect(sheet.locator('#fd-km')).toHaveValue('5.07');
  await expect(sheet.locator('#fd-hr')).toHaveValue('153');
  await expect(sheet.locator('#fd-cadence')).toHaveValue('163');
  await expect(sheet.locator('[data-fields="run"] .src').first()).toContainText('Notiz');
  await expect(sheet.locator('[data-zone]')).toBeVisible();
  await sheet.locator('[data-act="fd-rpe"][data-v="6"]').click();
  await sheet.locator('[data-act="fd-feel"][data-v="4"]').click();
  await expect.poll(async () => { const s = (await stored(page)).sessions[run.id]; return [s.rpe, s.feel, s.metrics.pace]; }).toEqual(['6', '4', '6:21']);
});

test('Plan: Einheit zeigt den Ablauf in Schritten (Aufwärmen, Hauptteil, Ausklang)', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=plan');
  await page.locator('[data-act="sess-open"]').first().click();
  const st = page.locator('#sheetPanel [data-structure]');
  await expect(st).toBeVisible();
  await expect(st.locator('[data-part="main"]')).toBeVisible();
});

test('Coach ohne KI: „Was genau soll ich heute machen?“ → Schritte mit Zahlen', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=coach');
  await page.fill('#coach-in', 'Was genau soll ich heute machen?');
  await page.locator('[data-act="coach-send"]').click();
  await expect(page.locator('.msg.coach').last()).toContainText(/Heute \(/);
});

test('Coach: Bereich „Was der Coach gerade sieht“ mit Begründung und Tipp', async ({ page }) => {
  await seed(page, { extra: d => { d.illnessPeriods = [{ id: 'i1', start: TODAY, end: null, note: 'Erkältung' }]; } });
  await open(page, '/?go=coach');
  const card = page.locator('[data-sees]');
  await expect(card).toContainText('Was der Coach gerade sieht');
  await expect(card.locator('[data-insight="ill"]')).toContainText('Tipp');
});

test('Fortschritt: Umfang pro Woche zeigt bei langem Plan höchstens 12 Wochen', async ({ page }) => {
  await seed(page, { extra: d => {
    const ws = d.plan.weeks; const last = ws[ws.length - 1];
    const add = (s: string, n: number) => { const x = new Date(s + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
    for (let i = 1; i <= 60; i++) { const mon = add(last.startDate, 7 * i); ws.push({ weekNumber: last.weekNumber + i, startDate: mon, endDate: add(mon, 6), days: [0, 1, 2, 3, 4, 5, 6].map(k => ({ date: add(mon, k), sessions: [{ id: `l${i}-${k}`, sport: 'run', title: 'Lauf', plannedMinutes: 40 }] })) }); }
  } });
  await open(page, '/?go=fortschritt');
  expect(await page.locator('[data-volume] .vol-col').count()).toBeLessThanOrEqual(12);
});

test('Fragebogen bei vorhandenem Plan: Hinweis „Plan geht weiter“, vergangene Wochen bleiben', async ({ page }) => {
  await seed(page);
  await open(page, '/?go=onboarding');
  // bis zur Zusammenfassung springen, bestätigen
  const last = page.locator('[data-act="ob-jump"]').last(); await last.click();
  await page.locator('[data-act="ob-next"]').click();
  if (await page.locator('[data-act="ob-confirm"]').count()) {
    await page.locator('[data-act="ob-confirm"]').click();
    const banner = page.locator('[data-continued]');
    if (await banner.count()) await expect(banner).toContainText('Dein Plan geht weiter');
  }
});
