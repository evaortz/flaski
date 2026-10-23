# Estado del rediseño

## Fase 1 · dividir app.js (hecha)
- Hecho: app.js (6.629 líneas) → `js/app.js` (~880: go/render, manejadores globales y arranque), `js/comun.js` (estado `S` único y utilidades) y `js/pantallas/` (cuenta, inicio, estudio, mazos, explorar, apuntes, perfil, editor, amigos). Un commit por archivo; `sw.js` va por `flaski-v82`.
- Solo se ha movido código: las líneas son las mismas que en el original. Cambian los `import`/`export`, se quitan imports que no se usaban y hay un setter (`setImportInto`) porque app.js reasignaba esa variable de apuntes.
- `openSheet`/`closeSheet` están en `pantallas/editor.js` y no en `comun.js`, porque `closeSheet` llama a las sugerencias de apuntes y `comun.js` no puede importar pantallas.
- Cambia el orden de carga de los módulos, así que los listeners de `visibilitychange`/`pagehide` (guardar copia, apuntes y ajustes) se ejecutan en otro orden. Lo he revisado y no cambia nada: cada uno guarda cosas distintas.
- Prueba retocada: `sin-conexion` «una imagen añadida sin conexión…» ahora espera a que la app tenga sesión tras recargar. Antes dependía de la velocidad del arranque.
- Pendiente: `sin-conexion` «abrir la app sin conexión…» (escritorio) es inestable desde antes de la fase 1: falla 3 de cada 15 veces también con el app.js original.
- Duda: `apuntes.js` (~2.300 líneas) y `editor.js` (~1.100) siguen siendo grandes. Se podrían partir (tablas, buscar, exportar/importar…) si una fase lo pide.

## Fase 1b · escritura de kanji a mano (arreglada)
- Causa: no venía de dividir app.js. Desde el estilo «cuaderno» (de68876) `--fg`, `--line-strong` y `--faint` son `color-mix()`; `theme()` de `js/handwriting.js` se los pasaba tal cual a Hanzi Writer, que lanza «Invalid color» y deja la caja vacía (sin trazos ni corrección). Afectaba a la tanda y a la hoja «Orden de trazos».
- Arreglo: `theme()` resuelve cada color en el navegador y lo pasa a `rgba()` con un lienzo de 1×1. También vale para el lienzo libre. `sw.js` → `flaski-v83`.
- Probado en móvil (375 px, táctil) y escritorio con 日, 駅 y 予約: se dibuja el trazo, se corrige y la página no se desplaza. Nueva e2e `kanji.spec.js`: escribe 日 trazo a trazo con datos locales (`e2e/trazos/nichi.json`).
