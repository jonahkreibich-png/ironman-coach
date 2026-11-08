/* Auftrag 29, Punkt 2: jedes Eingabefeld wie ein Mensch testen.
   Wert eintippen (Komma, Punkt, Einheit, typische Varianten) → Feld verlassen → App neu laden → steht derselbe Wert da?
   → gespeicherter Wert, Liste (Zeile der Einheit), Coach-Kontext (dieselben Funktionen wie Coach/Bewertung) zeigen dieselbe Zahl.
   Dazu: Nachtragen (erst abhaken, später Werte), Ändern bestehender Werte, ungültige Eingaben (Meldung, alter Wert bleibt, nichts still
   umgewandelt). Felder kommen aus shared/fields.ts – ein neues Feld läuft automatisch mit und braucht einen Eintrag in VALUES. */
import { test, expect } from './storage-harness';
import { type Page } from '@playwright/test';
import { seed, open, openPlanSession, stored, TODAY } from './helpers';
import { SPORT_FIELDS } from '../../shared/fields';
import { valueFacts } from '../../shared/coach/claims';
import { doneItems, valsOf } from '../../shared/coach/review';
import { actualMetrics } from '../../shared/results';

/* je Feld: Eingabe wie ein Mensch, erwartete Anzeige nach dem Neuladen, erwarteter gespeicherter Wert, dann eine Änderung */
const VALUES: Record<string, [string, string, string, string?, string?]> = {
  // key: [Eingabe, Anzeige, gespeichert, geänderte Eingabe, Anzeige danach]
  min: ['1:05', '65', '65', '62 min', '62'], km: ['10,5 km', '10,5', '10.5', '10.6', '10,6'], meters: ['1.500', '1500', '1500', '1,6 km', '1600'],
  hr: ['152 bpm', '152', '152', '149', '149'], maxHr: ['171', '171', '171'], decoupling: ['3 %', '3', '3', '-2,1', '-2,1'], efficiency: ['1,3', '1,3', '1.3'],
  cadence: ['164 spm', '164', '164'], maxCadence: ['110', '110', '110'], vertRatio: ['8,7 %', '8,7', '8.7'], vo2max: ['54,6', '54,6', '54.6'], cardioRecovery: ['45', '45', '45'],
  ascent: ['86 m', '86', '86'], strideLen: ['102', '102', '1.02', '1,05 m', '105'], gct: ['270 ms', '270', '270'], power: ['216 W', '216', '216', '220', '220'], maxPower: ['612', '612', '612'],
  np: ['205', '205', '205'], speed: ['27,4 km/h', '27,4', '27.4'], temp: ['-3 °C', '-3', '-3'], carbs: ['60 g', '60', '60'], fluid: ['0,75 l', '750', '750'],
  spl: ['12,7', '12,7', '12.7'], rate: ['20,8', '20,8', '20.8'], dps: ['1,97 m', '1,97', '1.97'], longestCrawl: ['75 m', '75', '75', '100', '100'], longestPull: ['75', '75', '75'],
  crawlShare: ['46 %', '46', '46'], swolf: ['38', '38', '38'], sprints: ['12', '12', '12']
};
const PACE: Record<string, [string, string, string]> = { pace: ['6', '01', '6:01'], pace100: ['2', '27', '2:27'], paceBreast: ['2', '55', '2:55'] };
const TEXT: Record<string, string> = { shoe: 'Pegasus 40', technique: 'Atmung, Beine sinken ab', aids: 'Pull Buoy' };
const SPORTS = ['run', 'bike', 'swim', 'strength', 'football'] as const;

