# 05 · Estado actual y pendientes

Actualizado el 2026-10-22. Para el detalle: `git log --oneline -40`. Versión del service worker: `flaski-v66`;
`NEWS_VERSION = '2026-10'`.

## Lo hecho, por áreas (historial reciente, de más nuevo a más viejo)

### Inicio y gráficos
- «Tu ritmo»: línea y puntos del día al pasar por encima, nuevas apiladas sobre los repasos, meta diaria, cifras de
  hoy y del día más cargado, líneas suavizadas en 3 meses; lo estudiado y aciertos antes de hoy, lo que toca después.
- Calendario de actividad en el color del tema, periodos animados, cuadrados siempre cuadrados y centrados.
- «Tus repasos» con líneas por estado.
- General Sans en los paneles: actividad, racha, meta diaria, previsión, tus tarjetas, estadísticas y amigos.
- «Tu progreso» sustituye a «Tu ritmo» y «Tus tarjetas» en Inicio; Actividad con la racha en grande; cabecera viva (commit ac87cd4).

### Novedades y bienvenida
- Novedades al entrar una sola vez por versión, y «Ver las últimas novedades» en Ajustes.
- Pantallas de novedades: formato, organizar apuntes, tablas, sugerencias, tipos nuevos, estudio, importar, letra.
- Presentación de bienvenida con capturas reales y mazo de alemán A2.

### Tipografía y textos
- Atkinson Hyperlegible en toda la app (incluida como fuente y como opción para las tarjetas); General Sans en títulos.
- Textos sin comparaciones con otras apps; fuera frases que no se entendían; fuera el botón «Pegar» de Apuntes.

### Apuntes
- Tablas como una hoja de cálculo (asas de fila y columna, menú, +, celdas que crecen, ordenar, alinear).
- Exportar a Word, PDF, Markdown (con imágenes) y HTML; importar Word, Markdown, HTML, CSV y .zip.
- Deshacer en todo el apunte, mover y seleccionar bloques, sangría, plegar, buscar y reemplazar, índice, `[[enlaces]]`.
- Formato en Markdown con vista en directo y pegar con formato; ayuda con pestañas y buscador.
- Importar PDF (tablas con y sin cuadrícula), más tipos de bloque, menú `/`.
- Carpetas y etiquetas, estado por partes, estudiar por apartados, chuleta, tarjetas vinculadas a bloques.

### Sugerencias sin IA
- Sugerir tarjetas a partir de los apuntes; probado con PDFs reales; filas como las de un mazo, editor, filtros;
  actualizar, descartar, de dónde sale cada una, ✨ en el apunte y consejos para escribir.

### Estudio y tarjetas
- FSRS (por defecto para quien empieza); SM-2 sigue disponible.
- Tipos nuevos: clasificar, hueco con opciones, ordenar los pasos, respuesta numérica, verdadero o falso, emparejar,
  tapar partes de una imagen, conjugación; tipos agrupados por idioma; alemán (der/die/das, mayúsculas, ß/ss).
- Tacto y sonido, deslizar para valorar. Imágenes en tarjetas y apuntes. Furigana cuidada.

### Datos, social y otros
- Importar Anki (.apkg/.colpkg). Amigos: invitar, ver cómo van, animar, clasificación semanal.
- Sin conexión: SDK de Supabase incluido en `js/vendor`, cola `outbox`, snapshot en IndexedDB, contador diario atómico
  (`bump_review_log`).

## Pendientes y hoja de ruta

### a) «Tu progreso» en Inicio — EN CURSO
- Implementándose en `js/charts.js` (`progressSeries`, `progressView`, `initProgressHover`, `PG_PERIODS`, `nextLine`),
  `js/app.js` (`renderHome`, host `#pgHost`), `css/app.css` y `prefs.home.progressPeriod` (`m3` por defecto).
- Especificación en `03-diseno.md` (bandas consolidadas/jóvenes/aprendiendo + rayado por aprender hasta el total,
  reconstruido con el `ivl` de `review_events`, anotaciones «+60 de Biología» y «llegas a 100», cabecera viva).
