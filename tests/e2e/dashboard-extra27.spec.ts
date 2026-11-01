import {test,expect} from './storage-harness';
import {seed,open,stored,TODAY} from './helpers';
test('Dashboard einklappen bleibt nach Reload erhalten; keine kryptische Istkurzform',async({page})=>{
 await seed(page,{extra:d=>{d.sessions={};d.customWorkouts={[TODAY]:[{id:'unknown-time',sport:'strength',title:'SYNTHETIC Kraft',completed:true}]};}});await open(page,'/?go=plan');
 const toggle=page.getByRole('button',{name:'Dein Trainingsdashboard'});await expect(toggle).toHaveAttribute('aria-expanded','true');await toggle.click();await expect(page.locator('#plan-dashboard-body')).toBeHidden();await page.reload();await expect(toggle).toHaveAttribute('aria-expanded','false');await toggle.click();await expect(page.locator('#plan-dashboard-body')).toBeVisible();
 await expect(page.locator('[data-actual-minutes]')).toHaveCount(0);await expect(page.locator('[data-dashboard-actual]')).toContainText('Dauer offen');await expect(page.locator('[data-dashboard-actual]')).not.toContainText('+ ?');
});
for(const sport of ['run','bike','swim','strength'])test(sport+': Extra direkt mit Istwerten abbrechen, speichern und neu laden',async({page})=>{
 await seed(page,{extra:d=>{d.customWorkouts={};}});await open(page,'/?go=plan');
 await page.locator('[data-act="custom-add"]').first().click();await page.locator('#ca-title').fill('SYNTHETIC '+sport);await page.locator('#ca-sport').selectOption(sport);
 await expect(page.locator('[data-fields="'+sport+'"]')).toBeVisible();await page.locator('#fd-min').fill('42');
 if(sport==='strength'){
  await expect(page.locator('#fd-km')).toHaveCount(0);await page.locator('[data-act="fd-ex-add"]').click();await expect(page.locator('#ca-title')).toHaveValue('SYNTHETIC strength');await expect(page.locator('#fd-min')).toHaveValue('42');await page.getByRole('textbox',{name:'Übung',exact:true}).fill('SYNTHETIC Kniebeuge');await page.getByRole('textbox',{name:'Sätze',exact:true}).fill('3');
 }else{await page.locator(sport==='swim'?'#fd-meters':'#fd-km').fill(sport==='swim'?'1200':'12');}
 await page.locator('[data-act="fd-rpe"][data-v="6"]').click();await expect(page.locator('#fd-min')).toHaveValue('42');await page.locator('button[data-act="sheet-close"]').click();expect(Object.values((await stored(page)).customWorkouts).flat()).toHaveLength(0);
 await page.locator('[data-act="custom-add"]').first().click();await page.locator('#ca-sport').selectOption(sport);await page.locator('#ca-title').fill('SYNTHETIC gespeichert');await page.locator('#fd-min').fill('43');
 if(sport==='strength'){await page.locator('[data-act="fd-ex-add"]').click();await page.getByRole('textbox',{name:'Übung',exact:true}).fill('SYNTHETIC Kniebeuge');}else await page.locator(sport==='swim'?'#fd-meters':'#fd-km').fill(sport==='swim'?'1300':'13');
 await page.locator('[data-act="fd-rpe"][data-v="7"]').click();await page.locator('[data-act="custom-save"]').click();await expect(page.locator('#sheet')).toBeHidden();await page.reload();
 const all=Object.values((await stored(page)).customWorkouts).flat() as any[];expect(all).toHaveLength(1);expect(all[0].metrics.min).toBe('43');expect(all[0].sport).toBe(sport);expect(all[0].rpe).toBe('7');expect(all[0].title).toBe('SYNTHETIC gespeichert');
 if(sport==='strength'){expect(all[0].metrics.km).toBeUndefined();expect(all[0].plannedKm).toBeUndefined();expect(all[0].metrics.exercises[0].name).toBe('SYNTHETIC Kniebeuge');}else expect(all[0].metrics[sport==='swim'?'meters':'km']).toBe(sport==='swim'?'1300':'13');
});
test('Sportwechsel behaelt Werte je Sport ohne Laufkilometer in Kraft zu speichern',async({page})=>{
 await seed(page,{extra:d=>{d.customWorkouts={};}});await open(page,'/?go=plan');await page.locator('[data-act="custom-add"]').first().click();await page.locator('#fd-km').fill('8');await page.locator('#ca-sport').selectOption('strength');await expect(page.locator('#fd-km')).toHaveCount(0);await page.locator('#ca-sport').selectOption('run');await expect(page.locator('#fd-km')).toHaveValue('8');await page.locator('#ca-sport').selectOption('strength');await page.locator('#fd-min').fill('20');await page.locator('[data-act="custom-save"]').click();await expect(page.locator('#sheet')).toBeHidden();const all=Object.values((await stored(page)).customWorkouts).flat() as any[];expect(all).toHaveLength(1);expect(all[0].metrics.km).toBeUndefined();
});

