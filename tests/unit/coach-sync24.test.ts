import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const H = vi.hoisted(() => ({ state: {} as any, saved: null as any, converse: vi.fn() }));
vi.mock('../../web/src/store', () => ({ canPersist: () => true, refreshStoredState: () => true, STATE: H.state, UI: {}, PLAN_KEY: 'plan', LS_KEY: 'state', onSave: (f: any) => H.saved = f, saveState: () => H.saved?.(), profile: () => H.state.profile, saveProfile: vi.fn(), mergeIntoDefaults: () => ({}), rebuildPlanIndex: vi.fn(), wipeLocalData: vi.fn(), hasLocalData: () => false }));
vi.mock('../../web/src/config', () => ({ STORAGE: { syncAuth: 'auth', syncMeta: 'meta', owner: 'owner' }, API_BASE: 'https://synthetic.invalid', APP_VERSION: 'test', APP_RELEASE: 'test' }));
vi.mock('../../web/src/util', () => ({ esc: (s: any) => s, fmtDate: (s: any) => s, ymd: () => '2026-10-24', todayStr: () => '2026-10-24', dowShort: () => 'Sa', addDays: (s: any) => s }));
vi.mock('../../web/src/nav', () => ({ nav: { rerender: vi.fn(), refresh: vi.fn(), go: vi.fn() } }));
vi.mock('../../web/src/toast', () => ({ toast: vi.fn() }));
vi.mock('../../web/src/kit', () => ({ on: vi.fn(), onChange: vi.fn(), ic: () => '', openSheet: vi.fn(), refreshSheet: vi.fn(), empty: () => '', pill: () => '' }));
vi.mock('../../web/src/data', () => ({ D: () => ({ engine: { state: H.state }, scores: [], prognosis: null }), invalidate: vi.fn() }));
vi.mock('../../shared/coach/dialog', () => ({ converse: H.converse, quickOptions: () => [] }));
vi.mock('../../web/src/views/freeai', () => ({ freeOffer: () => false, freeConsentHtml: () => '' }));
vi.mock('../../web/src/views/planedit', () => ({ propose: vi.fn() }));
vi.mock('../../web/src/replan', () => ({ replanFuture: vi.fn() }));
vi.mock('../../web/src/views/rules', () => ({ fixConflict: vi.fn() }));
vi.mock('../../web/src/views/session', () => ({ openSession: vi.fn() }));

