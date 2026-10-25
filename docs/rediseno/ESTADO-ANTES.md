# Estado de «Antes del push» (rama `antes-del-push`)

Hecho en `../kartlar-antes` (rama `antes-del-push`, desde `de6ea1a`), en paralelo con el paso 7+8 (sugerencias, en
`main`) y el Plan nuevo (`plan2-motor`). Un commit por punto, cada uno con su prueba. Sin push ni merge.

## ANTES DEL PUSH (sustituye a «ANTES DEL PUSH DEL PASO 5» de ESTADO.md al juntar)

1. Copia de seguridad: en la app, Ajustes › Datos › «Descargar copia»; en Supabase, Database › Backups, que haya una de hoy.
2. SQL Editor: `supabase/schema.sql` entero › Run (se puede ejecutar antes del push sin romper la versión de ahora: solo añade).
   Trae la **versión 12**: un «¡Ánimo!» y un «¡Bravo!» al día por amigo (quita la restricción única de un ánimo al día
   y crea el índice `cheers_one_per_kind_idx`).
3. `supabase functions deploy recordatorio`.
4. Push.
5. Al momento, en producción, en el móvil y en el ordenador: entrar con la cuenta, una tanda, borrar algo y recuperarlo, y mandar un ánimo.

## Hecho

**A · tema-memoria/MENSAJE.md**
1. Tema de ejemplo nuevo «Por qué se te olvidan las cosas» (v3): el .json de antes queda como `.v2.json` y
   `TEMAS[].old` es ahora una lista (`v2`, `v1`): quien tenga cualquiera pasa al nuevo (las que coinciden conservan
   id y progreso). Imágenes del apunte en `temas/tema-curva-olvido.svg` y `temas/tema-repasos.svg` (de `imagenes.json`),
   guardadas antes de crear el apunte (`storeTemaImages` en `cuenta.js`; también en la primera vez). Campo «nota» →
   campo de nota (en huecos, «Extra»). Pruebas en `tema-memoria.spec.js`.
2. Deslizar: pastilla del color del botón con el intervalo («Bien · 9 d»), anillo en el botón equivalente, los demás
   al 0,35, sin marco ni color en la tarjeta; hacia arriba no tapa la cabecera (`ceiling` en `feel.js`) y se desvanece
   donde está. **Variables para la parte 3 de sugerencias**: `--sw-add`, `--sw-drop`, `--sw-edit`, `--sw-hard`,
   `--sw-ink`, `--sw-gap` y la clase `.sw-lit` (anillo + escala, con `--sw-c` como color), al final de `app.css`.
3. «Sin conexión» en la tanda: ocupa el sitio del título de la lista, sin mover la tarjeta.
4. Respuesta numérica en el recuadro «respuesta».
5. Temas por el apunte: en Explorar, «Añadir y leer» (antes «Añadir y empezar») abre el apunte arriba del todo con
   todas sus preguntas; la primera vez, «Por qué se te olvidan las cosas» ofrece «Leer el tema». No hizo falta tocar
   `sugerencias.js` (solo se llama a `temaPicks`).
6. «¿Qué pasaría si…?»: «↑ Sube / = Igual / ↓ Baja» en tres columnas, elegido legible, correcta y equivocada enteras,
   nuevo texto y ayuda de «Efectos».
7. Letras especiales sin idioma: las del español.
8. Doble sentido: «¿Qué significa?» / «¿Cómo se llama?» encima.
9. Tablas del apunte: no parten palabras.
10. «¡Ánimo!» y «¡Bravo!» el mismo día, «¡Ánimo! enviado» / «¡Bravo! enviado»; e2e con dos personas simuladas en
    `amigos.spec.js`. El SQL es el punto C.

**B · fallos del repaso** (B1, B2, B3 y B7 quedan para el Plan nuevo)
- 4. «Normal» en «Cuánto de cada cosa» (`.lvb-normal`): texto oscuro sobre un tono claro (4,5:1 con los 9 colores, en
  claro y oscuro; prueba en `contraste.spec.js`). Solo CSS: si el Plan nuevo cambia esa hoja, comprobar allí.
- 5. Etiquetas sin «#» en ningún sitio (filtros, tanda, «Estudiar casa», editor, ámbitos).
- 8. Casillas de ideas con aspecto propio; «Lo que entiendes» sin cortar palabras (dos líneas); el total de la tanda
  no crece («pregunta 13 de 14 · repite») y el final dice «14 preguntas · 3 repetidas».
- 9. FORMATO-IA.md sin `tags` en los ejemplos y con la explicación nueva; «La IA ha puesto N etiquetas · Quitarlas»
  en la vista previa del pegado (más de 5). Unitaria `tests/unit/formato-ia.test.js` y e2e en `ia.spec.js`.
- 10. La hoja del editor que no se cerraba: **no se reproduce** en 40 intentos (20 con CPU 6× y red normal: se cierra
  en 0,2–0,6 s; 20 con CPU 6× y cada escritura 1,5 s más lenta: 1,9–4 s). No es una carrera: «Guardar» espera a que
  la nube conteste (`createCards`/`updateCard` no van por la cola de envíos), así que con el servidor muy lento la
  hoja tarda lo mismo en cerrarse. Si molesta, la mejora sería cerrar ya y guardar por la cola (para otro paso).

**C · Supabase**: versión 12 al final de `schema.sql` (ver arriba). La restricción se llama
`cheers_from_user_to_user_day_key` en bases nuevas y viejas (la misma desde la versión 8); por si acaso, también se
quita cualquier otra única sobre esas tres columnas. `send_cheer` sigue igual.

**Pruebas**: `playwright.config.js` lee el puerto de `PORT`; nueva `tests/e2e/antes-del-push.spec.js` (en `tanda` de
`rapida.mjs`).

## Fuera, o para decidir

- **B1, B2, B3, B7**: los hace el Plan nuevo (paso B).
- **A5, la primera vez con la Constitución**: sigue con la primera tanda (el viaje de «oposición» promete «tu primera
  tanda en un minuto» y lo prueba `bienvenida.spec.js`). Solo «Por qué se te olvidan las cosas» se abre por el apunte
  la primera vez (`leer: true` en `TEMAS`). En Explorar, los dos temas se abren por el apunte. En Explorar no hay
  ninguna lista sin apunte que empiece la tanda directamente (se añaden con «Añadir a mis listas»), así que la prueba
  de «una lista sin apunte sigue abriendo la tanda» es la del texto pegado la primera vez (`remates-paso5.spec.js`).
- **A1, quien ya tenía el tema**: su apunte se queda como estaba (solo cambian las preguntas); el apunte nuevo lo
  tiene quien lo añade a partir de ahora.
- **Pruebas**: unitarias 235/235. Batería completa (PORT=8125, 2 workers): 395 pasan, 15 saltadas y 7 fallos; 2 eran
  míos (las etiquetas del editor aún esperaban «#») y ya pasan. Los otros **5 ya fallan en `main` (`de6ea1a`)**,
  comprobado en una copia aparte, y dependen de `suggest.js` / la hoja de sugerencias (paso 7+8):
  `remates-paso5` › «texto pegado en «Trae tus apuntes»…» y `sugerencias` › «Usar esta» en una fila de abajo (móvil y
  escritorio), «el texto de origen…» y «ningún «·» suelto…». Al juntar con el paso 7+8, repasar la batería completa.
- Novedades sin tocar (lo decide Eva).
- `VERSION` de `sw.js` subida en cada commit (v210 → v224): al juntar con las otras ramas, quedarse con la más alta + 1
  y volver a ejecutar `node version.mjs`.
