import {makeTrainingTemplate} from '../../shared/training-templates26';
/* Alte Dateisicherungen (ohne Version oder Version 1/2) bleiben lesbar. */
const object=(x:any)=>!!x && typeof x==='object' && !Array.isArray(x);
export function safeBackup(value:any): boolean {
  if(!object(value) || (value.backupVersion!=null && ![1,2].includes(value.backupVersion)))return false;
  const safe=(x:any):boolean=> !x || typeof x!=='object' || Object.keys(x).every(k=>!['__proto__','prototype','constructor'].includes(k) && safe(x[k]));
  if(!safe(value))return false;
  if(!object(value.sessions) && !Array.isArray(value.trend))return false;
  for(const k of ['sessions','goals','activities','coachMsgs','coachNotes','raceResults','meals','analysis','strengthTemplates','workoutTemplates','adjustments','customWorkouts','settings','nutrition','nutritionProfile','scoreAdjust','weekNotes']) {
    if(value[k]!=null && !object(value[k]))return false;
  }
  for(const k of ['sessions','goals','activities','coachMsgs','coachNotes','raceResults','meals','analysis','strengthTemplates','workoutTemplates','adjustments']) {
    if(value[k] && !Object.values(value[k]).every(object))return false;
  }
  for(const k of ['trend','milestones','illnessPeriods'])if(value[k]!=null && (!Array.isArray(value[k]) || !value[k].every(object)))return false;
  if(value.workoutTemplates) { try { for(const t of Object.values(value.workoutTemplates)) makeTrainingTemplate(t as any); } catch { return false; } }
  if(value.customWorkouts && !Object.values(value.customWorkouts).every(x=>Array.isArray(x) && x.every(object)))return false;
  if(value.trend && !value.trend.every((p:any)=>typeof p.date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date)))return false;
  if(value.profile!=null && !object(value.profile))return false;
  if(value.plan!=null && !safePlan(value.plan))return false;
  return true;
}
export function safePlan(p:any): boolean {
 if(!object(p) || !Array.isArray(p.weeks))return false;
 const ids=new Set();
 return p.weeks.every((w:any)=>object(w) && Array.isArray(w.days) && w.days.every((d:any)=>object(d) && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && Array.isArray(d.sessions) && d.sessions.every((s:any)=>{
   if(!object(s) || typeof s.id!=='string' || !s.id || ids.has(s.id))return false; ids.add(s.id);return true;
 })));
}
