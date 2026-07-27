/* ============================================================
   SEV Campo — service-worker.js
   Estrategia: cache-first con actualización en segundo plano.
   - install: precachea todos los archivos de la app (app shell).
   - activate: borra cachés de versiones anteriores.
   - fetch: sirve desde caché primero (funciona 100% offline);
     si el recurso no está cacheado, intenta red y lo guarda para
     la próxima vez; si tampoco hay red, cae a index.html (SPA).

   IMPORTANTE: cuando publiques cambios en la app, subí el número
   de CACHE_VERSION. Eso crea una caché nueva; al activarse, las
   cachés viejas se eliminan automáticamente.
   ============================================================ */
const CACHE_VERSION = 'v1';
const CACHE_NAME = `sev-campo-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png'
];

self.addEventListener('install', (event)=>{
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache)=> cache.addAll(APP_SHELL))
  );
  // No forzamos skipWaiting: dejamos que la sesión activa termine con la
  // versión actual y la nueva se aplique la próxima vez que se abra la app,
  // para no interrumpir una carga de datos en curso.
});

self.addEventListener('activate', (event)=>{
  event.waitUntil(
    caches.keys().then((keys)=>
      Promise.all(
        keys
          .filter((key)=> key.startsWith('sev-campo-') && key !== CACHE_NAME)
          .map((key)=> caches.delete(key))
      )
    ).then(()=> self.clients.claim())
  );
});

self.addEventListener('fetch', (event)=>{
  const req = event.request;
  if(req.method !== 'GET') return; // no interceptar POST/PUT/etc.

  event.respondWith(
    caches.match(req).then((cached)=>{
      if(cached) return cached;

      return fetch(req).then((networkRes)=>{
        // sólo cacheamos respuestas válidas del mismo origen
        if(networkRes && networkRes.ok && req.url.startsWith(self.location.origin)){
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache)=> cache.put(req, clone));
        }
        return networkRes;
      }).catch(()=>{
        // Sin red y sin caché para este recurso: si es una navegación,
        // devolvemos el app shell (index.html) para que la app siga abriendo.
        if(req.mode === 'navigate'){
          return caches.match('./index.html');
        }
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});

// Permite que app.js le pida al SW activarse inmediatamente si el usuario
// decide aplicar la actualización sin esperar a reabrir la app.
self.addEventListener('message', (event)=>{
  if(event.data === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});
