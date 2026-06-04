// Super Juampy POS — Service Worker
// Estrategias: CacheFirst para assets estáticos, NetworkFirst para páginas, NetworkOnly para API.

const STATIC_CACHE = 'pos-static-v1';
const PAGES_CACHE  = 'pos-pages-v1';
const MEDIA_CACHE  = 'pos-media-v1';

const ALL_CACHES = [STATIC_CACHE, PAGES_CACHE, MEDIA_CACHE];

// ── INSTALL: precachear páginas esenciales ─────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(PAGES_CACHE)
      .then(cache => cache.addAll(['/ventas', '/pos-login', '/manifest.json']))
      .catch(() => {})
  );
});

// ── ACTIVATE: limpiar caches viejos ───────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !ALL_CACHES.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo GET, solo mismo origen
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // API routes: siempre red, falla silenciosamente offline
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => new Response(JSON.stringify({ offline: true }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }))
    );
    return;
  }

  // Assets estáticos de Next.js con hash (inmutables)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Otros recursos de _next (RSC payloads, etc.) — network-first
  if (url.pathname.startsWith('/_next/')) {
    event.respondWith(networkFirst(request, PAGES_CACHE));
    return;
  }

  // Imágenes, fuentes e íconos
  if (/\.(png|jpe?g|gif|svg|ico|webp|woff2?|ttf|otf|eot)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, MEDIA_CACHE));
    return;
  }

  // Páginas HTML: network-first con fallback a caché
  event.respondWith(networkFirst(request, PAGES_CACHE));
});

// ── Estrategia: Cache First ───────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response(null, { status: 503 });
  }
}

// ── Estrategia: Network First ─────────────────────────────────────────────
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(null, { status: 503 });
  }
}
