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
- **El tope de nuevas** (decisión de Eva, 25 oct): por defecto manda el de Ajustes (`state.newPerDay`, las «nuevas
  al día»): con 20, nunca más de 20 aunque quepan más en los minutos. `plan.caps.newPerDay` (Ajustes del plan), si lo
  hay, manda sobre él. Sin valor en Ajustes (`newPerDay: null`, cuenta nueva) no hay tope y mandan los minutos: con
  45 min y el ritmo por defecto caben 36 el lunes del estado de 945. `newCap(state)` dice cuál vale.
- **«Subir a N nuevas al día»** es una palanca más de `fixes()` (`kind: 'cap'`, con `from` y `newPerDay`), solo si hay
  tope y el examen no llega; N es el mínimo que llega (búsqueda binaria). Si el examen ya llega, `fixes()` no
  propone nada.
- **Los dos exámenes del diseño** (prueba «los dos exámenes»): con las 945 preguntas, el tope de 20 de Ajustes y T1 y
  T2 sabidos, Auxiliar acaba el **23 nov** (con 7 semanas de repaso) e Inglés el **4 dic**: tras el 23 nov le quedan
  190 nuevas y a 20 al día son 10 días con tiempo (el 2 dic del diseño estaba mal calculado). El 80/20 sale como en
  el diseño: el primer lunes, 16 de T3 y 4 de Inglés (de Gramática, que va antes que Vocabulario por nombre). Los
  dos llegan, así que `fixes()` no propone nada (no sale «Subir a N»).
- **Examen a 26 días** (Auxiliar el 20 nov, tope 20): no llegas por **169** de 425 (el diseño decía 131). Los tres
  arreglos ahora: **subir a 36 nuevas al día** (justo: acabas el 12 nov), pausar Inglés y quitar la última semana
  (justo: 19 nov), quitar la última semana y dejar T8 para después (justo: 19 nov). Con 35 no llega. Más minutos no
  ayudan porque manda el tope.
- **Hoy y el Plan, el domingo libre**: `today()` da **48 repasos y 0 nuevas** (lo que hoy dice Hoy); el Plan de ahora
  decía «Hoy toca · 30 preguntas». En un día libre los repasos que tocan siguen contando; si no se hacen, pasan al
  día siguiente (el lunes tiene 105).
- En una etapa a mano, lo que no está en sus niveles cuenta como «Normal».

### Comparación (`node fixtures/comparar.mjs`)

Con el tope de Ajustes (15 en la demo, 20 en el de 945).

#### Demo (datos de ejemplo) · 25 oct

| | Plan de ahora | Plan nuevo |
|---|---|---|
| Hoy | 19 repasos y 15 nuevas | 19 repasos y 15 nuevas (10 min), lo mismo en Hoy y en el Plan |
| Un día normal | 15 nuevas (las de Ajustes) | 15 nuevas y 8 repasos el 26 oct (10 min) |
| Ritmo | no lo mide (cuenta preguntas) | 13 s por nueva, 11 s por repaso (medido en 267 respuestas) |
| Días en que no caben los repasos | no lo mira | 0 |
| Exámenes | ninguno | ninguno |

La demo no tiene semana: cada día vale los 10 min de la tanda de Ajustes. Sin tope cabrían 30 nuevas (sus
respuestas inventadas son rápidas, 3–18 s).

#### 945 preguntas, dos exámenes · 25 oct (domingo libre)

| | Plan de ahora | Plan nuevo |
|---|---|---|
| Hoy | 48 repasos y 0 nuevas en Hoy; en el Plan, «Hoy toca · 30 preguntas» | 48 repasos y 0 nuevas (día libre), lo mismo en Hoy y en el Plan |
| Un día normal | 20 nuevas (las de Ajustes) | 20 nuevas y 105 repasos el 26 oct (45 min; sin tope cabrían 36) |
| Ritmo | no lo mide (cuenta preguntas) | 40 s por nueva, 12 s por repaso (por defecto: no hay respuestas) |
| Días en que no caben los repasos | no lo mira | 0 |
| Auxiliar Administrativo (16 ene) | acabas el 5 dic · llegas | acabas el 25 nov · llegas · 44 días de repaso |
| Inglés B2 (20 mar) | acabas el 5 dic · llegas | acabas el 5 dic · llegas · 97 días de repaso |

El plan de ahora reparte las 20 nuevas a partes iguales y acaba los dos el 5 dic; el nuevo acaba antes el que
llega antes (80/20). Con T1 y T2 sabidos (el diseño), Auxiliar el 23 nov e Inglés el 4 dic.

### Rendimiento (node 22, este ordenador)

