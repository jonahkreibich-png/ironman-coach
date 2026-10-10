// Nachgemachter Push-Dienst (Port 8798): prüft die VAPID-Unterschrift und entschlüsselt aes128gcm (RFC 8291).
// Hält dafür das Schlüsselpaar eines "Browsers" bereit. GET /sub liefert das Abo, GET /messages die empfangenen Nachrichten.
import http from 'node:http';
import crypto from 'node:crypto';

const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
const uaPublic = ua.getPublicKey();
const authSecret = crypto.randomBytes(16);
const b64u = b => Buffer.from(b).toString('base64url');
const messages = [];
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();

function verifyVapid(header, endpointOrigin) {
  const m = /^vapid t=([^,]+),\s*k=(.+)$/.exec(header || '');
  if (!m) return 'kein vapid-Header';
  const [h, c, s] = m[1].split('.');
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  if (claims.aud !== endpointOrigin) return 'aud falsch: ' + claims.aud;
  if (!claims.sub || claims.exp * 1000 < Date.now()) return 'sub/exp falsch';
  const pub = Buffer.from(m[2], 'base64url');
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
  const ok = crypto.verify('sha256', Buffer.from(h + '.' + c), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
  return ok ? null : 'Unterschrift ungültig';
}
function decrypt(body) {
  const salt = body.subarray(0, 16), idlen = body[20], asPublic = body.subarray(21, 21 + idlen), cipher = body.subarray(21 + idlen);
  const ecdh = ua.computeSecret(asPublic);
  const prkKey = hmac(authSecret, ecdh);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(cipher.subarray(cipher.length - 16));
  const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()]);
  if (plain[plain.length - 1] !== 2) throw new Error('Trennzeichen fehlt');
  return JSON.parse(plain.subarray(0, plain.length - 1).toString());
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1:8798');
  if (req.method === 'GET' && u.pathname === '/sub') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ endpoint: 'http://127.0.0.1:8798/push/abc', keys: { p256dh: b64u(uaPublic), auth: b64u(authSecret) } }));
  }
  if (req.method === 'GET' && u.pathname === '/messages') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(messages)); }
  if (req.method === 'POST' && u.pathname === '/reset') { messages.length = 0; res.writeHead(200); return res.end('{}'); }
  if (req.method === 'POST' && u.pathname.startsWith('/push/')) {
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
      try {
        const err = verifyVapid(req.headers.authorization, 'http://127.0.0.1:8798');
        if (err) { messages.push({ error: err }); res.writeHead(403); return res.end(); }
        if (req.headers['content-encoding'] !== 'aes128gcm') throw new Error('falsches Content-Encoding');
        messages.push(decrypt(Buffer.concat(chunks)));
        res.writeHead(201); res.end();
      } catch (e) { messages.push({ error: e.message }); res.writeHead(400); res.end(); }
    });
    return;
  }
  res.writeHead(404); res.end();
}).listen(8798, () => console.log('mock push on 8798'));
