# Estado del rediseño

> **ANTES DEL PUSH DEL PASO 5**
> 1. Ejecuta `supabase/schema.sql` entero en el SQL Editor de Supabase (columna `deleted_at` de la papelera, «¡Bravo!», `recent_cheers`, `delete_my_account` y las políticas de lectura pública). La app nueva pide `deleted_at`: sin este SQL, falla.
> 2. Vuelve a desplegar la función `recordatorio` (`supabase functions deploy recordatorio`): ahora avisa también de «¡Bravo!».
> 3. Después, el push.

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
- Datos de ejemplo (resuelto): las 3 listas incluidas (alemán, japonés, turco), copiadas con progreso inventado (consolidadas, jóvenes, alguna que cuesta), respuestas de los últimos meses y actividad. Sin apuntes de ejemplo: con las listas basta.
- Quedan compartidos entre modos solo ajustes del dispositivo (apariencia, orden, «10 nuevas más», tandas de hoy): no son datos de la cuenta.

## Fase 3b · Lista (hecha)
- Cabecera: volver, ruta (Biblioteca › carpeta), título a mano, descripción y «Idioma · N preguntas · editado el …» (lo último que cambió: la lista o alguna pregunta). «N para hoy» (repasos + nuevas de hoy, como Hoy) con «X repasos · Y nuevas»; sin nada, «al día» (o «vacía»). Estudiar, «+» y «…» (en el móvil «…» va arriba, junto a la ruta).
- «+» (Añadir preguntas): Una pregunta, Varias de golpe, Desde un apunte, Importar archivo. «…» (Más opciones): Editar lista, Estadísticas de esta lista, Compartir, Mover a otra carpeta, Exportar (CSV), Archivar/Desarchivar, Borrar lista en rojo. Hoja en el móvil (<700 px) y menú desplegable en el ordenador (Esc o tocar fuera lo cierra).
- «Desde un apunte»: eliges el apunte (los vinculados primero) y se abren sus sugerencias con esta lista como destino. «Importar archivo» deja elegida esta lista en «Añadir a» (un .apkg sigue creando listas nuevas).
- Estado: barra por etapas (nuevas · aprendiendo · jóvenes · consolidadas, misma regla que «Cómo va lo que sabes») y, si hay datos, «Retención en esta lista: X %» (repasos acertados de 30 días, desde 5) y los repasos de la semana que viene.
- Preguntas: buscador, filtros Todas · Para hoy · Nuevas · Aprendiendo · Jóvenes · Consolidadas (los vacíos no salen), Orden (próximo repaso, orden de la lista, alfabético). Cada pregunta con su punto de etapa, respuesta, tipo con icono (la plantilla al pasar por encima) y etiquetas, etapa y repaso («hoy» a mano). En el ordenador es una tabla Pregunta · Respuesta · Tipo · Estado · Repaso. Se ven 10 y «Ver todas» (al buscar, todas).
- Apuntes vinculados (los que tienen la lista o de los que salen sus preguntas) con un trozo de su texto y «Vincular otro apunte» (cambia la lista del apunte).
- Desde 1240 px, estado y apuntes vinculados a la derecha; más estrecho, debajo como en el móvil. Selector «Lista | Mapa» en el HTML, oculto (`hidden`) hasta la fase 10.
- Pruebas: `lista.spec.js` nueva; las demás usan `newCard(page)` y `deckMenu(page, sel)` de fixtures y `.dk-meta` para el número de preguntas.
- Dudas: el tipo sale con el icono de Lucide de cada tipo (Vocabulario con el de idiomas, no el libro del diseño). Los colores de las etapas salen del acento (en oscuro, la consolidada es la más clara).

## Remates sueltos tras la 3b
- «Repasar solo lo que flojea · N»: N es la suma de las píldoras de encima, que ahora dicen cuántas («N te cuestan», «N por repasar»); la tanda repasa justo esas, toque o no repasarlas hoy (antes contaba solo las que tocaban).
- «Cargar datos de ejemplo»: cierra la bienvenida, no enseña Novedades, lleva a Hoy y avisa al terminar. El aviso amarillo queda por encima de la bienvenida (antes no se podía pulsar con ella abierta).
- Nota «+N de …» del gráfico: el nombre se acorta entre palabras y sin lo que va entre paréntesis («Vocabulario Esencial»), no se sale por la izquierda y dice el nombre entero al pasar por encima. Los nombres van escapados.
- Deslizar hacia abajo = «Difícil» (si la pregunta cabe sin scroll y hay 4 botones). Las pistas enseñan las cuatro direcciones; «↓ Difícil» va justo encima de los botones. Texto de Ajustes actualizado.
- Modo local de pruebas: el aviso mide su alto (dos líneas, muesca) y la página empieza debajo; en la tanda ya no tapa la cabecera y la pregunta cabe sin scroll (antes sobraban 44 px y no se podía deslizar en vertical).
- Versiones mezcladas: el service worker pide siempre al servidor con `cache: 'no-cache'` (la caché HTTP del navegador podía dar un módulo viejo: con un servidor sin `Cache-Control`, el navegador guarda los .js por su cuenta). Además, un script en `index.html`: si un módulo de `/js/` no carga o no casa («does not provide an export named»), borra las cachés `flaski-v*`, quita el service worker y recarga, una vez por sesión y nunca sin conexión. E2e `actualizar.spec.js`. No he encontrado ningún `js/apuntes.js` en el historial: lo pedía algún módulo viejo guardado en ese navegador.
- Biblioteca (con `biblioteca-escritorio.jpg` y `biblioteca-movil.jpg`): fichas de sueltos de 150 px sin esquina doblada, ladeadas, las listas con una hoja detrás; estado a mano «N hoy» (cobalto), «al día» (verde) o «vacío» (lavanda); apuntes sin preguntas con borde discontinuo y texto gris. Sin el botón de mover en cada ficha (está en «…» de la lista y arrastrando). En el ordenador: Apunte · Lista · Carpeta · Importar en fila arriba, carpetas en 3 columnas, sueltos en 5 y «arrástralos a una carpeta para ordenarlos».
- Lista, remates: las preguntas en sentido inverso (la segunda plantilla de Vocabulario, Doble sentido, Sustantivo alemán…, si su anverso es tu idioma) dicen «Español → turco» con el icono de doble sentido (sin idioma en la lista, el nombre de la plantilla). Por próximo repaso, las nuevas van al final tras «Nuevas · N»; con «Ver todas» sin pulsar asoman hasta 3. En el ordenador el título va en su fila, en una línea: si no cabe baja de 58 a 36 px y, solo si ni así, se parte.
- `sw.js` → `flaski-v129`.
- Pruebas al terminar: unitarias 169 de 169. Batería e2e completa con `--workers=100%`: 244 pasan, 10 omitidas y 24 fallan; esas 24, repetidas solas, pasan todas (66 de 66). Eran de carga (12,6 min con todos los workers: recargas y esperas que superan 30 s) salvo un error mío ya arreglado en `mazos.js` (una variable repetida) que salió al repetirlas mientras editaba.
- Inestables con mucha carga: `apuntes.spec.js` «icono de carpeta con tu imagen» y la importación de PDF, `sin-conexion.spec.js` y `plan.spec.js`; solas pasan.

## Fase 4d · Atrasos
- Al volver (ayer no estudiaste) con 30 o más repasos atrasados (de antes de hoy), lo atrasado se reparte en 7 días, hoy incluido (`js/atrasos.js`, en el `SHELL` y en `modulepreload`). Cada día, una vez: tope de repasos = los ya hechos hoy + los que tocan hoy + atrasadas ÷ días que quedan. Funciona como el límite de Ajustes (`reviewsLeft`, el más bajo de los dos): el algoritmo no cambia. Se acaba al ponerte al día o al terminar la semana. Se guarda en este navegador (`flaski-atrasos`, por cuenta).
- Examen dentro del reparto: lo atrasado de sus listas se reparte solo hasta el día antes del examen (si es hoy, todo hoy) y va primero; el resto, en los 7 días.
- Mientras dura no entran nuevas, salvo el ritmo de un examen y las «10 nuevas más». «Hacerlas todas hoy» quita el tope, pero ese día tampoco entran nuevas («sin nuevas por hoy»). Lo que ya viste hoy y vuelve (lo fallado) no gasta del tope (antes, con el límite de Ajustes, podía quedarse fuera).
- Hoy: «Hola de nuevo, Eva. Hoy tienes» (3 días o más sin estudiar), «sin nuevas hasta ponerte al día» y «+N atrasadas, repartidas esta semana» (o «para mañana» el penúltimo día). «+N atrasadas» abre una hoja que lo explica, con «Hacerlas todas hoy» (deja de repartir hasta que acabe ese reparto). Sin tope, el aviso del límite de repasos no sale. Tanda corta igual que siempre.
- Examen cerca (14 días o menos, `EXAM_NEAR`): sus repasos van primero (también al recortar por el tope). Las nuevas son las del plan (las mismas que dice Plan de estudio); en Hoy, «15 nuevas · 6 de Alemán · A2» (si son todas del examen, «6 nuevas · Alemán · A2»). La tarjeta va justo después de «Lo que flojea» (en el ordenador, en la columna izquierda) y dice «necesitas unas N al día» (nuevas que pide el examen + repasos de sus listas para hoy, repartidos si hay atrasos), «vas con el tiempo justo» (menos de un 20 % de margen, `tight` en `examStatus`), «así no te da tiempo» o «vas a buen ritmo»; el justo y el «necesitas» en ámbar.
- Racha a 0: no sale el comodín en «Tu actividad».
- Biblioteca: «vacío» (borde discontinuo) solo para apuntes sin texto ni imágenes; con texto y sin preguntas, «sin preguntas» en lavanda y borde normal.
- Pruebas: `unit/atrasos.test.js` nueva y más casos en `plan.test.js`; e2e en `hoy.spec.js` (atrasos, examen cerca, comodín) y `apuntes.spec.js` (Biblioteca). `tanda-corta.spec.js` siembra un día de estudio ayer para que sus 40 atrasadas no se repartan. `sw.js` → `flaski-v130`.
- Dudas: el reparto vive en cada dispositivo y se calcula el primer rato del día; si pones o cambias un examen a mitad del día, el tope cambia al día siguiente. «vas un poco justa» del diseño queda «vas con el tiempo justo» (sin género).
- Pruebas al terminar: unitarias 178 de 178. Batería e2e completa con `--workers=100%`: 256 pasan, 11 omitidas y 21 fallan; las 21, repetidas solas, pasan todas (44 de 44). Son de carga (13,9 min).

## Remates del repaso
- Hermanas (ida y vuelta de una nota): una sola por tanda también si una es repaso y la otra nueva (antes solo se miraban dos nuevas). Si una ya sale o la viste hoy, la otra espera: un repaso, a otra tanda; una nueva, a otro día. Pasaba con los datos de ejemplo, que dan progreso a una hermana y dejan nueva la otra.
- Hoy, Biblioteca, el fin de tanda y los apuntes cuentan con la misma cola que la tanda (`todayQueue` en `estudio.js`): las fichas de Biblioteca suman lo que dice Hoy (antes cada lista se llevaba todas las nuevas que quedaban del día: «1 hoy» en todas).
- Desde un apunte o un apartado se estudia todo lo nuevo, sin el límite del día. El resumen del apunte cuenta preguntas («4 sin estudiar»), no partes.
- Biblioteca: el apunte y la lista creada con él (mismo nombre y sitio) salen en una sola ficha, la del apunte; en «Listas» sigue saliendo la lista.
- Pistas de deslizar: solas solo la primera vez (`prefs.study.swipeShown`); luego, solo mientras arrastras (`onDrag` en `swipeable`). Siguen dejando de salir tras 10 deslizamientos y volviendo tras 30 días.
- Escribir la respuesta: tras comprobar, el altavoz de la respuesta va junto a la pregunta también si hay más campos; la caja «respuesta» solo lleva los demás (artículo, plural…). Un campo con solo etiquetas (`<br>`) cuenta como vacío.
- Fin de tanda: «te queda 1» y, con una sola, «Hacer la que queda» en vez de «Otra tanda · 10 min».
- Apuntes: Intro en el título baja al primer bloque; en el móvil la barra de abajo se esconde mientras escribes con el teclado abierto (`visualViewport`; con el teclado cerrado vuelve aunque el cursor siga en el bloque); el índice fijo a la derecha solo desde 1500 px (con la barra lateral no cabía y tapaba «Sugerir preguntas» y el texto), más estrecho va en su botón.
- «necesitas 1 al día» (sin «unas» con 1).
- El «1» a mano: `fonts/flaski-uno.woff2`, una fuente con solo el «1» dibujado por mí (palo con un trazo corto arriba), delante de Gochi Hand en `--font-hand` (`unicode-range: U+0031`). Se genera con `tests/fuente-uno.py` (fontTools). En el `SHELL`.
- «Varias de golpe»: «Detectar solo» mira todas las líneas (`detectSep`: el separador que sale en todas las mismas veces, también la coma) y dice cuál ha detectado; el ejemplo sigue al tipo y al idioma de la lista; «Crear 3 notas · 6 preguntas» (si cada nota da una, «Crear 3 preguntas»); título con la letra a mano.
- Japonés de ejemplo: sin emojis en los tipos (🗾 🎧 🧱); sin icono sale el genérico.
- Pruebas: e2e nueva `remates-repaso.spec.js`; `deslizar.spec.js` y `cardtypes.test.js` ampliadas. `sw.js` → `flaski-v131`.
- Dudas: la hermana de una nota que ya repasaste hoy no sale hasta mañana aunque toque (como en Anki). Los tipos ya importados antes guardan su emoji: solo cambia el archivo de ejemplo.
- Pruebas al terminar: unitarias 179 de 179. Batería e2e completa con `--workers=100%`: 282 pasan, 11 omitidas y 5 fallan. Repetidas solas, 2 pasan (icono de carpeta e importar PDF, de carga) y 3 del móvil fallaban de verdad: la barra de abajo se quedaba escondida tras escribir en un apunte. Arreglado (solo con el teclado abierto) y pasan las 3 y `remates-repaso.spec.js` (15 de 15).