Con 5.000 preguntas (el 40 % vistas), 3 exámenes y un año por delante: **forecast ≈ 3 ms** (la primera vez, con
el recuento del progreso, unos 20 ms) y **fixes ≈ 170–230 ms** (antes de podar las parejas, 355 ms; con la palanca del tope, unos 40 ms más). En el móvil
con la CPU frenada 4 veces, forecast cabe de sobra en 50 ms; fixes quedaría por encima de 500 ms (≈ 700 ms):
como dice el documento, se calcula solo al abrir «Para llegar» y sin bloquear la pantalla. Lo mide la última
prueba de `plan2.test.js`.

### Pruebas

- Unitarias: 27 nuevas (22 del motor, 5 de la migración), en verde. En total 251 de 252: falla
  `sw.test.js › index.html lleva la versión…` solo en este worktree, porque git lo saca con CRLF
  (`core.autocrlf=true`) y `version.mjs` escribe su bloque con LF; el contenido en git es el mismo.
- e2e, la batería completa con `PORT=8124`: **371 pasan, 3 fallan, 15 saltadas** (6 min). Las tres son de sugerencias
  y vienen de `main` (esta rama no cambia nada que cargue la app):
  - `lista.spec.js:65` «Desde un apunte…» (móvil y escritorio), siempre: en la hoja de sugerencias la lista elegida
    es «+ Lista nueva: «Gramática turca»» en vez de «Turco · Armonía vocálica».
  - `remates-paso5.spec.js:20` (texto pegado en «Trae tus apuntes»): falló una vez y pasó al repetirla.

## Paso B · Hoy y la tanda con el motor (25 oct 2026)

Todo detrás del interruptor «plan2» (`?plan2` o `localStorage['flaski-plan2'] = '1'`). Sin él, la app sigue igual
(lo prueba `plan2-hoy.spec.js › sin el interruptor…` y el resto de la batería, que va sin él).

### Cómo se engancha

- `js/plan2-app.js`: el estado del motor con los datos de `S` (progreso, respuestas, lo hecho hoy, las «N nuevas
  más», las nuevas al día de Ajustes como tope) y `todayPlan()` / `forecastNow()`, guardados hasta que cambie algo.
  El plan nuevo se guarda aparte, en `S.prefs.plan2` (nuevo en `prefs.js`, por defecto `null`): mientras no se
  toque, se lee migrado al vuelo del de ahora; al cambiarlo (Tu tiempo, «Hoy solo tengo…») se queda guardado.
  Apagar el interruptor deja el plan de ahora como estaba. En el paso C la migración pasa a `prefs.plan`.
- `js/comun.js`: `hooks.plan2` (lo rellena `plan2-app.js` con el interruptor puesto). Con él, `todayMinutes()` son
  los del plan nuevo, `newPlan()` da las nuevas de cada lista de `today()` (y las de un día normal con `steady`), y
  `backlog()` no reparte lo atrasado (el motor ya pasa a mañana lo que no cabe). `extraNew` se exporta.
- `js/pantallas/estudio.js`: `dayDone()` y `shortSize()` preguntan al motor; al mantener pulsada una pregunta en
  la tanda, una línea dice por qué sale («Toca repasarla hoy», «Toca repasarla: lleva 3 días esperando», «La has
  fallado hace un rato: vuelve hoy», «Es nueva de T3 · Cortes Generales, para Auxiliar»).
- `js/pantallas/inicio.js`: con el interruptor, la tanda de hoy (tema principal, barra y «16 nuevas de Auxiliar ·
  4 de Inglés · 92 repasos», «Empezar · N min»), el aviso si no caben los repasos, «¿Hoy tienes menos tiempo? Hoy
  solo tengo…», el día libre («Hoy tocan 48 repasos. Si te apetece, 10 min de repasos adelantan el lunes…»), la
  pausa y la tarjeta del examen con el veredicto del motor.
- `js/pantallas/plan.js`: con el interruptor, «Tu semana» lleva a Tu tiempo y «Hoy toca» usa los números de
  `today()` («lunes · 45 min · 120 preguntas», «Hoy 20 nuevas: tienes 45 min y 100 repasos»). El resto del Plan
  (resumen, exámenes, etapas, «Qué estudias») sigue con el plan de ahora hasta el paso C.
- `js/pantallas/plan-tiempo.js`: la pantalla **Tu tiempo** (vista `planTime`): deslizadores de cada día (de 0 a 180
  min, de 5 en 5), el total de la semana, días especiales (hoja para crearlos, cambiarlos y borrarlos), «Pausar
  unos días» (`time.pause`) y **Cuánto te cunde** (40 s / 12 s o lo medido, y «Un día de 45 min da para unos 48
  repasos y 20 nuevas», sacado del día siguiente con esos minutos en el forecast). También las hojas «¿Cuánto tienes
  hoy?» (`time.today`) y lo que pinta Hoy.
