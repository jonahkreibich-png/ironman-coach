import {expect,test} from 'vitest';
import {DurableStorage,type Journal} from '../../web/src/persistence';
import {safeBackup} from '../../web/src/backup-validation';
import {mergeStored} from '../../web/src/storage-merge';
import * as C from '../../shared/core';
test('4 Nutzer x 180 Tage: Speichern, Korrigieren, Verschieben, Neustarts und Backup bleiben konsistent',async()=>{
 let actions=0,restarts=0;
 for(let user=0;user<4;user++){
  const disk=new Map<string,string|null>(), native=new Map<string,string>();
  const journal:Journal={read:async()=>[...disk],write:async entries=>{for(const[k,v]of entries)disk.set(k,v);},update:async(k,change)=>{const v=change(disk.get(k)??null);disk.set(k,v);return v;}};
  const unavailable={getItem:(k:string)=>native.get(k)??null,setItem:()=>{throw Error('quota');},removeItem:()=>{throw Error('quota');}} as any;
  let storage=new DurableStorage(()=>unavailable,journal);await storage.initialize();
  let state:any={sessions:{},trend:[],adjustments:{},strengthTemplates:{},coachMsgs:{},settings:{}};
  const ledger=new Map<string,any>(), locations=new Map<string,string>();
  const dates=Array.from({length:187},(_,i)=>C.addDays('2026-01-01',i));
  const weeks=Array.from({length:27},(_,i)=>({weekNumber:i+1,days:dates.slice(i*7,i*7+7).map(date=>({date,sessions:[]}))}));
  for(let day=0;day<180;day++){
   const id='u'+user+'-s'+day, description='synthetic description '+id;
   weeks[Math.floor(day/7)].days[day%7].sessions.push({id,date:dates[day],sport:'run',description,title:id} as never);
   state.sessions[id]={metrics:{min:String(20+(day%80)),km:String(3+(day%9))},notes:'synthetic '+id};
   state.strengthTemplates['own']={id:'own',name:'synthetic '+day,exercises:[]};
   state.coachMsgs[id]={id,text:'synthetic '+day};state.settings.manual={ctl:day%60};
   for(let edit=0;edit<3;edit++){
    const baseline=JSON.stringify(state);state.sessions[id].metrics.min=String(30+day+edit);
    const key=id+'-move-'+edit;locations.set(id,dates[day+edit+1]);
    state.adjustments[key]={id:key,type:'move',sessionId:id,to:locations.get(id),createdAt:day*10+edit};
    ledger.set(id,JSON.parse(JSON.stringify(state.sessions[id])));
    storage.setMergedItem('state',JSON.stringify(state),baseline);expect(await storage.settled()).toBe(true);actions++;
    storage=new DurableStorage(()=>unavailable,journal);await storage.initialize();state=JSON.parse(storage.getItem('state')!);restarts++;
    expect(state.sessions).toEqual(Object.fromEntries(ledger));expect(safeBackup(state)).toBe(true);
    const effective=C.planDays(C.applyAdjustments(weeks,state.adjustments)).flatMap((d:any)=>d.sessions.map((s:any)=>({...s,date:d.date})));
    expect(new Set(effective.map(s=>s.id)).size).toBe(ledger.size);
    for(const s of effective){expect(s.date).toBe(locations.get(s.id));expect(s.description).toBe('synthetic description '+s.id);}
   }
   if(day%7===0){const backup=JSON.stringify({...state,backupVersion:2});const restored=JSON.parse(backup);expect(safeBackup(restored)).toBe(true);delete restored.backupVersion;expect(restored).toEqual(state);}
  }
 }
 expect(actions).toBe(2160);expect(restarts).toBe(2160);
});
test('Konflikt am selben Feld bewahrt beide Werte, getrennte Felder/Tage gehen nicht verloren',()=>{
 const base={sessions:{a:{metrics:{min:'30',hr:'120'}}},trend:[{date:'2026-10-24',sleepHours:7}]};
 const local=structuredClone(base),other=structuredClone(base);local.sessions.a.metrics.min='31';other.sessions.a.metrics.min='33';other.sessions.a.metrics.hr='125';other.trend.push({date:'2026-10-25',sleepHours:8});
 const conflicts:any[]=[];const merged=mergeStored(base,local,other,conflicts);
 expect(merged.sessions.a.metrics).toEqual({min:'31',hr:'125'});expect(merged.trend).toHaveLength(2);expect(conflicts).toEqual([{path:'.sessions.a.metrics.min',previous:'30',local:'31',other:'33'}]);
});
