/* KI-Coach mit simulierten Antworten (Mock), ohne echte Aufrufe: Regeln, Werkzeuge, Vorschläge, Sicherheit, Budget, Oura-Filter. */
import { test, expect, describe, afterEach } from 'vitest';
import { makeEnv, call } from './multiuser.test';
import { setCreateOverride } from '../src/ai';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
const add = (s: string, n: number) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (s: string) => new Date(s + 'T12:00:00Z').getUTCDay();
const mon = add(today, -((dow(today) + 6) % 7));

function plan() {
  const w = (start: string, n: number) => ({ weekNumber: n, label: 'Woche ' + n, startDate: start, endDate: add(start, 6), days: [
    { date: start, sessions: [{ id: `w${n}-mo`, sport: 'rest', title: 'Ruhetag' }] },
    { date: add(start, 1), sessions: [{ id: `w${n}-di`, sport: 'run', title: 'Lockerer Lauf', zone: 'Zone 2', plannedMinutes: 40 }] },
    { date: add(start, 2), sessions: [{ id: `w${n}-mi`, sport: 'bike', title: 'Sweet-Spot 3×8', zone: 'Zone 3-4', plannedMinutes: 60 }] },
    { date: add(start, 3), sessions: [{ id: `w${n}-do`, sport: 'run', title: 'Lockerer Lauf', zone: 'Zone 2', plannedMinutes: 40 }] },
    { date: add(start, 4), sessions: [{ id: `w${n}-fr`, sport: 'swim', title: 'Schwimmen', plannedMinutes: 45 }] },
    { date: add(start, 5), sessions: [{ id: `w${n}-sa`, sport: 'run', title: 'Langer Lauf', zone: 'Zone 2', plannedMinutes: 75 }] },
    { date: add(start, 6), sessions: [{ id: `w${n}-so`, sport: 'bike', title: 'Lange Ausfahrt', zone: 'Zone 2', plannedMinutes: 120 }] }
  ] });
  return { meta: { runIntervalsAllowed: true }, weeks: [w(mon, 1), w(add(mon, 7), 2)] };
}
let requests: any[] = [];
let routine: any[] = [];
function mock(script: ((req: any) => any)[]) {
  requests = []; routine = [];
  let i = 0;
  setCreateOverride(async (req: any) => {
    // Routine-Modell (Umformulieren von Briefings) gibt den Text unverändert zurück
    if (req.model === 'claude-haiku-5-5') { routine.push(req); return { stop_reason: 'end_turn', content: [{ type: 'text', text: typeof req.messages[0].content === 'string' ? req.messages[0].content : 'x' }], usage: { input_tokens: 100, output_tokens: 50 } }; }
    requests.push(JSON.parse(JSON.stringify(req))); const f = script[Math.min(i++, script.length - 1)]; return f(req);
  });
}
const text = (t: string) => () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }], usage: { input_tokens: 2000, output_tokens: 200 } });
const tool = (name: string, input: any) => () => ({ stop_reason: 'tool_use', content: [{ type: 'text', text: 'Moment.' }, { type: 'tool_use', id: 'tu' + Math.random(), name, input }], usage: { input_tokens: 2500, output_tokens: 120 } });
afterEach(() => setCreateOverride(null));

