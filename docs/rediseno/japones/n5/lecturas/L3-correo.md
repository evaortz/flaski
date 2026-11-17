# Leer N5 · 3 · Un correo a una amiga
*Texto corto del nivel N5. Toca «Leer» arriba: verás cuánto entiendes y podrás aprender las palabras nuevas con su frase.*

## El texto
ゆいさん

おげんきですか。わたしは げんきです。

来月の 八日は わたしの たんじょう日です。その 日の よる、うちで 小さい パーティーを します。ゆいさんも 来ませんか。

パーティーは 六時半からです。やまださんと なかむらさんも 来ます。わたしが カレーを つくります。ゆいさんは 何か 飲みものを もって 来て ください。

わたしの うちは 駅の 北口から あるいて 五分です。駅の 前の ほんやの となりの 白い 大きい たてものです。わからなかったら、電話して ください。

では、また。

マリア

## Lo que dice
- **Un correo:** María invita a su amiga Yui a su fiesta de cumpleaños.
- Fíjate en cómo invita (来ませんか) y cómo pide algo (もって 来て ください).

## Huecos en el texto
Elige lo que va en cada hueco según el texto.

```json
{
  "format": "flaski-notes",
  "version": 1,
  "name": "Leer N5 · 3 · Un correo a una amiga",
  "lang": "ja-JP",
  "notes": [
    { "type": "choice", "section": "El texto", "fields": { "q": "¿Cuándo es el cumpleaños de María?", "a": "El día 8 del mes que viene", "w": ["Hoy", "El día 8 de este mes", "El día 6 del mes que viene"] } },
    { "type": "choice", "section": "El texto", "fields": { "q": "¿A qué hora empieza la fiesta?", "a": "A las seis y media", "w": ["A las seis", "A las ocho", "A las cinco y media"] } },
    { "type": "choice", "section": "El texto", "fields": { "q": "¿Qué tiene que llevar Yui?", "a": "Algo de beber", "w": ["Curry", "Un pastel", "Nada"] } },
    { "type": "choice", "section": "El texto", "fields": { "q": "¿Dónde está la casa de María?", "a": "Al lado de la librería, delante de la estación", "w": ["Detrás de la estación", "En la salida sur", "Al lado del banco"] } },
    { "type": "truefalse", "section": "El texto", "fields": { "s": "La casa de María está a cinco minutos andando de la estación.", "v": "V", "n": "駅の 北口から あるいて 五分です。" } },
    { "type": "clozechoice", "section": "Huecos en el texto", "fields": { "x": "ゆいさんも 来{{ませんか}}。", "w": ["ません", "ましょうか", "ました"], "e": "Para invitar: 〜ませんか." } },
    { "type": "clozechoice", "section": "Huecos en el texto", "fields": { "x": "何か 飲みものを もって 来て {{ください}}。", "w": ["います", "ありません", "ほしい"], "e": "Forma て + ください: pedir algo." } },
    { "type": "clozechoice", "section": "Huecos en el texto", "fields": { "x": "駅の 前の ほんや{{の}} となりです。", "w": ["に", "を", "が"], "e": "の une nombres para situar: el lado de la librería." } },
    { "type": "clozechoice", "section": "Huecos en el texto", "fields": { "x": "パーティーは 六時半{{から}}です。", "w": ["まで", "に", "で"], "e": "から: desde cuándo empieza." } }
  ]
}
```
