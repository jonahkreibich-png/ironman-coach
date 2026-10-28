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
test.each([{sessions:[]},{sessions:{x:7}},{sessions:{},trend:'bad'},{sessions:{},backupVersion:999},JSON.parse('{"sessions":{},"__proto__":{"polluted":true}}')])('ungueltiges Backup wird abgewiesen: %#',async data=>{
 const b=await import('../../web/src/backup');expect(b.isBackup(data)).toBe(false);
});
test('Export/Restore enthaelt alle Daten und veraendert Eingabe nicht; vorheriger Stand bleibt als Rueckfall',async()=>{
 const store=await import('../../web/src/store');const b=await import('../../web/src/backup');
 store.STATE.sessions.a={metrics:{min:'42'},notes:'synthetic'};
 store.STATE.strengthTemplates.x={id:'x',name:'synthetic',exercises:[]};
 store.STATE.coachMsgs.x={id:'x',text:'synthetic'};store.STATE.settings.manual={ctl:22};store.saveState();
 const text=b.backupText(),data=b.parseBackupText(text);store.STATE.sessions.a.metrics.min='99';store.STATE.strengthTemplates.x.name='old-before-import';store.STATE.coachMsgs.x.text='old-before-import';store.STATE.coachMsgs.removed={id:'removed',text:'not in backup'};store.saveState();
 await b.applyBackup(data);
 expect(store.STATE.sessions.a.metrics.min).toBe('42');expect(store.STATE.strengthTemplates.x).toEqual(data.strengthTemplates.x);expect(store.STATE.coachMsgs.x).toEqual(data.coachMsgs.x);
 const expected=JSON.parse(JSON.stringify(data));delete expected.backupVersion;delete expected.exportedAt;delete expected._storageRevision;const actual=JSON.parse(JSON.stringify(store.STATE));delete actual._storageRevision;expect(actual).toEqual(expected);
 expect(data.backupVersion).toBe(2); expect(data.exportedAt).toBeTruthy();
 const recovery=JSON.parse(h.disk.get('ec_restore_previous')!);expect(recovery.sessions.a.metrics.min).toBe('99');
 const meta=JSON.parse(h.disk.get('ec_sync')!);expect(meta.pending['strengthTemplate|x'].data).toEqual(data.strengthTemplates.x);expect(meta.pending['coachMsg|x'].data).toEqual(data.coachMsgs.x);expect(meta.pending['coachMsg|removed'].deleted).toBe(true);
 const persisted=JSON.parse(h.disk.get(store.LS_KEY)!); expect(persisted.sessions).toEqual(data.sessions);
});
test('Fehler beim Import veraendert weder aktuellen Zustand noch vorhandene Daten',async()=>{
 const store=await import('../../web/src/store');const b=await import('../../web/src/backup');store.STATE.sessions.a={metrics:{min:'73'}};store.saveState();
 const previous=JSON.stringify(store.STATE);h.fail=true;
 await expect(b.applyBackup({sessions:{new:{metrics:{min:'1'}}},trend:[]})).rejects.toThrow();
 expect(JSON.stringify(store.STATE)).toBe(previous);expect(JSON.parse(h.native.get(store.LS_KEY)!).sessions.a.metrics.min).toBe('73');
});

test('Abmelden wartet auf atomare lokale Loeschung; alte Daten werden erst nach Commit entfernt',async()=>{
 const s=await import('../../web/src/store');const {storage}=await import('../../web/src/persistence');s.STATE.sessions.private={metrics:{min:'88'}};s.saveState();
 await storage.commit([[s.LS_KEY,JSON.stringify(s.STATE)],['ec_sync_auth','synthetic-token']]);
 const wiping=s.wipeLocalData();expect(storage.changing).toBe(true);expect(s.STATE.sessions.private.metrics.min).toBe('88');
 await wiping;expect(storage.changing).toBe(false);expect(s.STATE.sessions.private).toBeUndefined();expect(h.disk.get(s.LS_KEY)).toBeNull();expect(h.disk.get('ec_sync_auth')).toBeNull();expect(h.native.get(s.LS_KEY)).toBeUndefined();
});

test('wenn Teilen und Download scheitern bleibt ein vollstaendiger kopierbarer Backup-Text',async()=>{
 const s=await import('../../web/src/store');const b=await import('../../web/src/backup');s.STATE.sessions.rescue={metrics:{min:'79'}};
 const textarea={value:'',focus:vi.fn(),select:vi.fn()};
 vi.stubGlobal('navigator',{canShare:()=>false});
 (document as any).getElementById=()=>textarea;
 const url=vi.spyOn(URL,'createObjectURL').mockImplementation(()=>{throw Error('download blocked');});
 try {await b.shareBackupFile();expect(JSON.parse(textarea.value).sessions.rescue.metrics.min).toBe('79');expect(textarea.select).toHaveBeenCalled();expect(s.STATE.lastBackupAt).toBeNull();}
 finally {url.mockRestore();}
});
