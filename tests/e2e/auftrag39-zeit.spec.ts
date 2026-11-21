/* Auftrag 39: Zeit-, Dauer- und Pace-Eingabe ohne Doppelpunkt. Echte Eingabe wie ein Mensch (Antippen, Ziffern tippen, Feld verlassen)
   in WebKit (iPhone) und Chromium – für JEDES Zeit- bzw. Pace-Feld: Einheiten-Werte, Testfelder, km-Abschnitte, Ablauf (Wiederholung,
   ganzer Satz, Pause, Abschnitte), Kraft (Haltezeit, Pause), Schwellen (Profil/Zonen), Ziel (Wunsch- und Ergebniszeit), Wettkampf,
   Fragebogen (Bestzeiten, Wunschzeit, Minuten), Können/Teamsport, Plan bearbeiten, Morgenwerte.
   Geprüft: Zahlentastatur mit Komma (inputmode decimal), Doppelpunkt kommt von selbst, „= …“ unter dem Feld, gespeicherter Wert,
   unklare Eingabe → Nachfrage (bis zur Antwort bleibt der alte Wert), nach dem Neuladen dieselbe Zeit. */
import { test, expect } from './storage-harness';
import { type Page, type Locator } from '@playwright/test';
import { seed, open, openPlanSession, stored, TODAY, YESTERDAY } from './helpers';
import * as W from '../../shared/workouts';

const CTX: W.PaceCtx = { runThrSec: 300, lthrRun: 170, lthrBike: 160, bikeKmh: 30, ftp: 250 };
const RUNIV = W.build(W.runIntervals(CTX, 4, 4, 2));
async function seed39(page: Page, extra?: (d: any) => void) {
  await seed(page, { extra: (d: any) => {
    const day = d.plan.weeks.flatMap((w: any) => w.days).find((x: any) => x.date === TODAY);
    day.sessions = [
      { id: 'lt39', sport: 'run', title: 'Lauftest 30 min', plannedMinutes: 50 },
      { id: 'st39', sport: 'swim', title: 'Schwimmtest CSS', plannedMinutes: 45 },
      { id: 'iv39', sport: 'run', ...RUNIV },
      { id: 'kr39', sport: 'strength', title: 'Kraft Rumpf', plannedMinutes: 30, spec: { sport: 'strength', kind: 'strength', ctx: {}, steps: [{ part: 'main', min: 30 }], exercises: [{ name: 'Unterarmstütz (Plank)', sets: 3, reps: '45 s', restSec: 60 }, { name: 'Kniebeuge', sets: 3, reps: '10', restSec: 90 }] } }
    ];
    d.sessions = { ...(d.sessions || {}), lt39: { completed: true, metrics: {} }, st39: { completed: true, metrics: {} }, iv39: { completed: true, metrics: {} }, kr39: { completed: true, metrics: {} } };
    if (extra) extra(d);
  } });
}
const sheet = (page: Page) => page.locator('#sheetPanel');
const sub = (page: Page) => page.locator('#subPanel');
const ab = (page: Page) => sheet(page).locator('.ablauf');
const hintOf = (loc: Locator) => loc.locator('xpath=following-sibling::*[@data-tf-hint][1]');
/** wie ein Mensch: antippen, leeren, Ziffern tippen; prüft die Anzeige beim Tippen und die Zeile darunter, dann Feld verlassen */
async function typeTime(loc: Locator, raw: string, shown: string, hint?: string | RegExp) {
  await loc.click(); await loc.fill(''); await loc.pressSequentially(raw, { delay: 15 });
  await expect(loc).toHaveValue(shown);
  if (hint) await expect(hintOf(loc)).toContainText(hint);
  await loc.blur();
}
async function decimalPad(loc: Locator) { await expect(loc).toHaveAttribute('inputmode', 'decimal'); }
const openDetails = (page: Page) => page.evaluate(() => document.querySelectorAll('#sheetPanel [data-fields] details').forEach(d => { (d as HTMLDetailsElement).open = true; }));
async function closeSub(page: Page) { await sub(page).locator('[data-act="sub-close"].btn').click(); await expect(page.locator('#sub')).toBeHidden(); }

