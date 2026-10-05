---
name: flaski-mazos
description: Crea mazos de flashcards para la app Flaski en su formato JSON «por notas». Úsalo cuando alguien pida tarjetas, flashcards o un mazo para estudiar con Flaski.
---

# Cómo crear mazos para Flaski

Flaski es una app de flashcards con repaso espaciado. Tu tarea: convertir lo que la persona quiere estudiar en un mazo con el formato de abajo. Responde **solo con el JSON dentro de un bloque ```json**, sin explicaciones antes ni después, para que se pueda copiar y pegar en la app.

## Formato

```json
{
  "format": "flaski-notes",
  "version": 1,
  "name": "Turco · Comida",
  "description": "Vocabulario básico para pedir en un restaurante.",
  "lang": "tr-TR",
  "notes": [
    { "type": "vocab", "fields": { "w": "ekmek", "t": "pan", "e": "Ekmek alabilir miyim?" }, "tags": ["comida"] },
    { "type": "basic", "fields": { "q": "¿Cómo se pide la cuenta en turco?", "a": "Hesap, lütfen." } },
    { "type": "cloze", "fields": { "x": "Su{{yu::acusativo}} içiyorum." }, "hint": "beber agua" }
  ]
}
```

Este ejemplo crea 4 tarjetas.

- **name** (obligatorio) y **description** (opcional): título y descripción del mazo.
- **lang** (opcional): idioma que se estudia, para el audio de los tipos `vocab`, `listen` y `order`. Valores: `tr-TR` turco, `en-GB` / `en-US` inglés, `fr-FR` francés, `de-DE` alemán, `it-IT` italiano, `pt-PT` / `pt-BR` portugués, `nl-NL` neerlandés, `el-GR` griego, `ru-RU` ruso, `ar-SA` árabe, `ja-JP` japonés, `zh-CN` chino, `ko-KR` coreano, `ca-ES` catalán, `eu-ES` euskera, `gl-ES` gallego, `es-ES` español. Si lo omites, esos tipos suenan en turco.
- **notes**: la lista de notas. Cada nota se escribe **una sola vez**; la app crea sus tarjetas (algunos tipos crean dos).
  - **type**: uno de los tipos de la tabla. Si falta, es `basic`.
  - **fields**: los campos del tipo, con sus claves exactas (`q`, `a`, `w`…). Todos los valores son texto.
  - **hint** (opcional): una pista que se puede ver antes de responder.
  - **tags** (opcional): etiquetas, por ejemplo `["verbos", "examen"]`.

## Tipos

| type | Para qué | Campos (* = obligatorio) | Tarjetas |
|---|---|---|---|
| `basic` | Pregunta y respuesta | `q`* pregunta · `a`* respuesta · `n` nota | 1 |
| `reverse` | Las dos direcciones (A→B y B→A) | `a`* anverso · `b`* reverso · `n` nota | 2 |
| `typing` | Escribir la respuesta exacta | `q`* pregunta · `a`* respuesta · `n` nota | 1 |
| `cloze` | Rellenar huecos en un texto | `x`* texto con `{{huecos}}` · `e` extra | 1 |
| `choice` | Opción múltiple (4 opciones) | `q`* pregunta · `a`* correcta · `w` incorrectas · `n` nota | 1 |
| `vocab` | Vocabulario: reconocer y escribir la palabra | `w`* palabra · `t`* traducción · `p` pronunciación · `e` ejemplo · `n` notas | 2 |
| `kanji` | Kanji: reconocerlo y dibujarlo trazo a trazo | `k`* kanji · `m`* significado · `on` lectura on (katakana) · `kun` lectura kun (hiragana) · `e` ejemplo | 2 |
| `handwrite` | Dibujar la respuesta a mano (cualquier alfabeto) | `q`* pregunta · `a`* lo que hay que escribir · `n` nota | 1 |
| `listen` | Dictado: se escucha y se escribe | `x`* texto que se escucha · `t` traducción · `n` nota | 1 |
| `order` | Ordenar las piezas de una frase | `f`* frase correcta · `t` traducción · `n` nota | 1 |

En `vocab`, la primera tarjeta pide la traducción y la segunda pide escribir la palabra: pon en `w` solo la palabra, sin artículos ni explicaciones (eso va en `n`).

## Sintaxis especial

- **Huecos** (`cloze`): `Ev{{de}}yim`. Con pista: `{{de::lugar}}` (se ve «[lugar]» en el hueco). Puede haber varios huecos en un texto; se ocultan todos a la vez.
- **Respuestas alternativas** (`typing`): sepáralas con ` / `, vale cualquiera: `"a": "gittim / gitmiştim"`.
- **Incorrectas de opción múltiple** (`choice`): en `w`, separadas por `;` : `"w": "Ankara; Esmirna; Bursa"`. Si no pones ninguna, la app usa respuestas de otras tarjetas del mazo.
- **Piezas para ordenar** (`order`): por defecto cada palabra es una pieza. Para elegir tú las piezas, sepáralas con ` / ` (en japonés y chino es obligatorio): `"f": "私は / 毎朝 / コーヒーを / 飲みます"`.
- **Furigana** (japonés): `漢字[かんじ]`, sin espacio entre el kanji y el corchete: `"e": "水[みず]を 飲[の]む"`.
- **Formato**: `**negrita**`, `*cursiva*` y `\n` para saltar de línea.

## Buenas tarjetas

- Una idea por tarjeta. Mejor diez tarjetas pequeñas que una larga.
- La respuesta debe ser corta y sin ambigüedad: quien estudia tiene que poder saber si ha acertado.
- Da contexto con ejemplos (`e`) y notas (`n`), no en la respuesta.
- Elige el tipo según el objetivo: `vocab` para palabras, `cloze` para gramática dentro de frases, `choice` para conceptos que se confunden, `order` para el orden de la frase, `kanji` para escribir kanji.
- Usa pistas (`hint`) cuando la pregunta pueda tener varias respuestas válidas.
- Si no sabes algo con seguridad (una traducción, una lectura), no lo inventes: déjalo fuera.
- Salvo que te pidan otra cosa, unas 20-40 notas por mazo.

## Más ejemplos

Japonés, con kanji, furigana y ordenar:

```json
{
  "format": "flaski-notes",
  "version": 1,
  "name": "Japonés · Primeros kanji",
  "lang": "ja-JP",
  "notes": [
    { "type": "kanji", "fields": { "k": "水", "m": "agua", "on": "スイ", "kun": "みず", "e": "水[みず]を 飲[の]む (beber agua)" } },
    { "type": "vocab", "fields": { "w": "学校[がっこう]", "t": "escuela", "e": "学校[がっこう]に 行[い]きます。" }, "tags": ["lugares"] },
    { "type": "order", "fields": { "f": "私は / 毎朝 / コーヒーを / 飲みます", "t": "Bebo café todas las mañanas." } },
    { "type": "choice", "fields": { "q": "¿Qué partícula marca el tema de la frase?", "a": "は", "w": "を; に; で" } }
  ]
}
```

Este ejemplo crea 6 tarjetas.

Historia, sin idioma:

```json
{
  "format": "flaski-notes",
  "version": 1,
  "name": "Historia · Revolución francesa",
  "description": "Fechas y conceptos clave para el examen.",
  "notes": [
    { "type": "basic", "fields": { "q": "¿En qué año fue la toma de la Bastilla?", "a": "1789", "n": "El 14 de julio, hoy fiesta nacional de Francia." }, "tags": ["fechas"] },
    { "type": "cloze", "fields": { "x": "La Declaración de los Derechos del Hombre y del Ciudadano se aprobó en {{1789}} por la {{Asamblea Nacional::institución}}." } },
    { "type": "choice", "fields": { "q": "¿Quién encabezó el periodo del Terror?", "a": "Robespierre", "w": "Napoleón; Luis XVI; Danton" }, "hint": "Fue líder de los jacobinos." },
    { "type": "reverse", "fields": { "a": "Girondinos", "b": "Facción republicana moderada", "n": "Rivales de los jacobinos." } }
  ]
}
```

Este ejemplo crea 5 tarjetas.

---

*Para usar este documento como skill de Claude, guárdalo como `SKILL.md` dentro de una carpeta llamada `flaski-mazos`.*
