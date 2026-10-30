/* HTTP-Hilfen: JSON-Antworten, CORS, Fehler, Zufall, Hashes und Token-Verschlüsselung. */
import type { Env } from './store';

export const MAX_BODY = 6 * 1024 * 1024;
export class HttpError extends Error { status: number; constructor(status: number, msg: string) { super(msg); this.status = status; } }

export function json(data: any, status?: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...(headers || {}) } });
}
export function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Ingest-Key, X-App-Version, X-App-Release, X-Time-Zone',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
export function b64url(bytes: Uint8Array): string {
  let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlDecode(str: string): Uint8Array {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function randomToken(n?: number): string { return b64url(crypto.getRandomValues(new Uint8Array(n || 32))); }
export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function readText(req: Request): Promise<string> {
  const len = parseInt(req.headers.get('Content-Length') || '0', 10);
  if (len > MAX_BODY) throw new HttpError(413, 'Zu groß');
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Zu groß');
  return text;
}
export async function readJson(req: Request): Promise<any> {
  const text = await readText(req);
  try { return text ? JSON.parse(text) : {}; } catch (e) { throw new HttpError(400, 'Kein gültiges JSON'); }
}
export function cleanName(n: unknown, max = 40): string { return String(n || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max); }

/* Verschlüsselung von Tokens (AES-GCM) mit dem Secret TOKEN_KEY */
async function tokenKey(env: Env): Promise<CryptoKey> {
  if (!env.TOKEN_KEY || String(env.TOKEN_KEY).trim().length < 16) throw new HttpError(503, 'TOKEN_KEY fehlt auf dem Server.');
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(env.TOKEN_KEY).trim()));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
export async function encryptJson(env: Env, obj: any): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await tokenKey(env), new TextEncoder().encode(JSON.stringify(obj))));
  return b64url(iv) + '.' + b64url(ct);
}
export async function decryptJson(env: Env, s: string | null | undefined): Promise<any> {
  if (!s) return null;
  const [iv, ct] = s.split('.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64urlDecode(iv) as any }, await tokenKey(env), b64urlDecode(ct) as any);
  return JSON.parse(new TextDecoder().decode(pt));
}