const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => resolve = r); return { promise, resolve }; };
const ok = (data: any) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
const ack = () => ok({ records: [], cursor: 1, more: false });
const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
let network: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
  Object.keys(H.state).forEach(k => delete H.state[k]);
  Object.assign(H.state, { sessions: {}, trend: [{ date: '2026-10-24', fatigue: 1 }], customWorkouts: {}, nutrition: {}, illnessPeriods: [], milestones: [], weekNotes: {}, adjustments: {}, settings: {}, coachMsgs: {} });
  H.converse.mockReset(); H.converse.mockReturnValue({ reply: { intent: 'status', text: 'Lokale Regelantwort' }, dialog: {} });
  const storage = new Map([['auth', JSON.stringify({ token: 'synthetic-token', userId: 1 })],['owner','1']]);
  vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) || null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) });
  vi.stubGlobal('document', { addEventListener: vi.fn(), querySelectorAll: () => [], querySelector: () => null, documentElement: { scrollHeight: 100 }, body: { scrollHeight: 100 }, activeElement: null, visibilityState: 'hidden' });
  vi.stubGlobal('window', { addEventListener: vi.fn(), scrollTo: vi.fn(), matchMedia: () => ({ matches: true }) });
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  network = vi.fn(async (url: string) => url.endsWith('/status') ? ok({ chatActive: true }) : url.endsWith('/api/sync') ? ack() : new Response(JSON.stringify({ t: 'done', messages: [] }) + '\n', { status: 200 }));
  vi.stubGlobal('fetch', network);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Coach wartet auf bestaetigte aktuelle Daten', () => {
  test('erst Check-in hochladen und bestaetigen, danach genau eine Chatanfrage', async () => {
    const sync = await import('../../web/src/sync'); await sync.loadAiState();
    const { ask } = await import('../../web/src/views/coach');
    const pending = deferred<Response>(); const order: string[] = [];
    network.mockImplementation(async (url: string, req: any) => {
      if (url.endsWith('/api/sync')) { order.push('sync'); const body = JSON.parse(req.body); expect(body.changes.find((c: any) => c.kind === 'trend').data.fatigue).toBe(8); expect(body.changes.some((c: any) => c.kind === 'coachMsg')).toBe(false); return pending.promise; }
      if (url.includes('/chat')) { order.push('chat'); return new Response('{"t":"done","messages":[]}\n', { status: 200 }); }
      return ok({ chatActive: true });
    });
    H.state.trend[0].fatigue = 8;
    const answer = ask('Wie ist meine Trainingsampel?'); await flush();
    expect(order).toEqual(['sync']);
    pending.resolve(ack()); await answer;
    expect(order).toEqual(['sync', 'chat']); expect(H.converse).not.toHaveBeenCalled();
  });

  test('laufender Sync wartet auch auf neu hinzugekommene Aenderungen desselben Tages', async () => {
    const sync = await import('../../web/src/sync');
    const first = deferred<Response>(), second = deferred<Response>(); const sent: any[] = [];
    network.mockImplementation(async (_url: string, req: any) => { sent.push(JSON.parse(req.body)); return sent.length === 1 ? first.promise : second.promise; });
    const initial = sync.syncNow(); await flush();
    H.state.trend[0].fatigue = 9;
    let finished = false; const barrier = sync.syncNow().then(result => { finished = true; return result; });
    await flush(); expect(finished).toBe(false);
    first.resolve(ok({ records: sent[0].changes, cursor: 1, more: false })); await flush();
    expect(sent).toHaveLength(2); expect(finished).toBe(false);
    expect(sent[1].changes.find((c: any) => c.kind === 'trend').data.fatigue).toBe(9);
    expect(sent[1].changes.find((c: any) => c.kind === 'trend').updatedAt).toBeGreaterThan(sent[0].changes.find((c: any) => c.kind === 'trend').updatedAt);
    expect(H.state.trend[0].fatigue).toBe(9);
    second.resolve(ack()); expect(await barrier).toBe(true); expect(await initial).toBe(true);
  });

  test('Aenderung waehrend fetch ohne zweiten Aufrufer wird vor Abschluss hochgeladen', async () => {
    const sync = await import('../../web/src/sync');
    const pending = deferred<Response>(); const sent: any[] = [];
    network.mockImplementation(async (_url: string, req: any) => { sent.push(JSON.parse(req.body)); return sent.length === 1 ? pending.promise : ack(); });
    const barrier = sync.syncNow(); await flush();
    H.state.trend[0].fatigue = 7;
    pending.resolve(ok({ records: sent[0].changes, cursor: 1, more: false }));
    expect(await barrier).toBe(true); expect(sent).toHaveLength(2);
    expect(sent[1].changes.find((c: any) => c.kind === 'trend').data.fatigue).toBe(7);
    expect(H.state.trend[0].fatigue).toBe(7);
  });

  test('unvollstaendige 50-Seiten-Antwort wird nicht als aktueller Serverstand verwendet', async () => {
    const sync = await import('../../web/src/sync'); await sync.loadAiState();
    const { ask } = await import('../../web/src/views/coach');
    network.mockImplementation(async (url: string) => url.endsWith('/api/sync') ? ok({ records: [], cursor: 1, more: true }) : ok({ chatActive: true }));
    await ask('Wie ist die Lage?');
    expect(network.mock.calls.filter(([url]) => String(url).endsWith('/api/sync'))).toHaveLength(50);
    expect(network.mock.calls.some(([url]) => String(url).includes('/chat'))).toBe(false);
    expect(H.converse).toHaveBeenCalledOnce();
  });
  test('fehlgeschlagener Sync antwortet lokal mit aktuellem Zustand ohne Modellanfrage', async () => {
    const sync = await import('../../web/src/sync'); await sync.loadAiState();
    const { ask } = await import('../../web/src/views/coach');
    network.mockImplementation(async (url: string) => { if (url.endsWith('/api/sync')) throw new TypeError('synthetic offline'); return ok({ chatActive: true }); });
    H.state.trend[0].fatigue = 10;
    await ask('Was soll ich heute tun?');
    expect(network.mock.calls.some(([url]) => String(url).includes('/chat'))).toBe(false);
    expect(H.converse).toHaveBeenCalledOnce(); expect(H.converse.mock.calls[0][0].state.trend[0].fatigue).toBe(10);
    expect(Object.values(H.state.coachMsgs).some((m: any) => m.from === 'coach' && m.text === 'Lokale Regelantwort')).toBe(true);
  });
});

