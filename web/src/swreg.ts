/* Auftrag 28: Service Worker unabhängig vom App-Start. Vorher meldete erst main.ts (ganz am Ende) den Service Worker an. Stürzte der
   Start ab, kam kein Update mehr an: Die Fehlerseite blieb, bis das iPhone die App irgendwann ganz beendete. Jetzt meldet der Einstieg
   (bootstrap.ts) ihn sofort an, und die Fehlerseite kann ein Update suchen, übernehmen und neu laden. */
let regPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function swSupported(): boolean {
  try { return !import.meta.env.DEV && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && location.protocol !== 'file:'; } catch (_) { return false; }
}
/* Einmal anmelden (weitere Aufrufe bekommen dieselbe Anmeldung). Nie ein Fehler: ohne Service Worker läuft die App trotzdem. */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (regPromise) return regPromise;
  if (!swSupported()) return (regPromise = Promise.resolve(null));
  regPromise = navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => null);
  return regPromise;
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
/* Wartet, bis ein neuer Service Worker fertig installiert ist (oder die Zeit um ist). */
async function installed(reg: ServiceWorkerRegistration, ms: number): Promise<ServiceWorker | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (reg.waiting) return reg.waiting;
    if (!reg.installing) return null;
    await wait(150);
  }
  return reg.waiting || null;
}
/* Sucht eine neue Version. Liefert den wartenden Service Worker, falls es eine gibt. */
const within = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> => Promise.race([p.catch(() => fallback), wait(ms).then(() => fallback)]);
export async function findUpdate(ms = 10000): Promise<ServiceWorker | null> {
  // nie hängen bleiben: „Erneut versuchen“ lädt spätestens nach etwa 20 s neu, auch wenn der Browser nicht antwortet
  const reg = await within(registerServiceWorker(), 5000, null);
  if (!reg) return null;
  await within(reg.update().then(() => undefined), 6000, undefined);
  return installed(reg, ms);
}
/* Wartende Version sofort übernehmen (SKIP_WAITING) und auf die Übernahme warten. */
export async function activate(worker: ServiceWorker, ms = 5000): Promise<boolean> {
  if (!navigator.serviceWorker.controller) return true; // erste Anmeldung: Seite neu laden reicht
  const changed = new Promise<boolean>(resolve => {
    navigator.serviceWorker.addEventListener('controllerchange', () => resolve(true), { once: true });
    setTimeout(() => resolve(false), ms);
  });
  worker.postMessage({ type: 'SKIP_WAITING' });
  return changed;
}
/* „Erneut versuchen“: neue Version suchen und übernehmen, dann neu laden. beforeReload darf das Neuladen verhindern (Daten noch nicht gespeichert). */
export async function updateAndReload(beforeReload?: () => Promise<boolean>): Promise<void> {
  try { const w = await findUpdate(); if (w) await activate(w); } catch (_) { /* neu laden hilft trotzdem oft */ }
  if (beforeReload && !(await beforeReload())) return;
  location.reload();
}