## Fase 4e · primera vez, acentos y etiquetas
- Primera vez (`js/primera-vez.js`, en `SHELL` y `modulepreload`): ¿Qué quieres estudiar? (idioma, oposición, la uni, vengo de Anki, otra cosa; «Ya sé cómo va · ir a Hoy») → oposición o examen: cuál, mes del examen o «Aún no lo sé», cómo empiezas (apuntes, IA, Anki) → «Trae tu tema 1» (subir PDF, Word, Markdown, zip de Notion u Obsidian; pegar el texto; tema de ejemplo) → tema subido (apartados, «N preguntas posibles», «Hacer mi primera tanda · 5 preguntas», «Ver las 5 antes», «cambiar de archivo») → primera tanda (bocadillo «¿Cómo te ha ido?» en la primera respuesta) → «¡Primera tanda hecha!» con la duración de la tanda y «¿Te aviso mañana a las HH:MM?» (solo con cuenta y avisos posibles; en local no sale) y «Listo, ir a Hoy».
- Oposición o examen crean su carpeta (con el dibujo de la balanza o de economía) y el examen va al Plan de estudio el día 1 de ese mes. El apunte entra en esa carpeta y las 5 primeras preguntas (del principio, una por bloque, sin las que solo preguntan una etiqueta tipo «{{Referéndum:}}») en una lista con su nombre (`firstPicks` y `makeSuggested` en `sugerencias.js`; `readPdfFile` y `fileToPages` exportadas en `apuntes.js`).
- La presentación de antes (`onboarding.js`) se queda para «Ver la presentación» de Perfil.
- Temas de ejemplo en `temas/` (en `SHELL`): «La Constitución · Título Preliminar» y «Por qué se te olvidan las cosas». También en «Cargar datos de ejemplo» de `?local` («3 listas y 2 apuntes»), que además da color a las etiquetas que estaban grises.
- Acentos: Cobalto, Violeta, Ciruela, Frambuesa, Teja, Oliva, Bosque, Laguna y Tinta (ids en español; los antiguos pasan al más parecido con `accentId` en `prefs.js`). Bolitas de 52 px con brillo, sombra, círculo a mano y ✓. `--acc` es el color de cada uno; en oscuro, el relleno se aclara (oklch, sin pasar de L 0,52 para que el blanco encima siga en 4,5:1) y el texto con acento usa `--accent-ink` (claro).
- Fuera el cobalto escrito a mano: barra de «elegir varias» (`#selBar`), menú de formato (`.fmt-more`), escala de «Tu actividad» (`.hoy-act`), y dibujos de carpeta e iconos propios, ahora SVG en línea en `js/dibujos.js` (lo que era cobalto, `currentColor` = acento; el azul oscuro, `--accent-deep`). Se borran `img/carpetas` e `img/iconos`.
- Contraste (medido en las 7 pantallas principales con los 9 acentos, en claro y en oscuro: todo ≥4,5:1, o 3:1 en letra grande): `--muted` y `--faint` con luminosidad fija (oklch relativo; sin soporte, la mezcla de antes, subida); en oscuro, ámbar del examen y rojo de borrar más claros; en claro, rojo `#C92F2F`; textos pequeños sobre carpetas y el botón de Hoy sin opacidad.
- Azul fijo que queda (a propósito): «Fácil» `#9ED4FF` y la escala de estadísticas `--s-g4` (el color del botón), el comodín azul hielo, la paleta de colores de carpetas y listas (`--c-blue`…), `--m2`/`--fc`/`--d1` (sin uso visible), el respaldo `#2383E2` de `handwriting.js` y las capturas de la presentación y Novedades.
- Etiquetas «pegatina» (`tagSticker` en `comun.js`): Gochi Hand con «#» (dibujado a mano en `fonts/flaski-uno.woff2`, como el «1»), 7 colores (`TAG_COLORS`; los antiguos pasan al más parecido con `tagColor`), giro de 1° a 2° según el nombre, sombra corta; en oscuro, invertidas (texto claro sobre fondo oscuro), también en la tanda. En la tanda, filas de la lista, propiedades del apunte, filtro de Biblioteca y el selector (buscar o crear, pegatinas, color de la nueva). «Gestionar etiquetas»: pegatina, cuántas preguntas (directas o de sus listas), 7 colores al momento, Renombrar, Borrar y «Nueva etiqueta · Crear». Una etiqueta nueva toma el primer color sin usar.
- Remates: Biblioteca dice «N nuevas» si hoy no toca nada pero quedan sin estudiar. «Estudiar» desde una lista incluye todas sus nuevas (una por nota), como desde un apunte, y su cabecera «N para hoy» cuenta lo mismo. Fin de tanda: «N nuevas más» con las que quedan de verdad (sin botón si no queda ninguna). Pistas de deslizar en los bordes (lados en vertical, «↑ Fácil» arriba, «↓ Difícil» bajo los botones). Arreglado: con `visualViewport` roto, `apuntes.js` fallaba al cargar y la app no arrancaba.
- `sw.js` → `flaski-v132`. Pruebas: unitarias 179 de 179; e2e relacionadas (bienvenida reescrita, apuntes, iconos, deslizar, estudio, lista, inicio, hoy, tanda corta, modo de pruebas, actualizar, editor, sugerencias, plan, tipos, kanji, Anki, formato, novedades…) pasan; las que fallaron con todos los workers (Anki, formato, icono con tu imagen) pasan solas. Sin batería completa.
- Dudas: el examen se guarda el día 1 del mes elegido. El pill «tema de ejemplo» del diseño no está (los apuntes no tienen dónde guardarlo). Desde la primera vez, «Vengo de Anki» abre el selector de archivo y lleva a Biblioteca. Novedades y capturas, al final del rediseño.

## Remates del paso 1 y batería completa
- Temas de ejemplo con sus preguntas: «Cargar datos de ejemplo» crea cada tema con una lista de su nombre y las preguntas de `docs/rediseno/sugerencias/esperadas/*.json` (copiadas en `temas/*.json`): 35 de la Constitución y 17 de «Por qué se te olvidan las cosas». `temaCards` (en `primera-vez.js`) las pasa a tipos de Flaski: básica, huecos, numérica, opción múltiple (con sus incorrectas), verdadero o falso, emparejar, ordenar pasos y clasificar (si cada parte es «grupo: …»; si no, básica con la lista). «Explícalo» y «¿Qué pasaría si…?» van como básicas hasta que existan esos tipos. Cada pregunta queda unida al bloque donde está su respuesta. Si el tema ya estaba sin preguntas, se le añaden. Prueba unitaria `temas.test.js`.
- Hoy sin nada pendiente: sin número ni banda, «Hola, estás al día» grande a mano (con el nombre si lo hay), la nota de siempre y «Estudiar N nuevas más» con las que quedan (sin botón si no queda ninguna).
- `sw.js` → `flaski-v133`.
- Pruebas: unitarias 181 de 181. Batería e2e completa con `--workers=100%`: 284 pasan, 11 omitidas y 5 fallan (actualizar ×3, deslizar y sin conexión); repetidas solas pasan las 5 (8 de 8 en los dos proyectos). Son de carga (7,8 min).


## Remates del paso 1 (primera vez)
- Tema de ejemplo: la primera tanda son 5 preguntas cortas elegidas a mano (`"primera": true` en `temas/*.json`; `temaFirst` en `sugerencias.js`), unidas a su parte del apunte. «Ver las 5 antes» las crea y abre su lista. Con un archivo propio, `firstPicks` prefiere las marcadas y cortas (pregunta ≤ 90 letras, respuesta ≤ 120, una línea).
- «¿Cuál?»: placeholder «Ej.: …» en gris (`--faint`). Mes del examen: selector propio (botón como campo, año con flechas y 12 meses; los pasados, apagados; Esc o tocar fuera lo cierra).
- «¡Primera tanda hecha!»: píldoras de duración a 19 px, sin partir, con más aire.

## Paso 2b · sugerencias sin IA (batería)
- Medidor: `tests/sugerencias.mjs` (`node sugerencias.mjs --detalle`, desde `tests/`). Casa pregunta y respuesta por palabras (raíz de 5 letras, sin palabras vacías ni interrogativos) y tipo (o `tipo_alt`). Ruido revisado a mano una vez en `docs/rediseno/sugerencias/ruido/`. `unit/sugerencias.test.js` no deja bajar la cobertura ni subir el ruido.
- Antes → después. Constitución: imprescindibles 7/18 (39 %) → 17/18 (94 %); total 8/35 → 21/35; ruido 22 → 3 (de 47 → 51 sugerencias). Olvido: imprescindibles 1/8 (13 %) → 8/8 (100 %); total 3/17 → 11/17; ruido 8 → 0 (19 → 14).
- Reglas nuevas: fechas como «¿Cuándo…?» (fecha completa, mes y año, rangos «entre 1793 y 1794», una por frase y en todas las frases del párrafo; «X fue el 14 de julio» ya no es «¿Qué fue X?»), datos con nombre («**Publicación:** …», «Muerte de Colón»), cifras («**169 artículos**», «Reformas: tres»), formado/constituido por, misión, sujeto a, corresponde a, «X es **Y**», «…, la **ilusión de fluidez**: …», autor y año, enumeraciones de negritas en un hueco, huecos sin la cola («…, del que…»), «¿Qué artículo establece que…?» (sin marcar), «¿Qué garantiza…?» y viñetas o subpuntos sin huecos sueltos. «**Término:** definición» ya se reconoce.
- En listas de idioma, fechas y cifras se miran antes que «Ordenar frase»; en un mismo bloque van primero. «Crear en» propone «Lista nueva» si el apunte no tiene lista (o la suya está archivada).
- Falta: la imprescindible «La Constitución fue ratificada en referéndum el {{…}}» sale como «¿Cuándo ratificó el pueblo español la Constitución Española?» (básica, por la regla de «¿Cuándo…?»), y el medidor no la cuenta porque espera un hueco. Sin hacer: distractores del apunte (opción múltiple), verdadero o falso, emparejar reformas y años, Explícalo y ¿Qué pasaría si…?
- Dudas: la regla de «¿Cuándo…?» da la vuelta a frases sencillas (sujeto + verbo en pasado); con presente («El tren sale el…») no pregunta.

## Retoques de Estadísticas
- Botón ‹ redondo para volver a Perfil en Estadísticas y en Ajustes (Ajustes no lo tenía). Periodos repartidos a lo ancho a 375 px, sin cortar «Todo». Eje de «Tu progreso»: separación según lo largo de la fecha (en 30 días, 2 fechas en el móvil). El filtro de listas ya agrupaba en Carpetas / Listas / Etiquetas (`optgroup`); no lo he cambiado.
- `sw.js` → `flaski-v136`.
- Pruebas al terminar: unitarias 186 de 186. Batería e2e completa con `--workers=100%`: 283 pasan, 11 omitidas y 6 fallan (icono con tu imagen, deslizar, amigos y 3 de sin conexión); repetidas solas pasan las 6 (10 de 10). Son de carga (8,6 min).

## Paso 2a · fase 8: editor de una pregunta y selector de tipos
- Editor (crear y editar): volver ‹, ruta (carpeta / lista), «Nueva pregunta» a mano; Lista con su icono; «Tipo de pregunta» con 4 segmentos fijos según el idioma de la lista (sin idioma: Básica · Con inversa · Huecos · Opción múltiple; de idiomas: Vocabulario · Básica · Escribir respuesta · el del idioma, o Dictado), con el último tipo usado en esa lista ya marcado; si eliges otro, ocupa el cuarto. En el móvil, en 2 filas (no se desplazan). «Más tipos» debajo.
- Campos con su nombre: los que dan la pregunta, grandes a mano; los demás «· opcional» (la Nota, «· solo la ves al dar la vuelta»). Fuera las etiquetas de colores por campo; el idioma va en el atributo `lang`. Etiquetas y Pista abajo; «Ctrl + Enter para guardar · Esc para cancelar».
- Vista previa azul como la tanda (variables de `body.in-study` también en `.pv-card`): anverso con «Ver respuesta» y reverso con los 4 botones; en el ordenador las dos caras, en el móvil «Anverso | Reverso». Si el tipo crea más preguntas, «Con «Doble sentido» también se crea la pregunta X → Y».
- Ordenador: Cancelar · Guardar y añadir otra · Guardar arriba a la derecha; móvil: abajo, fijos. El panel desde el apunte (fase 6) sigue igual.
- «Elige el tipo» (`S.pick`, también en «Varias de golpe»): sustituye el contenido de la hoja, con ‹ para volver; buscador; «Encaja con tu selección» (3 tipos, solo al crear desde un apunte); todos por grupos (Recordar con Sustantivo alemán junto a Vocabulario; Escribir; Elegir; Completar; Relacionar y ordenar; Con imagen; Tus tipos + «Crear un tipo»). Sin idioma, los de idiomas tras «Ver también los de idiomas»; con idioma, los de otro idioma tras «Ver todos». Tocar marca; «Usar «X»» (o Intro al buscar) aplica. «Entender» oculto hasta la fase 9.
- Desde una selección: Básica propone la frase con «___» como pregunta; «Hueco» usa solo su frase y enseña el hueco resaltado (`.ef-cz`).
- Dudas: «Pronunciación · Grabar · Generar» no existe (no hay grabación): no lo he añadido. El selector de etiquetas sigue siendo el de la fase 4e (lista entera), no «pegatinas con ✕ y + etiqueta».

## Remates de la misma conversación (cada uno con su e2e)
- Voz: sin voz para el idioma, el altavoz avisa «Tu dispositivo no tiene voz en X…»; «Probar» dice una frase en cada idioma de tus listas y cuáles tienen voz (`voz.spec.js`).
- Apunte: barra de lo seleccionado a 375 px con «Hecho» (la cursiva va en «…»); por debajo de 900 px «Sugerir preguntas» solo icono y la ruta cortada en palabra entera (`fitCrumbs`).
- Tanda: el contador avanza tras «Otra vez» (la que vuelve se suma: `ses.answered`); al salir vuelve a la lista, apunte o carpeta (`exitTarget`); «No lo sé» en las de elegir marca «Otra vez»; editar dentro de la tanda va con los colores de siempre (`study-sheet`); 2 botones a lo ancho; la puntuación tras un hueco va pegada.
- Biblioteca: «+ Carpeta nueva» al mover deja la lista dentro; carpeta vacía sin «Estudiar»; hojas con título a mano; «Sueltos», «Ninguna, en Biblioteca», «desde una tabla», «añadida»; nombre al pegar una lista; colores de carpeta = los 9 acentos (`FOLDER_COLORS`, los antiguos pasan al parecido); buscar también en las preguntas; etiqueta incluye listas con preguntas que la llevan; A-Z mezcla apuntes y listas; lista archivada «Archivada · Sacar del archivo»; «Borrar» en todas partes. Las nuevas de cada ficha cuentan una por nota, como «Estudiar».
- Pasada: mover una lista lleva su apunte; «Reiniciar progreso» pide confirmación; Explorar «Ya la tienes · Abrir»; un apunte nuevo vacío se descarta al salir; «filtrar en Biblioteca».
- Archivos: aviso al recargar tras restaurar una copia (modo local); Markdown con «#» y «##»; web exportada con colores y letras de Flaski (las letras se cargan de la app si hay conexión); «Destacado» con icono.
- Buscar sin tildes ni diéresis, con la ñ como ñ (`fold` en `comun.js`). Ajustes aún no tiene buscador (llega en el paso 8).
- Corrección: «Casi · Revisa las letras especiales» (también ß→ss en cualquier idioma, antes solo en alemán), «Casi · Te falta el artículo» / «Sobra el artículo», en japonés kana o lectura; «yaptim» por «yaptım» pasa de mal a casi. Títulos largos con letra más pequeña (>40 y >70 letras).
- Duda: el artículo cuenta como «casi» aunque la plantilla pida escribirlo (checkTyped no sabe qué pregunta la plantilla); con der/die/das solo, no.
- `sw.js` → `flaski-v147`.
- Pruebas al terminar: unitarias 187 de 187. Batería e2e completa con `--workers=100%`: 350 pasan, 12 omitidas y 8 fallan. Repetidas solas: 2 eran fallos de verdad (la vista de furigana del editor, rota por una comilla al añadir el hueco resaltado, y la prueba de Anki, que buscaba el «Reiniciar» antiguo), ya arreglados; las otras (actualizar, deslizar) pasan solas, de carga. 13 de 13 tras el arreglo.

