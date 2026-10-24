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
- Letra: el texto principal corto (hoy: hasta 4 palabras y 28 letras) va a mano y grande; el largo, en letra normal; con kanji, en su letra y grande. No cambia la lógica de repaso ni la corrección (solo HTML y CSS; `startedAt` en la tanda para los minutos).
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

## Fase 6 · editor de apuntes (hecha)
- Antes, solo moviendo código: `apuntes.js` (2.255 → ~1.600 líneas) reparte el editor de tablas en `pantallas/apuntes-tablas.js`, la ayuda en `apuntes-ayuda.js` y Sugerir preguntas en `sugerencias.js` (commit aparte, en `SHELL`).
- Barra de lo seleccionado en cobalto: B · I · U · S · código · A▾ | «＋ Crear pregunta» (píldora blanca) · «Hueco» (borde blanco), que hace lo mismo que antes (`clozeFrom`). Pulsarla no quita la selección (`preventDefault` en `pointerdown` y `mousedown`) ni rompe deshacer. La barra antes no tenía más botones.
- Móvil: de lado a lado, justo encima del teclado (`visualViewport`); si el navegador no lo dice o falla, se queda abajo. U, S, código y color van en «…» (antes de Hueco y Crear pregunta) y, mientras se escribe, sale «Hecho» (cierra el teclado), como en `editor-movil.jpg`.
- «Crear pregunta» abre el editor de preguntas de siempre en un panel a la derecha (escritorio; el apunte se estrecha y sigue a la vista) o en una hoja desde abajo (móvil), con «Nueva pregunta», «de: <apartado>» (lleva a él), el bloque marcado y «Crear pregunta · Crear y otra» (la otra sale de la misma parte). Editar una pregunta sigue en la hoja grande.
- Margen: raya del color del estado de las preguntas de su apartado (menta al día, ámbar toca repasar, coral te cuesta, azul sin estudiar; `cardsStatus`) y la píldora «● N» de cada bloque. `sw.js` → `flaski-v97`. E2e nueva `editor-apunte.spec.js`; capturas con `SHOT=… npx playwright test e2e/capturas-editor.spec.js`.
- No hecho (de otras fases o no existe): ideas clave, Explícalo / ¿Qué pasaría si…? y sus sugerencias (fase 9), el selector de tipos del panel (fase 8), la vista «Así se verá en la tanda» en azul, y «Estudiar este apunte» arriba sustituyendo a la fila de estado.
- Dudas: en el diseño, el estado va también como texto bajo cada apartado («Al día», «Toca repasar») y el apartado lleva «Estudiar este apartado · 3»; he dejado los botones que ya había («Estudiar N»). En pantallas de 700–960 px el panel tapa la parte derecha del apunte, que no se estrecha.

## Fase 6b · dudas resueltas
- Se quedan los botones «Estudiar N» de cada apartado; no se añade el texto de estado bajo cada uno.
- Entre 700 y 960 px, «Nueva pregunta» sale como la hoja del móvil (desde abajo); el panel lateral solo desde 960 px. `sw.js` → `flaski-v103`.

## Remates tras la fase 6
- Barra inferior del móvil: el bloque de usuario del ordenador se colaba invisible (104 → 60 px); en el ordenador abre Perfil. Pestaña activa con fondo azul claro (`--soft`) y cobalto.
- Racha: el «·» va delante del comodín y se recorta si baja de línea. «Escribir la respuesta»: el texto corto se mide sin etiquetas ni saltos de línea sobrantes (Anki) y el campo dice «Escribe la respuesta». Título del apunte en Gochi Hand. Capturas de tipos en la fase 8.
- «Lo que flojea»: además de apartados de apuntes, las listas con preguntas sueltas que te cuestan (misma regla `cardsStatus` 'weak'; «toca repasar» no cuenta en listas). Orden: te cuesta → más preguntas que cuestan → último fallo (`progress.last`; no hay fecha por fallo).
- Icono de carpeta: Emoji · Dibujos de Flaski · Tu imagen. La imagen se recorta cuadrada a 256 px, se guarda con `media.js` (sin conexión y en la nube) y va en `icon` como «i:<id>» (16 letras; sin cambios en el esquema). Entra en la copia de seguridad. Lo que asoma en la carpeta se corta en su borde (`.lfold-clip`). `sw.js` → `flaski-v106`.
- Al cerrar «Editar carpeta» se borran (del navegador y de la nube) la imagen anterior y las subidas y descartadas, si ya no las usa nada. Sin conexión, el borrado en la nube espera en la cola de envíos (`removeImage`). Al eliminar una carpeta también se borra su imagen si no la usa nada. `sw.js` → `flaski-v110`. Duda: `carpetas-dibujos.zip` no estaba en Descargas; se usan los 8 SVG que ya había en `img/carpetas/`.
- Pregunta corta en la tanda (a mano y grande): hasta 4 palabras y 28 letras, sin contar formato, «/» ni espacios de más (`isShortText` en `inline.js`); «trabajar / estudiar» entra. `sw.js` → `flaski-v108`.

