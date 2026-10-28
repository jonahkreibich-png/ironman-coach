import { expect, test, vi } from 'vitest';
import {DurableStorage, type Journal} from '../../web/src/persistence';
function fixture() {
 const data=new Map<string,string>(), disk=new Map<string,string|null>();
 let quota=false, fail=false;
 const native={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{if(quota)throw Error('quota');data.set(k,v);},removeItem:(k:string)=>data.delete(k)} as any;
 const journal:Journal={read:async()=>[...disk],write:async entries=>{if(fail)throw Error('IDB aborted'); for(const [k,v] of entries)disk.set(k,v);}};
 return {data,disk,native,journal, quota:()=>quota=true, fail:()=>fail=true};
}
test('Quota: erst Commit bestaetigt, danach Neustart aus IndexedDB statt altem LocalStorage',async()=>{
 const f=fixture(), s=new DurableStorage(()=>f.native,f.journal); f.data.set('state','old'); await s.initialize(); f.quota();
 expect(s.setItem('state','new')).toBe(false); expect(s.status).toBe('pending');
 expect(await s.settled()).toBe(true); expect(s.status).toBe('saved'); expect(f.data.get('state')).toBe('old');
 const reopened=new DurableStorage(()=>f.native,f.journal); await reopened.initialize(); expect(reopened.getItem('state')).toBe('new');
});
test('abgebrochene IDB-Transaktion bestaetigt nie Speichern',async()=>{
 const f=fixture(), s=new DurableStorage(()=>f.native,f.journal); f.data.set('state','old'); f.quota(); f.fail();
 s.setItem('state','new'); expect(await s.settled()).toBe(false); expect(s.status).toBe('error'); expect(f.data.get('state')).toBe('old');
});
test('viele schnelle Korrekturen bleiben geordnet und neuester Commit gewinnt',async()=>{
 const f=fixture(),s=new DurableStorage(()=>f.native,f.journal);f.quota();
 for(let i=0;i<100;i++)s.setItem('state',String(i));
 expect(await s.settled()).toBe(true);const reopened=new DurableStorage(()=>f.native,f.journal);await reopened.initialize();expect(reopened.getItem('state')).toBe('99');
});
test('Lesefehler im Journal ist kein leerer Datenstand',async()=>{
 const f=fixture();f.journal.read=async()=>{throw Error('blocked');};
 await expect(new DurableStorage(()=>f.native,f.journal).initialize()).rejects.toThrow('blocked');
});
test('geloeschter Token darf nach Neustart nicht aus altem LocalStorage wiederkehren',async()=>{
 const f=fixture(),s=new DurableStorage(()=>f.native,f.journal);f.data.set('auth','old');f.quota();s.setItem('auth','new');await s.settled();s.removeItem('auth');await s.settled();
 const reopened=new DurableStorage(()=>f.native,f.journal);await reopened.initialize();expect(reopened.getItem('auth')).toBeNull();
});

test('zwei Tabs mit demselben Ausgangsstand schreiben atomar und behalten beide Einheiten',async()=>{
 const f=fixture();const initial=JSON.stringify({sessions:{},trend:[]});f.data.set('state',initial);
 f.journal.update=async(k,change)=>{const v=change(f.disk.get(k)??null);f.disk.set(k,v);return v;};
 const a=new DurableStorage(()=>f.native,f.journal),b=new DurableStorage(()=>f.native,f.journal);await Promise.all([a.initialize(),b.initialize()]);
 a.setMergedItem('state',JSON.stringify({sessions:{a:{metrics:{min:'41'}}},trend:[]}),initial);
 b.setMergedItem('state',JSON.stringify({sessions:{b:{metrics:{min:'52'}}},trend:[]}),initial);
 await Promise.all([a.settled(),b.settled()]);
 const reopened=new DurableStorage(()=>f.native,f.journal);await reopened.initialize();expect(JSON.parse(reopened.getItem('state')!).sessions).toEqual({a:{metrics:{min:'41'}},b:{metrics:{min:'52'}}});
});

for(const queued of [false,true])test('merged retry preserves unconfirmed additions and concurrent data; queued='+queued,async()=>{
 const f=fixture();const initial=JSON.stringify({customWorkouts:{},settings:{theme:'light'}});f.disk.set('state',initial);let rejectWrite=true;
 f.journal.update=async(k,change)=>{if(rejectWrite){rejectWrite=false;throw Error('SYNTHETIC aborted');}const next=change(f.disk.get(k)??null);f.disk.set(k,next);return next;};
 const s=new DurableStorage(()=>f.native,f.journal);await s.initialize();const first=JSON.stringify({customWorkouts:{day:[{id:'new',metrics:{min:'33'}}]},settings:{theme:'light'}});
 s.setMergedItem('state',first,initial);
 if(!queued){expect(await s.settled()).toBe(false);f.disk.set('state',JSON.stringify({customWorkouts:{other:[{id:'other-user-tab',metrics:{min:'10'}}]},settings:{theme:'dark'}}));}
 const next=JSON.stringify({...JSON.parse(first),customWorkouts:{day:[{id:'new',metrics:{min:'34'}}]}});s.setMergedItem('state',next,first);expect(await s.settled()).toBe(true);
 const reopened=new DurableStorage(()=>f.native,f.journal);await reopened.initialize();const saved=JSON.parse(reopened.getItem('state')!);expect(saved.customWorkouts.day).toEqual([{id:'new',metrics:{min:'34'}}]);if(!queued){expect(saved.settings.theme).toBe('dark');expect(saved.customWorkouts.other).toHaveLength(1);}
});
test('unchanged retry after multiple failures keeps new workout and clears retry baseline after success',async()=>{
 const f=fixture();const initial=JSON.stringify({sessions:{}}),value=JSON.stringify({sessions:{new:{metrics:{min:'33'}}}});f.disk.set('state',initial);let fail=true;
 f.journal.update=async(k,change)=>{if(fail)throw Error('SYNTHETIC aborted');const next=change(f.disk.get(k)??null);f.disk.set(k,next);return next;};const s=new DurableStorage(()=>f.native,f.journal);await s.initialize();s.setMergedItem('state',value,initial);expect(await s.settled()).toBe(false);s.setMergedItem('state',value,value);expect(await s.settled()).toBe(false);fail=false;s.setMergedItem('state',value,value);expect(await s.settled()).toBe(true);expect(JSON.parse(f.disk.get('state')!).sessions.new.metrics.min).toBe('33');
 // A later legitimate deletion from another tab must not resurrect the workout.
 f.disk.set('state',initial);s.setMergedItem('state',value,value);expect(await s.settled()).toBe(true);expect(JSON.parse(f.disk.get('state')!).sessions).toEqual({});
});