async function seedFields(page: Page) {
  await seed(page, { extra: (d: any) => {
    const day = d.plan.weeks.flatMap((w: any) => w.days).find((x: any) => x.date === TODAY);
    for (const sp of SPORTS) day.sessions.push({ id: 'f-' + sp, sport: sp, title: 'Feldtest ' + sp, plannedMinutes: 60, ...(sp === 'football' ? { fixed: true } : {}) });
    d.profile = { ...(d.profile || {}), powerMeter: true, sports: ['swim', 'bike', 'run', 'strength', 'football'], teamSport: { name: 'Fußball', trainingDays: [3], trainingMinutes: 90, gameDays: [], gameMinutes: 90 } };
  } });
}
const sheet = (page: Page) => page.locator('#sheetPanel');
async function openSession(page: Page, sp: string) {
  await openPlanSession(page, 'f-' + sp);
  await expect(sheet(page).locator(`[data-fields="${sp}"]`)).toBeVisible();
  // „Weitere Werte“ aufklappen
  await page.evaluate(() => document.querySelectorAll('#sheetPanel [data-fields] details').forEach(d => { (d as HTMLDetailsElement).open = true; }));
}
async function typeField(page: Page, key: string, raw: string) {
  const el = sheet(page).locator(`#fd-${key}`);
  await el.click(); await el.fill(''); await el.pressSequentially(raw, { delay: 5 }); await el.blur();
}
const ctxOf = (state: any, plan: any) => ({ today: TODAY, now: Date.now(), state, baseWeeks: plan.weeks, planMeta: plan.meta || {}, profile: state.profile, goals: [] } as any);

for (const sp of SPORTS) {
  test(`Auftrag 29 Felder ${sp}: erst abhaken, dann Werte nachtragen, neu laden, überall dieselbe Zahl, ändern, ungültig`, async ({ page }) => {
    test.setTimeout(120000);
    await seedFields(page); await open(page, '/?go=plan');
    const defs = SPORT_FIELDS[sp].filter(f => !f.test);
    const nums = defs.filter(f => f.kind === 'num'), paces = defs.filter(f => f.kind === 'pace'), texts = defs.filter(f => f.kind === 'text');
    for (const f of nums) expect(VALUES[f.key], `Feld ${sp}.${f.key} braucht einen Testwert in VALUES`).toBeTruthy();
    // 1. erst abhaken (ohne Werte)
    await openSession(page, sp); await page.keyboard.press('Escape');
    await page.locator(`[data-act="sess-toggle"][data-sid="f-${sp}"]`).first().click();
    await openSession(page, sp);
    expect((await stored(page)).sessions['f-' + sp]?.completed).toBe(true);
    // 2. Werte nachtragen
    for (const f of nums) { await typeField(page, f.key, VALUES[f.key][0]); await expect(sheet(page).locator(`#fd-${f.key}`), `${sp}.${f.key} direkt nach der Eingabe`).toHaveValue(VALUES[f.key][1]); }
    for (const f of paces) { const [m, s] = PACE[f.key]; await sheet(page).locator(`#fd-${f.key}-m`).fill(m); await sheet(page).locator(`#fd-${f.key}-s`).fill(s); await sheet(page).locator(`#fd-${f.key}-s`).blur(); }
    for (const f of texts) { await sheet(page).locator(`#fd-${f.key}`).fill(TEXT[f.key] || 'Text'); await sheet(page).locator(`#fd-${f.key}`).blur(); }
    // 3. neu laden: dieselben Werte
    await expect.poll(async () => (await stored(page)).sessions['f-' + sp]?.metrics?.[nums[nums.length - 1]?.key || 'min']).toBeTruthy();
    await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
    await openSession(page, sp);
    for (const f of nums) await expect(sheet(page).locator(`#fd-${f.key}`), `${sp}.${f.key} nach dem Neuladen`).toHaveValue(VALUES[f.key][1]);
    for (const f of paces) { const [m, s] = PACE[f.key]; await expect(sheet(page).locator(`#fd-${f.key}-m`)).toHaveValue(m.padStart(2, '0')); await expect(sheet(page).locator(`#fd-${f.key}-s`)).toHaveValue(s.padStart(2, '0')); }
    for (const f of texts) await expect(sheet(page).locator(`#fd-${f.key}`)).toHaveValue(TEXT[f.key] || 'Text');
    // 4. gespeichert, Liste, Coach-Kontext: dieselbe Zahl
    const st = await stored(page); const plan = await page.evaluate(() => JSON.parse(localStorage.getItem('ec_plan') || '{}'));
    const rec = st.sessions['f-' + sp];
    for (const f of nums) expect(String(rec.metrics[f.key]), `${sp}.${f.key} gespeichert`).toBe(VALUES[f.key][2]);
    for (const f of paces) expect(rec.metrics[f.key]).toBe(PACE[f.key][2]);
    const ctx = ctxOf(st, plan);
    const done = doneItems(ctx, TODAY, TODAY).find(d => d.key === 'f-' + sp)!;
    expect(done, 'Einheit im Coach-Kontext').toBeTruthy();
    const am = actualMetrics(done.st, done.act); const v: any = valsOf(done);
    if (VALUES.min && nums.some(f => f.key === 'min')) { expect(+am.min).toBe(65); expect(v.min).toBe(65); }
    if (nums.some(f => f.key === 'hr')) { expect(v.hr).toBe(152); expect(valueFacts(ctx).items.find(x => x.date === TODAY && x.sport === sp)?.v.hr).toBe(152); }
    if (sp === 'run') { expect(v.dec).toBe(3); expect(v.km).toBe(10.5); }
    if (sp === 'swim') expect(v.meters).toBe(1500);
    // Zeile der Einheit in der Liste
    await page.keyboard.press('Escape');
    const row = page.locator(`[data-act="sess-open"][data-sid="f-${sp}"]`).first();
    await expect(row).toBeVisible();
    // 5. ändern
    await openSession(page, sp);
    for (const f of nums) if (VALUES[f.key][3]) { await typeField(page, f.key, VALUES[f.key][3]!); await expect(sheet(page).locator(`#fd-${f.key}`)).toHaveValue(VALUES[f.key][4]!); }
    // 6. ungültig: Meldung, der bisherige Wert bleibt (auch nach dem Neuladen), nichts still umgewandelt
    if (nums.some(f => f.key === 'hr')) {
      await typeField(page, 'hr', '400');
      await expect(page.locator('.toast').last()).toContainText(/unrealistisch/);
      await expect(sheet(page).locator('#fd-hr')).toHaveValue('149');
      await typeField(page, 'hr', '150 kg');
      await expect(sheet(page).locator('#fd-hr')).toHaveValue('149');
    }
    if (sp === 'run') { await typeField(page, 'strideLen', '10'); await expect(sheet(page).locator('#fd-strideLen')).toHaveValue('105'); }
    await page.reload(); await expect(page.locator('#app')).not.toBeEmpty(); await openSession(page, sp);
    for (const f of nums) if (VALUES[f.key][3]) await expect(sheet(page).locator(`#fd-${f.key}`), `${sp}.${f.key} nach Änderung und Neuladen`).toHaveValue(VALUES[f.key][4]!);
    if (nums.some(f => f.key === 'hr')) await expect(sheet(page).locator('#fd-hr')).toHaveValue('149');
  });
}

