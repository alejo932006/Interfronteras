const CACHE_NAME = 'admin-cache-v1';
const urlsToCache = [
  '/frontend/admin/admin.html',
  '/frontend/admin/style.css',
  '/frontend/admin/admin.js',
  '/frontend/index/img/img5.jpeg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  // Estrategia Network First (Intentar red, si falla usar caché)
  // Ideal para admin panels donde los datos cambian mucho
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});