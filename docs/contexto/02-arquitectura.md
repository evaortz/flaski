# 02 · Arquitectura

Sin frameworks ni compilación: `index.html` carga `css/fonts.css`, `css/app.css` y `js/app.js` como módulo ES.
Todo lo demás se importa desde `app.js` con rutas relativas (`./x.js`). Las librerías de terceros van copiadas en
`js/vendor/` (no hay `npm` en la app; `tests/package.json` es solo para las pruebas).

## Raíz del repo

```
index.html            Esqueleto: cabecera, #main, barra #nav, #sheet (hojas/modales), #toast, inputs de archivo ocultos
manifest.webmanifest  PWA
sw.js                 Service worker (VERSION + lista SHELL)
css/app.css           Todos los estilos (tokens arriba)
css/fonts.css         @font-face de Atkinson Hyperlegible y General Sans (archivos en fonts/)
js/                   Módulos de la app (abajo)
js/vendor/            supabase.js (empaquetado), hanzi-writer.min.js, fzstd.js (Zstandard), pdfjs/ (carga diferida)
data/emoji.json       Datos del selector de emojis (emojibase, en español)
decks/                Mazos incluidos + index.json
img/onboarding/   Capturas reales (claro/oscuro) generadas por tests/capturas.spec.js
media/            Vídeo de Novedades y su portada (caché aparte del SW, «flaski-media-v1», con respuestas por trozos)
FORMATO-IA.md         Formato «por notas» para que una IA genere mazos (las pruebas validan sus ejemplos)
supabase/schema.sql   Esquema completo, idempotente
tests/                Pruebas (unit con node:test, e2e con Playwright) y servidor estático serve.mjs
licenses/, LICENSE    Licencias
```

## Módulos de `js/`

