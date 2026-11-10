/* Gemeinsame Hilfen für die Mitteilungs-Tests (Auftrag 31, 33): nachgemachter Browser-Push, Verbinden, Entschlüsseln der Nachricht
   wie der Browser (RFC 8291) – damit kann ein Test den Empfang bestätigen wie der Service Worker. */
import { type Page, type APIRequestContext } from '@playwright/test';
import crypto from 'node:crypto';

export const BASE = 'http://localhost:4180';
const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
const AUTH_SECRET = crypto.randomBytes(16);
export const KEYS = { p256dh: ecdh.getPublicKey().toString('base64url'), auth: AUTH_SECRET.toString('base64url') };

export async function account(request: APIRequestContext) {
  await request.post('/__reset');
  return await (await request.post('/api/setup', { data: { name: 'iPhone' } })).json();
}
export async function pairNew(request: APIRequestContext, token: string, name = 'iPhone') {
  const c = (await (await request.post('/api/pair/create', { headers: { Authorization: 'Bearer ' + token } })).json()).code;
  return await (await request.post('/api/pair/redeem', { data: { code: c, name } })).json();
}
export const api = async (request: APIRequestContext, token: string, method: 'get' | 'post', path: string, data?: any) => (await request[method](path, { headers: { Authorization: 'Bearer ' + token }, ...(data ? { data } : {}) })).json();
export const pushLog = async (request: APIRequestContext) => (await request.get('/__push-log')).json();

/* Browser-Push nachmachen: Erlaubnis, Service Worker bereit, Anmeldung mit Adresse beim Push-Dienst des Testservers.
   Die Anmeldung bleibt im sessionStorage (wie im Browser über Neuladen hinweg); `__nextId` bestimmt die Adresse der nächsten. */
export async function fakePush(page: Page, firstId: string, opts: { perm?: string } = {}) {
  await page.addInitScript(([base, keys, firstId, perm0]) => {
    const w = window as any;
    const load = () => { try { return JSON.parse(sessionStorage.getItem('__fakeSub') || 'null'); } catch (e) { return null; } };
    const save = (s: any) => sessionStorage.setItem('__fakeSub', JSON.stringify(s));
    let perm = sessionStorage.getItem('__perm') || perm0 || 'default';
    class FakeNotification { static get permission() { return perm; } static async requestPermission() { perm = 'granted'; sessionStorage.setItem('__perm', perm); return perm; } }
    Object.defineProperty(w, 'Notification', { value: FakeNotification, configurable: true });
    if (!('PushManager' in w)) Object.defineProperty(w, 'PushManager', { value: function PushManager() {}, configurable: true });
    const makeSub = (d: any) => d && ({ endpoint: d.endpoint, options: { applicationServerKey: new Uint8Array(d.key).buffer },
      toJSON: () => ({ endpoint: d.endpoint, keys }), unsubscribe: async () => { save(null); w.__unsubscribed = (w.__unsubscribed || 0) + 1; return true; } });
    const pushManager = {
      getSubscription: async () => makeSub(load()),
      subscribe: async (o: any) => {
        // wie iOS ohne Antippen: Neuanmeldung schlägt fehl, wenn der Test das so will
        if (sessionStorage.getItem('__noSilentSubscribe') === '1' && !w.__userTap) throw new Error('NotAllowedError');
        const id = sessionStorage.getItem('__nextId') || firstId;
        const d = { endpoint: `${base.replace('localhost', '127.0.0.1')}/__push/${id}`, key: Array.from(new Uint8Array(o.applicationServerKey)) };
        save(d); return makeSub(d);
      }
    };
    Object.defineProperty(ServiceWorkerContainer.prototype, 'ready', { get: () => Promise.resolve({ pushManager }), configurable: true });
  }, [BASE, KEYS, firstId, opts.perm || ''] as const);
}
export async function connect(page: Page, acc: any) {
  await page.addInitScript(a => {
    const cur = JSON.parse(localStorage.getItem('ec_sync_auth') || 'null');
    if (!cur || cur.deviceId !== a.deviceId) { localStorage.setItem('ec_sync_auth', JSON.stringify({ token: a.token, deviceId: a.deviceId, userId: a.userId, connectedAt: Date.now() })); localStorage.setItem('ec_owner', JSON.stringify(a.userId)); }
  }, acc);
}
/* Nachricht entschlüsseln wie der Browser (aes128gcm, ein Datensatz) */
export function decrypt(b64: string): any {
  const body = Buffer.from(b64, 'base64');
  const hmac = (k: Buffer, d: Buffer) => crypto.createHmac('sha256', k).update(d).digest();
  const salt = body.subarray(0, 16), idlen = body[20], asPublic = body.subarray(21, 21 + idlen), cipher = body.subarray(21 + idlen);
  const prkKey = hmac(AUTH_SECRET, ecdh.computeSecret(asPublic));
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(cipher.subarray(cipher.length - 16));
  const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()]);
  return JSON.parse(plain.subarray(0, plain.length - 1).toString());
}
