import {type Page} from '@playwright/test';
import {test,expect} from './storage-harness';
import {seed,open,TODAY} from './helpers';
import fs from 'node:fs/promises';
const sid='storage-synthetic-run';
async function prepare(page:Page){
 await seed(page,{extra:d=>{
  d.profile={...(d.profile||{}),name:'Synthetischer Speichertest',birthYear:1990};d.sessions={};d.profile.sports=['run','bike','swim','strength'];
  for(const w of d.plan.weeks)for(const day of w.days)day.sessions=day.sessions.filter((s:any)=>s.sport!=='football');
  const day=d.plan.weeks.flatMap((w:any)=>w.days).find((x:any)=>x.date===TODAY);
  day.sessions=[{id:sid,date:TODAY,sport:'run',title:'Synthetischer Techniklauf',plannedMinutes:30,description:'SYNTHETIC: Technik am richtigen Tag',spec:{sport:'run',kind:'easy',ctx:{},why:'SYNTHETIC Technik bewahren',steps:[{part:'main',min:30,zone:2}]}}];
  day.sessions.push({...day.sessions[0],id:sid+'-2',title:'Synthetischer zweiter Lauf'});
 }});
}
async function editMetric(page:Page,value:string){
 await page.locator(`[data-act="sess-open"][data-sid="${sid}"]`).click();
 await page.locator('#fd-min').fill(value);await page.locator('#fd-min').dispatchEvent('change');
}
async function readJournal(page:Page,key:string){return page.evaluate(async k=>{
 const d=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('stamio-durable-storage',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 return await new Promise<string|null>((resolve,reject)=>{const t=d.transaction('values');const r=t.objectStore('values').get(k);r.onsuccess=()=>resolve(r.result??localStorage.getItem(k));r.onerror=()=>reject(r.error);});
},key);}
async function exportFileText(page:Page):Promise<string>{
 // Die Chrome-Downloads dieser eingeschraenkten Umgebung brechen selbst bei
 // einer unabhaengigen Blob-Minimalprobe ab. File/Web-Share-Grenze hier erfassen;
 // normale E2E-Laeufe und WebKit pruefen weiterhin den nativen Dateidownload.
 if(process.env.STAMIO_STORAGE_IN_PROCESS==='1' && test.info().project.name.startsWith('chromium')){
  let resolve!:(text:string)=>void;const captured=new Promise<string>(r=>resolve=r);
  await page.exposeFunction('__captureSyntheticBackupFile',(text:string)=>resolve(text));
  await page.evaluate(()=>{
   Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
   Object.defineProperty(navigator,'share',{configurable:true,value:async(data:any)=>{await (window as any).__captureSyntheticBackupFile(await data.files[0].text());}});
  });
  await page.locator('[data-act="backup-file"]').click();return captured;
 }
 const pending=page.waitForEvent('download');await page.locator('[data-act="backup-file"]').click();const file=await pending;return fs.readFile((await file.path())!,'utf8');
}
test('A: angemeldeter Testnutzer, Werte, Reload, geschlossene App und neue leere Sitzung',async({page,context,browser,request})=>{
 await request.post('/__reset');await request.post('/api/setup',{data:{name:'synthetic-initial-admin'}});const response=await request.post('/api/setup',{data:{signup:true,name:'synthetic-browser',userName:'Synthetic persistence'}});expect(response.ok()).toBe(true);const auth=await response.json();
 await prepare(page);await page.addInitScript(a=>{localStorage.setItem('ec_sync_auth',JSON.stringify(a));localStorage.setItem('ec_owner',String(a.userId));},auth);
 await open(page,'/?go=plan');await editMetric(page,'61');
 await expect.poll(async()=>{
  const res=await request.post('/api/sync',{headers:{Authorization:'Bearer '+auth.token},data:{since:0,changes:[]}});const data=await res.json();return data.records?.find((r:any)=>r.kind==='session'&&r.key===sid)?.data?.metrics?.min;
 },{timeout:20000}).toBe('61');
 await page.reload();await page.locator(`[data-act="sess-open"][data-sid="${sid}"]`).click();await expect(page.locator('#fd-min')).toHaveValue('61');
 await page.close();const reopened=await context.newPage();await reopened.clock.setFixedTime(new Date(TODAY+'T07:30:00+02:00'));await open(reopened,'/?go=plan');await reopened.locator(`[data-act="sess-open"][data-sid="${sid}"]`).click();await expect(reopened.locator('#fd-min')).toHaveValue('61');
 const fresh=await browser.newContext({baseURL:'http://localhost:4180'});const p=await fresh.newPage();await p.clock.setFixedTime(new Date(TODAY+'T07:30:00+02:00'));
 await p.addInitScript(a=>{localStorage.setItem('ec_sync_auth',JSON.stringify(a));localStorage.setItem('ec_owner',String(a.userId));localStorage.setItem('ec_ui',JSON.stringify({seenRelease:'9.9.9'}));},auth);
 await p.goto('/?go=plan');await expect(p.locator(`[data-act="sess-open"][data-sid="${sid}"]`)).toBeVisible({timeout:20000});await p.locator(`[data-act="sess-open"][data-sid="${sid}"]`).click();await expect(p.locator('#fd-min')).toHaveValue('61');await fresh.close();
});
test('LocalStorage-Quota: bestaetigte IndexedDB-Werte ueberleben Neustart',async({page})=>{
 await prepare(page);await page.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='ec_state_v2' && (window as any).__quota)throw new DOMException('quota','QuotaExceededError');return original.call(this,k,v);};});
 await open(page,'/?go=plan');await page.evaluate(()=>{(window as any).__quota=true;});await editMetric(page,'64');
 await expect.poll(async()=>JSON.parse((await readJournal(page,'ec_state_v2'))!).sessions[sid]?.metrics?.min).toBe('64');await expect(page.locator('#storage-status')).toHaveAttribute('data-status','saved');
 await page.reload();await page.locator(`[data-act="sess-open"][data-sid="${sid}"]`).click();await expect(page.locator('#fd-min')).toHaveValue('64');
});
test('B: beide Speicher blockiert, kein falscher Erfolg; Backup rettet ungespeicherte Eingaben',async({page})=>{
 await prepare(page);await page.addInitScript(()=>{
 const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='ec_state_v2'&&(window as any).__fail)throw Error('synthetic quota');return set.call(this,k,v);};
 const tx=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args:any[]){if(args[1]==='readwrite'&&(window as any).__fail)throw Error('synthetic DB failure');return (tx as any).apply(this,args);};
 });
 await open(page,'/?go=plan');await expect(page.locator('#storage-status')).toHaveAttribute('data-status','saved');const before=await page.evaluate(()=>localStorage.getItem('ec_state_v2'));await page.evaluate(()=>{(window as any).__fail=true;});await editMetric(page,'67');
 await expect(page.locator('#storage-status')).toContainText('Nicht gespeichert');expect(await page.evaluate(()=>localStorage.getItem('ec_state_v2'))).toBe(before);
 await page.locator('button[data-act="sheet-close"]').click();await page.locator('#storage-status button').click();
 const raw=await exportFileText(page);expect(JSON.parse(raw).sessions[sid].metrics.min).toBe('67');
 await expect(page.locator('#storage-status')).toContainText('Nicht gespeichert');
});
test('C: synthetisches Datei-Backup vollstaendig herunterladen und isoliert importieren',async({page,browser})=>{
 await prepare(page);await open(page,'/?go=plan');await editMetric(page,'68');await page.locator('button[data-act="sheet-close"]').click();await page.locator('[data-act="go-tab"][data-tab="mehr"]').click();await page.locator('[data-act="go-sub"][data-sub="daten"]').click();
 const raw=await exportFileText(page);const data=JSON.parse(raw);expect(data.sessions[sid].metrics.min).toBe('68');expect(data.plan.weeks.length).toBeGreaterThan(0);expect(data.backupVersion).toBe(2);expect(raw).not.toContain('ec_sync_auth');
 const isolated=await browser.newContext({baseURL:'http://localhost:4180'});const restored=await isolated.newPage();await restored.clock.setFixedTime(new Date(TODAY+'T07:30:00+02:00'));await restored.goto('/');await restored.locator('details', {has:restored.locator('#bk-file')}).locator('summary').click();await restored.locator('#bk-file').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(raw)});await restored.locator('[data-act="welcome-load"]').click();await expect(restored.locator('[data-act="go-tab"][data-tab="plan"]')).toBeVisible();await restored.goto('/?go=plan');await restored.locator(`[data-act="sess-open"][data-sid="${sid}"]`).click();await expect(restored.locator('#fd-min')).toHaveValue('68');await isolated.close();
});
test('D/E: mehrfaches Verschieben nimmt Beschreibung und Werte mit, auch nach Reload',async({page})=>{
 await prepare(page);await open(page,'/?go=plan');await editMetric(page,'69');await page.locator('button[data-act="sheet-close"]').click();
 let previous=TODAY;
 for(const date of ['2026-10-15','2026-10-16',TODAY]){
  const descriptionsBefore=await page.locator('#day-'+previous+' [data-what]').count();const beforeMove=(await readStoredMove26(page)).adjustments;
  await page.locator('[data-act="edit-toggle"]').click();await page.locator(`[data-act="sess-edit"][data-sid="${sid}"]`).click();await page.selectOption('#ed-day',date);await page.locator('[data-act="edit-save"]').click();await expect(page.locator('[data-edit-preview]')).toBeVisible();expect((await readStoredMove26(page)).adjustments).toEqual(beforeMove);await page.locator('[data-act="edit-preview-confirm"]').click();
  const confirm=page.locator('[data-act="edit-anyway"]');if(await confirm.isVisible())await confirm.click();await page.locator('[data-act="edit-toggle"]').click();
  await expect(page.locator('#day-'+previous+' [data-act="sess-open"][data-sid="'+sid+'"]')).toHaveCount(0);
  await expect(page.locator('#day-'+previous+' [data-what]')).toHaveCount(descriptionsBefore-1);
  await page.locator(`.cday-h[data-date="${date}"]`).click();await page.locator(`[data-act="sess-open"][data-sid="${sid}"]`).click();await expect(page.locator('#fd-min')).toHaveValue('69');await expect(page.locator('#sheetPanel')).toContainText('SYNTHETIC Technik bewahren');await page.locator('button[data-act="sheet-close"]').click();
  await page.reload();await expect(page.locator(`[data-act="sess-open"][data-sid="${sid}"]`)).toHaveCount(1);previous=date;
 }
});

