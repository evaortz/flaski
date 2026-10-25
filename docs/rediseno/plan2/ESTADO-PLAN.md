# Plan nuevo · estado (rama plan2-motor)

Lo apunta la conversación del paso A, en paralelo con la del 7+8. Al juntar, va un resumen a `docs/rediseno/ESTADO.md`.

## Paso A · el motor y la migración (25 oct 2026)

Sin pantallas: nada de esto se ve todavía. La app no importa estos módulos, así que no están en `SHELL` ni se ha
subido `VERSION` (lo hará el paso B al usarlos). El interruptor de pruebas es `plan2On()` en `plan2.js`: `?plan2`
en la dirección o `localStorage['flaski-plan2'] = '1'`.

### Archivos

- `js/plan2.js`: el motor, solo funciones puras.
  - `medirRitmo(events)`: mediana de segundos por nueva (sumando sus vueltas del mismo día) y por repaso, con las
    últimas 300 respuestas, sin las de más de 5 min. Con menos de 50, 40 s y 12 s.
  - `newKernel(r)`: los repasos que trae de media una nueva en los días siguientes, con FSRS (`js/fsrs.js` tal cual)
    para la retención `r`: un árbol de aciertos (probabilidad r) y fallos (1 − r) con sus intervalos; el 30 % de las
    nuevas se falla la primera vez y vuelve al día siguiente. Con el 90 %: +1 (0,3), +3 (1), +8, +14, +21, +49…
    (unos 6 repasos en dos años); con el 95 %, unos 10.
  - `stock(state)`: nuevas por lista y, por día, los repasos que ya tocan según el progreso (con los siguientes que
    traerán). Se calcula una vez por datos y se guarda.
  - `minutesOn(plan, día)`: pausa > «hoy solo tengo…» > día especial > semana.
  - `forecast(state)`: simula día a día hasta el último examen (o 120 días sin exámenes; como mucho dos años).
    Cada día: repasos que tocan (más lo que quedó de días sin tiempo) → los que caben → nuevas =
    (min × 60 − repasos × s_repaso) / s_nueva, con los topes. Si no caben todos los repasos, el día se marca y no
    hay nuevas. Reparto: etapa a mano si la hay; si no, entre exámenes (automático 80 % al más cercano con temario
    por ver y 20 % entre los demás y lo que no tiene examen; o manual con `split.shares`), y dentro de cada examen
    las fechas fijadas primero (lo justo para llegar, contando solo los días con tiempo), después `parallel`
    (`shares`) o `seq` (en `order` y luego el de la carpeta). Lo que sobra de uno pasa a los demás.
    Devuelve por examen: veredicto (`llegas`, `justo` con menos de 7 días de repaso, `no`), fecha en que acabas,
    lo que falta, fases (temario, repaso, última semana) y el camino (cada tema con su `from` y `finish`).
  - `today(state)`: lo de hoy (repasos que tocan, nuevas de cada lista, minutos, si cabe y si está hecho, con
    `state.done`). Hoy y el Plan leen esto mismo.
  - `whatIf(state, cambio)`: el forecast con un cambio (una función o un trozo de plan; los exámenes por id).
  - `fixes(state, examId)`: palancas (más minutos los días que ya estudias, un día libre, pausar otro examen,
    quitar la última semana, dejar los últimos temas para después y una fecha más tarde), de una en una y en
    parejas (solo las que ayudan y no llegan solas, dos de cada tipo). Devuelve las 3 que llegan cambiando menos,
    cada una de un tipo distinto, con su plan. Si ninguna llega, `drop`: los últimos temas del camino que habría que
    dejar para el final y cómo quedaría.
  - `sharesToday(state)`, `toPercent(pesos)`: el reparto en porcentajes enteros que suman 100.
- `js/plan2-migrar.js`: `migrate(plan, { today, decks, folders })` → plan v: 2, según el documento. El id de cada
  examen sale de su carpeta o lista (`ex-f-<id>`), así que migrar dos veces o en dos dispositivos da lo mismo. Un
  plan que ya es v: 2 sale igual; la copia `plan.v1 = { saved, until, plan }` se quita pasados 60 días.
- `tests/unit/plan2.test.js`, `plan2-migrar.test.js`, `plan2-datos.js` (cómo se cargan los fixtures y estados
  inventados).
- `tests/fixtures/oposicion-945.json` (el de Eva), `demo.json` (los datos de ejemplo de `?local`, generados con
  `node fixtures/hacer-demo.mjs`) y `comparar.mjs` (la tabla de abajo).
- `tests/playwright.config.js`: el puerto sale de `PORT` (por defecto 8123), para lanzar dos baterías a la vez.

### Lo que añadí al esquema del documento

- `exam.hold: 'AAAA-MM-DD'`: sin nuevas de ese examen hasta esa fecha (la palanca «pausar otro examen»).
- `exam.later: [listas]`: «dejar para después»: no cuentan para llegar y entran como nuevas tras el examen.
- `split.shares.free`: la parte de lo que no tiene examen en modo manual (si no está, solo recibe lo que sobra).
- `exam.after`: de los niveles de antes, «En pausa» → `pause` y «Solo repasos» → `keep`. Con `pause` o `archive`,
  sus repasos dejan de contar tras el examen.

### Decisiones que conviene revisar

- **Retención**: se usa la más alta de los exámenes (90 % por defecto) para todo. La del 95 % de la última semana
  todavía no cambia la carga (se puede afinar en el paso D).
