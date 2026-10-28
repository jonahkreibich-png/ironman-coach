import { describe, expect, test, vi } from 'vitest';
import { makeEnv, call } from './multiuser.test';
import { logError, scrub } from '../src/errlog';

describe('Fehlerprotokoll schuetzt Zugangsdaten und Nutzergrenzen', () => {
  test.each([
    'Authorization: Bearer syntheticSecretABC',
    'Authorization: Basic c3ludGhldGljOnNlY3JldA==',
    'api_key=syntheticSecretABC',
    'API-Key: syntheticSecretABC',
    '{"access_token":"syntheticSecretABC","refresh_token":"secondSyntheticSecret"}',
    'client_secret=syntheticSecretABC password="second synthetic secret"',
    'https://synthetic.invalid/path?api_key=syntheticSecretABC'
  ])('Zugangsdaten werden entfernt: %s', text => {
    expect(scrub(text)).not.toMatch(/syntheticSecretABC|secondSyntheticSecret|second synthetic secret|c3ludGhldGljOnNlY3JldA/);
  });

  test('unerwartete Serverfehler verraten kein Secret im Laufzeitlog oder HTTP', async () => {
    const env = makeEnv();
    const user = (await call(env, 'POST', '/api/setup', { name: 'Synthetischer Fehlerfall' })).data;
    env.DB.prepare = () => { throw new Error('upstream api_key=syntheticSecretABC'); };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await call(env, 'GET', '/api/me', null, user.token);
      expect(result.status).toBe(500); expect(JSON.stringify(result.data)).not.toContain('syntheticSecretABC');
      expect(logged).toHaveBeenCalled(); expect(JSON.stringify(logged.mock.calls)).not.toContain('syntheticSecretABC');
    } finally { logged.mockRestore(); }
  });
  test('normale Nutzer sehen eigene Fehler, keine globalen oder fremden Fehler', async () => {
    const env = makeEnv();
    const admin = (await call(env, 'POST', '/api/setup', { name: 'Synthetischer Betreiber' })).data;
    const inv = (await call(env, 'POST', '/api/admin/testusers', {}, admin.token)).data;
    const user = (await call(env, 'POST', '/api/setup', { name: 'Synthetischer Nutzer', invite: inv.code })).data;
    await logError(env, 'server', 'GLOBAL_MARKER api_key=syntheticSecretABC', 'synthetic');
    await logError(env, 'app', 'OWNER_MARKER', 'synthetic', { uid: admin.userId });
    await logError(env, 'app', 'USER_MARKER', 'synthetic', { uid: user.userId });
    const own = await call(env, 'GET', '/api/log', null, user.token);
    expect(own.status).toBe(200); expect(own.data.errors).toHaveLength(1);
    expect(own.data.errors[0].msg).toBe('USER_MARKER');
    const all = (await call(env, 'GET', '/api/log', null, admin.token)).data.errors;
    expect(all).toHaveLength(3); expect(all.some((e: any) => e.msg.includes('GLOBAL_MARKER'))).toBe(true);
    expect(JSON.stringify(all)).not.toContain('syntheticSecretABC');
    expect((await call(env, 'GET', '/api/log')).status).toBe(401);
  });
});
