/* Nur frische In-Memory-SQLite-Datenbanken und synthetische Konten. */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { makeEnv, call } from './multiuser.test';
import { getRecords, putRecords } from '../src/store';

afterEach(() => vi.restoreAllMocks());

describe('Atomare und wiederholbare Synchronisierung', () => {
  test('Fehler nach Datensatz 100 rollt Daten und Revision zurueck', async () => {
    const env = makeEnv();
    await call(env, 'POST', '/api/setup', { name: 'Synthetischer Atomtest' });
    await putRecords(env, 1, [{ kind: 'session', key: 'existing', data: { min: 10 }, updatedAt: 1 }]);
    const before = env.DB.db.prepare("SELECT v FROM meta WHERE k = 'rev'").get().v;
    env.DB.db.exec("CREATE TRIGGER synthetic_failure BEFORE INSERT ON records WHEN NEW.key = 'fail' BEGIN SELECT RAISE(ABORT, 'synthetic interruption'); END");
    const changes: any[] = Array.from({ length: 101 }, (_, i) => ({ kind: 'session', key: i === 0 ? 'existing' : 'synthetic-' + i, data: { min: 50 }, updatedAt: 2 }));
    changes.push({ kind: 'session', key: 'fail', data: {}, updatedAt: 2 });
    await expect(putRecords(env, 1, changes)).rejects.toThrow('synthetic interruption');
    expect(await getRecords(env, 1, 'session')).toEqual({ existing: { min: 10 } });
    expect(env.DB.db.prepare("SELECT v FROM meta WHERE k = 'rev'").get().v).toBe(before);
  });

  test('Retry und veraltete Aenderung beleben Tombstone nicht wieder', async () => {
    const env = makeEnv();
    const owner = (await call(env, 'POST', '/api/setup', { name: 'Synthetischer Retrytest' })).data;
    const write = (changes: any[]) => call(env, 'POST', '/api/sync', { since: 0, changes }, owner.token);
    const initial = { kind: 'strengthTemplate', key: 'same', data: { name: 'synthetisch' }, updatedAt: 10 };
    await write([initial]); await write([initial, initial]);
    expect(await getRecords(env, 1, initial.kind)).toEqual({ same: initial.data });
    await write([{ ...initial, deleted: true, updatedAt: 20 }]);
    await write([initial, { ...initial, updatedAt: 20 }]);
    expect(await getRecords(env, 1, initial.kind)).toEqual({});
    const deleted = (await write([])).data.records;
    expect(deleted).toHaveLength(1); expect(deleted[0]).toMatchObject({ key: 'same', deleted: true, updatedAt: 20 });
    await write([{ ...initial, data: { name: 'bewusst wiederhergestellt' }, updatedAt: 21 }]);
    expect(await getRecords(env, 1, initial.kind)).toEqual({ same: { name: 'bewusst wiederhergestellt' } });
  });

  test('Konten bleiben privat; fremde user_id und SQL im Schluessel wirken nicht', async () => {
    const env = makeEnv();
    const a = (await call(env, 'POST', '/api/setup', { name: 'Synthetisch A' })).data;
    const invite = (await call(env, 'POST', '/api/admin/testusers', { note: 'Synthetisch B' }, a.token)).data;
    const b = (await call(env, 'POST', '/api/setup', { name: 'Synthetisch B', invite: invite.code })).data;
    for (const [user, other] of [[a, b], [b, a]]) {
      const result = await call(env, 'POST', '/api/sync', { since: 0, changes: [{ kind: 'strengthTemplate', key: "same'; DELETE FROM records; --", user_id: other.userId, data: { owner: user.userId }, updatedAt: 10 }] }, user.token);
      expect(result.status).toBe(200);
      expect(result.data.records).toHaveLength(1); expect(result.data.records[0].data.owner).toBe(user.userId);
    }
    expect((await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, 'invalid-synthetic-token')).status).toBe(401);
    expect((await call(env, 'POST', '/api/sync', { since: 0, changes: [] })).status).toBe(401);
  });

  test('ueberlappende Schreibaufrufe behalten den neuesten Zeitstempel', async () => {
    const env = makeEnv();
    await call(env, 'POST', '/api/setup', { name: 'Synthetischer Paralleltest' });
    // SQLite-Shim kennt keine D1-Warteschlange: nur Transaktionen serialisieren,
    // damit ueberlappende Aufrufer wie am D1-Primary abgearbeitet werden.
    const batch = env.DB.batch.bind(env.DB);
    let tail: Promise<any> = Promise.resolve();
    env.DB.batch = (stmts: any[]) => {
      const work = tail.then(() => batch(stmts));
      tail = work.catch(() => {}); return work;
    };
    await Promise.all([300, 100, 250, 200].map(updatedAt => putRecords(env, 1, [{ kind: 'session', key: 'same', data: { updatedAt }, updatedAt }])));
    expect(await getRecords(env, 1, 'session')).toEqual({ same: { updatedAt: 300 } });
  });
  test('5000 Datensaetze bleiben per Cursor vollstaendig ohne externe KI-Aufrufe', async () => {
    const external = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External network disabled'));
    const env = makeEnv();
    const a = (await call(env, 'POST', '/api/setup', { name: 'Synthetischer Langzeittest' })).data;
    const changes = Array.from({ length: 5000 }, (_, i) => ({ kind: 'strengthTemplate', key: 'synthetic-' + i, data: { name: 'synthetisch ' + i }, updatedAt: i + 1 }));
    let page = await call(env, 'POST', '/api/sync', { since: 0, changes }, a.token);
    expect(page.status).toBe(200);
    const found = new Set<string>(); let pages = 0;
    do {
      pages++;
      page.data.records.forEach((r: any) => { expect(found.has(r.key)).toBe(false); found.add(r.key); });
      if (!page.data.more) break;
      page = await call(env, 'POST', '/api/sync', { since: page.data.cursor, changes: [] }, a.token);
    } while (pages < 5);
    expect(found.size).toBe(5000); expect(pages).toBe(3);
    expect(external).not.toHaveBeenCalled();
  });
});

 test('API bestaetigt Datenbankfehler nicht; alte Trainingswerte bleiben und Retry funktioniert',async()=>{
  const env=makeEnv();const account=(await call(env,'POST','/api/setup',{name:'Synthetic persistence failure'})).data;
  const request=(changes:any[])=>call(env,'POST','/api/sync',{since:0,changes},account.token);
  const record={kind:'session',key:'synthetic-save',data:{completed:true,metrics:{min:'42',km:'7'},rpe:5,notes:'synthetic'},updatedAt:10};
  expect((await request([record])).status).toBe(200);
  env.DB.db.exec("CREATE TRIGGER synthetic_save_failure BEFORE INSERT ON records WHEN NEW.key = 'synthetic-save' BEGIN SELECT RAISE(ABORT, 'synthetic database failure'); END");
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  const failed=await request([{...record,data:{...record.data,metrics:{min:'61',km:'9'}},updatedAt:20}]);log.mockRestore();
  expect(failed.status).toBe(500);expect(failed.data.accepted).toBeUndefined();expect(await getRecords(env,account.userId,'session')).toEqual({'synthetic-save':record.data});
  env.DB.db.exec('DROP TRIGGER synthetic_save_failure');
  expect((await request([{...record,data:{...record.data,metrics:{min:'61',km:'9'}},updatedAt:20}])).status).toBe(200);
  expect((await request([])).data.records.find((r:any)=>r.key===record.key).data.metrics.min).toBe('61');
 });