## Paso 3 · fase 9: mapa, Repasar, entender y logo
- Remate del paso 2: el selector de etiquetas del editor de una pregunta va con pegatinas con ✕ y «+ etiqueta» (buscar o crear; sin buscar, las 6 que más usas).
- Mapa (`js/mapa.js`, puro, y `js/pantallas/mapa.js`): «Lista | Mapa», «Apuntes | Mapa» y «Apunte | Mapa». Casillas, por este orden: artículos si al menos el 30 % los citan («art. 14» no es «art. 140»; «arts. 14 y 15», «artículos 14 a 16»; un rango de más de 5, solo el primero; si la pregunta no cita ninguno, el del título de su apartado), apartados del apunte, notas con varias plantillas (el campo principal de cada tipo) o una por pregunta (sin mapa si más de la mitad pasan de 40 letras). En las listas de idiomas, por secciones Kanji · Palabras · Frases · Otras. Estado: «Se te resiste» con 3 fallos en las 5 últimas o la última fallada (con las dos últimas acertadas, como mucho «A medias»); la casilla, la peor de sus empezadas. Ficha (hoja en el móvil, aviso en el ordenador), elegir varias (mantener pulsado o Ctrl + clic), «Se te resisten» y «Practicar lo que se resiste» (cuenta preguntas; al salir vuelve al mapa).
- Repasar en el apunte (`js/pantallas/apuntes-repaso.js`): tapa negritas (no las que acaban en «:») y los huecos de sus preguntas; Espacio o tocar destapa, 1–4 valoran y cuentan como repaso si ya es pregunta (`recordAnswer`, sacado de `grade`). Al acabar, o al salir a mitad, propone crear lo fallado como «Hueco».
- Atajo `a >> b` / `a <> b`: Enter crea (Básica o Doble sentido, marcadas con `fields.qs` para seguir a la línea si la cambias), Esc lo deja como texto. Botón «pregunta» sobre el teclado en el móvil.
- Entender (`js/entender.js`, puro): «Explícalo» (Escribir, Dictar si el navegador puede, Pensarlo; ideas marcadas solas comparando raíces sin tildes, plural ni femenino) y «¿Qué pasaría si…?» (↑ = ↓ por efecto y «Comprobar»; sin efectos, como Explícalo). Botones Todavía no · A medias · Lo sé explicar (= 1, 2, 3) con el propuesto; «Lo que entiendes» al acabar la tanda. Las básicas de los temas de ejemplo sin editar pasan a su tipo al arrancar (mismo id y progreso; idempotente).
- Logo: favicon, apple-touch-icon y manifest (any y maskable) con los archivos de `docs/rediseno/logo` (sin los metadatos en los SVG); la marca en línea con `currentColor` (acento) en la cabecera móvil y la barra lateral. Se borran los iconos antiguos.
- Remates de la misma conversación (cada uno con su e2e): barra del editor en el móvil con «⋯ Más», «Pista» encima del campo, etiquetas sin «#» y de 24 letras, apuntes vacíos borrados al arrancar y fuera de «Lo dejaste aquí», kanji suelto grande (112/140 px) y lecturas kun → on en minúscula, «Orden de trazos» con estilo nuevo, el cuadro parpadea al fallar un trazo y la pista sale al segundo fallo, listas con el mismo nombre con su carpeta en los selectores, nada se sale de lado a 375 px, «Ver en el apunte» baja al bloque.
- Prueba arreglada: `hoy.spec.js` sumaba 50×24 h para el examen y fallaba el día del cambio de hora; ahora suma días de calendario.
- `sw.js` → `flaski-v158`.
- Dudas: el historial de respuestas no tiene columna libre (jsonb), así que no se guarda lo que escribiste o elegiste al fallar: sin «pusiste…» en la ficha ni «Los confundes» (haría falta cambiar el esquema). «Me cuesta» no existe en los apuntes, así que Repasar no lo tapa. La pantalla «Lo que entiendes» del diseño queda como sección del fin de tanda.
- Pruebas al terminar: unitarias 202 de 202. Batería e2e completa con `--workers=100%`: 414 pasan, 15 omitidas y 9 fallan. Repetidas solas: 1 era de carga (actualizar) y 8 fallos de verdad, ya arreglados: en el móvil la barra de formato tapaba «⋯ Más» del editor (y las pruebas de Anki y «Reiniciar progreso» no lo abrían), las etiquetas en minúscula, «Escribir | Repasar» a 44 px en pantallas táctiles y `plan.spec.js` con el cambio de hora. Pasan las 9 (y 35 de 35 en sus archivos).

## Paso 4 · Plan de estudio completo, Explorar y simulacro
- Remates de Explorar antes de empezar (e2e `explorar.spec.js`): «La tienes» en la fila y sin «Se copiará…» en su hoja, «48 preguntas · tú tienes 56», vista previa con una fila por nota, «Aún no has compartido ninguna…» y un solo «Ninguna lista con «…»» al buscar.
- Datos (`prefs.plan`): `week` ({ mon…sun: minutos }, null = sin semana), `special` y `stages` (listas con `id` y `at`; lo borrado queda como `{ id, deleted, at }`), `simGoal`, `sim` (últimos ajustes de cada examen), `startDone`, `lateOk`; en cada examen, `lastWeek` y `after`. `prefs.sims`: simulacros terminados. Las fechas son días «AAAA-MM-DD» en hora local. Al guardar en la nube, `saveSettings` lee lo que hay y junta por id `sims`, `plan.special` y `plan.stages` (`mergeSynced` en `prefs.js`; gana el `at` más reciente); igual con lo pendiente de la cola sin conexión. Los simulacros guardan el detalle de los 10 últimos de cada examen (`trimSims`). Sin cambios en Supabase.
- Cuentas (`plan.js`, puras, `unit/temporada.test.js` con el 26 de octubre y el último domingo de marzo): `minutesOn` (día especial › semana › null), `newOn` (nuevas de Ajustes × minutos del día ÷ media de la semana, entre la mitad y el doble; libre = 0), `stageOn`, `nodesOn` (nodos de siempre + etapa vigente + «la última semana, solo repasos» + `after`), `topicOrder` (en cada carpeta con orden, nuevas solo de la primera lista sin terminar; las que no están en el orden van al final) y `simulate` (proyección día a día de las nuevas, sin repasos). Poco · Normal · Mucho = pesos 0,5 · 1 · 2 (1 : 2 : 4, Normal = el peso de siempre). Los pesos de antes (porcentajes) pasan a niveles al arrancar (`normalizeWeights`).
- a) Tu semana (toca un día; «Igual todos los días»; «Quitar tu semana»), días especiales (hoja con nombre, fechas y minutos), Hoy toca (barra por carpeta + repasos, el tema que toca y «Empezar la tanda · N min»; día libre: «Estudiar igualmente»). La tanda de Hoy usa los minutos del día (`tandaMinutes`); en Hoy, «Hoy, 45 min · tu semana» lleva al Plan. Exámenes: lista, «Nuevo examen» (de qué, calendario y «≈ N nuevas al día bastan…») y ficha (vas bien / así no llegas, cómo llevas el temario, lo que más se te resiste con el mapa, la recta final, después del examen, cambiar fecha y quitar).
- b) Etapas: tarjetas en línea de tiempo, hoja de la etapa (nombre, fechas, «Cuánto de cada cosa» con ≈ nuevas, «X, en este orden» arrastrando por el asa, fecha límite por tema, «repartir fechas solas» y el aviso «bien / ojo»), tira en el móvil y planificador en el ordenador (Meses | Semanas, barras por nivel día a día, exámenes, días especiales con tinte ámbar, línea de hoy, panel de la barra elegida y arrastrar sus bordes). «Cómo arreglarlo» con 3 arreglos simulados (subir el nivel, alargar la etapa o, sin etapas, subir las nuevas al día; un día libre pasa a tener tanda) con «Aplicar», «Deshacer» y «Lo dejo así». «Hagamos tu plan» (15 min · 30 min · 1 h · a mi aire) propone por examen «Acabar el temario» (hasta 8 días antes) y «Recta final»; tras el último examen, ninguna. «Qué estudias» sustituye al árbol de antes: con una etapa vigente cambia el nivel de la etapa y lo dice («Cambia el foco en la etapa «X»»). Sin etapas ni semana, todo como antes.
- c) Explorar: filtros por objetivo (`objetivo` en `decks/index.json` y en los temas), el tema «Por qué se te olvidan las cosas» destacado («Añadir y empezar» = tema + tanda de 5 min; «Ver el tema»), idiomas en tarjetas con «+», oposiciones en filas, «De tus amigos» (listas públicas de tus amigos; en local, las tuyas), «De la comunidad» e importar. Las listas de un tema de ejemplo llevan `source: 'tema:…'`.
- d) Simulacro (`pantallas/simulacro.js`): bloque en la ficha del examen (gráfica con «tu objetivo», «Vas subiendo», «Los últimos»), «Preparar» (temas, 20 · 40 · 60 · 100, tiempo, ⅓ · ¼, solo test), la pregunta en el azul de la tanda sin corregir (A–D, «Dejar en blanco», «Revisar luego», barra por pregunta, reloj ámbar a 5 min y entrega sola a 0), «¿Entregas ya?», «¿La sabías?» para las de dar la vuelta, la nota (penalización, por tema, tus simulacros), «Las respuestas» con filtros y «Ver en el apunte», teclado y columna derecha en el ordenador, «Simulacro de la semana» en Hoy (examen a menos de un mes) y el simulacro a medias en este navegador (`flaski-simulacro:<cuenta>`, reloj parado con la app cerrada). Entran test, hueco con opciones, respuesta numérica y escribir la respuesta («casi» cuenta como acierto). Los fallos adelantan su `due` a mañana sin tocar el intervalo.
- Remates (cada uno con su e2e, `remates-plan.spec.js`): «La tienes» por el origen del tema (de respaldo, por nombre), huecos «[…]» en la vista previa, mínimo de 6 s por pregunta en las estimaciones (`MIN_PACE`), el simulacro enseña la nota al entregar, «Los últimos» abre «Las respuestas», «ir a la 1 para revisar» y el simulacro a medias tiene prioridad sobre la bienvenida y Novedades al abrir.
- `sw.js` → `flaski-v164`; `pantallas/plan.js` y `pantallas/simulacro.js` en `SHELL` y `modulepreload`. Capturas para revisar a ojo: `SHOT=1 npx playwright test e2e/capturas-plan.spec.js`.
- No hecho: «Carrera» no sale (no hay contenido de carrera); la nota de actividad de amigos («Carmen la repasa casi cada día») no existe como dato. Novedades y capturas, al final del rediseño.
- Dudas: los minutos de un día cambian las nuevas solo frente a la media de tu semana, así que «más minutos todos los días» no da más nuevas (por eso el tercer arreglo convierte un día libre). El planificador pinta de hoy en adelante. «En este orden» se reordena arrastrando (sin teclado). La proyección no cuenta repasos.
- Pruebas al terminar: unitarias 212 de 212. Batería e2e completa con `--workers=100%`: 449 pasan, 23 omitidas y 6 fallan (10,7 min). Repetidas solas: 1 era de verdad (`tanda-corta` esperaba «8 min» y ahora los minutos se redondean hacia arriba: «9 min · 50 preguntas», prueba al día) y las otras 5 (actualizar ×2, icono con tu imagen, importar PDF) son de carga. Pasan las 12 en sus dos proyectos.

