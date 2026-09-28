// @ts-nocheck
/**
 * runde.tips service worker – offline fallback only.
 *
 * - Hashed assets: cache first (they never change).
 * - Pages: network first. Successful pages are kept (at most MAX_PAGES) so
 *   they can be shown offline; such a fallback is marked with
 *   `data-sw-fallback` on <body> and an `x-sw-fallback` header, and the page
 *   script shows an offline notice. Freshness is never traded for speed here:
 *   the network is always asked first.
 */
const VERSION = '__VERSION__';
const ASSETS = __ASSETS__;
const STATIC_CACHE = `static-${VERSION}`;
const PAGE_CACHE = 'pages-v1';
const MAX_PAGES = 40;
const NETWORK_TIMEOUT_MS = 10000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('static-') && k !== STATIC_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimPages(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_PAGES)).map((k) => cache.delete(k)));
}

function offlinePage() {
  const css = ASSETS.find((a) => a.endsWith('.css'));
  return new Response(
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline · runde.tips</title><link rel="stylesheet" href="${css}"></head>` +
      `<body data-sw-fallback><main id="main"><div class="page-head"><p class="eyebrow">runde.tips</p><h1>Keine Verbindung</h1></div>` +
      `<div class="empty"><p class="empty-title">Du bist offline</p><p>Diese Seite wurde auf diesem Gerät noch nicht geladen. Bitte versuche es erneut, sobald du wieder online bist.</p></div>` +
      `<p class="center"><a class="button" href="">Erneut versuchen</a></p></main></body></html>`,
    { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'x-sw-fallback': '1' } },
  );
}

async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  const key = request.url;
  try {
    const response = await fetch(request, { signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) });
    if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
      await cache.delete(key);
      await cache.put(key, response.clone());
      trimPages(cache);
    }
    return response;
  } catch {
    const cached = await cache.match(key);
    if (!cached) return offlinePage();
    const html = (await cached.text()).replace('<body', '<body data-sw-fallback');
    const headers = new Headers(cached.headers);
    headers.set('x-sw-fallback', '1');
    headers.delete('etag');
    return new Response(html, { status: 200, headers });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
    return;
  }
  if (request.mode === 'navigate' || request.headers.get('x-revalidate')) {
    event.respondWith(networkFirst(request));
  }
});