test('Auftrag 29 Felder: Schrittlänge 102 springt nicht mehr auf 1 (gemeldeter Fehler)', async ({ page }) => {
  await seedFields(page); await open(page, '/?go=plan'); await openSession(page, 'run');
  await typeField(page, 'strideLen', '102');
  await expect(sheet(page).locator('#fd-strideLen')).toHaveValue('102');
  await expect(sheet(page).locator('label[for="fd-strideLen"]')).toContainText('cm');
  expect((await stored(page)).sessions['f-run'].metrics.strideLen).toBe('1.02');
  // ungültig nach gültigem Zwischenstand („1“ auf dem Weg zu „1000“): der Wert von vorher bleibt, nicht „1“
  await typeField(page, 'strideLen', '1000');
  await expect(sheet(page).locator('#fd-strideLen')).toHaveValue('102');
  expect((await stored(page)).sessions['f-run'].metrics.strideLen).toBe('1.02');
});

test('Auftrag 29 Felder: Extra-Einheit Schwimmen erst ohne Werte, dann Minuten → Dauer in Plan und Tageskopf (kein „?“)', async ({ page }) => {
  await seedFields(page); await open(page, '/?go=plan');
  await page.locator(`.cday-add[data-date="${TODAY}"]`).click();
  await page.locator('#ca-sport').selectOption('swim');
  await page.locator('[data-act="custom-save"]').click();
  await expect(page.locator('#sheet')).toBeHidden();
  const row = page.locator('[data-act="custom-open"]').first();
  await expect(row).toContainText('?');
  await row.click();
  await typeField(page, 'min', '43'); await typeField(page, 'meters', '1000');
  await page.keyboard.press('Escape');
  await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
  if (!(await page.locator('[data-act="custom-open"]').count())) await page.locator(`.cday-h[data-date="${TODAY}"]`).click();
  await expect(page.locator('[data-act="custom-open"]').first()).toContainText('43');
  await expect(page.locator(`#day-${TODAY} .cday-m`)).not.toContainText('?');
  const c = (await stored(page)).customWorkouts[TODAY].find((w: any) => w.sport === 'swim');
  expect(c.metrics.min).toBe('43'); expect(c.plannedMinutes).toBe(43);
});

