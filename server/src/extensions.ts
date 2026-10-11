/* Erweiterungen: Verbindungen (OAuth, Webhooks, Kurzbefehl), Datei-Import, Coach-Engine und KI-Coach.
   index.ts ruft diese Haken auf, damit der Kern übersichtlich bleibt. */
import type { Env, Change } from './store';
import type { Auth } from './auth';

/* Routen ohne Geräte-Login (eigene Prüfung je Route). undefined = nicht zuständig. */
export async function publicRoutes(_req: Request, _env: Env, _url: URL, _p: string, _ctx: any): Promise<any> { return undefined; }
/* Routen mit Geräte-Login */
export async function extraRoutes(_req: Request, _env: Env, _url: URL, _p: string, _a: Auth, _ctx: any): Promise<any> { return undefined; }
/* Zusätzliche Zeitpläne (z. B. Abruf der Dienste alle 15 min) */
export async function scheduledExtras(_env: Env, _b: any, _users: number[]): Promise<void> {}
/* Neue Datensätze: Coach-Engine anstoßen */
export async function onRecordsChanged(_env: Env, _uid: number, _changes: Change[], _source: string): Promise<void> {}
