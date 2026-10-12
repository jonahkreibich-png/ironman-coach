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
