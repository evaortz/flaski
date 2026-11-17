# 1 · Presentarse
*Minna no Nihongo I: lecciones 1, 4–5*

## Esto es aquello: 〜は〜です
Para decir qué es algo o quién es alguien: **A は B です**. は marca **de qué hablas** (se lee *wa*, aunque se escribe は) y です cierra la frase con cortesía, como un «es» o «soy» amable.

- わたしは マリアです。 — Soy María.
- たなかさんは 先生[せんせい]です。 — El señor Tanaka es profesor.

En japonés el verbo (y です) va **siempre al final**, y lo que ya se sabe por el contexto se calla: si te preguntan quién eres, basta con マリアです。

> [!NOTE] Ojo: は como partícula se lee *wa*, no *ha*. Es de las pocas excepciones de la escritura.

## No es: じゃありません
Para negar, です pasa a **じゃありません** (también では ありません, más formal y más escrito).

| Afirmativa | Negativa |
| --- | --- |
| 学生[がくせい]です (es estudiante) | 学生[がくせい]じゃ ありません (no es estudiante) |
| いしゃです (es médico) | いしゃでは ありません (no es médico) |

- ミラーさんは 日本人[にほんじん]じゃ ありません。アメリカ人[じん]です。 — El señor Miller no es japonés. Es estadounidense.

## Preguntar: 〜か
Para preguntar, se añade **か** al final. No se cambia el orden de la frase ni hace falta el signo «？» (aunque se puede poner). Se contesta con **はい** (sí) o **いいえ** (no).

- A: リーさんは 学生[がくせい]ですか。 — ¿El señor Lee es estudiante?
- B: はい、学生[がくせい]です。 — Sí, es estudiante.
- B: いいえ、学生[がくせい]じゃ ありません。 — No, no es estudiante.

Con una palabra de pregunta (だれ «quién», なん «qué»), la respuesta da el dato: あの 人[ひと]は だれですか。…きむらさんです。

## También: も
**も** significa «también» y **sustituye a は** (no se ponen las dos).

- わたしは 学生[がくせい]です。ナタリーさんも 学生[がくせい]です。 — Yo soy estudiante. Natalie también es estudiante.

> [!NOTE] Ojo: no es «ナタリーさんはも». も ocupa el sitio de は.

## De: N の N
**の** une dos nombres: el primero explica al segundo. Equivale a «de», pero el orden es al revés que en español.

- 日本語[にほんご]の 先生[せんせい] — profesor **de** japonés (*japonés の profesor*)
- さくら大学[だいがく]の 学生[がくせい] — estudiante **de** la Universidad Sakura

## Llamar a alguien: さん
Detrás del nombre de **otra persona** se pone **さん** (señor, señora, sin distinguir). **Nunca con tu propio nombre.**

- たなかさん, マリアさん — pero わたしは マリアです (sin さん).

## Al final de la frase: ね y よ
Dos partículas pequeñas que dan tono:
- **ね** busca que el otro esté de acuerdo, como «¿verdad?» o «eh»: lo que dices, el otro también lo sabe.
- **よ** da una información que el otro **no sabe**, como «¿sabes?» o «te lo digo yo».

- いい 天気[てんき]ですね。 — Hace buen día, ¿eh?
- この 本[ほん]は おもしろいですよ。 — Este libro es interesante, ¿sabes? (tú no lo has leído)

> [!NOTE] Ojo: si el otro no lo sabe, ね suena raro. «わたしは マリアですね» parecería que dudas de tu propio nombre.

```json
{
  "format": "flaski-notes",
  "version": 1,
  "name": "1 · Presentarse",
  "lang": "ja-JP",
  "notes": [
    { "type": "clozechoice", "section": "Esto es aquello: 〜は〜です", "fields": { "x": "わたし{{は}} マリアです。", "w": ["を", "に", "で"], "e": "Soy María. は marca de qué hablas." } },
    { "type": "choice", "section": "Esto es aquello: 〜は〜です", "fields": { "q": "¿Cómo se lee は cuando es partícula?", "a": "wa", "w": ["ha", "ba", "pa"] } },
    { "type": "order", "section": "Esto es aquello: 〜は〜です", "fields": { "f": "たなかさんは / 先生[せんせい] / です", "t": "El señor Tanaka es profesor." } },
    { "type": "typing", "section": "No es: じゃありません", "fields": { "q": "Niega: 学生[がくせい]です (es estudiante)", "a": "がくせいじゃ ありません / がくせいじゃありません / がくせいでは ありません / がくせいではありません", "n": "じゃ es la forma hablada de では." } },
    { "type": "choice", "section": "No es: じゃありません", "fields": { "q": "«El señor Miller no es japonés»", "a": "ミラーさんは 日本人[にほんじん]じゃ ありません。", "w": ["ミラーさんは 日本人[にほんじん]です。", "ミラーさんは 日本人[にほんじん]じゃ ありませんか。", "ミラーさんも 日本人[にほんじん]です。"] } },
    { "type": "clozechoice", "section": "Preguntar: 〜か", "fields": { "x": "A: あの 人[ひと]は だれです{{か}}。 B: リーさんです。", "w": ["よ", "ね", "も"], "e": "か al final convierte la frase en pregunta." } },
    { "type": "choice", "section": "Preguntar: 〜か", "fields": { "q": "A: あの 人[ひと]は だれですか。 B: …", "a": "きむらさんです。", "w": ["はい、そうです。", "いいえ、だれじゃ ありません。", "わたしは だれです。"], "n": "Con だれ (quién) no se contesta con はい/いいえ: se da el nombre." } },
    { "type": "clozechoice", "section": "También: も", "fields": { "x": "わたしは 学生[がくせい]です。ナタリーさん{{も}} 学生[がくせい]です。", "w": ["を", "に", "へ"], "e": "も (también) ocupa el sitio de は." } },
    { "type": "truefalse", "section": "También: も", "fields": { "s": "«ナタリーさんはも 学生[がくせい]です» es correcto.", "v": "F", "n": "も sustituye a は: ナタリーさんも 学生[がくせい]です。" } },
    { "type": "clozechoice", "section": "De: N の N", "fields": { "x": "日本語[にほんご]{{の}} 先生[せんせい]", "w": ["は", "も", "を"], "e": "Profesor de japonés: el primero explica al segundo." } },
    { "type": "order", "section": "De: N の N", "fields": { "f": "わたしは / さくら大学[だいがく]の / 学生[がくせい] / です", "t": "Soy estudiante de la Universidad Sakura." } },
    { "type": "truefalse", "section": "Llamar a alguien: さん", "fields": { "s": "Para presentarte puedes decir «マリアさんです».", "v": "F", "n": "さん nunca va con tu propio nombre." } },
    { "type": "clozechoice", "section": "Al final de la frase: ね y よ", "fields": { "x": "A: いい 天気[てんき]です{{ね}}。 B: ええ、そうですね。", "w": ["を", "に", "も"], "e": "Los dos lo veis: buscas que el otro esté de acuerdo." } },
    { "type": "clozechoice", "section": "Al final de la frase: ね y よ", "fields": { "x": "A: この 本[ほん]を 読[よ]みましたか。 B: いいえ。 A: おもしろいです{{よ}}。", "w": ["ね", "を", "に"], "e": "B no lo ha leído: le das una información que no tiene." } }
  ]
}
```
