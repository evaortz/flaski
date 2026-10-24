# Logo nuevo · f2 «se va formando» (logo-final.jpg)

Una F hecha de 12 puntos que crecen en el orden en que se escribe la F (arriba de izquierda a derecha,
luego el palo y el brazo del medio): lo que repasas se va fijando. Un solo color.

## Archivos
- `flaski-marca.svg` / `flaski-marca-blanca.svg`: solo la marca (puntos), sin fondo.
- `flaski-icono.svg`: icono con fondo cobalto y esquinas redondeadas (para Apple y la app).
- `flaski-icono-maskable.svg`: igual pero cuadrado y con más margen (para Android, «maskable»).
- `favicon.svg` + `favicon-32.png` / `favicon-16.png`.
- PNG: `flaski-icono-180.png` (apple-touch-icon), `-192` y `-512` (manifest), `flaski-icono-maskable-192/512.png`.

## Dónde va
1. `index.html`: favicon (svg + png 32) y `apple-touch-icon` (180).
2. `manifest.webmanifest`: iconos 192 y 512 (`purpose: any`) y maskable 192 y 512 (`purpose: maskable`).
3. Cabecera móvil («F Flaski») y barra lateral de escritorio: la marca en línea (SVG en el código, `fill: currentColor`
   o `var(--accent)`), a la izquierda de «Flaski» en Gochi Hand, sin el cuadrado de la «F».
4. Dentro de la app la marca sigue el color de acento (los 9). El icono instalado y el favicon se quedan en cobalto
   (no se pueden cambiar en caliente de forma fiable).
5. En la marca: radio de cada punto = 8.2 − 0.9·orden y opacidad = 1 − 0.08·orden (orden de 0 a 5, ver el SVG).
