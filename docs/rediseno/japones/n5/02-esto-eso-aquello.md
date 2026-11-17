# 2 · Esto, eso, aquello
*Minna no Nihongo I: lecciones 2–3*

## Esto, eso, aquello: これ, それ, あれ
Para señalar cosas sin nombrarlas. **これ** es lo que está cerca de quien habla, **それ** lo que está cerca de quien escucha y **あれ** lo que queda lejos de los dos. Para preguntar «¿cuál?», **どれ**.

| | Cerca de mí | Cerca de ti | Lejos de los dos | ¿Cuál? / ¿Dónde? |
| --- | --- | --- | --- | --- |
| Cosa | これ | それ | あれ | どれ |
| + nombre | この | その | あの | どの |
| Lugar | ここ | そこ | あそこ | どこ |

- これは 本[ほん]です。 — Esto es un libro.
- A: それは なんですか。 B: これは じしょです。 — ¿Qué es eso? …Esto es un diccionario.
- あれは だれの かさですか。 — ¿De quién es aquel paraguas?

> [!NOTE] Ojo: si te preguntan por それ (lo que tienes tú en la mano), contestas con これ, porque para ti está cerca.

## Este libro: この, その, あの
Para decir **de qué cosa** hablas, la palabra va **pegada a un nombre**: この 本[ほん] (este libro), その かばん (ese bolso), あの 人[ひと] (aquella persona). Solas no funcionan: この, その y あの siempre llevan un nombre detrás.

- この かばんは わたしのです。 — Este bolso es mío.
- その 本[ほん]は いくらですか。 — ¿Cuánto cuesta ese libro?
- あの 人[ひと]は だれですか。 — ¿Quién es aquella persona?

> [!NOTE] Ojo: no es «これ 本[ほん]» ni «このは». Con nombre, この; sin nombre, これ.

## Aquí, ahí, allí: ここ, そこ, あそこ
La misma idea, con sitios: **ここ** (aquí), **そこ** (ahí), **あそこ** (allí) y **どこ** (¿dónde?). Para decir dónde está algo basta con **〜は ここ/あそこです**.

- ここは きょうしつです。 — Esto es el aula. (el sitio donde estamos)
- A: トイレは どこですか。 B: あそこです。 — ¿Dónde está el baño? …Allí.

Con más cortesía, en tiendas o recepciones, se oye **こちら, そちら, あちら, どちら**: エレベーターは こちらです。 (El ascensor está por aquí.)

## De quién: の
Para decir **de quién** es algo, **persona + の + cosa**: わたしの 本[ほん] (mi libro), 先生[せんせい]の かさ (el paraguas del profesor). Para preguntarlo, **だれの**. Si ya se sabe de qué cosa hablas, se calla y queda solo **わたしの** (mío).

- これは わたしの 本[ほん]です。 — Este es mi libro.
- A: その かさは だれのですか。 B: マリアさんのです。 — ¿De quién es ese paraguas? …Es de María.

> [!NOTE] Ojo: «わたし 本[ほん]» no vale; siempre hace falta の. Y «mío» es わたしの, no わたし.

## Cuánto cuesta: いくら
Para preguntar el precio, **〜は いくらですか**. La respuesta lleva el número y **円[えん]** (yenes). Si te lo quedas: **これを ください** (me llevo esto).

- A: この とけいは いくらですか。 B: 三千円[さんぜんえん]です。 — ¿Cuánto cuesta este reloj? …Tres mil yenes.
- じゃ、これを ください。 — Pues me llevo este.

Algunos números cambian de sonido al juntarse:

| 100 | 300 | 600 | 800 | 1000 | 3000 | 8000 | 10 000 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 百[ひゃく] | 三百[さんびゃく] | 六百[ろっぴゃく] | 八百[はっぴゃく] | 千[せん] | 三千[さんぜん] | 八千[はっせん] | 一万[いちまん] |

> [!NOTE] Ojo: 10 000 es いちまん, no «じゅうせん». El japonés cuenta de diez mil en diez mil.

```json
{
  "format": "flaski-notes",
  "version": 1,
  "name": "2 · Esto, eso, aquello",
  "lang": "ja-JP",
  "notes": [
    { "type": "clozechoice", "section": "Esto, eso, aquello: これ, それ, あれ", "fields": { "x": "A: それは なんですか。 B: {{これ}}は じしょです。", "w": ["それ", "あれ", "どれ"], "e": "Te preguntan por lo que tienes tú: para ti está cerca, これ." } },
    { "type": "match", "section": "Esto, eso, aquello: これ, それ, あれ", "fields": { "t": "Une cada palabra con su significado", "p": { "これ": "esto (cerca de mí)", "それ": "eso (cerca de ti)", "あれ": "aquello (lejos de los dos)", "どれ": "¿cuál?" } } },
    { "type": "truefalse", "section": "Esto, eso, aquello: これ, それ, あれ", "fields": { "s": "あれ se usa para algo que está lejos de quien habla y de quien escucha.", "v": "V", "n": "これ: cerca de mí; それ: cerca de ti; あれ: lejos de los dos." } },
    { "type": "clozechoice", "section": "Este libro: この, その, あの", "fields": { "x": "{{この}} かばんは わたしのです。", "w": ["これ", "ここ", "どの"], "e": "Delante de un nombre: この." } },
    { "type": "choice", "section": "Este libro: この, その, あの", "fields": { "q": "«¿Quién es aquella persona?»", "a": "あの 人[ひと]は だれですか。", "w": ["あれ 人[ひと]は だれですか。", "あそこ 人[ひと]は だれですか。", "あの 人[ひと]は なんですか。"], "n": "あの va pegado al nombre; para personas, だれ." } },
    { "type": "clozechoice", "section": "Aquí, ahí, allí: ここ, そこ, あそこ", "fields": { "x": "A: トイレは {{どこ}}ですか。 B: あそこです。", "w": ["なん", "どの", "だれ"], "e": "Para preguntar por un sitio: どこ." } },
    { "type": "choice", "section": "Aquí, ahí, allí: ここ, そこ, あそこ", "fields": { "q": "«El ascensor está allí»", "a": "エレベーターは あそこです。", "w": ["エレベーターは あのです。", "エレベーターは あそこに です。", "エレベーターは あそこを です。"], "n": "Un sitio: あそこ. あの siempre lleva un nombre detrás." } },
    { "type": "order", "section": "De quién: の", "fields": { "f": "これは / わたしの / 本[ほん] / です", "t": "Este es mi libro." } },
    { "type": "choice", "section": "De quién: の", "fields": { "q": "«Este paraguas es mío»", "a": "この かさは わたしのです。", "w": ["この かさは わたしです。", "これ かさは わたしのです。", "この かさの わたしです。"], "n": "Mío: わたしの, sin repetir かさ." } },
    { "type": "clozechoice", "section": "Cuánto cuesta: いくら", "fields": { "x": "A: この とけいは {{いくら}}ですか。 B: 三千円[さんぜんえん]です。", "w": ["なん", "どこ", "だれ"], "e": "Para el precio: いくら." } },
    { "type": "typing", "section": "Cuánto cuesta: いくら", "fields": { "q": "Escribe en hiragana: 300", "a": "さんびゃく", "n": "Detrás de さん, ひゃく suena びゃく." } },
    { "type": "choice", "section": "Cuánto cuesta: いくら", "fields": { "q": "¿Cómo se dice 8000?", "a": "はっせん", "w": ["はちせん", "はっぜん", "はちぜん"] } }
  ]
}
```
