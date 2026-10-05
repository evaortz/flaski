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
- **Mis mazos:** crea mazos y tarjetas, edítalos, importa archivos.
- **Compartir un mazo:** abre el mazo → **Compartir**. Puedes hacerlo público (aparece en Explorar y te da un enlace directo) o descargarlo como archivo.
- **Explorar:** mazos incluidos en la app y mazos que ha compartido la comunidad. «Añadir a mis mazos» hace una copia para ti.
- **Perfil:** tu nombre visible, cuántas tarjetas nuevas quieres al día y cerrar sesión.

En el ordenador puedes usar el teclado: **Espacio** para mostrar la respuesta y **1-4** para valorar.

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
sw.js                   Hace que la app abra sin conexión
manifest.webmanifest    Nombre e icono al instalarla
icons/                  Iconos
decks/                  Mazos incluidos + index.json con la lista
supabase/schema.sql     Tablas y reglas de seguridad
tests/                  Pruebas automáticas (no forman parte de la app)
```

**Cosas que conviene saber:**

- **Al subir cambios**, abre `sw.js` y sube el número de `VERSION` (`flaski-v1` → `flaski-v2`) para que los móviles cojan la versión nueva.
- **Para añadir un mazo incluido:** crea un archivo en `decks/` con el formato de abajo y añádelo a `decks/index.json`.
- **Para cambiar el algoritmo de repaso:** todo está en `schedule()` dentro de `js/srs.js`.
- **Para probarla en tu ordenador** antes de subirla, mira la sección «Probarla en tu ordenador» de arriba.
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
- Repasar sin conexión y sincronizar al volver la cobertura.
- Importar desde Anki o desde una hoja de cálculo (CSV).
- Grupos privados de amigos en lugar de compartir con toda la comunidad.

---

## Límites del plan gratuito de Supabase

Para un grupo de amigos sobra: 500 MB de base de datos (cientos de miles de tarjetas) y hasta 50.000 usuarios al mes. La única pega: **si nadie usa la app durante una semana, el proyecto se pausa**. Los datos no se pierden; se reactiva desde el panel de Supabase con un clic.

## Créditos

- **[Hanzi Writer](https://hanziwriter.org)**, de David Chanin (licencia MIT), para corregir y animar trazos. Va incluido en `js/vendor/`.
- **Datos de trazos**: japoneses de [hanzi-writer-data-jp](https://github.com/chanind/hanzi-writer-data-jp) (unos 2.900 kanji, a partir de [animCJK](https://github.com/parsimonhi/animCJK) y [Make Me A Hanzi](https://github.com/skishore/makemeahanzi); licencias Arphic y LGPL) y chinos de [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data) (licencia Arphic). Se descargan de jsDelivr la primera vez que se usa cada carácter y luego quedan guardados para usarlos sin conexión. Los kana (hiragana y katakana) no tienen datos de trazos: se practican en el lienzo libre.
- **[Lucide](https://lucide.dev)** (ISC) para los iconos de la interfaz.
- **[Fluent Emoji](https://github.com/microsoft/fluentui-emoji)** de Microsoft (MIT) para el icono de la racha.
- **[emojibase](https://emojibase.dev)** (MIT) para los nombres de los emojis en español.

Los textos completos de las licencias están en la carpeta `licenses/`.

## Licencia

MIT: puedes usarla, copiarla y modificarla libremente. Ver `LICENSE`.

> Flaski antes se llamaba Kartlar. Los mazos exportados con el nombre antiguo (`.kartlar.json`) se siguen pudiendo importar.
