# 3 · は y が
*Minna no Nihongo I: lección 10*

## De qué hablas y qué es lo nuevo
**は** presenta **el tema**: algo que ya está en la conversación. **が** señala **quién o qué**, sobre todo cuando es la información nueva, lo que el otro no sabía.

- わたしは がくせいです。 — Yo soy estudiante. (hablo de mí)
- あ、バスが きました。 — ¡Ah, ha llegado el autobús! (lo nuevo, lo que acabas de ver)

Una forma de pensarlo: con は, lo importante va **después** (がくせいです); con が, lo importante es **lo de antes** (バス).

## Con だれ, なに y どこ como sujeto, が
Cuando la palabra de pregunta es el sujeto, va con **が**, y la respuesta también, porque es justo el dato nuevo.

- だれが きましたか。…たなかさんが きました。 — ¿Quién ha venido? …Ha venido Tanaka.
- なにが ありますか。…ペンが あります。 — ¿Qué hay? …Hay un bolígrafo.

> [!NOTE] Ojo: nunca «だれは». Una palabra de pregunta no puede ser el tema, porque aún no se sabe.

## Hay: あります y います
Para decir que algo **hay** o **está**:
- **あります** para cosas y plantas (lo que no se mueve solo).
- **います** para personas y animales.

| | Hay / está | No hay / no está |
| --- | --- | --- |
| Cosas | あります | ありません |
| Personas y animales | います | いません |

- つくえの うえに ほんが あります。 — Hay un libro encima de la mesa.
- にわに ねこが います。 — Hay un gato en el jardín.

El lugar va con **に**, y lo que hay, con **が**.

## Dónde está: 〜は〜に あります
Si ya sabes de qué hablas y preguntas **dónde está**, el orden cambia: lo conocido va con **は** al principio.

- ほんは つくえの うえに あります。 — El libro está encima de la mesa.
- ミラーさんは どこに いますか。…きょうしつに います。 — ¿Dónde está Miller? …Está en el aula.

Compara: つくえの うえに **ほんが** あります (hay *un* libro) / **ほんは** つくえの うえに あります (*el* libro está ahí).

## Arriba, abajo, delante…
Para situar algo: **objeto + の + posición + に**.

| うえ | した | まえ | うしろ | なか | となり |
| --- | --- | --- | --- | --- | --- |
| encima | debajo | delante | detrás | dentro | al lado |

- いすの したに かばんが あります。 — Debajo de la silla hay un bolso.
- ぎんこうの となりに ゆうびんきょくが あります。 — Al lado del banco hay una oficina de correos.

## Y cosas así: 〜や〜など
**や** une cosas como ejemplos, sin decir que estén todas (la lista sigue). **など** al final refuerza el «etcétera». **と** une la lista completa.

- かばんの なかに ほんや ノートなどが あります。 — En el bolso hay libros, cuadernos y cosas así.
- かばんの なかに ほんと ノートが あります。 — En el bolso hay un libro y un cuaderno (y nada más).

```json
{
  "format": "flaski-notes",
  "version": 1,
  "name": "3 · は y が",
  "lang": "ja-JP",
  "notes": [
    { "type": "clozechoice", "section": "De qué hablas y qué es lo nuevo", "fields": { "x": "あ、バス{{が}} きました。", "w": ["は", "を", "で"], "e": "Lo acabas de ver: es lo nuevo." } },
    { "type": "clozechoice", "section": "De qué hablas y qué es lo nuevo", "fields": { "x": "A: これは なんですか。 B: それ{{は}} ペンです。", "w": ["が", "を", "に"], "e": "Contestas sobre lo que ya está en la conversación: el tema, は." } },
    { "type": "clozechoice", "section": "Con だれ, なに y どこ como sujeto, が", "fields": { "x": "だれ{{が}} きましたか。", "w": ["は", "を", "に"], "e": "Una palabra de pregunta como sujeto va con が." } },
    { "type": "choice", "section": "Con だれ, なに y どこ como sujeto, が", "fields": { "q": "A: だれが きましたか。 B: …", "a": "たなかさんが きました。", "w": ["たなかさんは きました。", "たなかさんを きました。", "はい、きました。"] } },
    { "type": "choice", "section": "Hay: あります y います", "fields": { "q": "にわに ねこが ＿。", "a": "います", "w": ["あります", "です", "ありません"], "n": "Personas y animales: います." } },
    { "type": "choice", "section": "Hay: あります y います", "fields": { "q": "つくえの うえに ほんが ＿。", "a": "あります", "w": ["います", "です", "いません"] } },
    { "type": "order", "section": "Hay: あります y います", "fields": { "f": "つくえの / うえに / ほんが あります", "t": "Hay un libro encima de la mesa." } },
    { "type": "clozechoice", "section": "Dónde está: 〜は〜に あります", "fields": { "x": "ミラーさんは どこ{{に}} いますか。", "w": ["で", "を", "が"], "e": "Dónde está algo: に." } },
    { "type": "choice", "section": "Dónde está: 〜は〜に あります", "fields": { "q": "«El libro está encima de la mesa» (ya sabes de qué libro hablas)", "a": "ほんは つくえの うえに あります。", "w": ["つくえの うえに ほんが あります。", "ほんが つくえの うえで あります。", "つくえは ほんの うえに あります。"] } },
    { "type": "match", "section": "Arriba, abajo, delante…", "fields": { "t": "Une cada palabra con su posición", "p": { "うえ": "encima", "した": "debajo", "まえ": "delante", "うしろ": "detrás", "となり": "al lado" } } },
    { "type": "order", "section": "Arriba, abajo, delante…", "fields": { "f": "かばんは / いすの / したに / あります", "t": "El bolso está debajo de la silla." } },
    { "type": "clozechoice", "section": "Y cosas así: 〜や〜など", "fields": { "x": "かばんの なかに ほん{{や}} ノートなどが あります。", "w": ["を", "が", "で"], "e": "や: ejemplos, la lista sigue." } },
    { "type": "truefalse", "section": "Y cosas así: 〜や〜など", "fields": { "s": "«ほんと ノートが あります» dice que hay un libro y un cuaderno, y nada más.", "v": "V", "n": "と une la lista completa; や, solo ejemplos." } }
  ]
}
```
