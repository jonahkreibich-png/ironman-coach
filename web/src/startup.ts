/* Erst nach bestaetigtem Lesen und abgeschlossenem Rendern gilt die App als bereit. */
interface Root { dataset: {appState?:string;appError?:string}; textContent: string|null }
interface Notice { hidden: boolean }
export async function startApplication(root:Root,notice:Notice|null,initialize:()=>Promise<unknown>,load:()=>Promise<unknown>):Promise<void> {
 root.dataset.appState='loading';delete root.dataset.appError;if(notice)notice.hidden=false;
 try { await initialize(); }
 catch (_) {
  root.dataset.appState='error';root.dataset.appError='storage';
  root.textContent='Deine gespeicherten Daten konnten nicht sicher gelesen werden. Bitte App erneut oeffnen. Es wurden keine Daten ersetzt. Keine Browserdaten loeschen.';
  if(notice)notice.hidden=true;return;
 }
 try { await load();root.dataset.appState='ready'; }
 catch (_) {
  root.dataset.appState='error';root.dataset.appError='render';
  root.textContent='Die App konnte nicht gestartet werden. Bitte erneut oeffnen. Keine Browserdaten loeschen.';
 } finally { if(notice)notice.hidden=true; }
}
