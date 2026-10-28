import { expect, test, vi } from 'vitest';
import { makeEnv, call } from './multiuser.test';
import { getRecord, putRecords } from '../src/store';
import { onRecordsChanged } from '../src/extensions';
import * as W from '../../shared/workouts';
import * as C from '../../shared/core';

test('echter Sync-Pfad bewertet rückdatierte Korrektur erneut und lässt den gespeicherten Plan bestehen', async () => {
  const env = makeEnv(); await call(env, 'POST', '/api/setup', { name: 'Isolierter Ergebnis-Test' });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
  const date = C.addDays(today, -14);
  const plan = { meta: {}, weeks: [{ startDate: date, days: [{ date, sessions: [{ id: 's', ...W.build(W.swimLearn({}, { ladder: 'swim', n: 4 })) }] }] }] };
  await putRecords(env, 1, [
    { kind: 'plan', key: 'main', data: plan, updatedAt: 1 },
    { kind: 'session', key: 's', data: { completed: true, metrics: { longestCrawl: '50', min: '30' } }, updatedAt: 2 },
    { kind: 'coachMsg', key: 'msg-review-s', data: { id: 'msg-review-s', kind: 'session', date, at: 1, text: '100 m geschafft' }, updatedAt: 1 }
  ]);
  await onRecordsChanged(env, 1, [{ kind: 'session', key: 's', data: { completed: true, metrics: { longestCrawl: '50', min: '30' } }, updatedAt: 2 }], 'sync');
  const message = (await getRecord(env, 1, 'coachMsg', 'msg-review-s'))!.data;
  expect(message.text).toContain('50 m'); expect(message.title).toMatch(/aktualisiert/i);
  expect((await getRecord(env, 1, 'plan', 'main'))!.data).toEqual(plan);
});

import {runAnalysis,loadState,runDaily} from '../src/coach';
import {decideProposal} from '../src/ai';
import {getRecords} from '../src/store';
import {defaultProfile} from '../../shared/profile';
test('synthetischer Serverpfad bewertet Oberkoerper statt geplantem Unterkoerper',async()=>{
 const env=makeEnv();await call(env,'POST','/api/setup',{name:'SYNTHETIC Kraft'});const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin'}).format(new Date());
 await putRecords(env,1,[{kind:'profile',key:'main',data:{...defaultProfile(),sports:['strength']},updatedAt:1},{kind:'plan',key:'main',data:{meta:{},weeks:[{days:[{date,sessions:[{id:'server-strength28',sport:'strength',title:'SYNTHETIC Unterkoerper',area:'lower',plannedMinutes:40}]}]}]},updatedAt:1},{kind:'session',key:'server-strength28',data:{completed:true,metrics:{min:'35',area:'upper',exercises:[{name:'Bankdruecken',sets:3,reps:'10',kg:40}]},rpe:5},updatedAt:2}]);
 await onRecordsChanged(env,1,[{kind:'session',key:'server-strength28',data:{completed:true},updatedAt:2}],'sync');const review=(await getRecord(env,1,'coachMsg','msg-review-server-strength28'))!.data;expect(review.title).toMatch(/Oberk.rper/);expect(review.text).toMatch(/Oberk.rper/);
});
test('synthetischer Serverpfad konsolidiert alte Hinweise und respektiert abgelehnten Anlass',async()=>{
 const env=makeEnv();await call(env,'POST','/api/setup',{name:'SYNTHETIC Hinweise'});const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin'}).format(new Date()),previous=C.addDays(date,-1);
 await putRecords(env,1,[{kind:'profile',key:'main',data:{...defaultProfile(),sports:['swim'],skills:{swimCrawlM:100,swimCrawl:'some',swimPullM:50}},updatedAt:1},{kind:'plan',key:'main',data:{meta:{},weeks:[{days:[{date:previous,sessions:[{id:'s-a',sport:'swim',title:'SYNTHETIC A'}]},{date,sessions:[{id:'s-b',sport:'swim',title:'SYNTHETIC B'}]}]}]},updatedAt:1},...['s-a','s-b'].map(key=>({kind:'session',key,data:{completed:true,metrics:{longestCrawl:'50',longestPull:'50',min:'20',meters:'200'}},updatedAt:2})),...[0,1,2].map(i=>({kind:'coachMsg',key:'msg-swim-legacy-old'+i,data:{id:'msg-swim-legacy-old'+i,date,at:1,kind:'proposal',from:'coach',text:'SYNTHETIC alt',proposal:{status:'open',skillsOnly:true,changes:[]}},updatedAt:1}))]);
 await runAnalysis(env,1,'activity',{date});let all=Object.values(await getRecords(env,1,'coachMsg')) as any[];let open=all.filter(m=>m.id.startsWith('msg-swim-legacy-')&&m.proposal?.status==='open');expect(open).toHaveLength(1);const id=open[0].id;await decideProposal(env,1,id,false);await runAnalysis(env,1,'activity',{date});all=Object.values(await getRecords(env,1,'coachMsg')) as any[];expect(all.filter(m=>m.id.startsWith('msg-swim-legacy-')&&m.proposal?.status==='open')).toHaveLength(0);
 const trace=(await getRecord(env,1,'analysis','latest'))!.data;expect(trace.inputVersion).toMatch(/^results-/);expect(trace.modelVersion).toBe('analysis-v1');
});

