/* Erst nach bestaetigtem Lesen und abgeschlossenem Rendern gilt die App als bereit.
   Auftrag 26: Der Hinweis „wird geladen“ erscheint erst, wenn der Start länger dauert (showAfterMs). Vorher blitzte er bei jedem
   Start kurz auf und schob die Ansicht beim Verschwinden nach oben.
   Auftrag 28: Der Fehler wird gemeldet (onError: Fehlerprotokoll, „Erneut versuchen“, Update suchen). Vorher wurde er still verschluckt –
   der Startfehler von Nutzer 1 seit 3.15.0 stand deshalb nie im Fehlerprotokoll. */
interface Root { dataset: {appState?:string;appError?:string}; textContent: string|null }
interface Notice { hidden: boolean }
export type StartFailure = 'storage' | 'render';
export interface StartHooks { onError?: (kind: StartFailure, err: unknown) => void }
export const START_TEXT: Record<StartFailure, string> = {
  storage: 'Deine gespeicherten Daten konnten nicht sicher gelesen werden. Bitte App erneut oeffnen. Es wurden keine Daten ersetzt. Keine Browserdaten loeschen.',
  render: 'Die App konnte nicht gestartet werden. Deine Daten sind sicher. Keine Browserdaten loeschen.'
};
export async function startApplication(root:Root,notice:Notice|null,initialize:()=>Promise<unknown>,load:()=>Promise<unknown>,showAfterMs=0,hooks:StartHooks={}):Promise<void> {
 root.dataset.appState='loading';delete root.dataset.appError;
 let timer:ReturnType<typeof setTimeout>|null=null;
 if(notice){ if(showAfterMs>0){notice.hidden=true;timer=setTimeout(()=>{timer=null;if(root.dataset.appState==='loading')notice.hidden=false;},showAfterMs);} else notice.hidden=false; }
 const done=()=>{ if(timer){clearTimeout(timer);timer=null;} if(notice)notice.hidden=true; };
 const fail=(kind:StartFailure,err:unknown)=>{
  root.dataset.appState='error';root.dataset.appError=kind;root.textContent=START_TEXT[kind];
  try { hooks.onError?.(kind,err); } catch (_) { /* die Fehlerseite bleibt in jedem Fall stehen */ }
 };
 try { await initialize(); }
 catch (e) { fail('storage',e); done(); return; }
 try { await load();root.dataset.appState='ready'; }
 catch (e) { fail('render',e); } finally { done(); }
}
