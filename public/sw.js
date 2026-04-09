const CACHE = "electrizar-v1";
const ASSETS = [
  "/",
  "/index.html",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  // Solo cachear peticiones GET del mismo origen
  if (e.request.method !== "GET") return;
  if (!e.request.url.startsWith(self.location.origin)) return;
  // No cachear llamadas a Firebase ni a la API
  if (e.request.url.includes("firestore") ||
      e.request.url.includes("googleapis") ||
      e.request.url.includes("/api/")) return;

  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request);
      const fetchPromise = fetch(e.request)
        .then(res => { cache.put(e.request, res.clone()); return res; })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});