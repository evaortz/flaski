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

## Fase 3b · remates
- Color de carpeta: el que se elige en «Editar carpeta» (paleta de `org.js`), en la tarjeta y en la cabecera; sin color, el del tema (cobalto por defecto). Ya no se alterna azul / azul oscuro ni hay carpetas con borde. `sw.js` → `flaski-v89`.
- "Lo dejaste aquí" pasa a Hoy en la fase 4.
- Dibujos de carpeta: los 8 SVG de `img/carpetas/` (en el SHELL de `sw.js`, para que se vean sin conexión). Se eligen en «Editar carpeta», debajo del icono y junto a los emojis, y asoman por la esquina de la carpeta y de su cabecera; sin dibujo, asoma su emoji y, sin emoji, el icono de carpeta. Se guardan en `icon` como «d:economia» (cabe en sus 16 caracteres; no cambia el esquema). En rutas y desplegables, una carpeta con dibujo sale solo con su nombre.
- Fallo ajeno: `plan.spec.js` «fecha de examen…» falla según la hora del día (dice «examen mañana» en vez de «en 2 días»); también falla sin estos cambios.

## Fase 4 · Hoy (hecha)
- Hecho: Hoy de arriba abajo con datos reales: preguntas para hoy (`counts('all')`, más «N carpetas» de primer nivel con algo pendiente), «Empezar una tanda», «Lo dejaste aquí» (último apunte editado, fila discreta), «Lo que flojea» (apartados de apuntes con `cardsStatus` = te cuesta / toca repasar; `weakSections()` en `comun.js`; «Repasar solo lo que flojea» abre una tanda con el ámbito nuevo `weak`, solo con preguntas ya estudiadas), examen más cercano del plan (`examStatus`), «Cómo va lo que sabes» (`progressView` con «aprendiendo» sumado a «por aprender»), «Tu actividad» (6 meses, colores de DISENO.md, punto en los días con la meta) y «Tus amigos» al final. En escritorio: izquierda hoy + flojea; derecha examen, lo que sabes, actividad y amigos. `sw.js` → `flaski-v90`.
- Ánimos: las píldoras ¡Ánimo! · ¡Tú puedes! · 🔥 mandan los tipos `clap` · `go` · `fire` que ya admitía `cheers` (no cambia el esquema).
- Quitado porque no existe en la app: «· 5 min» y «Tanda larga · 20 min» (no hay tandas por duración ni estimación de tiempo), la píldora «a medias» (STATUS solo tiene te cuesta / toca repasar), «foco del mes» (sin examen no sale la tarjeta) y el selector «todas las carpetas» (queda como texto fijo).
- Se quitan de Hoy (no salen en las capturas): «Tus listas» (y su ajuste), la clasificación semanal de amigos y los periodos del calendario y del gráfico. En Ajustes la sección «Inicio» pasa a «Hoy»; el periodo de «Cómo va lo que sabes» sigue en Ajustes.
- Pendiente: «Lo que flojea» solo mira apuntes; las preguntas sueltas de listas sin apunte no salen. «🔥 5 días esta semana» en la barra lateral, para cuando se toque la barra.
- Dudas: en el diseño la meta se marca con un cuadrado oscuro con punto; lo he hecho con el `#1A247A` de la escala y un punto blanco. En modo oscuro los azules del calendario salen del color del tema (no hay regla).

## Fase 4b · remates de Hoy
- Racha: vuelve a Hoy, pequeña, bajo el título de «Tu actividad»: «Racha de N días» y el comodín (disponible o usado el día X), con el mismo cálculo de siempre (`streaks`).
- Ánimos: «Gracias» pequeño a la derecha del ánimo recibido; lo marca visto (como antes) y desaparece de Hoy.
- Arreglado «Meta: 30 al día · cambiar»: el enlace tenía un margen negativo que tapaba el «·». `sw.js` → `flaski-v91`.
- Pendiente para la fase 7: la clasificación semanal de amigos va a Amigos (hoy no está en ninguna pantalla; `ranking` sigue en `friends.js`).

