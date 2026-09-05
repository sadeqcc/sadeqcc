/*
 * GOLD ORDERS service worker.
 * The app shell is precached so the app opens offline; API reads use
 * network-first with a cached fallback, and writes are never cached — those
 * are queued in the client outbox and replayed when the connection returns.
 */
const VERSION = 'gold-orders-v1';
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;

const PRECACHE = ['/', '/orders', '/customers', '/more', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(PRECACHE).catch(() => undefined)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Media blobs are immutable once stored, so they can be cached aggressively.
  if (url.pathname.startsWith('/api/media/')) {
    event.respondWith(
      caches.open(DATA).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res.ok) {
            const cache = await caches.open(DATA);
            cache.put(request, res.clone());
          }
          return res;
        } catch {
          const hit = await caches.match(request);
          if (hit) return hit;
          return new Response(JSON.stringify({ ok: false, error: 'offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const res = await fetch(request);
        if (res.ok && request.mode === 'navigate') {
          const cache = await caches.open(SHELL);
          cache.put(request, res.clone());
        }
        return res;
      } catch {
        const hit = (await caches.match(request)) || (request.mode === 'navigate' ? await caches.match('/') : undefined);
        if (hit) return hit;
        throw new Error('offline');
      }
    })(),
  );
});
