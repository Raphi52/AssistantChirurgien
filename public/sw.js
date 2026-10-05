// Service worker minimal : met en cache l'interface (les réponses ne sont jamais mises en cache).
const C = 'suivi-v9';
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(['/', '/manifest.webmanifest', '/icon.svg', '/consentements.js', '/prep.js']))));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || e.request.url.includes('/api/')) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
