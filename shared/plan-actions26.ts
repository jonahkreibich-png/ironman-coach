/** Pure proposals: adjustments keep IDs and journal untouched; validate again at commit. */
import { applyCustomPlanAdjustments } from './custom-locations26';
export { applyCustomPlanAdjustments } from './custom-locations26';
import { applyAdjustments } from './core';
export type PlanAction26 = {type:'move';sessionId:string;to:string} | {type:'swap';sessionId:string;otherSessionId:string} | {type:'swapDays';from:string;to:string};
export type PlanPreview26 = {sessionId:string;title:string;from:string;to:string};
/** Parse before generation: invalid input must never silently fall back to a different duration. */
export function parsePlanNumbers(minutesInput:string, kmInput=''):{minutes:number;km:number|null} {
 const minutes=Number(minutesInput.trim().replace(',','.'));
 const raw=kmInput.trim(); const km=raw===''?null:Number(raw.replace(',','.'));
 if(!Number.isFinite(minutes)||minutes<=0) throw Error('Bitte eine positive, endliche Trainingsdauer eingeben.');
 if(km!==null&&(!Number.isFinite(km)||km<0)) throw Error('Bitte eine nichtnegative, endliche Distanz eingeben.');
 return {minutes,km};
}
function effectiveWeeks(weeks:any[],state:any):any[] {
 const extras=applyCustomPlanAdjustments(state.customWorkouts,state.adjustments);
 return weeks.map(w=>({...w,days:(w.days||[]).map(d=>({...d,sessions:[...(d.sessions||[]),...(extras[d.date]||[]).map(s=>({...s,_custom26:true}))]}))}));
}
function index(weeks:any[]) {
 const days=new Map<string,any>(), sessions=new Map<string,{day:any;session:any}>();
 for(const w of weeks) for(const day of w.days||[]) { days.set(day.date,day); for(const session of day.sessions||[]) {
 if(sessions.has(session.id)) throw Error('Einheiten-ID mehrfach vorhanden. Bitte zuerst den Plan pruefen.');
 sessions.set(session.id,{day,session});
 }} return {days,sessions};
}
export function assertPlanAdjustments(weeks:any[],state:any,adjustments:any[]):void {
 const {days,sessions}=index(effectiveWeeks(weeks,state)), added=new Set<string>(), moved=new Set<string>();
 for(const a of adjustments) {
 if(a.sessionId && state.sessions?.[a.sessionId]?.completed) throw Error('Bereits absolvierte Einheiten bleiben unveraendert.');
 const x=sessions.get(a.sessionId);
 if(x?.session.trainingBlocks && a.type==='modify' && !Array.isArray(a.set?.trainingBlocks) && Object.keys(a.set||{}).some(k=>['sport','plannedMinutes','plannedKm','spec','description','title','zone','hard'].includes(k))) throw Error('Bitte die Trainingsbausteine bearbeiten, damit Dauer und Beschreibung zusammenpassen.');
 if(x && (x.session.completed || (x.session._custom26 && x.session.completed!==false))) throw Error('Bereits absolvierte Einheiten bleiben unveraendert.');
 if(Object.keys(a.set||{}).some(k=>['completed','metrics','metricsManual','activityId','date','rpe','notes'].includes(k))) throw Error('Istwerte duerfen durch Planaktionen nicht geaendert werden.');
 if(a.type==='add') {
 if(!days.has(a.to)||!a.session?.id||sessions.has(a.session.id)||added.has(a.session.id)) throw Error('Ungueltiges Ziel oder doppelte Einheiten-ID.');
 added.add(a.session.id);
 } else if(a.type==='move'||a.type==='custom-move') {
 if(!x||!days.has(a.to)||x.day.date===a.to||moved.has(a.sessionId)||a.from!==x.day.date) throw Error('Der Plan wurde inzwischen geaendert. Bitte die Vorschau erneut oeffnen.');
 if((x.session._custom26 && x.session.completed!==false) || x.session.completed || x.session.sport==='rest'||x.session.cancelled||x.session.removed||x.session.fixed||x.session.race) throw Error('Diese Einheit ist absolviert, ausgefallen oder fest geplant.');
 moved.add(a.sessionId);
 } else if(a.sessionId && !x && !added.has(a.sessionId)) throw Error('Diese Einheit ist nicht mehr im Plan.');
 if(a.set?.id && a.set.id!==a.sessionId) throw Error('Die Identitaet einer Einheit darf nicht geaendert werden.');
 }
}
export function proposePlanAction(weeks:any[],state:any,action:PlanAction26,group:string):{adjustments:any[];preview:PlanPreview26[];warnings:string[]} {
 const effective=effectiveWeeks(weeks,state); const {days,sessions}=index(effective); const preview:PlanPreview26[]=[];
 const move=(id:string,to:string)=>{ const x=sessions.get(id); if(!x) throw Error('Einheit nicht gefunden.'); preview.push({sessionId:id,title:x.session.title,from:x.day.date,to}); };
 if(action.type==='move') move(action.sessionId,action.to);
 else if(action.type==='swap') {const a=sessions.get(action.sessionId),b=sessions.get(action.otherSessionId);if(!a||!b||a.day.date===b.day.date) throw Error('Bitte Einheiten an unterschiedlichen Tagen waehlen.');move(action.sessionId,b.day.date);move(action.otherSessionId,a.day.date);}
 else {
 const a=days.get(action.from),b=days.get(action.to); if(!a||!b||a===b) throw Error('Bitte unterschiedliche Tage im Plan waehlen.');
 for(const s of a.sessions||[]) if(s.sport!=='rest'&&!s.cancelled&&!s.removed) move(s.id,b.date);
 for(const s of b.sessions||[]) if(s.sport!=='rest'&&!s.cancelled&&!s.removed) move(s.id,a.date);
 }
 if(!preview.length) throw Error('Keine verschiebbaren Einheiten vorhanden.');
 const adjustments=preview.map((p,i)=>({id:`${group}-${i}`,group,type:sessions.get(p.sessionId)!.session._custom26?'custom-move':'move',sessionId:p.sessionId,from:p.from,to:p.to,what:`${p.title}: ${p.from} → ${p.to}`,reason:'Von dir angepasst'}));
 assertPlanAdjustments(weeks,state,adjustments);
 const next=applyAdjustments(effective,Object.fromEntries(adjustments.map(a=>[a.id,{...a,type:a.type==='custom-move'?'move':a.type}])));
 const warnings:string[]=[];
 for(const day of next.flatMap(w=>w.days)) if(preview.some(p=>p.to===day.date)&&(day.sessions||[]).filter((s:any)=>!s.cancelled&&!s.removed&&(s.hard||s.spec?.kind==='intervals'||s.spec?.kind==='threshold')).length>1) warnings.push(`${day.date}: mehrere intensive Einheiten an einem Tag.`);
 return {adjustments,preview,warnings};
}