test('Auftrag 29 Felder: „+“ am Tag legt eine Extra-Einheit an genau diesem Tag an', async ({ page }) => {
  await seedFields(page); await open(page, '/?go=plan');
  const days = page.locator('.cday-add'); expect(await days.count()).toBeGreaterThanOrEqual(7);
  const date = await days.nth(2).getAttribute('data-date');
  await days.nth(2).click();
  await page.locator('#ca-sport').selectOption('bike'); await page.locator('#ca-title').fill('Rolle extra');
  await typeField(page, 'min', '45'); await typeField(page, 'km', '20');
  await page.locator('[data-act="custom-save"]').click();
  const c = (await stored(page)).customWorkouts[date!];
  expect(c && c[0].title).toBe('Rolle extra'); expect(c[0].metrics.min).toBe('45'); expect(c[0].plannedMinutes).toBe(45);
  // Auftrag 30: der doppelte Knopf unten ist weg, das „+“ am Tag bleibt
  await expect(page.locator('[data-act="custom-add"]:not(.cday-add)')).toHaveCount(0);
  await expect(page.locator('.cday-add[data-act="custom-add"]').first()).toBeAttached();
});

test('Auftrag 29 Felder: Morgenwerte mit Einheiten, neu laden, ungültig', async ({ page }) => {
  await seedFields(page); await open(page, '/?go=werte');
  await page.locator(`[data-act="checkin-open"][data-date="${TODAY}"]`).last().click();
  const cases: [string, string, string, number][] = [['sleepHours', '7:30', '7,5', 7.5], ['hrv', '61 ms', '61', 61], ['restingHR', '52 bpm', '52', 52], ['bodyTemp', '-0,2', '-0,2', -0.2], ['spo2', '97,5 %', '97,5', 97.5], ['breathingRate', '14,5', '14,5', 14.5], ['deepSleep', '1 h 20', '80', 80]];
  for (const [k, raw] of cases) { const el = page.locator('#ck-' + k); await el.fill(''); await el.pressSequentially(raw); await el.blur(); }
  await expect.poll(async () => (await stored(page)).trend.find((x: any) => x.date === TODAY)?.deepSleep).toBe(80);
  await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
  await page.locator(`[data-act="checkin-open"][data-date="${TODAY}"]`).last().click();
  for (const [k, , show] of cases) await expect(page.locator('#ck-' + k)).toHaveValue(show);
  const p = (await stored(page)).trend.find((x: any) => x.date === TODAY);
  for (const [k, , , val] of cases) expect(p[k], k + ' ' + JSON.stringify(p)).toBe(val);
  await page.locator('#ck-hrv').fill('2000'); await page.locator('#ck-hrv').blur();
  await expect(page.locator('.toast').last()).toContainText(/HFV/);
  await expect(page.locator('#ck-hrv')).toHaveValue('61');
});

