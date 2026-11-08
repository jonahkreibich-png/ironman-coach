import { storage, storageMessage } from './persistence';
/* Service Worker, Updates und dauerhafter Speicher. */
import { saveState } from './store';
import { toast } from './toast';
import { registerServiceWorker, swSupported } from './swreg';

let reg: ServiceWorkerRegistration | null = null;
let waitingWorker: ServiceWorker | null = null;

function showUpdate(worker: ServiceWorker | null) {
  waitingWorker = worker;
  if (document.getElementById('upd')) return;
  const el = document.createElement('div');
  el.id = 'upd'; el.className = 'upd'; el.setAttribute('role', 'status');
  el.innerHTML = '<span>Neue Version der App ist da.</span><button class="btn small" id="upd-go">Aktualisieren</button>';
  document.body.appendChild(el);
  document.getElementById('upd-go')!.addEventListener('click', async () => {
    saveState();
    if (!await storage.settled()) { toast(storageMessage()); return; }
    if (waitingWorker) waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    else location.reload();
  });
}

export async function checkForUpdate(manual?: boolean): Promise<void> {
  if (!reg) { if (manual) toast('Updates gehen nur in der installierten App.'); return; }
  try { await reg.update(); } catch (e) {}
  if (manual) setTimeout(() => { if (!reg!.waiting && !reg!.installing) toast('Du hast die neueste Version.'); }, 1500);
}

export function startPwa(): void {
  // Im Entwicklungsmodus (vite dev) gibt es keinen Service Worker
  if (!swSupported()) return;
  const register = async () => {
    try {
      // Auftrag 28: angemeldet wird schon im Einstieg (bootstrap.ts, swreg.ts), auch wenn die App nicht startet; hier nur Update-Hinweis
      reg = await registerServiceWorker();
      if (!reg) return;
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg!.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(nw);
        });
      });
      // Beim allerersten Start übernimmt der Service Worker die Seite. Dann nicht neu laden,
      // sonst gehen gerade eingegebene Daten verloren. Nur bei einem echten Update neu laden.
      let hadController = !!navigator.serviceWorker.controller;
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', async () => {
        if (!hadController) { hadController = true; return; }
        if (reloading) return; reloading = true;
        saveState();
        if (!await storage.settled()) { reloading = false; showUpdate(null); toast(storageMessage()); return; }
        location.reload();
      });
      document.addEventListener('visibilitychange', () => {
        // Auftrag 30: Update-Suche nach der Rückkehr erst etwas später (nicht im ersten Bild)
        if (document.visibilityState === 'visible') setTimeout(() => { if (document.visibilityState === 'visible') reg!.update().catch(() => {}); }, 2500);
      });
    } catch (e) { /* offline oder nicht unterstützt: App läuft trotzdem */ }
  };
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', register, {once:true});
  // Bittet den Browser, die Daten nicht automatisch zu löschen
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
}