## Paso 5 · Perfil, Ajustes, Amigos, papelera y borrar la cuenta (hecho)
- Remates del simulacro (`simulacro.spec.js`): gráfica con escala de mínimo a máximo (notas y objetivo, 1 punto de margen, al menos 4), opción elegida en blanco con la letra en círculo, aviso «Dejaste N en blanco…» solo con penalización, fallos y algo en blanco (nunca con 0), «−1,25 netas · la nota no baja de 0», «Repasar los fallos» vuelve a la nota (`back` en `startSession`) y «te quedan N min» hacia abajo («te queda menos de 1 min»).
- a) Perfil: nombre con lápiz (hoja), racha y comodín, 4 cifras, «Ver tus estadísticas», «Tu estudio» (plan con «vas bien / no llegas», estadísticas, amigos con nombres y «N ánimos»), «Flaski» (Ajustes, Novedades «de octubre de 2026», presentación), cuenta y «Créditos y licencias» en hoja. Ajustes: Apariencia · Tanda · Avisos · Idioma y voz · Hoy · Repaso · Datos, buscador (principio de palabra, sin tildes, pestaña encima, resaltado, «Ya no está en Ajustes»), índice fijo en el ordenador, «Topes de seguridad» y «Con cuidado».
- Ajustes movidos: duración de la tanda → Plan («Tu semana») y «Tanda de N min» de Hoy; «Abrir el plan» → enlace en la intro de Tanda; nuevas al día y repasos máximos → Repaso › Topes de seguridad; meta → Hoy; orden de las nuevas y mezcla → Tanda; tu idioma → Idioma y voz; «Ver las últimas novedades» → Perfil; «Tu nombre» → lápiz de Perfil. No se ha borrado ninguno.
- Remates del Plan (`remates-plan.spec.js`): «solo repasos» la última semana solo a más de 21 días y no activable dentro de ella; arreglo «Que sigan entrando nuevas…»; los arreglos que no mejoran no salen; la hoja del examen descuenta días libres y la última semana; «Hagamos tu plan» con recta final del 25 % (2–7 días), nuevas según el rato (¼ de la tanda) y, si no llega, sube las nuevas y lo dice; `MIN_PACE` 10 s.
- Remates sueltos: logo solo en el icono y al entrar (`signed-out`); «pregunta N de M» en blanco al 85 % (`contraste.spec.js`, nueva); zonas táctiles de 44 px con `::after` (el apunte en el móvil táctil tiene 36 px de margen para que quepan sin tapar el texto); texto pegado con las reglas de un archivo (`plainTextToPage`, `boldLabels`; en `suggest.js`, dos fechas unidas por «y», sujeto de la frase anterior, «tiene N unidades» y un hueco por frase en definiciones de varias frases; la batería no cambia: 17/18 y 8/8); «Trae tu tema»; «1 min»; «te las sabes» = consolidadas; aviso del nombre; meses desde el actual; esqueleto de Hoy al cargar; «correo».
- b) Amigos: «Esta semana» (todos, el nombre abre sus opciones), «Te han animado» (ánimos sin ver de `my_cheers` y amistades de esta semana; «X y tú ya sois amigos», porque no se sabe quién usó el código de quién), «Invita a alguien» (código a mano, «N amigos»), peticiones, enviadas y privacidad. «¡Bravo!» espera el cambio en Supabase; mientras, quien ya estudió hoy sale con «✓ hoy».
- «¡Bravo!» (ámbar, con la llama) para el amigo que ya estudió hoy; «Te han animado» con `recent_cheers` (7 días, también los vistos; sin la función, los sin ver). Remate: el modo elegido en «Explícalo» (Escribir, Dictar, Pensarlo) era blanco sobre blanco.
- Esquema (`schema.sql`, versión 11): `deleted_at` en decks, pages y folders (antes de las políticas, que ya la usan: la lectura pública de listas y preguntas exige `deleted_at is null`), `cheers.kind` con 'bravo', `recent_cheers`, consulta que lista las claves hacia auth.users y bloque que pasa a «cascade» la que no lo sea, y `delete_my_account`. Función `recordatorio`: «¡Bravo!».
- c) Papelera (`pantallas/papelera.js`): borrar una lista, un apunte o una carpeta (entera) la marca con `deleted_at`; al cargar, lo marcado sale de S (con sus preguntas y su progreso) a `S.trash`. Aviso oscuro de 6 s con «Deshacer» (`toastAction` en `comun.js`). Papelera desde Biblioteca («Papelera · N») y Ajustes › Datos (resumen y «Abrir la papelera»): filas con lo que queda (en rojo con 3 días o menos), «Recuperar» (al momento; con hoja «Dónde» si es carpeta o su sitio ya no existe; «(recuperada)» si el nombre ya está), «Borrar ya» y «Vaciar» con confirmación. Lo de más de 30 días se borra al abrir (no con la copia sin conexión). Una pregunta borrada se quita al momento y se borra de verdad a los 6 s si no se deshace (o al cerrar la app).
- Borrar la cuenta (`pantallas/borrar-cuenta.js`): «Descarga tu copia» (queda marcada), lo que se borra con los números (también lo de la papelera) y «BORRAR» (da igual mayúsculas). Primero las imágenes por la API de Storage, luego `delete_my_account`; si algo falla, se dice y la sesión sigue. Pantalla final con el logo, sin la frase del correo (no hay forma de mandarlo). En local, borra lo de este navegador.
- d) Cierre: recorrido de todas las pantallas a 375 y 1440 px en claro y oscuro (capturas y medida de lo que se sale de lado). Arreglado: la píldora de la papelera a 375 px, columnas de la papelera, iconos de tipo, «BORRAR» en oscuro, el input del buscador de Ajustes y los atajos de la tanda (85 % de blanco, en `contraste.spec.js`).
- Pruebas nuevas: `perfil-ajustes`, `contraste`, `remates-paso5`, `papelera`; ampliadas `simulacro`, `remates-plan`, `amigos`, `tactil`, `logo`, `entender`, `bienvenida`. Las de borrar carpeta y lista cuentan ya con la papelera.
- Dudas: «Nuevas al día» (Topes de seguridad) es la base del plan; un día con más minutos puede dar hasta el doble. Las imágenes de una carpeta borrada del todo no se limpian aún. «X y tú ya sois amigos» en vez de «se unió con tu código» (no se sabe quién usó el código).
- Arranque en Safari (se quedaba en el esqueleto con «Importing binding name 'toastAction' is not found»): Safari guarda en memoria los módulos y, al recargar, mezclaba un `comun.js` viejo con módulos nuevos, aunque el servidor diga «no-store»; el arreglo de recuperación solo reconocía el mensaje de Chrome. Ahora un script de `index.html` crea un import map que manda cada módulo a «…?v=N» (y precargas con esas direcciones); si aun así se mezclan, reconoce los mensajes de Chrome, Safari y Firefox, borra lo guardado y recarga con una marca nueva en las direcciones. `tests/version.mjs` escribe la lista de módulos y la versión (hay que ejecutarlo tras subir `VERSION`; una unitaria lo vigila). Vigilante: si a los 15 s sigue el esqueleto, dice en qué paso se ha quedado y qué error ha saltado. E2e en WebKit: `actualizar-safari.spec.js` (hace falta `npx playwright install webkit`).
- Remates del móvil de Eva: el aviso de sincronización flota arriba sin mover la tanda (`sincronizar.spec.js`); Explorar abre el apunte al añadir un tema (con cuenta, `addTema` se quedaba con lo que devolvía la cola de envíos) y «La tienes» lo abre siempre (`explorar-tema.spec.js`); en pantallas táctiles ningún campo baja de 16 px (Safari hacía zoom al tocar una tabla, el pie de una imagen o las propiedades y la página se movía de lado; el margen de 36 px no desbordaba), y el apunte en el móvil lleva `overflow-x: clip` y `overscroll-behavior-x: none` (`apunte-ancho.spec.js`).
- Tema de ejemplo «Por qué se te olvidan las cosas»: una pregunta de cada tipo general (14 notas, 17 preguntas; «Tapar partes de una imagen» con un SVG de la curva del olvido dentro del propio JSON, guardado con el id `tema-curva-olvido`), cada una unida a su apartado («bloque» en el JSON). `migrateTemas` (al abrir) cambia la lista de quien ya lo tenía: quita las del tema de antes que siguen tal cual (`temas/…v1.json`), añade las nuevas y deja con su id y progreso las que coinciden en texto; lo tuyo no se toca (`tema-memoria.spec.js`).
- Últimos remates: contraste ≥4,5:1 del día especial de la tira, «Normal» en las barras de etapa (texto oscuro), los rojos sólidos (`#C92F2F`) y el «↑ N» verde (en `contraste.spec.js`, que ahora mide contra el fondo real); etapa de 1 día de al menos 28 px en la tira del móvil; el buscador de Ajustes ya no dice «Ningún ajuste» junto a «Ya no está en Ajustes».
- Imágenes de lo borrado del todo: «Borrar ya», «Vaciar» y la limpieza de 30 días borran del navegador y del almacén «media» las imágenes que ya no usa ninguna pregunta, apunte ni carpeta (tampoco lo demás de la papelera); al borrar la cuenta, además, las de este navegador (`clearImages`). E2e con la nube simulada en `papelera.spec.js`.
- Nuevas al día: un día con más minutos da más, como mucho el doble (ya lo hacía `newOn`); el Plan lo explica en «Hoy toca»: «Hoy 20 nuevas: tienes 90 min, más que un día normal (39 min). Como mucho, el doble.».
- El aviso de abajo (toast) ya no se come los toques de lo que tapa (solo su botón «Deshacer» / «Ver»): tapaba «Ver respuesta» unos segundos.
- Pruebas inestables: lo común era esperar 5 s con 8 navegadores a la vez, recargas cuyo evento `load` podía haber pasado ya, una espera fija de 6,5 s y el esqueleto con una demora fija. Ahora `playwright.config.js` usa la mitad de los núcleos, 10 s por comprobación y 60 s por prueba; las recargas se esperan junto con lo que las provoca; la nube simulada no responde hasta que la prueba ha visto el esqueleto. La batería se lanza con `npx playwright test` (sin `--workers`).
- Pruebas al terminar: unitarias 213 de 213; batería e2e completa, en verde a la primera: 529 pasan, 27 omitidas, 0 fallan (9,6 min).
- `sw.js` → `flaski-v181`.

## Paso 6 · remates y logo B (hecho)
- Repasar en el apunte: «✕ Salir de repasar» en el panel de «Destapar» (móvil) y en el panel de al lado (ordenador); «Escribir | Repasar» fija arriba mientras repasas (el panel del ordenador se pega debajo); Esc ya salía y ahora también el botón atrás: al entrar en Repasar se añade una entrada al historial (`history.state.flaskiRv`), que se quita al salir por otro sitio (`apunte-repasar.spec.js`).
- Minutos de verdad (`tandaFit` en `estudio.js`): si hoy tocan menos preguntas de las que caben, «Empezar la tanda · N min» del Plan dice lo que tardarás en ellas (como ya hacía Hoy). En Hoy, si sobran 2 min o más y quedan nuevas: «Te sobra tiempo: ¿aprendes 10 nuevas más?» (suma 10 a las de hoy y vuelve a pintar Hoy; `minutos-de-verdad.spec.js`; `plan.spec.js` al día).
- Pregunta de entender: ya estaba arreglado en el paso 5 (blanco con el texto del color de la tanda); comprobado en claro y oscuro, con ratón encima y con foco. Sin cambios.
- Novedades: se puso el vídeo y se quitó en el acto, a petición de Eva (commit y su «revert»). Queda para más adelante. Al ponerlo, ojo: el archivo de 720 dura 1 min 56 s y pesa 4 MB (el LEEME dice 40 s y 1,2 MB), y conviene guardarlo en una caché aparte del SW que responda por trozos («Range»), porque Safari lo pide así.
- Logo B: los 10 iconos de `docs/rediseno/logo-b` en `icons/` (sin los metadatos: `<metadata>` en los SVG y el bloque `caBX` en los PNG, que pesaba 5,7 KB en cada uno), los 12 puntos nuevos en la marca de entrar y en la pantalla de cuenta borrada (`borrar-cuenta.js`). No sale en otro sitio: la bienvenida usa una «F» de texto. `logo.spec.js` comprueba que la fila de arriba sube de opacidad y tamaño, en la marca y en `flaski-icono.svg`.
- `MENSAJES.md`: la batería se lanza con `npx playwright test` (sin `--workers`); paso 6 hecho.
- Carrera arreglada (salió en la batería): si cierras la hoja de una carpeta mientras se guarda la imagen que acabas de elegir, la imagen ya no se queda guardada sin que nada la use (`apuntes.spec.js`, prueba nueva; la de «icono de carpeta con tu imagen» esperaba al cambio equivocado y pulsaba «Cancelar» antes de tiempo).
- `sw.js` → `flaski-v187`.
- Pruebas al terminar: unitarias 213 de 213. Batería e2e completa: 533 pasan, 27 omitidas y 2 fallan (15,8 min, con otros procesos leyendo a la vez: el tiempo no vale como medida). Repetidas solas: la de kanji a mano era de carga (6 de 6) y la del icono de carpeta, la carrera de arriba (24 de 24 tras el arreglo).

