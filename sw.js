/* =========================================================
   sw.js — damit die App auch ohne Netz startet
   Version hochzählen, wenn du Dateien änderst.
   ========================================================= */

const VERSION = 'zettel-v7';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

const FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/store.js',
  './js/i18n.js',
  './js/search.js',
  './js/off.js',
  './js/ean.js',
  './js/scanner.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      .then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isFont(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Nährwert-Abfragen nie aus dem Cache beantworten
  if (url.hostname.endsWith('openfoodfacts.org')) return;

  // Seitenaufruf: erst Netz, sonst der gespeicherte Zettel
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  // Schriften und die Barcode-Bibliothek: einmal holen, dann behalten
  if (isFont(url) || url.hostname === 'unpkg.com' || url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.match(req).then(hit => {
        if (hit) return hit;
        return fetch(req).then(res => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(RUNTIME).then(c => c.put(req, copy));
          }
          return res;
        }).catch(() => new Response('', { status: 504, statusText: 'offline' }));
      })
    );
    return;
  }

  // Eigene Dateien: Cache zuerst, im Hintergrund auffrischen
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then(hit => {
        const net = fetch(req).then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then(c => c.put(req, copy));
          }
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
});