| Archivo | Qué hace |
|---|---|
| `app.js` (~880 líneas) | `go`/`render`/`navMe`, los manejadores globales de eventos (`click`/`submit`/`input`/`change`/teclado) y el arranque (`boot`) |
| `comun.js` | Estado único `S` y utilidades comunes (`$`, `esc`, `toast`, `fail`, ámbitos y contadores). **No importa ninguna pantalla**: así se evalúa siempre la primera |
| `pantallas/*.js` | Una por pantalla: `cuenta` (acceso, carga, bienvenida, sin conexión), `inicio`, `estudio` (caras y sesión), `mazos` (+ importar/exportar mazos), `explorar`, `apuntes` (editor por bloques + sugerencias), `perfil` (estadísticas, plan, ajustes, copias), `editor` (hojas, formularios, editor de tarjetas y tipos), `amigos`. Se importan entre sí lo que necesitan |
| `api.js` | Capa de datos: elige `backend-supabase.js` o `backend-local.js` según `config.js` (`configured`, `mode`) y reexporta la misma API |
| `backend-supabase.js` | Backend nube: cliente Supabase, escrituras encoladas con `outbox`, snapshot offline, RPCs de amigos, Storage de imágenes |
| `backend-local.js` | Backend local: todo en `localStorage` (`flaski-local-v1`), misma API que el de Supabase |
| `rows.js` | Conversión progreso app (ms) ↔ filas (ISO); `progressCols.extra` para columnas FSRS |
| `config.js` | URL y clave **publishable** de Supabase y `APP_NAME` (no copiar la clave en docs) |
| `srs.js` | Repaso: SM-2 simplificado o FSRS; `schedule`, `buildQueue`, `fmtWhen`, `GRADES`, `ALGO_PRESETS`, `DAY`, `startOfDay`, `dateKey` |
| `fsrs.js` | FSRS-5 (pesos por defecto, estabilidad/dificultad, retención deseada) |
| `prefs.js` | `DEFAULT_PREFS`, `mergePrefs`, `loadPrefs`, `algoFor`, `applyLook` (tema, acento, letra, tamaño, densidad), `ACCENTS`, `FONTS` |
| `stats.js` | Estadísticas: `computeStats`, `statsView` (HTML) y `drawStats` (gráficos que dependen del ancho), `PERIODS` |
| `charts.js` | Gráficos de Inicio: rachas, calendario de actividad (`heatmapView`, `HM_PERIODS`), **Tu progreso** (`progressSeries`, `progressView`, `initProgressHover`, `PG_PERIODS`, `nextLine`), cabecera viva (`liveShow`/`liveReset`), `maturity`, tooltips heredados (`initChartTips`) |
| `cardtypes.js` | Tipos de tarjeta, modos, plantillas, idiomas, corrección de respuestas, furigana, huecos, números, parejas, máscaras |
| `notes.js` | Formato `flaski-notes` (pegar lo que da una IA → tarjetas) |
| `csv.js` | Leer/escribir CSV |
| `anki.js` + `zip.js` + `sqlite.js` | Importar `.apkg`/`.colpkg` (ZIP + SQLite leídos a mano, Zstandard con `vendor/fzstd.js`) |
| `pages.js` | Modelo de apuntes: tipos de bloque, menú `/`, atajos, tablas Markdown, sangría, plegado, mover, buscar, `[[enlaces]]`, backlinks |
| `inline.js` | Formato en línea (Markdown + `<u>`, `<span style=color>`, `<mark>`, `==resaltado==`): parse, a HTML, a texto, a «runs», toggles |
| `liveedit.js` | Editor de un bloque con Markdown en vivo (contenteditable que se comporta como `<textarea>`) |
| `paste.js` | HTML pegado (Word, Docs, webs…) → bloques con formato |
| `notesio.js` | Exportar apuntes (Markdown+zip, `.docx`, HTML/PDF) e importar (docx, md, html, csv, zip) sin librerías |
| `pdf.js` | Importar PDF como apuntes (pdf.js en `vendor/pdfjs`, carga diferida) |
| `suggest.js` | Sugerir tarjetas a partir de un apunte, sin IA |
| `media.js` | Imágenes: IndexedDB + Supabase Storage (bucket privado `media`), compresión, subidas pendientes, `hydrate` |
| `outbox.js` | Cola de escrituras pendientes (reintenta 401/408/429/5xx y sin red; descarta rechazos de datos) |
| `snapshot.js` | Copia de los datos en IndexedDB para abrir sin conexión (modo nube) |
| `friends.js` | Códigos, enlaces de invitación, semana y clasificación |
| `feel.js` | Vibración, sonidos (Web Audio) y deslizar para valorar |
| `tts.js` | Voz del navegador (Web Speech API) |
| `handwriting.js` | Escribir a mano: Hanzi Writer y lienzo libre |
| `icons.js` | Iconos Lucide incluidos a mano (`icon(name, {size, cls})`); para uno nuevo se pega su SVG |
| `emoji-picker.js` | Selector de emojis |
| `onboarding.js` | Presentación de bienvenida (`openOnboarding`) |
| `news.js` | Novedades (`openNews`, `NEWS_VERSION`, `NEWS_ALWAYS`) |
| `org.js` | Carpetas, etiquetas, colores, orden y filtros (puro) |

Los módulos marcados «sin dependencias de la interfaz» en su cabecera se prueban en `tests/unit`.

## Capa de datos

- `api.js` hace `await import()` del backend adecuado. Ambos exponen: `auth`, `loadAll`, `saveProfile`,
  `saveSettings`, `saveProgress(Many)`, `clear(Many)Progress`, `saveLog`/`bumpLog`/`mergeLog`, `add(Events)`/`deleteEvent`,
  CRUD de `Deck`, `Card(s)`, `Folder`, `Tag`, `Type`, `Page`, `publicDecks`/`getPublicDeck`, `dumpLocal`/`restoreLocal`,
  `offline`, `imageStore`, `social`.
- `app.js` nunca habla con Supabase directamente: siempre `api.*`.
- Modo nube: las escrituras pasan por `outbox` (se aplican ya en `S` y se envían cuando hay red); `S.pending` cuenta
  lo pendiente y la cabecera muestra `#net`. Al arrancar sin red se usa el snapshot (`S.fromCache`).