## Remates tras el paso 6 (cada uno con su commit y su e2e)
- Batería del paso 6 repetida con la máquina libre: 537 pasan, 27 omitidas, 0 fallan, a la primera (14,2 min).
- Hecho por hoy (`dayDone` en `estudio.js`): el día se cumple con tus minutos o la tanda que te tocaba (respuestas de hoy ≥ lo que cabía, a tu ritmo de antes de hoy, o los minutos respondiendo), empieces donde empieces. Hoy y el Plan dicen «Hecho por hoy · N preguntas · M min»; lo que queda pasa a mañana, como enlace («Quedan 13 repasos · otra tanda de 5 min»). «Hoy toca» cuenta las nuevas que quedan (`hecho-por-hoy.spec.js`).
- Errores con «Detalles» (`fail(e, qué hacías)` en `comun.js`): qué hacías (si no se dice, el último botón tocado, con el título de su hoja), el error de Supabase (code, message, details, hint) o del navegador (QuotaExceededError…), hora, versión y modo, sin claves, correos ni ids de otros; «Copiar». Con el navegador lleno: «No queda espacio en este navegador» y «Descargar una copia». Un error sin mensaje (Safari) lo dice (`errores.spec.js`, con `srv.failWrite` en `nube.js`).
- Safari, «Añadir y empezar» con cuenta: WebKit no deja guardar un Blob en IndexedDB (la transacción falla con error null). `media.js` guarda entonces sus bytes; si ni así, la imagen se queda en memoria, con cuenta se sube directamente y se reintenta, y el tema se crea igual. Un tema a medias se completa al volver a pulsar (Explorar ya no dice «La tienes» con la lista vacía y `addTema` reutiliza el apunte y la lista vacía; también la que ya tiene Eva en su cuenta). `derivedId` usa `js/sha256.js` si no hay `crypto.subtle` (por la wifi con http://), con el mismo resultado (`safari-tema.spec.js` en WebKit con y sin cuenta, `unit/sha256.test.js`).
- «Guardar y otra»: la hoja de la siguiente se abre al momento; con cuenta, lo que se escribía mientras se guardaba la anterior se perdía (`guardar-y-otra.spec.js`).
- REPASO-25oct: 1 día libre (`normalNew`: el plan cuenta con las nuevas de un día normal; Hoy dice «Hoy es tu día libre» con la tanda como opción), 2 iconos `message-square` y `clipboard` (y `unit/iconos.test.js`, que busca todos los nombres, también los de ayudantes con un parámetro `ic`), 3 Biblioteca (16 px y el «+» centrado), 4 apunte (hueco para la insignia y «Estudiar N» como botón secundario), 5 Estadísticas (atrás y título en la misma fila), 7 sin emoji (`unit/textos.test.js`), 8 accesibilidad (roles, nombre de la barra de la tanda, `.hm-scroll` con teclado y 4,5:1 con `--red-ink`), 9 «tema 1» sin partir, 10 barra de «Hoy toca» en oscuro (`repaso-25oct.spec.js`, `dia-libre.spec.js`). El 6 (Novedades) queda para el final, lo decide Eva.
- Visto una vez, solo en el código anterior y con la máquina muy cargada: tras «Guardar» en el editor de preguntas, la hoja tardó más de 10 s en cerrarse. No se ha vuelto a ver.
- `sw.js` → `flaski-v201`.

## Paso 7+8 · sugerencias (hecho; mensaje en `PASO-7-8-SUGERENCIAS.md`)
- Informe de antes: `docs/rediseno/sugerencias/informe-antes.txt`. La batería (`node sugerencias.mjs`, desde `tests/`) cuenta ahora repetidas visibles, mal escritas, huecos de más de 25 palabras, tipos y marcadas de entrada; la cobertura cuenta también las «otras formas de preguntarlo» (plegadas) y aparte, solo las visibles.

### Paso 7+8 · parte 1 hecha (arreglar lo que hay)
- 1 Gramática (`fixGrammar` y `grammarIssue` en `suggest.js`, en `add()`): «cuántos/cuántas» con el género (rosaenlg-gender-es en `js/vendor/gender-es.js`, MIT, se carga con `import()` al abrir las sugerencias, no está en SHELL; acierta poco con «fase», «ley», «reforma», «-sis», así que van antes unas listas propias); «de el / del el / a el»; «El golpe de Estado del 18 de julio de 1936 provocó…» → «¿Cuándo fue el golpe de Estado que provocó…?»; el sujeto de la frase antes que el título («¿Cuántas fases tiene la mitosis?»); fuera «ese mismo mes», «dicho», «Estas se utilizarán…», «…, este será…».
- 2 Tabla «Pregunta | Respuesta» con la pregunta tal cual; `termQuestion`: «Descubrió la **curva del olvido**: …» → «¿Qué es la curva del olvido?», «Efecto de espaciado» → «¿Qué es el efecto de espaciado?», genéricos con contexto («¿Cuál es la estructura de la Constitución Española?»). En apuntes en otro idioma, el término tal cual.
- 3 Una por dato (`onePerDatum`): misma parte y misma respuesta, huecos y «¿Qué artículo…?» de la misma frase, o la misma respuesta larga en otra parte; se enseña la de más puntuación de donde sale antes, y las demás van en `alts` («Otras formas de preguntarlo (N)», plegadas en la hoja; un toque la cambia, y se conserva al actualizar).
- 4 Huecos cortos (`trimCloze`): el trozo con el hueco (por «;», «, y», «, que»), con el sujeto delante, hasta 25 palabras; si no queda una frase con verbo, no sale. `verbHole`: nunca un hueco en un verbo.
- 5 Listas de 5 o más: un hueco por elemento (los demás, acortados y en su orden) y «¿Cuántos principios garantiza la Constitución (art. 9.3)?», con la lista entera plegada debajo.
- 6 Marcadas de entrada: 0,75 o más, como mucho 15 (`MAX_PRESELECT`); «Recomendadas» son las marcadas (`rec`). Lápiz a la vista en cada fila y «Si la escribes con tus palabras, la recordarás mejor».
- Remates de la revisión de la parte 1 (dos commits): en cada grupo, el hueco en el predicado antes que el que tapa el sujeto (y, como antes, la de donde sale antes en el apunte); «¿Qué artículo…?» va aparte (otro dato); dos huecos se juntan solo si tras recortar siguen en la misma frase. Títulos que no son términos («Y dormir», «Cómo…», «Recordar enseña…») sin pregunta, y `grammarIssue` cuenta «¿Qué es el Y…?» y los «..». Listas con título: «¿Cuáles son algunas dificultades deseables?», subpuntos: «¿Qué incluye el núcleo?». En la hoja, los huecos enseñan debajo solo lo que falta; cada otra forma lleva «Usar esta» (44 px) y avisa «Cambiada · Deshacer»; el texto de origen acaba en «…» en el móvil. La esperada del referéndum admite `basic` (pedía un hueco y la buena es «¿Cuándo ratificó…?»).
  - Imprescindibles visibles, Constitución: 12/18 → 16/18 (con las plegadas, 17/18 → 18/18; total 21/35 → 22/35; visibles 37 → 46, porque «¿Qué artículo…?» ya no va plegada y los dos huecos del art. 1.1 se ven). Olvido: 8/8 visibles; 13 → 12 sugerencias (fuera «¿Qué es el Y dormir?»). Mal escritas, con la regla nueva: 1 → 0.
- Remates revisados en el navegador (un commit con su e2e cada uno, en `sugerencias.spec.js` con el apunte de la Constitución): 1 «Usar esta» ya no devuelve la lista arriba en el ordenador (`#sugMain` de 925 a 0): `openSheet` ponía el cursor en el primer campo, que era la primera casilla; ahora solo campos de texto y con `preventScroll`, y la fila cambiada se queda a la vista con sus otras formas abiertas (@ambos). 2 El origen de una pregunta de tabla es su fila con « · » («¿Qué lengua es oficial en todo el Estado? · El castellano (art. 3.1)»), no el Markdown. 3 El origen empieza en el trozo de la frase con la respuesta («…y reconoce y garantiza el derecho a la autonomía…», «…Todos los españoles tienen el deber…») y corta a 90 letras desde ahí. 4 El apartado va en su propia línea (sin «·» suelto al bajar de línea en el móvil). 5 «Añadir › Desde un apunte» desde una lista volvía a «+ Lista nueva» la primera vez (`lista.spec.js:65`): `openSuggestions(only, { deckId, select })` usa la lista al crear la hoja, también cuando la abre tras cargar el género; lo mismo para las marcadas de la primera vez (`cuenta.js`). e2e nueva con el género retrasado.
- Números (antes → después). Constitución: 51 → 37 visibles (56 con las plegadas); imprescindibles 17/18 = 17/18 (12/18 solo visibles); total 21/35 = 21/35; repetidas visibles 9 → 0; mal escritas 5 → 0; huecos de más de 25 palabras 5 → 0; marcadas 40 → 15. Olvido: 14 → 13; imprescindibles 8/8; total 11/17; marcadas 13 → 9.

### Paso 7+8 · parte 2 hecha (reglas nuevas)
- 0 Batería: `apuntes/` con los tres textos pegados (`biologia-celula.md`, `historia-segunda-republica.md`, `ley-39-2015.md`, por `plainTextToPage`) y sus esperadas (12, 11 y 12, con regla y prioridad). La esperada del referéndum (Constitución) admite `basic`; en «Explícalo» y «¿Qué pasaría si…?» la batería compara solo la pregunta (las ideas clave son texto libre).
- 1 Frases clave sin formato (`keyScore`, `plainRules` en `suggest.js`): puntos de la tabla del estudio; de 2 o más, un hueco en lo que dice la frase. Reglas: plazo («¿Cuál es el plazo máximo para resolver y notificar?», «Cuando las normas… no fijen el plazo máximo, ¿cuál es?», «interponerlo» con el sujeto de la frase de antes), órgano («¿Ante qué órgano se interpone…?»), enumeración con número («¿En qué tres etapas se divide la Segunda República?», ordenar; el «¿Cuántas…?» va plegado debajo cuando la pregunta ya dice el número), persona y hecho («¿Quién defendió…?», «¿Qué impulsó el gobierno de Manuel Azaña durante…?», «¿En qué año se ejerció…?»). Y para cualquier apunte (`anyRules`, también con negritas): «¿Según qué…?», citas «(Autores, año)», el sujeto de la frase de antes, «no es lo mismo que», el sujeto en negrita y lo que hace, «¿Qué regula el artículo N?», emparejar «en AÑO, el art. N».
- 2 Opción múltiple (`withChoices`): 2 o 3 incorrectas del mismo tipo (fecha, año, plazo, cifra, artículo, ley, persona) de otras sugerencias; sin 2, nada. Plegada con su pregunta, nunca la visible.
- 3 Verdadero o falso: otra respuesta del mismo tipo en su sitio, la excepción negada («salvo», «solo», «no cabrá ningún otro…, salvo») o una palabra cambiada por su pareja del apunte («procariotas» ↔ «eucariotas»); la explicación dice la buena. Plegado con su pregunta.
- 4 Para entender (nunca marcadas): «Por eso» / «porque» → «Explícalo: ¿por qué…?»; «a diferencia de» / «en vez de» → «¿En qué se diferencian…?»; «si…» → «¿Qué pasaría si…?» con efectos «Lo que recuerdas en unos pocos días: baja».
- 5 es-compromise (MIT, 0.3.1): probado y descartado. Marca como verbos «repaso» y «Valores» y no ve «aplana» ni «Espaciar» (las reglas propias ya aciertan en los casos de la batería), pesa 317 KB minimizado y solo cargarlo tarda 1,1 s en Node: ya supera los 300 ms pedidos para abrir la hoja. No se ha copiado a `js/vendor/`.
- La hoja con la Constitución abre en unos 230 ms la primera vez (con la carga del género) y en unos 60 ms después (Chromium de las pruebas).

| | Antes (informe-antes) | Después (informe-despues) |
|---|---|---|
| Constitución · imprescindibles | 17/18 | 18/18 (16/18 visibles) |
| Constitución · total esperadas | 21/35 (60 %) | 27/35 (77 %) |
| Olvido · imprescindibles | 8/8 | 8/8 (8/8 visibles) |
| Olvido · total esperadas | 11/17 (65 %) | 13/17 (76 %) |
| Célula (pegado) · esperadas | 2/12 (2 sugerencias, 1 mal escrita) | 10/12 |
| Segunda República (pegado) · esperadas | 1/11 (1 sugerencia, mal escrita) | 10/11 |
| Ley 39/2015 (pegado) · esperadas | 0/12 (0 sugerencias) | 11/12 |
| Repetidas visibles (Constitución) | 9 (el mismo dato hasta 4 veces) | 0 (en los 5 apuntes) |
| Mal escritas | 5 | 0 |
| Huecos de más de 25 palabras | 5 | 0 |
| Marcadas de entrada (Constitución) | 40 de 51 | 15 |
| Opción múltiple o V/F (Constitución, con plegadas) | 0 | 16 |

### Paso 7+8 · parte 3 hecha (revisar de una en una en el móvil)
- `js/pantallas/sugerencias-mazo.js` (en SHELL): en el móvil (ancho < 700 px) la hoja de sugerencias es un mazo; en el ordenador y desde la ✨ de un bloque, la lista. Grupos: un apartado del apunte cada uno con las marcadas de entrada y, al final, las demás («Estas son menos seguras», con aviso).
- Tarjeta: tipo, pregunta (huecos como recuadro), «Respuesta:», «Otras formas de preguntarlo» (cambia sin salir del mazo, con «Cambiada · Deshacer»), «de: Artículo 1 · punto 2» y «Ver en el apunte» (cierra la hoja, va al bloque; al volver, el mazo sigue donde estaba). Arriba «Título Preliminar · 3 de 8» y «apartado 1 de 5 · …» (o «Sugerencias · 3 de 6» y «de tu apunte «…»» sin apartados), barra de progreso y «↑ Editar»; abajo ✕, lápiz y ✓, y «Se añaden a…».
- Gestos con `swipeable` de la tanda (respeta el ajuste «deslizar» y la vibración; no hay ajuste de sensibilidad aparte: el umbral es el mismo de la tanda). Nuevo en `swipeable`: `vertical` (en una hoja, el gesto hacia arriba es de la tarjeta) y, con «reducir movimiento», sin giro ni salida volando. Teclado ← → E.
- Al arrastrar: sin marco ni capa de color; pastilla (`::before`) con `--sw-add` / `--sw-drop` / `--sw-edit` y texto `--sw-ink`, definidas en `:root` de `app.css` con los valores de la otra conversación (al juntar, una sola definición); el botón de esa acción crece con un anillo separado por una franja del fondo (`:has()`), los otros a 0,35.
- Añadir/editar: al acabar un apartado se crean las añadidas (lo retocado en el editor cuenta como añadido) y sale la pantalla de fin («Orgánulos, revisado», «3 sugerencias en 1 min», añadidas / descartadas, «Las 3 nuevas entran en tus tandas como preguntas nuevas, unas pocas cada día», el siguiente apartado con sus sugerencias y «unos N min» a 10 s cada una, «Seguir con el apartado 2» / «Por hoy vale»). Con 1 o 2 sugerencias en total, sin pantalla de fin: se crean y se vuelve al apunte. Salir con ‹ crea lo añadido hasta ahí.
- Descartar: `flaski-sug-hidden` y «Descartada · Deshacer» (vuelve a esa tarjeta).
- Pruebas: `e2e/sugerencias-mazo.spec.js` (cabecera y tarjeta, deslizar a cada lado y arriba con pastilla y botón, botones y teclado, «Deshacer», fin de apartado, menos seguras, 1 o 2 sugerencias, otras formas, y la lista en el ordenador @ambos). Capturas para Eva en `tests/test-results/sugerencias-mazo/`.
- En el móvil se puede pasar a la lista («Ver en lista», arriba a la derecha del mazo) y volver («De una en una», en la cabecera de la lista); se recuerda en `flaski-sug-vista`. En las pruebas, la opción `sugView` del fixture (por defecto, la lista; `sugerencias-mazo.spec.js` usa el mazo). El aviso «Descartada · Deshacer» va por encima de los botones del mazo.
- Al final: unitarias 243 de 243; batería completa (`--workers=2`) 392 pasan, 15 omitidas, 0 fallan (8,9 min, con las otras conversaciones trabajando a la vez). Antes, dos pasadas: la primera con 20 fallos esperados (las pruebas de la lista se encontraban el mazo en el móvil y unas pocas daban por hechas las sugerencias de antes) y la segunda con 1 de la propia prueba (leía el anillo a mitad de su transición); arreglados y repetida entera.
- Remate de la revisión: en el mazo, cada otra forma de preguntarlo va en dos filas (el tipo y «Usar esta» arriba, la pregunta debajo a todo el ancho); si tiene el mismo texto que la de arriba (la opción múltiple de una básica), una línea pequeña con sus opciones (`altOptions`, también en la lista del ordenador). e2e en el móvil con la Constitución: la pregunta no pasa de 3 líneas. Captura `9-otras-formas.png`.
- `sw.js` → `flaski-v220`.
- Decisión: el texto de cuándo entran no dice «a partir de mañana» (las nuevas pueden salir hoy si quedan nuevas del día), sino «unas pocas cada día».

## «Antes del push» juntado en main (rama `antes-del-push`; detalle en `ESTADO-ANTES.md`)
- **Hecho allí**: tema de ejemplo nuevo «Por qué se te olvidan las cosas» (v3, quien tenga la v1 o la v2 pasa al nuevo conservando el progreso, con sus imágenes y su apunte); deslizar en la tanda con pastilla del color del botón e intervalo, anillo (`.sw-lit`, `--sw-*`), sin tapar la cabecera (`ceiling`); «Sin conexión» sin mover la tarjeta; respuesta numérica en «respuesta»; temas por el apunte («Añadir y leer», «Leer el tema» la primera vez); «¿Qué pasaría si…?» en tres columnas; letras del español sin idioma; doble sentido con «¿Qué significa?» / «¿Cómo se llama?»; tablas sin partir palabras; «¡Ánimo!» y «¡Bravo!» el mismo día; del repaso B4 (contraste de «Normal»), B5 (etiquetas sin «#»), B8 (casillas de ideas, «Lo que entiendes», total de la tanda), B9 (FORMATO-IA sin etiquetas); B10 no se reproduce. Tras la revisión: listas de apunte y de tema sin idioma (`api.createDeck` con `lang: ''` y reparación de las que quedaron en turco), avisos encima de los botones en la tanda, «Estudiar este apunte · 14 hoy», `.pv-empty` a 4,5:1 y el apunte del tema de antes pasa al nuevo si no se tocó.
- **Fuera**: B1, B2, B3 y B7 (los hace el Plan nuevo); la primera vez con la Constitución sigue empezando por la tanda; Novedades sin tocar.
- **Antes del push (sustituye a la lista del paso 5)**: 1) copia de seguridad (Ajustes › Datos › «Descargar copia» y un backup de hoy en Supabase); 2) SQL Editor: `supabase/schema.sql` entero › Run (versión 12: un «¡Ánimo!» y un «¡Bravo!» al día por amigo; solo añade); 3) `supabase functions deploy recordatorio`; 4) push; 5) en producción, en el móvil y en el ordenador: entrar, una tanda, borrar y recuperar algo, y mandar un ánimo.
- **Al juntar**: conflictos en `feel.js` (se quedan `ceiling` y `vertical` con «reducir movimiento»), `app.css` (una sola definición de `--sw-*`, la de allí; los botones del mazo usan la regla de `.sw-lit`), `sw.js`, `index.html` y `rapida.mjs`; `app.js`, `cuenta.js` y `editor.js` se juntaron solos con lo de las dos ramas. `makeSuggested` sigue pasando por `api.createDeck` con `source: 'apuntes'` (listas sin idioma). Arreglos después: en algunos navegadores (el del panel de Claude, con el acento «tinta» en oscuro) `--sw-gap` no se resuelve y el anillo del mazo no salía: la franja es ahora el fondo de la hoja (e2e que lo comprueba); el apunte nuevo del tema tiene «En cinco minutos», que daba «¿Qué es el en cinco minutos?»: un título que empieza por preposición ya no es un término.
- **Comprobado en el navegador** (modo local de pruebas, `?local`): «Añadir y leer» abre el apunte con «Estudiar este apunte · 14 hoy», la lista sin idioma, la pregunta de escribir con ñ á é í ó ú ü ¿ ¡ y sin altavoz, y la tanda entera del tema hasta «¡Tanda hecha! · 14 preguntas»; sugerencias del tema y de la Constitución en mazo en el móvil (con el anillo) y en lista en el ordenador. «Desde un apunte» en una lista, por `lista.spec.js:65`.
- **Pruebas**: unitarias 246 de 246; batería completa (`--workers=2`) 427 pasan, 15 omitidas, 0 fallan, a la primera (6,5 min). Los 5 fallos que la rama traía (de antes del paso 7+8) ya no salen.
- `sw.js` → `flaski-v233`. Worktree `../kartlar-antes` quitado; la rama `antes-del-push` se queda hasta después del push.

