// Cachea los archivos de la app la primera vez que hay conexión, para que
// después funcione sin internet. Los datos cargados (los SEV) NO viven acá:
// eso está en IndexedDB, que persiste solo aparte y no se toca al actualizar
// esta lista de archivos.
const CACHE_NAME = 'sevapp-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .catch(err => console.warn('No se pudieron cachear todos los archivos', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request)
        .then(resp => {
          // actualiza la caché en segundo plano cuando hay señal
          if (resp && resp.status === 200 && event.request.method === 'GET') {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