test('Auftrag 29 Felder: Profil (Größe in m oder cm, Gewicht), Essen, neu laden', async ({ page }) => {
  await seedFields(page); await open(page, '/?go=profil');
  await page.locator('#pf-h').fill('1,80 m'); await page.locator('#pf-h').blur();
  await page.locator('#pf-w').fill('72,5 kg'); await page.locator('#pf-w').blur();
  await page.locator('#pf-birth').fill('197'); await page.locator('#pf-birth').blur();
  await expect(page.locator('.toast').last()).toContainText(/Geburtsjahr/);
  await expect.poll(async () => (await stored(page)).profile?.heightCm).toBe(180);
  await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
  await expect(page.locator('#pf-h')).toHaveValue('180'); await expect(page.locator('#pf-w')).toHaveValue('72.5');
  const prof = (await stored(page)).profile; expect(prof.heightCm).toBe(180); expect(prof.weightKg).toBe(72.5); expect(prof.birthYear).not.toBe(197);
  await page.goto('/?go=essen'); await expect(page.locator('#app')).not.toBeEmpty();
  const kcal = page.locator('#fe-kcal'); if (await kcal.count()) {
    await kcal.fill('2.400'); await kcal.blur(); await page.locator('#fe-protein').fill('120 g'); await page.locator('#fe-protein').blur();
    await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
    await expect(page.locator('#fe-kcal')).toHaveValue('2400'); await expect(page.locator('#fe-protein')).toHaveValue('120');
  }
});

/* Auftrag 29 (Ergänzung): „Anders trainiert als geplant“ – geplant Intervalle, gemacht Zone 2 */
test('Auftrag 29: Anders gemacht – Rad Zone 2 statt Sweet Spot: Titel, „geplant: …“, Intervall-Liste nicht nötig, Coach, neu laden', async ({ page }) => {
  test.setTimeout(60000);
  await seed(page, { extra: (d: any) => {
    const day = d.plan.weeks.flatMap((w: any) => w.days).find((x: any) => x.date === TODAY);
    day.sessions.push({ id: 'f-ss', sport: 'bike', title: 'Rad-Intervalle 2×12 min Sweet Spot', plannedMinutes: 75, hard: true, zone: 'Zone 3' });
  } });
  await open(page, '/?go=plan');
  await openPlanSession(page, 'f-ss'); await page.keyboard.press('Escape');
  await page.locator('[data-act="sess-toggle"][data-sid="f-ss"]').first().click();
  await openPlanSession(page, 'f-ss');
  await expect(sheet(page).locator('[data-as-planned]')).toBeVisible();
  await sheet(page).locator('[data-act="fd-asplanned"][data-v="0"]').click();
  await sheet(page).locator('[data-act="fd-chg-kind"][data-v="easy"]').click();
  await sheet(page).locator('[data-act="fd-chg-reason"][data-v="tired"]').click();
  await typeField(page, 'min', '60');
  await expect(sheet(page).locator('[data-intervals]')).toHaveCount(0);
  await expect(sheet(page).locator('[data-planned-was]')).toContainText('geplant: Rad-Intervalle 2×12 min Sweet Spot · Grund: müde');
  const st = (await stored(page)).sessions['f-ss'];
  expect(st.asPlanned).toBe(false); expect(st.changed).toMatchObject({ kind: 'easy', reason: 'tired' });
  await page.keyboard.press('Escape');
  await expect.poll(async () => ((await stored(page)).coachMsgs['msg-review-f-ss']?.text || ''), { timeout: 15000 }).toMatch(/kein Problem, Zone 2/);
  await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
  if (!(await page.locator('[data-act="sess-open"][data-sid="f-ss"]').count())) await page.locator(`.cday-h[data-date="${TODAY}"]`).click();
  const row = page.locator('[data-act="sess-open"][data-sid="f-ss"]').first();
  await expect(row).toContainText('Rad Zone 2 · 60 min');
  await expect(row).toContainText('geplant: Rad-Intervalle 2×12 min Sweet Spot');
  // Coach bewertet das Gemachte
  await expect.poll(async () => ((await stored(page)).coachMsgs['msg-review-f-ss']?.text || ''), { timeout: 15000 }).toMatch(/Rad Zone 2.*kein Problem, Zone 2|kein Problem, Zone 2/s);
  // zurück auf „so wie geplant“: Titel wieder der geplante
  await openPlanSession(page, 'f-ss');
  await sheet(page).locator('[data-act="fd-asplanned"][data-v="1"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-act="sess-open"][data-sid="f-ss"]').first()).toContainText('Rad-Intervalle 2×12 min Sweet Spot');
});