## Iconos propios
- `img/iconos/` (sugerencia, racha, racha-apagada, comodín; en el `SHELL` del SW) y la hoja en `pantallas/hoja-iconos.jpg`. `icon('sugerencia' | 'racha' | 'racha-apagada' | 'comodin')` los pinta como `<img>`. Sustituyen todos los ✨ (también Novedades y Ajustes), la llama de la racha (barra lateral, Hoy, Amigos, Perfil; apagada con 0 días), el ❄ del comodín y el 🔥 del ánimo «fuego». Lucide pasa a trazo 1,8. Sale la llama de Fluent Emoji. Regla en DISENO.md. `sw.js` → `flaski-v111`.

## Fase 4c · tandas cortas
- Duración de la tanda en `prefs.study.tandaMin` (5/10/15/20, por defecto 10). La primera vez que se pulsa «Empezar una tanda» sale la hoja «¿Cuánto suele durar tu rato de estudio?» (`tandaSheet` en `inicio.js`; `tandaAsked` marca que ya se preguntó). También en Ajustes › Estudio diario y con «Tanda de N min» en Hoy.
- Ritmo (`js/tanda.js`, en el `SHELL`): mediana del tiempo de las últimas 100 respuestas (`ms` de `review_events`, ya con tope de 2 min); con menos de 20, 20 s. Preguntas = minutos × 60 / ritmo, redondeado, mínimo 5. Si hoy quedan menos, la tanda es de las que quedan y los minutos se recalculan.
- Composición: la cola de siempre (`buildSession`: atrasadas primero, tope de repasos, plan, nuevas por día, hermanas) cortada a N con `composeShort`: 3 repasos y 1 nueva, aunque en Ajustes la mezcla sea «repasos primero» (solo en la tanda corta). «Otra vez» ya volvía 3 preguntas más adelante y nunca después del final: la tanda no acaba sin repetirla (e2e `tanda-corta.spec.js`). El algoritmo no cambia.
- Hoy: «Empezar una tanda · N min · M preguntas», «o hacer las X de hoy» (la tanda de siempre; en escritorio, botón con borde «Hacer las X de hoy»; no sale si la tanda ya las incluye todas) y «Tanda de N min». «Lo dejaste aquí» sin cambios.
- Fin de tanda corta: recuento por botón (número encima), «te quedan X» con barra de lo hecho hoy (preguntas distintas estudiadas hoy) y «N tandas hoy» (en este dispositivo, `flaski-tandas`), «Otra tanda · N min» y «Por hoy vale». Sin nada pendiente: «¡Todo hecho por hoy!» y solo «Volver». La carita dibujada sale en los dos finales.
- «Tus amigos» en Hoy: aviso del ánimo recibido (corazón, «Gracias») y la clasificación semanal: puesto, nombre · preguntas de la semana, 7 días (relleno si estudió, anillo en hoy, tenues los que faltan), racha con la llama de la app y «✓ hoy», «¡Ánimo!» (manda `clap`) o «animado». Quien no comparte su actividad va al final sin puesto, sin días y con «—» en la racha. No cambia el esquema: `friend_summary` ya daba racha, hoy y semana.
- Escritorio: izquierda número, botones, Lo que flojea y Tu actividad; derecha examen, Cómo va lo que sabes y Tus amigos. En el móvil el orden sigue siendo el de las capturas (`order` en CSS).
- `sin-conexion` «abrir la app sin conexión…»: comprobaba los envíos al reconectar sin esperarlos (fallaba 2 de cada 6 también antes de esta fase); ahora espera con `expect.poll` y pasa 8 de 8.
- `sw.js` → `flaski-v112`. E2e que empezaban la tanda desde Hoy usan `startTanda` (acepta la hoja la primera vez); la de «10 nuevas más» empieza desde la lista.
- Novedades sin actualizar (al final del rediseño, como se decidió).

