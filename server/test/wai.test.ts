/* Auftrag 16: kostenloser KI-Coach mit Cloudflare Workers AI (nachgebautes Modell, keine echten Aufrufe).
   Reihenfolge Claude → Workers AI → Regel-Coach, Einwilligung (unter 16 mit Eltern), Tageskontingent je Person und gesamt,
   Streaming, Werkzeuge nur als Vorschlag, Zahlen-Wächter, Oura nie an die KI, Verbrauch für den Betreiber. */
import { test, expect, describe } from 'vitest';
import worker from '../src/index';
import { makeEnv, call } from './multiuser.test';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
const add = (s: string, n: number) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (s: string) => new Date(s + 'T12:00:00Z').getUTCDay();
const mon = add(today, -((dow(today) + 6) % 7));
function plan() {
  const w = (start: string, n: number) => ({ weekNumber: n, label: 'Woche ' + n, startDate: start, endDate: add(start, 6), phase: 'base', days: [
    { date: start, sessions: [{ id: `w${n}-mo`, sport: 'rest', title: 'Ruhetag' }] },
    { date: add(start, 1), sessions: [{ id: `w${n}-di`, sport: 'run', title: 'Lockerer Lauf 40 min', zone: 'Zone 2', plannedMinutes: 40 }] },
    { date: add(start, 2), sessions: [{ id: `w${n}-mi`, sport: 'bike', title: 'Sweet-Spot 3×8', zone: 'Zone 3-4', plannedMinutes: 60 }] },
    { date: add(start, 3), sessions: [{ id: `w${n}-do`, sport: 'run', title: 'Lockerer Lauf 40 min', zone: 'Zone 2', plannedMinutes: 40 }] },
    { date: add(start, 4), sessions: [{ id: `w${n}-fr`, sport: 'swim', title: 'Schwimmen', plannedMinutes: 45 }] },
    { date: add(start, 5), sessions: [{ id: `w${n}-sa`, sport: 'run', title: 'Langer Lauf 75 min', zone: 'Zone 2', plannedMinutes: 75 }] },
    { date: add(start, 6), sessions: [{ id: `w${n}-so`, sport: 'bike', title: 'Lange Ausfahrt', zone: 'Zone 2', plannedMinutes: 120 }] }
  ] });
  return { meta: { runIntervalsAllowed: true }, weeks: [w(mon, 1), w(add(mon, 7), 2)] };
}

/* Nachgebautes Modell: jede Runde liefert Text (Wort für Wort) oder Werkzeug-Aufrufe, am Ende den Verbrauch (wie Workers AI) */
type Turn = { text?: string; tools?: { name: string; args: any }[]; neurons?: number };
function fakeAI(script: Turn[]) {
  const calls: any[] = []; let i = 0;
  const ai = {
    calls,
    async run(model: string, input: any) {
      calls.push({ model, input: JSON.parse(JSON.stringify(input)) });
      const t = script[Math.min(i++, script.length - 1)];
      const ev: any[] = [];
      if (t.text) for (const w of t.text.split(/(?<= )/)) ev.push({ choices: [{ index: 0, delta: { content: w } }] });
      (t.tools || []).forEach((tc, k) => ev.push({ choices: [{ index: 0, delta: { tool_calls: [{ index: k, id: 'call' + k, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } }] } }] }));
      ev.push({ response: '', usage: { prompt_tokens: 2500, completion_tokens: 120, neurons: t.neurons ?? 25 } });
      const body = ev.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
      return new Response(body).body;
    }
  };
  return ai;
}
async function user(o: { ai?: any; consent?: boolean; off?: boolean; birthYear?: number; parent?: boolean; oura?: boolean; env?: any } = {}) {
  const env = o.env || makeEnv({ AI: o.ai });
  const T = (await call(env, 'POST', '/api/setup', { name: 'iPhone' })).data.token;
  const free = o.off ? { off: true } : o.consent === false ? {} : { consentAt: '2026-10-18T10:00:00Z', ...(o.parent === false ? {} : { parentConsent: true }) };
  const src = o.oura ? 'oura' : 'shortcut';
  const trendRec = { date: today, hrv: 123, restingHR: 37, sleepHours: 7.6, _src: { hrv: src, restingHR: src, sleepHours: src }, _auto: { hrv: { [src]: 123 }, restingHR: { [src]: 37 }, sleepHours: { [src]: 7.6 } }, _manual: {} };
  await call(env, 'POST', '/api/sync', { since: 0, changes: [
    { kind: 'plan', key: 'main', data: plan(), updatedAt: 1 },
    { kind: 'settings', key: 'main', data: { settings: { freeAi: free } }, updatedAt: 1 },
    { kind: 'profile', key: 'main', data: { name: 'Test', birthYear: o.birthYear ?? 2001, sports: ['swim', 'bike', 'run'], thresholds: { lthrRun: 172, lthrBike: 165, thresholdPaceRunSec: 330, thresholdSpeedBikeKmh: 29 }, weeklyHours: 8 }, updatedAt: 1 },
    { kind: 'trend', key: today, data: trendRec, updatedAt: 1 }
  ] }, T);
  return { env, T };
}
const chat = (env: any, T: string, t: string) => call(env, 'POST', '/api/coach/chat', { text: t }, T);
async function stream(env: any, T: string, text: string) {
  const res = await worker.fetch(new Request('http://x/api/coach/chat/stream', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + T }, body: JSON.stringify({ text }) }), env, { waitUntil() {} });
  const lines = (await res.text()).split('\n').filter(Boolean).map(l => JSON.parse(l));
  return { status: res.status, lines, last: lines[lines.length - 1] };
}
const recs = async (env: any, T: string) => (await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, T)).data.records;
const status = async (env: any, T: string) => (await call(env, 'GET', '/api/coach/ai/status', undefined, T)).data;

