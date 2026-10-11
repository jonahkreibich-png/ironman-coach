// Lokaler Server für E2E-Tests und Entwicklung: liefert dist/ aus und /api über den echten Worker-Code.
// Die Datenbank ist SQLite im Speicher (oder Datei über DB_FILE), mit derselben API wie D1.
// Aufruf: node scripts/test-server.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { D1Shim } from '../server/test/d1-shim.mjs';

const port = +(process.argv[2] || 4180);
const root = path.resolve('dist');
const out = path.resolve('node_modules/.cache/worker-test.mjs');
await build({ entryPoints: ['server/src/index.ts'], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'error', mainFields: ['module', 'main'] });
const worker = (await import('file://' + out.replace(/\\/g, '/') + '?t=' + Date.now())).default;

function freshDb() {
  const db = new D1Shim(process.env.DB_FILE || ':memory:');
  for (const f of [...fs.readdirSync('server/migrations').filter(f => f.endsWith('.sql')).sort().map(f => 'server/migrations/' + f)]) {
    if (fs.existsSync(f)) db.execFile(f);
  }
  return db;
}
const env = {
  DB: freshDb(), ALLOWED_ORIGINS: `http://localhost:${port}`, ALLOW_TEST_ROUTES: '1',
  TOKEN_KEY: 'test-token-key-0123456789abcdef0123456789abcdef', PUBLIC_URL: `http://localhost:${port}`,
  ...(process.env.WORKER_ENV ? JSON.parse(process.env.WORKER_ENV) : {})
};

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${port}`);
  if (u.pathname === '/__reset' && req.method === 'POST') { env.DB = freshDb(); res.writeHead(204); return res.end(); }
  if (u.pathname.startsWith('/api/')) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const r = await worker.fetch(new Request(u, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env, { waitUntil() {} });
    res.writeHead(r.status, Object.fromEntries(r.headers));
    return res.end(Buffer.from(await r.arrayBuffer()));
  }
  let p = path.join(root, decodeURIComponent(u.pathname));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) p = path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(p).pipe(res);
}).listen(port, () => console.log(`Testserver auf http://localhost:${port}`));
