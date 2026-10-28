import {beforeEach, afterEach, expect, test, vi} from 'vitest';
const mem = new Map<string,string>();
let failWrite=false, failRead=false;
beforeEach(()=>{
 vi.resetModules(); mem.clear(); failWrite=false; failRead=false;
 vi.stubGlobal('localStorage',{ getItem:(k:string)=>{if(failRead) throw Error('read blocked'); return mem.get(k)??null;}, setItem:(k:string,v:string)=>{if(failWrite) throw Error('quota');mem.set(k,v);}, removeItem:(k:string)=>mem.delete(k)});
 vi.stubGlobal('document',{addEventListener:vi.fn(),querySelector:()=>null, documentElement:{lang:'de'}});
 vi.stubGlobal('window',{addEventListener:vi.fn()});
});
afterEach(()=>vi.unstubAllGlobals());
test('Schreibfehler werden als fehlgeschlagen zurueckgegeben, alter Stand bleibt erhalten',async()=>{
 const s=await import('../../web/src/store');
 s.STATE.sessions.a={metrics:{min:'45'}}; expect(s.saveState()).toBe(true);
 const previous=mem.get(s.LS_KEY); failWrite=true;
 s.STATE.sessions.a.metrics.min='52'; expect(s.saveState()).toBe(false);
 expect(mem.get(s.LS_KEY)).toBe(previous);
});
test('Lesefehler darf beim Start keine Defaults ueber bestehende Daten schreiben',async()=>{
 const original=JSON.stringify({sessions:{valuable:{metrics:{min:'63'}}}}); mem.set('ec_state_v2',original); failRead=true;
 const s=await import('../../web/src/store');
 expect(mem.get('ec_state_v2')).toBe(original);
 expect(s.saveState()).toBe(false); expect(mem.get('ec_state_v2')).toBe(original);
});
test('defektes JSON bleibt fuer Wiederherstellung unangetastet',async()=>{
 mem.set('ec_state_v2','{"sessions":{"valuable":'); const s=await import('../../web/src/store');
 expect(mem.get('ec_state_v2')).toBe('{"sessions":{"valuable":'); expect(s.saveState()).toBe(false);
});
test('saveSoon schreibt sofort statt erst nach Schliessen des Tabs',async()=>{
 const s=await import('../../web/src/store'); s.STATE.sessions.a={metrics:{min:'61'}}; s.saveSoon();
 expect(JSON.parse(mem.get(s.LS_KEY)!).sessions.a.metrics.min).toBe('61');
});
test('zweiter Tab ueberschreibt keine unveraenderten fremden Einheiten',async()=>{
 const s=await import('../../web/src/store'); s.STATE.sessions.a={metrics:{min:'45'}}; s.saveState();
 const remote=JSON.parse(mem.get(s.LS_KEY)!); remote.sessions.b={metrics:{min:'72'}}; mem.set(s.LS_KEY,JSON.stringify(remote));
 s.STATE.sessions.a.metrics.min='46'; s.saveState();
 expect(JSON.parse(mem.get(s.LS_KEY)!).sessions).toEqual({a:{metrics:{min:'46'}},b:{metrics:{min:'72'}}});
});
