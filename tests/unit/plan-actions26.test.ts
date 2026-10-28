import { describe, it, expect, vi } from 'vitest';
import { applyAdjustments } from '../../shared/core';
import { proposePlanAction, assertPlanAdjustments } from '../../shared/plan-actions26';
const session = (id:string,sport='run') => ({id,sport,title:id,description:`description ${id}`,plannedMinutes:40,spec:{parts:[{min:40}]}});
const fixture = () => [{weekNumber:1,days:[{date:'2026-01-05',sessions:[session('swim','swim'),session('strength','strength')]}]},{weekNumber:4,days:[{date:'2026-01-26',sessions:[session('bike','bike')]},{date:'2026-01-27',sessions:[]}]}];
const state = () => ({sessions:{},customWorkouts:{},activities:{}} as any);
const ids = (weeks:any[],date:string) => weeks.flatMap(w=>w.days).find(d=>d.date===date).sessions.map((s:any)=>s.id);
describe('plan actions preserve identity and actual journal',()=>{
 it('moves an undocumented past session three weeks onto an empty date',()=>{
 const weeks=fixture(), st=state(); const p=proposePlanAction(weeks,st,{type:'move',sessionId:'swim',to:'2026-01-27'},'g');
 const next=applyAdjustments(weeks,Object.fromEntries(p.adjustments.map(a=>[a.id,a])));
 expect(ids(next,'2026-01-05')).toEqual(['strength']); expect(ids(next,'2026-01-27')).toEqual(['swim']);
 expect(next[1].days[1].sessions[0]).toMatchObject({description:'description swim',spec:{parts:[{min:40}]}}); expect(st).toEqual(state()); expect(p.preview).toHaveLength(1);
 });
 it('swaps individual sessions without moving siblings',()=>{
 const p=proposePlanAction(fixture(),state(),{type:'swap',sessionId:'swim',otherSessionId:'bike'},'g');
 const next=applyAdjustments(fixture(),Object.fromEntries(p.adjustments.map(a=>[a.id,a])));
 expect(ids(next,'2026-01-05').sort()).toEqual(['bike','strength']); expect(ids(next,'2026-01-26')).toEqual(['swim']);
 });
 it('swaps whole days across weeks and supports undo with adjustment groups',()=>{
 const p=proposePlanAction(fixture(),state(),{type:'swapDays',from:'2026-01-05',to:'2026-01-26'},'g');
 const map=Object.fromEntries(p.adjustments.map(a=>[a.id,a])); const next=applyAdjustments(fixture(),map);
 expect(ids(next,'2026-01-05')).toEqual(['bike']); expect(ids(next,'2026-01-26')).toEqual(['swim','strength']);
 expect(applyAdjustments(fixture(),Object.fromEntries(p.adjustments.map(a=>[a.id,{...a,undone:true}])))).toEqual(fixture());
 });
 it('rechecks completed history immediately before confirmation',()=>{
 const st=state(), p=proposePlanAction(fixture(),st,{type:'move',sessionId:'swim',to:'2026-01-27'},'g');
 st.sessions.swim={completed:true,metrics:{min:47},notes:'actual'};
 expect(()=>assertPlanAdjustments(fixture(),st,p.adjustments)).toThrow(/absolviert/); expect(st.sessions.swim.metrics.min).toBe(47);
 });
 it('rejects invalid dates, duplicate IDs, stale moves and swaps involving completed siblings',()=>{
 const w=fixture(), st=state(); st.sessions.strength={completed:true};
 expect(()=>proposePlanAction(w,st,{type:'swapDays',from:'2026-01-05',to:'2026-01-26'},'g')).toThrow(/absolviert/);
 expect(()=>proposePlanAction(w,state(),{type:'move',sessionId:'swim',to:'2027-01-01'},'g')).toThrow();
 w[1].days[0].sessions.push(session('swim'));
 expect(()=>proposePlanAction(w,state(),{type:'move',sessionId:'swim',to:'2026-01-27'},'g')).toThrow(/mehrfach/);
 const p=proposePlanAction(fixture(),state(),{type:'move',sessionId:'swim',to:'2026-01-27'},'g');
 const moved=applyAdjustments(fixture(),Object.fromEntries(p.adjustments.map(a=>[a.id,a])));
 expect(()=>assertPlanAdjustments(moved,state(),p.adjustments)).toThrow(/geaendert/);
 });
 it('warns about combining hard sessions without forbidding a move',()=>{
 const w=fixture(); Object.assign(w[0].days[0].sessions[0],{hard:true}); Object.assign(w[1].days[0].sessions[0],{hard:true});
 expect(proposePlanAction(w,state(),{type:'move',sessionId:'swim',to:'2026-01-26'},'g').warnings.length).toBeGreaterThan(0);
 });
 it('repeated moves preserve one copy and leave actual records untouched',()=>{
 let w=fixture(); const st=state(); st.sessions.strength={completed:true,metrics:{min:33}}; const actual=JSON.stringify(st);
 for(let i=0;i<12;i++){const p=proposePlanAction(w,st,{type:'move',sessionId:'swim',to:i%2?'2026-01-05':'2026-01-27'},'g'+i);w=applyAdjustments(w,Object.fromEntries(p.adjustments.map(a=>[a.id,a])));expect(w.flatMap(x=>x.days.flatMap(d=>d.sessions)).filter(s=>s.id==='swim')).toHaveLength(1);}
 expect(JSON.stringify(st)).toBe(actual);
 });
});
import { applyCustomPlanAdjustments } from '../../shared/plan-actions26';
it('moves custom drafts by replay, preserves raw buckets, and blocks legacy completed extras',()=>{
 const st=state();st.customWorkouts={'2026-01-05':[{...session('extra'),completed:false},{...session('legacy')}]};
 const raw=JSON.stringify(st.customWorkouts);
 const p=proposePlanAction(fixture(),st,{type:'move',sessionId:'extra',to:'2026-01-27'},'custom');
 expect(p.adjustments[0].type).toBe('custom-move');
 const result=applyCustomPlanAdjustments(st.customWorkouts,Object.fromEntries(p.adjustments.map(a=>[a.id,a])));
 expect(result['2026-01-27'].map((s:any)=>s.id)).toEqual(['extra']);expect(result['2026-01-05'].map((s:any)=>s.id)).toEqual(['legacy']);
 expect(JSON.stringify(st.customWorkouts)).toBe(raw);
 expect(()=>proposePlanAction(fixture(),st,{type:'move',sessionId:'legacy',to:'2026-01-27'},'blocked')).toThrow(/absolviert/);
 st.customWorkouts['2026-01-05'][0].completed=true;expect(()=>assertPlanAdjustments(fixture(),st,p.adjustments)).toThrow(/absolviert/);
});
it('applies custom draft prescriptions without modifying actual data and rejects legacy completion at confirm',()=>{
 const st=state();st.customWorkouts={'2026-01-05':[{...session('extra'),completed:false,metrics:{min:23}}]};
 const adj=[{id:'modify',type:'modify',sessionId:'extra',set:{plannedMinutes:60,description:'template'}}];
 assertPlanAdjustments(fixture(),st,adj);
 const result=applyCustomPlanAdjustments(st.customWorkouts,adj);
 expect(result['2026-01-05'][0]).toMatchObject({plannedMinutes:60,description:'template',metrics:{min:23},completed:false});
 expect(()=>assertPlanAdjustments(fixture(),st,[{...adj[0],set:{completed:true}}])).toThrow();
 st.customWorkouts['2026-01-05'][0].completed=undefined;
 expect(()=>assertPlanAdjustments(fixture(),st,adj)).toThrow(/absolviert/);
});
import { parsePlanNumbers } from '../../shared/plan-actions26';
it('rejects nonpositive or nonfinite minutes and negative distances before constructing changes',()=>{
 for(const min of ['-5','0','Infinity','NaN','']) expect(()=>parsePlanNumbers(min,'2')).toThrow();
 for(const km of ['-1','Infinity','NaN']) expect(()=>parsePlanNumbers('30',km)).toThrow();
 expect(parsePlanNumbers('30,5','0')).toEqual({minutes:30.5,km:0});
 expect(parsePlanNumbers('30','')).toEqual({minutes:30,km:null});
});
it('requires coherent prescription blocks when changing structured template totals or sport',()=>{
 const w=fixture();Object.assign(w[0].days[0].sessions[0],{trainingBlocks:[{name:'Main',durationSec:240}],plannedMinutes:4,spec:null});
 for(const set of [{plannedMinutes:8},{sport:'run'},{spec:{kind:'easy'}},{description:'mismatched'}]) expect(()=>assertPlanAdjustments(w,state(),[{id:'bad',type:'modify',sessionId:'swim',set}])).toThrow(/baustein/i);
 expect(()=>assertPlanAdjustments(w,state(),[{id:'good',type:'modify',sessionId:'swim',set:{trainingBlocks:[{name:'Main',durationSec:480}],plannedMinutes:8,description:'8 min'}}])).not.toThrow();
 expect(()=>assertPlanAdjustments(w,state(),[{id:'lock',type:'modify',sessionId:'swim',set:{locked:true}}])).not.toThrow();
});