describe('Zugang und Reihenfolge', () => {
  test('ohne Workers AI (kein Binding): nicht verfügbar, die App antwortet selbst (403)', async () => {
    const { env, T } = await user();
    const st = await status(env, T);
    expect(st.free).toMatchObject({ available: false, active: false }); expect(st.chatActive).toBe(false);
    expect((await chat(env, T, 'Hallo')).status).toBe(403);
  });
  test('mit Einwilligung: kostenlose KI aktiv, Antwort kommt von der KI, Verbrauch wird gezählt', async () => {
    const ai = fakeAI([{ text: 'Locker laufen stärkt die Grundlage. Bleib heute ruhig.', neurons: 31 }]);
    const { env, T } = await user({ ai });
    const st = await status(env, T);
    expect(st).toMatchObject({ chatActive: true, tier: 'free' }); expect(st.free.active).toBe(true);
    const r = await chat(env, T, 'Warum soll ich locker laufen?');
    expect(r.status).toBe(200);
    const ans = r.data.messages.find((m: any) => m.kind === 'answer');
    expect(ans).toMatchObject({ from: 'ai', text: 'Locker laufen stärkt die Grundlage. Bleib heute ruhig.' });
    expect(ai.calls[0].model).toBe('@cf/google/gemma-4-26b-a4b-it');
    expect(ai.calls[0].input.chat_template_kwargs).toEqual({ enable_thinking: false });
    const st2 = await status(env, T);
    expect(st2.free.todayQuestions).toBe(1); expect(st2.free.neuronsToday).toBe(31);
  });
  test('ohne Einwilligung: kein KI-Aufruf, Begründung „Einwilligung“', async () => {
    const ai = fakeAI([{ text: 'x' }]);
    const { env, T } = await user({ ai, consent: false });
    const st = await status(env, T); expect(st.free).toMatchObject({ available: true, consent: false, decided: false, reason: 'consent' });
    const r = await chat(env, T, 'Hallo'); expect(r.status).toBe(403); expect(r.data.error).toMatch(/Einwilligung/); expect(ai.calls).toHaveLength(0);
  });
  test('abgeschaltet: kein KI-Aufruf, Regel-Coach', async () => {
    const ai = fakeAI([{ text: 'x' }]);
    const { env, T } = await user({ ai, off: true });
    expect((await status(env, T)).free).toMatchObject({ off: true, decided: true, active: false });
    expect((await chat(env, T, 'Hallo')).status).toBe(403); expect(ai.calls).toHaveLength(0);
  });
  test('unter 16 ohne Zustimmung der Eltern: kein KI-Aufruf; mit Zustimmung: ja', async () => {
    const y = +today.slice(0, 4) - 14;
    const ai = fakeAI([{ text: 'Gern, locker bleiben.' }]);
    const a = await user({ ai, birthYear: y, parent: false });
    expect((await status(a.env, a.T)).free.reason).toBe('parent');
    expect((await chat(a.env, a.T, 'Hallo')).status).toBe(403); expect(ai.calls).toHaveLength(0);
    const b = await user({ ai, birthYear: y });
    expect((await chat(b.env, b.T, 'Hallo')).status).toBe(200);
    // Sicherheitsregeln für Minderjährige stehen in der Anweisung
    expect(ai.calls[0].input.messages[0].content).toMatch(/minderjährig\): keine Gewichtsziele/);
  });
  test('Claude (Premium) hat Vorrang, wenn Schlüssel, Schalter und Einwilligung da sind', async () => {
    const ai = fakeAI([{ text: 'von Workers AI' }]);
    const { setCreateOverride } = await import('../src/ai');
    setCreateOverride(async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'von Claude' }], usage: { input_tokens: 10, output_tokens: 5 } }));
    try {
      const env = makeEnv({ AI: ai });
      const T = (await call(env, 'POST', '/api/setup', { name: 'iPhone' })).data.token;
      await call(env, 'POST', '/api/sync', { since: 0, changes: [{ kind: 'plan', key: 'main', data: plan(), updatedAt: 1 }, { kind: 'settings', key: 'main', data: { settings: { ai: { enabled: true, consentAt: 1 }, freeAi: { consentAt: 1 } } }, updatedAt: 1 }, { kind: 'profile', key: 'main', data: { birthYear: 2000, sports: ['run'], thresholds: { lthrRun: 170, lthrBike: 165, thresholdPaceRunSec: 330 } }, updatedAt: 1 }] }, T);
      const r = await chat(env, T, 'Hallo');
      expect(r.data.messages.find((m: any) => m.kind === 'answer').text).toBe('von Claude'); expect(ai.calls).toHaveLength(0);
    } finally { setCreateOverride(null); }
  });
});