## Batería más rápida (hecha)
- Traza solo con `TRACE=1` (antes se grababa en todas: un 24 % del tiempo).
- «Escritorio» solo ejecuta las 81 pruebas con `@ambos` (lista y porqué, abajo).
- Fixture `seed` (`fixtures.js`): listas, preguntas básicas, apuntes, carpetas, listas de Explorar y progreso ya hechos, construidos con el código de la app en una página aparte (una por proceso, todas las recetas sin recargar) y metidos en localStorage antes de abrir la app. Unas 100 pruebas de 37 archivos lo usan; las que prueban crear, añadir o pegar siguen con la pantalla. Con `openDeck` y `openPage`.
- Carreras arregladas en la app: la imagen de carpeta descartada mientras se guardaba y «Guardar y otra».
- `npm run e2e:rapida` (`tests/rapida.mjs`): solo «movil» y solo los archivos de lo cambiado (por pantalla, `-- plan apuntes`, o `-- --last-failed`). La completa, al final del paso. En CLAUDE.md.
- No se ha probado con 6 navegadores (Eva: con 4 ya va).
- Tiempos (8 núcleos, 4 navegadores, máquina libre): batería completa de 14,2 min (564 pruebas) a 5,2 min (385: 370 pasan, 15 omitidas, en verde a la primera). Rápida: Plan 28 s (19 pruebas), apuntes 70 s (64 pruebas, la pantalla con más).
- Unitarias 217 de 217.

## Qué pruebas corren también en escritorio

De 280 pruebas, 81 llevan `@ambos` en el título (corren en «movil» y «escritorio»: el proyecto «escritorio» tiene `grep: /@ambos/`) y 199 solo en «movil». Las nuevas, igual: si dependen del tamaño, el teclado o el ratón, `@ambos`. Criterio: maquetación, anchos, posiciones, barra lateral o lo que solo hay a partir de 900 px, teclado como función que se prueba, arrastre o «hover» con ratón, ramas por proyecto y capturas por proyecto; ante la duda, `@ambos`. Las que se saltan en escritorio («solo móvil») no lo llevan.

<details><summary>Lista completa: archivo:línea · título · dónde · motivo</summary>


**actualizar-safari.spec.js**

- 7 · Safari: un módulo de otra versión (le falta lo que otro importa): se recarga una vez y arranca · móvil · solo móvil (se salta fuera de movil)

**actualizar.spec.js**

- 25 · un módulo de otra versión (le falta lo que otro importa): se recarga una vez y arranca · móvil · recarga de módulos, igual en ambos tamaños
- 33 · un archivo que ya no existe en el servidor: arranca (a lo sumo, recargando una vez) · móvil · arranque con archivo ausente, lógica
- 40 · si sigue fallando no se queda recargando sin parar · móvil · evita recargas infinitas, lógica

**aleman.spec.js**

- 3 · sustantivo alemán: elegir el artículo y escribir la palabra con mayúscula · móvil · Flujo de respuesta, igual en ambos tamaños
- 28 · alemán: «strasse» por «Straße» es casi, y se sugiere Difícil · móvil · Corrección de la respuesta; Enter solo para enviar

**amigos.spec.js**

- 10 · amigos: esta semana, te han animado, invitar con tu código, aceptar, animar, añadir con un código y quitar · **@ambos** · Enter envía el código de amistad (teclado)
- 77 · Hoy: «Tus amigos» con el último ánimo recibido y la clasificación de la semana · móvil · clasificación y ánimos en Hoy, igual en ambos
- 116 · un enlace de invitación ofrece añadir a quien lo manda · móvil · enlace de invitación, flujo
- 127 · sin las funciones de amigos en Supabase, lo explica (y la app sigue funcionando) · móvil · aviso sin funciones de amigos, flujo

**anki.spec.js**

- 6 · importar de Anki (${modern ? 'formato nuevo' : 'formato antiguo'}): mazos, imágenes y progreso · móvil · importación de datos

**apunte-ancho.spec.js**

- 6 · apunte a 375 px con tabla e imagen: nada se sale de lado (y mover y plegar siguen con 44 px) · móvil · solo móvil (test.skip si no isMobile)

**apunte-repasar.spec.js**

- 13 · Repasar: tapa las negritas, 1–4 como en la tanda y propone «Hueco» con lo que falla · **@ambos** · valorar en panel distinto por tamaño (:visible), Esc
- 51 · Repasar con el teclado: Espacio destapa, 1–4 valoran y Esc vuelve a escribir · **@ambos** · atajos de teclado; se salta en movil
- 64 · atajo «a >> b»: Enter crea la pregunta unida a su línea; «<>» crea las dos; Esc lo deja como texto · **@ambos** · atajo «>>» con Enter y Esc
- 98 · móvil: el botón «pregunta» de la barra sobre el teclado escribe « >> » · móvil · botón de barra, flujo igual en ambos
- 108 · Repasar no tapa las negritas que acaban en «:» y la pregunta de abajo no lleva los «:» del final · móvil · lógica de huecos con «:»
- 124 · salir de Repasar a mitad con fallos que no son pregunta: se proponen como «Hueco» · **@ambos** · valorar en panel distinto por tamaño (:visible)
- 142 · Repasar: se sale con «✕ Salir de repasar», con el botón atrás y la barra «Escribir | Repasar» sigue a la vista al bajar · **@ambos** · toBeInViewport de barra fija; panel lateral en escritorio

**apuntes.spec.js**

- 19 · escribir apuntes por bloques: títulos, listas, Enter y Retroceso · **@ambos** · teclado: Enter, Retroceso, Inicio y Esc en bloques
- 61 · tablas: se escriben celda a celda (Tab, Enter, filas y columnas, pegar de una hoja de cálculo) y se guardan · **@ambos** · teclado: Tab, Mayús+Tab y Enter en tablas
- 120 · tablas como texto: sigue pudiendo escribirse en Markdown · **@ambos** · teclado: Enter crea fila en tabla Markdown
- 139 · crear una tarjeta desde lo seleccionado, estudiarla y volver a los apuntes · móvil · flujo crear tarjeta desde selección
- 178 · cómo llevas cada parte y estudiar un apartado · móvil · flujo de estado y estudiar apartado
- 206 · la guía de formato y atajos de los apuntes · móvil · contenido de la guía, igual en ambos
- 230 · carpetas: una sola por tema, con apuntes y listas dentro; crear y mover apuntes · móvil · flujo de carpetas
- 274 · borrar una carpeta la manda entera a la papelera, con sus apuntes; al recuperarla vuelve con ellos · móvil · papelera de carpeta, datos
- 299 · color de la carpeta: cobalto si no se elige ninguno; si no, el elegido · móvil · color guardado como atributo, no depende del tamaño
- 314 · dibujo de carpeta: se elige junto a los emojis y asoma en la tarjeta; sin dibujo, su emoji · **@ambos** · migas cortadas si no caben y ancho visible del dibujo
- 348 · icono de carpeta con tu imagen: se recorta cuadrada a 256 px, asoma en la carpeta y sigue ahí al recargar · **@ambos** · boundingBox del recorte del icono
- 413 · etiquetas, buscar y ordenar en la Biblioteca · móvil · etiquetas, buscar y ordenar: flujo
- 436 · icono, descargar en Markdown y acceso a los apuntes desde el mazo · móvil · icono y descarga: flujo
- 460 · pegar unos apuntes enteros · móvil · pegar apuntes: datos
- 476 · imágenes: en una tarjeta y en los apuntes con su pie; siguen ahí al recargar · móvil · imágenes guardadas; Esc solo para salir
- 514 · más tipos de bloque: atajos, menú /, casillas, destacado, código y separador; y vuelta a Markdown · **@ambos** · atajos de teclado y menú / con Enter
- 563 · importar un PDF desde el menú de un apunte: títulos, párrafos, listas, tablas y páginas escaneadas como imagen · móvil · importar PDF: datos
- 599 · sugerir tarjetas: propone las claras ya marcadas, se retocan y se crean enlazadas a su parte del apunte · móvil · flujo de sugerencias; Esc solo para salir
- 651 · sugerencias: la lista se desplaza con la rueda del ratón · **@ambos** · rueda del ratón y boundingBox
- 670 · un título largo pasa a varias líneas sin cortarse, e Intro no añade un salto · **@ambos** · medidas del título, Enter y rama por ancho
- 690 · Biblioteca: «vacío» solo para apuntes sin texto; con texto y sin preguntas, «sin preguntas» · móvil · etiquetas de la Biblioteca, datos

**bienvenida.spec.js**

- 8 · oposición con tema de ejemplo: carpeta con examen, primera tanda y su final · móvil · Flujo de primera vez, igual en ambos
- 72 · un idioma: crea la lista o abre una ya hecha · móvil · Flujo de primera vez, igual en ambos
- 83 · pegar el texto y ver las preguntas antes de empezar · móvil · Flujo de primera vez, igual en ambos
- 97 · subir un archivo de Markdown y «cambiar de archivo» · móvil · Flujo de primera vez, igual en ambos
- 113 · «ir a Hoy» la cierra y la presentación se puede ver desde Perfil · móvil · Flujo de cerrar y abrir presentación

**bloques.spec.js**

- 20 · deshacer y rehacer en todo el apunte: lo escrito, partir bloques y borrar · **@ambos** · Ctrl+Z, Ctrl+Y, Supr: atajos
- 40 · mover bloques con Alt+flechas y arrastrando el asa; duplicar con Ctrl+D · **@ambos** · Alt+flechas, Ctrl+D y arrastre con ratón
- 69 · seleccionar varios bloques: Mayús+clic, convertir y borrar a la vez; copiar y pegar bloques · **@ambos** · Mayús+clic, Retroceso y Ctrl+Z
- 86 · sangría con Tab en listas (numeración por niveles) y plegar un apartado · **@ambos** · Tab y Mayús+Tab para sangría
- 121 · paréntesis y comillas se cierran solos; con texto seleccionado, * lo envuelve · móvil · autocierre al escribir, igual en ambos
- 134 · buscar y reemplazar en el apunte (sin mayúsculas ni tildes); se deshace · **@ambos** · Ctrl+F y Enter en buscar
- 155 · índice del apunte y enlaces entre apuntes con [[ ]] · **@ambos** · índice a la derecha en pantallas grandes (rama isVisible)

**buscar-borrar.spec.js**

- 5 · buscar ignora tildes, diéresis y mayúsculas (no la ñ) · móvil · búsqueda sin tildes, lógica
- 42 · buscar en el apunte sin tildes · móvil · búsqueda en apunte, lógica
- 51 · borrar un apunte con preguntas: las preguntas siguen en su lista · móvil · borrar apunte, datos
- 71 · borrar una lista: sus preguntas se van también de Hoy · móvil · borrar lista, datos
- 87 · borrar una carpeta: va a la papelera con sus listas y sus preguntas salen de Hoy · móvil · borrar carpeta, datos

**capturas-editor.spec.js**

- 6 · capturas del editor · **@ambos** · Capturas de pantalla por proyecto

**capturas-plan.spec.js**

- 8 · plan, etapa, examen y primera vez · **@ambos** · capturas de pantalla por proyecto
- 37 · explorar · **@ambos** · capturas de pantalla por proyecto
- 44 · simulacro · **@ambos** · capturas de pantalla por proyecto

**contraste.spec.js**

- 17 · cabecera de la tanda: «pregunta N de M» con 4,5:1 o más con los 9 acentos, en claro y en oscuro · **@ambos** · contraste; pie de atajos solo en escritorio
- 48 · Plan, Estadísticas y Ajustes: día especial, «Normal» en las barras, «↑ N» y «Borrar mi cuenta…» con 4,5:1, en claro y en oscuro · **@ambos** · contraste de colores en pantallas con maquetación distinta

**datos.spec.js**

- 6 · importar un CSV, revisar la vista previa y volver a exportarlo igual · móvil · Importar y exportar CSV, datos
- 23 · buscar dentro de un mazo · móvil · Búsqueda y recuento
- 49 · copia de seguridad local: borrar todo y restaurar deja mazos y progreso como estaban · móvil · Copia de seguridad, datos
- 72 · restaurar una copia de cuenta: añade lo que falta y no duplica al repetir · móvil · Restaurar copia, datos
- 96 · la copia de seguridad incluye los apuntes y el vínculo de sus tarjetas · móvil · Copia de seguridad con apuntes, datos

**desborde.spec.js**

- 6 · 375 px: lista, mapa, ficha y editor de alemán sin desbordar · **@ambos** · desbordes y boundingBox a 375 px

**deslizar.spec.js**

- 30 · al ver la respuesta salen las pistas, tenues, y se van solas; deslizar cuenta · **@ambos** · rama por proyecto y boundingBox de pistas
- 72 · tras 10 deslizamientos ya no salen · móvil · solo móvil
- 82 · vuelven si llevas 30 días sin deslizar · móvil · solo móvil
- 91 · con «deslizar» desactivado no hay pistas · móvil · solo móvil

**editor-apunte.spec.js**

- 21 · barra de lo seleccionado: cobalto; pulsarla no quita la selección y se puede deshacer · **@ambos** · Ramas por proyecto, color de barra y Ctrl+Z
- 59 · crear pregunta: panel a la derecha en el ordenador, hoja desde abajo en el móvil; el apunte sigue a la vista · **@ambos** · Panel lateral en escritorio; boundingBox por proyecto
- 94 · margen: cada bloque lleva el estado de las preguntas de su apartado · móvil · Estado del margen, igual en ambos
- 108 · móvil: si el navegador no dice dónde está el teclado, la barra se queda abajo a la vista · móvil · solo móvil
- 121 · entre 700 y 960 px, «Nueva pregunta» sale como hoja desde abajo · **@ambos** · Solo escritorio: hoja a 820 px, boundingBox

**entender.spec.js**