- `js/app.js`: la vista `planTime`, `data-p2` en clic, `input` y `change`, y el import de `plan2-app.js`.
- `css/plan2.css` (enlazado en `index.html`, en `SHELL`): los estilos nuevos. **No he cambiado nada de `app.css`.**
- `sw.js`: `VERSION` 205 → **206** (al juntar con el 7+8, que también la sube, quedarse con la mayor + 1) y los cinco
  archivos nuevos en `SHELL`, en una línea propia tras `atrasos.js`. `node version.mjs` puesto.
- `js/plan2.js`: `today()` dice además `dayDone` (has respondido algo y has cumplido tus minutos: lo hecho, a tu
  ritmo, o el tiempo de verdad, o no queda nada; en un día libre, nunca), `reviewsFit` y suma `state.extraNew`.
  `state.stockKey` dice cuándo ha cambiado el progreso (la app lo cambia en el sitio).
- `tests/rapida.mjs`: `plan2-hoy` en las pantallas «hoy» y «plan»; `plan2*.js` cuenta como «plan» y «hoy».

### Lo que hay que saber

- «Hecho por hoy» ya no cuenta preguntas con el ritmo de `tanda.js`, sino segundos con el del motor (40 s por
  nueva, 12 s por repaso o lo medido). El mismo cálculo vale para Hoy, el Plan y una lista.
- Hoy cuenta como repasos de hoy los que tocan hasta el final del día (como el motor); la tanda sigue sacando los
  que tocan ya. Si fallas una y vuelve en 10 min, cuenta en los dos.
- «Hoy solo tengo…» ofrece 5, 10, 15, 20, 30, 45 y 60 min, y «Lo de siempre».
- En una pausa, Hoy dice «Estás en pausa» (con «Volver ya»); a la vuelta, lo que se juntó se hace poco a poco
  (lo que no cabe cada día pasa al siguiente).
- Novedades: no las he tocado, porque nada de esto se ve sin el interruptor. Irán con el paso C o D.

### Pruebas del paso B

- Unitarias: **256 de 256** (las del motor con lo nuevo de `today()`: «Hecho por hoy» y las «N nuevas más»).
  Rendimiento con el ordenador libre: forecast **3,8 ms** y fixes **281 ms** (más que en el paso A, unos 170–230,
  porque ahora hay que buscar el N de «Subir a N nuevas al día»: unas 25 simulaciones por llamada). La prueba mide
  el mejor de varios intentos: con otra batería de Playwright a la vez, la mediana se va a 1 s y fallaría sin motivo.
- e2e nuevas, `plan2-hoy.spec.js` (9, una con `@ambos`): «Hecho por hoy» tras la tanda de Hoy (40 repasos y 5 min:
  caben 25), tras la del Plan y tras estudiar desde una lista; el domingo libre, Hoy y el Plan con los mismos 48
  repasos; «Hoy solo tengo 5 min» (15 → 7 nuevas) y vuelta a lo de siempre, que al día siguiente ya no cuenta;
  pausa de 3 días y vuelta; Tu tiempo cambia las nuevas de Hoy (7 → 15); por qué esta pregunta; y sin el
  interruptor, Hoy como antes.
- Batería completa con `PORT=8124`: **381 pasan, 2 fallan, 15 saltadas** (7,5 min). Las dos que fallan son
  `lista.spec.js:65` «Desde un apunte…» (móvil y escritorio), de la otra conversación (ya avisada).

## Revisión del paso A (25 oct 2026)

Un commit por punto, cada uno con la prueba unitaria del caso (`plan2.test.js`, «1 ·» a «8 ·»). Cada prueba falla con
el código de antes y pasa con el arreglo.

1. **Un tema en dos exámenes se repartía dos veces** (47 nuevas → 94 en un día). Ahora cada examen ve lo que han
   dejado los de antes, y lo que uno no puede usar pasa a los demás en una segunda vuelta. Los estados al azar de
   las propiedades meten a veces un tema en dos exámenes.
2. **Respuestas de menos de medio segundo** daban 0 s por repaso y el plan entero en NaN. Ahora como poco 1 s (en
   `medirRitmo` y en `forecast`), y una prueba recorre todo el forecast buscando NaN.
3. **El tope de repasos al día** contaba como «no caben». Ahora un día es corto solo si los repasos que tocan (con
   el tope) no caben en los minutos; el tiempo que deja el tope va a las nuevas (tope 5, lunes de 45 min: 66 nuevas).
4. **«Pausar otro examen»** pausaba también los que van antes. Ahora solo los posteriores (o sin fecha), y `fixes()`
   descarta cualquier arreglo que empeore el veredicto de otro examen (de «llegas» a «justo» o a «no»).