async function user(o: { consent?: boolean; enabled?: boolean; birthYear?: number; oura?: boolean; budget?: number; parent?: boolean } = {}) {
  const env = makeEnv({ AI_MONTHLY_BUDGET_USD: String(o.budget ?? 5) });
  const T = (await call(env, 'POST', '/api/setup', { name: 'iPhone' })).data.token;
  const trendRec = { date: today, hrv: 58, restingHR: 51, sleepHours: 7.6, _src: { hrv: o.oura ? 'oura' : 'shortcut', restingHR: 'shortcut', sleepHours: o.oura ? 'oura' : 'shortcut' }, _auto: { hrv: { [o.oura ? 'oura' : 'shortcut']: 58 }, sleepHours: { [o.oura ? 'oura' : 'shortcut']: 7.6 }, restingHR: { shortcut: 51 } }, _manual: {} };
  await call(env, 'POST', '/api/sync', { since: 0, changes: [
    { kind: 'plan', key: 'main', data: plan(), updatedAt: 1 },
    { kind: 'settings', key: 'main', data: { settings: { lthrRun: 172, lthrBike: 165, ai: { enabled: o.enabled !== false, ...(o.consent === false ? {} : { consentAt: 1, ...(o.parent === false ? {} : { parentConsent: true }) }) } }, nutritionProfile: { age: 17, heightCm: 180, weightKg: 70, pal: 1.4 } }, updatedAt: 1 },
    { kind: 'profile', key: 'main', data: { name: 'Test', birthYear: o.birthYear ?? 2009, sports: ['swim', 'bike', 'run'], thresholds: { lthrRun: 172, lthrBike: 165, thresholdPaceRunSec: 330, thresholdSpeedBikeKmh: 29 }, weeklyHours: 8 }, updatedAt: 1 },
    { kind: 'trend', key: today, data: trendRec, updatedAt: 1 }
  ] }, T);
  return { env, T };
}
const chat = (env: any, T: string, t: string) => call(env, 'POST', '/api/coach/chat', { text: t }, T);
const recs = async (env: any, T: string) => (await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, T)).data.records;
const future = (n: number) => { for (let i = 1; i < 14; i++) { const d = add(today, i); if (dow(d) === n) return d; } return add(today, 7); };

describe('Zugang', () => {
  test('ohne Einwilligung: 403 mit Erklärung, kein Aufruf', async () => {
    mock([text('x')]);
    const { env, T } = await user({ consent: false });
    const r = await chat(env, T, 'Hallo');
    expect(r.status).toBe(403); expect(r.data.error).toMatch(/Einwilligung/); expect(requests).toHaveLength(0);
  });
  test('Unter 16 ohne Einwilligung der Eltern: kein KI-Aufruf', async () => {
    mock([text('Antwort')]);
    const { env, T } = await user({ parent: false, birthYear: 2011 });
    const r = await chat(env, T, 'Hallo');
    expect(r.status).toBe(403); expect(r.data.error).toMatch(/Einwilligung/); expect(requests).toHaveLength(0);
    expect((await call(env, 'GET', '/api/coach/ai/status', null, T)).data.consent).toBe(false);
  });
  test('Ab 16 reicht die eigene Einwilligung', async () => {
    mock([text('Klar, gern.')]);
    const { env, T } = await user({ parent: false, birthYear: 2010 });
    const r = await chat(env, T, 'Hallo');
    expect(r.status).toBe(200); expect(requests).toHaveLength(1);
  });
  test('Betreiber hat immer alles, eingeladene Nutzer nur mit Freischaltung', async () => {
    mock([text('Antwort für B')]);
    const { env, T } = await user();
    expect((await call(env, 'GET', '/api/me', null, T)).data.entitlements).toEqual({ ai: true, foodPhoto: true });
    const inv = (await call(env, 'POST', '/api/invites', { note: 'Tester' }, T)).data;
    const B = (await call(env, 'POST', '/api/setup', { name: 'Pixel', invite: inv.code, userName: 'Bea' })).data;
    await call(env, 'POST', '/api/sync', { since: 0, changes: [{ kind: 'settings', key: 'main', data: { settings: { ai: { enabled: true, consentAt: 1 } } }, updatedAt: 1 }] }, B.token);
    const r1 = await chat(env, B.token, 'Hallo');
    expect(r1.status).toBe(403); expect(r1.data.error).toMatch(/freigeschaltet/); expect(requests).toHaveLength(0);
    expect((await call(env, 'POST', `/api/admin/users/${B.userId}/features`, { features: { ai: true } }, B.token)).status).toBe(403);
    expect((await call(env, 'POST', `/api/admin/users/${B.userId}/features`, { features: { ai: true, foo: true } }, T)).data.features).toEqual({ ai: true });
    const users = (await call(env, 'GET', '/api/admin/users', null, T)).data.users;
    expect(users.find((u: any) => u.id === B.userId).entitlements).toEqual({ ai: true, foodPhoto: false });
    const r2 = await chat(env, B.token, 'Hallo');
    expect(r2.status).toBe(200); expect(requests).toHaveLength(1);
  });
  test('Budget aufgebraucht: 403', async () => {
    mock([text('Antwort')]);
    const { env, T } = await user({ budget: 0.001 });
    await chat(env, T, 'Erste Frage');
    const r = await chat(env, T, 'Zweite Frage');
    expect(r.status).toBe(403); expect(r.data.error).toMatch(/Monatsbudget/);
    const st = (await call(env, 'GET', '/api/coach/ai/status', null, T)).data;
    expect(st.monthUsd).toBeGreaterThan(0.001); expect(st.todayMessages).toBe(1);
  });
});