test('Neustart holt nicht lokal gespeicherte Werte aus bestaendigem Ausgang statt sie zu loeschen', async () => {
 localStorage.setItem('meta', JSON.stringify({cursor:12, hashes:{'session|saved':'old'},pending:{'session|saved':{kind:'session',key:'saved',data:{metrics:{min:'67'}},updatedAt:Date.now()+100}},lastSyncAt:1}));
 const sync=await import('../../web/src/sync'); await sync.syncNow();
 expect(H.state.sessions.saved?.metrics.min).toBe('67');
 const requests=network.mock.calls.filter(([url])=>String(url).endsWith('/api/sync')).map(([,req])=>JSON.parse(req.body));
 expect(requests.flatMap(r=>r.changes).some(c=>c.kind==='session' && c.key==='saved' && c.deleted)).toBe(false);
});
test('HTTP 200 ohne gueltigen Cursor und records quittiert keine Aenderungen',async()=>{
 const sync=await import('../../web/src/sync');
 network.mockImplementation(async()=>ok({})); expect(await sync.syncNow()).toBe(false);
 const meta=JSON.parse(localStorage.getItem('meta')!); expect(Object.keys(meta.pending).length).toBeGreaterThan(0);expect(meta.cursor).toBe(0);
});

test('alte Serverantwort nach Wiederherstellung darf neue Daten nicht ueberschreiben',async()=>{
 const sync=await import('../../web/src/sync');const {storage}=await import('../../web/src/persistence');
 const response=deferred<Response>();network.mockImplementation(async()=>response.promise);
 const active=sync.syncNow();await flush();
 storage.beginChange();H.state.sessions.saved={metrics:{min:'91'}};const meta=sync.prepareRestoreMeta(H.state,null);sync.activateRestoreMeta(meta);storage.endChange();
 response.resolve(ok({records:[{kind:'session',key:'saved',data:{metrics:{min:'10'}},updatedAt:9999999999999}],cursor:1,more:false}));
 expect(await active).toBe(false);expect(H.state.sessions.saved.metrics.min).toBe('91');
 expect(JSON.parse(localStorage.getItem('meta')!).pending['session|saved'].data.metrics.min).toBe('91');
});
test('abgelaufene Anmeldung verwirft den offenen Ausgang nicht',async()=>{
 const sync=await import('../../web/src/sync');H.state.sessions.saved={metrics:{min:'77'}};
 network.mockImplementation(async()=>new Response(JSON.stringify({error:'expired'}),{status:401}));
 expect(await sync.syncNow()).toBe(false);expect(sync.isSyncOn()).toBe(false);
 expect(JSON.parse(localStorage.getItem('meta')!).pending['session|saved'].data.metrics.min).toBe('77');
});

test('bestaetigter neuerer STATE wird bei Neustart nicht durch alten Ausgang ersetzt',async()=>{
 H.state.sessions.saved={metrics:{min:'95'}};H.state._storageRevision=20;
 localStorage.setItem('meta',JSON.stringify({cursor:0,hashes:{},pending:{'session|saved':{kind:'session',key:'saved',data:{metrics:{min:'10'}},updatedAt:1}},localRevision:10}));
 const sync=await import('../../web/src/sync');expect(H.state.sessions.saved.metrics.min).toBe('95');await sync.syncNow();expect(H.state.sessions.saved.metrics.min).toBe('95');
});