5. **Mover la fecha** solo se propone si el examen tiene `approx: true`, y solo si ningún otro arreglo llega (+1, +2,
   +4 u +8 semanas, la primera que llega).
6. **«Dejar para el final»** podía dejar todo el temario y darlo por «llegas». Ahora deja como mucho todos los temas
   menos el primero; si ni así llega, `drop.exam` dice «no» y lo que falta.
7. **Hoy, tras hacer los repasos, ofrecía 0 nuevas** con tiempo libre. La fórmula ya era la de la revisión (minutos −
   repasos que faltan − lo gastado). El fallo estaba en la caché del motor: la app cambia el progreso en el sitio y
   la caché seguía con los 196 repasos de antes. Ahora la clave lleva una huella del progreso (cuántas, cuándo tocan y
   cuándo se respondieron). Prueba: 196 repasos y 45 min → 8 nuevas; hechos los 196 en el mismo `Map`, siguen 8.
8. **«Más minutos nunca retrasan una fecha»**: con varios exámenes no se cumple siempre, y no puede cumplirse sin
   desperdiciar tiempo. Con 1.200 casos al azar (semilla 98, sumando minutos a un día suelto) sale 1 caso: +20 min el
   30 oct dan 23 nuevas más a ex0 (examen al día siguiente, que no llega de todas formas). Esas nuevas traen repasos
   el 31 oct y el 3 nov, que quitan sitio a ex2, y ex2 acaba el 5 nov en vez del 3 (sigue en «llegas»). Es el
   efecto real de estudiar más hoy: más repasos después. La propiedad ahora dice: el primer examen, y un plan con
   un solo examen, nunca se retrasan (ni empeora su veredicto); los demás, como mucho **2 días** (lo peor
   encontrado en unos 6.600 exámenes de 3.600 casos con tres semillas). Se prueba sumando minutos a todos los días
   y a un día suelto.
9. **Cambio de hora: confirmado, y es código que ya existía** (`js/srs.js:87` y `js/fsrs.js:89`, no del plan nuevo).
   `startOfDay(now) + iv × 24 h` el 25 oct (día de 25 h) da las 23:00 del día anterior al que toca, y la pregunta
   salía un día antes; el 28 mar (23 h) da la 01:00. Ahora se suman días de calendario (medianoche del día que
   toca), en los dos algoritmos. Prueba: `unit/cambio-hora.test.js` con `TZ=Europe/Madrid` el 24 y el 25 oct y el 27 y
   el 28 mar (antes fallaban las 8). Las preguntas ya guardadas con la hora de antes no se tocan: como mucho salen
   unas horas antes una vez. El motor del plan ya contaba los días con `Math.round`, así que no le afectaba.
10. **`medirRitmo` agrupaba las vueltas por día UTC**: confirmado (una nueva a las 00:30 y su vuelta a la 01:30 de
    España caían en días distintos y contaban como dos). Ahora por día de aquí (`dateKey`).
11. **Orden del filtro**: confirmado. Ahora primero las últimas 300 respuestas y después, de ellas, fuera las de más de
    5 min (si quedan menos de 50, 40 s y 12 s). Los dos en un commit, porque son la misma función. Pruebas en
    `cambio-hora.test.js` (con `TZ=Europe/Madrid`).
12. **Retención**: confirmado (nunca bajaba del 90 %). Ahora es la más alta que pide un examen, entre el 70 y el 99 %
    (90 % sin exámenes). Con el 85 % hay menos repasos que con el 90 %, y con el 95 %, más.
13. **Fechas fijadas**: confirmado. Se repartían entre todos los días con minutos hasta la fecha, también los de la
    última semana y los de la pausa del examen (`hold`), en los que ese examen no da nuevas, y el tema llegaba tarde.
    Ahora solo cuentan los días en que el examen puede dar nuevas (y, como mucho, hasta su último día de temario).
14. **Exámenes pasados**: confirmado (lo que quedaba por ver de un examen pasado no volvía a salir nunca). Según el
    diseño («¿Y después del examen?»: pausar, archivar, mantener o preparar otra convocatoria; por defecto, preguntar):
    con `after: 'next'` (otra convocatoria) lo que queda sigue entrando como nuevas, con lo que no tiene examen; con
    `keep`, o mientras no se ha contestado la pregunta (`null`), solo repasos; con `pause` o `archive`, nada (ni
    repasos). Lo que dejaste para después (`later`) entra siempre. La pregunta al pasar la fecha es del paso D.

### Lo que faltaba del diseño

