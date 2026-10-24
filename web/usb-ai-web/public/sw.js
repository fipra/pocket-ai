const CACHE = 'usb-ai-web-shell-v2';
const SHELL = ['__BASE__', '__BASE__manifest.webmanifest', '__BASE__icon.svg', ...__PRECACHE__];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(Promise.all([self.clients.claim(), caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))])); });
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (request.mode === 'navigate') {
      try { const response = await fetch(request); if (response.ok) await cache.put('__BASE__', response.clone()); return response; }
      catch { return await cache.match('__BASE__') || Response.error(); }
    }
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && (new URL(request.url).pathname.startsWith('__BASE__assets/') || new URL(request.url).pathname.startsWith('__BASE__wasm/'))) await cache.put(request, response.clone());
    return response;
  })());
});
