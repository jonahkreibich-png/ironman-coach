/* Auftrag 22: Zeitzone je Nutzer auf dem Server (aus den Einstellungen der App, sonst Europe/Berlin).
   Alle Stellen, die „heute“ oder die Uhrzeit brauchen (berlinDate/berlinParts in store.ts), lesen sie über shared/tz.ts. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { setTzProvider, validTz, DEFAULT_TZ } from '../../shared/tz';
import type { Env } from './store';
const ALS = new AsyncLocalStorage<string>();
setTzProvider(() => ALS.getStore());
export function withTz<T>(tz: string | null | undefined, fn: () => Promise<T>): Promise<T> { return ALS.run(validTz(tz) ? tz! : DEFAULT_TZ, fn); }
export async function userTz(env: Env, uid: number): Promise<string> {
  try {
    const r: any = await env.DB.prepare("SELECT data FROM records WHERE user_id = ? AND kind = 'settings' AND key = 'main' AND deleted = 0").bind(uid).first();
    const tz = r && r.data ? (JSON.parse(String(r.data)).settings || {}).tz : null;
    return validTz(tz) ? tz : DEFAULT_TZ;
  } catch { return DEFAULT_TZ; }
}