test('Netzwerk-/Datenbankfehler wird angezeigt, lokale Werte bleiben nach Reload und werden nachgesendet',async({page,request})=>{
 await request.post('/__reset');await request.post('/api/setup',{data:{name:'synthetic-initial-admin'}});const auth=await(await request.post('/api/setup',{data:{signup:true,name:'synthetic-network',userName:'Synthetic network'}})).json();
 await prepare(page);await page.addInitScript(a=>{localStorage.setItem('ec_sync_auth',JSON.stringify(a));localStorage.setItem('ec_owner',String(a.userId));},auth);
 await open(page,'/?go=plan');await editMetric(page,'71');
 await expect.poll(async()=>{
  const r=await request.post('/api/sync',{headers:{Authorization:'Bearer '+auth.token},data:{since:0,changes:[]}});return (await r.json()).records?.find((x:any)=>x.kind==='session'&&x.key===sid)?.data?.metrics?.min;
 },{timeout:20000}).toBe('71');
 await page.locator('button[data-act="sheet-close"]').click();
 await page.route('**/api/sync',route=>route.fulfill({status:500,json:{error:'synthetic database write failure'}}));
 await editMetric(page,'72');await page.locator('button[data-act="sheet-close"]').click();await page.locator('[data-act="go-tab"][data-tab="heute"]').click();
 await expect(page.locator('[data-sync-status]').first()).toContainText(/Fehler|fehlgeschlagen/i,{timeout:15000});
 await page.reload();await page.goto('/?go=plan');await page.locator(`[data-act="sess-open"][data-sid="${sid}"]`).click();await expect(page.locator('#fd-min')).toHaveValue('72');
 await page.unroute('**/api/sync');await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect.poll(async()=>{
  const r=await request.post('/api/sync',{headers:{Authorization:'Bearer '+auth.token},data:{since:0,changes:[]}});return (await r.json()).records?.find((x:any)=>x.kind==='session'&&x.key===sid)?.data?.metrics?.min;
 },{timeout:20000}).toBe('72');
});