test('vor einer Ablehnung geladener Analysezustand darf den Anlass nicht erneut oeffnen',async()=>{
 const env=makeEnv();await call(env,'POST','/api/setup',{name:'SYNTHETIC konkurrierende Ablehnung'});
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin'}).format(new Date()),previous=C.addDays(date,-1);
 await putRecords(env,1,[{kind:'profile',key:'main',data:{...defaultProfile(),sports:['swim'],skills:{swimCrawlM:100,swimCrawl:'some',swimPullM:50}},updatedAt:1},{kind:'plan',key:'main',data:{meta:{},weeks:[{days:[{date:previous,sessions:[{id:'race-a',sport:'swim',title:'SYNTHETIC A'}]},{date,sessions:[{id:'race-b',sport:'swim',title:'SYNTHETIC B'}]}]}]},updatedAt:1},...['race-a','race-b'].map(key=>({kind:'session',key,data:{completed:true,metrics:{longestCrawl:'50',longestPull:'50',min:'20',meters:'200'}},updatedAt:2}))]);
 const base=Date.now()+10000,now=vi.spyOn(Date,'now').mockReturnValue(base);
 try{
  await runAnalysis(env,1,'activity',{date});
  const open=(Object.values(await getRecords(env,1,'coachMsg')) as any[]).find(m=>m.id.startsWith('msg-swim-legacy-')&&m.proposal?.status==='open');expect(open).toBeTruthy();
  now.mockReturnValue(base+1000);
  await putRecords(env,1,[{kind:'session',key:'unrelated-result',data:{completed:true,metrics:{hr:'120'}},updatedAt:base+1000}]);
  // onRecordsChanged loads L before awaiting engine/rephrase work. During that
  // await the user rejects the existing proposal through the actual endpoint helper.
  const L=await loadState(env,1);
  now.mockReturnValue(base+2000);await decideProposal(env,1,open.id,false);
  expect((await getRecord(env,1,'coachMsg',open.id))!.data.proposal.status).toBe('rejected');
  now.mockReturnValue(base+3000);await runAnalysis(env,1,'activity',{date,L});
  expect((await getRecord(env,1,'coachMsg',open.id))!.data.proposal.status).toBe('rejected');
 }finally{now.mockRestore();}
});


test('Aenderung waehrend KI-Wartezeit verwirft alte Enginewrites und Erfolgsmarkierung',async()=>{
 const env=makeEnv();await call(env,'POST','/api/setup',{name:'SYNTHETIC delayed engine'});const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin'}).format(new Date());
 await putRecords(env,1,[{kind:'profile',key:'main',data:defaultProfile(),updatedAt:1},{kind:'plan',key:'main',data:{meta:{},weeks:[{days:[{date,sessions:[{id:'daily-race',sport:'run',title:'SYNTHETIC Lauf',plannedMinutes:30}]}]}]},updatedAt:1}]);
 const rephrase=vi.fn(async(m:any)=>{await putRecords(env,1,[{kind:'session',key:'daily-race',data:{completed:true,metrics:{min:'25'}},updatedAt:Date.now()+1000}]);return m;});
 const result=await runDaily(env,1,{force:true,rephrase});expect(rephrase).toHaveBeenCalled();expect(result.skipped).toBeTruthy();expect(await getRecords(env,1,'coachMsg')).toEqual({});expect((await env.DB.prepare("SELECT v FROM user_meta WHERE user_id=1 AND k='daily_done'").first())).toBeNull();expect((await getRecord(env,1,'session','daily-race'))!.data.completed).toBe(true);
});


test('Aenderung unmittelbar vor Analysecommit bleibt vollstaendig erhalten',async()=>{
 const env=makeEnv();await call(env,'POST','/api/setup',{name:'SYNTHETIC atomic analysis race'});const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin'}).format(new Date());
 await putRecords(env,1,[{kind:'profile',key:'main',data:defaultProfile(),updatedAt:1},{kind:'plan',key:'main',data:{meta:{},weeks:[{days:[{date,sessions:[{id:'commit-race',sport:'run',title:'SYNTHETIC Lauf',plannedMinutes:30}]}]}]},updatedAt:1}]);const L=await loadState(env,1),originalL=JSON.stringify(L),batch=env.DB.batch.bind(env.DB);
 env.DB.batch=async(stmts:any[])=>{env.DB.batch=batch;await putRecords(env,1,[{kind:'profile',key:'main',data:{name:'SYNTHETIC neue Profilkorrektur'},updatedAt:Date.now()+1000},{kind:'plan',key:'main',data:{meta:{manual:true},weeks:[]},updatedAt:Date.now()+1001}]);return batch(stmts);};
 const result=await runAnalysis(env,1,'weekly',{date,L});expect(result.skipped).toBeTruthy();expect((await getRecord(env,1,'profile','main'))!.data).toEqual({name:'SYNTHETIC neue Profilkorrektur'});expect((await getRecord(env,1,'plan','main'))!.data).toEqual({meta:{manual:true},weeks:[]});expect(await getRecords(env,1,'analysis')).toEqual({});expect(JSON.stringify(L)).toBe(originalL);expect(await env.DB.prepare("SELECT v FROM user_meta WHERE user_id=1 AND k='analysis_last'").first()).toBeNull();
});