describe('Kontingent', () => {
  test('höchstens 30 Fragen pro Person und Tag, danach Regel-Coach', async () => {
    const ai = fakeAI([{ text: 'Passt so.', neurons: 1 }]);
    const { env, T } = await user({ ai });
    for (let i = 0; i < 30; i++) expect((await chat(env, T, 'Frage ' + i)).status).toBe(200);
    expect((await status(env, T)).free).toMatchObject({ todayQuestions: 30, active: false, reason: 'user-limit' });
    expect((await chat(env, T, 'Frage 31')).status).toBe(403); expect(ai.calls).toHaveLength(30);
  });
  test('Tageskontingent aller Nutzer aufgebraucht → Regel-Coach; eine Person höchstens ein Viertel', async () => {
    const ai = fakeAI([{ text: 'Ok.', neurons: 3000 }]);
    const { env, T } = await user({ ai, env: makeEnv({ AI: ai, WAI_DAILY_NEURONS: '9500' }) });
    expect((await chat(env, T, 'eins')).status).toBe(200);
    expect((await status(env, T)).free.reason).toBe('user-share'); // 3000 ≥ 9500 / 4
    await env.DB.prepare('INSERT INTO wai_usage (day, user_id, questions, neurons) VALUES (?, 99, 5, 7000)').bind(new Date().toISOString().slice(0, 10)).run();
    expect((await status(env, T)).free.reason).toBe('day-limit');
  });
  test('Fehler von Workers AI (z. B. Kontingent leer) → Regel-Coach (503 mit Hinweis), Fehler gezählt', async () => {
    const ai = { calls: [] as any[], async run() { throw new Error('4006: you have used up your daily free allocation of 10,000 neurons'); } };
    const { env, T } = await user({ ai });
    const r = await chat(env, T, 'Hallo');
    expect(r.status).toBe(503); expect(r.data.error).toMatch(/Regel-Coach/);
    const row = await env.DB.prepare('SELECT errors, fallbacks FROM wai_usage WHERE user_id = 1').first();
    expect(row).toMatchObject({ errors: 1, fallbacks: 1 });
  });
});

