/* Zentrale Konfiguration. Der App-Name steht nur hier (und in shared/brand.ts für Server, Manifest und Icons). */
import { BRAND } from '../../shared/brand';

export const APP = BRAND;

/* Speicher-Schlüssel im Browser */
export const STORAGE = {
  plan: 'ec_plan',
  state: 'ec_state_v2',
  ui: 'ec_ui',
  theme: 'theme_pref',
  syncAuth: 'ec_sync_auth',
  syncMeta: 'ec_sync',
  errors: 'ec_errors',
  legacyState: [] as string[]
};

/* Server-Adresse: gleiche Herkunft (Cloudflare Pages leitet /api an den Worker weiter, vite dev ebenso).
   VITE_API_BASE überschreibt das. */

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string) ?? '';
export const APP_VERSION: string = (import.meta.env.VITE_APP_VERSION as string) || 'dev';

/* Umgebung: Testumgebung (eigene Adresse), lokal oder echte App. Neue Funktionen, die erst nach „Freigeben“
   für alle gelten sollen, hängen an FEATURES. */
const host = typeof location !== 'undefined' ? location.hostname : '';
export const APP_ENV: 'test' | 'dev' | 'production' = ((import.meta.env.VITE_APP_ENV as string) as any)
  || (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) ? 'dev' : /-test\.|^test\./.test(host) ? 'test' : 'production');
export const FEATURES = {
  /* Plan-Generator: nur in der Testumgebung sichtbar */
  generator: APP_ENV !== 'production'
};
