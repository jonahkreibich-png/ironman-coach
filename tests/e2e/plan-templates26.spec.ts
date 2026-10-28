import {test,expect} from './storage-harness';
import {seed,open,stored,TODAY} from './helpers';
import {makeTrainingTemplate} from '../../shared/training-templates26';
const add=(date:string,n:number)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const targetDate=add(TODAY,21);
async function prepare(page:any,sport='run',clock=TODAY){
 await seed(page,{today:clock,extra:d=>{
  d.profile={...(d.profile||{}),birthYear:1990,sports:['run','bike','swim','strength'],teamSport:null};d.sessions={target:{completed:false,metrics:{min:'12'},metricsManual:{min:true},notes:'SYNTHETIC Istwert bleibt'}};d.customWorkouts={};
  d.plan.weeks=Array.from({length:12},(_,i)=>{const mon=add('2026-10-12',i*7);return {weekNumber:i+1,startDate:mon,endDate:add(mon,6),label:'Woche '+(i+1),days:Array.from({length:7},(_,k)=>({date:add(mon,k),sessions:[]}))};});
  const days=d.plan.weeks.flatMap((w:any)=>w.days);
  days.find((x:any)=>x.date===TODAY).sessions=[{id:'target',sport,title:'SYNTHETIC Original',plannedMinutes:20,description:'SYNTHETIC ALT',date:TODAY}];
  days.find((x:any)=>x.date===targetDate).sessions=[{id:'swap-target',sport:'bike',title:'SYNTHETIC Partner',plannedMinutes:40,description:'SYNTHETIC Partnerbeschreibung'}];
  d.workoutTemplates=Object.fromEntries(['swim','bike','run','strength'].map(s=>{const t=makeTrainingTemplate({id:'t-'+s,name:'SYNTHETIC '+s,sport:s as any,description:'SYNTHETIC Vorlage',blocks:[{name:'SYNTHETIC Baustein',durationSec:60,repeat:3,restSec:30,...(s==='strength'?{sets:1,reps:'8',kg:20}:{distanceM:s==='swim'?50:200}),intensity:'Zone 2'}]});return [t.id,t];}));
 }});
}
async function acceptWarnings(page:any){if(await page.locator('[data-act="edit-anyway"]').count())await page.locator('[data-act="edit-anyway"]').click();await expect(page.locator('#storage-status')).toBeHidden();}
async function close(page:any){if(await page.locator('#sheetPanel button[data-act="sheet-close"]').count())await page.locator('#sheetPanel button[data-act="sheet-close"]').click();else await page.keyboard.press('Escape');}
for(const sport of ['swim','bike','run','strength'])test(sport+': Vorlage ersetzt/ergaenzt dieselbe ID und erstellt unabhaengige neue Einheit',async({page})=>{
 await prepare(page,sport);await open(page,'/?go=plan');
 await page.locator('[data-act="sess-open"][data-sid="target"]').click();
 await page.locator('[data-act="template-insert"]').click();
 await expect(page.locator('#tpl-filter')).toHaveValue(sport);
 await page.locator('[data-act="tpl-pick"][data-id="t-'+sport+'"]').click();await expect(page.locator('[data-template-preview]')).toBeVisible();await expect(page.locator('[data-template-preview]')).toContainText('SYNTHETIC Vorlage');
 await page.locator('[data-act="tpl-confirm"]').click();await acceptWarnings(page);
 let state=await stored(page);expect(state.sessions.target.metrics.min).toBe('12');expect(state.sessions.target.notes).toBe('SYNTHETIC Istwert bleibt');
 let modifications=Object.values(state.adjustments) as any[];expect(modifications.filter(a=>a.type==='add')).toHaveLength(0);expect(modifications.find(a=>a.type==='modify').sessionId).toBe('target');
 await page.locator('[data-act="sess-open"][data-sid="target"]').click();await expect(page.locator('[data-training-blocks]')).toContainText('SYNTHETIC Baustein');await expect(page.locator('[data-training-blocks]')).toContainText('SYNTHETIC Vorlage');
 await page.locator('[data-act="template-insert"]').click();await page.locator('[data-act="tpl-pick"][data-id="t-'+sport+'"]').click();await page.locator('[data-act="tpl-mode"][data-mode="append"]').click();await page.locator('[data-act="tpl-confirm"]').click();await acceptWarnings(page);
 state=await stored(page);modifications=Object.values(state.adjustments) as any[];const last=modifications.filter(a=>a.type==='modify').sort((a,b)=>a.createdAt-b.createdAt).at(-1);expect(last.set.trainingBlocks).toHaveLength(2);expect(state.workoutTemplates['t-'+sport].blocks).toHaveLength(1);expect(state.sessions.target.metrics.min).toBe('12');
 await page.locator('[data-act="sess-open"][data-sid="target"]').click();await page.locator('[data-act="template-edit"]').click();await page.locator('#tpl-0-name').fill('SYNTHETIC individuell '+sport);await page.locator('[data-act="tpl-save"]').click();await expect(page.locator('[data-template-preview]')).toContainText('SYNTHETIC individuell '+sport);await page.locator('[data-act="tpl-confirm"]').click();await acceptWarnings(page);
 state=await stored(page);expect(state.workoutTemplates['t-'+sport].blocks[0].name).toBe('SYNTHETIC Baustein');expect(state.sessions.target.metrics.min).toBe('12');
 await page.locator('[data-act="template-add"][data-date="'+TODAY+'"]').click();await page.locator('[data-act="tpl-pick"][data-id="t-'+sport+'"]').click();await page.locator('[data-act="tpl-confirm"]').click();await acceptWarnings(page);
 state=await stored(page);const added=(Object.values(state.adjustments) as any[]).find(a=>a.type==='add');expect(added.session.id).not.toBe('target');expect(added.to).toBe(TODAY);expect(added.session.trainingBlocks).toHaveLength(1);
 await page.reload();await expect(page.locator('[data-act="sess-open"][data-sid="'+added.session.id+'"]').first()).toBeVisible();
 state=await stored(page);expect(state.sessions.target.metrics.min).toBe('12');expect((Object.values(state.adjustments) as any[]).filter(a=>a.type==='add')).toHaveLength(1);
});
test('verpasste Einheit ueber drei Wochen verschieben, einzeln tauschen und neu laden',async({page})=>{
 await prepare(page,'run',add(TODAY,1));await open(page,'/?go=plan');await page.locator('[data-act="edit-toggle"]').click();await page.locator('[data-act="sess-edit"][data-sid="target"]').click();
 await page.locator('#ed-day').selectOption(targetDate);await page.locator('[data-act="edit-move"]').click();await expect(page.locator('[data-edit-preview]')).toBeVisible();await page.locator('[data-act="edit-preview-confirm"]').click();await acceptWarnings(page);
 let state=await stored(page);expect(state.sessions.target.completed).toBe(false);expect(state.sessions.target.metrics.min).toBe('12');expect((Object.values(state.adjustments) as any[]).some(a=>a.type==='move'&&a.to===targetDate)).toBe(true);
 await page.locator('[data-act="plan-week"][data-i="3"]').click();await page.locator('[data-act="sess-edit"][data-sid="target"]').click();await page.locator('#ed-day').selectOption(TODAY);await page.locator('[data-act="edit-move"]').click();await page.locator('[data-act="edit-preview-confirm"]').click();await acceptWarnings(page);
 await page.locator('[data-act="plan-week"][data-i="0"]').click();await page.locator('[data-act="sess-edit"][data-sid="target"]').click();await page.locator('[data-act="edit-session-swap"]').click();await page.locator('#sw-session').selectOption('swap-target');await page.locator('[data-act="edit-session-swap-go"]').click();await page.locator('[data-act="edit-preview-confirm"]').click();await acceptWarnings(page);
 await page.reload();state=await stored(page);expect(state.sessions.target.metrics.min).toBe('12');expect(state.sessions.target.completed).toBe(false);expect((Object.values(state.adjustments) as any[]).filter(a=>a.type==='move'&&a.sessionId==='target')).toHaveLength(3);
});
test('Tagesklappen erhaelt DOM/Fokus, Extras und 100-40-70 Minuten sowie Anpassungszustand',async({page})=>{
 await seed(page,{extra:d=>{d.profile={...(d.profile||{}),birthYear:1990,sports:['run','bike','swim','strength'],teamSport:null};for(const w of d.plan.weeks)for(const day of w.days)day.sessions=day.sessions.filter((s:any)=>s.sport!=='football');const day=d.plan.weeks.flatMap((w:any)=>w.days).find((x:any)=>x.date===TODAY);day.sessions=[{id:'run40',sport:'run',title:'SYNTHETIC Lauf',plannedMinutes:40},{id:'swim60',sport:'swim',title:'SYNTHETIC Schwimmen',plannedMinutes:60}];d.sessions={swim60:{skipped:true}};d.customWorkouts={[TODAY]:[{id:'extra30',sport:'bike',title:'SYNTHETIC Radextra',plannedMinutes:30,completed:false,metrics:{}}]};}});
 await open(page,'/?go=plan');const head=page.locator('.cday-h[data-date="'+TODAY+'"]');await expect(head).toContainText('1:10');await expect(head).toContainText('Rad');
 await page.evaluate(()=>{(window as any).__nodes26={app:document.querySelector('#app'),view:document.querySelector('.view'),bar:document.querySelector('#wkbar'),head:document.querySelector('.cday.today .cday-h')};});
 await head.focus();for(let i=0;i<12;i++)await page.keyboard.press('Enter');
 await expect(head).toBeFocused();for(let i=0;i<12;i++)await head.click();
 expect(await page.evaluate(()=>{const n=(window as any).__nodes26;return n.app===document.querySelector('#app')&&n.view===document.querySelector('.view')&&n.bar===document.querySelector('#wkbar')&&n.head===document.querySelector('.cday.today .cday-h');})).toBe(true);
 await page.locator('[data-act="plan-adjustments"]').click();await expect(page.locator('#plan-adjustments-body')).toBeVisible();await open(page,'/?go=plan');await expect(page.locator('#plan-adjustments-body')).toBeVisible();
});