describe('Sicherheit vor der KI', () => {
  test('Brustschmerz → Notruf-Text, KI wird nicht gefragt', async () => {
    mock([text('nie')]);
    const { env, T } = await user();
    const r = await chat(env, T, 'Ich hab Brustschmerzen beim Radfahren');
    expect(r.data.blocked).toBe('emergency'); expect(r.data.messages[1].text).toMatch(/112/); expect(requests).toHaveLength(0);
  });
  test('Medikamente → Arzt, KI wird nicht gefragt', async () => {
    mock([text('nie')]);
    const { env, T } = await user();
    const r = await chat(env, T, 'Kann ich vor dem Rennen Ibuprofen nehmen?');
    expect(r.data.blocked).toBe('medication'); expect(requests).toHaveLength(0);
  });
  test('Minderjährig: Systemanweisung ohne Gewichtsziele; starkes Modell mit Fallback', async () => {
    mock([text('Klar!')]);
    const { env, T } = await user({ birthYear: 2010 });
    await chat(env, T, 'Wie viel soll ich diese Woche trainieren?');
    const sys = requests[0].system[0].text;
    expect(sys).toMatch(/minderjährig: keine Gewichtsziele/);
    expect(requests[0].model).toBe('claude-sonnet-5-5');
    expect(requests[0].fallbacks).toBe('default');
    expect(requests[0].tool_choice).toEqual({ type: 'auto' });
  });
  test('Oura-Werte gehen nie an die KI', async () => {
    mock([text('ok')]);
    const { env, T } = await user({ oura: true });
    await chat(env, T, 'Wie war meine Nacht?');
    const content = JSON.stringify(requests[0].messages);
    expect(content).not.toMatch(/\b58 \//); // HFV aus Oura
    expect(content).toMatch(/51/);          // Ruhepuls aus dem Kurzbefehl darf
  });
});

describe('Werkzeuge und Regeln', () => {
  test('Fieber im Chat: Krankheitsphase starten, Hinweis zusätzlich', async () => {
    mock([tool('start_illness', { date: today, note: 'Fieber' }), text('Gute Besserung, ich habe dein Training pausiert.')]);
    const { env, T } = await user();
    const r = await chat(env, T, 'Ich habe Fieber, 38,5');
    expect(r.data.messages.some((m: any) => m.kind === 'warning' && /kein Training/.test(m.text))).toBe(true);
    expect((await recs(env, T)).some((x: any) => x.kind === 'illness' && x.data.start === today)).toBe(true);
  });
  test('Zwei harte Tage hintereinander → abgelehnt, KI erklärt eine Alternative', async () => {
    const wed = future(3), thu = future(4);
    mock([
      tool('modify_session', { session_id: `w${wed > add(mon, 6) ? 2 : 1}-do`.replace(/w\d/, wed > add(mon, 6) ? 'w2' : 'w1'), title: 'Lauf-Intervalle 6×3 min', zone: 'Zone 4', planned_minutes: 50, reason: 'mehr Tempo' }),
      text('Das geht nicht direkt nach dem Sweet Spot. Ich schlage Samstag vor.')
    ]);
    const { env, T } = await user();
    void thu;
    const r = await chat(env, T, 'Kann ich morgen nach dem Radtraining Intervalle laufen?');
    const second = requests[1];
    const toolResult = second.messages[second.messages.length - 1].content[0];
    expect(toolResult.is_error).toBe(true);
    expect(toolResult.content).toMatch(/beide hart|Regel-Engine/);
    expect(r.data.applied).toBe(0);
  });
  test('Doppelt so viel trainieren → Wochen-Umbau von der Regel-Engine abgelehnt', async () => {
    const w2 = plan().weeks[1];
    const days = w2.days.map(d => ({ date: d.date, sessions: d.sessions.map(s => ({ sport: s.sport, title: s.title, plannedMinutes: (s as any).plannedMinutes ? (s as any).plannedMinutes * 2 : undefined, zone: (s as any).zone })) }));
    mock([tool('rebuild_week', { week_number: 2, start_date: w2.startDate, days, reason: 'doppelter Umfang' }), text('Doppelt so viel wäre zu viel auf einmal. Wir steigern um 10 %.')]);
    const { env, T } = await user();
    const r = await chat(env, T, 'Ich will doppelt so viel trainieren!');
    const res = requests[1].messages[requests[1].messages.length - 1].content[0];
    expect(res.is_error).toBe(true); expect(res.content).toMatch(/Umfang/);
    expect(r.data.messages.some((m: any) => m.kind === 'proposal')).toBe(false);
  });
  // Auftrag 16: Planänderungen der KI gelten nie sofort, auch kleine nicht – immer als Vorschlag zum Bestätigen
  test('Prüfungswoche → Einheiten kürzen nur als Vorschlag; Übernehmen wendet an', async () => {
    const sat = future(6);
    const id = (sat > add(mon, 6) ? 'w2' : 'w1') + '-sa';
    mock([tool('modify_session', { session_id: id, planned_minutes: 50, reason: 'Prüfungswoche: weniger Umfang, Schlaf schützen' }), text('Ich schlage vor, den langen Lauf auf 50 min zu kürzen.')]);
    const { env, T } = await user();
    const r = await chat(env, T, 'Nächste Woche habe ich Prüfungen.');
    expect(r.data.applied).toBe(0);
    expect((await recs(env, T)).find((x: any) => x.kind === 'adjust' && x.data.from_ai)).toBeUndefined();
    const prop = r.data.messages.find((m: any) => m.kind === 'proposal');
    expect(prop).toBeTruthy();
    const ok = await call(env, 'POST', '/api/coach/proposal/' + prop.id, { accept: true }, T);
    expect(ok.data.applied).toBe(1);
    const adj = (await recs(env, T)).find((x: any) => x.kind === 'adjust' && x.data.from_ai);
    expect(adj.data).toMatchObject({ sessionId: id, from_ai: true }); expect(adj.data.set.plannedMinutes).toBe(50);
  });
  test('Lockere Einheit hart machen → nur als Vorschlag; Übernehmen wendet an', async () => {
    const sat = future(6);
    const id = (sat > add(mon, 6) ? 'w2' : 'w1') + '-sa';
    mock([tool('modify_session', { session_id: id, title: 'Tempodauerlauf 3×10 min', zone: 'Zone 4', reason: 'Tempo-Reiz' }), text('Ich schlage einen Tempolauf vor.')]);
    const { env, T } = await user();
    const r = await chat(env, T, 'Mach den Samstag härter');
    const prop = r.data.messages.find((m: any) => m.kind === 'proposal');
    expect(prop.proposal.status).toBe('open'); expect(r.data.applied).toBe(0);
    const d = await call(env, 'POST', '/api/coach/proposal/' + prop.id, { accept: true }, T);
    expect(d.data.applied).toBe(1);
    expect((await call(env, 'POST', '/api/coach/proposal/' + prop.id, { accept: true }, T)).status).toBe(409);
  });
  test('Ziel in 6 statt 12 Wochen → Ziel ändern nur als Vorschlag', async () => {
    mock([tool('change_goal', { name: 'Sprint-Triathlon', type: 'tri_sprint', date: add(today, 42), priority: 'A', reason: 'früherer Termin' }), text('Ich habe dir einen Vorschlag gemacht.')]);
    const { env, T } = await user();
    const r = await chat(env, T, 'Mein Wettkampf ist schon in 6 statt in 12 Wochen');
    expect(r.data.messages.find((m: any) => m.kind === 'proposal').proposal.changes[0].kind).toBe('goal');
    expect((await recs(env, T)).some((x: any) => x.kind === 'goal')).toBe(false);
  });
  test('Marathon mit 16 → Altersgrenze, Ziel abgelehnt', async () => {
    mock([tool('change_goal', { name: 'Marathon', type: 'run_marathon', date: add(today, 120), priority: 'A', reason: 'Wunsch' }), text('Dafür gibt es ein Mindestalter.')]);
    const { env, T } = await user({ birthYear: 2010 });
    await chat(env, T, 'Ich will einen Marathon laufen');
    expect(requests[1].messages[requests[1].messages.length - 1].content[0].content).toMatch(/Mindestalter/);
  });
  test('Verschieben in die Vergangenheit und unbekannte IDs werden abgelehnt', async () => {
    mock([tool('move_session', { session_id: 'gibtsnicht', to_date: today, reason: 'x' }), text('ok')]);
    const { env, T } = await user();
    await chat(env, T, 'Verschieb das');
    expect(requests[1].messages.at(-1).content[0].content).toMatch(/gibt es nicht/);
  });
  test('Notiz speichern (Langzeit-Gedächtnis)', async () => {
    mock([tool('save_note', { text: 'leichtes Leistenziehen beim Fußball' }), text('Notiert.')]);
    const { env, T } = await user();
    await chat(env, T, 'Beim Fußball zieht die Leiste ein bisschen');
    expect((await recs(env, T)).find((x: any) => x.kind === 'coachNote').data.text).toBe('leichtes Leistenziehen beim Fußball');
  });
});

describe('Auftrag 7: KI-Coach bereit für den echten Schlüssel', () => {
  test('„Was genau soll ich … machen?“: KI ruft explain_day auf und bekommt dieselben Schritte wie der Regel-Coach', async () => {
    const d = future(5);
    mock([tool('explain_day', { date: d, sport: 'swim' }), text('Hier dein Ablauf.')]);
    const { env, T } = await user();
    const r = await chat(env, T, 'Was genau soll ich am Freitag beim Schwimmen machen?');
    expect(r.status).toBe(200);
    const res = requests[1].messages[requests[1].messages.length - 1].content[0];
    expect(res.type).toBe('tool_result');
    expect(String(res.content)).toMatch(/1\. (Einschwimmen|Hauptteil)/);
  });
  test('get_analysis und Felder der Einheiten stehen der KI zur Verfügung', async () => {
    mock([tool('get_analysis', {}), tool('get_data', { what: 'sessions', days: 14 }), text('ok')]);
    const { env, T } = await user();
    await call(env, 'POST', '/api/sync', { since: 0, changes: [{ kind: 'session', key: 'w1-di', data: { completed: true, rpe: '5', feel: '3', metrics: { min: '40', km: '6.5', hr: '150', decoupling: '3.1', cadence: '164' } }, updatedAt: Date.now() }] }, T);
    await chat(env, T, 'Wie steht es um meine Form?');
    const a = JSON.parse(requests[1].messages[requests[1].messages.length - 1].content[0].content);
    expect(a.load).toBeTruthy(); expect(Array.isArray(a.insights)).toBe(true);
    const rows = JSON.parse(requests[2].messages[requests[2].messages.length - 1].content[0].content);
    if (dow(today) >= 3 || dow(today) === 0) expect(rows.find((x: any) => x.cadence === 164 || x.decoupling === 3.1)).toBeTruthy();
  });
  test('Anfrage: Sonnet 5.5 mit Aufwand „medium“, Fallbacks, Cache für System und Verlauf', async () => {
    mock([text('Hallo!')]);
    const { env, T } = await user();
    await chat(env, T, 'Hallo');
    const q = requests[0];
    expect(q.model).toBe('claude-sonnet-5-5');
    expect(q.output_config.effort).toBe('medium');
    expect(q.cache_control).toEqual({ type: 'ephemeral' });
    expect(q.betas).toEqual(['server-side-fallback-2026-07-01']); expect(q.fallbacks).toBe('default');
    expect(q.tool_choice).toEqual({ type: 'auto' });
    expect(q.tools.map((x: any) => x.name)).toEqual(expect.arrayContaining(['explain_day', 'get_analysis', 'modify_session', 'add_rule']));
  });
  test('Kosten: Cache lesen 0,10 $ pro Mio. Tokens bei Sonnet 5.5', async () => {
    mock([() => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'x' }], usage: { input_tokens: 0, cache_read_input_tokens: 1_000_000, output_tokens: 0 } })]);
    const { env, T } = await user({ budget: 20 });
    await chat(env, T, 'Hallo');
    const row: any = await env.DB.prepare('SELECT cost_micro FROM ai_usage').first();
    expect(row.cost_micro).toBeGreaterThanOrEqual(100000); expect(row.cost_micro).toBeLessThan(101000); // dazu nur Cent-Bruchteile fürs Umformulieren
  });
});