- 17 · Explícalo: escribes, se marcan las ideas que salen (sin tildes, plural…) y se propone el botón · móvil · lógica de Explícalo
- 39 · ¿Qué pasaría si…?: ↑ = ↓ en cada efecto, «Comprobar» marca bien y mal · móvil · lógica de ¿Qué pasaría si…?
- 54 · las básicas del tema de ejemplo pasan a «Explícalo» sin perder el progreso; las editadas no, y repetirlo no cambia nada · móvil · migración de datos
- 76 · Explícalo: el modo elegido (Escribir, Pensarlo) se lee: texto del color de la tanda sobre blanco · móvil · colores del botón, no dependen del tamaño

**estudio.spec.js**

- 3 · crear un mazo con tarjetas, estudiarlas y que el progreso sobreviva a recargar · móvil · crear, estudiar y recargar: flujo
- 26 · «Otra vez» vuelve a sacar la tarjeta en la misma sesión y «Deshacer» la recupera · móvil · Otra vez y Deshacer: flujo
- 45 · el límite de nuevas por día se respeta y «N nuevas más» lo amplía con las que quedan · móvil · límite de nuevas: lógica
- 75 · tarjeta de escribir la respuesta: corrige y sugiere la nota · **@ambos** · Enter para corregir la respuesta escrita (dudosa)

**explorar-tema.spec.js**

- 8 · con cuenta: «Añadir» abre el apunte y «La tienes» lo vuelve a abrir · móvil · Flujo con cuenta, igual en ambos
- 20 · con cuenta: «Añadir y empezar» del tema destacado abre la tanda de 5 min, y luego «Abrir el tema» abre el apunte · móvil · Flujo con cuenta, igual en ambos

**explorar.spec.js**

- 5 · las listas que ya tienes dicen «La tienes» y «N preguntas · tú tienes M»; su hoja no dice «Se copiará…» · móvil · flujo de Explorar
- 25 · vista previa de notas con varias plantillas: una fila por nota · móvil · vista previa, datos
- 37 · «Tus listas compartidas» vacía y búsqueda sin resultados con un solo mensaje · móvil · mensajes vacíos
- 47 · filtros por objetivo: Idiomas solo enseña las listas de idiomas; «+» añade sin abrir nada · móvil · filtros y añadir
- 61 · tema destacado: «Añadir y empezar» crea el apunte con sus preguntas y empieza una tanda de 5 min · móvil · flujo del tema destacado

**exportar.spec.js**

- 30 · exportar a Word y volver a importarlo: mismos títulos, listas con sangría y formato · móvil · exportar e importar Word: datos (teclado solo para rellenar)
- 47 · exportar en Markdown y en HTML · móvil · exportar Markdown y HTML: datos
- 61 · importar varios archivos a la vez (Markdown, CSV, HTML) y dentro de un apunte · móvil · importar varios archivos: datos
- 80 · exportar todos los apuntes en un .zip · móvil · exportar zip: datos

**formato.spec.js**

- 24 · formato: negrita, color y fondo con la barra; se guarda en Markdown y las marcas solo se ven donde está el cursor · **@ambos** · Atajos Ctrl+I, Ctrl+Z y Escape
- 72 · formato: escribir Markdown a mano, saltos de línea y dar formato sin estar editando · **@ambos** · Mayús+Enter y Escape como función
- 98 · pegar con formato (Google Docs, una web): varios bloques y se conserva el estilo · **@ambos** · Usa Escape y Fin del teclado al pegar

**furigana.spec.js**

- 3 · furigana en el editor: añadir, ver la vista previa y cambiarla · **@ambos** · recuadro flotante y Enter confirma la lectura
- 52 · furigana oculta al estudiar: se destapa tocando el kanji · móvil · destapar furigana tocando, igual en ambos

**hoy.spec.js**

- 31 · Hoy: cada bloque con sus datos reales · **@ambos** · captura de pantalla por proyecto
- 75 · Hoy: «cambiar» la meta lleva a Ajustes · móvil · enlace a Ajustes: flujo
- 82 · Lo que flojea: también las listas con preguntas sueltas que te cuestan · móvil · lo que flojea: datos
- 107 · Atrasos: al volver tras unos días, lo atrasado se reparte en la semana y no entran nuevas · móvil · atrasos: lógica de reparto
- 143 · Examen cerca: Hoy lo dice y sus preguntas van primero · móvil · examen cerca: lógica

**ia.spec.js**

- 24 · cada bloque JSON de FORMATO-IA.md dice cuántas tarjetas crea · móvil · Comprueba el documento, sin página
- 30 · los ejemplos de FORMATO-IA.md se importan enteros, tal como los daría una IA · móvil · Importar ejemplos, datos
- 45 · las etiquetas se crean y el mazo queda con su idioma al importar · móvil · Importar con etiquetas e idioma
- 57 · pegar con errores: dice qué notas se saltan y por qué, e importa el resto · móvil · Importar con errores
- 79 · si ninguna nota vale, no se importa nada y se puede volver a pegar lo mismo · móvil · Importar sin notas válidas
- 88 · JSON roto: el error dice la línea y no se cierra la hoja · móvil · Error de JSON roto
- 95 · pegar columnas de una hoja de cálculo (CSV) · móvil · Pegar columnas, datos
- 101 · un archivo flaski-deck se sigue importando igual · móvil · Importar archivo, datos
- 108 · las instrucciones para IA se descargan desde la app · móvil · Descarga de instrucciones

**iconos.spec.js**

- 6 · racha apagada y encendida, comodín y sugerencias con los iconos de la app · **@ambos** · rama escritorio: icono en la barra lateral

**inicio.spec.js**

- 4 · tu actividad: los últimos 6 meses con los colores del diseño y la meta diaria · móvil · colores del mapa de actividad, no dependen del tamaño
- 50 · «Cómo va lo que sabes» va antes de «Tu actividad» y ninguna etiqueta del gráfico se sale · móvil · solo móvil

**kanji.spec.js**

- 32 · escribir 日 a mano: se corrige trazo a trazo y sin errores · **@ambos** · Arrastre con ratón frente a táctil según proyecto

**lista.spec.js**