test('Datenbank-Sync speichert neue Vorlagen getrennt pro Konto und loescht sie per Tombstone',async({request})=>{
 await request.post('/__reset');const first=await(await request.post('/api/setup',{data:{name:'SYNTHETIC Admin'}})).json();
 const template={id:'db-template',name:'SYNTHETIC Database swim',sport:'swim',blocks:[{name:'Technik',repeat:4,distanceM:50,durationSec:60,restSec:20}],updatedAt:Date.now()};
 const headers={Authorization:'Bearer '+first.token};
 const saved=await request.post('/api/sync',{headers,data:{since:0,changes:[{kind:'workoutTemplate',key:template.id,data:template,updatedAt:Date.now()}]}});expect(saved.status()).toBe(200);
 const read=await(await request.post('/api/sync',{headers,data:{since:0,changes:[]}})).json();expect(read.records.find((r:any)=>r.kind==='workoutTemplate').data).toEqual(template);
 const second=await(await request.post('/api/setup',{data:{signup:true,name:'SYNTHETIC Other'}})).json();
 const isolated=await(await request.post('/api/sync',{headers:{Authorization:'Bearer '+second.token},data:{since:0,changes:[]}})).json();expect(isolated.records.filter((r:any)=>r.kind==='workoutTemplate')).toHaveLength(0);
 const removed=await request.post('/api/sync',{headers,data:{since:0,changes:[{kind:'workoutTemplate',key:template.id,deleted:true,updatedAt:Date.now()+1000}]}});expect(removed.status()).toBe(200);
 const after=await(await request.post('/api/sync',{headers,data:{since:0,changes:[]}})).json();expect(after.records.find((r:any)=>r.kind==='workoutTemplate').deleted).toBe(true);
});