/* Auftrag 12: Antwort als Strom (NDJSON) */
import { setStreamOverride } from '../src/ai';
import worker from '../src/index';
describe('Streaming', () => {
  afterEach(() => setStreamOverride(null));
  test('Text kommt in Stücken, danach „done“ mit gespeicherten Nachrichten; ohne Einwilligung „error“', async () => {
    mock([text('unused')]);
    setStreamOverride(async (_req: any, onText: (t: string) => void) => { for (const w of ['Gut ', 'gemacht, ', 'weiter so.']) onText(w); return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Gut gemacht, weiter so.' }], usage: { input_tokens: 100, output_tokens: 20 } }; });
    const { env, T } = await user();
    const res = await worker.fetch(new Request('http://x/api/coach/chat/stream', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + T }, body: JSON.stringify({ text: 'Wie war mein Lauf?' }) }), env, { waitUntil() {} } as any);
    expect(res.headers.get('Content-Type')).toMatch(/ndjson/);
    const lines = (await res.text()).trim().split('\n').map(l => JSON.parse(l));
    expect(lines.filter(l => l.t === 'delta').map(l => l.text).join('')).toBe('Gut gemacht, weiter so.');
    const done = lines.find(l => l.t === 'done'); expect(done.messages.find((m: any) => m.from === 'ai').text).toBe('Gut gemacht, weiter so.');
    expect((await recs(env, T)).some((r: any) => r.kind === 'coachMsg' && r.data.text === 'Gut gemacht, weiter so.')).toBe(true);
    const u2 = await user({ consent: false });
    const r2 = await worker.fetch(new Request('http://x/api/coach/chat/stream', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + u2.T }, body: JSON.stringify({ text: 'Hallo' }) }), u2.env, { waitUntil() {} } as any);
    const l2 = (await r2.text()).trim().split('\n').map(l => JSON.parse(l));
    expect(l2[l2.length - 1]).toMatchObject({ t: 'error', status: 403 });
  });
});

