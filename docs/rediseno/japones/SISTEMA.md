# Japonés en Flaski · diseño del sistema

Propuesta técnica para construir las secciones 1 a 4 de la página «Japonés · ideas» del lienzo: kanji, hiragana y katakana, frases y gramática, y leer japonés de verdad. Fecha: 16 de noviembre de 2026.

---

## 0. En una frase

Flaski aprende **qué japonés sabes** a partir de tus listas y tus respuestas. Con eso, y con un diccionario que se descarga a trozos, ayuda en tres cosas:
- te enseña los kanji;
- te aclara las frases;
- te dice qué entiendes de un texto real.

Todo funciona sin conexión una vez descargado. No hace falta ningún cambio en Supabase.

---

## 1. Principios

1. **Lo que sabes sale de lo que ya estudias.** No hay que crear listas de kanji ni de verbos: Flaski los saca de las palabras de tus listas de japonés.
2. **Las preguntas nuevas son preguntas normales.** Los kanji y las formas de los verbos se guardan como preguntas de verdad, en una lista automática. Por eso se sincronizan, cuentan en el Plan y en las estadísticas, y se pueden borrar como cualquier otra.
3. **Nada pesa al abrir la app.** Los datos de japonés solo se descargan si tienes alguna lista de japonés, y a trozos. Una vez descargados, se quedan guardados para usarlos sin conexión.
4. **Sin servidor nuevo.** Todo se calcula en el móvil con reglas y datos fijos, sin inteligencia artificial y sin coste por uso.
5. **Si no está claro, se pregunta.** Cuando Flaski no sabe algo con seguridad (una lectura dudosa, una palabra que no está en el diccionario), lo propone y tú lo corriges.

---

## 2. Piezas comunes

### 2.1 Los datos (se generan una vez y se guardan en el repositorio)

| Datos | De dónde | Licencia | Para qué | Peso |
|---|---|---|---|---|
| Los 2.136 kanji de uso común | KANJIDIC2 (EDRDG) | CC BY-SA 4.0 | significado en español, lecturas, trazos, nivel | un archivo de unos 350 KB (≈ 110 KB comprimido) |
| Piezas de cada kanji | KRADFILE (EDRDG) | CC BY-SA 4.0 | «sus piezas» | dentro del archivo de arriba |
| Diccionario de palabras comunes (unas 22.000) | JMdict (EDRDG) | CC BY-SA 4.0 | lectura, significado (en español cuando lo hay), tipo de palabra | troceado por el primer carácter: unos 3.000 archivos pequeños, ≈ 6 MB en total |
| Entonación de cada palabra | Kanjium (accents) | CC BY-SA 4.0 | la línea de la entonación | dentro de los trozos del diccionario |
| Trazos de kanji y kana | hanzi-writer-data-jp (ya se usa) | Arphic / LGPL | escribir a mano | ya integrado |

- **Una herramienta** (`tests/tools/ja-datos.mjs`) descarga los originales, los filtra y escribe `data/ja/kanji.json` y `data/ja/dic/<código>.json`. Solo se ejecuta cuando haya que actualizar los datos, no al publicar.
- **La atribución** (EDRDG, Kanjium) aparece en Ajustes › Acerca de, como pide la licencia. Los datos llevan la licencia CC BY-SA; el código de Flaski no cambia de licencia.
- **Hace falta tu permiso** para descargar los originales: unos 20 MB comprimidos, de edrdg.org y de GitHub (Kanjium).

### 2.2 El motor de japonés (`js/ja/`, módulos nuevos que se cargan solo si hay japonés)

