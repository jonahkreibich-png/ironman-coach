import {afterEach,beforeEach,expect,test,vi} from 'vitest';
const h=vi.hoisted(()=>({save:vi.fn(),settled:vi.fn(),toast:vi.fn()}));
vi.mock('../../web/src/store',()=>({saveState:h.save}));
vi.mock('../../web/src/toast',()=>({toast:h.toast}));
vi.mock('../../web/src/persistence',()=>({storage:{settled:h.settled},storageMessage:()=> 'Nicht gespeichert'}));
let events:Record<string,Function>, registration:any;
beforeEach(()=>{
 vi.resetModules();vi.stubEnv('DEV',false);h.save.mockReset();h.settled.mockReset();h.toast.mockReset();events={};
 registration={waiting:null,addEventListener:vi.fn(),update:vi.fn()};
 vi.stubGlobal('window',{addEventListener:vi.fn()});
 vi.stubGlobal('document',{readyState:'complete',addEventListener:vi.fn(),getElementById:()=>null});
 vi.stubGlobal('location',{protocol:'https:',reload:vi.fn()});
 vi.stubGlobal('navigator',{serviceWorker:{register:vi.fn(async()=>registration),controller:{},addEventListener:(k:string,f:Function)=>events[k]=f},storage:{persist:vi.fn(async()=>true)}});
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
test('PWA registriert sich auch nach asynchronem Datenstart und bereits geladenem Dokument',async()=>{
 const p=await import('../../web/src/pwa');p.startPwa();await Promise.resolve();expect(navigator.serviceWorker.register).toHaveBeenCalledOnce();expect(events.controllerchange).toBeTypeOf('function');
});
test('Update-Neuladen wartet auf bestaetigtes Speichern',async()=>{
 let resolve!:(v:boolean)=>void;h.settled.mockReturnValue(new Promise<boolean>(r=>resolve=r));
 const p=await import('../../web/src/pwa');p.startPwa();await Promise.resolve();
 const changing=events.controllerchange();expect(h.save).toHaveBeenCalledOnce();expect(location.reload).not.toHaveBeenCalled();resolve(true);await changing;expect(location.reload).toHaveBeenCalledOnce();
});
