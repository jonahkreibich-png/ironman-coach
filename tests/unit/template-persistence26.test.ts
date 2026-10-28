import {afterEach,beforeEach,expect,test,vi} from 'vitest';
const h=vi.hoisted(()=>({native:new Map<string,string>(),disk:new Map<string,string|null>(),fail:false,instance:null as any, Class:null as any}));
vi.mock('../../web/src/persistence',async original=>{
 const real=await original<any>();
 h.Class=real.DurableStorage;
 const make=()=>new h.Class(()=>globalThis.localStorage,{read:async()=>[...h.disk],write:async(entries:any[])=>{if(h.fail)throw Error('disk full');for(const [k,v]of entries)h.disk.set(k,v);}});
 h.instance=make();
 const storage=new Proxy({}, {get:(_,key)=>{const v=h.instance[key];return typeof v==='function'?v.bind(h.instance):v;}});
 return {...real,storage};
});
beforeEach(()=>{
 vi.resetModules();h.native.clear();h.disk.clear();h.fail=false;
 if(h.Class)h.instance=new h.Class(()=>globalThis.localStorage,{read:async()=>[...h.disk],write:async(entries:any[])=>{if(h.fail)throw Error('disk full');for(const [k,v]of entries)h.disk.set(k,v);}});
 vi.stubGlobal('localStorage',{getItem:(k:string)=>h.native.get(k)??null,setItem:(k:string,v:string)=>h.native.set(k,v),removeItem:(k:string)=>h.native.delete(k)});
 vi.stubGlobal('document',{addEventListener:vi.fn(),querySelector:()=>null,querySelectorAll:()=>[],documentElement:{lang:'de'}});
 vi.stubGlobal('window',{addEventListener:vi.fn()});vi.stubGlobal('location',{reload:vi.fn()});
});
afterEach(()=>vi.unstubAllGlobals());

test('Neue Trainingsvorlagen und alte Kraftvorlagen bleiben nach Speicherneustart erhalten',async()=>{
 const store=await import('../../web/src/store');expect(store.STATE.workoutTemplates).toEqual({});
 store.STATE.workoutTemplates.a={id:'a',name:'Synthetic run',sport:'run',blocks:[{name:'Easy',durationSec:1800}],updatedAt:1};
 store.STATE.strengthTemplates.old={id:'old',name:'Legacy',exercises:[{name:'Squat',sets:3,reps:'8',kg:40,restSec:90}]};store.saveState();
 const saved=JSON.parse(h.native.get(store.LS_KEY)!);expect(saved.workoutTemplates.a.name).toBe('Synthetic run');
 expect(store.mergeIntoDefaults(saved).workoutTemplates).toEqual(saved.workoutTemplates);expect(saved.strengthTemplates.old.exercises[0].kg).toBe(40);
});
test('Import validiert den neuen Vorlagencontainer statt Listen als Woerterbuch zu akzeptieren',async()=>{
 const {safeBackup}=await import('../../web/src/backup-validation');expect(safeBackup({sessions:{},workoutTemplates:[]})).toBe(false);
 expect(safeBackup({sessions:{},workoutTemplates:{x:4}})).toBe(false);
});
test('Backup-Roundtrip stellt Vorlagen und ausstehende Sync-Datensaetze zusammen wieder her',async()=>{
 const store=await import('../../web/src/store'),b=await import('../../web/src/backup');
 store.STATE.workoutTemplates={a:{id:'a',name:'Synthetic swim',sport:'swim',blocks:[{name:'Easy',distanceM:1000,durationSec:1200}],updatedAt:1}};
 store.STATE.strengthTemplates.old={id:'old',name:'Legacy',exercises:[]};store.saveState();const data=b.parseBackupText(b.backupText());
 store.STATE.workoutTemplates.a.name='Changed';store.saveState();await b.applyBackup(data);
 expect(store.STATE.workoutTemplates.a.name).toBe('Synthetic swim');expect(store.STATE.strengthTemplates.old.name).toBe('Legacy');
 const meta=JSON.parse(h.disk.get('ec_sync')!);expect(meta.pending['workoutTemplate|a'].data).toEqual(data.workoutTemplates.a);
 expect(meta.pending['strengthTemplate|old'].data.name).toBe('Legacy');
});

test('Import weist ungueltige Sportarten und negative Vorgaben neuer Vorlagen vor einer Wiederherstellung ab',async()=>{
 const {safeBackup}=await import('../../web/src/backup-validation');
 for(const template of [{id:'bad',name:'Synthetic',sport:'football',blocks:[{name:'x',durationSec:60}]},{id:'bad',name:'Synthetic',sport:'run',blocks:[{name:'x',durationSec:-60}]}])expect(safeBackup({sessions:{},workoutTemplates:{bad:template}})).toBe(false);
});