| Módulo | Qué hace |
|---|---|
| `ja/datos.js` | Carga `kanji.json` y los trozos del diccionario a demanda, guardados en una caché propia del service worker (`flaski-ja-v1`), como ya se hace con los trazos. |
| `ja/texto.js` | Funciones básicas: separar kanji, kana y signos, pasar katakana a hiragana y leer el furigana `漢字[かんじ]` que ya usa Flaski. |
| `ja/lecturas.js` | Reparte la lectura de una palabra entre sus kanji: 図書館 = と + しょ + かん. Tiene en cuenta los cambios de sonido (が/ざ/だ/ば, っ, sonidos largos). |
| `ja/palabras.js` | Corta un texto en palabras buscando la más larga del diccionario. Antes devuelve los verbos y adjetivos a su forma de diccionario (飲みました → 飲む, «pasado cortés»). Es el método de los diccionarios emergentes; no hace falta un analizador pesado. |
| `ja/particulas.js` | Encuentra las partículas (は, が, を, に, で, へ, と, も, から, まで, の, や) con reglas de su posición y, si hay diccionario, confirmándolo con el corte en palabras. |
| `ja/verbos.js` | Saca las formas de un verbo (ます, ない, た, て, たい, potencial, volitiva, condicional ば) según su grupo, que viene del diccionario. |
| `ja/saber.js` | **Lo que sabes**: qué kanji y qué palabras te sabes, según tus preguntas y tus respuestas. Todo lo demás pregunta aquí. |

**Qué cuenta como «lo sabes»:**
- **Una palabra:** la sabes si alguna pregunta de una lista de japonés la tiene en su campo principal y ya la has visto (está en repaso, no es nueva). Si su intervalo pasa de 7 días, la dominas.
- **Un kanji:** el paso que alcanzas es el de su pregunta de kanji (sección 3). Si no tiene pregunta propia, cuenta si lo has visto dentro de palabras que dominas.

### 2.3 Dónde se guarda cada cosa

- **Preguntas de kanji y de formas de verbos:** en tablas que ya existen (`decks`, `cards`, `progress`). Van en una lista automática por cada carpeta de japonés: «Kanji» y «Verbos · formas». La lista lleva una marca en `options.auto` y se puede mover o archivar. **No hace falta cambiar Supabase.**
- **Tus ajustes de japonés** (furigana, entonación, partículas, letras): en `prefs.ja` para todas tus listas, y se pueden cambiar en cada lista (`deck.options.ja`). Se sincronizan.
- **Las historias que escribes para un kanji:** en un campo de su pregunta de kanji.

---

## 3. Sección 1 · Los kanji

### Tipo de pregunta nuevo: «Kanji» (`ja-kanji`, solo lo crea Flaski)

- **Campos:** kanji, significado, lecturas, piezas, tu historia.
- **Tres preguntas, una por paso:**
  1. **Qué significa.** La primera vez sale como presentación (pantalla «Un kanji nuevo»): no se puntúa y cuenta como un primer «Bien». Después se pregunta: ves el kanji y das la vuelta.
  2. **Cómo se lee** (modo nuevo `kreading`). Elige al azar una de tus palabras con ese kanji, marca el kanji y te deja elegir su lectura entre 4 opciones: la buena, otra lectura del mismo kanji y lecturas de kanji parecidos. Al fallar, la explicación sencilla: «junto a otro kanji suele leerse a la china; con hiragana detrás, a la japonesa».
  3. **Cómo se escribe**: el modo `draw` que ya existe.

### Cómo se crean

- Al cargar (como las demás migraciones) y al guardar una pregunta de japonés, `ja/saber.js` reúne los kanji de las palabras de tus listas de japonés.
- Por cada kanji que todavía no tiene pregunta, se crea una en la lista «Kanji» de su carpeta, con las tres preguntas como nuevas.
- Si borras la lista «Kanji», no se vuelve a crear: queda apuntado en `prefs.ja.noKanji`.

### Un paso detrás de otro

- La pregunta del paso 2 no sale como nueva hasta que la del paso 1 tiene un intervalo de 3 días o más. La del paso 3 espera igual al paso 2.
- Se aplica al elegir las nuevas de la tanda (`estudio.js`) y en la previsión del Plan (`plan2.js`), que trata esas preguntas como «aún no disponibles».

### El kanji antes que la palabra