describe('Streaming, Werkzeuge, Wächter', () => {
  test('Antwort kommt als Strom (Stück für Stück), danach „done“ mit gespeicherter Nachricht', async () => {
    const ai = fakeAI([{ text: 'Heute ganz locker, du bist in der Grundlage.' }]);
    const { env, T } = await user({ ai });
    const s = await stream(env, T, 'Was ist heute wichtig?');
    const deltas = s.lines.filter(l => l.t === 'delta');
    expect(deltas.length).toBeGreaterThan(3); expect(deltas.map(d => d.text).join('')).toBe('Heute ganz locker, du bist in der Grundlage.');
    expect(s.last.t).toBe('done');
    expect((await recs(env, T)).some((x: any) => x.kind === 'coachMsg' && x.data.from === 'ai')).toBe(true);
  });
  test('Denk-Teil des Modells (Gemma) wird nie gezeigt, auch nicht im Strom', async () => {
    const ai = fakeAI([{ text: '<|channel>thought Der Nutzer fragt … <channel|>Schlaf ist die beste Erholung.' }]);
    const { env, T } = await user({ ai });
    const s = await stream(env, T, 'Wie wichtig ist Schlaf?');
    const shown = s.lines.filter(l => l.t === 'delta').map(l => l.text).join('');
    expect(shown).toBe('Schlaf ist die beste Erholung.'); expect(s.last.messages.find((m: any) => m.kind === 'answer').text).toBe('Schlaf ist die beste Erholung.');
  });
  test('„Wie war mein Training?“: Bewertung der Regel-Engine kommt vorher als Werkzeug-Ergebnis zur KI', async () => {
    const ai = fakeAI([{ text: 'Ich finde keine erledigte Einheit, hak sie im Plan ab.' }]);
    const { env, T } = await user({ ai });
    await chat(env, T, 'wie war mein training heute');
    const msgs = ai.calls[0].input.messages;
    expect(msgs.some((m: any) => m.role === 'assistant' && m.tool_calls && m.tool_calls[0].function.name === 'review_training')).toBe(true);
    expect(msgs.some((m: any) => m.role === 'tool' && /Keine erledigte Einheit/.test(m.content))).toBe(true);
  });
  test('Planänderung: Werkzeug → nur Vorschlag, nichts sofort geändert; Bestätigen wendet an', async () => {
    const id = (add(today, 1) > add(mon, 6) ? 'w2' : 'w1') + '-' + ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'][dow(add(today, 1))];
    const ai = fakeAI([{ tools: [{ name: 'cancel_session', args: { session_id: id, reason: 'keine Zeit' } }] }, { text: 'Ich habe dir einen Vorschlag gemacht, du kannst ihn unten bestätigen.' }]);
    const { env, T } = await user({ ai });
    const r = await chat(env, T, 'ich hab morgen keine zeit, streich das training');
    if (id.endsWith('-mo')) { expect(r.status).toBeGreaterThanOrEqual(200); return; } // Montag: Ruhetag, nichts zu streichen
    expect(r.status).toBe(200); expect(r.data.applied).toBe(0);
    const prop = r.data.messages.find((m: any) => m.kind === 'proposal'); expect(prop).toBeTruthy();
    // Vorschlag steht nach der Antwort („unten bestätigen“)
    expect(r.data.messages.indexOf(prop)).toBeGreaterThan(r.data.messages.findIndex((m: any) => m.kind === 'answer'));
    expect((await recs(env, T)).some((x: any) => x.kind === 'adjust')).toBe(false);
    expect((await call(env, 'POST', '/api/coach/proposal/' + prop.id, { accept: true }, T)).data.applied).toBe(1);
    expect((await recs(env, T)).some((x: any) => x.kind === 'adjust' && x.data.type === 'cancel')).toBe(true);
  });
  test('Änderungswunsch ohne Werkzeug: einmal nachfordern, sonst Regel-Coach (nie nur behaupten)', async () => {
    const ai = fakeAI([{ text: 'Ich habe das Rad am Mittwoch gestrichen.' }, { text: 'Erledigt, ich habe es gestrichen.' }]);
    const { env, T } = await user({ ai });
    const r = await chat(env, T, 'ab jetzt mittwochs kein rad mehr');
    expect(r.status).toBe(503); expect(ai.calls).toHaveLength(2);
    expect(ai.calls[0].input.tool_choice).toBe('required');
    expect(ai.calls[1].input.messages[ai.calls[1].input.messages.length - 1].content).toMatch(/Rufe jetzt genau das passende Werkzeug auf/);
  });
  test('erfundene Zahlen (Puls, Pace, Watt) → Regel-Coach statt Antwort', async () => {
    const ai = fakeAI([{ text: 'Lauf heute bei Puls 163 und 4:12/km.' }]);
    const { env, T } = await user({ ai });
    const r = await chat(env, T, 'Wie schnell soll ich heute laufen?');
    expect(r.status).toBe(503);
    const row = await env.DB.prepare('SELECT questions, fallbacks FROM wai_usage WHERE user_id = 1').first();
    expect(row).toMatchObject({ questions: 0, fallbacks: 1 });
  });
  test('Werkzeug-Namen in der Antwort → Regel-Coach', async () => {
    const ai = fakeAI([{ text: 'Nutze dafür bitte get_analysis.' }]);
    const { env, T } = await user({ ai });
    expect((await chat(env, T, 'Wie ist meine Form?')).status).toBe(503);
  });
  test('Notfall und Medikamente: Antwort der App, kein KI-Aufruf', async () => {
    const ai = fakeAI([{ text: 'x' }]);
    const { env, T } = await user({ ai });
    const r = await chat(env, T, 'Darf ich Ibuprofen vor dem Lauf nehmen?');
    expect(r.status).toBe(200); expect(r.data.blocked).toBe('medication'); expect(ai.calls).toHaveLength(0);
  });
});