test('Langsames Speichern sperrt Eingaben und schliesst keinen neu geoeffneten Entwurf',async({page})=>{
 await seed(page,{extra:d=>{d.customWorkouts={};}});await page.addInitScript(()=>{
  const descriptor=Object.getOwnPropertyDescriptor(IDBTransaction.prototype,'oncomplete')!;
  Object.defineProperty(IDBTransaction.prototype,'oncomplete',{...descriptor,set(callback){descriptor.set!.call(this,typeof callback==='function'?function(this:IDBTransaction,event:Event){const call=()=>callback.call(this,event);if((window as any).__holdCommit)((window as any).__commits ||= []).push(call);else call();}:callback);}});
 });
 await open(page,'/?go=plan');await page.locator('[data-act="custom-add"]').first().click();await page.locator('#ca-title').fill('SYNTHETIC A');await page.locator('#fd-min').fill('30');await page.locator('#fd-min').blur();await expect(page.locator('#storage-status')).toHaveAttribute('data-status','saved');
 await page.evaluate(()=>{(window as any).__holdCommit=true;});await page.locator('[data-act="custom-save"]').click();await expect(page.locator('#fd-min')).toBeDisabled();await page.locator('button[data-act="sheet-close"]').click();
 await page.locator('[data-act="custom-add"]').first().click();await page.locator('#ca-title').fill('SYNTHETIC B');await page.locator('#fd-min').fill('45');
 await expect.poll(()=>page.evaluate(()=>((window as any).__commits||[]).length)).toBeGreaterThan(0);await page.evaluate(()=>{(window as any).__holdCommit=false;for(const call of (window as any).__commits||[])call();});
 await expect(page.locator('#storage-status')).toHaveAttribute('data-status','saved');await expect(page.locator('#sheet')).toBeVisible();await expect(page.locator('#ca-title')).toHaveValue('SYNTHETIC B');await expect(page.locator('#fd-min')).toHaveValue('45');
 const all=Object.values((await stored(page)).customWorkouts).flat() as any[];expect(all).toHaveLength(1);expect(all[0].title).toBe('SYNTHETIC A');expect(all[0].metrics.min).toBe('30');
 await page.locator('[data-act="custom-save"]').click();await expect(page.locator('#sheet')).toBeHidden();expect(Object.values((await stored(page)).customWorkouts).flat()).toHaveLength(2);
});
test('Fehlgeschlagener Extra-Speichervorgang behaelt Formular und dupliziert beim Wiederholen nicht',async({page})=>{
 await seed(page,{extra:d=>{d.customWorkouts={};}});await page.addInitScript(()=>{
 const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args:any[]){if(args[1]==='readwrite'&&(window as any).__failExtra)throw Error('SYNTHETIC write failed');return (original as any).apply(this,args);};
 });await open(page,'/?go=plan');await page.locator('[data-act="custom-add"]').first().click();await page.locator('#fd-min').fill('33');await page.locator('#fd-min').blur();await expect(page.locator('#storage-status')).toHaveAttribute('data-status','saved');await page.evaluate(()=>{(window as any).__failExtra=true;});
 await page.locator('[data-act="custom-save"]').click();await expect(page.locator('#storage-status')).toContainText('Nicht gespeichert');await expect(page.locator('#sheet')).toBeVisible();await expect(page.locator('#fd-min')).toHaveValue('33');
 await page.evaluate(()=>{(window as any).__failExtra=false;});await page.locator('[data-act="custom-save"]').click();await expect(page.locator('#sheet')).toBeHidden();await page.reload();const all=Object.values((await stored(page)).customWorkouts).flat() as any[];expect(all).toHaveLength(1);expect(all[0].metrics.min).toBe('33');
});
