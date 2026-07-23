/* مع القرآن — service worker
 * Caches ONLY the app shell (the page itself + manifest + icons), so the app
 * opens with WiFi off. It deliberately does NOT touch the Qur'an content —
 * verse pages (quran.com / quran.foundation), recitations (everyayah.com) and
 * fonts are cross-origin and are handled by the app's own "Offline Downloads"
 * (IndexedDB). Those requests pass straight through untouched.
 *
 * Paths below are resolved relative to this file's own location, so this
 * works whether the site lives at a domain root (https://example.com/) or in
 * a subfolder (https://user.github.io/repo/) — no editing needed either way.
 */
const CACHE = 'maa-alquran-shell-v4';
const ROOT = new URL('./', self.location).href;   // e.g. https://user.github.io/repo/
const PAGE_URL = ROOT;                              // the app's start page
const SHELL = [
  ROOT,
  ROOT + 'manifest.json',
  ROOT + 'icons/icon-192.png',
  ROOT + 'icons/icon-512.png',
  ROOT + 'icons/icon-maskable-512.png',
  ROOT + 'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // allSettled so one missing file never aborts the whole install
    await Promise.allSettled(SHELL.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    // Tell all open tabs a new version just activated
    const clients = await self.clients.matchAll({type:'window'});
    clients.forEach(c => c.postMessage({type:'NEW_VERSION'}));
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only ever handle our own origin. Qur'an CDNs, audio and fonts are left alone
  // so the app's online fetches and IndexedDB offline cache work normally.
  if (url.origin !== self.location.origin) return;

  // Page loads: network-first (so updates show when online), fall back to the
  // cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        /* cache:'no-store' bypasses the browser's own HTTP cache. Without it
           "network-first" can still be answered from Chrome's disk cache, so
           an updated index.html never reaches the user (Edge/Firefox happened
           to revalidate and updated; Chrome kept serving the stale page). */
        const fresh = await fetch(req, {cache: 'no-store'});
        const cache = await caches.open(CACHE);
        cache.put(PAGE_URL, fresh.clone()).catch(() => {});
        return fresh;
      } catch (e) {
        const cached = await caches.match(PAGE_URL);
        return cached || Response.error();
      }
    })());
    return;
  }

  // Same-origin assets (manifest, icons): cache-first.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, fresh.clone()).catch(() => {});
      return fresh;
    } catch (e) {
      return cached || Response.error();
    }
  })());
});
