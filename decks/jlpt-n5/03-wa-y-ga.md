# 3 · は y が
*Minna no Nihongo I: lección 10*

## De qué hablas y qué es lo nuevo
**は** presenta **el tema**: algo que ya está en la conversación. **が** señala **quién o qué**, sobre todo cuando es la información nueva, lo que el otro no sabía.

- わたしは 学生[がくせい]です。 — Yo soy estudiante. (hablo de mí)
- あ、バスが 来[き]ました。 — ¡Ah, ha llegado el autobús! (lo nuevo, lo que acabas de ver)

Una forma de pensarlo: con は, lo importante va **después** (学生[がくせい]です); con が, lo importante es **lo de antes** (バス).

## Con だれ, なに y どこ como sujeto, が
Cuando la palabra de pregunta es el sujeto, va con **が**, y la respuesta también, porque es justo el dato nuevo.

- だれが 来[き]ましたか。…たなかさんが 来[き]ました。 — ¿Quién ha venido? …Ha venido Tanaka.
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

- つくえの 上[うえ]に 本[ほん]が あります。 — Hay un libro encima de la mesa.
- にわに ねこが います。 — Hay un gato en el jardín.

El lugar va con **に**, y lo que hay, con **が**.

## Dónde está: 〜は〜に あります
Si ya sabes de qué hablas y preguntas **dónde está**, el orden cambia: lo conocido va con **は** al principio.

- 本[ほん]は つくえの 上[うえ]に あります。 — El libro está encima de la mesa.
- ミラーさんは どこに いますか。…きょうしつに います。 — ¿Dónde está Miller? …Está en el aula.

Compara: つくえの 上[うえ]に **本[ほん]が** あります (hay *un* libro) / **本[ほん]は** つくえの 上[うえ]に あります (*el* libro está ahí).

## Arriba, abajo, delante…
Para situar algo: **objeto + の + posición + に**.

| 上[うえ] | 下[した] | 前[まえ] | 後[うし]ろ | 中[なか] | となり |
| --- | --- | --- | --- | --- | --- |
| encima | debajo | delante | detrás | dentro | al lado |

- いすの 下[した]に かばんが あります。 — Debajo de la silla hay un bolso.
- ぎんこうの となりに ゆうびんきょくが あります。 — Al lado del banco hay una oficina de correos.

## Y cosas así: 〜や〜など
**や** une cosas como ejemplos, sin decir que estén todas (la lista sigue). **など** al final refuerza el «etcétera». **と** une la lista completa.

- かばんの 中[なか]に 本[ほん]や ノートなどが あります。 — En el bolso hay libros, cuadernos y cosas así.
- かばんの 中[なか]に 本[ほん]と ノートが あります。 — En el bolso hay un libro y un cuaderno (y nada más).

```json
{
  "format": "flaski-notes",
  "version": 1,
  "name": "3 · は y が",
  "lang": "ja-JP",
  "notes": [
    { "type": "clozechoice", "section": "De qué hablas y qué es lo nuevo", "fields": { "x": "あ、バス{{が}} 来[き]ました。", "w": ["は", "を", "で"], "e": "Lo acabas de ver: es lo nuevo." } },
    { "type": "clozechoice", "section": "De qué hablas y qué es lo nuevo", "fields": { "x": "A: これは なんですか。 B: それ{{は}} ペンです。", "w": ["が", "を", "に"], "e": "Contestas sobre lo que ya está en la conversación: el tema, は." } },
    { "type": "clozechoice", "section": "Con だれ, なに y どこ como sujeto, が", "fields": { "x": "だれ{{が}} 来[き]ましたか。", "w": ["は", "を", "に"], "e": "Una palabra de pregunta como sujeto va con が." } },
    { "type": "choice", "section": "Con だれ, なに y どこ como sujeto, が", "fields": { "q": "A: だれが 来[き]ましたか。 B: …", "a": "たなかさんが 来[き]ました。", "w": ["たなかさんは 来[き]ました。", "たなかさんを 来[き]ました。", "はい、来[き]ました。"] } },
    { "type": "choice", "section": "Hay: あります y います", "fields": { "q": "にわに ねこが ＿。", "a": "います", "w": ["あります", "です", "ありません"], "n": "Personas y animales: います." } },
    { "type": "choice", "section": "Hay: あります y います", "fields": { "q": "つくえの 上[うえ]に 本[ほん]が ＿。", "a": "あります", "w": ["います", "です", "いません"] } },
    { "type": "order", "section": "Hay: あります y います", "fields": { "f": "つくえの / 上[うえ]に / 本[ほん]が あります", "t": "Hay un libro encima de la mesa." } },
    { "type": "clozechoice", "section": "Dónde está: 〜は〜に あります", "fields": { "x": "ミラーさんは どこ{{に}} いますか。", "w": ["で", "を", "が"], "e": "Dónde está algo: に." } },
    { "type": "choice", "section": "Dónde está: 〜は〜に あります", "fields": { "q": "«El libro está encima de la mesa» (ya sabes de qué libro hablas)", "a": "本[ほん]は つくえの 上[うえ]に あります。", "w": ["つくえの 上[うえ]に 本[ほん]が あります。", "本[ほん]が つくえの 上[うえ]で あります。", "つくえは 本[ほん]の 上[うえ]に あります。"] } },
    { "type": "match", "section": "Arriba, abajo, delante…", "fields": { "t": "Une cada palabra con su posición", "p": { "上[うえ]": "encima", "下[した]": "debajo", "前[まえ]": "delante", "後[うし]ろ": "detrás", "となり": "al lado" } } },
    { "type": "order", "section": "Arriba, abajo, delante…", "fields": { "f": "かばんは / いすの / 下[した]に / あります", "t": "El bolso está debajo de la silla." } },
    { "type": "clozechoice", "section": "Y cosas así: 〜や〜など", "fields": { "x": "かばんの 中[なか]に 本[ほん]{{や}} ノートなどが あります。", "w": ["を", "が", "で"], "e": "や: ejemplos, la lista sigue." } },
    { "type": "truefalse", "section": "Y cosas así: 〜や〜など", "fields": { "s": "«本[ほん]と ノートが あります» dice que hay un libro y un cuaderno, y nada más.", "v": "V", "n": "と une la lista completa; や, solo ejemplos." } }
  ]
}
```
