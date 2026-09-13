/* =========================================================
   sw.js — damit die App auch ohne Netz startet
   Version hochzählen, wenn du Dateien änderst.
   ========================================================= */

const VERSION = 'zettel-v10';
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
  './js/scan-engine.js',
  './js/scan-worker.js',
  './js/scanner.js',
  './vendor/zxing/zxing_reader.js',
  './vendor/zxing/zxing_reader.wasm',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      // Am Browser-Cache vorbei holen, sonst legt sich beim Einrichten
      // gleich wieder die alte Fassung in den neuen Cache.
      .then(c => Promise.all(FILES.map(f =>
        c.add(new Request(f, { cache: 'reload' })).catch(() => {}))))
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

  // Schriften: einmal holen, dann behalten. (Der Barcode-Leser liegt
  // seit v10 im Projekt und geht oben mit in den Schrank.)
  if (isFont(url)) {
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

  // Der Barcode-Leser: erst der Cache. Er ist fast ein Megabyte groß
  // und ändert sich nie — nur mit der Fassung oben, und die holt ihn
  // beim Einrichten ohnehin neu.
  if (url.origin === self.location.origin && url.pathname.includes('/vendor/')) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put(req, copy));
        }
        return res;
      }))
    );
    return;
  }

  // Eigene Dateien: erst das Netz, dann der Cache.
  //
  // Andersherum ging es schief. Die Seite selbst kommt frisch aus dem
  // Netz (siehe oben), die Skripte kamen aus dem Cache: neue Seite,
  // alter Code. Dann trug ein Knopf seinen eigenen Schlüssel als
  // Aufschrift und tat beim Antippen nichts, weil die Stelle, die
  // zuhört, erst in der neuen Fassung steht.
  //
  // Ohne Netz ändert sich nichts — dann antwortet weiterhin der Cache.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }))
    );
  }
});