- `approx`: hecho (punto 5). Con fecha aproximada, mover la fecha es el último arreglo.
- `after: 'next'`: hecho (punto 14).
- `boost` («Refuerza este tema»: más repasos de lo flojo unos días) y `retentionLast` (95 % la última semana):
  **paso D**, con sus controles («Refuerza este tema» y la retención en Ajustes del plan). En el motor serán carga
  de repasos de más en esos días para las listas del examen (ahora no cambian nada).
- `history` (los 20 últimos cambios con «Deshacer») y `weekly` (el repaso del domingo): **paso D**, son sus pantallas.
  El motor no los lee; el paso C ya guardará cada cambio en `history` al cambiar el reparto o un examen.

### Pruebas

- Las de los pasos A y B importan `js/srs.js`, `js/rows.js`, `js/fsrs.js` y `js/plan.js` del propio worktree
  (`../../js/…`): pasan desde `../kartlar-plan2/tests`.
- Al final de `plan2.test.js`, una pasada de todas las propiedades con **500 casos al azar** y semilla fija (2026):
  los mismos casos cada vez (unos 5 s). Los estados al azar están en `plan2-datos.js` (`randomState`).

### Del paso B

15. **«Cuánto te cunde» y Hoy daban cifras distintas** (48 repasos del martes frente a los 100 del lunes en Hoy). Ahora
    las dos salen del mismo día del motor: hoy, si tiene minutos (lo que da el día entero), o el próximo día con
    tiempo. e2e con las 945 preguntas el lunes 26 oct: Hoy «16 nuevas de Auxiliar · 4 de Inglés · 100 repasos» y Tu
    tiempo «Un día de 45 min da para unos 100 repasos y 20 nuevas».
16. **Comprobado en el navegador** (Chromium de Playwright, e2e `plan2-hoy.spec.js`) con las 945 preguntas: hechos los
    100 repasos (con `recordAnswer`, como en la tanda), Hoy no dice «Hecho por hoy» y ofrece «16 nuevas de Auxiliar ·
    4 de Inglés»; el Plan dice lo mismo: «20 preguntas» y «Hoy 20 nuevas: tienes 45 min y 0 repasos».

### Resultados

- Unitarias: 277 (276 en verde; la de rendimiento falla solo mientras otra batería de Playwright ocupa el ordenador,
  ver abajo).
- Batería completa, `PORT=8124 --workers=2`: **383 pasan, 2 fallan** (las de siempre, `lista.spec.js:65`, de la otra
  conversación), 15 saltadas, 13,4 min.
- La tabla de comparación (`node fixtures/comparar.mjs`) sale igual que antes: los arreglos no cambian estos dos
  estados. El lunes 26 oct sale con 105 repasos en la tabla y 100 en la e2e: la tabla calcula desde el domingo y
  cuenta de media las que se fallarán (0,1 por repaso), la e2e mira el lunes por la mañana.

### La prueba de rendimiento, aparte

La medida de verdad (5.000 preguntas, 3 exámenes y un año: forecast < 50 ms y fixes < 500 ms, con la mediana) está
en `tests/unit/rendimiento.perf.js`, fuera de la batería normal (el patrón `unit/*.test.js` no la recoge).
**Cuándo lanzarla:** con el ordenador libre, sin otra batería de Playwright a la vez (con otra, fixes pasa de 1 s y
fallaría sin motivo), después de tocar el motor (`js/plan2.js`) y antes de juntar. Desde `tests/`:

    npm run rendimiento

En la batería normal queda solo una comprobación holgada (`plan2.test.js › rendimiento holgado`: fixes < 2 s), para
pillar algo roto de verdad.

## Paso C · Las pantallas nuevas del Plan (25 oct 2026)

**El plan nuevo ya es el de todo el mundo**: sin interruptor. Al entrar (con las listas cargadas), el plan de antes
pasa al nuevo (`migrateLoaded()` en `plan2-app.js`) y queda en `S.prefs.plan` (v: 2), con la copia `plan.v1` 60 días.
Quien lo probó con el interruptor (`prefs.plan2`) se queda con el suyo. Hoy, la tanda y la Biblioteca leen el motor.

### Pantallas (iguales que las imágenes del lienzo)

- `plan-ui.js`: piezas compartidas. La barra del examen (temario por ver rayado, repaso, última semana y la marca
  «acabas el…»), la fila de la semana (7 días desde hoy, con sus minutos y el tema que toca), los deslizadores que
  suman 100 (`rebalance`: los demás se reparten lo que sobra en proporción; con teclado, de 5 en 5), la franja «Así
  quedaría» (whatIf 150 ms después del último cambio) y la tarjeta de arreglo (título, explicación y «Llegas: acabas
  el…»).
