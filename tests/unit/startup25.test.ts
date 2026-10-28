import {expect,test,vi} from 'vitest';
import {startApplication} from '../../web/src/startup';
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};};
const nodes=()=>({root:{dataset:{} as Record<string,string>,textContent:''},notice:{hidden:false,textContent:''}});
test('Start bleibt bis zum abgeschlossenen Speicherlesen und Rendern als ladend markiert',async()=>{
 const {root,notice}=nodes(),reading=deferred(),rendering=deferred(),load=vi.fn(()=>rendering.promise);
 const run=startApplication(root,notice,()=>reading.promise,load);
 expect(root.dataset.appState).toBe('loading');expect(notice.hidden).toBe(false);expect(load).not.toHaveBeenCalled();
 reading.resolve();await Promise.resolve();expect(load).toHaveBeenCalledOnce();expect(root.dataset.appState).toBe('loading');
 rendering.resolve();await run;expect(root.dataset.appState).toBe('ready');expect(notice.hidden).toBe(true);
});
test('Lesefehler startet keine App mit leeren Defaults',async()=>{
 const {root,notice}=nodes(),load=vi.fn();await startApplication(root,notice,async()=>{throw Error('IDB failure');},load);
 expect(load).not.toHaveBeenCalled();expect(root.dataset.appState).toBe('error');expect(root.textContent).toContain('Keine Browserdaten');expect(notice.hidden).toBe(true);
});
test('Modul- oder Renderfehler zeigt einen Startfehler statt eines leeren Bildschirms',async()=>{
 const {root,notice}=nodes();await startApplication(root,notice,async()=>{},async()=>{throw Error('synthetic render error');});
 expect(root.dataset.appState).toBe('error');expect(root.textContent).toContain('nicht gestartet');expect(notice.hidden).toBe(true);
});
