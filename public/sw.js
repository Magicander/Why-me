/* Why Me? service worker: app shell cache-first, API network-first with cached fallback. */
const VERSION = 'whyme-v6';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest', '/fonts/fraunces-latin.woff2',
  '/assets/why.svg', '/assets/me.svg', '/assets/deck.svg', '/assets/play.svg', '/assets/done.svg', '/assets/failed.svg', '/assets/arrow.svg',
  '/packs/random.svg', '/packs/own.svg', '/packs/legless-lizard.png', '/packs/eight-legged-octopus.png', '/packs/plain-pack.svg', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png',
  '/api/packs', '/api/config'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/admin') || url.pathname.startsWith('/admin')) return;
  const networkFirst = url.pathname.startsWith('/api/') || e.request.mode === 'navigate' || /\.(js|css|html)$/.test(url.pathname);
  if (networkFirst) {
    e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); } return r; })
      .catch(() => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('/index.html') : Response.error()))));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
    if (r.ok) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); } return r; })));
});
// cache pack images when the packs list is refreshed
self.addEventListener('message', e => { if (e.data && e.data.cacheUrls) caches.open(VERSION).then(c => c.addAll(e.data.cacheUrls).catch(() => {})); });
