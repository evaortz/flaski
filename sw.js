// Service worker: guarda la app para que abra rápido y sin conexión.
// Cuando cambies cualquier archivo de la app, sube el número de versión
// para que los móviles descarguen la versión nueva.
const VERSION = 'flaski-v184';
const STROKES = 'flaski-strokes-v1';
const FONTS = 'flaski-fonts-v1';
// El vídeo de Novedades (y su portada) va en su propia caché: no cambia entre versiones, así que se baja una
// vez y no con cada versión nueva. Si cambia el vídeo, sube MEDIA.
const MEDIA = 'flaski-media-v1';
const MEDIA_FILES = ['./media/flaski-lo-nuevo-720x1280.mp4', './media/portada.jpg'];
const isMedia = u => u.origin === location.origin && u.pathname.startsWith(new URL('./media/', self.registration.scope).pathname);
const SHELL = [
  './',
  './index.html',
  './css/app.css', './css/fonts.css',
  './fonts/atkinson-400-latin.woff2', './fonts/atkinson-400-latin-ext.woff2', './fonts/atkinson-700-latin.woff2', './fonts/atkinson-700-latin-ext.woff2',
  './fonts/atkinson-400-italic-latin.woff2', './fonts/atkinson-400-italic-latin-ext.woff2', './fonts/atkinson-700-italic-latin.woff2', './fonts/atkinson-700-italic-latin-ext.woff2',
  './fonts/gochi-hand-400-latin.woff2', './fonts/flaski-uno.woff2', './fonts/inter-latin.woff2', './fonts/inter-latin-ext.woff2', 
  './js/app.js',
  './js/comun.js', './js/pantallas/cuenta.js', './js/pantallas/inicio.js', './js/pantallas/estudio.js', './js/pantallas/mazos.js', './js/pantallas/biblioteca.js', './js/pantallas/explorar.js', './js/pantallas/apuntes.js', './js/pantallas/apuntes-tablas.js', './js/pantallas/apuntes-ayuda.js', './js/pantallas/sugerencias.js', './js/pantallas/perfil.js', './js/pantallas/editor.js', './js/pantallas/amigos.js', './js/pantallas/pruebas.js', './js/pantallas/mapa.js', './js/pantallas/apuntes-repaso.js', './js/pantallas/plan.js', './js/pantallas/simulacro.js', './js/pantallas/papelera.js', './js/pantallas/borrar-cuenta.js',
  './js/api.js', './js/push.js', './js/plan.js',
  './js/srs.js',
  './js/tanda.js',
  './js/atrasos.js',
  './js/prefs.js',
  './js/stats.js',
  './js/rows.js', './js/modo.js',
  './js/csv.js',
  './js/charts.js',
  './js/org.js',
  './js/emoji-picker.js',
  './js/cardtypes.js',
  './js/tts.js',
  './js/handwriting.js',
  './js/icons.js', './js/dibujos.js', './js/primera-vez.js',
  './temas/constitucion-titulo-preliminar.md', './temas/por-que-se-te-olvidan-las-cosas.md',
  './js/vendor/hanzi-writer.min.js',
  './js/vendor/supabase.js',
  './js/outbox.js',
  './js/snapshot.js',
  './js/notes.js',
  './js/pages.js', './js/mapa.js', './js/entender.js',
  './js/feel.js',
  './js/media.js',
  './js/anki.js',
  './js/friends.js',
  './js/fsrs.js',
  './js/suggest.js', './js/inline.js', './js/liveedit.js', './js/paste.js', './js/notesio.js', './js/news.js',
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
  './icons/favicon.svg', './icons/favicon-32.png', './icons/flaski-icono-180.png',
  './icons/flaski-icono-192.png', './icons/flaski-icono-512.png', './icons/flaski-icono-maskable-192.png', './icons/flaski-icono-maskable-512.png', './icons/flaski-icono.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(Promise.all([caches.open(VERSION).then(c => c.addAll(SHELL)), saveMedia()]).then(() => self.skipWaiting()));
});
// Lo que falte del vídeo se guarda; si no se puede (sin conexión), la app se instala igual
const saveMedia = () => caches.open(MEDIA).then(c => Promise.all(MEDIA_FILES.map(async f => {
  if (await c.match(f)) return;
  const res = await fetch(f, { cache: 'no-cache' });
  if (res.status === 200) await c.put(f, res);
}))).catch(() => {});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== STROKES && k !== FONTS && k !== MEDIA).map(k => caches.delete(k))))
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

// Klee One (Google Fonts): su hoja de estilos, primero la red y si falla la guardada; los archivos de la
// fuente no cambian, así que se guardan la primera vez y desde entonces funcionan sin conexión.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.hostname === 'fonts.googleapis.com' && u.search.includes('Klee+One')) {
    e.respondWith(caches.open(FONTS).then(c => fetch(e.request)
      .then(res => { if (res.ok) c.put(e.request, res.clone()); return res; })
      .catch(() => c.match(e.request).then(r => r || Response.error()))));
  } else if (u.hostname === 'fonts.gstatic.com' && u.pathname.startsWith('/s/kleeone/')) {
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok || res.type === 'opaque') c.put(e.request, res.clone());
      return res;
    }));
  }
});

// El vídeo: de su caché (o de la red la primera vez). Los navegadores lo piden por trozos («Range»): se
// responde con el trozo pedido, que es lo que Safari necesita para reproducirlo.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || !isMedia(u)) return;
  e.respondWith((async () => {
    const c = await caches.open(MEDIA), key = new URL(u.pathname, location.origin).href;
    let res = await c.match(key);
    if (!res) {
      // Sin copia: a la red tal cual (con su «Range»), y se guarda entero aparte
      fetch(key, { cache: 'no-cache' }).then(r => r.status === 200 && c.put(key, r)).catch(() => {});
      return fetch(e.request);
    }
    const range = /bytes=(\d*)-(\d*)/.exec(e.request.headers.get('range') || '');
    if (!range) return res;
    const buf = await res.arrayBuffer(), size = buf.byteLength;
    let a = range[1] === '' ? size - Number(range[2]) : Number(range[1]);
    let z = range[1] === '' || range[2] === '' ? size - 1 : Math.min(size - 1, Number(range[2]));
    a = Math.max(0, a);
    if (a > z) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    return new Response(buf.slice(a, z + 1), { status: 206, headers: {
      'Content-Type': res.headers.get('Content-Type') || 'video/mp4', 'Content-Range': `bytes ${a}-${z}/${size}`,
      'Content-Length': String(z - a + 1), 'Accept-Ranges': 'bytes',
    } });
  })());
});

// Archivos de la propia app: primero la red (para tener siempre lo último), si falla, la copia guardada.
// A la red se pregunta siempre (cache: 'no-cache'): una copia vieja en la caché del navegador mezclaría
// módulos de dos versiones. Todo lo demás (Supabase, otras fuentes, librerías) va directo a la red.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || isMedia(url)) return;
  // (una petición de navegación no se puede copiar con opciones: se pide por su dirección)
  const fresh = e.request.mode === 'navigate' ? fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(e.request, { cache: 'no-cache' });
  e.respondWith(
    fresh
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

// Recordatorio diario: el aviso llega aunque la app esté cerrada (ver js/push.js)
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Flaski', {
    body: d.body || 'Tienes tarjetas por repasar.', tag: d.tag || 'flaski', renotify: false,
    icon: './icons/flaski-icono-192.png', badge: './icons/favicon-32.png', data: { url: d.url || './' },
  }));
});
// Al tocar el aviso: la app, si ya está abierta; si no, se abre
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    return open ? open.focus() : self.clients.openWindow(url);
  }));
});