describe('Datenschutz und Betreiber', () => {
  test('Oura-Werte gehen nie an die KI (auch nicht als Ampel)', async () => {
    const ai = fakeAI([{ text: 'Schau auf die Seite Heute.' }]);
    const { env, T } = await user({ ai, oura: true });
    await chat(env, T, 'Wie ist meine Ampel heute?');
    const sent = JSON.stringify(ai.calls[0].input.messages);
    expect(sent).not.toMatch(/\b123\b/); expect(sent).not.toMatch(/Ruhepuls 37|\b37 \//);
    expect(sent).toMatch(/Werte von Oura gibt die App nicht an die KI weiter/);
  });
  test('ohne Oura: Ampel-Zeile in der Zusammenfassung, Profil, Phase, heute und letzte 7 Tage', async () => {
    const ai = fakeAI([{ text: 'Gut.' }]);
    const { env, T } = await user({ ai });
    await chat(env, T, 'Hallo');
    const sys = ai.calls[0].input.messages[0].content;
    for (const k of ['PROFIL:', 'ZIEL:', 'PHASE:', 'HEUTE:', 'NÄCHSTE TAGE:', 'LETZTE 7 TAGE:', 'AMPEL HEUTE:']) expect(sys).toContain(k);
    expect(sys).toMatch(/Erfinde nichts/); expect(sys).toMatch(/„Das weiß ich nicht“/); expect(sys).toMatch(/Keine medizinischen Diagnosen/);
  });
  test('Verbrauch: Betreiber sieht heute je Person und Tage; normale Nutzer nicht', async () => {
    const ai = fakeAI([{ text: 'Gut.', neurons: 28 }]);
    const { env, T } = await user({ ai });
    await chat(env, T, 'Hallo'); await chat(env, T, 'Nochmal');
    const r = await call(env, 'GET', '/api/admin/ai-usage', undefined, T);
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ neuronsToday: 56, questionsToday: 2, perQuestion: 28, freeLimit: 10000, perUser: 30 });
    expect(r.data.users[0]).toMatchObject({ id: 1, questions: 2, neurons: 56 });
    const res = await worker.fetch(new Request('http://x/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.1.1.1' }, body: JSON.stringify({ signup: true, name: 'iPhone' }) }), env, { waitUntil() {} });
    const other = (await res.json() as any).token;
    expect((await call(env, 'GET', '/api/admin/ai-usage', undefined, other)).status).toBe(403);
  });
  test('Konto löschen entfernt auch den KI-Verbrauch', async () => {
    const ai = fakeAI([{ text: 'Gut.' }]);
    const { env } = await user({ ai });
    const res = await worker.fetch(new Request('http://x/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '2.2.2.2' }, body: JSON.stringify({ signup: true, name: 'iPhone' }) }), env, { waitUntil() {} });
    const u2 = await res.json() as any;
    await call(env, 'POST', '/api/sync', { since: 0, changes: [{ kind: 'plan', key: 'main', data: plan(), updatedAt: 1 }, { kind: 'settings', key: 'main', data: { settings: { freeAi: { consentAt: 1 } } }, updatedAt: 1 }, { kind: 'profile', key: 'main', data: { birthYear: 1990, sports: ['run'], thresholds: { lthrRun: 170, lthrBike: 165, thresholdPaceRunSec: 330 } }, updatedAt: 1 }] }, u2.token);
    expect((await chat(env, u2.token, 'Hallo')).status).toBe(200);
    expect((await call(env, 'DELETE', '/api/me', { confirm: 'LÖSCHEN' }, u2.token)).status).toBe(200);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM wai_usage WHERE user_id = ?').bind(u2.userId).first()).n).toBe(0);
  });
});