test('Einheit Laufen: Dauer, Pace, Test-Pace und km-Abschnitt nur mit Ziffern; „5,3“ fragt nach; nach Neuladen gleich', async ({ page }) => {
  test.setTimeout(120000);
  await seed39(page); await open(page, '/?go=plan'); await openPlanSession(page, 'lt39'); await openDetails(page);
  const min = sheet(page).locator('#fd-min'); await decimalPad(min);
  await typeTime(min, '4530', '45:30', '= 45 min 30 s');
  await expect.poll(async () => (await stored(page)).sessions.lt39.metrics.min).toBe('45.5');
  await expect(min).toHaveValue('45,5');
  await typeTime(min, '45,30', '45,30', '= 45 min 30 s');
  await expect.poll(async () => (await stored(page)).sessions.lt39.metrics.min).toBe('45.5');
  // „45,3“ ist unklar: Nachfrage, gespeichert bleibt 45,5 bis zur Antwort
  await typeTime(min, '45,3', '45,3');
  const ask = hintOf(min);
  await expect(ask.locator('[data-act="tf-pick"]')).toHaveCount(2);
  await expect(ask).toContainText('45 min 18 s'); await expect(ask).toContainText('45 min 30 s');
  expect((await stored(page)).sessions.lt39.metrics.min).toBe('45.5');
  await ask.locator('[data-act="tf-pick"]', { hasText: '45 min 18 s' }).click();
  await expect.poll(async () => (await stored(page)).sessions.lt39.metrics.min).toBe('45.3');
  // Pace
  const pace = sheet(page).locator('#fd-pace'); await decimalPad(pace);
  await typeTime(pace, '530', '5:30', '= 5 min 30 s pro km');
  await expect.poll(async () => (await stored(page)).sessions.lt39.metrics.pace).toBe('5:30');
  await typeTime(pace, '5,3', '5,3');
  await expect(hintOf(pace).locator('[data-act="tf-pick"]')).toHaveText(['5:30', '5:18 (5,3 min)']);
  expect((await stored(page)).sessions.lt39.metrics.pace).toBe('5:30');
  await hintOf(pace).locator('[data-act="tf-pick"]', { hasText: '5:18' }).click();
  await expect.poll(async () => (await stored(page)).sessions.lt39.metrics.pace).toBe('5:18');
  await expect(pace).toHaveValue('5:18');
  // unrealistisch: Meldung, alter Wert bleibt
  await typeTime(pace, '130', '1:30');
  await expect(page.locator('.toast').last()).toContainText(/unrealistisch/);
  expect((await stored(page)).sessions.lt39.metrics.pace).toBe('5:18');
  // Test-Pace (nur bei Tests)
  const tp = sheet(page).locator('#fd-testPace');
  await typeTime(tp, '440', '4:40', '= 4 min 40 s pro km');
  await expect.poll(async () => (await stored(page)).sessions.lt39.metrics.testPace).toBe('4:40');
  // km-Abschnitt (vorher Zahlentastatur ohne Komma)
  await sheet(page).locator('[data-act="fd-split-add"]').click();
  const sp = sheet(page).locator('#fd-split-0'); await decimalPad(sp);
  await typeTime(sp, '612', '6:12', '= 6 min 12 s pro km');
  await expect.poll(async () => (await stored(page)).sessions.lt39.metrics.splits?.[0]?.pace).toBe('6:12');
  // neu laden: dieselben Zeiten
  await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
  await openPlanSession(page, 'lt39'); await openDetails(page);
  await expect(sheet(page).locator('#fd-min')).toHaveValue('45,3');
  await expect(sheet(page).locator('#fd-pace')).toHaveValue('5:18');
  await expect(sheet(page).locator('#fd-testPace')).toHaveValue('4:40');
  await expect(sheet(page).locator('#fd-split-0')).toHaveValue('6:12');
});