- `plan-inicio.js` (vista `plan`): el veredicto («Llegas a los dos exámenes» o «Así no llegas a Auxiliar» con lo que
  quedaría y cuántas harían falta), «Para llegar» (los arreglos se calculan al abrir, sin bloquear; «Aplicar la
  primera / segunda…», «Lo dejo así»; si ninguno llega, qué temas dejar para después), los exámenes con su barra,
  «Añadir un examen», Esta semana, Qué toca ahora (con una línea de lo de hoy, la misma que Hoy, o «Hecho por hoy»)
  y Ajustes del plan. En el ordenador (≥ 1024 px): «Ajustes del plan» y «+ Examen» arriba, dos columnas, «Hasta los
  exámenes» (una fila por examen con goteo, temario, repaso, última semana y su calendario sobre los meses) y
  «Cuánto te cunde».
- `plan-examen.js` (vista `exam`): cómo va («Llegas con 7 semanas de repaso», la barra y el ritmo), el camino (cada
  tema con su marca, sus fechas y sus nuevas; Repaso, Última semana y Examen), «Un tema tras otro | Varios a la vez»,
  «Cambiar el orden» (arrastrando por el asa o con flechas), «Fijar una fecha» (con «Así quedaría»), la recta final
  (última semana, después del examen en pausa), los simulacros y «Cambiar la fecha · Quitar el examen».
- `plan-nuevo.js`: la hoja de nuevo examen (y de cambiarlo): qué entra (una carpeta, una lista o varias, con «8 temas
  · 525 preguntas · 100 vistas»), cuándo (fecha exacta), cuánto tiempo («Mi semana · 4 h 45», 30 min/día, 1 h/día,
  Otro), el resultado en vivo y los dos interruptores.
- `plan-reparto.js`: entre exámenes (Automático | A mi manera) y dentro de un examen (Un tema tras otro | Varios a la
  vez, «Añadir otro tema a la vez»), con «Así sigues llegando».
- `plan-hojas.js`: «En tu plan» desde la Biblioteca (botón en la cabecera de una carpeta y entrada en el menú de una
  lista y de un apunte): con examen (su barra, «Se lleva el 80 % de tus nuevas», «Ahora: T3…», «Ver el camino»),
  en un tema (los tres datos, Ya me lo sé, Estudiarlo a la vez que…, Fijar una fecha, Este tema no cae) y sin examen
  (Activo | Solo repasar | Pausa y «Ponerle examen»).
- `plan-ajustes.js` (vista `planSettings`): el reparto, lo que no tiene examen («· por gusto»), **las etapas a mano**
  (que pasan aquí: nombre, fechas y el nivel de cada carpeta o lista), «Un goteo al examen siguiente» (`split.drip`),
  «Nuevas al día, como mucho» (las de Ajustes, un número o «Sin tope»: `caps.noCap`) y Tu tiempo.
- `plan-guardar.js`: cada cambio del plan se guarda con su entrada en `history` (los 20 últimos, con lo de antes),
  su `updated_at` (examen, tiempo, reparto) y un aviso con «Deshacer».
- `plan-acciones.js`: a dónde va cada `data-p2` (clic, input y change). `pantallas/plan.js` se queda en unos ayudantes
  para Simulacro; las pantallas viejas (resumen, tu semana, temporada, etapas, foco, «Hagamos tu plan») se han ido.

### Lo que cambia por debajo

- `prefs.js`: el plan por defecto es el nuevo; el guardado se conserva tal cual (`normalizePlan`). Al juntar dos
  dispositivos (`mergePlan`): cada examen, tu tiempo y el reparto, el más reciente (`updated_at`); los días especiales
  y las etapas, por id; dos planes de antes, como antes; si uno ya está migrado, ese.
- `comun.js`: `stateOf` (lo que está en pausa o solo repasos: lo que no tiene examen, la etapa de hoy y los exámenes
  pasados en pausa) y `nearDecks` (los temas de los exámenes a 14 días o menos) salen del plan nuevo.
- `cuenta.js`: la migración al entrar, y el examen de la oposición de la primera vez, en el plan nuevo.
- Hoy (`inicio.js`): siempre la tarjeta de la tanda del motor; fuera el número grande, «Empezar una tanda · N min ·
  M preguntas» y los atrasos (lo que no cabe pasa solo a mañana). La hoja «¿Cuánto suele durar tu rato?» cuenta las
  preguntas con el motor.
- El motor (`plan2.js`): el día de hoy ya cuenta lo hecho (el tiempo gastado y las nuevas vistas gastan del tope una
  sola vez; antes, tras aprender una nueva, Hoy ofrecía 0) y las «N nuevas más»; «Hecho por hoy» solo al cumplir
  los minutos (si no queda nada antes, «estás al día»); `split.drip` y `caps.noCap`. Hoy descuenta las hermanas que
  esperan (una por nota, como la tanda), para que Hoy, el Plan, la Biblioteca y la tanda digan lo mismo.