test('alter Coach-Vorschlag darf eine inzwischen absolvierte Einheit nicht verschieben',async()=>{
 const env=makeEnv();const account=(await call(env,'POST','/api/setup',{name:'Synthetic completed protection'})).data;
 const completed={completed:true,metrics:{min:'44'}};
 await putRecords(env,account.userId,[{kind:'session',key:'already-done',data:completed,updatedAt:10},{kind:'coachMsg',key:'old-confirm',data:{id:'old-confirm',proposal:{status:'open',changes:[{kind:'adjust',key:'move-done',data:{id:'move-done',type:'move',sessionId:'already-done',to:'2026-11-01'}}]}},updatedAt:11}]);
 const result=await call(env,'POST','/api/coach/proposal/old-confirm',{accept:true},account.token);
 expect(result.status).toBe(409);expect(await getRecords(env,account.userId,'adjust')).toEqual({});expect((await getRecords(env,account.userId,'session'))['already-done']).toEqual(completed);
});


describe('Analyse schreibt nur auf unveraenderten Nutzerstand',()=>{
 const revision=async(env:any,uid=1)=>Number((await env.DB.prepare('SELECT COALESCE(MAX(rev),0) AS rev FROM records WHERE user_id = ?').bind(uid).first()).rev);
 test('atomarer Guard verhindert alle alten Schreibvorgaenge und Revisionsaenderungen',async()=>{
  const env=makeEnv();await call(env,'POST','/api/setup',{name:'SYNTHETIC Guard'});
  await putRecords(env,1,[{kind:'profile',key:'main',data:{name:'old'},updatedAt:1}]);const before=await revision(env);
  await putRecords(env,1,[{kind:'profile',key:'main',data:{name:'new'},updatedAt:2}]);const rev=env.DB.db.prepare("SELECT v FROM meta WHERE k='rev'").get().v;
  await expect(putRecords(env,1,[{kind:'profile',key:'main',data:{name:'stale'},updatedAt:1000},{kind:'coachMsg',key:'stale',data:{text:'stale'},updatedAt:1001}],before)).rejects.toThrow('Records changed');
  expect(await getRecords(env,1,'profile')).toEqual({main:{name:'new'}});expect(await getRecords(env,1,'coachMsg')).toEqual({});expect(env.DB.db.prepare("SELECT v FROM meta WHERE k='rev'").get().v).toBe(rev);
 });
 test('unveraenderter Nutzerstand erlaubt mehrere Writes im selben Batch',async()=>{
  const env=makeEnv();await call(env,'POST','/api/setup',{name:'SYNTHETIC Guard success'});const before=await revision(env);
  await putRecords(env,1,[{kind:'profile',key:'main',data:{name:'a'},updatedAt:1},{kind:'coachMsg',key:'b',data:{text:'b'},updatedAt:2}],before);
  expect(await getRecords(env,1,'profile')).toEqual({main:{name:'a'}});expect(await getRecords(env,1,'coachMsg')).toEqual({b:{text:'b'}});
 });
 test('Tombstone macht alten Stand ungueltig und wird nicht wiederbelebt',async()=>{
  const env=makeEnv();await call(env,'POST','/api/setup',{name:'SYNTHETIC Guard deletion'});await putRecords(env,1,[{kind:'profile',key:'main',data:{},updatedAt:1}]);const before=await revision(env);await putRecords(env,1,[{kind:'profile',key:'main',deleted:true,updatedAt:2}]);
  await expect(putRecords(env,1,[{kind:'profile',key:'main',data:{resurrected:true},updatedAt:100}],before)).rejects.toThrow('Records changed');expect(await getRecords(env,1,'profile')).toEqual({});
 });
 test('echte Datenbankfehler bleiben Fehler',async()=>{
  const env=makeEnv();await call(env,'POST','/api/setup',{name:'SYNTHETIC Guard database error'});const before=await revision(env);env.DB.db.exec("CREATE TRIGGER guard_db_failure BEFORE INSERT ON records BEGIN SELECT RAISE(ABORT, 'synthetic database failure'); END");
  await expect(putRecords(env,1,[{kind:'profile',key:'main',data:{},updatedAt:1}],before)).rejects.toThrow('synthetic database failure');
 });
});


test('Analyseguard wird nicht durch Aenderungen eines anderen Kontos blockiert',async()=>{
 const env=makeEnv();const a=(await call(env,'POST','/api/setup',{name:'SYNTHETIC Guard A'})).data;const invite=(await call(env,'POST','/api/admin/testusers',{note:'SYNTHETIC Guard B'},a.token)).data;await call(env,'POST','/api/setup',{name:'SYNTHETIC Guard B',invite:invite.code});
 const before=Number((await env.DB.prepare('SELECT COALESCE(MAX(rev),0) AS rev FROM records WHERE user_id=1').first()).rev);
 await putRecords(env,2,[{kind:'session',key:'other',data:{owner:2},updatedAt:2}]);await putRecords(env,1,[{kind:'profile',key:'main',data:{owner:1},updatedAt:3}],before);expect(await getRecords(env,1,'profile')).toEqual({main:{owner:1}});expect(await getRecords(env,2,'session')).toEqual({other:{owner:2}});
});