test('Auftrag 29: Normalized Power nur mit echten Wattdaten (nicht bei einfacher Rolle), mit Lexikon-Verweis', async ({ page }) => {
  await seedFields(page); await open(page, '/?go=plan'); await openSession(page, 'bike');
  await expect(sheet(page).locator('#fd-np')).toBeVisible();
  await expect(sheet(page).locator('label[for="fd-np"] [data-act="lex"]')).toBeAttached();
  await sheet(page).locator('#fd-indoor').selectOption('basic');
  await page.evaluate(() => document.querySelectorAll('#sheetPanel [data-fields] details').forEach(d => { (d as HTMLDetailsElement).open = true; }));
  await expect(sheet(page).locator('#fd-np')).toHaveCount(0);
});

/* Auftrag 30: „Anders gemacht“ vollständig – je Auswahl die passenden Felder, eintippen wie ein Mensch, neu laden, gleiche Zahl in Liste und Coach-Kontext */
async function seedAnders(page: Page) {
  await seed(page, { extra: (d: any) => {
    const day = d.plan.weeks.flatMap((w: any) => w.days).find((x: any) => x.date === TODAY);
    day.sessions.push({ id: 'a30-bike', sport: 'bike', title: 'Rad-Intervalle 2×12 min Sweet Spot', plannedMinutes: 75, hard: true, zone: 'Zone 3' });
    day.sessions.push({ id: 'a30-swim', sport: 'swim', title: 'Schwimmen 1.200 m Technik', plannedMinutes: 45 });
  } });
  await open(page, '/?go=plan');
}
async function andersStart(page: Page, sid: string, kind: string) {
  await openPlanSession(page, sid); await page.keyboard.press('Escape');
  const t = page.locator(`[data-act="sess-toggle"][data-sid="${sid}"]`).first();
  if ((await t.getAttribute('aria-pressed')) !== 'true') await t.click();
  await openPlanSession(page, sid);
  await sheet(page).locator('[data-act="fd-asplanned"][data-v="0"]').click();
  await sheet(page).locator(`[data-act="fd-chg-kind"][data-v="${kind}"]`).click();
  await expect(sheet(page).locator(`[data-change-detail="${kind}"]`)).toHaveCount(1);
}
async function rowText(page: Page, sid: string) {
  await stored(page); // erst gesichert, dann neu laden
  await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
  if (!(await page.locator(`[data-act="sess-open"][data-sid="${sid}"]`).count())) await page.locator(`.cday-h[data-date="${TODAY}"]`).click();
  return (await page.locator(`[data-act="sess-open"][data-sid="${sid}"]`).first().textContent()) || '';
}
const ctxMin = async (page: Page, sid: string) => { const st = await stored(page); const plan = await page.evaluate(() => JSON.parse(localStorage.getItem('ec_plan') || '{}')); const d = doneItems(ctxOf(st, plan), TODAY, TODAY).find(x => x.key === sid); return d ? { title: d.title, min: valsOf(d).min } : null; };