test('Schwimmtest: Pace, 25-m-Zeit, 400 m / 200 m Kraul und 200 m Brust nur mit Ziffern', async ({ page }) => {
  test.setTimeout(120000);
  await seed39(page); await open(page, '/?go=plan'); await openPlanSession(page, 'st39'); await openDetails(page);
  const cases: [string, string, string, string][] = [['pace100', '215', '2:15', '2:15'], ['paceBreast', '2,45', '2,45', '2:45'], ['crawl25', '35', '35', '0:35'], ['css400', '830', '8:30', '8:30'], ['css200', '405', '4:05', '4:05'], ['breast200', '410', '4:10', '4:10']];
  for (const [k, raw, shown, saved] of cases) {
    const loc = sheet(page).locator(`#fd-${k}`); await decimalPad(loc);
    await typeTime(loc, raw, shown, '=');
    await expect.poll(async () => (await stored(page)).sessions.st39.metrics[k], k).toBe(saved);
  }
  await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
  await openPlanSession(page, 'st39'); await openDetails(page);
  for (const [k, , , saved] of cases) await expect(sheet(page).locator(`#fd-${k}`), k).toHaveValue(saved);
});

test('Ablauf: Wiederholung (Dauer, Pace, Pause), ganzer Satz und Abschnitt nur mit Ziffern', async ({ page }) => {
  test.setTimeout(120000);
  await seed39(page); await open(page, '/?go=plan'); await openPlanSession(page, 'iv39');
  // ganzer Satz: Dauer und Pause
  await ab(page).locator('.ab-set-h').first().click();
  await expect(sub(page).locator('[data-ab-sheet="set"]')).toBeVisible();
  const setDur = sub(page).locator('[data-set-top] input[data-f="sec"]'); await decimalPad(setDur);
  await typeTime(setDur, '415', '4:15', '= 4 min 15 s');
  await expect.poll(async () => ((await stored(page)).sessions.iv39.metrics.intervals || []).filter((r: any) => r.sec === 255).length).toBe(4);
  const setRest = sub(page).locator('[data-set-top] input[data-f="restSec"]');
  await typeTime(setRest, '130', '1:30', '= 1 min 30 s');
  await expect.poll(async () => ((await stored(page)).sessions.iv39.metrics.intervals || []).filter((r: any) => r.restSec === 90).length).toBe(3);
  await closeSub(page);
  // eine Wiederholung: Dauer, Pace, Pause
  await ab(page).locator('.ab-rep').first().click();
  await expect(sub(page).locator('[data-ab-sheet="rep"]')).toBeVisible();
  const i = await sub(page).locator('[data-ab-sheet="rep"]').getAttribute('data-iv-row');
  const dur = sub(page).locator(`#iv-${i}-sec`), pace = sub(page).locator(`#iv-${i}-pace`), rest = sub(page).locator(`#iv-${i}-restSec`);
  for (const l of [dur, pace, rest]) await decimalPad(l);
  await typeTime(dur, '402', '4:02', '= 4 min 2 s');
  await typeTime(pace, '412', '4:12', '= 4 min 12 s pro km');
  await typeTime(rest, '90', '90', '= 1 min 30 s');
  await expect.poll(async () => (await stored(page)).sessions.iv39.metrics.intervals[+i!]).toMatchObject({ sec: 242, pace: '4:12', restSec: 90 });
  // unklar „4,1“: Nachfrage, gespeichert bleibt 4:12
  await typeTime(pace, '4,1', '4,1');
  await expect(hintOf(pace).locator('[data-act="tf-pick"]')).toHaveText(['4:10', '4:06 (4,1 min)']);
  expect((await stored(page)).sessions.iv39.metrics.intervals[+i!].pace).toBe('4:12');
  await hintOf(pace).locator('[data-act="tf-pick"]', { hasText: '4:10' }).click();
  await expect.poll(async () => (await stored(page)).sessions.iv39.metrics.intervals[+i!].pace).toBe('4:10');
  await closeSub(page);
  // Abschnitt Aufwärmen: „1230“ = 12:30 (Minuten:Sekunden), Pace
  await ab(page).locator('button[data-key="sec:warm"]').click();
  await expect(sub(page).locator('[data-ab-sheet="sec"]')).toBeVisible();
  const wmin = sub(page).locator('#sec-warm-min'); await decimalPad(wmin);
  await typeTime(wmin, '1230', '12:30', '= 12 min 30 s');
  await expect.poll(async () => (await stored(page)).sessions.iv39.metrics.sections?.find((r: any) => r.part === 'warm')?.min).toBe('12.5');
  await typeTime(wmin, '5:30', '5:30', '= 5 min 30 s');
  await expect.poll(async () => (await stored(page)).sessions.iv39.metrics.sections?.find((r: any) => r.part === 'warm')?.min).toBe('5.5');
  const wp = sub(page).locator('#sec-warm-pace');
  await typeTime(wp, '615', '6:15', '= 6 min 15 s pro km');
  await expect.poll(async () => (await stored(page)).sessions.iv39.metrics.sections?.find((r: any) => r.part === 'warm')?.pace).toBe('6:15');
});

