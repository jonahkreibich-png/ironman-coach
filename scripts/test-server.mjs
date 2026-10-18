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
await build({ entryPoints: ['server/src/index.ts'], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'error', mainFields: ['module', 'main'], external: ['node:*'], conditions: ['workerd', 'worker', 'import'] });
const worker = (await import('file://' + out.replace(/\\/g, '/') + '?t=' + Date.now())).default;

function freshDb() {
  const db = new D1Shim(process.env.DB_FILE || ':memory:');
  // vorhandene, schon umgestellte Datenbank-Datei (z. B. eine Kopie der echten Daten aus scripts/migrate-copy.mjs): nicht erneut migrieren
  if (process.env.DB_FILE && db.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'd1_migrations'").get().n) return db;
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

/* Auftrag 16: nachgebautes Workers-AI-Modell für Browser-Tests (POST /__fake-ai {on, mode}); /__reset schaltet es ab.
   Antwortet Wort für Wort wie Workers AI (SSE im OpenAI-Format). „streich“ → Werkzeug cancel_session für die erste Einheit der nächsten Tage. */
function fakeAI(mode) {
  return {
    async run(model, input) {
      if (mode === 'error') throw new Error('4006: daily free allocation used up');
      const msgs = input.messages || []; const lastUser = [...msgs].reverse().find(m => m.role === 'user');
      const toolDone = msgs.some(m => m.role === 'tool');
      const ev = [];
      if (/streich/i.test(lastUser && lastUser.content || '') && !toolDone && input.tools) {
        const sys = msgs[0].content; const next = sys.split('NÄCHSTE TAGE:')[1] || ''; const m = /\[id ([\w.-]+)\]/.exec(next);
        ev.push({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call0', type: 'function', function: { name: 'cancel_session', arguments: JSON.stringify({ session_id: m ? m[1] : 'x', reason: 'keine Zeit' }) } }] } }] });
      } else {
        const text = toolDone ? 'Ich habe dir einen Vorschlag gemacht, du kannst ihn unten bestätigen.' : 'Schlaf ist die wichtigste Erholung. Bleib heute locker und hör auf deinen Körper.';
        for (const w of text.split(/(?<= )/)) ev.push({ choices: [{ index: 0, delta: { content: w } }] });
      }
      ev.push({ response: '', usage: { prompt_tokens: 2400, completion_tokens: 60, neurons: 27 } });
      const enc = new TextEncoder();
      return new ReadableStream({ async start(c) { for (const e of ev) { c.enqueue(enc.encode('data: ' + JSON.stringify(e) + '\n\n')); await new Promise(r => setTimeout(r, 15)); } c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); } });
    }
  };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${port}`);
  if (u.pathname === '/__reset' && req.method === 'POST') { env.DB = freshDb(); delete env.AI; res.writeHead(204); return res.end(); }
  if (u.pathname === '/__fake-ai' && req.method === 'POST') { const chunks = []; for await (const c of req) chunks.push(c); const b = JSON.parse(Buffer.concat(chunks).toString() || '{}'); if (b.on) env.AI = fakeAI(b.mode); else delete env.AI; res.writeHead(204); return res.end(); }
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
