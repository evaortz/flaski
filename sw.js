// Service worker: guarda la app para que abra rápido y sin conexión.
// Cuando cambies cualquier archivo de la app, sube el número de versión
// para que los móviles descarguen la versión nueva.
const VERSION = 'flaski-v51';
const STROKES = 'flaski-strokes-v1';
const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/api.js',
  './js/srs.js',
  './js/prefs.js',
  './js/stats.js',
  './js/rows.js',
  './js/csv.js',
  './js/charts.js',
  './js/org.js',
  './js/emoji-picker.js',
  './js/cardtypes.js',
  './js/tts.js',
  './js/handwriting.js',
  './js/icons.js',
  './js/vendor/hanzi-writer.min.js',
  './js/vendor/supabase.js',
  './js/outbox.js',
  './js/snapshot.js',
  './js/notes.js',
  './js/pages.js',
  './js/feel.js',
  './js/media.js',
  './js/anki.js',
  './js/friends.js',
  './js/fsrs.js',
  './js/suggest.js', './js/inline.js', './js/liveedit.js', './js/paste.js', './js/notesio.js',
  './js/pdf.js',
  './js/zip.js',
  './js/sqlite.js',
  './js/vendor/fzstd.js',
  './js/onboarding.js',
  './FORMATO-IA.md',
  './data/emoji.json',
  './js/backend-local.js',
  './js/backend-supabase.js',
  './decks/index.json',
  './js/config.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== STROKES).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Trazos de kanji/hanzi (jsDelivr): nunca cambian, así que se guardan la primera vez
// y desde entonces funcionan sin conexión.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method === 'GET' && u.hostname === 'cdn.jsdelivr.net' && u.pathname.includes('hanzi-writer-data')) {
    e.respondWith(caches.open(STROKES).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
  }
});

// Archivos de la propia app: primero la red (para tener siempre lo último), si falla, la copia guardada.
// Todo lo demás (Supabase, fuentes, librerías) va directo a la red.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
