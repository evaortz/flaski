# 01 · Producto: qué es Flaski

Flaski (antes «Kartlar») es una app web instalable (PWA) en español para **estudiar con tarjetas y repaso espaciado**
y para **tomar apuntes por bloques** de los que salen tarjetas. Pensada primero para el móvil, funciona también en
escritorio y sin conexión. Público: la persona usuaria y su grupo de amigos (cuentas en Supabase, plan gratuito).

Dos modos según `js/config.js`:
- **Nube** (con datos de Supabase): cuentas, sincronización entre dispositivos, amigos, mazos públicos.
- **Local** (sin datos): todo en `localStorage`/IndexedDB del navegador; es el modo de las pruebas.

## Navegación (barra inferior, `index.html`)

| Botón | Vista (`S.view`) | Contenido |
|---|---|---|
| Estudiar | `home` | Inicio: lo que toca hoy, botón de estudiar, «10 nuevas más», paneles y gráficos |
| Mis mazos | `decks`, `deck` | Mazos en carpetas, etiquetas, filtros, orden, lista/cuadrícula; vista de un mazo con sus tarjetas |
| Apuntes | `notes`, `page` | Lista de apuntes (carpetas, etiquetas, orden) y el editor de un apunte |
| Explorar | `explore` | Mazos incluidos (`decks/`) y mazos públicos de la comunidad; «Añadir a mis mazos» copia |
| Perfil | `profile` → `friends`, `settings`, `stats` | Nombre, Amigos, Ajustes, Estadísticas, Novedades, ver la presentación, sesión |

`study` es la sesión de estudio a pantalla completa (sin barra inferior).

## Inicio (`renderHome` en `app.js`, gráficos en `js/charts.js`)

- Resumen de hoy: pendientes, nuevas, botón principal de estudiar, aviso si el límite de repasos deja tarjetas fuera.
- **Actividad**: calendario tipo GitHub en el color del tema, con periodos (pestañas) y rachas.
- **Racha** y **meta diaria** (Ajustes → Inicio → Meta diaria).
- **Tu progreso** (en desarrollo, sustituye a «Tu ritmo» / «Tus tarjetas»): bandas apiladas de cuántas tarjetas te sabes
  a lo largo del tiempo y lo que toca los próximos días. Ver `03-diseno.md`.
- **Tus mazos** y resumen de **amigos** (clasificación semanal).
- Cada panel se puede ocultar en Ajustes → Inicio (`prefs.home`).

## Estudio

- Valoración: Otra vez / Difícil / Bien / Fácil (o 2 botones), intervalo bajo cada botón, teclado (Espacio, 1-4),
  deslizar la tarjeta para valorar en el móvil, vibración y sonidos suaves (`js/feel.js`), deshacer.
- Estudiar un mazo, una carpeta, una etiqueta, todos, o un apunte / un apartado de un apunte.
- «Ver en los apuntes» desde una tarjeta vinculada a un bloque.
- Algoritmo: **FSRS-5** por defecto (`js/fsrs.js`, retención deseada configurable) o SM-2 clásico con presets y
  parámetros propios (`js/srs.js`, `ALGO_PRESETS`); cada mazo puede tener su preset.
- Límites diarios: nuevas por día, repasos máximos, orden de nuevas, mezcla nuevas/repasos.
- Audio con la voz del navegador (`js/tts.js`), autoplay por campo, velocidad.

## Tipos de tarjeta (`js/cardtypes.js`)

Un **tipo** tiene campos y plantillas; cada plantilla genera una tarjeta con un **modo**:
dar la vuelta, escribir la respuesta (corrección letra a letra, varias válidas con `/`), opción múltiple, huecos `{{ }}`
(con pista `{{de::lugar}}`), escribir a mano (kanji/hanzi trazo a trazo con Hanzi Writer; lienzo libre para otros
alfabetos), dictado, ordenar piezas, clasificar en grupos, hueco con opciones, respuesta numérica (con margen),
conjugar (tabla persona → forma), emparejar, tapar partes de una imagen (una tarjeta por recuadro).

Tipos incluidos: Básica, Doble sentido, Escribir la respuesta, Huecos, Opción múltiple, Escribir a mano, Verdadero o
falso, Clasificar, Hueco con opciones, Ordenar los pasos, Respuesta numérica, Emparejar, Tapar partes de una imagen,
Vocabulario, Conjugación, Dictado, Ordenar frase, Sustantivo alemán (der/die/das), Kanji… Se agrupan por idioma del
mazo (el editor propone solo los que encajan). Tipos propios: «Gestionar tipos» → Personalizar o + Tipo nuevo; viajan
con el mazo al compartirlo. Furigana `漢字[かんじ]`, imágenes `![pie](img:ID)`, pistas y etiquetas por tarjeta.
En alemán cuentan mayúsculas y ß/ss se acepta como «casi».

## Mazos

- Carpetas anidadas, etiquetas de colores, icono (selector completo de emojis) y color, fijar, archivar.
- Crear varias tarjetas pegando una lista; vista previa en directo en el editor.
- **Importar**: CSV/TSV (detecta separador y cabeceras, también exportaciones de Anki como texto), copia Flaski
  `.flaski.json` (y `.kartlar.json`), formato por notas `flaski-notes` (pensado para IAs, documentado en
  `FORMATO-IA.md`), **Anki `.apkg`/`.colpkg`** (con progreso, historial e imágenes; sin audios).