- Biblioteca: «examen el 12 dic» de una carpeta sale de los exámenes nuevos.
- Iconos nuevos en `icons.js` (de Lucide): star, ban, zap, target y chart-pie.
- `sw.js`: los nueve archivos nuevos en `SHELL` (VERSION sigue en 206: nada se ha subido desde que se subió a 206).

### Para cuando lo juntéis

- **`css/app.css` tiene las reglas del plan de antes, que ya no se usan** (`.pl-*`, `.pw-*`, `.ps-*`, `.psx*`, `.tp-*`,
  `.pe-*`, `.ex-*` de la ficha y del calendario, `.pf-*`, `.ord-*`, `.ht-*`, `.fix-*`, `.lv-seg`, `.hero-num`,
  `.hero-side`, `.hero-go`, `.hero-more`, `.hero-spare`…). No las he quitado para no chocar con la otra
  conversación: se pueden borrar al juntar (comprobando con un grep que nada las pinta).
- `js/plan.js` (las cuentas de antes) sigue: lo usan el motor (días, etapas, `allocate`), la migración y sus pruebas.
  `simulate`, `nodesOn`, `examFloors` y compañía ya no los usa la app; se pueden quitar con sus pruebas más adelante.

### Lo que queda para el paso D (Novedades incluidas)

- «Ya me lo sé» marca el tema como sabido directamente; la prueba de 10 preguntas es del paso D.
- «Refuerza este tema» no sale todavía (el motor aún no hace nada con `boost`).
- Las Novedades del plan nuevo, con sus capturas, van con el paso D (como dice el documento).

### Pruebas del paso C

- e2e nuevas, `plan-c.spec.js` (12): crear un examen; reparto 70/30 viendo «Así quedaría» y deshacerlo; varios temas a
  la vez; fijar una fecha; cambiar el orden con flechas y arrastrando (`@ambos`); las tres hojas de «En tu plan»;
  migración de un plan de antes con etapas; lo que no tiene examen (pausa y solo repasar); un día especial; y «Así no
  llegas» con «Para llegar»: aplicar, deshacer, «Lo dejo así» y quitar el examen.
- Quitadas (probaban el plan de antes, y lo suyo lo cubren las nuevas): `plan.spec.js`, `dia-libre.spec.js`,
  `hecho-por-hoy.spec.js`, `minutos-de-verdad.spec.js` y las seis del plan de `remates-plan.spec.js` (quedan sus tres
  de Explorar); dos de `repaso-25oct.spec.js` (el Plan en oscuro y el planificador).
- Cambiadas para la Hoy nueva: el número de Hoy pasa a `hoyCount(page)` (fixtures: lo que dice la leyenda de la
  tanda), `startTanda` pulsa «Empezar · N min», y simulacro, perfil, hoy, contraste, tanda-corta y capturas-plan
  ponen los exámenes en el plan nuevo. «Atrasos» pasa a ser «al volver tras unos días: lo atrasado no cabe…».
- `tests/rapida.mjs`: «plan» = plan-c, plan2-hoy y simulacro; «hoy» con tanda-corta; remates-plan, en «explorar».
- Unitarias: **280 de 280**. Batería completa (`PORT=8124`): **375 pasan, 2 fallan, 13 saltadas** (4,9 min). Las dos que
  fallan son las de siempre, `lista.spec.js:65` «Desde un apunte…» (móvil y escritorio), de la otra conversación.

## Revisión del paso C (25 oct 2026)

1. **Sin exámenes, las pantallas solo nombraban la primera lista.** Ahora las nuevas de un día se agrupan
   (`newGroups` en `plan-ui.js`): cada examen y lo que no tiene examen juntos. Hoy se titula con el tema principal del
   examen que más da o, sin examen, «Tus listas» (o la lista, si es una), y la leyenda dice «15 nuevas de 5 listas»
   («12 nuevas de Oposición · 3 de 2 listas» en el caso mezclado; «15 nuevas de Temario» con una sola). En Qué toca
   ahora, una fila «Tus listas · sin examen · 15 nuevas hoy» que al tocarla dice cuántas de cada una. En la semana
   (`dayTags`), la etiqueta solo si un tema se lleva más de la mitad del día (con el siguiente del mismo examen si se
   lleva un cuarto: «T3·T4»), o dos temas del mismo examen a la par; si se reparte entre varias listas, nada.
2. **El Repaso del camino llevaba la marca de hecho sin haber empezado.** Ahora va vacío como los temas por ver, con
   el punto de «ahora» mientras dura, y la marca solo cuando ha pasado.

