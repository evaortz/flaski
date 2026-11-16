---
name: flaski-listas
description: Crea listas de preguntas (flashcards) para la app Flaski en su formato JSON «por notas». Úsalo cuando alguien pida tarjetas, flashcards, preguntas de repaso o una lista para estudiar con Flaski.
---

# Cómo crear listas para Flaski

Flaski es una app para estudiar con repaso espaciado. Tu tarea: convertir lo que la persona quiere estudiar (un tema, sus apuntes, un texto, una foto de la pizarra…) en una lista de preguntas con el formato de abajo. Responde **solo con el JSON dentro de un bloque ```json**, sin explicaciones antes ni después, para que se pueda copiar y pegar en la app (Biblioteca › Importar › Pegar).

## Formato

```json
{
  "format": "flaski-notes",
  "version": 1,
  "name": "Turco · Comida",
  "description": "Vocabulario básico para pedir en un restaurante.",
  "lang": "tr-TR",
  "folder": "Turco",
  "notes": [
    { "type": "vocab", "fields": { "w": "ekmek", "t": "pan", "e": "Ekmek alabilir miyim?" } },
    { "type": "basic", "fields": { "q": "¿Cómo se pide la cuenta en turco?", "a": "Hesap, lütfen." } },
    { "type": "cloze", "fields": { "x": "Su{{yu::acusativo}} içiyorum." }, "hint": "beber agua" }
  ]
}
```

Este ejemplo crea 4 tarjetas.

- **name** (obligatorio) y **description** (opcional): título y descripción de la lista. Un buen título dice la asignatura y el tema: «Biología · La célula».
- **lang**: si la lista es para aprender un idioma, cuál. Activa el audio y la corrección propia del idioma, y es obligatorio para los tipos de idiomas (`vocab`, `conj`, `listen`, `order`…). Omítelo en listas que no son de idiomas (historia, medicina…). Valores: `tr-TR` turco, `en-GB` / `en-US` inglés, `fr-FR` francés, `de-DE` alemán, `it-IT` italiano, `pt-PT` / `pt-BR` portugués, `nl-NL` neerlandés, `el-GR` griego, `ru-RU` ruso, `ar-SA` árabe, `ja-JP` japonés, `zh-CN` chino, `ko-KR` coreano, `ca-ES` catalán, `eu-ES` euskera, `gl-ES` gallego, `es-ES` español.
- **folder** (opcional): la carpeta de la Biblioteca donde se guarda la lista, por ejemplo la asignatura («Biología»). Si ya hay una con ese nombre se usa; si no, se crea. Ponla solo si te dicen la asignatura o la carpeta.
- **notes**: la lista de notas. Cada nota se escribe **una sola vez**; la app crea sus tarjetas (algunos tipos crean dos).
  - **type**: uno de los tipos de las tablas. Si falta, es `basic`.
  - **fields**: los campos del tipo, con sus claves exactas (`q`, `a`, `w`…). Los valores son texto; los campos «uno por línea» pueden ser una lista o un objeto (ver *Campos con varios elementos*).
  - **hint** (opcional): una pista que se puede ver antes de responder.
  - **tags** (opcional): etiquetas para filtrar las preguntas. No las pongas salvo que te las pidan. Si te las piden, como mucho 3 para toda la lista, y repítelas en vez de inventar una por nota: los temas ya se separan con el nombre de la lista.

## Tipos para cualquier tema

| type | Para qué | Campos (* = obligatorio) | Tarjetas |
|---|---|---|---|
| `basic` | Pregunta y respuesta | `q`* pregunta · `a`* respuesta · `n` nota | 1 |
| `reverse` | Las dos direcciones (A→B y B→A) | `a`* anverso · `b`* reverso · `n` nota | 2 |
| `typing` | Escribir la respuesta exacta | `q`* pregunta · `a`* respuesta · `n` nota | 1 |
| `cloze` | Rellenar huecos en un texto | `x`* texto con `{{huecos}}` · `e` extra | 1 |
| `choice` | Opción múltiple (4 opciones) | `q`* pregunta · `a`* correcta · `w` incorrectas · `n` nota | 1 |
| `clozechoice` | Elegir la palabra que falta entre opciones | `x`* frase con un `{{hueco}}` · `w` opciones incorrectas · `e` extra | 1 |
| `truefalse` | Verdadero o falso | `s`* afirmación · `v`* `V` o `F` · `n` explicación | 1 |
| `number` | Un número, un año o una cantidad | `q`* pregunta · `a`* número · `t` margen (`5` o `2%`) · `u` unidad · `n` nota | 1 |
| `steps` | Ordenar los pasos de un proceso o unas fechas | `q`* pregunta · `s`* pasos en orden (uno por línea) · `n` nota | 1 |
| `sort` | Repartir elementos entre grupos | `q` instrucción · `g`* grupos (al menos 2) · `n` nota | 1 |
| `match` | Unir cada elemento con su pareja | `t` instrucción · `p`* parejas (al menos 2) · `n` nota | 1 |
| `explain` | Explicarlo con tus palabras | `q`* pregunta · `k`* ideas clave (una por línea) · `n` nota | 1 |
| `whatif` | ¿Qué pasaría si…? Un caso con causas y efectos | `s`* escenario · `p` pregunta · `e` efectos · `k` ideas clave (el porqué) · `n` nota | 1 |

## Tipos para idiomas (con `lang`)

| type | Para qué | Campos (* = obligatorio) | Tarjetas |
|---|---|---|---|
| `vocab` | Vocabulario: reconocer y escribir la palabra | `w`* palabra · `t`* traducción · `p` pronunciación · `e` ejemplo · `n` notas | 2 |
| `conj` | Conjugar un verbo en un tiempo | `v`* verbo · `k` tiempo · `t` traducción · `f`* formas (persona = forma) · `n` notas | 1 |
| `listen` | Dictado: se escucha y se escribe | `x`* texto que se escucha · `t` traducción · `n` nota | 1 |
| `order` | Ordenar las piezas de una frase | `f`* frase correcta · `t` traducción · `n` nota | 1 |
| `handwrite` | Dibujar la respuesta a mano (japonés, chino, coreano, árabe, griego, ruso) | `q`* pregunta · `a`* lo que hay que escribir · `n` nota | 1 |
| `de-noun` | Solo alemán: elegir der/die/das y escribir el sustantivo | `g`* artículo (`der`, `die` o `das`) · `w`* palabra sin artículo, con mayúscula · `pl` plural · `t`* traducción · `n` notas | 2 |
| `kanji` | Solo japonés: reconocer el kanji y dibujarlo trazo a trazo | `k`* kanji · `m`* significado · `on` lectura on (katakana) · `kun` lectura kun (hiragana) · `e` ejemplo | 2 |

En `vocab`, la primera tarjeta pide la traducción y la segunda pide escribir la palabra: pon en `w` solo la palabra, sin artículos ni explicaciones (eso va en `n`).

Para alemán usa `"lang": "de-DE"`: los sustantivos con `de-noun` y el resto con `vocab`. En las respuestas escritas en alemán cuentan las mayúsculas, así que escribe los sustantivos con mayúscula (`Haus`).

## Campos con varios elementos

Estos campos llevan varios elementos. Escríbelos como lista o como objeto JSON (lo más cómodo), o como texto con un elemento por línea (`\n`):

- `steps` › `s`, `explain` › `k`, `whatif` › `k`: una lista de textos, en orden. `"s": ["Profase", "Metafase", "Anafase", "Telofase"]`
- `sort` › `g`: un objeto grupo → elementos. `"g": { "Vertebrados": ["rana", "águila"], "Invertebrados": ["pulpo", "abeja"] }`
- `match` › `p` y `conj` › `f`: un objeto con cada pareja. `"p": { "ev": "casa", "su": "agua" }` · `"f": { "ich": "gehe", "du": "gehst" }`
- `whatif` › `e`: un objeto efecto → `sube`, `baja` o `igual`. Cada efecto, algo que se pueda medir: `"e": { "Precio del pan": "sube", "Pan que se vende": "baja" }`

## Sintaxis especial

- **Huecos** (`cloze`, `clozechoice`): `Ev{{de}}yim`. Con pista: `{{de::lugar}}` (se ve «[lugar]» en el hueco). En `cloze` puede haber varios huecos en un texto y se ocultan todos a la vez; en `clozechoice`, uno solo.
- **Respuestas alternativas** (`typing`): sepáralas con ` / `, vale cualquiera: `"a": "gittim / gitmiştim"`.
- **Incorrectas de opción múltiple** (`choice`, `clozechoice`): en `w`, una lista o separadas por `;` : `"w": ["Ankara", "Esmirna", "Bursa"]`. Si no pones ninguna, la app usa respuestas de otras tarjetas de la lista.
- **Números** (`number`): solo el número en `a` (`1789`, `3,14`, `300000`); la unidad va en `u`. Pon margen (`t`) cuando la respuesta sea aproximada.
- **Piezas para ordenar** (`order`): por defecto cada palabra es una pieza. Para elegir tú las piezas, sepáralas con ` / ` (en japonés y chino es obligatorio): `"f": "私は / 毎朝 / コーヒーを / 飲みます"`.
- **Furigana** (japonés): `漢字[かんじ]`, sin espacio entre el kanji y el corchete: `"e": "水[みず]を 飲[の]む"`.
- **Formato**: `**negrita**`, `*cursiva*` y `\n` para saltar de línea.

## Buenas tarjetas

- Una idea por tarjeta. Mejor diez tarjetas pequeñas que una larga.
- La respuesta debe ser corta y sin ambigüedad: quien estudia tiene que poder saber si ha acertado.
- Da contexto con ejemplos (`e`) y notas (`n`), no en la respuesta.
- Elige el tipo según el objetivo, y mezcla varios en la misma lista:
  - datos sueltos → `basic`, `typing`, `number` (fechas, cifras);
  - conceptos que se confunden → `choice`, `truefalse`, `match`;
  - procesos y clasificaciones → `steps`, `sort`;
  - entender, no solo memorizar → `explain` (con 2-4 ideas clave) y `whatif` (causas y efectos);
  - idiomas → `vocab` para palabras, `cloze` y `clozechoice` para gramática en frases, `conj` para verbos, `order` para el orden de la frase, `kanji` para escribir kanji.
- Usa pistas (`hint`) cuando la pregunta pueda tener varias respuestas válidas.
- Si no sabes algo con seguridad (una fecha, una traducción, una lectura), no lo inventes: déjalo fuera.
- Si te dan apuntes o un texto, pregunta solo por lo que está en ellos.
- Salvo que te pidan otra cosa, unas 20-40 notas por lista.

## Más ejemplos

Biología, con tipos para entender y no solo memorizar:

```json
{
  "format": "flaski-notes",
  "version": 1,
  "name": "Biología · La célula",
  "folder": "Biología",
  "notes": [
    { "type": "basic", "fields": { "q": "¿Qué orgánulo produce la mayor parte del ATP?", "a": "La mitocondria" } },
    { "type": "truefalse", "fields": { "s": "Las células procariotas tienen núcleo.", "v": "F", "n": "Su ADN está libre en el citoplasma." } },
    { "type": "number", "fields": { "q": "¿Cuántos cromosomas tiene una célula humana no sexual?", "a": "46" } },
    { "type": "steps", "fields": { "q": "Ordena las fases de la mitosis", "s": ["Profase", "Metafase", "Anafase", "Telofase"] } },
    { "type": "sort", "fields": { "q": "¿Animal o vegetal?", "g": { "Solo en la célula vegetal": ["pared celular", "cloroplastos"], "Solo en la célula animal": ["centriolos", "lisosomas"] } } },
    { "type": "match", "fields": { "t": "Une cada orgánulo con su función", "p": { "Ribosoma": "fabrica proteínas", "Aparato de Golgi": "empaqueta y envía proteínas", "Lisosoma": "digiere restos" } } },
    { "type": "clozechoice", "fields": { "x": "La fotosíntesis ocurre en los {{cloroplastos}}.", "w": ["ribosomas", "lisosomas", "centriolos"] } },
    { "type": "explain", "fields": { "q": "¿Por qué la membrana celular es semipermeable?", "k": ["Es una bicapa de lípidos", "Deja pasar moléculas pequeñas sin carga", "Las demás pasan por proteínas de transporte"] } },
    { "type": "whatif", "fields": { "s": "Una célula se queda sin oxígeno.", "p": "¿Qué pasa con su energía?", "e": { "ATP que produce": "baja", "Ácido láctico": "sube" }, "k": ["Sin oxígeno no hay respiración aerobia", "Pasa a la fermentación, que da mucho menos ATP"] } }
  ]
}
```

Este ejemplo crea 9 tarjetas.

Japonés, con kanji, furigana y ordenar:

```json
{
  "format": "flaski-notes",
  "version": 1,
  "name": "Japonés · Primeros kanji",
  "lang": "ja-JP",
  "notes": [
    { "type": "kanji", "fields": { "k": "水", "m": "agua", "on": "スイ", "kun": "みず", "e": "水[みず]を 飲[の]む (beber agua)" } },
    { "type": "vocab", "fields": { "w": "学校[がっこう]", "t": "escuela", "e": "学校[がっこう]に 行[い]きます。" } },
    { "type": "order", "fields": { "f": "私は / 毎朝 / コーヒーを / 飲みます", "t": "Bebo café todas las mañanas." } },
    { "type": "choice", "fields": { "q": "¿Qué partícula marca el tema de la frase?", "a": "は", "w": "を; に; で" } }
  ]
}
```

Este ejemplo crea 6 tarjetas.

Alemán, con sustantivos, vocabulario y una conjugación:

```json
{
  "format": "flaski-notes",
  "version": 1,
  "name": "Alemán · La casa",
  "lang": "de-DE",
  "notes": [
    { "type": "de-noun", "fields": { "g": "das", "w": "Haus", "pl": "die Häuser", "t": "la casa" } },
    { "type": "de-noun", "fields": { "g": "die", "w": "Tür", "pl": "die Türen", "t": "la puerta" } },
    { "type": "vocab", "fields": { "w": "wohnen", "t": "vivir (residir)", "e": "Ich wohne in Berlin." } },
    { "type": "conj", "fields": { "v": "wohnen", "k": "Präsens", "t": "vivir", "f": { "ich": "wohne", "du": "wohnst", "er/sie/es": "wohnt", "wir": "wohnen", "ihr": "wohnt", "sie/Sie": "wohnen" } } }
  ]
}
```

Este ejemplo crea 7 tarjetas.

Historia, sin idioma:

```json
{
  "format": "flaski-notes",
  "version": 1,
  "name": "Historia · Revolución francesa",
  "description": "Fechas y conceptos clave para el examen.",
  "notes": [
    { "type": "number", "fields": { "q": "¿En qué año fue la toma de la Bastilla?", "a": "1789", "n": "El 14 de julio, hoy fiesta nacional de Francia." } },
    { "type": "cloze", "fields": { "x": "La Declaración de los Derechos del Hombre y del Ciudadano se aprobó en {{1789}} por la {{Asamblea Nacional::institución}}." } },
    { "type": "choice", "fields": { "q": "¿Quién encabezó el periodo del Terror?", "a": "Robespierre", "w": "Napoleón; Luis XVI; Danton" }, "hint": "Fue líder de los jacobinos." },
    { "type": "reverse", "fields": { "a": "Girondinos", "b": "Facción republicana moderada", "n": "Rivales de los jacobinos." } }
  ]
}
```

Este ejemplo crea 5 tarjetas.

---

*Para usar este documento como skill de Claude, guárdalo como `SKILL.md` dentro de una carpeta llamada `flaski-listas`.*