const planEditorFixture = vi.hoisted(()=>({STATE:{sessions:{} as Record<string,any>,customWorkouts:{},adjustments:{} as Record<string,any>},PLAN:{weeks:[] as any[]},UI:{},messages:[] as string[]}));
vi.mock('../../web/src/store',()=>({...planEditorFixture,BASE_WEEKS:[],saveState:()=>true,rebuildPlanIndex:()=>{},saveUi:()=>{},profile:()=>({sports:['run']}),goals:()=>[]}));
vi.mock('../../web/src/nav',()=>({nav:{rerender(){}}}));
vi.mock('../../web/src/toast',()=>({toast:(msg:string)=>planEditorFixture.messages.push(msg)}));
it('keeps structured prescriptions behind the block editor and skips generic week scaling',async()=>{
 const panel={innerHTML:'',scrollTop:0},sheet={hidden:true};
 vi.stubGlobal('document',{querySelector:(q:string)=>q==='#sheetPanel'?panel:sheet,getElementById:()=>({value:'8'}),body:{style:{overflow:''}}});
 try {
  const session={id:'template-edit',sport:'run',title:'4 min',plannedMinutes:4,description:'4 min',spec:null,trainingBlocks:[{name:'Main',durationSec:240}]};
  planEditorFixture.PLAN.weeks=[{weekNumber:1,days:[{date:'2099-01-05',sessions:[session]}]}];planEditorFixture.STATE.adjustments={};
  const {openEdit}=await import('../../web/src/views/planedit');const {ACTIONS}=await import('../../web/src/kit');
  openEdit(session.id);
  expect(panel.innerHTML).toContain('data-act="edit-prescription"');expect(panel.innerHTML).not.toContain('id="ed-min"');expect(panel.innerHTML).not.toContain('id="ed-sport"');
  await ACTIONS['edit-save']({} as HTMLElement,{} as Event);
  await ACTIONS['edit-week']({dataset:{w:'1',f:'1.1'}} as unknown as HTMLElement,{} as Event);
  expect(planEditorFixture.STATE.adjustments).toEqual({});expect(session.plannedMinutes).toBe(4);expect(session.trainingBlocks[0].durationSec).toBe(240);
 } finally {vi.unstubAllGlobals();}
});
it('rejects negative duration from both add and generic edit handlers without saving',async()=>{
 const panel={innerHTML:'',scrollTop:0},sheet={hidden:true};
 vi.stubGlobal('document',{querySelector:(q:string)=>q==='#sheetPanel'?panel:sheet,getElementById:(id:string)=>({value:id==='ed-min'||id==='ad-min'?'-5':id==='ed-sport'?'run':''}),body:{style:{overflow:''}}});
 try {
  const session={id:'plain-edit',sport:'run',title:'Run',plannedMinutes:30};
  planEditorFixture.PLAN.weeks=[{weekNumber:1,days:[{date:'2099-01-05',sessions:[session]}]}];planEditorFixture.STATE.adjustments={};planEditorFixture.messages=[];
  const {openEdit}=await import('../../web/src/views/planedit');const {ACTIONS}=await import('../../web/src/kit');
  openEdit(session.id);await ACTIONS['edit-save']({} as HTMLElement,{} as Event);await ACTIONS['edit-add-go']({} as HTMLElement,{} as Event);
  expect(planEditorFixture.STATE.adjustments).toEqual({});expect(session.plannedMinutes).toBe(30);expect(planEditorFixture.messages.filter(x=>x.includes('positive')).length).toBe(2);
 } finally {vi.unstubAllGlobals();}
});
it('blocks undo and redo groups after moved or newly added sessions are completed',async()=>{
 const {canUndoGroups}=await import('../../web/src/views/planedit');
 const st=planEditorFixture.STATE;
 try {
  st.customWorkouts={};
  for(const undone of [false,true]) for(const action of [{id:'move',group:'history',type:'move',sessionId:'done',undone},{id:'add',group:'history',type:'add',session:{id:'done'},undone}]) {
   st.adjustments={[action.id]:action};st.sessions={done:{completed:true,metrics:{min:47}}};
   expect(canUndoGroups(['history'])).toBe(false);expect(st.sessions.done.metrics.min).toBe(47);
   st.sessions={};expect(canUndoGroups(['history'])).toBe(true);
  }
  st.adjustments={custom:{id:'custom',group:'custom-history',type:'custom-move',sessionId:'custom-done',undone:true}};
  st.customWorkouts={'2099-01-05':[{id:'custom-done',completed:undefined}]} as any;
  expect(canUndoGroups(['custom-history'])).toBe(false);
  st.customWorkouts={'2099-01-05':[{id:'custom-done',completed:false}]} as any;
  expect(canUndoGroups(['custom-history'])).toBe(true);
 } finally {st.sessions={};st.customWorkouts={};st.adjustments={};}
});


it('keeps custom journal pain signals separate from template instructions at the moved date',async()=>{
 const {effectiveCustomBuckets}=await import('../../shared/custom-state26');const {painFlag}=await import('../../shared/core');
 const st={customWorkouts:{'2026-01-05':[{id:'note',sport:'run',completed:false,description:'Leistenschmerz 4/10'}]},adjustments:{m:{id:'m',type:'modify',sessionId:'note',createdAt:1,set:{description:'SYNTHETIC Vorgabe ohne Istnotiz'}},v:{id:'v',type:'custom-move',sessionId:'note',from:'2026-01-05',to:'2026-01-26',createdAt:2}}};
 const effective=effectiveCustomBuckets(st);expect(effective['2026-01-26'][0].notes).toBe('Leistenschmerz 4/10');expect(effective['2026-01-26'][0].description).toBe('SYNTHETIC Vorgabe ohne Istnotiz');expect(painFlag(st,[],'2026-01-26')).not.toBeNull();expect(painFlag(st,[],'2026-01-05')).toBeNull();expect(st.customWorkouts['2026-01-05'][0].description).toBe('Leistenschmerz 4/10');
});