- Al preparar la tanda, si toca una palabra nueva que lleva un kanji cuyo paso 1 aún no has visto, se mete ese paso 1 justo delante de la palabra.
- Cuenta dentro del tope de nuevas del día. Si no cabe, la palabra espera.

### Pantallas

- **Tus kanji** (Biblioteca › la lista «Kanji», que se ve con una vista propia): cuántos llevas en cada paso, la cuadrícula con los tres puntitos y los filtros.
- **La ficha del kanji**: lectura y significado, piezas, tus palabras con ese kanji, el kanji con el que lo confundes y tu historia. El orden de trazos animado es el que ya hay.
- **El resumen al acabar la tanda**: qué kanji han subido de paso hoy y cuáles te cuestan.

### Kanji que se confunden

- Cuando en el paso 3 dibujas otro kanji, o en el paso 2 eliges la lectura de otro, Flaski apunta la pareja en `prefs.ja.parejas` (se sincroniza).
- Con 2 fallos, la pareja sale en la ficha y en la pantalla «Los que se confunden» (sección 2).

---

## 4. Sección 2 · Hiragana y katakana

- **Para quien empieza:** «Empezar con los kana» crea una lista «Hiragana» (y otra «Katakana») con un tipo de pregunta nuevo, «Kana». Cada kana tiene dos preguntas: reconocer (ves ぬ y respondes «nu») y escribirlo a mano.
- **La tabla de kana:** una vista propia de esas listas. Cada casilla toma el color del estado de su pregunta. Arriba, cuántos te sabes; abajo, «Repasar los que cuestan».
- **La ficha de un kana:** trazos, truco para recordarlo (escritos por Flaski en español, 92 en total), su pareja en el otro alfabeto y tus palabras que lo usan (las busca `ja/saber.js`).
- **Los que se confunden:**
  - Hay una lista fija de parejas habituales (シ/ツ, ソ/ン, ぬ/め, わ/れ/ね, る/ろ, ク/ケ…).
  - Al fallar un kana de una pareja eligiendo o escribiendo el otro, sale la pantalla de comparar con su minitanda de 6. La minitanda no crea preguntas: usa las de la lista.
  - Las parejas de kanji que confundes (sección 3) usan la misma pantalla.

---

## 5. Sección 3 · Frases y gramática

Todo esto cambia **cómo se muestran** los campos de japonés. Sirve para todas tus preguntas de japonés sin tocarlas.

1. **Furigana solo en lo que no sabes.**
   - Al pintar el furigana (`inline.js`), si el campo es de japonés y el ajuste está en «Lo que no sé», la lectura solo sale encima de un grupo de kanji si alguno no lo dominas (paso 2 superado, según `ja/saber.js`).
   - Si la pregunta no tiene furigana, se puede añadir solo, con lo que da el diccionario (opcional; empieza apagado).
2. **Partículas en color.** `ja/particulas.js` marca las partículas al pintar el campo, con un color por cada una. Al tocar una sale su hoja: qué hace, la frase, ejemplos de tus listas y con cuál se confunde. Las explicaciones de las 12 partículas son textos fijos escritos para Flaski.
3. **Entonación.** Para el campo principal de una palabra, si el diccionario tiene su entonación, se dibuja la línea encima de la lectura. Sin dato, no se dibuja nada.
4. **Una frase desmontada.**
   - Al tocar una frase de ejemplo, `ja/palabras.js` la corta en trozos, cada uno terminado en su partícula.
   - A cada trozo le pone su lectura y su significado: de tus listas primero y, si no está, del diccionario.
   - Su papel sale de la partícula: と «con quién», で «dónde», を «qué», に «a dónde o cuándo», は «de qué se habla», が «quién»; el verbo final es «la acción».
   - Para el verbo explica la forma: 飲みました = 飲む en pasado cortés.
