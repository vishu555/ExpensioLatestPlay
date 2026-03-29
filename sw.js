/**
 * ExpensioAPP — Service Worker
 * Strategy: Cache-First for static assets, Network-First for API calls
 * Enables full offline functionality after first load
 */

const CACHE_VERSION = 'expensio-v2.2.0'; // bumped to evict old cached index.html
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const FONT_CACHE    = `${CACHE_VERSION}-fonts`;

// Core app shell — cached on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/maskable-512x512.png',
  '/offline.html'
];

// CDN assets to cache on first fetch
const CDN_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'
];

// Font origins to cache
const FONT_ORIGINS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// ─── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing', CACHE_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Pre-cache failed (some URLs may not exist yet):', err))
  );
});

// ─── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('expensio-') && key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== FONT_CACHE)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and Chrome extensions
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // AI API calls — Network Only (never cache sensitive data)
  if (isAIApiCall(url)) {
    event.respondWith(fetch(request).catch(() => new Response(
      JSON.stringify({ error: 'Offline — AI insights require internet connection' }),
      { headers: { 'Content-Type': 'application/json' } }
    )));
    return;
  }

  // Google Fonts — Cache First (stale-while-revalidate)
  if (FONT_ORIGINS.some(o => url.hostname.includes(o))) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // CDN scripts — Cache First
  if (url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
    return;
  }

  // App shell (HTML pages) — Always Network (never cache index.html so fixes deploy instantly)
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline.html').then(r => r || caches.match(request)))
    );
    return;
  }

  // Everything else — Cache First
  event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
});

// ─── STRATEGIES ───────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirstWithFallback(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Return offline page
    const offlinePage = await caches.match('/offline.html');
    if (offlinePage) return offlinePage;

    return new Response('<h1>You are offline</h1><p>Please reconnect to use ExpensioAPP.</p>', {
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

function isAIApiCall(url) {
  const aiHosts = [
    'generativelanguage.googleapis.com',
    'api.groq.com',
    'openrouter.ai',
    'api.anthropic.com'
  ];
  return aiHosts.some(h => url.hostname.includes(h));
}

// ─── BACKGROUND SYNC ──────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-expenses') {
    console.log('[SW] Background sync: expenses');
    // Future: sync to cloud backup
  }
});

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  const title = data.title || 'ExpensioAPP';
  const options = {
    body: data.body || 'Check your spending insights!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: 'expensio-notification',
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Open App', icon: '/icons/icon-72x72.png' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ─── MESSAGE HANDLER ──────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') {
    event.source.postMessage({ type: 'VERSION', version: CACHE_VERSION });
  }
});
