import {expect,test} from 'vitest';
import * as C from '../../shared/core';
const mon='2026-10-26',wed='2026-10-28',fri='2026-10-30';
function fixture(){return [{weekNumber:1,startDate:mon,endDate:'2026-11-01',days:[mon,'2026-10-27',wed,'2026-10-29',fri].map((date,i)=>({date,sessions:i?[]:[{id:'swim',date:mon,sport:'swim',title:'Technik',description:'200 m einschwimmen, 8 x 50 m Technik',spec:{sport:'swim',kind:'technique',ctx:{},why:'Technik bewahren',notes:['synthetic note'],steps:[{part:'main',reps:8,m:50,mode:'drill'}]}}]}))}];}
const move=(id:string,to:string,n:number)=>({id,type:'move',sessionId:'swim',to,createdAt:n});
test('Einheit mit explizitem Datum, Beschreibung und Aufbau wandert vollstaendig',()=>{
 const base=fixture(),out=C.applyAdjustments(base,{a:move('a',wed,1)});
 const days=C.planDays(out),s=days.find(d=>d.date===wed).sessions[0];
 expect(days.find(d=>d.date===mon).sessions).toEqual([]);expect(s.description).toBe(base[0].days[0].sessions[0].description);expect(s.spec).toEqual(base[0].days[0].sessions[0].spec);expect(s.date).toBe(wed);expect(base[0].days[0].sessions[0].date).toBe(mon);
});
test('mehrfache Verschiebung behaelt eine ID und entfernt veraltete Tagesverweise',()=>{
 const out=C.applyAdjustments(fixture(),{a:move('a',wed,1),b:move('b',fri,2),c:move('c',mon,3)});
 const days=C.planDays(out);expect(days.flatMap(d=>d.sessions).filter(s=>s.id==='swim')).toHaveLength(1);
 expect(days.find(d=>d.date===mon).sessions[0].date).toBe(mon);
 for(const d of days)expect((d.moved||[]).some(m=>m.id==='swim')).toBe(false);
});
test('Verschieben und Loeschen hinterlaesst keine Trainingsbeschreibung oder Verweise',()=>{
 const out=C.applyAdjustments(fixture(),{a:move('a',wed,1),b:{id:'b',type:'cancel',removed:true,sessionId:'swim',createdAt:2}});
 const days=C.planDays(out);expect(days.flatMap(d=>d.sessions).filter(s=>s.id==='swim'&&!s.removed)).toHaveLength(0);
 expect(days.flatMap(d=>d.moved||[]).filter(m=>m.id==='swim')).toHaveLength(0);
});

test('absolvierte Einheit wird durch eine alte Coach-Verschiebeaktion nicht veraendert',async()=>{
 const {applyOps}=await import('../../shared/coach/ops');
 const state:any={sessions:{swim:{completed:true,metrics:{min:'44'}}},adjustments:{}};
 const before=JSON.stringify(state.sessions);
 applyOps({state,profile:{} as any,goals:{},saveProfile:()=>{}},[{op:'adjust',adj:[move('old-action',wed,1)]}],1,mon);
 expect(state.adjustments).toEqual({});expect(JSON.stringify(state.sessions)).toBe(before);
});