- 4 · cabecera, filtros por etapa, tipo de cada pregunta y «Ver todas» · móvil · cabecera y filtros, datos
- 35 · «+» ofrece las cuatro formas de añadir y «…» archiva y borra la lista · **@ambos** · menú en hoja o popover (#dkPop) y Esc lo cierra
- 60 · «Desde un apunte» abre sus sugerencias para esta lista; vincular un apunte y abrirlo desde la lista · **@ambos** · menú «+» en hoja o popover según tamaño
- 85 · por próximo repaso, las nuevas van al final tras «Nuevas · N» y asoman aunque no se vean todas · móvil · orden de la lista, datos
- 100 · en el ordenador el título largo baja de tamaño en vez de partirse · **@ambos** · solo escritorio: tamaño del título

**logo.spec.js**

- 5 · favicon, apple-touch-icon y manifest con los iconos nuevos, y todos cargan · móvil · iconos y manifest cargan
- 17 · la marca no sale dentro de la app: ni en la cabecera del móvil ni en la barra lateral, y el contenido sube · **@ambos** · barra lateral y hueco de cabecera medidos
- 27 · en la pantalla de entrar sí sale la marca, con el color de acento · móvil · color de la marca al entrar, igual en ambos
- 47 · logo B: en la marca de entrar y en flaski-icono.svg, la fila de arriba sube de opacidad de izquierda a derecha · móvil · opacidades del SVG, lógica

**mapa.spec.js**

- 18 · lista: casillas por artículo, «art. 14» no es «art. 140» y «Sin artículo» · móvil · Casillas y recuentos, igual en ambos
- 31 · practicar una casilla desde su ficha: se resiste si fallas 3 de las 5 últimas · móvil · Flujo de practicar y estados
- 58 · elegir varias: barra con preguntas y minutos, y «Hacer una tanda» solo con esas · **@ambos** · Ctrl+clic en escritorio, mantener pulsado en móvil
- 79 · apunte con apartados: «Apunte | Mapa» con una casilla por apartado · **@ambos** · Rama por popover de escritorio (#mpPop)
- 110 · notas con varias plantillas: la casilla es la palabra (no der/die/das) y van por secciones · móvil · Etiquetas y secciones, datos
- 120 · japonés: sin furigana en crudo ni « / », y Kanji, Palabras y Frases por separado · **@ambos** · Rama por popover; tamaño de letra de la ficha
- 137 · artículo del título del apartado, «Sin artículo» solo con lo demás y cabecera con los artículos · **@ambos** · Rama por popover; altura del botón
- 168 · una casilla por pregunta: la cabecera dice solo «N preguntas» · móvil · Recuento de la cabecera
- 176 · «Practicar lo que se resiste» cuenta las preguntas que salen y al salir vuelve al mapa · móvil · Flujo de practicar y volver
- 194 · «Se te resisten»: la casilla a la izquierda y el significado a la derecha, sin repetir · **@ambos** · Rama por popover de escritorio
- 211 · escritorio: el mapa ocupa todo el ancho de la columna · **@ambos** · Solo escritorio: ancho del mapa
- 219 · móvil: la barra de lo elegido cabe en una línea («· N min» fuera) · móvil · solo móvil
- 231 · artículo: subtítulo del apartado que lo nombra y «Ver en el apunte» lleva hasta el bloque · **@ambos** · Desplazamiento y boundingBox en viewport; rama por popover

**minutos-de-verdad.spec.js**

- 5 · hoy tocan 14 preguntas y el día tiene 60 min: «Empezar la tanda · N min» con lo que tardas y «Te sobra tiempo» · móvil · cálculo de minutos, flujo

**modo-pruebas.spec.js**

- 6 · con ?local usa el backend local, avisa y carga datos de ejemplo sin tocar la cuenta real · móvil · modo ?local y datos de ejemplo: flujo
- 70 · «Cargar datos de ejemplo» cierra la bienvenida, lleva a Hoy y el aviso no tapa la tanda · **@ambos** · boundingBox: el aviso no tapa la tanda

**novedades.spec.js**

- 6 · salen al abrir la app y se recorren con las flechas · **@ambos** · Flechas y Escape; capturas por proyecto
- 29 · desde Perfil → Novedades · móvil · Flujo desde Perfil, igual en ambos

**pantallas.spec.js**

- 3 · todas las pantallas cargan sin errores con la app vacía · móvil · carga de pantallas
- 14 · estadísticas con datos: los filtros de periodo funcionan · móvil · filtros de estadísticas
- 31 · un ajuste de Hoy se guarda, se aplica y sobrevive a recargar · móvil · ajuste que persiste
- 51 · el mazo de demostración de japonés se añade y se puede abrir una sesión · móvil · mazo demo y sesión
- 59 · en móvil ninguna pantalla tiene scroll horizontal · móvil · solo móvil

**papelera.spec.js**

- 24 · borrar una lista: hoja de la papelera, «Deshacer» la deja como estaba · móvil · borrar lista y deshacer: flujo
- 42 · la papelera: desde Biblioteca, la fila con lo que queda, recuperar (con «(recuperada)» si el nombre ya está) y sigue tras recargar · **@ambos** · cambia viewport y comprueba desbordes
- 73 · una carpeta va entera a la papelera y vuelve con lo que tenía, eligiendo dónde · móvil · carpeta a la papelera y vuelta: datos
- 101 · «Borrar ya», «Vaciar» con confirmación, y al abrir se borra del todo lo que lleva más de 30 días · móvil · borrar ya y vaciar: lógica
- 135 · una pregunta borrada en el editor no va a la papelera: «Deshacer» la devuelve · móvil · deshacer pregunta borrada: flujo
- 153 · Ajustes › Datos: el buscador encuentra «papelera» y «borrar cuenta» · móvil · buscador de Ajustes: lógica
- 165 · borrar la cuenta (modo local): copia, lo que se borra, escribir «borrar» y la pantalla final · móvil · borrar cuenta local: flujo
- 190 · borrar la cuenta (con cuenta): si falla, lo dice y la sesión sigue; si va bien, borra imágenes y cuenta · móvil · borrar cuenta con nube: flujo
- 214 · con cuenta: lo borrado del todo se lleva sus imágenes del almacén, salvo las que aún usa otra pregunta o apunte · móvil · imágenes del almacén: datos
- 243 · con cuenta: la limpieza de 30 días también se lleva las imágenes · móvil · limpieza de 30 días: datos

**perfil-ajustes.spec.js**

- 5 · Perfil: filas en su orden, nombre con el lápiz, créditos en una hoja y «Ver tus estadísticas» · móvil · Filas y flujo de Perfil
- 29 · Perfil: con un examen por delante, el plan dice «vas bien» o «no llegas» · móvil · Etiqueta del plan, datos
- 42 · Ajustes: 7 secciones, «Con cuidado» en Datos y el texto de Biblioteca › Importar › Pegar · **@ambos** · Rama según ancho de viewport (<960)
- 68 · Ajustes: el buscador enseña los ajustes usables con su pestaña, lo que se ha ido y nada si no hay · **@ambos** · Escape borra el buscador como función

**plan.spec.js**

- 28 · pausa: sale de lo de hoy y de las tandas de «Todo», y se recuerda · móvil · lógica de pausa
- 47 · «Repasar»: esa lista ya no da nuevas; Mucho y Poco reparten 4 a 1 · móvil · reparto de nuevas
- 63 · tu semana: los minutos de hoy son los de la tanda de Hoy; un día especial manda y se puede borrar · móvil · semana y días especiales, datos
- 99 · nuevo examen en 2 días: «Así no llegas» con tres arreglos; aplicar, deshacer y quitar el examen · móvil · examen y arreglos, flujo
- 128 · etapa vigente: cambiar el foco en el Plan cambia la etapa, no el de siempre, y lo dice · móvil · etapa y foco, datos
- 149 · orden de temas: las nuevas salen solo de la primera lista sin terminar de la carpeta · móvil · lógica de orden de temas
- 166 · primera vez: con exámenes y sin etapas, «Hagamos tu plan» propone etapas y «Me vale» las guarda · móvil · primera vez del plan, flujo
- 190 · ordenador: tocar una barra abre su panel con el nivel · **@ambos** · planificador solo de escritorio

**progreso.spec.js**

- 5 · cómo va lo que sabes: lo que te sabes, notas y la cabecera al recorrer los días · **@ambos** · teclado Inicio/Fin y capturas por proyecto
- 34 · estadísticas: cada tarjeta con su cifra, en tonos del tema, y la cabecera cuenta lo que señalas · **@ambos** · capturas por proyecto

**recordatorio.spec.js**

- 32 · sin cuenta (modo local) no pide nada y Ajustes explica que hace falta una · móvil · Avisos sin cuenta, igual en ambos
- 41 · con cuenta: Inicio pide activarlos, luego se cambian en Ajustes y sin ninguno se da de baja · móvil · Suscripción y sincronización
- 63 · «Ahora no» no vuelve a preguntar en este dispositivo; Ajustes deja permitirlo después · móvil · Flujo de permiso
- 78 · si ya estaban permitidas, se suscribe solo al entrar · móvil · Suscripción automática
- 84 · si no se permite, la tarjeta se va y lo explica · móvil · Permiso denegado

**remates-archivos.spec.js**

- 6 · tras restaurar una copia, al recargar dice cuánto ha entrado (o que ya lo tenías todo) · móvil · restaurar copia, datos
- 27 · Markdown: el título con «#» y los apartados con «##»; la página web con los colores y letras de Flaski · móvil · exportación, lógica pura
- 42 · menú de bloques: «Destacado» con el icono de la app, sin emoji · móvil · menú de bloques sin emoji

**remates-biblioteca.spec.js**

- 4 · «Mover a otra carpeta» › «+ Carpeta nueva»: la lista se mueve a la carpeta que se crea; vacía no ofrece estudiar · móvil · mover a carpeta nueva: flujo
- 32 · pegar una lista nueva: título a mano, «desde una tabla», su nombre antes de añadir y «añadida» · móvil · pegar lista nueva: flujo
- 49 · buscar en Biblioteca también dentro de las preguntas; abre la pregunta · móvil · búsqueda en preguntas: lógica
- 62 · lista archivada: sin «para hoy» ni «Estudiar», con «Archivada · Sacar del archivo»; y «Borrar» con un apunte · móvil · lista archivada: flujo
- 84 · «Nombre (A-Z)» mezcla apuntes y listas; el filtro de etiqueta incluye las listas con preguntas que la llevan · móvil · orden y filtro de etiquetas: lógica

**remates-correccion.spec.js**

- 15 · escribir la respuesta: tildes y artículo valen «casi» (Difícil), no mal · móvil · Corrección de la respuesta; Enter solo para enviar
- 26 · escribir la respuesta: sin el artículo, «casi · Te falta el artículo» · móvil · Corrección de la respuesta; Enter solo para enviar
- 36 · títulos largos de lista y de apunte: letra más pequeña y no más de 3 líneas en el móvil · **@ambos** · Maquetación: líneas del título a 375 px

**remates-editor.spec.js**

- 16 · móvil: al editar, «Guardar» cabe a la derecha y lo demás va en «⋯ Más» · **@ambos** · boundingBox y rama por proyecto
- 41 · etiquetas: «#verbos» crea «verbos» y como mucho 24 letras · **@ambos** · Enter crea la etiqueta (teclado)
- 60 · «Pista · opcional» va encima de su campo y el ejemplo se lee entero · **@ambos** · posiciones y anchos de etiqueta y campo
- 69 · apuntes vacíos de antes: se borran al arrancar y «Lo dejaste aquí» no lleva a ellos · móvil · limpieza de datos al arrancar
- 89 · dos listas con el mismo nombre: en Estadísticas y en «Varias de golpe» llevan su carpeta detrás · **@ambos** · ramas :visible y popover según tamaño

**remates-kanji.spec.js**

- 15 · kanji suelto muy grande, lecturas kun y luego on, en minúscula y al tamaño del texto · **@ambos** · tamaño de letra distinto según proyecto
- 32 · hoja «Orden de trazos»: título a mano y créditos en una línea · móvil · textos de la hoja de trazos
- 40 · escribir a mano: cada fallo hace parpadear el cuadro y al segundo sale la pista · **@ambos** · dibuja trazos arrastrando el ratón

**remates-pasada.spec.js**

- 12 · mover una lista lleva también su apunte a la carpeta · móvil · Mover lista y apunte, datos
- 30 · «Reiniciar progreso» pide confirmación · móvil · Confirmación de reinicio, igual en ambos
- 43 · Explorar: si ya tienes la lista, «Ya la tienes · Abrir» · móvil · Flujo de Explorar
- 54 · un apunte nuevo que se deja vacío y sin título se descarta al salir; etiquetas «filtrar en Biblioteca» · móvil · Descartar apunte vacío; Escape incidental
- 70 · «Hueco» desde una selección: solo la frase y el hueco resaltado · móvil · Texto del hueco, datos

**remates-paso5.spec.js**

- 20 · texto pegado en «Trae tus apuntes»: título de la primera línea, fechas, cifras y huecos (al menos 6 preguntas) · móvil · primera vez: pegar texto, lógica
- 38 · «Hacer mi primera tanda»: con 1 min dice «1 min», no «unos 1 min» · móvil · texto «1 min», flujo
- 46 · pegado en un apunte vacío: la primera línea es el título y «Etiqueta:» va en negrita · móvil · pegar en apunte, lógica
- 60 · Hoy: «te las sabes» cuenta solo las consolidadas, y el número de hoy va sin «!» · móvil · recuento en Hoy
- 74 · al abrir, mientras carga, un esqueleto de Hoy y no un círculo girando · móvil · esqueleto al cargar, flujo
- 88 · textos: «correo» al entrar y en la presentación, «preguntas con repaso espaciado» · móvil · textos de la interfaz

**remates-plan.spec.js**

- 7 · Explorar: un tema de ejemplo añadido lleva su origen y sale «La tienes» · móvil · Explorar: origen del tema, datos
- 22 · Explorar: las listas de antes (sin origen) se reconocen por el nombre sin acentos ni palabras de en medio · móvil · reconocer por nombre: lógica
- 35 · Explorar: la vista previa pinta los huecos como en la tanda y la respuesta aparte · móvil · vista previa de huecos: contenido
- 46 · estimaciones con un mínimo de 10 s por pregunta: Hoy y «salen unas X al día» del Plan · móvil · estimaciones: cálculo
- 81 · examen nuevo: «solo repasos» la última semana solo a más de 21 días; dentro de esa semana no se activa; la hoja cuenta los días libres · móvil · última semana del examen: lógica; Esc solo para salir
- 114 · «Cómo arreglarlo»: con la última semana activada a mano ofrece que sigan entrando nuevas, y nunca un arreglo que no mejora · móvil · arreglos del plan: lógica
- 138 · «Hagamos tu plan»: recta final del 25 % (entre 2 y 7 días), los minutos cambian las nuevas y nunca propone no llegar · móvil · Hagamos tu plan: cálculo
- 163 · móvil: en la tira de etapas, una etapa de 1 día mide al menos 28 px y se puede tocar · móvil · solo móvil
- 180 · Plan › Hoy toca: dice el porqué de las nuevas de hoy («Hoy 20 nuevas: tienes 90 min») y nunca pasa del doble · móvil · porqué de las nuevas: texto calculado

**remates-preguntas.spec.js**

- 21 · tipo de pregunta: los segmentos caben sin pisarse con «Más tipos» y la fila no se mueve al cambiar · **@ambos** · Cajas: segmentos caben sin pisarse, boundingBox
- 33 · «Más tipos» sustituye el contenido de la hoja, con «‹» para volver · móvil · Flujo del selector de tipos
- 45 · campos: en Básica la respuesta no es opcional; en Opción múltiple «opcional» sale una vez · móvil · Textos de los campos
- 56 · crear desde una selección: la pregunta es la frase con el hueco · móvil · Crear desde selección, datos
- 69 · móvil: en la barra de lo seleccionado cabe «Hecho» · móvil · solo móvil
- 80 · apunte a 800 px: «Sugerir preguntas» solo con icono y la ruta cortada en palabra entera · **@ambos** · Maquetación a 800 px: icono y ruta cortada
- 98 · etiquetas del editor: pegatinas con ✕ y «+ etiqueta» para buscar o crear, sin la lista entera · **@ambos** · Escape cierra el buscador como función

**remates-repaso.spec.js**

- 40 · hermanas: una sola por tanda (también si una es repaso y otra nueva); Biblioteca suma lo mismo que Hoy · móvil · cola de la tanda, datos
- 58 · desde un apunte se estudia todo lo nuevo, y el resumen cuenta preguntas · móvil · estudiar apunte, flujo
- 70 · Intro en el título baja al primer bloque; en el móvil, escribiendo, sin la barra de abajo · **@ambos** · Enter en el título y rama por proyecto
- 91 · escribir la respuesta: tras comprobar, la caja «respuesta» solo lleva los demás campos · **@ambos** · Enter comprueba la respuesta escrita
- 107 · «Varias de golpe»: detecta la coma, el ejemplo sigue al tipo y el botón cuenta notas y preguntas · **@ambos** · menú «+» en hoja o popover según tamaño

**remates-tanda.spec.js**

- 7 · tras «Otra vez» el contador avanza y la que vuelve se suma al total; al salir se vuelve a la lista · móvil · contador tras Otra vez: lógica
- 23 · «No lo sé, ver respuesta» en una de elegir deja «Otra vez» marcado · móvil · nota marcada en elegir: lógica
- 38 · editar una pregunta dentro de la tanda: colores de siempre, título a la vista y los tipos caben · **@ambos** · boundingBox del título y tipos caben en ancho
- 60 · con «2 botones», «Otra vez» y «Bien» se reparten el ancho · **@ambos** · anchos de los botones de nota
- 72 · Biblioteca cuenta las nuevas como «Estudiar» (una por nota) · móvil · recuento de Estudiar: datos
- 85 · huecos: la puntuación de detrás va pegada al hueco · móvil · texto del hueco con puntuación

**simulacro.spec.js**

- 27 · preparar, responder, «¿Entregas ya?», nota y respuestas; los fallos pasan a mañana sin tocar el intervalo · móvil · Flujo del simulacro y nota
- 89 · simulacro a medias: al volver, «te quedan N min · Seguir / Descartar», y el reloj sigue desde donde estaba · móvil · Simulacro a medias, reloj
- 113 · ordenador: teclado 1-4, R, B, flechas y Esc · **@ambos** · Solo escritorio: atajos de teclado
- 136 · Hoy: con un examen a menos de un mes, «Simulacro de la semana» abre «Preparar» · móvil · Botón en Hoy, igual en ambos
- 158 · remates: penalización solo con fallos y en blanco, netas negativas y vuelta a la nota tras repasar los fallos · móvil · Textos de la penalización
- 175 · remates: la gráfica con notas de 0 deja todos los puntos y el objetivo dentro, separados de las fechas · **@ambos** · Posiciones de puntos en la gráfica
- 188 · remates: la opción elegida se rellena de blanco y «te queda menos de 1 min» · móvil · Color de la opción, no depende del tamaño

**sin-conexion.spec.js**

- 4 · estudiar sin conexión: los cambios esperan y se envían al volver la red · móvil · sincronización sin conexión
- 27 · abrir la app sin conexión usa la copia guardada y envía lo pendiente al reconectar · móvil · copia sin conexión, sincronizar
- 56 · al abrir, los datos no esperan a que se envíe lo pendiente, y lo pendiente se ve encima · móvil · cola pendiente, datos
- 79 · cerrar sesión borra la copia sin conexión de este dispositivo · móvil · cerrar sesión borra copia
- 88 · una imagen añadida sin conexión se sube al volver la red y se descarga en otro dispositivo · móvil · subida de imagen, sincronizar
- 117 · con cuenta, cambiar la imagen de una carpeta borra la anterior también de la nube · móvil · imagen de carpeta, nube
- 142 · si la red falla al borrar la imagen anterior de una carpeta, el borrado espera en la cola y se envía al volver · móvil · cola de borrado, sincronizar

**sincronizar.spec.js**

- 5 · la pregunta de la tanda no cambia de sitio mientras sincroniza · **@ambos** · posiciones con boundingBox al sincronizar

**sugerencias.spec.js**

- 9 · actualizar las sugerencias tras cambiar el apunte, conservando lo retocado; descartar · móvil · Flujo de sugerencias; teclas solo para escribir
- 39 · la ✨ marca en el apunte lo que da tarjetas (también al escribir) y abre las de esa parte · móvil · Marca de sugerencia; teclas solo para escribir
- 54 · sin sugerencias: consejos según cómo está escrito el apunte y cómo se eligen · móvil · Consejos, textos

**tactil.spec.js**

- 12 · zonas táctiles de al menos 44 px: apunte, Ajustes, Estadísticas y la meta de Hoy · móvil · solo móvil
- 47 · zonas táctiles de 44 × 44 px: ✕ de las pegatinas, mover y plegar en el margen, y las pastillas del apunte · móvil · solo móvil

**tanda-corta.spec.js**

- 30 · la primera tanda pregunta la duración; los atrasados primero, una nueva de cada cuatro y «Otra vez» vuelve antes de acabar · móvil · orden de la tanda: lógica
- 81 · si la tanda acaba con lo de hoy: «¡Todo hecho por hoy!» y solo «Volver» · móvil · fin de tanda: flujo
- 94 · el ritmo sale de tus respuestas (la mediana) y la duración se cambia en Hoy · móvil · ritmo y duración: cálculo; Esc solo para cerrar

**tanda-tipos.spec.js**

- 49 · la tanda con una pregunta de cada tipo: todo cabe y salen los 4 botones · **@ambos** · Rama por proyecto, desbordes y capturas

**tema-memoria.spec.js**

- 12 · al añadirlo: 17 preguntas, una nota de cada tipo, todas unidas a su apartado, y la imagen de la curva guardada · móvil · datos del tema de ejemplo
- 34 · quien ya lo tenía: se quitan las de antes, se añaden las nuevas y las que coinciden conservan su progreso · móvil · migración de datos

**tipos-nuevos.spec.js**

- 23 · verdadero o falso: se escribe V o F y se responde con dos botones · **@ambos** · atajo de teclado 2 para responder
- 42 · emparejar: se une cada elemento con su pareja; los fallos bajan la nota sugerida · móvil · emparejar con clics: lógica
- 60 · tapar partes de una imagen: se dibujan recuadros y cada uno es una tarjeta · **@ambos** · arrastrar con el ratón y tecla Espacio
- 96 · conjugación: se escriben todas las formas y se corrige cada una (en alemán, con mayúsculas y ß) · móvil · conjugación: corrección
- 121 · «Escribir a mano» solo sale en mazos de idiomas con otro alfabeto · móvil · cuándo sale escribir a mano: lógica
- 130 · clasificar: cada elemento a su grupo; los mal colocados se marcan · móvil · clasificar con clics: lógica
- 148 · hueco con opciones: se elige la palabra que falta · móvil · hueco con opciones: lógica
- 164 · ordenar los pasos: una línea por paso · móvil · ordenar pasos: lógica
- 177 · respuesta numérica: con margen, «casi» y la coma decimal · **@ambos** · Enter para corregir el número (dudosa)

**tipos.spec.js**

- 20 · mazo de alemán: el editor propone los tipos de alemán e idiomas, no los de otros idiomas · **@ambos** · Enter en el buscador elige el tipo
- 49 · mazo que no es de idiomas: solo tipos generales y sin audio · móvil · Tipos de un mazo general
- 64 · el último tipo que usaste en la lista sale marcado; «Varias de golpe» usa los mismos segmentos y «Más tipos» · móvil · Último tipo usado; Escape incidental
- 87 · cambiar de mazo en el editor cambia el idioma de los campos · móvil · Idioma de los campos
- 102 · un tipo oculto deja de salir en el editor · móvil · Ocultar tipo, datos
- 118 · migración: los mazos antiguos reciben su idioma y desaparecen las copias por idioma · móvil · Migración de datos

**voz.spec.js**

- 16 · sin voz en japonés: el altavoz lo dice; «Probar» dice qué idiomas de tus listas tienen voz · móvil · aviso de voz, flujo

</details>