- Al terminar: pruebas (`inicio.spec.js`), subir `VERSION` del SW, valorar pantalla de novedades y capturas.

### b) Rehacer todos los gráficos de Estadísticas con el estilo nuevo (`js/stats.js`) — HECHO (commit c13842b)
- **KPIs** con mini sparklines.
- **Respuestas por día**: barras con hoy en tono oscuro y el resto claro.
- **Botones** (Otra vez/Difícil/Bien/Fácil) en tonos del acento, no en colores distintos.
- **Fusionar tiempo de estudio + aciertos** en un solo gráfico.
- **Hora del día**: línea con un punto en la mejor hora.
- **Por mazo**: barras finas.
- **Previsión**: mismo estilo (hoy destacado).
- **Intervalos y facilidad**: distribuciones suaves con marca de la media.
- **Sustituir «Estado de las tarjetas»** por «Tu progreso» filtrado (por mazo/tipo/periodo de Estadísticas).
- **«Las que más se te resisten»**: lista con barra fina.
- Todo con cabecera viva (sin tooltips flotantes), sin rejilla ni eje Y, pestañas de periodo subrayadas.

### c) Avisos con notificaciones Web Push — HECHO en código; falta configurarlo en Supabase
- Pasos en `supabase/functions/recordatorio/README.md` (tabla, claves VAPID, desplegar la función, pg_cron y webhook de `cheers`).
- Ajustes → Avisos: recordatorio diario (con hora) y «Cuando alguien te anime». Código: `js/push.js`, `sw.js` (push y notificationclick).

Lo que se planeó:
- Tabla en Supabase para las suscripciones (endpoint, claves, hora y zona horaria, usuario) con RLS.
- Edge Function que envía los avisos + `pg_cron` para lanzarla periódicamente; claves **VAPID** (la privada como
  secreto de Supabase, nunca en el repo; la pública en el cliente).
- Manejador `push` y `notificationclick` en `sw.js`.
- Ajuste en Ajustes (activar, hora) con petición de permiso.
- En iOS solo funciona con la app **instalada en la pantalla de inicio** (iOS 16.4+): explicarlo en el ajuste.

### d) «Modo repaso» de los apuntes
- Pendiente de repensar con la persona usuaria (qué es exactamente y cómo encaja con estudiar por apartados y la chuleta).
  No implementar sin propuesta previa.

### e) Sin conexión y sincronización
- Apuntado el 2026-10-05: cola de escritura offline (el SDK se cargaba de jsDelivr y no estaba en `sw.js`) y conflicto
  del registro diario entre dispositivos (usar el máximo por día).
- Estado comprobado en el código: el SDK ya va en `js/vendor/supabase.js` y en el `SHELL`; existe `js/outbox.js` con
  pruebas y e2e `sin-conexion.spec.js`; el contador usa la RPC atómica `bump_review_log` (suma en el servidor).
  **Verificar con la persona usuaria si queda algo** (p. ej. conflictos de edición de mazos/apuntes entre dispositivos,
  o crear/editar sin conexión, que el README aún describe como no disponible).

### f) Planificar el estudio: activar/desactivar mazos y repartir el foco
- Poder desactivar mazos (y carpetas) para que no entren en el estudio, sin borrarlos ni archivarlos.
- Dar a cada carpeta un porcentaje de foco y, dentro de cada carpeta, un porcentaje a cada mazo; el reparto decide
  cuántas nuevas (y en qué proporción los repasos) salen de cada uno al estudiar «Todo».
- Objetivo: quien prepara todo el curso de golpe puede ir poco a poco o dar prioridad a lo más urgente.
- Pedido el 2026-10-22; hacer propuesta antes de implementar.

### Otros detalles a tener en cuenta
- `README.md` está desactualizado en partes (habla de GitHub Pages y `python -m http.server`; hoy es Netlify y
  `node tests/serve.mjs`). Actualizarlo solo si la persona usuaria lo pide.
- En `charts.js` quedan restos del tooltip compartido (`initChartTips`, `data-tip-*`) que usa `stats.js`; desaparecerán
  al rehacer Estadísticas.
