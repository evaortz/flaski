# Leer N5 · 4 · El aviso de una tienda
*Texto corto del nivel N5. Toca «Leer» arriba: verás cuánto entiendes y podrás aprender las palabras nuevas con su frase.*

## El texto
さくらパン

あたらしい 店が 今月 十日に 駅の 南口に できました。

みせが あいて いる 時間：
月よう日から 金よう日まで　あさ 七時から よる 八時まで
土よう日と 日よう日　あさ 八時から ゆうがた 六時まで
水よう日は 休みです。

十日から 二十日まで、パンは ぜんぶ 百円 安いです。コーヒーは 一ぱい 二百五十円です。パンと いっしょに 買うと、二百円です。

店の 中で 食べる ことも できます。いすが 十二 あります。

## Lo que dice
- **Un aviso:** una panadería nueva con su horario y sus precios. En la comprensión lectora del N5 salen avisos así: horarios, días que cierra y cuánto cuesta.

## Huecos en el texto
Elige lo que va en cada hueco según el texto.

```json
{
  "format": "flaski-notes",
  "version": 1,
  "name": "Leer N5 · 4 · El aviso de una tienda",
  "lang": "ja-JP",
  "notes": [
    { "type": "choice", "section": "El texto", "fields": { "q": "¿Qué día cierra la tienda?", "a": "El miércoles", "w": ["El domingo", "El lunes", "El sábado"] } },
    { "type": "choice", "section": "El texto", "fields": { "q": "¿Hasta qué hora abre el sábado?", "a": "Hasta las seis de la tarde", "w": ["Hasta las ocho de la noche", "Hasta las siete de la tarde", "Hasta las ocho de la mañana"] } },
    { "type": "choice", "section": "El texto", "fields": { "q": "Del 10 al 20, ¿cuánto cuesta el café si compras pan?", "a": "200 yenes", "w": ["250 yenes", "100 yenes", "150 yenes"] } },
    { "type": "choice", "section": "El texto", "fields": { "q": "¿Dónde está la tienda?", "a": "En la salida sur de la estación", "w": ["En la salida norte de la estación", "Dentro de la estación", "Lejos de la estación"] } },
    { "type": "truefalse", "section": "El texto", "fields": { "s": "Se puede comer dentro de la tienda.", "v": "V", "n": "店の 中で 食べる ことも できます。" } },
    { "type": "clozechoice", "section": "Huecos en el texto", "fields": { "x": "月よう日{{から}} 金よう日まで", "w": ["に", "で", "を"], "e": "から〜まで: desde… hasta…" } },
    { "type": "clozechoice", "section": "Huecos en el texto", "fields": { "x": "店の 中で 食べる {{こと}}も できます。", "w": ["もの", "ところ", "とき"], "e": "Forma de diccionario + ことが できます: se puede." } },
    { "type": "clozechoice", "section": "Huecos en el texto", "fields": { "x": "いすが 十二 {{あります}}。", "w": ["います", "です", "します"], "e": "Cosas: あります." } },
    { "type": "clozechoice", "section": "Huecos en el texto", "fields": { "x": "パンは ぜんぶ 百円 {{安い}}です。", "w": ["安く", "安くて", "安かった"], "e": "Adjetivo い delante de です: 安いです." } }
  ]
}
```
