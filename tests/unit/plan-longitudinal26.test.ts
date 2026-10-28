import {describe,expect,test} from 'vitest';
import {applyAdjustments} from '../../shared/core';
import {proposePlanAction,assertPlanAdjustments} from '../../shared/plan-actions26';
import {applyCustomPlanAdjustments} from '../../shared/custom-locations26';
import {daySummary} from '../../shared/plan-summary26';
import {makeTrainingTemplate,templateSession,applyTemplate,templateTotals} from '../../shared/training-templates26';
const profiles=[['beginner',12,25],['advanced',13,55],['performance',14,85],['football-triathlon',15,60],['little-time',16,15],['irregular',17,35],['frequent-changes',18,45],['many-extras',19,30],['missed-training',20,40],['corrections',21,50]] as const;
const dateAt=(n:number)=>new Date(Date.UTC(2026,0,5+n)).toISOString().slice(0,10);
const sports=['swim','bike','run','strength'] as const;
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
type Entry={id:string,date:string,sport:string,title:string,description:string,minutes:number,source:string,completed:boolean,cancelled:boolean,removed:boolean,actual:number|null,spec:any};
/** Virtual software timelines only. The oracle is an independently mutated event ledger. */
describe('SIM26 independent ledger after every action and JSON restart',()=>{
for(const [name,horizon,baseMinutes]of profiles)test(`${name}: ${horizon} virtual weeks, seed ${2600+horizon}`,()=>{
let rng=2600+horizon,actions=0,restarts=0;
const rand=(n:number)=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng%n;};
let state:any={sessions:{},customWorkouts:{},activities:{},adjustments:{},settings:{},trainingTemplates:{}};
let weeks:any[]=Array.from({length:horizon},(_,w)=>({weekNumber:w+1,days:Array.from({length:7},(_,d)=>({date:dateAt(w*7+d),sessions:[]}))}));
const ledger=new Map<string,Entry>();
const register=(s:any,date:string,source='planned')=>ledger.set(s.id,{id:s.id,date,sport:s.sport,title:s.title,description:s.description,minutes:s.plannedMinutes,source,completed:false,cancelled:false,removed:false,actual:null,spec:clone(s.spec??null)});
for(let w=0;w<horizon;w++){
for(let j=0;j<4;j++){const s={id:`${name}-${w}-${j}`,sport:sports[j],title:`${name} ${w}/${j}`,description:`unique ${name}/${w}/${j}`,plannedMinutes:baseMinutes+j*5,spec:{steps:[{reps:j+1,min:baseMinutes+j*5,intensity:'Z2'}]}};const day=weeks[w].days[j<2?0:j-1];day.sessions.push(s);register(s,day.date);}
if(name==='football-triathlon'){const s={id:`football-${w}`,sport:'football',title:'Football',description:`match ${w}`,plannedMinutes:90};weeks[w].days[6].sessions.push(s);register(s,dateAt(w*7+6));}
}
const effective=()=>applyAdjustments(weeks,state.adjustments);
function verify(label:string){
const ctx=`${name},seed=${2600+horizon},action=${actions},${label}`,before=JSON.stringify({weeks,state});
const custom=applyCustomPlanAdjustments(state.customWorkouts,state.adjustments),seen=new Set<string>();
for(const day of effective().flatMap((w:any)=>w.days)){
const expected=[...ledger.values()].filter(e=>e.date===day.date&&!e.removed),summary=daySummary(day,{...state,customWorkouts:custom});
expect(summary.rows.map(r=>r.id).sort(),ctx).toEqual(expected.map(e=>e.id).sort());
expect(summary.upcoming.map(r=>r.id).sort(),ctx).toEqual(expected.filter(e=>!e.completed&&!e.cancelled).map(e=>e.id).sort());
expect(summary.plannedMinutes,ctx).toBe(expected.filter(e=>!e.cancelled).reduce((n,e)=>n+e.minutes,0));
expect(summary.actualMinutes,ctx).toBe(expected.filter(e=>e.completed).reduce((n,e)=>n+(e.actual??0),0));
for(const r of summary.rows){const e=ledger.get(r.id)!;expect(seen.has(r.id),ctx).toBe(false);seen.add(r.id);
expect({sport:r.session.sport,title:r.session.title,description:r.session.description,date:r.session.date,min:r.plannedMinutes,completed:r.completed,cancelled:r.cancelled,actual:r.actualMinutes,source:r.source},ctx).toEqual({sport:e.sport,title:e.title,description:e.description,date:e.date,min:e.minutes,completed:e.completed,cancelled:e.cancelled,actual:e.actual,source:e.source});
if(e.spec)expect(r.session.spec,ctx).toEqual(e.spec);
}}
expect(seen.size,ctx).toBe([...ledger.values()].filter(e=>!e.removed).length);expect(JSON.stringify({weeks,state}),ctx).toBe(before);
}
const step=(label:string,fn:()=>void)=>{fn();actions++;verify(label);};
const adjust=(a:any)=>{a.id=`event-${actions}`;a.createdAt=actions;state.adjustments[a.id]=a;};
function plan(action:any){const p=proposePlanAction(effective(),state,action,`group-${actions}`);assertPlanAdjustments(effective(),state,p.adjustments);for(const a of p.adjustments)state.adjustments[a.id]={...a,createdAt:actions};}
function move(id:string,to:string){plan({type:'move',sessionId:id,to});ledger.get(id)!.date=to;}
verify('initial');
for(let w=0;w<horizon;w++){
const [a,b,c,d]=Array.from({length:4},(_,j)=>`${name}-${w}-${j}`);
const target=dateAt(((w+3+rand(horizon-3))%horizon)*7+3+rand(3));
step('undocumented move across weeks',()=>move(a,target));
step('single swap leaves sibling',()=>{const left=ledger.get(a)!.date,right=ledger.get(b)!.date;plan({type:'swap',sessionId:a,otherSessionId:b});ledger.get(a)!.date=right;ledger.get(b)!.date=left;});
step('whole day swap',()=>{const from=ledger.get(c)!.date;const candidates=weeks.flatMap((x:any)=>x.days).map((x:any)=>x.date).filter((date:string)=>date!==from&&![...ledger.values()].some(e=>e.date===date&&(e.completed||e.cancelled)));const to=candidates[rand(candidates.length)];const changes=[...ledger.values()].filter(e=>!e.removed&&!e.cancelled&&(e.date===from||e.date===to)).map(e=>[e,e.date===from?to:from]as const);plan({type:'swapDays',from,to});for(const [e,date]of changes)e.date=date;});
step('cancel',()=>{adjust({type:'cancel',sessionId:d,reason:'synthetic'});ledger.get(d)!.cancelled=true;});
const extra=`manual-${name}-${w}`,extraDate=dateAt(w*7+4);
step('manual draft',()=>{const s={id:extra,sport:'bike',title:'Extra',description:`manual ${w}`,plannedMinutes:10+rand(25),completed:false};(state.customWorkouts[extraDate]??=[]).push(s);register(s,extraDate,'custom');});
step('move custom',()=>move(extra,dateAt(((w+2)%horizon)*7+5)));
const sport=sports[w%4],reps=2+rand(4),duration=60+rand(6)*30,rest=30,minutes=(reps*duration+(reps-1)*rest)/60,tId=`t-${w}`,instance=`instance-${name}-${w}`;
step('create four-sport template',()=>{state.trainingTemplates[tId]=makeTrainingTemplate({id:tId,name:`${sport} template ${w}`,sport,updatedAt:w,blocks:[{name:`work ${w}`,repeat:reps,durationSec:duration,restSec:rest,intensity:'Z2',...(sport==='strength'?{reps:'8',kg:25}:{}),...(sport==='swim'?{equipment:['buoy']}: {})}]});expect(templateTotals(state.trainingTemplates[tId]).durationSec).toBe(reps*duration+(reps-1)*rest);});
step('insert snapshot',()=>{const s=templateSession(state.trainingTemplates[tId],instance),date=dateAt(w*7+5);expect(s.plannedMinutes).toBe(minutes);expect(s.description).toContain(`work ${w}`);adjust({type:'add',to:date,session:s});const description=[reps+' x','work '+w,...(sport==='strength'?['8 Wdh.','25 kg']:[]),duration+' s','30 s Pause zwischen Wiederholungen/Saetzen','Z2',...(sport==='swim'?['buoy']:[])].join(' · ');expect(s.description).toBe(description);register({id:instance,sport,title:sport+' template '+w,description,plannedMinutes:minutes,spec:null},date);});
const snapshot=ledger.get(instance)!.description;
step('edit source independently',()=>{state.trainingTemplates[tId].blocks[0].name='SOURCE EDIT';expect(effective().flatMap((x:any)=>x.days).flatMap((x:any)=>x.sessions).find((x:any)=>x.id===instance).description).toBe(snapshot);const inserted=effective().flatMap((x:any)=>x.days).flatMap((x:any)=>x.sessions).find((x:any)=>x.id===instance);expect(inserted.trainingBlocks[0].name).toBe('work '+w);expect(inserted.trainingTemplateSnapshot.blocks[0].name).toBe('work '+w);});
step('replace prescription',()=>{const old=effective().flatMap((x:any)=>x.days).flatMap((x:any)=>x.sessions).find((x:any)=>x.id===instance);const t=makeTrainingTemplate({id:'replace',name:'Replacement',sport,updatedAt:1,blocks:[{name:'Replacement work',durationSec:300}]});const result=applyTemplate(old,t,'replace');expect(result.description).toBe('Replacement work · 300 s');adjust({type:'modify',sessionId:instance,set:result});Object.assign(ledger.get(instance)!,{title:'Replacement',description:'Replacement work · 300 s',minutes:5,spec:null});});
step('append prescription',()=>{const old=effective().flatMap((x:any)=>x.days).flatMap((x:any)=>x.sessions).find((x:any)=>x.id===instance);const t=makeTrainingTemplate({id:'append',name:'Append',sport,updatedAt:1,blocks:[{name:'Append work',durationSec:120}]});const result=applyTemplate(old,t,'append');expect(result.plannedMinutes).toBe(7);expect(result.description).toBe('Replacement work · 300 s\nAppend work · 120 s');adjust({type:'modify',sessionId:instance,set:result});Object.assign(ledger.get(instance)!,{title:'Replacement + Append',description:'Replacement work · 300 s\nAppend work · 120 s',minutes:7});});
step('complete actual',()=>{state.sessions[instance]={completed:true,metrics:{min:6},notes:'journal'};Object.assign(ledger.get(instance)!,{completed:true,actual:6});});
step('correct actual',()=>{state.sessions[instance].metrics.min=8;ledger.get(instance)!.actual=8;});
step('protect completed',()=>{const before=JSON.stringify(state.sessions);expect(()=>proposePlanAction(effective(),state,{type:'move',sessionId:instance,to:dateAt(((w+1)%horizon)*7+6)},'blocked')).toThrow();expect(()=>applyTemplate({id:instance,sport,completed:true},state.trainingTemplates[tId],'replace')).toThrow();expect(JSON.stringify(state.sessions)).toBe(before);});
step('collapse and navigate',()=>{state.settings.collapsed=!!rand(2);state.settings.selectedWeek=rand(horizon);});
step('JSON backup restart',()=>{const restored=JSON.parse(JSON.stringify({weeks,state}));weeks=restored.weeks;state=restored.state;restarts++;});
const deleted=`removed-${w}`;
step('add removable',()=>{const s={id:deleted,sport:'run',title:'Remove',description:`temporary ${w}`,plannedMinutes:12};adjust({type:'add',to:dateAt(w*7+6),session:s});register(s,dateAt(w*7+6));});
step('remove draft',()=>{adjust({type:'cancel',sessionId:deleted,removed:true});ledger.get(deleted)!.removed=true;});
}
expect(actions).toBe(horizon*18);expect(restarts).toBe(horizon);console.info('SIM26',JSON.stringify({profile:name,weeks:horizon,seed:2600+horizon,actions,restarts,synthetic:true}));
},120_000);
});

