/* Ein ungespeicherter Extraentwurf wird nie Teil des App-Zustands. */
let draft:any=null;
export function customDraft(id:string):any {return draft?.id===id?draft:null;}
export function setCustomDraft(value:any):void {draft=value;}
export function clearCustomDraft():void {draft=null;}