test('Zusatzentwurf: Vorlage sichtbar, ueber Wochen verschieben, Istwert am neuen Tag und Neustart',async({page})=>{
 await prepare(page);await page.addInitScript(()=>{if(!sessionStorage.getItem('__custom26')){const d=JSON.parse(localStorage.getItem('ec_state_v2')!);d.customWorkouts={'2026-10-14':[{id:'custom-draft26',sport:'run',title:'SYNTHETIC Zusatz',description:'SYNTHETIC Notiz',plannedMinutes:20,completed:false,metrics:{min:'11'},metricsManual:{min:true}}]};localStorage.setItem('ec_state_v2',JSON.stringify(d));sessionStorage.setItem('__custom26','1');}});
 await open(page,'/?go=plan');await page.locator('[data-act="custom-open"][data-cid="custom-draft26"]').click();await page.locator('[data-act="template-insert"]').click();await page.locator('[data-act="tpl-pick"][data-id="t-run"]').click();await page.locator('[data-act="tpl-confirm"]').click();await acceptWarnings(page);
 await page.locator('[data-act="custom-open"][data-cid="custom-draft26"]').click();await expect(page.locator('[data-training-blocks]')).toContainText('SYNTHETIC Baustein');await close(page);
 await page.locator('[data-act="edit-toggle"]').click();await page.locator('[data-act="sess-edit"][data-sid="custom-draft26"]').click();await page.locator('#ed-day').selectOption(targetDate);await page.locator('[data-act="edit-move"]').click();await page.locator('[data-act="edit-preview-confirm"]').click();await acceptWarnings(page);
 await page.locator('[data-act="plan-week"][data-i="3"]').click();await page.locator('[data-act="edit-toggle"]').click();await page.locator('.cday-h[data-date="'+targetDate+'"]').click();await page.locator('[data-act="custom-open"][data-cid="custom-draft26"]').click();await expect(page.locator('[data-training-blocks]')).toContainText('SYNTHETIC Baustein');const min=page.locator('[data-ch="fd"][data-k="min"]').first();await min.fill('17');await min.blur();await expect(page.locator('#storage-status')).toBeHidden();await page.locator('[data-act="custom-complete"]').click();await expect(page.locator('#storage-status')).toBeHidden();await page.reload();
 await page.locator('[data-act="custom-open"][data-cid="custom-draft26"]').click();await expect(page.locator('[data-training-blocks]')).toContainText('SYNTHETIC Baustein');await expect(page.locator('[data-ch="fd"][data-k="min"]').first()).toHaveValue('17');await expect(page.locator('[data-act="template-insert"]')).toHaveCount(0);
 const state=await stored(page);expect(state.customWorkouts[TODAY]).toHaveLength(1);expect(state.customWorkouts[TODAY][0]).toMatchObject({id:'custom-draft26',completed:true,metrics:{min:'17'}});expect(state.customWorkouts[targetDate]||[]).toHaveLength(0);expect((Object.values(state.adjustments) as any[]).filter(a=>a.type==='custom-move')).toHaveLength(1);
});