describe('Kanonische App-Ampel vor Modelltext', () => {
  test('injizierter roter Modelltext und Stream werden durch echte gelbe App-Ampel ersetzt', async () => {
    mock([text('Deine Ampel ist rot. Bitte heute Ruhe.')]);
    setStreamOverride(async (_req: any, delta: (t: string) => void) => {
      delta('Deine Ampel ist rot.');
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Deine Ampel ist rot. Bitte heute Ruhe.' }], usage: { input_tokens: 100, output_tokens: 20 } };
    });
    try {
      const { env, T } = await user({ oura: true });
      await call(env, 'POST', '/api/sync', { since: 0, changes: [{ kind: 'trend', key: today, data: { date: today, sleepHours: 6.5, restingHR: 51, _src: { sleepHours: 'oura', restingHR: 'shortcut' }, _auto: { sleepHours: { oura: 6.5 }, restingHR: { shortcut: 51 } } }, updatedAt: Date.now() + 1000 }] }, T);
      const res = await worker.fetch(new Request('http://x/api/coach/chat/stream', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + T }, body: JSON.stringify({ text: 'Wie soll ich heute trainieren?' }) }), env, { waitUntil() {} } as any);
      const lines = (await res.text()).trim().split('\n').map(l => JSON.parse(l));
      const answer = lines.find(l => l.t === 'done').messages.find((m: any) => m.kind === 'answer');
      expect(answer.text).toContain('Ampel der App: Gelb');
      expect(lines.filter(l => l.t === 'delta').map(l => l.text).join('')).not.toContain('rot');
      expect(lines.filter(l => l.t === 'delta').map(l => l.text).join('')).toContain('Gelb');
    } finally { setStreamOverride(null); }
  });
});
