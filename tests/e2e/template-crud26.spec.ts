import {test,expect} from './storage-harness';
import {seed,open,stored,TODAY} from './helpers';
import type {Page} from '@playwright/test';
const add=(date:string,n:number)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const legacy={id:'legacy26',name:'SYNTHETIC alte Kraft',updatedAt:1,exercises:[{name:'Kniebeuge',sets:3,reps:'8-12',kg:27.5,restSec:45}]};
async function prepare(page:Page){
 await seed(page,{extra:d=>{
  d.profile={...d.profile,birthYear:1990,sports:['run','bike','swim','strength'],teamSport:null};
  d.sessions={};d.customWorkouts={};d.workoutTemplates={};d.strengthTemplates={legacy26:JSON.parse(JSON.stringify(legacy))};
  d.plan.weeks=Array.from({length:12},(_,i)=>{const mon=add('2026-10-12',i*7);return{weekNumber:i+1,startDate:mon,endDate:add(mon,6),days:Array.from({length:7},(_,k)=>({date:add(mon,k),sessions:[]}))};});
  d.plan.weeks[0].days.find((x:any)=>x.date===TODAY).sessions=[{id:'synthetic26',sport:'run',title:'SYNTHETIC Plan',description:'SYNTHETIC',plannedMinutes:20}];
 }});
}
/** Read the real canonical browser IndexedDB, not the compatibility localStorage copy. */
async function durable(page:Page){
 return page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('stamio-durable-storage',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  try{return await new Promise<any>((resolve,reject)=>{const tx=db.transaction('values','readonly'),r=tx.objectStore('values').get('ec_state_v2');let value:any;r.onsuccess=()=>{value=r.result;};tx.oncomplete=()=>resolve(JSON.parse(value||'null'));tx.onabort=()=>reject(tx.error);});}finally{db.close();}
 });
}
async function confirmed(page:Page){
 const state=await stored(page),canonical=await durable(page);
 expect(canonical.workoutTemplates).toEqual(state.workoutTemplates);
 expect(canonical.strengthTemplates).toEqual(state.strengthTemplates);
 return state;
}
async function save(page:Page){
 await page.locator('[data-act="tpl-save"]').click();
 await expect(page.locator('[data-template-editor]')).toHaveCount(0);
 await expect(page.locator('#storage-status')).toBeHidden();
 return confirmed(page);
}
for(const sport of ['swim','bike','run','strength'])test(`${sport}: echte Vorlagen-CRUD ueber UI mit bestaetigtem IndexedDB und Reload`,async({page})=>{
 await prepare(page);await open(page,'/?go=vorlagen');
 await expect(page.locator('[data-templates]')).toBeVisible();
 expect(Object.keys((await stored(page)).workoutTemplates)).toHaveLength(0);
 await page.locator('[data-act="tpl-new"]').click();await page.locator('#tpl-sport').selectOption(sport);
 await page.locator('#tpl-name').fill('SYNTHETIC CRUD '+sport);await page.locator('#tpl-description').fill('SYNTHETIC Beschreibung '+sport);
 await page.locator('#tpl-0-name').fill('SYNTHETIC Hauptteil');
 await page.locator('#tpl-0-repeat').fill(sport==='strength'?'1':'3');
 await page.locator('#tpl-0-durationSec').fill(sport==='strength'?'40':'60');
 await page.locator('#tpl-0-restSec').fill(sport==='strength'?'60':'30');
 await page.locator('#tpl-0-intensity').fill(sport==='bike'?'Zone 2 / 160 W / 130 bpm':'Zone 2');
 if(sport==='strength'){
  await page.locator('#tpl-0-sets').fill('3');await page.locator('#tpl-0-reps').fill('8-12');await page.locator('#tpl-0-kg').fill('27.5');
 }else{
  await page.locator('#tpl-0-distanceM').fill(sport==='swim'?'50':'200');
  if(sport==='swim')await page.locator('#tpl-0-equipment').fill('buoy, board');
 }
 await page.locator('[data-act="tpl-row-add"]').click();await page.locator('#tpl-1-name').fill('SYNTHETIC Ausklang');await page.locator('#tpl-1-durationSec').fill('120');
 let state=await save(page);const entries=Object.values(state.workoutTemplates) as any[];expect(entries).toHaveLength(1);const id=entries[0].id;
 const original=entries[0];expect(original.sport).toBe(sport);expect(original.name).toBe('SYNTHETIC CRUD '+sport);expect(original.description).toBe('SYNTHETIC Beschreibung '+sport);
 expect(original.blocks.map((b:any)=>b.name)).toEqual(['SYNTHETIC Hauptteil','SYNTHETIC Ausklang']);
 expect(original.blocks[0]).toMatchObject(sport==='strength'?{repeat:1,sets:3,reps:'8-12',kg:27.5,durationSec:40,restSec:60}:{repeat:3,durationSec:60,restSec:30,distanceM:sport==='swim'?50:200});
 if(sport==='swim')expect(original.blocks[0].equipment).toEqual(['buoy','board']);
 await expect(page.locator('[data-training-template="'+id+'"]')).toContainText('6 min');
 await page.reload();await expect(page.locator('[data-training-template="'+id+'"]')).toContainText('SYNTHETIC CRUD '+sport);
 state=await confirmed(page);expect(state.workoutTemplates[id]).toEqual(original);
 await page.locator('[data-act="tpl-edit"][data-id="'+id+'"]').click();await expect(page.locator('#tpl-0-name')).toHaveValue('SYNTHETIC Hauptteil');
 await page.locator('#tpl-name').fill('SYNTHETIC bearbeitet '+sport);await page.locator('#tpl-0-name').fill('SYNTHETIC neuer Hauptteil');await page.locator('#tpl-1-durationSec').fill('180');
 state=await save(page);expect(Object.keys(state.workoutTemplates)).toEqual([id]);expect(state.workoutTemplates[id].blocks[1].durationSec).toBe(180);
 const edited=JSON.parse(JSON.stringify(state.workoutTemplates[id]));
 await page.locator('[data-act="tpl-copy"][data-id="'+id+'"]').click();await expect(page.locator('#tpl-name')).toHaveValue('SYNTHETIC bearbeitet '+sport+' (Kopie)');
 await page.locator('#tpl-0-name').fill('SYNTHETIC nur Kopie');state=await save(page);
 const copyId=Object.keys(state.workoutTemplates).find(x=>x!==id)!;expect(copyId).toBeTruthy();expect(state.workoutTemplates[id]).toEqual(edited);expect(state.workoutTemplates[copyId].blocks[0].name).toBe('SYNTHETIC nur Kopie');
 await page.reload();state=await confirmed(page);expect(Object.keys(state.workoutTemplates)).toHaveLength(2);expect(state.workoutTemplates[id]).toEqual(edited);
 const del=page.locator('[data-act="tpl-delete"][data-id="'+copyId+'"]');await del.click();expect(Object.keys((await stored(page)).workoutTemplates)).toHaveLength(2);await del.click();
 await expect(page.locator('[data-training-template="'+copyId+'"]')).toHaveCount(0);state=await confirmed(page);expect(Object.keys(state.workoutTemplates)).toEqual([id]);
 await page.reload();state=await confirmed(page);expect(Object.keys(state.workoutTemplates)).toEqual([id]);expect(state.workoutTemplates[id]).toEqual(edited);
 if(sport==='strength'){
  const old=page.locator('[data-training-template="legacy-strength:legacy26"]');await expect(old).toContainText('Original bleibt erhalten');await expect(old.locator('[data-act="tpl-edit"]')).toHaveCount(0);
  await old.locator('[data-act="tpl-copy"]').click();await expect(page.locator('#tpl-0-kg')).toHaveValue('27.5');await page.locator('#tpl-0-kg').fill('30');state=await save(page);
  expect(state.strengthTemplates).toEqual({legacy26:legacy});const adapted=Object.values(state.workoutTemplates).find((x:any)=>x.name==='SYNTHETIC alte Kraft (Kopie)') as any;expect(adapted).toBeTruthy();expect(adapted.blocks[0].kg).toBe(30);
  await page.locator('[data-act="go-sub"][data-sub="strength"]').click();await expect(page.locator('[data-strength-template="legacy26"]')).toContainText('SYNTHETIC alte Kraft');
  await page.reload();state=await confirmed(page);expect(state.strengthTemplates).toEqual({legacy26:legacy});expect(state.workoutTemplates[adapted.id].blocks[0].kg).toBe(30);
 }
});