test('Auftrag 30: kürzer, länger, abgebrochen – Dauer und Distanz oben (einmal), neu laden, Liste und Coach-Kontext gleich', async ({ page }) => {
  test.setTimeout(90000);
  await seedAnders(page);
  await andersStart(page, 'a30-bike', 'shorter');
  // Dauer/Distanz stehen im Änderungs-Block und nicht doppelt
  await expect(sheet(page).locator('#fd-min')).toHaveCount(1); await expect(sheet(page).locator('#fd-km')).toHaveCount(1);
  await expect(sheet(page).locator('[data-change-dur] #fd-min')).toHaveCount(1);
  await typeField(page, 'min', '0:40'); await typeField(page, 'km', '18,5 km');
  await expect(sheet(page).locator('#fd-min')).toHaveValue('40');
  let st = (await stored(page)).sessions['a30-bike'];
  expect(st.changed.kind).toBe('shorter'); expect(String(st.metrics.min)).toBe('40'); expect(String(st.metrics.km)).toBe('18.5');
  await page.keyboard.press('Escape');
  expect(await rowText(page, 'a30-bike')).toContain('Rad-Intervalle Sweet Spot · 40 min');
  expect(await ctxMin(page, 'a30-bike')).toEqual({ title: 'Rad-Intervalle Sweet Spot · 40 min', min: 40 });
  // länger
  await openPlanSession(page, 'a30-bike');
  await sheet(page).locator('[data-act="fd-chg-kind"][data-v="longer"]').click();
  await typeField(page, 'min', '1:35');
  await page.keyboard.press('Escape');
  expect(await rowText(page, 'a30-bike')).toContain('· 95 min');
  // abgebrochen nach 25 min, Grund Schmerzen; ungültige Eingabe → Meldung, Wert bleibt
  await openPlanSession(page, 'a30-bike');
  await sheet(page).locator('[data-act="fd-chg-kind"][data-v="aborted"]').click();
  await expect(sheet(page).locator('label[for="fd-min"]')).toContainText('Abgebrochen nach');
  await typeField(page, 'min', '25'); await sheet(page).locator('[data-act="fd-chg-reason"][data-v="pain"]').click();
  await typeField(page, 'min', '99999');
  await expect(page.locator('.toast')).toBeVisible();
  await expect.poll(async () => String((await stored(page)).sessions['a30-bike'].metrics.min)).toBe('25');
  await page.keyboard.press('Escape');
  expect(await rowText(page, 'a30-bike')).toContain('abgebrochen nach 25 min');
  st = (await stored(page)).sessions['a30-bike']; expect(st.changed).toMatchObject({ kind: 'aborted', reason: 'pain' });
  expect((await ctxMin(page, 'a30-bike'))!.min).toBe(25);
});

test('Auftrag 30: aufgeteilt – Teile mit je Dauer, Summe ist die Dauer, ungültig wird abgelehnt, neu laden', async ({ page }) => {
  test.setTimeout(90000);
  await seedAnders(page);
  await andersStart(page, 'a30-bike', 'split');
  const part = async (i: number, v: string) => { const el = sheet(page).locator(`#fd-part-${i}`); await el.click(); await el.fill(''); await el.pressSequentially(v, { delay: 5 }); await el.blur(); };
  await part(0, '30'); await part(1, '0:25');
  await expect(sheet(page).locator('[data-parts-sum]')).toContainText('Zusammen 55 min');
  await sheet(page).locator('[data-act="fd-chg-part-add"]').click(); await part(2, '15 min');
  await part(1, '9999');
  await expect(page.locator('.toast')).toBeVisible();
  const st = (await stored(page)).sessions['a30-bike'];
  expect(st.changed.parts).toEqual([30, 25, 15]); expect(String(st.metrics.min)).toBe('70');
  await page.keyboard.press('Escape');
  expect(await rowText(page, 'a30-bike')).toContain('3 Teile (30 + 25 + 15 min)');
  expect((await ctxMin(page, 'a30-bike'))!.min).toBe(70);
  await openPlanSession(page, 'a30-bike');
  await expect(sheet(page).locator('#fd-part-1')).toHaveValue('25');
  await expect(sheet(page).locator('[data-intervals]')).toHaveCount(0);
});

