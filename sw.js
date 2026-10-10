/* Offline-Cache für Ironman Coach. Bei jeder neuen Version ändert sich VERSION. */
const VERSION = '2026-10-10-33280284';
const CACHE = 'ironman-coach-' + VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./pwa.js",
  "./sync.js",
  "./core.js",
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

/* Push-Mitteilungen vom eigenen Server */
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  const tasks = [self.registration.showNotification(d.title || 'Ironman Coach', {
    body: d.body || '', tag: d.tag || undefined, icon: './icons/icon-192.png', badge: './icons/icon-192.png',
    data: { url: d.url || './' }
  })];
  if (typeof d.badge === 'number' && self.navigator && 'setAppBadge' in self.navigator) {
    tasks.push((d.badge > 0 ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge()).catch(() => {}));
  }
  event.waitUntil(Promise.all(tasks));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(x => x.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({ type: 'open', url }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
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