## Fase 4c · dudas resueltas
- Tu fila, si te queda algo para hoy y aún no has estudiado: «¡Te toca!» (como «¡Ánimo!») empieza una tanda corta. Sin nada pendiente, vacía.
- El ánimo recibido va sin hora y dice «Carmen te dice: «¡Tú puedes!»». La pantalla Amigos no enseña los ánimos recibidos (solo Hoy). La notificación del ánimo (`supabase/functions/recordatorio`) dice lo mismo: «Carmen te dice: «¡Tú puedes!»» (el fuego, como 🔥); hay que volver a desplegar la función.
- Tras animar a alguien, «enviado» con el corazón. `sw.js` → `flaski-v113`.

## Remates de la revisión (móvil 375 px y escritorio)
- Arranque: `onSignedIn` ya no espera hasta 4 s a que salga la cola. Se carga en paralelo y se aplica encima lo que había pendiente al empezar y lo que siga pendiente (`withPending(d, before)`); la copia sin conexión se lee a la vez que se piden los datos. `loadAll` pide apuntes y las dos comprobaciones de columnas junto con lo demás (3 viajes menos).
- Los ~5 s antes de pedir `supabase.js` eran la cascada de imports: el navegador descubre los módulos import a import y la cuenta llega la última (medido con Performance: a 300 ms de latencia, `supabase.js` empezaba a 4,2 s). `index.html` precarga ahora todos los módulos con `modulepreload` (prueba en `sw.test.js`: no puede faltar ninguno). Con la nube simulada y 100 ms de latencia, Hoy con datos pasa de 3,3 s a 1,8 s. En un móvil real el tiempo de procesar los módulos se suma; no lo he podido medir.
- Ajustes: la pestaña «Sesión» pasa a «Tanda» (y la sección, «Durante la tanda»).
- Título del apunte: `<textarea>` que crece (también al girar la pantalla); Intro termina de escribirlo y lo pegado con saltos se junta en una línea.
- Móvil (<700 px): 44 px de alto en la barra del apunte (iconos sin borde, como en `editor-movil.jpg`; «Biblioteca» ya no se corta, se recorta el título actual), pestañas de Ajustes, periodo y desplegables de Estadísticas y «cambiar / poner una» de la meta (zona ampliada sin mover nada). Prueba `tactil.spec.js`.
- Hoy móvil: «Cómo va lo que sabes» ya iba antes de «Tu actividad» desde la fase 4c (`order` en CSS), también con cuenta. Lo he comprobado a 375 px y queda fijado en `inicio.spec.js`. Si en el móvil se veía al revés, probablemente era una versión vieja guardada por el service worker.
- Gráfico de «Cómo va lo que sabes»: en estrecho (<420 px) las etiquetas van en dos líneas (número y nombre en minúscula, como en `hoy-movil.jpg`); si aun así alguna no cabe, se encoge (`fitLabels`). Las dos notas «+N de lista» ya no se pisan si caen cerca.
- Modo local de pruebas (`js/modo.js`, `pantallas/pruebas.js`): solo en localhost, 127.0.0.1 o [::1] con `?local` (prueba unitaria: nunca en otro host). Usa `backend-local.js` aunque Supabase esté configurado; aviso fijo arriba y «Cargar datos de ejemplo». Datos en `flaski-pruebas-v1` e imágenes en la base `flaski-media-pruebas`, aparte del modo local normal (`flaski-local-v1`) y de la cuenta (cola, copia sin conexión). `sw.js` → `flaski-v120`.
- Duda: he entendido «los temas de ejemplo» como las 3 listas incluidas (alemán, japonés, turco), que se copian con progreso inventado (consolidadas, jóvenes, alguna que cuesta), respuestas de los últimos meses y actividad. No hay apuntes de ejemplo; si querías temas como en las capturas (Macroeconomía › Tema 4…), habría que escribirlos.
- Quedan compartidos entre modos solo ajustes del dispositivo (apariencia, orden, «10 nuevas más», tandas de hoy): no son datos de la cuenta.
