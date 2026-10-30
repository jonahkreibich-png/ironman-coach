import { afterAll, beforeEach, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore - Node deployment entry point with no browser dependency
import { publishRelease, verifyBackup, verifyDeployment } from '../../scripts/veroeffentlichen.mjs';

beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterAll(() => vi.restoreAllMocks());
function harness(fail?: string) {
  const calls: string[] = [];
  const step = async (s: any) => { const k = s.kind + (s.target ? ':' + s.target : ''); calls.push(k); if (k === fail) throw Error('synthetic failure'); };
  const check = (file: string) => { const target = path.basename(file).startsWith('production-') ? 'production' : 'test'; calls.push('validate:' + target); if ('validate:' + target === fail) throw Error('bad backup'); return { bytes: 1000 }; };
  const verify = async (target: string) => { calls.push('verify:' + target); if ('verify:' + target === fail) throw Error('bad deployment'); };
  return { calls, go: () => publishRelease({ run: step, checkBackup: check, verify, now: new Date('2026-10-24T20:00:00Z') }) };
}
test('Rückweg-Zeitpunkt nicht lesbar: Release läuft weiter (Sicherung liegt vor)', async () => {
  const h = harness('bookmark:production'); await h.go(); expect(h.calls).toContain('deploy:production');
});
test('publication checks both backups and test deployment before updating production', async () => {
  const h = harness(); await h.go();
  expect(h.calls).toEqual(['checks', 'backup:test', 'validate:test', 'deploy:test', 'verify:test', 'backup:production', 'validate:production', 'realdata:production', 'bookmark:production', 'deploy:production', 'verify:production']);
});
for (const fail of ['checks', 'backup:test', 'validate:test', 'deploy:test', 'verify:test', 'backup:production', 'validate:production', 'realdata:production']) test('failure at ' + fail + ' prevents production deployment', async () => {
  const h = harness(fail); await expect(h.go()).rejects.toThrow(); expect(h.calls).not.toContain('deploy:production');
});

const dir = fs.mkdtempSync(path.join(process.cwd(), 'scratch', 'release-regression-'));
const files: string[] = [];
const write = (name: string, value: string) => { const f = path.join(dir, name); fs.writeFileSync(f, value); files.push(f); return f; };
test('backup validation restores an app export in memory, including forward foreign keys', () => {
  const file = write('valid.sql', 'PRAGMA defer_foreign_keys=TRUE; CREATE TABLE records(id TEXT, user_id INTEGER REFERENCES users(id)); INSERT INTO records VALUES (\'synthetic\',1); CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1);');
  expect(verifyBackup(file)).toMatchObject({ bytes: expect.any(Number), sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
});
test('invalid or incomplete export is rejected', () => {
  expect(() => verifyBackup(write('invalid.sql', 'not SQL'.repeat(30)))).toThrow(/Sicherung/);
  expect(() => verifyBackup(write('incomplete.sql', 'CREATE TABLE users(id INTEGER);' + ' '.repeat(100)))).toThrow(/Sicherung/);
});

const dist = path.join(dir, 'dist'); fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
fs.writeFileSync(path.join(dist, 'index.html'), '<script type="module" src="./assets/app.js"></script>');
fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'synthetic-js'); fs.writeFileSync(path.join(dist, 'sw.js'), 'synthetic-sw');
afterAll(() => { for (const f of files) fs.unlinkSync(f); fs.unlinkSync(path.join(dist, 'assets', 'app.js')); fs.rmdirSync(path.join(dist, 'assets')); fs.unlinkSync(path.join(dist, 'index.html')); fs.unlinkSync(path.join(dist, 'sw.js')); fs.rmdirSync(dist); fs.rmdirSync(dir); });
function responses(env = 'test', js = 'synthetic-js') {
  return async (url: string) => {
    const p = new URL(url).pathname;
    const value = p === '/api/health' ? JSON.stringify({ ok: true, env, app: 'Stamio' }) : p === '/' ? '<script src="./assets/app.js"></script>' : p === '/assets/app.js' ? js : 'synthetic-sw';
    return new Response(value);
  };
}
test('deployment check accepts matching health, JavaScript and service worker', async () => {
  await verifyDeployment('test', { dist, fetchImpl: responses(), attempts: 1 });
});
test('deployment check rejects wrong binding environment', async () => {
  await expect(verifyDeployment('test', { dist, fetchImpl: responses('production'), attempts: 1 })).rejects.toThrow(/Umgebung/);
});
test('deployment check rejects stale app bytes', async () => {
  await expect(verifyDeployment('test', { dist, fetchImpl: responses('test', 'old-js'), attempts: 1 })).rejects.toThrow(/überein/);
});

import { spawnSync } from 'node:child_process';
test('help exits without starting release actions', () => {
  const r = spawnSync(process.execPath, ['scripts/veroeffentlichen.mjs', '--help'], { encoding: 'utf8', cwd: process.cwd() });
  expect(r.status).toBe(0); expect(r.stdout).toContain('Aufruf:'); expect(r.stdout).not.toContain('Sicherung geprüft:');
});
test('unknown options stop instead of publishing', () => {
  const r = spawnSync(process.execPath, ['scripts/veroeffentlichen.mjs', '--skip-tests'], { encoding: 'utf8', cwd: process.cwd() });
  expect(r.status).toBe(1); expect(r.stderr).toContain('Aufruf:');
});
