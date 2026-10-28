import {expect,test} from 'vitest';
import {nextAdjustmentTime} from '../../shared/adjustment-clock';
test('mehrere Aktionen bei gleicher Uhrzeit bleiben streng chronologisch',()=>{
 const adjustments:any={};for(let i=0;i<5;i++){const createdAt=nextAdjustmentTime(adjustments,100);adjustments['random-'+(5-i)]={createdAt};expect(createdAt).toBe(100+i);}
});
test('zurueckgestellte lokale Uhr sortiert neue Aktion hinter vorhandenen Aenderungen',()=>{
 expect(nextAdjustmentTime({old:{createdAt:200}},100)).toBe(201);
});
