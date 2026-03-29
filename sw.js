/**
 * ExpensioAPP — Service Worker v2.3.0
 * HTML pages are NEVER cached — always fetched fresh from network
 * Only static assets (icons, fonts, CDN scripts) are cached
 */

const CACHE_VERSION = 'expensio-v3.0.0';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const FONT_CACHE    = `${CACHE_VERSION}-fonts`;

// Only cache icons and offline page — NEVER cache index.html or /
const PRECACHE_URLS = [
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/maskable-512x512.png',
  '/offline.html'
];

const FONT_ORIGINS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const AI_HOSTS = [
  'generativelanguage.googleapis.com',
  'api.groq.com',
  'openrouter.ai',
  'api.anthropic.com'
];

// ─── INSTALL ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Pre-cache failed:', err))
  );
});

// ─── ACTIVATE ─────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('expensio-') && key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== FONT_CACHE)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH ────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome extensions
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // AI API calls — Network Only, never cache
  if (AI_HOSTS.some(h => url.hostname.includes(h))) {
    event.respondWith(fetch(request).catch(() => new Response(
      JSON.stringify({ error: 'Offline — AI requires internet' }),
      { headers: { 'Content-Type': 'application/json' } }
    )));
    return;
  }

  // HTML pages — ALWAYS fetch fresh from network, never cache
  if (request.headers.get('accept')?.includes('text/html') || 
      url.pathname === '/' || 
      url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request).catch(() => 
        caches.match('/offline.html').then(r => r || new Response('<h1>Offline</h1>', {headers:{'Content-Type':'text/html'}}))
      )
    );
    return;
  }

  // Google Fonts — Cache First
  if (FONT_ORIGINS.some(o => url.hostname.includes(o))) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // CDN scripts — Cache First
  if (url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
    return;
  }

  // Icons and static assets — Cache First
  if (url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Everything else — Network First
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

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
    return new Response('Offline', { status: 503 });
  }
}