test('Auftrag 30: härter mit Zone, eigene Intervall-Liste, drinnen/draußen, ohne Teil, andere Sportart', async ({ page }) => {
  test.setTimeout(90000);
  await seedAnders(page);
  await andersStart(page, 'a30-bike', 'harder');
  await sheet(page).locator('[data-act="fd-chg-zone"][data-v="5"]').click();
  await expect(sheet(page).locator('[data-act="fd-chg-zone"][data-v="5"]')).toHaveAttribute('aria-pressed', 'true');
  // eigene Intervall-Liste ohne Soll, gleich offen
  await expect(sheet(page).locator('[data-intervals]')).toHaveCount(1);
  await expect(sheet(page).locator('[data-iv-row="0"]')).toBeVisible();
  await expect(sheet(page).locator('[data-iv-row="0"]')).toContainText('zusätzlich');
  await typeField(page, 'min', '60');
  await page.keyboard.press('Escape');
  expect(await rowText(page, 'a30-bike')).toContain('Rad härter (Zone 5) · 60 min');
  // drinnen/draußen
  await openPlanSession(page, 'a30-bike');
  await sheet(page).locator('[data-act="fd-chg-kind"][data-v="place"]').click();
  await sheet(page).locator('[data-act="fd-chg-place"][data-v="in"]').click();
  await page.keyboard.press('Escape');
  expect(await rowText(page, 'a30-bike')).toContain('· Rolle');
  // Schwimmen: nur Brust
  await andersStart(page, 'a30-swim', 'omit');
  await expect(sheet(page).locator('[data-act="fd-chg-omit"][data-v="breastOnly"]')).toBeVisible();
  await expect(sheet(page).locator('[data-act="fd-chg-omit"][data-v="brick"]')).toHaveCount(0);
  await sheet(page).locator('[data-act="fd-chg-omit"][data-v="breastOnly"]').click();
  await page.keyboard.press('Escape');
  expect(await rowText(page, 'a30-swim')).toContain('· nur Brust');
  // andere Sportart: Felder dieser Sportart
  await openPlanSession(page, 'a30-swim');
  await sheet(page).locator('[data-act="fd-chg-kind"][data-v="otherSport"]').click();
  await sheet(page).locator('[data-ch="fd-chg-sport"]').selectOption('run');
  await expect(sheet(page).locator('[data-fields="run"]')).toBeVisible();
  await typeField(page, 'km', '8,2');
  await page.keyboard.press('Escape');
  expect(await rowText(page, 'a30-swim')).toContain('Laufen');
  expect(String((await stored(page)).sessions['a30-swim'].metrics.km)).toBe('8.2');
});

/* Auftrag 30: neues Feld „Startzeit“ beim Ziel (Strecke): eintippen wie ein Mensch, neu laden, ungültig → Meldung, alter Wert bleibt */
test('Auftrag 30 Feld: Startzeit des Wettkampfs', async ({ page }) => {
  test.setTimeout(60000);
  await seed(page, { extra: (d: any) => { d.goals = { 'g-tri': { id: 'g-tri', type: 'tri_olympic', name: 'Olympische Distanz', date: '2027-07-04', priority: 'A', outcome: 'finish' } }; } });
  await open(page, '/?go=profil');
  const openCourse = async () => { await page.locator('[data-act="goal-open"][data-id="g-tri"]').click(); await page.evaluate(() => document.querySelectorAll('#sheetPanel details').forEach(d => { (d as HTMLDetailsElement).open = true; })); };
  await openCourse();
  const f = sheet(page).locator('#gc-st');
  await f.click(); await f.pressSequentially('7.30', { delay: 5 }); await f.blur();
  await expect(f).toHaveValue('07:30');
  await f.click(); await f.fill(''); await f.pressSequentially('25:99', { delay: 5 }); await f.blur();
  await expect(page.locator('.toast')).toContainText('Uhrzeit');
  await expect(f).toHaveValue('07:30');
  await sheet(page).locator('[data-act="goal-save"]').click();
  if (await page.locator('[data-act="stage-apply"]').count()) { await page.locator('[data-act="stage-apply"]').click(); const c = page.locator('[data-act="stage-confirm"]'); if (await c.count()) await c.click(); }
  await expect.poll(async () => ((await stored(page)).goals['g-tri'].course || {}).startTime).toBe('07:30');
  await page.reload(); await expect(page.locator('#app')).not.toBeEmpty();
  await openCourse();
  await expect(sheet(page).locator('#gc-st')).toHaveValue('07:30');
});