5. **Ordenar la frase.** Crea una pregunta del tipo «Ordenar frase» que ya existe, con los trozos separados por « / » y la traducción si la pregunta la tenía. Se guarda en la misma lista.
6. **La familia de un verbo.**
   - Si el diccionario dice que la palabra es un verbo, su pregunta tiene «Ver sus formas»: la cuadrícula de formas, coloreada si ya hay preguntas de esas formas.
   - «Practicar sus formas» crea las preguntas en la lista automática «Verbos · formas»: un tipo nuevo, «Forma de verbo», que se responde escribiendo.
   - Por defecto se crean las formas de N5 (ます, ない, た y て); se pueden elegir más.
   - Al fallar, sale la regla de la terminación y otros verbos tuyos que siguen la misma.
7. **Ajustes de japonés:**
   - En cada lista y en Ajustes › Tanda: furigana (lo que no sé, siempre o nunca), entonación, partículas en color, escribir también en letras y leer en voz alta la respuesta.
   - Valores de serie: lo que no sé, sí, sí, no y sí.

---

## 6. Sección 4 · Leer japonés de verdad

### Modo lectura en los apuntes

- Si un apunte tiene bastante japonés (más de 30 caracteres japoneses), sale el botón **«Leer»**.
- Al pulsarlo, `ja/palabras.js` corta el texto y `ja/saber.js` clasifica cada palabra:
  - la sabes;
  - te la estás aprendiendo;
  - es nueva;
  - es gramática (partículas y terminaciones), que no cuenta.
- Arriba, el porcentaje que entiendes. Las nuevas salen subrayadas, con su lectura encima.

### Tocar una palabra nueva

- Sale una hoja con:
  - la lectura y el significado del diccionario (en español si lo hay; si no, en inglés y marcado);
  - la frase del texto y, si existe, su traducción (ver Subtítulos);
  - sus kanji, diciendo si ya los sabes.
- Botones:
  - **«Aprenderla»** crea una pregunta de vocabulario en la lista que elijas, con la frase como ejemplo.
  - **«Ya me la sé»** la apunta como sabida (`prefs.ja.sabidas`) sin crear preguntas.
  - **«Ahora no»** cierra la hoja.

### Subtítulos

- Importar › Subtítulos acepta archivos `.srt` y `.vtt`. Crea un apunte con una frase por línea y su minuto.
- Si importas también los subtítulos en español del mismo capítulo, cada frase se empareja por tiempo con su traducción.
- Un filtro enseña **las frases con una sola palabra nueva**. Desde ahí puedes crear varias preguntas a la vez.

### El significado y la lectura

- Salen del diccionario y siempre se pueden cambiar antes de guardar.
- Si una palabra no está en el diccionario de palabras comunes, la hoja lo dice y deja escribirla a mano.

---

## 7. Qué se toca en el código

| Archivo | Cambio |
|---|---|
| `js/ja/*.js` (nuevos) | El motor (2.2). Se cargan con `import()` solo si hay listas de japonés, así que no entran en el SHELL. |
| `data/ja/` (nuevo) | Los datos (2.1). |
| `sw.js` | La caché `flaski-ja-v1`: lo de `data/ja/` se guarda la primera vez que se pide. No se precarga. |
| `js/cardtypes.js` | Tipos nuevos: «Kanji», «Kana», «Forma de verbo». Modo nuevo: `kreading`. |
| `js/pantallas/estudio.js` | Pasos de los kanji, el kanji antes que la palabra, la presentación, el resumen de kanji y la comparación tras confundir dos. |
| `js/plan2.js` | Las preguntas que esperan a su paso anterior no cuentan como disponibles. |
| `js/inline.js` | Furigana selectivo, partículas y entonación al pintar japonés. |
| `js/pantallas/` (nuevos) | `ja-kanji.js` (Tus kanji y la ficha), `ja-kana.js` (la tabla y la ficha), `ja-frase.js` (frase desmontada, partícula y verbo) y `ja-leer.js` (modo lectura y subtítulos). |
| `js/pantallas/apuntes.js`, `mazos.js`, `biblioteca.js` | Los botones de entrada: «Leer», «Tus kanji», «Ver sus formas». |
| Ajustes | El grupo «Japonés» y la atribución de los datos. |