- El contador diario usa la RPC atómica `bump_review_log` para que dos dispositivos no se pisen.

## Estado y renderizado (`app.js`, `comun.js` y `pantallas/`)

- Entre módulos solo se importan funciones y constantes: un `let` no se puede reasignar desde otro archivo
  (para eso, un setter de una línea, como `setImportInto`). En el código de primer nivel de una pantalla (lo que se
  ejecuta al cargarla) usa solo cosas de `comun.js` o de librerías, nunca constantes de otras pantallas.

- **Estado único `S`**: `uid`, `decks`/`folders`/`tags`/`types`/`cards`/`pages` (Maps por id), `progress` (cardId → srs
  en ms), `log` (`YYYY-MM-DD` → repasos), `events` (cada respuesta), `prefs`, `stats` (filtros), `view`, `deckId`,
  `pageId`, `session` (cola de estudio), `org`/`noteOrg` (filtros), `friends`, `fromCache`, `pending`…
- **Navegación**: `go(view, extra)` asigna en `S`, cierra hojas/menús y llama a `render()`, que despacha a
  `renderHome`, `renderStudy`, `renderDecks`, `renderDeck`, `renderExplore`, `renderNotes`, `renderPage`,
  `renderProfile`, `renderFriends`, `renderStats`, `renderSettings`. Cada `render*` escribe `main.innerHTML` con
  plantillas de texto (escapar siempre con `esc()`; formato con `fmt()` → `inline.toHTML`).
- Gráficos que dependen del ancho se dibujan después en un host (`drawHeatmap`, `drawReviews`/Tu progreso,
  `drawStats`) y se redibujan en `resize`.
- **Delegación de eventos**: pocos `document.addEventListener('click' | 'input' | 'change' | 'keydown')` globales.
  Los botones llevan `data-act="..."` (gran `switch (ds.act)`), `data-nav="vista"`, `data-pref="ruta.del.pref"`,
  `data-grade`, `data-open`, `data-card`, `data-accent`… No se ponen listeners por elemento al pintar.
- **Hojas**: `openSheet(html, { full })` / `closeSheet()` sobre `#sheet`; avisos con `toast(msg)`; errores con `fail(e)`/`errMsg`.
- **Preferencias**: `S.prefs` (de `DEFAULT_PREFS` + guardado). Los controles de Ajustes usan `data-pref`; al cambiar se
  llama `prefChanged(path)` (aplica apariencia, redibuja lo necesario) y `savePrefsSoon()` (guarda en
  `settings.prefs` o en el navegador). La apariencia también se guarda en `localStorage` (`flaski-look`) para aplicarla
  antes de cargar datos.
- Imágenes: un `MutationObserver` llama a `hydrate(document)` tras cada pintado.

## Service worker (`sw.js`)

- `VERSION = 'flaski-vNN'` (subir en cada cambio de archivos servidos) y `SHELL` con todo lo que la app necesita para
  arrancar sin red (incluidas las fuentes `.woff2`). `tests/unit/sw.test.js` falla si falta un módulo importado.
- Estrategia: archivos propios **red primero**, caché si falla; trazos de kanji de jsDelivr en caché aparte
  (`flaski-strokes-v1`), nunca se borran. Las e2e bloquean el SW (`serviceWorkers: 'block'`).

## Tipografía (`css/fonts.css` + tokens)

- `--font`: **Atkinson Hyperlegible** (400/700, normal e itálica, latin y latin-ext) para todo el texto.
- `--font-head`: **General Sans** (500/600/700) para títulos y para la interfaz de paneles y gráficos
  (`.hero-num`, `.chart-h`, `.kpi`, `.lv-*`, ejes, leyendas…).
- `--font-native`: pila del sistema (opción «La del dispositivo» para las tarjetas). `--mono` para código.
- `--card-font` / `--card-scale` los fija `applyLook` según Ajustes → Apariencia.