test('zwei offene Tabs behalten gleichzeitig geaenderte Einheiten nach Neustart',async({page,context})=>{
 await prepare(page);await open(page,'/?go=plan');await expect(page.locator('#storage-status')).toHaveAttribute('data-status','saved');
 const second=await context.newPage();await second.clock.setFixedTime(new Date(TODAY+'T07:30:00+02:00'));await open(second,'/?go=plan');
 await page.locator('[data-act="sess-open"][data-sid="'+sid+'"]').click();await second.locator('[data-act="sess-open"][data-sid="'+sid+'-2"]').click();
 await Promise.all([page.locator('#fd-min').fill('81'),second.locator('#fd-min').fill('82')]);
 await Promise.all([page.locator('#fd-min').dispatchEvent('change'),second.locator('#fd-min').dispatchEvent('change')]);
 await expect.poll(async()=>{const s=JSON.parse((await readJournal(page,'ec_state_v2'))!);return [s.sessions[sid]?.metrics?.min,s.sessions[sid+'-2']?.metrics?.min];}).toEqual(['81','82']);
 await page.reload();await page.locator('[data-act="sess-open"][data-sid="'+sid+'"]').click();await expect(page.locator('#fd-min')).toHaveValue('81');
 await second.reload();await second.locator('[data-act="sess-open"][data-sid="'+sid+'-2"]').click();await expect(second.locator('#fd-min')).toHaveValue('82');
});

