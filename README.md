# Flaski

Flashcards con repaso espaciado, pensadas para el móvil. Cada persona tiene su cuenta, sus mazos y su progreso, y los mazos se pueden compartir con un enlace.

- Funciona en cualquier móvil u ordenador desde el navegador, y se instala como una app («Añadir a pantalla de inicio»).
- Repaso espaciado: las tarjetas que fallas salen más a menudo; las que sabes, cada vez más espaciadas.
- Organización tipo Notion: carpetas dentro de carpetas, etiquetas de colores, icono y color por mazo, fijar y archivar, vista de lista o cuadrícula y varios órdenes.
- Estudiar un mazo, una carpeta entera o todos los mazos de una etiqueta.
- **Tipos de tarjeta personalizables**: campos propios (Palabra, Traducción, Ejemplo…) y plantillas que generan las tarjetas. Incluye Básica, Doble sentido, Escribir la respuesta (corrige letra a letra), Huecos, Opción múltiple y Vocabulario.
- **Escribir a mano**: con kanji (japonés) y hanzi (chino) dibujas con el dedo y la app corrige **trazo a trazo**, con el orden correcto, gracias a [Hanzi Writer](https://hanziwriter.org). Con cualquier otro alfabeto, dibujas y comparas con la solución. Botón para ver la animación del orden de trazos.
- **Furigana**: escribe `漢字[かんじ]` y la lectura sale pequeña encima. Se puede ocultar en el anverso.
- **Dictado**: escuchas la palabra o frase y la escribes.
- **Ordenar**: colocas las piezas de una frase en el orden correcto.
- **Audio automático** con la voz del navegador, eligiendo el idioma de cada campo.
- **Vista previa en directo** al crear tarjetas, **pistas** y **etiquetas** en cada tarjeta.
- **Crear varias tarjetas de golpe** pegando una lista (`ev - casa`, una por línea, o columnas copiadas de Excel).
- Selector con **todos los emojis** (búsqueda en español, recientes y tono de piel) para iconos de mazos y carpetas.
- Mazos privados o compartidos con la comunidad. Al copiar un mazo compartido, cada uno tiene su propia copia y su propio progreso.
- Importar y exportar mazos en **CSV** (Excel, Google Sheets, Anki) o como copia Flaski (`.flaski.json`).
- Incluye un **mazo de demostración de japonés** (kanji a mano, furigana, partículas, ordenar frases, dictado…) y 4 mazos de turco.
- Todo gratis: la web se publica en **GitHub Pages** y las cuentas y datos van en **Supabase** (plan gratuito).

---

## Probarla en tu ordenador (modo local)

Mientras `js/config.js` no tenga los datos de Supabase, la app funciona en **modo local**: sin cuentas, y todo se guarda en el navegador. Sirve para probarla y mejorarla antes de desplegar.

Necesitas abrirla con un servidor local (con doble clic en `index.html` no funciona). En Windows:

1. Abre la carpeta `flaski` en el Explorador de archivos.
2. Haz clic en la barra de dirección, escribe `powershell` y pulsa Enter.
3. Escribe `python -m http.server 8000` y pulsa Enter (si dice que no encuentra Python, prueba `py -m http.server 8000`).
4. Abre `http://localhost:8000` en el navegador. Para pararlo, pulsa Ctrl+C en esa ventana.

Cuando rellenes `js/config.js`, la app pasa sola a modo nube, con cuentas. Los mazos del modo local no se copian solos: si quieres conservarlos, descárgalos antes como archivo (Compartir → Descargar archivo) e impórtalos después.

---

## Puesta en marcha (unos 20 minutos, una sola vez)

### 1. Crea la base de datos en Supabase

1. Entra en [supabase.com](https://supabase.com), crea una cuenta y pulsa **New project**.
   - Nombre: `flaski`. Región: una de Europa (por ejemplo, *West EU*).
   - Apunta la contraseña de la base de datos en algún sitio seguro (no la necesitarás en la app).
2. Cuando el proyecto esté listo, ve a **SQL Editor → New query**, pega el contenido completo de `supabase/schema.sql` y pulsa **Run**. Debe decir *Success*.
   - Cuando actualices la app a una versión nueva, vuelve a ejecutar el archivo completo: está preparado para añadir solo lo que falte sin borrar nada.
3. Ve a **Project Settings → API** (en algunas versiones se llama *API Keys*) y copia:
   - la **Project URL** (algo como `https://abcd1234.supabase.co`)
   - la clave **anon public** (o la **publishable key**, que empieza por `sb_publishable_`)
4. Abre `js/config.js` y pega esos dos valores donde pone `TU-PROYECTO` y `PEGA-AQUI-TU-ANON-KEY`.

> Esa clave es pública por diseño: está pensada para ir en la web. Lo que protege los datos son las reglas de seguridad de `schema.sql` (cada persona solo puede ver y cambiar lo suyo).

### 2. Publica la web en GitHub Pages

1. Crea una cuenta en [github.com](https://github.com) si no tienes.
2. Pulsa **New repository**, llámalo `flaski`, márcalo como **Public** y créalo.
3. En el repositorio, pulsa **Add file → Upload files** y arrastra **todo el contenido** de esta carpeta (no la carpeta en sí: `index.html` tiene que quedar en la raíz). Pulsa **Commit changes**.
4. Ve a **Settings → Pages**. En *Source* elige **Deploy from a branch**, rama **main** y carpeta **/ (root)**. Guarda.
5. En un par de minutos tu app estará en `https://TU-USUARIO.github.io/flaski/`.

### 3. Conecta las dos cosas

En Supabase, ve a **Authentication → URL Configuration**:

- **Site URL**: `https://TU-USUARIO.github.io/flaski/`
- **Redirect URLs**: añade la misma dirección.

Así los emails de confirmación y de «he olvidado mi contraseña» llevan a tu app.

**Recomendado para un grupo de amigos:** en **Authentication → Sign In / Providers → Email**, desactiva **Confirm email**. El servidor de correo gratuito de Supabase solo envía unos pocos emails por hora; sin confirmación, tus amigos podrán entrar nada más registrarse. (La recuperación de contraseña seguirá funcionando.)

### 4. Instálala en el móvil

- **iPhone:** abre el enlace en **Safari** → botón Compartir → **Añadir a pantalla de inicio**.
- **Android:** abre el enlace en Chrome → menú ⋮ → **Instalar aplicación**.

Manda el enlace a tus amigos y que se creen su cuenta. Para empezar, en **Explorar** tienen los mazos de turco incluidos.

---

## Cómo se usa

- **Estudiar:** muestra lo que toca hoy. Pulsa «Mostrar respuesta» y valora: *Otra vez*, *Difícil*, *Bien* o *Fácil*. Cada botón indica cuándo volverá a salir esa tarjeta.
- **Mis mazos:** crea mazos y tarjetas, edítalos, importa archivos o pega directamente lo que te dé una IA o una hoja de cálculo (botón **Pegar**).
- **Apuntes:** páginas por bloques (títulos con «# », listas con «- » y tablas en Markdown), organizadas con las mismas carpetas y etiquetas que los mazos. Selecciona un trozo y pulsa «Crear tarjeta» o «Convertir en hueco»: la tarjeta queda unida a esa parte, y al estudiarla «Ver en los apuntes» te lleva a ella. Cada parte se colorea según cómo llevas sus tarjetas (al día, toca repasar, te cuesta, sin estudiar) y puedes estudiar el apunte entero o un apartado. El botón «?» muestra el formato y los atajos; el menú «…» descarga o copia el apunte en Markdown. Con cuentas, hay que haber ejecutado el `supabase/schema.sql` actual (añade la tabla `pages` y sus etiquetas).
- **Idioma del mazo:** al crear un mazo eliges si es de un idioma (y cuál) u otra cosa. El idioma se usa para el audio, para corregir lo que escribes (en alemán cuentan las mayúsculas) y para que el editor te proponga solo los tipos de tarjeta que encajan. Tu idioma (el de las traducciones) está en Ajustes → Estudio.
- **Mazos hechos con IA:** en **Pegar** (o en Ajustes → Datos) copia o descarga las instrucciones de [`FORMATO-IA.md`](FORMATO-IA.md), pégalas en ChatGPT, Gemini o Claude junto con lo que quieres estudiar y pega en Flaski lo que te responda. Antes de añadirlo ves cuántas tarjetas salen y qué notas se saltan y por qué.
- **Compartir un mazo:** abre el mazo → **Compartir**. Puedes hacerlo público (aparece en Explorar y te da un enlace directo) o descargarlo como archivo.
- **Explorar:** mazos incluidos en la app y mazos que ha compartido la comunidad. «Añadir a mis mazos» hace una copia para ti.
- **Perfil:** tu nombre visible, cuántas tarjetas nuevas quieres al día y cerrar sesión.

En el ordenador puedes usar el teclado: **Espacio** para mostrar la respuesta y **1-4** para valorar.

**Sin conexión:** con la app instalada en el móvil se puede estudiar sin internet (en el metro o en el avión). Lo que hagas se guarda en el móvil y se envía solo al volver la conexión; arriba se ve un aviso «Sin conexión · N cambios por enviar». Para abrir la app sin internet tienes que haberla abierto al menos una vez con conexión en ese dispositivo. Sin conexión solo se puede estudiar y cambiar ajustes: crear o editar mazos y tarjetas necesita internet. Al cerrar sesión se borra la copia guardada en el dispositivo.

---

## Cómo está hecha (para mejorarla)

Sin frameworks ni pasos de compilación: HTML, CSS y JavaScript normales. Editas un archivo, lo subes a GitHub y ya está.

```
index.html              Estructura de la página
css/app.css             Estilos. Los colores están arriba como variables
js/config.js            URL y clave de Supabase, nombre de la app
js/app.js               Interfaz: vistas, formularios y eventos
js/api.js               Elige backend (nube o local) según config.js
js/backend-supabase.js  Guardar en Supabase (cuentas, nube)
js/backend-local.js     Guardar en el navegador (modo local)
js/rows.js              Conversión de fechas compartida por los dos
js/outbox.js            Cola de cambios pendientes de enviar (sin conexión)
js/snapshot.js          Copia de tus datos en el navegador para abrir sin conexión
js/srs.js               Algoritmo de repaso espaciado (independiente)
js/org.js               Carpetas, etiquetas, orden y filtros (independiente)
js/charts.js            Gráficos del inicio
js/cardtypes.js         Tipos de tarjeta, plantillas y corrección de respuestas
js/tts.js               Audio con la voz del navegador
js/emoji-picker.js      Selector de emojis (datos en data/emoji.json)
js/handwriting.js       Escribir a mano: Hanzi Writer y lienzo libre
js/icons.js             Iconos de la interfaz (Lucide)
js/vendor/              Librerías de terceros incluidas
licenses/               Licencias de terceros
js/csv.js               Leer y escribir CSV (independiente)
js/notes.js             Formato «por notas» para IAs y leer lo pegado (independiente)
js/pages.js             Apuntes: tipos de bloque, atajos, menú /, Markdown (independiente)
js/media.js             Imágenes: en el navegador (IndexedDB) y en Supabase Storage
js/pdf.js               Importar un PDF como apuntes (con PDF.js en js/vendor/pdfjs, que se carga al usarlo)
js/friends.js           Amigos: códigos, invitaciones y clasificación semanal (independiente)
js/anki.js              Importar mazos de Anki (.apkg), con js/zip.js y js/sqlite.js (independientes)
FORMATO-IA.md           Instrucciones del formato para pegar en una IA (y skill de Claude)
sw.js                   Hace que la app abra sin conexión
manifest.webmanifest    Nombre e icono al instalarla
icons/                  Iconos
decks/                  Mazos incluidos + index.json con la lista
supabase/schema.sql     Tablas, reglas de seguridad y almacén de imágenes
tests/                  Pruebas automáticas (no forman parte de la app)
```

**Cosas que conviene saber:**

- **Apuntes desde un PDF.** «Apuntes → PDF» convierte un PDF en un apunte: adivina títulos (por tamaño o negrita), párrafos y listas, quita cabeceras, pies y números de página, y guarda como imagen las páginas escaneadas. Las imágenes y tablas que haya dentro del texto no se traen.

- **Amigos** (solo con cuenta). Cada persona tiene un código y un enlace de invitación (Perfil → Amigos); la amistad la aceptan los dos. De un amigo solo se ve un resumen calculado en Supabase (racha, repasos de hoy y de la semana, idiomas), nunca sus mazos ni apuntes, y cada uno puede dejar de compartirlo. Las tablas y funciones están en `schema.sql` (versión 8).

- **Importar de Anki.** «Mis mazos → Importar» acepta los .apkg y .colpkg de Anki (formato antiguo y el de Anki 2.1.50+, comprimido con Zstandard). Los tipos de nota Básico, Básico con inversa, Escribir la respuesta y Huecos pasan a los de Flaski; el resto, a tipos propios con los mismos campos. Se traen las imágenes, las etiquetas, el progreso y el historial de repasos; los audios no.

- **Imágenes.** En los textos se escriben como `![pie](img:ID)`; los datos van aparte (IndexedDB y, con cuenta, el almacén privado `media` de Supabase, creado por `schema.sql`). Las copias de seguridad y los mazos descargados llevan las imágenes dentro.

- **Al subir cambios**, abre `sw.js` y sube el número de `VERSION` (`flaski-v1` → `flaski-v2`) para que los móviles cojan la versión nueva.
- **Para añadir un mazo incluido:** crea un archivo en `decks/` con el formato de abajo y añádelo a `decks/index.json`.
- **Para cambiar el algoritmo de repaso:** todo está en `schedule()` dentro de `js/srs.js`.
- **Para probarla en tu ordenador** antes de subirla, mira la sección «Probarla en tu ordenador» de arriba.
- **Presentación de bienvenida** (`js/onboarding.js`): sale la primera vez, a quien entra sin mazos ni apuntes, y se puede volver a ver en Perfil. Sus capturas (`img/onboarding/`, en claro y oscuro) se sacan de la app real: si cambias la interfaz, regéneralas con `npm run capturas` dentro de `tests/`.
- **Pruebas automáticas:** antes de subir cambios, ejecuta `npm install` (solo la primera vez) y `npm test` dentro de `tests/`. Hay pruebas de la lógica (`tests/unit`, con Node) y de la app entera en un navegador, en móvil y escritorio (`tests/e2e`, con Playwright). Siempre usan el modo local, así que nunca tocan tu base de datos de Supabase. La primera vez, Playwright puede pedir `npx playwright install chromium`.

### Importar desde CSV

En **Mis mazos → Importar CSV o archivo**. Puedes preparar las tarjetas en Excel o Google Sheets y guardarlas como CSV:

| pregunta | respuesta | nota |
|---|---|---|
| su | agua | |
| ekmek | pan | k → ğ: *ekmeği* |

- La fila de cabecera es opcional. Si no la hay: columna 1 = pregunta, 2 = respuesta, 3 = nota.
- También reconoce cabeceras en inglés (`front`, `back`, `note`) y otras habituales (`anverso`, `reverso`, `ejemplo`…).
- Detecta solo si el separador es coma, punto y coma o tabulador, así que sirven los CSV de Excel, de Google Sheets y las exportaciones de Anki como texto.
- Puedes añadirlas a un mazo nuevo o a uno que ya tengas.

Al exportar (abre el mazo → **Compartir → Descargar CSV**), Flaski usa punto y coma, que es lo que espera Excel en español.

### Formato por notas (pensado para IAs)

Cada nota se escribe una sola vez (`type`, `fields` y, si quieres, `hint` y `tags`) y la app crea sus tarjetas igual que el editor. Está explicado entero, con ejemplos, en [`FORMATO-IA.md`](FORMATO-IA.md). Si cambias ese documento, las pruebas importan sus ejemplos en la app y comprueban que cada uno crea las tarjetas que dice («Este ejemplo crea N tarjetas.»), así que el documento y la app no pueden desincronizarse.

### Formato de la copia Flaski (.json)

```json
{
  "format": "flaski-deck",
  "version": 1,
  "name": "Nombre del mazo",
  "description": "Opcional",
  "cards": [
    { "front": "Pregunta", "back": "Respuesta", "note": "Nota opcional" }
  ]
}
```

En los textos puedes usar `*cursiva*` y `**negrita**`.

### Tipos de tarjeta

Un **tipo** define qué campos rellenas y qué tarjetas se crean con ellos. Cada **plantilla** del tipo genera una tarjeta y tiene un modo de estudio:

| Modo | Cómo se estudia |
|---|---|
| Dar la vuelta | Ves el anverso, piensas y das la vuelta |
| Escribir la respuesta | Escribes y la app marca las letras que faltan o sobran. Varias respuestas válidas: sepáralas con `/` |
| Opción múltiple | Cuatro opciones. Las incorrectas salen de un campo (separadas por `;`) o de otras tarjetas del mazo |
| Huecos | Marca lo que hay que ocultar con `{{ }}`. Con pista: `{{de::lugar}}` |
| Escribir a mano | Dibujas la respuesta. Kanji y hanzi: corrección trazo a trazo (hasta 8 caracteres, todos con datos de trazos). Kana y otros alfabetos: lienzo libre y comparas tú. Opción «silueta de guía» para calcar |
| Dictado | Suena el campo de respuesta (necesita idioma de audio) y escribes lo que oyes |
| Ordenar | Piezas desordenadas. Se separan por espacios o, si escribes `/`, por esas barras: `私は / 学生 / です` |

Para crear el tuyo: al crear una tarjeta → **Gestionar tipos** → **Personalizar** uno incluido o **+ Tipo nuevo**. Si eliges un idioma para un campo, tendrá botón de audio; marca **Auto** para que suene solo.

Cuando compartes o exportas un mazo, sus tipos personalizados viajan con él y se crean solos en la cuenta de quien lo copia.

El audio usa las voces del dispositivo: en iPhone y Android vienen casi todos los idiomas; en Windows quizá tengas que añadir el idioma en *Configuración → Hora e idioma → Voz*.

### Ideas para siguientes versiones

- Imágenes en las tarjetas (Supabase Storage).
- Grupos privados de amigos en lugar de compartir con toda la comunidad.

---

## Límites del plan gratuito de Supabase

Para un grupo de amigos sobra: 500 MB de base de datos (cientos de miles de tarjetas) y hasta 50.000 usuarios al mes. La única pega: **si nadie usa la app durante una semana, el proyecto se pausa**. Los datos no se pierden; se reactiva desde el panel de Supabase con un clic.

## Créditos

- **[Hanzi Writer](https://hanziwriter.org)**, de David Chanin (licencia MIT), para corregir y animar trazos. Va incluido en `js/vendor/`.
- **[supabase-js](https://github.com/supabase/supabase-js)** (MIT), para hablar con Supabase. Va incluido en `js/vendor/supabase.js`, empaquetado en un solo archivo para que la app abra sin conexión; cómo regenerarlo está al principio de ese archivo.
- **Datos de trazos**: japoneses de [hanzi-writer-data-jp](https://github.com/chanind/hanzi-writer-data-jp) (unos 2.900 kanji, a partir de [animCJK](https://github.com/parsimonhi/animCJK) y [Make Me A Hanzi](https://github.com/skishore/makemeahanzi); licencias Arphic y LGPL) y chinos de [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data) (licencia Arphic). Se descargan de jsDelivr la primera vez que se usa cada carácter y luego quedan guardados para usarlos sin conexión. Los kana (hiragana y katakana) no tienen datos de trazos: se practican en el lienzo libre.
- **[Lucide](https://lucide.dev)** (ISC) para los iconos de la interfaz.
- **[Fluent Emoji](https://github.com/microsoft/fluentui-emoji)** de Microsoft (MIT) para el icono de la racha.
- **[emojibase](https://emojibase.dev)** (MIT) para los nombres de los emojis en español.

Los textos completos de las licencias están en la carpeta `licenses/`.

## Licencia

MIT: puedes usarla, copiarla y modificarla libremente. Ver `LICENSE`.

> Flaski antes se llamaba Kartlar. Los mazos exportados con el nombre antiguo (`.kartlar.json`) se siguen pudiendo importar.
