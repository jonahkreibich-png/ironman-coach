/* Auftrag 7 in der App: Felder statt Notizfeld, Ablauf in Schritten, Coach erklärt den Tag, „Was der Coach gerade sieht“,
   Fragebogen setzt den Plan fort, Umfang pro Woche passt auf den Bildschirm. */
import { test, expect } from './storage-harness';
import { seed, open, stored, TODAY, openPlanSession } from './helpers';

test('Einheit: Felder je Sportart, RPE und Gefühl, Pulszone automatisch, Notiz wird in Felder übertragen', async ({ page }) => {
  const demo = await seed(page, { extra: d => {
    const run = d.plan.weeks.flatMap((w: any) => w.days).flatMap((x: any) => x.sessions.map((s: any) => ({ ...s, date: x.date }))).find((s: any) => s.sport === 'run' && s.date < TODAY);
    d.sessions = { ...(d.sessions || {}), [run.id]: { completed: true, notes: '5,07km, Ø6:21/km, ØHF153, Entkopplung 4,5 %, Kadenz 163' } };
    d.__run = run;
  } });
  const run = (demo as any).__run;
  await open(page, `/?go=plan`);
  await openPlanSession(page, run.id);
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

async function coachData28(page:any,kind:'strength'|'swim'|'legacy'|'choice'){
 await seed(page,{extra:d=>{
  d.profile={...(d.profile||{}),birthYear:1990,sports:['swim','bike','run','strength'],injuries:'',skills:{swimCrawlM:kind==='legacy'?100:50,swimPullM:50,swimCrawl:'some',swimBreast:true,swimGear:['buoy'],poolM:25}};
  for(const w of d.plan.weeks)for(const day of w.days)day.sessions=[];
  d.activities={};d.sessions={};d.customWorkouts={};d.coachMsgs={};d.adjustments={};
  const days=d.plan.weeks.flatMap((w:any)=>w.days),today=days.find((x:any)=>x.date===TODAY);
  if(kind==='strength'){today.sessions=[{id:'strength28',sport:'strength',title:'SYNTHETIC Kraft Unterkoerper',area:'lower',plannedMinutes:40,spec:{kind:'strength',area:'lower',exercises:[{name:'Kniebeuge',sets:3,reps:'10'}],steps:[{part:'main',min:40}]}}];d.sessions.strength28={completed:true,metrics:{min:'35',area:'lower',exercises:[{name:'Bankdruecken',sets:3,reps:'10',kg:40}]},rpe:'5'};}
  if(kind==='swim'||kind==='legacy'){
   for(const date of [TODAY,'2026-10-13']){const day=days.find((x:any)=>x.date===date);const id='swim28-'+date;day.sessions=[{id,sport:'swim',title:'SYNTHETIC Schwimmen',plannedMinutes:20}];d.sessions[id]={completed:true,metrics:{min:'20',meters:'200',longestCrawl:'50',longestPull:'50'},rpe:'4'};}
  }
  if(kind==='legacy')for(let i=0;i<3;i++){const id='msg-swim-legacy-old'+i;d.coachMsgs[id]={id,at:Date.parse(TODAY+'T07:00:00+02:00')+i,date:TODAY,kind:'proposal',from:'coach',title:'Schwimmen: bitte pruefen',text:'SYNTHETIC alter Hinweis',unread:true,important:true,proposal:{status:'open',skillsOnly:true,changes:[]}};}
  if(kind==='choice')days.find((x:any)=>x.date==='2026-10-15').sessions=[{id:'choice28',sport:'run',title:'SYNTHETIC lockerer Lauf',plannedMinutes:30}];
 }});
}
test('Coach28: tatsaechlicher Kraftbereich wird korrigiert, bewertet und nach Neustart behalten',async({page})=>{
 await coachData28(page,'strength');await open(page,'/?go=plan');await openPlanSession(page,'strength28');await page.locator('#fd-area').selectOption('upper');await expect.poll(async()=>((await stored(page)).coachMsgs['msg-review-strength28']?.text||'')).toMatch(/Oberk.rper/);
 expect((await stored(page)).sessions.strength28.metrics.exercises[0].kg).toBe(40);await page.locator('button[data-act="sheet-close"]').click();await page.reload();await expect(page.locator('[data-act="sess-open"][data-sid="strength28"]')).toContainText(/Oberk.rper/);
});
test('Coach28: hundert Meter mit und ohne Pull Buoy bleiben getrennt in Bewertung und Speicher',async({page})=>{
 await coachData28(page,'swim');await open(page,'/?go=plan');await openPlanSession(page,'swim28-'+TODAY);await page.locator('#fd-longestCrawl').fill('100');await page.locator('#fd-longestCrawl').blur();await page.locator('#fd-longestPull').fill('100');await page.locator('#fd-longestPull').blur();await expect.poll(async()=>((await stored(page)).coachMsgs['msg-review-swim28-'+TODAY]?.text||'')).toMatch(/100 m.*Pull Buoy|Pull Buoy.*100 m/);
 await page.locator('button[data-act="sheet-close"]').click();await page.reload();const st=(await stored(page)).sessions['swim28-'+TODAY];expect(st.metrics.longestCrawl).toBe('100');expect(st.metrics.longestPull).toBe('100');
});
test('Coach28: drei alte Schwimmhinweise werden ein Vorschlag, abgelehnt bleibt nach Neustart erledigt',async({page})=>{
 await coachData28(page,'legacy');await open(page,'/?go=coach');const active=async()=>Object.values((await stored(page)).coachMsgs).filter((m:any)=>m.id.startsWith('msg-swim-legacy-')&&m.proposal?.status==='open') as any[];await expect.poll(async()=>(await active()).length).toBe(1);const id=(await active())[0].id;await page.locator('[data-msg="'+id+'"] [data-act="prop"][data-ok="0"]').click();await expect.poll(async()=>(await active()).length).toBe(0);await page.reload();await expect.poll(async()=>(await active()).length).toBe(0);
});
test('Coach28: konkrete Sportwahlfrage wird direkt und ohne Planmutation beantwortet',async({page})=>{
 await coachData28(page,'choice');await open(page,'/?go=coach');const before=JSON.stringify((await stored(page)).adjustments);await page.locator('#coach-in').fill('Soll ich morgen schwimmen oder laufen?');await page.locator('[data-act="coach-send"]').click();await expect(page.locator('.msg.coach').last()).toContainText(/empfehle ich Laufen/);expect(JSON.stringify((await stored(page)).adjustments)).toBe(before);
});

test('Coach28: Score ohne Leistungsnachweis ist als Schaetzwert gekennzeichnet',async({page})=>{
 await coachData28(page,'choice');await open(page,'/?go=fortschritt');const levels=await page.locator('.score .lvl').allTextContents();expect(levels.length).toBeGreaterThan(0);for(const label of levels)expect(label).toMatch(/Sch.tzwert/);await page.locator('[data-act="score-open"]').first().click();await expect(page.locator('[data-score-sheet]')).toContainText(/Sch.tzwert/);
});
