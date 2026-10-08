// Bump CACHE when shipping changes so phones pick up the new version.
const CACHE = 'pumptrack-v2';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'firebase-config.js',
  'vendor/firebase.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network first so updates show up when online; fall back to cache offline.
// `no-cache` makes the browser revalidate instead of serving its own stale HTTP cache.
self.addEventListener('fetch', (event) => {
  // Leave Firebase and other cross-origin traffic alone; it has its own offline handling.
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('index.html')))
  );
});