test('Kraft: Haltezeit und Pause als Zeit (45 = 0:45, 130 = 1:30, 90 = 90 s)', async ({ page }) => {
  test.setTimeout(90000);
  await seed39(page); await open(page, '/?go=plan'); await openPlanSession(page, 'kr39');
  await ab(page).locator('.ab-ex').first().locator('.ab-row').click();
  const hold = sub(page).locator('#ex-0-reps'); await decimalPad(hold);
  await expect(hold).toHaveValue('0:45');
  await typeTime(hold, '130', '1:30', '= 1 min 30 s');
  await expect.poll(async () => (await stored(page)).sessions.kr39.metrics.exercises?.[0]?.reps).toBe('90 s');
  const rest = sub(page).locator('#ex-0-restSec');
  await typeTime(rest, '90', '90', '= 1 min 30 s');
  await expect.poll(async () => (await stored(page)).sessions.kr39.metrics.exercises?.[0]?.restSec).toBe(90);
  await closeSub(page);
  await expect(ab(page).locator('.ab-ex').first()).toContainText(/90 s|1:30/);
  // Wiederholungs-Übung bleibt ein Textfeld (10 Wiederholungen)
  await ab(page).locator('.ab-ex').nth(1).locator('.ab-row').click();
  await expect(sub(page).locator('#ex-1-reps')).not.toHaveAttribute('data-tfkind', /.+/);
  await expect(sub(page).locator('#ex-1-restSec')).toHaveValue('1:30');
});

test('Schwellen: Laufpace und CSS nur mit Ziffern, Nachfrage bei „4,3“', async ({ page }) => {
  await seed39(page); await open(page, '/?go=zonen');
  const tp = page.locator('#z-tp'); await decimalPad(tp);
  await typeTime(tp, '445', '4:45', '= 4 min 45 s pro km');
  await expect.poll(async () => (await stored(page)).profile?.thresholds?.thresholdPaceRunSec).toBe(285);
  await typeTime(tp, '4,3', '4,3');
  await expect(hintOf(tp).locator('[data-act="tf-pick"]')).toHaveText(['4:30', '4:18 (4,3 min)']);
  expect((await stored(page)).profile.thresholds.thresholdPaceRunSec).toBe(285);
  await hintOf(tp).locator('[data-act="tf-pick"]').first().click();
  await expect.poll(async () => (await stored(page)).profile?.thresholds?.thresholdPaceRunSec).toBe(270);
  const css = page.locator('#z-css');
  await typeTime(css, '152', '1:52', '= 1 min 52 s pro 100 m');
  await expect.poll(async () => (await stored(page)).profile?.thresholds?.cssSec).toBe(112);
  await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
  await expect(page.locator('#z-tp')).toHaveValue('4:30'); await expect(page.locator('#z-css')).toHaveValue('1:52');
});

