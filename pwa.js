/* Service Worker, Updates und dauerhafter Speicher (nur in der installierbaren App) */
(function () {
  let reg = null;
  let waitingWorker = null;

  function showUpdate(worker) {
    waitingWorker = worker;
    if (document.getElementById('upd')) return;
    const el = document.createElement('div');
    el.id = 'upd'; el.className = 'upd'; el.setAttribute('role', 'status');
    el.innerHTML = '<span>Neue Version der App ist da.</span><button class="btn small" id="upd-go">Aktualisieren</button>';
    document.body.appendChild(el);
    document.getElementById('upd-go').addEventListener('click', () => {
      try { if (typeof saveState === 'function') saveState(); } catch (e) {}
      if (waitingWorker) waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      else location.reload();
    });
  }

  window.checkForUpdate = async function (manual) {
    if (!reg) { if (manual && typeof toast === 'function') toast('Updates gehen nur in der installierten App.'); return; }
    try { await reg.update(); } catch (e) {}
    if (manual && typeof toast === 'function') {
      setTimeout(() => { if (!reg.waiting && !reg.installing) toast('Du hast die neueste Version.'); }, 1500);
    }
  };

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', async () => {
      try {
        reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
        if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(nw);
          });
        });
        // Beim allerersten Start übernimmt der Service Worker die Seite. Dann nicht neu laden,
        // sonst gehen gerade eingegebene Daten verloren. Nur bei einem echten Update neu laden.
        let hadController = !!navigator.serviceWorker.controller;
        let reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!hadController) { hadController = true; return; }
          if (reloading) return; reloading = true;
          try { if (typeof saveState === 'function') saveState(); } catch (e) {}
          location.reload();
        });
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      } catch (e) { /* offline oder nicht unterstützt: App läuft trotzdem */ }
    });
  }

  // Bittet den Browser, die Daten nicht automatisch zu löschen
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
})();