- **`boost` (refuerza este tema)** no hace nada todavía en el motor: es del paso D.
- **Sin tope, el plan nuevo mete muchas más nuevas** que el de ahora (ver la tabla): con 45 min y el ritmo por
  defecto caben unas 36 nuevas el lunes, frente a las 20 de Ajustes. Es lo que pide el diseño («hablar en minutos»),
  pero acaba Auxiliar el 7 nov en vez del 23. Con un tope de 20 nuevas al día (Ajustes del plan), sale el 23 nov.
- **Los dos exámenes del diseño** (prueba «los dos exámenes»): con las 945 preguntas, tope de 20, T1 y T2 sabidos,
  Auxiliar acaba el **23 nov** (como en el diseño, con 7 semanas de repaso) e Inglés el **4 dic**, no el 2: tras el
  23 nov le quedan 190 nuevas y a 20 al día son 10 días con tiempo (el diseño contaba 8). El 80/20 sale igual que en
  el diseño: el primer lunes, 16 de T3 y 4 de Inglés (de Gramática, que va antes que Vocabulario por nombre).
- **Examen a 26 días** (Auxiliar el 20 nov, tope 20): no llegas por **169** de 425 (el diseño decía 131). Los tres
  arreglos: pausar Inglés y quitar la última semana (justo: acabas el 19 nov), quitar la última semana y dejar T8
  para después (justo: 19 nov), dejar T6–T8 para después (justo: 10 nov). Más minutos no ayudan porque manda el tope.
- **Hoy y el Plan, el domingo libre**: `today()` da **48 repasos y 0 nuevas** (lo que hoy dice Hoy); el Plan de ahora
  decía «Hoy toca · 30 preguntas». En un día libre los repasos que tocan siguen contando; si no se hacen, pasan al
  día siguiente (el lunes tiene 105).
- En una etapa a mano, lo que no está en sus niveles cuenta como «Normal».

### Comparación (`node fixtures/comparar.mjs`)

#### Demo (datos de ejemplo) · 25 oct

| | Plan de ahora | Plan nuevo |
|---|---|---|
| Hoy | 19 repasos y 15 nuevas | 19 repasos y 30 nuevas (10 min), lo mismo en Hoy y en el Plan |
| Un día normal | 15 nuevas (las de Ajustes) | 35 nuevas y 13 repasos el 26 oct (10 min) |
| Ritmo | no lo mide (cuenta preguntas) | 13 s por nueva, 11 s por repaso (medido en 267 respuestas) |
| Días en que no caben los repasos | no lo mira | 1 |
| Exámenes | ninguno | ninguno |

La demo no tiene semana: cada día vale los 10 min de la tanda de Ajustes. Sus respuestas inventadas son rápidas
(3–18 s), por eso caben tantas nuevas.

#### 945 preguntas, dos exámenes · 25 oct (domingo libre)

| | Plan de ahora | Plan nuevo |
|---|---|---|
| Hoy | 48 repasos y 0 nuevas en Hoy; en el Plan, «Hoy toca · 30 preguntas» | 48 repasos y 0 nuevas (día libre), lo mismo en Hoy y en el Plan |
| Un día normal | 20 nuevas (las de Ajustes) | 36 nuevas y 105 repasos el 26 oct (45 min) |
| Ritmo | no lo mide (cuenta preguntas) | 40 s por nueva, 12 s por repaso (por defecto: no hay respuestas) |
| Días en que no caben los repasos | no lo mira | 0 |
| Auxiliar Administrativo (16 ene) | acabas el 5 dic · llegas | acabas el 7 nov · llegas · 62 días de repaso |
| Inglés B2 (20 mar) | acabas el 5 dic · llegas | acabas el 13 nov · llegas · 119 días de repaso |

El plan de ahora reparte las 20 nuevas a partes iguales y acaba los dos el 5 dic; el nuevo acaba antes el que
llega antes.

### Rendimiento (node 22, este ordenador)

Con 5.000 preguntas (el 40 % vistas), 3 exámenes y un año por delante: **forecast ≈ 3 ms** (la primera vez, con
el recuento del progreso, unos 20 ms) y **fixes ≈ 170–190 ms** (antes de podar las parejas, 355 ms). En el móvil
con la CPU frenada 4 veces, forecast cabe de sobra en 50 ms; fixes quedaría por encima de 500 ms (≈ 700 ms):
como dice el documento, se calcula solo al abrir «Para llegar» y sin bloquear la pantalla. Lo mide la última
prueba de `plan2.test.js`.

### Pruebas

- Unitarias: 25 nuevas (20 del motor, 5 de la migración), en verde. En total 251 de 252: falla
  `sw.test.js › index.html lleva la versión…` solo en este worktree, porque git lo saca con CRLF
  (`core.autocrlf=true`) y `version.mjs` escribe su bloque con LF; el contenido en git es el mismo.
- e2e, la batería completa con `PORT=8124`: **371 pasan, 3 fallan, 15 saltadas** (6 min). Las tres son de sugerencias
  y vienen de `main` (esta rama no cambia nada que cargue la app):
  - `lista.spec.js:65` «Desde un apunte…» (móvil y escritorio), siempre: en la hoja de sugerencias la lista elegida
    es «+ Lista nueva: «Gramática turca»» en vez de «Turco · Armonía vocálica».
  - `remates-paso5.spec.js:20` (texto pegado en «Trae tus apuntes»): falló una vez y pasó al repetirla.