test('Ziel: Wunschzeit 14530 → 1:45:30, „1:30“ beim Halbmarathon eindeutig 1 h 30 min; Ergebniszeit', async ({ page }) => {
  test.setTimeout(90000);
  await seed39(page); await open(page, '/?go=profil');
  await page.locator('[data-act="goal-new"]').click();
  await page.locator('#g-type').selectOption('run_half');
  await page.locator('#g-out').selectOption('time');
  const tg = page.locator('#g-target'); await decimalPad(tg);
  await typeTime(tg, '14530', '1:45:30', '= 1 h 45 min 30 s');
  await typeTime(tg, '1:30', '1:30', '= 1 h 30 min');
  await page.locator('#g-date').fill(YESTERDAY); await page.locator('#g-date').blur();
  const res = page.locator('#g-res'); await expect(res).toBeVisible();
  await typeTime(res, '15212', '1:52:12', '= 1 h 52 min 12 s');
  await page.locator('[data-act="goal-save"]').click();
  if (await page.locator('[data-act="stage-apply"]').count()) { await page.locator('[data-act="stage-apply"]').click(); const c = page.locator('[data-act="stage-confirm"]'); if (await c.count()) await c.click(); }
  await expect.poll(async () => { const g = Object.values((await stored(page)).goals || {}).find((x: any) => x.type === 'run_half') as any; return g && [g.targetTimeSec, g.result?.timeSec]; }).toEqual([5400, 6732]);
});

test('Wettkampf nach dem Rennen: Zeit und Teilzeiten nur mit Ziffern, „9:30“ beim Schwimmen fragt nach', async ({ page }) => {
  test.setTimeout(90000);
  await seed39(page, (d: any) => { d.goals = { ...(d.goals || {}), tri39: { id: 'tri39', type: 'tri_sprint', name: 'Sprint 39', date: YESTERDAY, priority: 'B' } }; });
  await open(page, '/?open=wettkampf');
  const tm = page.locator('#rr-time'); await decimalPad(tm);
  await typeTime(tm, '12415', '1:24:15', '= 1 h 24 min 15 s');
  await expect.poll(async () => (await stored(page)).goals.tri39.result?.timeSec).toBe(5055);
  const sw = page.locator('#rr-swim');
  await typeTime(sw, '9:30', '9:30');
  await expect(hintOf(sw).locator('[data-act="tf-pick"]')).toHaveText(['9 h 30 min', '9 min 30 s']);
  await hintOf(sw).locator('[data-act="tf-pick"]', { hasText: '9 min 30 s' }).click();
  await expect.poll(async () => (await stored(page)).goals.tri39.result?.splits?.swim).toBe(570);
  await typeTime(page.locator('#rr-bike'), '4512', '45:12', '= 45 min 12 s');
  await expect.poll(async () => (await stored(page)).goals.tri39.result?.splits?.bike).toBe(2712);
});

test('Können und Teamsport: Minuten-Felder mit „= 1 h 30 min“ und Doppelpunkt-Regel', async ({ page }) => {
  await seed39(page, (d: any) => { d.profile = { ...(d.profile || {}), sports: ['run', 'bike', 'swim'], teamSport: { name: 'Fußball', trainingDays: [2], trainingMinutes: 90, gameDays: [6], gameMinutes: 90 } }; });
  await open(page, '/?go=beruecksichtigungen');
  const run = page.locator('#cs-run'); await decimalPad(run);
  await typeTime(run, '90', '90', '= 1 h 30 min');
  const bike = page.locator('#cs-bike');
  await typeTime(bike, '2:30', '2:30', '= 2 h 30 min');
  const tmin = page.locator('#ct-tmin');
  if (await tmin.count()) { await decimalPad(tmin); await typeTime(tmin, '105', '105', '= 1 h 45 min'); }
});

