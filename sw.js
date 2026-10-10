/* Offline-Cache für Ironman Coach. Bei jeder neuen Version ändert sich VERSION. */
const VERSION = '2026-10-10-c74144aa';
const CACHE = 'ironman-coach-' + VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./pwa.js",
  "./sync.js",
  "./manifest.webmanifest",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/favicon-64.png",
  "./fonts/barlow-latin-400-normal.woff2",
  "./fonts/barlow-latin-500-normal.woff2",
  "./fonts/barlow-latin-600-normal.woff2",
  "./fonts/barlow-latin-700-normal.woff2",
  "./fonts/barlow-condensed-latin-500-normal.woff2",
  "./fonts/barlow-condensed-latin-600-normal.woff2",
  "./fonts/barlow-condensed-latin-700-normal.woff2"
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => Promise.all(
      ASSETS.map(url => fetch(new Request(url, { cache: 'reload' })).then(res => {
        if (!res.ok) throw new Error('Laden fehlgeschlagen: ' + url);
        return cache.put(url, res);
      }))
    ))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('ironman-coach-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Seitenaufrufe: immer die gespeicherte App-Seite, damit sie offline sofort startet
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then(cache => cache.match('./index.html').then(hit => hit || fetch(req)))
        .catch(() => fetch(req))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(cache => cache.match(req, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res.ok && url.pathname.includes('/splash/') === false) cache.put(req, res.clone());
        return res;
      });
    }))
  );
});