Pruebas: e2e con la demo de verdad (`?local` → «Cargar datos de ejemplo»: 5 listas, 3 nuevas de cada una), el caso
mezclado y el Repaso, en `plan-c.spec.js`. `hoyCount` cuenta ahora el número del principio de cada parte de la
leyenda (con «de 5 listas» sumaba el 5). Unitarias 280 de 280; batería completa 378 pasan y 2 fallan (las de siempre,
`lista.spec.js:65`, de la otra conversación).

## Paso D

### 0 · Dos dispositivos: versión vieja (plan v1) y nueva (v2)

El riesgo: una versión vieja de la app, al cargar, conserva solo las claves del plan que conoce (`nodes`, `week`,
`special`, `stages`, `simGoal`, `sim`, `startDone`, `lateOk`) y al guardar pisa el plan de la nube con su v1 (sin
exámenes, tiempo ni reparto del nuevo). Como su código ya está instalado, la protección va en la nueva:
- Al guardar en la nube (`mergeSynced` → `withMirror`), el plan nuevo lleva un **espejo en v1** (`toV1`: un nodo por
  examen con su fecha, última semana y después; los estados de lo que no tiene examen; la semana, los días especiales
  y las etapas), para que la vieja siga viendo sus exámenes, y una **copia de sí mismo en `plan.sim.__v2`** (la vieja
  guarda `sim` entero sin mirarlo).
- Si la vieja escribe su v1 encima, la nueva (al entrar, en `migrate`, o al guardar, en `mergePlan`) compara ese v1
  con el espejo de la copia y aplica **solo lo que se cambió en la vieja** (`absorbV1`: fecha, última semana y
  después de cada examen, exámenes nuevos o quitados, estados, la semana; días especiales y etapas por id). Lo demás
  del v2 (varios a la vez, fechas fijadas, reparto, topes, historial…) se conserva. Nunca vuelve al v1.
- El espejo y la copia solo van en la nube: al leer, se quitan.

Pruebas: unitarias (imitando cómo carga y guarda la versión vieja) en los dos órdenes, también si la nueva guarda
sin volver a entrar; e2e `plan-dispositivos.spec.js` con la nube simulada (`nube.js` guarda ahora la fila de
`settings`): la vieja primero y la nueva después, y la nueva con el plan abierto cuando guarda la vieja.

### Revisión del paso C (2): los atrasos y el final de la tanda

3. **Los atrasos vuelven, con el motor.** Cuando hay repasos de días anteriores que aún tocan, Hoy (y el Plan, en Qué
   toca ahora) enseña una fila como «Lo dejaste aquí»: «36 atrasadas · las repartes hasta el sábado» (el primer día
   en que, con tus minutos, no queda nada para el siguiente; `lateNow()` en `plan2-app.js`), o «las haces hoy» si
   caben. Al tocarla, la hoja de siempre explicada con el motor (cuántas, hasta cuándo, que mientras tanto entran
   menos nuevas) con «Repartirlas» (lo que hace el motor) y «Hacerlas todas hoy» (ese día, en este dispositivo, la
   tanda lleva todos los repasos aunque pasen de tus minutos). Con atrasos, el final de una tanda no ofrece «N nuevas
   más» sino «¿Adelantas 10 atrasadas?» (las más antiguas). La hoja y la acción viejas (`backlogSheet`,
   `atrasos-all`) se han quitado; `atrasos.js` sigue, pero la app ya no lo usa.
4. **El final de la tanda cuando ya has hecho los minutos del día**: si el plan dice «Hecho por hoy» (el mismo
   `dayDone()` que Hoy), el botón principal es «Volver a Hoy» y lo que queda va como enlace, con los mismos minutos
   que en Hoy (`restLink` cuenta ahora con tu ritmo del motor, `minsFor`). Si no, como antes.

Pruebas: `plan-atrasos.spec.js` (de vuelta tras 19 días con las 945 preguntas: la fila, la hoja, las dos opciones,
Hoy y el Plan con el mismo texto; con atrasos, «¿Adelantas 10 atrasadas?» en vez de nuevas; y el final de la tanda
que completa los 5 min), y `tanda-corta.spec.js` y `hoy.spec.js` ajustadas.

### 1 · No llegas

«Para llegar» ya estaba del paso C (las opciones de `fixes()` con su resultado, «Aplicar la primera / segunda /
tercera» con «Deshacer», «Lo dejo así» y, si ninguna llega, qué temas dejar para después). Nuevas e2e en
`plan-d.spec.js` con el caso del diseño: las 945 preguntas con Auxiliar a 26 días (tres opciones, la primera «Subir a
35 nuevas al día», cada una con «Llegas…: acabas el…»; aplicar la segunda, que el veredicto diga su fecha, y
deshacer) y un examen a 7 días donde ninguna llega (dejar temas para después).