test('Werte werden schon beim Tippen gespeichert, ohne das Feld vorher zu verlassen',async({page})=>{
 await prepare(page);await open(page,'/?go=plan');await page.locator(`[data-act="sess-open"][data-sid="${sid}"]`).click();
 await page.locator('#fd-min').fill('83');
 await expect.poll(async()=>JSON.parse((await readJournal(page,'ec_state_v2'))!).sessions[sid]?.metrics?.min).toBe('83');
 await expect(page.locator('#fd-min')).toBeFocused();await expect(page.locator('#storage-status')).toHaveAttribute('data-status','saved');
 await page.reload();await page.locator(`[data-act="sess-open"][data-sid="${sid}"]`).click();await expect(page.locator('#fd-min')).toHaveValue('83');
});


test('Speicherbestaetigungen bauen den eigenen Bildschirm nicht endlos neu auf',async({page})=>{
 await prepare(page);await open(page,'/?go=coach');
 await expect(page.locator('#storage-status')).toHaveAttribute('data-status','saved');
 await page.evaluate(async()=>{
  const d=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('stamio-durable-storage',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise<void>((resolve,reject)=>{const tx=d.transaction('values','readwrite');tx.objectStore('values').put(localStorage.getItem('ec_ui'),'ec_ui');tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});d.close();
 });
 await page.reload();await expect(page.locator('[data-view="coach"]')).toBeVisible();
 const redraws=await page.evaluate(()=>new Promise<number>(resolve=>{
  let count=0;const observer=new MutationObserver(()=>count++);observer.observe(document.getElementById('app')!,{childList:true});
  setTimeout(()=>{observer.disconnect();resolve(count);},500);
 }));
 expect(redraws).toBeLessThan(5);
 await page.locator('[data-act="go-tab"][data-tab="plan"]').click();
 await expect(page.locator('[data-view="plan"]')).toBeVisible();
});


test('Fehler beim Laden der Verbindungen endet sichtbar und wiederholt sich erst auf Wunsch',async({page})=>{
 await prepare(page);let attempts=0;
 await page.route('**/api/connect/catalog',async route=>{attempts++;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetisch offline'})});});
 await open(page,'/?go=verbindungen');
 await expect.poll(()=>attempts).toBeGreaterThan(0);
 await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,500)));
 expect(attempts).toBe(1);
 await page.locator('[data-act="conn-retry"]').click();
 await expect.poll(()=>attempts).toBe(2);
 await page.locator('[data-act="go-tab"][data-tab="plan"]').click();
 await expect(page.locator('[data-view="plan"]')).toBeVisible();
});


test('Verzoegerter Speicherstart zeigt Ladestatus und wartet auf die echte App',async({page})=>{
 await prepare(page);
 await page.addInitScript(()=>{
  const native=indexedDB.open.bind(indexedDB);
  indexedDB.open=((...args:any[])=>{
   const request=(native as any)(...args);
   Object.defineProperty(request,'onsuccess',{configurable:true,set(handler){request.addEventListener('success',(event:any)=>{setTimeout(()=>handler.call(request,event),6000);},{once:true});}});
   return request;
  }) as any;
 });
 await page.goto('/?go=heute');
 await expect(page.locator('#app-startup')).toBeVisible();
 await expect(page.locator('#app')).toHaveAttribute('data-app-state','loading');
 await expect(page.locator('#app')).toHaveAttribute('data-app-state','ready',{timeout:15000});
 await expect(page.locator('[data-view="heute"]')).toBeVisible();
 await expect(page.locator('#app-startup')).toBeHidden();
});

async function readStoredMove26(page:Page){await expect(page.locator('#storage-status')).toHaveAttribute('data-status','saved');return page.evaluate(()=>JSON.parse(localStorage.getItem('ec_state_v2')||'null'));}
