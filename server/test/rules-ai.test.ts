/* Auftrag 5 A3: Mit KI-Schlüssel übersetzt die KI Freitext in dasselbe Regel-Format (geprüft), ohne KI der eingebaute Parser. */
import { test, expect, afterEach } from 'vitest';
import { makeEnv, call } from './multiuser.test';
import { setCreateOverride } from '../src/ai';

afterEach(() => setCreateOverride(null));
async function user(ai: boolean) {
  const env = makeEnv({});
  const T = (await call(env, 'POST', '/api/setup', { name: 'iPhone' })).data.token;
  await call(env, 'POST', '/api/sync', { since: 0, changes: [
    { kind: 'settings', key: 'main', data: { settings: { ai: ai ? { enabled: true, consentAt: 1, parentConsent: true } : {} } }, updatedAt: 1 },
    { kind: 'profile', key: 'main', data: { name: 'Test', birthYear: 1975, sports: ['run', 'bike'] }, updatedAt: 1 }
  ] }, T);
  return { env, T };
}
const SENT = 'Laufen klappt bei mir nur wenn die Kinder bei Oma sind, also Samstag und Sonntag';

test('ohne KI: eingebauter Parser, kein KI-Aufruf', async () => {
  let calls = 0; setCreateOverride(async () => { calls++; return {}; });
  const { env, T } = await user(false);
  const r = await call(env, 'POST', '/api/rules/parse', { text: 'kann mittwochs nicht laufen, nur Samstag oder Sonntag' }, T);
  expect(r.data.by).toBe('parser'); expect(calls).toBe(0);
  expect(r.data.rules.map((x: any) => x.kind)).toEqual(['neverDays', 'onlyDays']);
});
test('mit KI: Regeln aus der KI, ungültige werden aussortiert, Format wie beim Parser', async () => {
  let req: any = null;
  setCreateOverride(async (q: any) => { req = q; return { stop_reason: 'end_turn', usage: { input_tokens: 300, output_tokens: 60 }, content: [{ type: 'text', text: JSON.stringify({ rules: [
    { kind: 'onlyDays', strength: 'hard', sport: 'run', days: [6, 0] }, { kind: 'maxDay', strength: 'hard', minutes: 5000 }, { kind: 'quatsch', strength: 'hard' }] }) }] }; });
  const { env, T } = await user(true);
  const r = await call(env, 'POST', '/api/rules/parse', { text: SENT }, T);
  expect(r.data.by).toBe('ai');
  expect(r.data.rules).toEqual([expect.objectContaining({ kind: 'onlyDays', sport: 'run', days: [6, 0], strength: 'hard', source: 'ai', text: SENT })]);
  expect(req.output_config.format.type).toBe('json_schema');
});
test('KI liefert nichts oder Fehler: Rückfall auf den Parser', async () => {
  setCreateOverride(async () => { throw new Error('offline'); });
  const { env, T } = await user(true);
  const r = await call(env, 'POST', '/api/rules/parse', { text: 'dienstags gar nichts' }, T);
  expect(r.data.by).toBe('parser'); expect(r.data.rules[0].kind).toBe('dayOff');
});

/* Auftrag 5 D7: Auch der KI-Coach kann keine harte Regel brechen; neue Regeln gehen als Vorschlag ins Regel-Modell */
import { runTool } from '../../shared/coach/tools';
test('KI-Werkzeug: Verschieben gegen „Laufen nur Sa/So“ wird abgelehnt, erlaubter Tag geht', () => {
  const mon = '2026-10-19';
  const add = (d: number) => { const x = new Date(mon + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
  const weeks = [{ weekNumber: 1, startDate: mon, endDate: add(6), days: [0, 1, 2, 3, 4, 5, 6].map(i => ({ date: add(i), sessions: i === 5 ? [{ id: 'run-sa', sport: 'run', title: 'Lockerer Lauf', plannedMinutes: 40 }] : [{ id: 'r' + i, sport: 'rest', title: 'Ruhetag' }] })) }];
  const profile: any = { notes: ['Laufen nur am Wochenende'], thresholds: {}, sports: ['run'] };
  const ctx: any = { today: mon, now: 1, state: { adjustments: {}, sessions: {}, illnessPeriods: [] }, baseWeeks: weeks, planMeta: {}, profile, goals: [] };
  const no = runTool(ctx, 'move_session', { session_id: 'run-sa', to_date: add(2), reason: 'x' });
  expect(no.isError).toBe(true); expect(no.result).toMatch(/Laufen: nur Sa und So/);
  const yes = runTool(ctx, 'move_session', { session_id: 'run-sa', to_date: add(6), reason: 'x' });
  expect(yes.isError).toBe(false);
  const rule = runTool(ctx, 'add_rule', { text: 'ab jetzt mittwochs kein Rad' });
  expect(rule.proposal!.title).toBe('Neue Regel: Rad: nie Mi');
  expect(rule.proposal!.changes[0].data.rules.some((r: any) => r.kind === 'neverDays' && r.sport === 'bike' && r.source === 'ai')).toBe(true);
});
