export function applyCustomPlanAdjustments(customWorkouts:Record<string,any[]> = {}, adjustments:any = {}):Record<string,any[]> {
 const out:Record<string,any[]>=JSON.parse(JSON.stringify(customWorkouts));
 const records=Array.isArray(adjustments)?Object.fromEntries(adjustments.map(a=>[a.id,a])):adjustments;
 for(const a of Object.values(records).filter((a:any)=>a && !a.undone).sort((a:any,b:any)=>(a.createdAt||0)-(b.createdAt||0)||String(a.id).localeCompare(String(b.id))) as any[]) {
 if(a.type==='modify') {
 const entry=Object.values(out).flat().find(s=>s.id===a.sessionId);
 // A custom description is the legacy actual journal. Preserve it before overlaying planned instructions.
 if(entry && Object.prototype.hasOwnProperty.call(a.set||{},'description') && entry.notes===undefined) entry.notes=entry.description||'';
 if(entry) for(const [key,value] of Object.entries(a.set||{})) if(!['id','completed','metrics','metricsManual','activityId','date','sets','rpe','notes'].includes(key)) entry[key]=value===undefined?undefined:JSON.parse(JSON.stringify(value));
 continue;
 }
 if(a.type!=='custom-move'||a.from===a.to) continue;
 const source=out[a.from]||[], s=source.find(x=>x.id===a.sessionId);
 if(!s || Object.values(out).some(list=>list!==source&&list.some(x=>x.id===s.id))) continue;
 out[a.from]=source.filter(x=>x.id!==s.id); (out[a.to] ||= []).push({...s,date:a.to});
 } return out;
}
