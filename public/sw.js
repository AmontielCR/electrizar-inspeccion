// public/sw.js
// Service Worker manual para Electrizar PWA
// Se actualiza automáticamente cuando cambia CACHE_VERSION

const CACHE_VERSION = 'electrizar-v1';
const CACHE_NAME = CACHE_VERSION;

// Assets del app shell que se cachean al instalar
const APP_SHELL = [
  '/',
  '/index.html',
];

// ── INSTALL: cachear app shell ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  // Activa el SW inmediatamente sin esperar a que se cierren las tabs
  self.skipWaiting();
});

// ── ACTIVATE: eliminar cachés viejos ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Toma control de todas las tabs abiertas de inmediato
  self.clients.claim();
});

// ── FETCH: estrategia por tipo de petición ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Firebase, API de Vercel y googleapis → solo red (nunca cachear)
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.pathname.startsWith('/api/')
  ) {
    return; // El browser maneja normalmente
  }

  // Solo interceptar GET
  if (event.request.method !== 'GET') return;

  // Estrategia: Network First → si falla, caché → si no hay caché, index.html
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Si la respuesta es válida, guardarla en caché
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Sin red → buscar en caché
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Para navegación (HTML) → servir index.html desde caché
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Sin conexión', { status: 503 });
        });
      })
  );
});
