/* API-Tests gegen den echten Worker-Code (gebündelt mit esbuild) und SQLite statt D1.
   Jede Testdatei bekommt einen frischen Server mit leerer Datenbank. */
import { test, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const procs: ChildProcess[] = [];
let vapid = '';

function start(file: string, args: string[] = [], env: Record<string, string> = {}): ChildProcess {
  const p = spawn(process.execPath, [file, ...args], { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.push(p);
  return p;
}
async function waitFor(url: string) {
  for (let i = 0; i < 100; i++) { try { const r = await fetch(url); if (r.status < 500) return; } catch (e) {} await new Promise(r => setTimeout(r, 100)); }
  throw new Error('Server startet nicht: ' + url);
}
function run(file: string, env: Record<string, string>): Promise<{ code: number; out: string }> {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [file], { cwd: path.join(ROOT, 'server'), env: { ...process.env, ...env } });
    let out = ''; p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
    p.on('close', code => resolve({ code: code ?? 1, out }));
  });
}
let port = 8810;
async function serverFor(): Promise<string> {
  const pt = port++;
  start('scripts/test-server.mjs', [String(pt)], {
    WORKER_ENV: JSON.stringify({
      ALLOWED_ORIGINS: 'http://localhost:8765', ALLOW_TEST_ROUTES: '1',
      INTERVALS_BASE: 'http://127.0.0.1:8799', INTERVALS_API_KEY: 'test-key', INTERVALS_ATHLETE_ID: 'i12345',
      VAPID_PRIVATE_JWK: vapid
    })
  });
  await waitFor(`http://localhost:${pt}/api/health`);
  return `http://localhost:${pt}`;
}

beforeAll(async () => {
  const k = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  vapid = JSON.stringify(await webcrypto.subtle.exportKey('jwk', k.privateKey));
  start('server/test/mock-intervals.mjs');
  start('server/test/mock-push.mjs');
  await waitFor('http://127.0.0.1:8799/');
  await waitFor('http://127.0.0.1:8798/sub');
}, 30000);
afterAll(() => { procs.forEach(p => p.kill()); });

for (const file of ['run.mjs', 'intervals.mjs', 'coach-server.mjs', 'push.mjs']) {
  test(file, async () => {
    const api = await serverFor();
    const r = await run('test/' + file, { API: api });
    if (r.code !== 0) console.log(r.out);
    expect(r.code, r.out.split('\n').filter(l => l.includes('✗')).join('\n')).toBe(0);
  }, 60000);
}