---

## 8. Sin conexión, peso y rendimiento

- Sin listas de japonés no se descarga nada.
- Con japonés:
  - `kanji.json` se baja la primera vez (≈ 110 KB comprimido);
  - cada trozo del diccionario, cuando hace falta (unos pocos KB cada uno).
- Un apunte normal necesita unos 30 trozos, que ya se quedan guardados.
- Cortar un texto de 2.000 caracteres lleva menos de 50 ms en un móvil medio, porque son búsquedas en un mapa.
- Crear las preguntas de kanji al cargar se hace una sola vez por kanji. Las siguientes cargas solo comprueban si hay kanji nuevos.

---

## 9. Pruebas

- **Unitarias**, una por módulo de `js/ja/`:
  - reparto de lecturas (図書館, 一人, 学校, 日本, 今日 como excepción);
  - partículas en frases de ejemplo;
  - devolver verbos a su forma de diccionario y sacar sus formas (飲む, 食べる, する, 来る, 行く → 行って);
  - corte de un texto;
  - los pasos de los kanji y «el kanji antes que la palabra».
- **e2e:**
  - con una lista de japonés sembrada: se crea la lista «Kanji»; la tanda presenta 休 antes de 休日; el paso 2 espera; el resumen;
  - la tabla de kana y la comparación tras fallar シ/ツ;
  - el furigana desaparece cuando un kanji se domina; las partículas tienen color; frase desmontada; ordenar la frase; las formas de un verbo;
  - el modo lectura con su porcentaje; tocar una palabra y aprenderla; importar un `.srt`.
- Las e2e usan un trozo de diccionario pequeño de prueba (`tests/e2e/ja-datos/`) que el servidor de pruebas sirve en lugar del real.

---

## 10. Orden de trabajo

| Fase | Contenido | Se puede probar en |
|---|---|---|
| 0 | Herramienta de datos y motor (`js/ja/`), con sus unitarias | pruebas |
| 1 | Kanji: tipo, creación, pasos, presentación, Tus kanji, ficha y resumen | la app |
| 2 | Kana: listas, tabla, ficha y los que se confunden | la app |
| 3 | Frases: furigana selectivo, partículas, entonación, frase desmontada, ordenar, verbos y ajustes | la app |
| 4 | Leer: modo lectura, tocar una palabra y subtítulos | la app |

Cada fase va en sus propios commits, con sus pruebas, subiendo `VERSION` y en verde antes de pasar a la siguiente. Al final: Novedades con lo nuevo de japonés y la batería completa.

---

## 11. Riesgos y decisiones

- **Significados en español.** KANJIDIC2 tiene significado en español para casi todos los kanji de uso común. JMdict lo tiene para una parte de las palabras; para el resto se usará el inglés, marcado como tal. Alternativa: solo español y, si falta, «escríbelo tú».
- **Lecturas dudosas** (今日, 大人, 一人…): una lista corta de lecturas especiales. Si el reparto falla, la pregunta del paso 2 no se crea para esa palabra.
- **Partículas mal marcadas** en palabras escritas solo en hiragana: con diccionario se corrige casi siempre. Sin él, solo se marcan las seguras (を siempre; las demás si van detrás de kanji o katakana).
- **Muchas preguntas nuevas de golpe** al crear los kanji: no pasa, porque los pasos esperan unos a otros y cada kanji solo sale cuando llega su primera palabra.
- **El Plan:** las preguntas de kanji cuentan como nuevas de su carpeta, así que un examen de japonés las incluye. Si se prefiere, se pueden dejar fuera del examen como «sin examen».

**Para empezar necesito tu permiso para descargar los datos originales** (2.1): unos 20 MB comprimidos, de edrdg.org y de GitHub. Se guardan ya procesados en `data/ja/`.