## CSS (`css/app.css`)

- Arriba, tokens en `:root` (estilo Notion): `--bg`, `--surface`, `--soft`, `--hover`, `--press`, `--fg`, `--muted`,
  `--faint`, `--line`, `--line-strong`, `--accent`/`--accent-hover`/`--accent-fg`, etiquetas `--tag-*`, resaltados
  `--hl-*`, colores de mazos `--c-*`/`--d1..6`, `--fc`/`--fc-today`, `--r: 6px`, `--nav-h`.
- **Modo oscuro**: `@media (prefers-color-scheme: dark)` con `:root:not([data-theme="light"])` y `:root[data-theme="dark"]`
  (mismos valores repetidos). `data-theme` lo pone `applyLook`.
- **Acento**: `:root[data-accent="blue|indigo|…"]{--accent:…}` (14 colores); `--accent-hover` con `color-mix`.
- Después, secciones por componente (`/* ===== … ===== */`, `/* ---------- … ---------- */`): organización, emojis,
  editor de tarjetas, estudio, estadísticas, apuntes, bienvenida, amigos, tablas, formato, sugerencias, gráficos de
  Inicio. Lo más reciente se añade al final y puede sobrescribir reglas anteriores: buscar antes de duplicar.
- Componentes reutilizables: `.primary`, `.ghost`, `.link`, `.iconbtn`, `.small-btn`, `.seg` (segmentado),
  `.fchip`, `.panel`, `.sheet`, `.row-link`, `.btnrow`, `.muted`, `.small`.

## Supabase (`supabase/schema.sql`)

Tablas (todas con RLS: cada usuario solo ve lo suyo, salvo mazos públicos y resúmenes de amigos):
`profiles` (nombre, trigger al registrarse), `decks` (incl. `is_public`, opciones), `folders`, `tags`, `cards`
(campos, tipo, plantilla, `note_id`, `page_id`/`block_id`), `note_types`, `progress` (srs + `stability`/`difficulty`),
`review_log` (repasos por día), `settings` (`new_per_day`, `prefs` jsonb), `review_events` (cada respuesta: grade,
state, ivl, last_ivl, ease, ms), `pages` (bloques jsonb), `social` (código, compartir), `friendships`, `cheers`.
Funciones: `bump_review_log`, `are_friends`, `my_social`, `set_share`, `request_friend`, `respond_friend`,
`remove_friend`, `block_friend`, `unblock_friend`, `friend_requests`, `streak_of`, `friend_summary`, `send_cheer`,
`my_cheers`. Storage: bucket privado `media` (carpeta por usuario). Cambios: idempotentes y ejecutados a mano.

## Pruebas (`tests/`)

- `tests/unit/*.test.js` (node:test): anki, cardtypes, csv, feel, friends, fsrs, inline, media, notes, notesio, org,
  outbox, pages, pdf, srs, suggest, sw. Fixtures binarios generados en `anki-fixture.js` y `pdf-fixture.js`.
- `tests/e2e/*.spec.js` (Playwright, proyectos `movil` = Pixel 7 y `escritorio` = 1280×800, `es-ES`,
  `Europe/Madrid`): alemán, amigos, anki, apuntes, bienvenida, bloques, datos, estudio, exportar, formato, furigana,
  ia, inicio, novedades, pantallas, sin-conexion, sugerencias, tipos, tipos-nuevos.
- `tests/e2e/fixtures.js`: `test` extendido (config local, sin red externa, sin presentación/novedades salvo
  `test.use({ intro: true })`, falla con errores JS), `openApp`, `nav`, `answer`, `createDeck`, `addBasicCards`…
- `tests/e2e/nube.js`: `mockCloud(page)` simula Supabase (sesión falsa y REST en memoria, interruptor de red).
- `tests/capturas.spec.js` y `tests/novedades.spec.js` con `capturas.config.js` (puerto 8124, 390×760 @2x): generan
  las imágenes de bienvenida y novedades.
