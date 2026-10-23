# Estado del rediseño

## Fase 1 · dividir app.js (hecha)
- Hecho: app.js (6.629 líneas) → `js/app.js` (~880: go/render, manejadores globales y arranque), `js/comun.js` (estado `S` único y utilidades) y `js/pantallas/` (cuenta, inicio, estudio, mazos, explorar, apuntes, perfil, editor, amigos). Un commit por archivo; `sw.js` va por `flaski-v82`.
- Solo se ha movido código: las líneas son las mismas que en el original. Cambian los `import`/`export`, se quitan imports que no se usaban y hay un setter (`setImportInto`) porque app.js reasignaba esa variable de apuntes.
- `openSheet`/`closeSheet` están en `pantallas/editor.js` y no en `comun.js`, porque `closeSheet` llama a las sugerencias de apuntes y `comun.js` no puede importar pantallas.
- Cambia el orden de carga de los módulos, así que los listeners de `visibilitychange`/`pagehide` (guardar copia, apuntes y ajustes) se ejecutan en otro orden. Lo he revisado y no cambia nada: cada uno guarda cosas distintas.
- Prueba retocada: `sin-conexion` «una imagen añadida sin conexión…» ahora espera a que la app tenga sesión tras recargar. Antes dependía de la velocidad del arranque.
- Pendiente: `sin-conexion` «abrir la app sin conexión…» (escritorio) es inestable desde antes de la fase 1: falla 3 de cada 15 veces también con el app.js original.
- Duda: `apuntes.js` (~2.300 líneas) y `editor.js` (~1.100) siguen siendo grandes. Se podrían partir (tablas, buscar, exportar/importar…) si una fase lo pide.

## Fase 1b · escritura de kanji a mano (arreglada)
- Causa: no venía de dividir app.js. Desde el estilo «cuaderno» (de68876) `--fg`, `--line-strong` y `--faint` son `color-mix()`; `theme()` de `js/handwriting.js` se los pasaba tal cual a Hanzi Writer, que lanza «Invalid color» y deja la caja vacía (sin trazos ni corrección). Afectaba a la tanda y a la hoja «Orden de trazos».
- Arreglo: `theme()` resuelve cada color en el navegador y lo pasa a `rgba()` con un lienzo de 1×1. También vale para el lienzo libre. `sw.js` → `flaski-v83`.
- Probado en móvil (375 px, táctil) y escritorio con 日, 駅 y 予約: se dibuja el trazo, se corrige y la página no se desplaza. Nueva e2e `kanji.spec.js`: escribe 日 trazo a trazo con datos locales (`e2e/trazos/nichi.json`).

## Fase 2 · vocabulario y navegación (hecha)
- Vocabulario: mazo → lista, tarjeta → pregunta, sesión de estudio → tanda en los textos visibles (≈300 líneas, con la concordancia: «esta lista», «archivada»…). «Mazo» solo queda en «mazo de Anki» y «Paquete de mazos de Anki». No cambian variables, ids, archivos (`mazos.js`) ni datos guardados; «Iniciar/Cerrar sesión» se quedan.
- Pestañas: Hoy · Biblioteca · Explorar · Perfil. Hoy es la vista `home` de siempre (la antigua «Estudiar»). Biblioteca es la vista nueva `library` (`js/pantallas/biblioteca.js`): pinta «Mis listas» y debajo «Apuntes»; `renderDecks`/`renderNotes` escriben en su sección con `libHost()` de `comun.js`, así que buscar o filtrar solo repinta su parte.
- `go('decks')`/`go('notes')` sin carpeta (migas, borrar, volver) abren Biblioteca; dentro de una carpeta, lista o apunte sigue marcada la pestaña Biblioteca. Plan, Ajustes, Amigos y Estadísticas marcan Perfil; Perfil tiene ahora la fila «Plan de estudio» y Biblioteca ya no tiene ese botón.
- `sw.js` → `flaski-v85`, con `biblioteca.js` en `SHELL`. E2e adaptadas a los textos y pestañas nuevos.
- Dudas: iconos de Hoy (sol) y Biblioteca (libros) elegidos por mí, no están en el diseño. `FORMATO-IA.md` (instrucciones para la IA) sigue diciendo «mazo»/«tarjeta»: no lo he tocado porque lo lee la IA y una prueba cuenta sus «Este ejemplo crea N tarjetas». En «Sugerir preguntas», «listas» también significa listas con viñetas: puede confundir.
- Pendiente: Novedades (`news.js` y capturas) sin actualizar; mejor hacerlas cuando el rediseño se vea entero. En Biblioteca hay dos `h1` («Mis listas» y «Apuntes») y cada sección tiene su «+ Carpeta»: se resuelve al unir las carpetas en la fase 3.

## Fase 2b · dudas resueltas
- Iconos: sol para Hoy y carpeta para Biblioteca (como en `organizacion-*.jpg`); Explorar sigue con la brújula y Perfil con la persona.
- `FORMATO-IA.md` se queda como está (no hay IA en v1).
- En el editor de apuntes y en Sugerir preguntas (menú de bloques, ayuda, trucos y consejos), las listas con viñetas se llaman «Viñetas» y las numeradas, «Numeración». «Lista» queda solo para las listas de preguntas.
- Novedades y capturas: al final del rediseño. `sw.js` → `flaski-v87`.

## Fase 3 · Biblioteca con carpetas (hecha)
- Sin migración: listas (`decks.folder_id`) y apuntes (`pages.folder_id`) ya apuntaban a la misma tabla `folders`. Solo se unen las vistas: `go('notes', …)` y `go('decks', …)` con carpeta abren la misma vista (`decks` + `S.folderId`, y `S.noteFolder` va igual). `renderDecks`/`renderNotes`/`libHost` desaparecen; todo lo pinta `pantallas/biblioteca.js`.
- Raíz: «Biblioteca» + «+», accesos Apunte · Lista · Carpeta · Importar, buscador único (apuntes y listas), carpetas grandes (azul, azul oscuro alternando; con borde si están al día) y «Sueltos». Carpeta: cabecera azul con barra consolidadas/jóvenes/por aprender, «Estudiar la carpeta», filtros Todo · Apuntes · Listas · Subcarpetas y fichas mezcladas. Un solo «+ Carpeta» por pantalla; «+» ofrece Apunte o Lista; «Importar» ofrece apuntes, listas o pegar.
- Dibujos cartoon: no hay recursos, así que asoma el icono de la carpeta (su emoji o el icono de carpeta). Pendiente cuando existan los dibujos.
- Se quitan de la Biblioteca (no salen en las capturas): vista en lista/cuadrícula, «Empieza por aquí», «Lo dejaste aquí» y el resumen del texto de cada apunte. Se mantienen, discretos: Orden, Archivadas, etiquetas, «+ Añadir listas aquí», mover y arrastrar listas a carpetas, «Exportar apuntes».
- Borrar carpeta: la app ya subía su contenido un nivel; además `backend-local` deja `folder_id` a null en los apuntes, como Supabase. Prueba nueva en `apuntes.spec.js`.
- Pendiente: «Cómo lo llevas» (columna derecha en escritorio) y la nueva pantalla de lista (`lista-movil.jpg`, con «Apuntes vinculados»), que no eran de esta fase. `sw.js` → `flaski-v88`.
- Dudas: el color de cada carpeta (azul / azul oscuro / con borde) lo elijo yo por pendientes; en el diseño no está la regla. En las fichas de la raíz va «N hoy»/«al día» y dentro de una carpeta, el estado (te cuesta, toca repasar…), como en las capturas.
