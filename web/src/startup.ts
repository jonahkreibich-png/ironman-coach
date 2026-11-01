/* Erst nach bestaetigtem Lesen und abgeschlossenem Rendern gilt die App als bereit.
   Auftrag 26: Der Hinweis „wird geladen“ erscheint erst, wenn der Start länger dauert (showAfterMs). Vorher blitzte er bei jedem
   Start kurz auf und schob die Ansicht beim Verschwinden nach oben. */
interface Root { dataset: {appState?:string;appError?:string}; textContent: string|null }
interface Notice { hidden: boolean }
export async function startApplication(root:Root,notice:Notice|null,initialize:()=>Promise<unknown>,load:()=>Promise<unknown>,showAfterMs=0):Promise<void> {
 root.dataset.appState='loading';delete root.dataset.appError;
 let timer:ReturnType<typeof setTimeout>|null=null;
 if(notice){ if(showAfterMs>0){notice.hidden=true;timer=setTimeout(()=>{timer=null;if(root.dataset.appState==='loading')notice.hidden=false;},showAfterMs);} else notice.hidden=false; }
 const done=()=>{ if(timer){clearTimeout(timer);timer=null;} if(notice)notice.hidden=true; };
 try { await initialize(); }
 catch (_) {
  root.dataset.appState='error';root.dataset.appError='storage';
  root.textContent='Deine gespeicherten Daten konnten nicht sicher gelesen werden. Bitte App erneut oeffnen. Es wurden keine Daten ersetzt. Keine Browserdaten loeschen.';
  done();return;
 }
 try { await load();root.dataset.appState='ready'; }
 catch (_) {
  root.dataset.appState='error';root.dataset.appError='render';
  root.textContent='Die App konnte nicht gestartet werden. Bitte erneut oeffnen. Keine Browserdaten loeschen.';
 } finally { done(); }
}