## Fase 5 · aspecto de la tanda (hecha)
- Hecho: cabecera con volver, nombre de la lista (de la pregunta en curso si la tanda es de todo; si no, el del ámbito: carpeta, apunte…) y «pregunta N de M · repaso/nueva»; barra por segmentos; pregunta arriba y respuesta abajo, junto a los botones; caja «respuesta» con borde blanco; «Ver respuesta» blanca y «No lo sé» con borde, de 60 px; 4 botones de colores (60 px, radio 30) con el intervalo debajo y anillo de su color en el sugerido. Aciertos en menta y fallos en coral (opciones, escribir, clasificar, ordenar, conjugar, número, emparejar). Fin: «¡Tanda hecha!», «N preguntas · X min», recuento con los colores de los botones, «Volver al inicio» y «10 nuevas más». `sw.js` → `flaski-v92`.
- Letra: el texto principal corto (≤ 18 letras) va a mano y grande; el largo, en letra normal; con kanji, en su letra y grande. No cambia la lógica de repaso ni la corrección (solo HTML y CSS; `startedAt` en la tanda para los minutos).
- Prueba nueva `tanda-tipos.spec.js`: una pregunta de cada uno de los 19 tipos, la responde, comprueba que nada se sale de la pantalla y que salen los 4 botones con intervalo; en el móvil guarda capturas en `tests/test-results/tanda/`. Arreglado al recorrerlos: clasificar y conjugar ilegibles sobre azul, la fila de respuesta numérica se salía y la respuesta con kanji salía pequeña.
- No hecho (sale en las capturas pero no existe en la app): los dibujos de cada pregunta, las pistas de deslizar alrededor de la pregunta (↑ fácil, ← otra vez…), «en el metro» y «Lo que entiendes» del final (fase 9).
- Dudas: Klee One no está en `fonts/` (el japonés grande usa la letra del sistema); ¿añadirla? Con «escribir la respuesta», ordenar o dictado acertados, la caja «respuesta» solo lleva el altavoz: ¿se quita la caja en ese caso? El atajo «Espacio: mostrar · 1-4: valorar» sigue saliendo en el móvil si está activado en Ajustes.

## Fase 5b · dudas resueltas
- Klee One (Google Fonts, peso 600) solo para el japonés grande de la tanda: campos con kanji en listas de japonés (o con kana si el campo no tiene idioma). Si no carga, la letra del sistema. El service worker guarda su hoja de estilos (red primero) y sus archivos (la primera vez) en `flaski-fonts-v1`, que no se borra al cambiar de versión. `sw.js` → `flaski-v93`.
- Escribir la respuesta, Ordenar frase, Dictado (y Escribir a mano con dibujo libre) ya resueltos y sin más campos que enseñar: no sale la caja «respuesta»; su altavoz (y el orden de trazos) va junto a la pregunta. Vale también si fallas, porque la corrección ya enseña la respuesta.
- «Espacio: mostrar · 1-4: valorar» no sale en pantallas táctiles (`pointer: coarse`), aunque los atajos estén activados.
- Duda: si la pregunta ya tiene su altavoz (p. ej. la traducción en Ordenar frase), salen dos altavoces seguidos; cada uno dice qué lee al pasar por encima, pero a la vista son iguales.
- Resuelta: junto a la pregunta queda un solo altavoz. Si la respuesta resuelta tiene idioma (la frase en Ordenar frase o Dictado), su altavoz sustituye al de la pregunta; si no, se queda el de la pregunta. `sw.js` → `flaski-v94`.

## Fase 5c · pistas de deslizar
- Al ver la respuesta, en el móvil táctil (`pointer: coarse` y `hover: none`) y con «deslizar» activado: «← Otra vez», «Bien →» y «↑ Fácil» (esta solo si ↑ está activo: 4 botones y la pregunta cabe sin scroll), en letra a mano, con el color de su botón, opacidad 0,35, y se van solas a los 2,6 s. Difícil sigue siendo solo botón.
- Salen hasta deslizar 10 veces (`prefs.study.swipeCount`) y vuelven tras 30 días sin deslizar (`swipeLast`). `swipeable` devuelve ahora `{ up }`. Prueba nueva `deslizar.spec.js`. `sw.js` → `flaski-v95`.
- Arreglado: desde la fase 5, el alto mínimo de la tanda hacía la página 16 px más alta que la pantalla y desactivaba ↑ Fácil al deslizar. El alto va ahora en `.app` descontando el relleno de la página.
