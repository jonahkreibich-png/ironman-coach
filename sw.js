/* Nur für die alte Adresse (GitHub Pages aus main): ersetzt den Offline-Cache der alten App.
   Löscht alle Caches, meldet sich ab und schickt offene Fenster auf die neue Adresse. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate('https://coach-app-efc7.pages.dev/');
  })());
});
