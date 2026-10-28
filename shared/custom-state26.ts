import {applyCustomPlanAdjustments} from './custom-locations26';
/* Ausschliesslich Lesemodell. Der kanonische Custom-Datensatz bleibt am Ursprungsort. */
export function effectiveCustomBuckets(state:any):Record<string,any[]> {
 const raw=state?.customWorkouts||{};
 const ids=new Set(Object.values(raw).flat().map((s:any)=>s.id));
 const relevant=Object.values(state?.adjustments||{}).some((a:any)=>a&&!a.undone&&(a.type==='custom-move'||a.type==='modify')&&ids.has(a.sessionId));
 return relevant?applyCustomPlanAdjustments(raw,state.adjustments):raw;
}
