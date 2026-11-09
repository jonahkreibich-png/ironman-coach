/* Auftrag 32: Server-Weg des Coachs (kostenlose KI, nachgebautes Modell). Tagesentscheidung trifft die App ohne KI-Aufruf
   (eine Antwort mit höchstens einem Vorschlag), KI-Antworten mit „laut deinen Regeln nicht“, erneutem Vorschlag von heute schon
   Erledigtem oder zurückgenommenem Angebot gehen an den Regel-Coach. Erfundene Daten, keine echten Nutzerdaten. */
import { test, expect, describe } from 'vitest';
import { makeEnv, call } from './multiuser.test';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
const add = (s: string, n: number) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (s: string) => new Date(s + 'T12:00:00Z').getUTCDay();
const mon = add(today, -((dow(today) + 6) % 7));
function plan() {
  const days = Array.from({ length: 14 }, (_, i) => add(mon, i)).map(d => ({ date: d, sessions: d === today ? [{ id: 'team-today', sport: 'football', title: 'Fußball-Training', plannedMinutes: 90, fixed: true }]
    : d === add(today, 1) ? [{ id: 'swim-tomorrow', sport: 'swim', title: 'Schwimmen 45 min', plannedMinutes: 45 }] : [{ id: 'rest-' + d, sport: 'rest', title: 'Ruhetag' }] }));
  return { meta: {}, weeks: [{ weekNumber: 1, label: 'Woche 1', startDate: mon, endDate: add(mon, 6), phase: 'base', days: days.slice(0, 7) }, { weekNumber: 2, label: 'Woche 2', startDate: add(mon, 7), endDate: add(mon, 13), phase: 'base', days: days.slice(7) }] };
}
function fakeAI(texts: string[]) {
  const calls: any[] = []; let i = 0;
  return { calls, async run(model: string, input: any) {
    calls.push({ model, input });
    const t = texts[Math.min(i++, texts.length - 1)];
    const ev = [...t.split(/(?<= )/).map(w => ({ choices: [{ index: 0, delta: { content: w } }] })), { response: '', usage: { prompt_tokens: 900, completion_tokens: 80, neurons: 20 } }];
    return new Response(ev.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n').body;
  } };
}
async function jonahLike(ai: any) {
  const env = makeEnv({ AI: ai });
  const T = (await call(env, 'POST', '/api/setup', { name: 'iPhone' })).data.token;
  const grid = ['swim', 'bike', 'run', 'strength'].map((sp, i) => ({ id: 'g' + i, kind: 'neverDays', strength: 'hard', sport: sp, days: [dow(today)], source: 'grid' }));
  await call(env, 'POST', '/api/sync', { since: 0, changes: [
    { kind: 'plan', key: 'main', data: plan(), updatedAt: 1 },
    { kind: 'settings', key: 'main', data: { settings: { freeAi: { consentAt: '2026-10-18T10:00:00Z', parentConsent: true } } }, updatedAt: 1 },
    { kind: 'profile', key: 'main', data: { name: 'Test', birthYear: 2008, sports: ['swim', 'bike', 'run', 'strength', 'football'], teamSportName: 'Fußball', bikes: ['road', 'trainer'], thresholds: { lthrRun: 185, lthrBike: 178 }, weeklyHours: 10, rules: grid }, updatedAt: 1 },
    { kind: 'session', key: 'team-today', data: { skipped: true }, updatedAt: 1 },
    { kind: 'custom', key: 'act-kraft-1', data: { id: 'act-kraft-1', date: today, sport: 'strength', title: 'Kraft Oberkörper', completed: true, metrics: { min: 40 }, area: 'upper' }, updatedAt: 1 }
  ] }, T);
  return { env, T };
}
const chat = (env: any, T: string, t: string) => call(env, 'POST', '/api/coach/chat', { text: t }, T);
const msgsOf = async (env: any, T: string) => ((await call(env, 'POST', '/api/sync', { since: 0, changes: [] }, T)).data.records as any[]).filter(r => r.kind === 'coachMsg' && !r.deleted).map(r => r.data);

describe('Tagesentscheidung auf dem Server', () => {
  test('„Fußball fällt aus – soll ich noch was machen?“: App entscheidet ohne KI, eine Antwort mit Ersatz und einem Vorschlag', async () => {
    const ai = fakeAI(['Laut deinen Regeln darfst du heute nichts machen.']);
    const { env, T } = await jonahLike(ai);
    const r = await chat(env, T, 'soll ich heute noch was machen weil fußballtraining fällt aus');
    expect(r.status).toBe(200);
    expect(ai.calls).toHaveLength(0);                                   // keine KI, kein Kontingent verbraucht
    const ms = (r.data.messages as any[]).filter(m => m.from !== 'user');
    expect(ms).toHaveLength(1);                                          // genau EINE Antwort
    const a = ms[0];
    expect(a.offer).toBeTruthy(); expect(['bike', 'run', 'swim']).toContain(a.offer.sport);
    expect(a.text).toContain(`${a.offer.minutes} min`);
    expect(a.text).toMatch(/schon erledigt/);
    expect(a.text).not.toMatch(/laut deinen Regeln|nicht im Plan|nicht vorgesehen/i);
    expect(a.proposal).toMatchObject({ status: 'open' }); expect(a.proposal.changes.some((c: any) => c.data.type === 'add')).toBe(true);
    const row = await env.DB.prepare('SELECT questions FROM wai_usage WHERE user_id = 1').first().catch(() => null);
    expect(row ? row.questions : 0).toBe(0);
    // Folgefrage: gleiche Zahl
    const r2 = await chat(env, T, 'wie lange soll ich das machen?');
    const a2 = (r2.data.messages as any[]).filter(m => m.from !== 'user');
    expect(a2).toHaveLength(1); expect(a2[0].text).toContain(`${a.offer.minutes} min`);
    // Übernehmen über die Antwort selbst (derselbe Weg wie früher die Vorschlags-Karte)
    const acc = await call(env, 'POST', '/api/coach/proposal/' + a.id, { accept: true }, T);
    expect(acc.status).toBe(200);
    const all = await msgsOf(env, T);
    expect(all.find((m: any) => m.id === a.id).proposal.status).toBe('accepted');
  });
});

describe('KI-Antworten, die nicht zum Tag passen, gehen an den Regel-Coach', () => {
  test('„laut deinen Regeln nicht Rad … Krafttraining wäre eine Option“ (echte Antwort vom 9.11.) → Regel-Coach', async () => {
    const ai = fakeAI(['Wenn du unbedingt etwas machen möchtest, wäre Krafttraining eine Option, da du heute bereits eine Einheit absolviert hast.']);
    const { env, T } = await jonahLike(ai);
    const r = await chat(env, T, 'Was hältst du von meinem Tag heute?');
    expect(r.status).toBe(503);
    const row = await env.DB.prepare('SELECT questions, fallbacks FROM wai_usage WHERE user_id = 1').first();
    expect(row).toMatchObject({ questions: 0, fallbacks: 1 });
  });
  test('„nicht im Plan“ als Grund wird aus einer sonst guten Antwort entfernt', async () => {
    const ai = fakeAI(['Gut, dass du heute schon Kraft gemacht hast. Ein Spaziergang wäre nett, aber das steht nicht im Plan, deshalb lassen wir es. Schlaf heute früh, morgen ist Schwimmen.']);
    const { env, T } = await jonahLike(ai);
    const r = await chat(env, T, 'Was hältst du von meinem Tag heute?');
    expect(r.status).toBe(200);
    const ms = (r.data.messages as any[]).filter(m => m.from !== 'user');
    expect(ms).toHaveLength(1);
    expect(ms[0].text).not.toMatch(/nicht im Plan/);
    expect(ms[0].text).toMatch(/Schlaf heute früh/);
  });
  test('KI-Kontext: Wochenraster nicht als Verbot, heute Erledigtes und Ausgelassenes stehen drin', async () => {
    const ai = fakeAI(['Gut gemacht heute. Schlaf früh.']);
    const { env, T } = await jonahLike(ai);
    await chat(env, T, 'Wie findest du meinen Plan?');
    const sys = ai.calls[0].input.messages[0].content as string;
    expect(sys).toMatch(/„Steht nicht im Plan“ ist nie ein Grund/);
    expect(sys).toMatch(/Wochenraster \(so verteilt die App die GEPLANTEN Einheiten; kein Verbot/);
    expect(sys).toMatch(/HEUTE ERLEDIGT: Kraft:/);
    expect(sys).toMatch(/HEUTE ENTFALLEN\/AUSGELASSEN: Fußball-Training/);
    expect(sys).not.toMatch(/nie brechen[^\n]*\n- Rad: nie/);
  });
});