- **Pegar** lo que devuelve una IA, con vista previa de cuántas tarjetas salen y qué notas se saltan.
- **Exportar/compartir**: CSV (punto y coma), archivo Flaski, hacerlo público (Explorar + enlace directo).
- Mazos incluidos: japonés de demostración, alemán A2, turco (`decks/index.json`).

## Apuntes (`js/pages.js`, `js/liveedit.js`, `js/inline.js`, `renderPage` en `app.js`)

- Página = lista de bloques: párrafo, títulos h1–h3, lista, lista numerada, casilla, cita, destacado (callout), código,
  tabla, imagen, separador. Menú `/` o «+ Bloque», atajos Markdown al escribir (`# `, `- `, `1. `…).
- **Formato en Markdown con vista en directo**: las marcas (`**`, `<u>`…) solo se ven donde está el cursor.
  Negrita, cursiva, subrayado, tachado, código, resaltado, colores de texto y de fondo, enlaces.
- **Barra de formato** al seleccionar texto, con «Crear tarjeta» y «Hueco» (la tarjeta queda unida al bloque).
- **Bloques**: asa para arrastrar y menú de opciones, selección múltiple (Esc, Mayús+clic, arrastrar, Ctrl+A),
  duplicar, borrar, convertir, **sangría** y **plegar**; deshacer/rehacer en todo el apunte.
- **Enlaces `[[Título]]`** entre apuntes, con autocompletado y renombrado.
- **Buscar y reemplazar** (Ctrl+F / Ctrl+H) e **índice** (TOC) a la derecha en pantallas anchas o en un menú.
- **Tablas como una hoja de cálculo**: cuadrícula celda a celda, asas de fila/columna con menú, + para añadir,
  ordenar, alinear, celdas que crecen; se guardan en Markdown.
- Pegar con formato desde Word, Google Docs, webs, ChatGPT… (`js/paste.js`).
- Estado por partes (colores según cómo llevas las tarjetas de cada parte), estudiar el apunte o un apartado, chuleta.
- **Importar**: Word `.docx`, PDF (títulos, listas, tablas con o sin cuadrícula, quita cabeceras/pies, páginas
  escaneadas como imagen), Markdown, HTML, CSV, `.zip` de Markdown (de otras apps o de Flaski), imágenes.
- **Exportar**: Word, PDF (vía HTML imprimible), Markdown con imágenes en `.zip`, HTML; todos los apuntes a la vez.
- Ayuda «Formato y atajos» con pestañas, buscador y teclas de Mac.

## Sugerencias de tarjetas sin IA (`js/suggest.js`)

Analiza la estructura del apunte (definiciones, negritas, tablas, listas con título, fechas, vocabulario, pasos,
conjugaciones, siglas…) y propone tarjetas del tipo que mejor encaja, con confianza (las altas salen marcadas),
filtros por tipo, editor de cada sugerencia, de dónde sale cada una, descartar, actualizar y consejos para escribir
apuntes que den mejores sugerencias.

## Estadísticas (`js/stats.js`)

Filtros por periodo (7 días, 30 días, 3 meses, 1 año, Todo), mazos y tipo de tarjeta. Gráficos: KPIs, respuestas,
tiempo de estudio, aciertos, botones según la tarjeta, hora del día, por mazo, calendario, previsión, intervalos,
facilidad, estado de las tarjetas y «las que más se te resisten». (Pendiente de rediseño: ver `05-estado-y-pendientes.md`.)

## Amigos (solo con cuenta, `js/friends.js` + funciones en `schema.sql`)

Código de 8 caracteres y enlace `#amigo-CODIGO`; amistad aceptada por los dos; ver racha, repasos de hoy y de la
semana e idiomas (resumen calculado en Supabase, nunca mazos ni apuntes); animar (cheers); clasificación semanal;
dejar de compartir, bloquear.

## Ajustes (`renderSettings`, `js/prefs.js`)

Estudio diario, sesión (botones, intervalos, sonido, vibración, atajos), voz, algoritmo (FSRS/SM-2, retención,
parámetros), apariencia (tema claro/oscuro/sistema, 14 colores de acento, letra de las tarjetas, tamaño, densidad,
alineación), Inicio (paneles visibles, meta diaria, periodos), datos (copia de seguridad, restaurar, reiniciar
progreso, ajustes por defecto), instrucciones para IA. Enlace «Ver las últimas novedades».

## Bienvenida y novedades

- **Presentación de bienvenida** (`js/onboarding.js`): primera vez sin mazos ni apuntes; capturas reales en
  `img/onboarding/` (claro y oscuro); última pantalla para arrancar según lo que quieras estudiar.
- **Novedades** (`js/news.js`): pantallas con lo nuevo; se muestran una vez por `NEWS_VERSION` (actual `2026-10`);
  capturas en `img/novedades/`. `NEWS_ALWAYS = true` las enseña siempre (para revisarlas).

## Sin conexión

Service worker (red primero, caché si falla), copia de los datos en IndexedDB (`js/snapshot.js`), cola de escrituras
pendientes (`js/outbox.js`) con aviso «Sin conexión · N cambios por enviar», imágenes en IndexedDB con subida
pendiente, trazos de kanji cacheados. El SDK de Supabase va incluido en `js/vendor/supabase.js`.
