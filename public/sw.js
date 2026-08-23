/**
 * Minimal offline shell so Fox Media stays installable and usable without
 * network. Media files are never cached here: they live on the device.
 */

const CACHE = 'fox-media-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['.', 'index.html', 'manifest.webmanifest'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request)
          .then((response) => {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => caches.match('index.html')),
    ),
  );
});