test('Plan bearbeiten: Dauer „1:15“ = 1 h 15 min (75 min) mit Anzeige darunter', async ({ page }) => {
  await seed39(page); await open(page, '/?go=plan');
  await page.locator('[data-act="edit-toggle"]').click();
  // Teamsport-Training (Fehler: wurde beim Speichern still zum Lauf, weil die Sportart-Auswahl kein Teamsport kannte)
  const row = page.locator('[data-act="sess-edit"][data-sid$="-team"]').first();
  const sid = await row.getAttribute('data-sid'); await row.click();
  const m = page.locator('#ed-min'); await expect(m).toBeVisible(); await decimalPad(m);
  await expect(page.locator('#ed-sport')).toHaveCount(0);
  await typeTime(m, '1:15', '1:15', '= 1 h 15 min');
  await page.locator('[data-act="edit-save"]').click();
  const ok = page.locator('[data-act="edit-preview-confirm"], [data-act="edit-anyway"]');
  for (let i = 0; i < 2 && await ok.count(); i++) await ok.first().click();
  await expect.poll(async () => { const st = await stored(page); return Object.values(st.adjustments || {}).find((a: any) => a && a.sessionId === sid && a.type === 'modify')?.set; }).toEqual({ plannedMinutes: 75, plannedKm: undefined });
});

test('Fragebogen: Bestzeiten, Wunschzeit und Minuten-Fragen nur mit Ziffern', async ({ page }) => {
  test.setTimeout(90000);
  await seed(page, { noPlan: true });
  await open(page, '/');
  await page.locator('[data-act="ob-start"]').first().click();
  if (!(await page.locator('#og-time-0').count())) await page.locator('[data-act="ob-goal-add"]').click();
  const wt = page.locator('#og-time-0'); await decimalPad(wt);
  await typeTime(wt, '4815', '48:15', '= 48 min 15 s');
  await expect.poll(async () => (await stored(page)).onboarding?.answers?.goals?.[0]?.targetTime).toBe(2895);
  await page.locator('[data-act="ob-jump"][data-i="2"]').click();
  const b5 = page.locator('#qb-run5k');
  if (!(await b5.count())) { await page.locator('[data-act="ob-multi"][data-q="sports"][data-v="run"]').first().click(); }
  await decimalPad(page.locator('#qb-run5k'));
  await typeTime(page.locator('#qb-run5k'), '2215', '22:15', '= 22 min 15 s');
  await typeTime(page.locator('#qb-runHalf'), '1:45', '1:45', '= 1 h 45 min');
  await page.locator('[data-act="ob-jump"][data-i="3"]').click();
  const rc = page.locator('#q-runContinuousMin');
  if (await rc.count()) { await decimalPad(rc); await typeTime(rc, '75', '75', '= 1 h 15 min'); }
});

test('Morgenwerte: Tiefschlaf 1:30 = 90 min mit Anzeige darunter', async ({ page }) => {
  await seed39(page); await open(page, '/?open=checkin');
  const ds = page.locator('#ck-deepSleep');
  test.skip(!(await ds.count()), 'Tiefschlaf-Feld nicht im Check-in');
  await decimalPad(ds);
  await typeTime(ds, '1:30', '1:30', '= 1 h 30 min');
});

for (const dark of [false, true]) test(`Überlauf: Nachfrage unter dem Zeitfeld bei 320 px, 28 px Schrift${dark ? ', dunkel' : ''}`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 }); await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
  await page.addInitScript(() => { const set = () => { document.documentElement.style.fontSize = '28px'; }; if (document.documentElement) set(); document.addEventListener('DOMContentLoaded', set); });
  await seed39(page); await open(page, '/?go=plan'); await openPlanSession(page, 'lt39'); await openDetails(page);
  for (const [id, raw] of [['#fd-min', '45,3'], ['#fd-pace', '5,3']] as const) {
    const loc = sheet(page).locator(id); await loc.click(); await loc.fill(''); await loc.pressSequentially(raw); await loc.blur();
    await expect(hintOf(loc).locator('[data-act="tf-pick"]')).toHaveCount(2);
    const over = await page.evaluate(() => { const W = document.documentElement.clientWidth; return [...document.querySelectorAll('[data-tf-hint], [data-tf-hint] *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > W + 1 || r.left < -1); }).length + (document.documentElement.scrollWidth > W + 1 ? 100 : 0); });
    expect(over, id).toBe(0);
  }
});
