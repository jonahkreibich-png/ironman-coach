/* Auftrag 6, Freigabe: Cloudflare erlaubt kostenlos nur 5 Zeitpläne pro Konto (alte App 2, Test 1, neue App 1).
   Deshalb hat jeder neue Server nur noch den 5-Minuten-Zeitplan; der Lauf um 02:00 UTC erledigt dabei auch das nächtliche Backup. */
import { test, expect } from 'vitest';
import worker from '../src/index';
import { makeEnv } from './multiuser.test';

async function tick(env: any, iso: string, cron = '*/5 * * * *') {
  const waits: Promise<any>[] = [];
  await (worker as any).scheduled({ cron, scheduledTime: Date.parse(iso) }, env, { waitUntil: (p: Promise<any>) => waits.push(p) });
  await Promise.all(waits);
}
const expired = (env: any) => env.DB.prepare("INSERT INTO pair_codes (code_hash, created_by, expires_at) VALUES ('X', 'dev', 2)").run();
const left = async (env: any) => (await env.DB.prepare('SELECT COUNT(*) AS n FROM pair_codes').first()).n;

test('nur ein Zeitplan: der 5-Minuten-Lauf um 02:00 UTC macht auch das nächtliche Aufräumen und Backup', async () => {
  const env = makeEnv();
  await expired(env);
  await tick(env, '2026-10-13T03:00:00Z');
  expect(await left(env)).toBe(1);   // tagsüber nicht
  await tick(env, '2026-10-13T02:00:00Z');
  expect(await left(env)).toBe(0);   // um 02:00 UTC schon
});
test('alter Zeitplan „0 2 * * *“ funktioniert weiter', async () => {
  const env = makeEnv();
  await expired(env);
  await tick(env, '2026-10-13T02:00:00Z', '0 2 * * *');
  expect(await left(env)).toBe(0);
});
test('wrangler.toml: echte App und Test-Umgebung haben je nur einen Zeitplan', async () => {
  const fs = await import('node:fs');
  const toml = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  for (const m of toml.matchAll(/crons = \[(.*)\]/g)) expect(m[1].split(',').length).toBe(1);
});
