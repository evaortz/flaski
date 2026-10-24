# Simulacro de examen

Un examen de prueba igual que el de verdad: preguntas al azar de lo que ya has empezado, con tiempo, sin ver si aciertas hasta entregar, y con nota al final. **No cambia los repasos**: solo los fallos pasan a la tanda (como un «Otra vez»).

Pantallas: `simulacro-movil.jpg` (de izquierda a derecha: entrada, preparar, pregunta, antes de entregar, nota, respuestas) y `simulacro-escritorio.jpg`. En el lienzo están en «Simulacro de examen», debajo de Marcos. La pregunta sale de «Tanda · test» (OpoTest) y la nota de «Fin del simulacro» (OpoSimulacro).

## 1 · Entrada: ficha del examen
- Bloque «Simulacros» en la ficha de cada examen del Plan:
  - el texto de qué es;
  - gráfica de tus notas, con una raya discontinua para «tu objetivo» (por defecto 7, se cambia tocándola);
  - «Vas subiendo: +0,85 desde el primero»;
  - botón «Hacer un simulacro».
- Debajo, «Los últimos»: la nota en letra a mano, los temas, el número de preguntas, la fecha, los minutos y los fallos. Al tocar uno se abre «Las respuestas».
- En Hoy, si falta menos de un mes para un examen: un botón secundario «Simulacro de la semana», que abre la hoja Preparar.

## 2 · Preparar (hoja)
| Campo | Opciones | Notas |
|---|---|---|
| De qué temas | Listas o carpetas del examen | Por defecto, todo lo del examen. Solo entran preguntas ya empezadas, y debajo dice cuántas hay. |
| Cuántas preguntas | 20 · 40 · 60 · 100 | Si hay menos, la opción se apaga. |
| Tiempo | Sin límite · 30 · 40 · 60 min | — |
| Los fallos restan | No · ⅓ · ¼ | «En blanco» nunca resta. |
| Solo preguntas de test | Sí por defecto | Si se quita, las de dar la vuelta se corrigen tú al final («¿La sabías?»). |

- La elección se guarda por examen para la próxima vez.
- El botón dice «Empezar · 40 preguntas, 40 min».

## 3 · La pregunta
- El mismo azul y las mismas opciones A–D que la tanda tipo test, pero **sin corregir**. Al elegir, la opción queda marcada con el anillo blanco y no pasa nada más.
- Cabecera: ✕ (salir, con aviso «Si sales, se pierde este simulacro»), «Simulacro · Bloque I», «pregunta 13 de 40» y el reloj en una píldora (Gochi). Al tocar el reloj se abre «¿Entregas ya?».
- La barra tiene una rayita por pregunta:
  - blanca: la actual;
  - más clara: respondida;
  - ámbar: «para revisar».
- Dos botones:
  - «Dejar en blanco» (borde discontinuo);
  - «Revisar luego» (ámbar, con banderita). Se puede tener una respuesta y estar marcada a la vez.
- Abajo, ‹ (anterior) y «Siguiente». En la última pregunta, «Siguiente» pasa a «Revisar y entregar».
- Tipos que entran: test, huecos con opciones, respuesta numérica y escribir la respuesta (se corrige con checkTyped, y «casi» cuenta como acierto). El resto, solo si se quitó «Solo preguntas de test».
- Cuando queden 5 min, el reloj se pone ámbar. Al llegar a 0 se entrega solo y avisa: «Se acabó el tiempo».

## 4 · ¿Entregas ya?
- Totales: respondidas, para revisar (ámbar) y en blanco.
- La cuadrícula de las 40 (8 columnas en el móvil), con su leyenda. Al tocar un número vas a esa pregunta.
- Un aviso con el tiempo que queda.
- Dos botones:
  - «Entregar y ver la nota»;
  - «Seguir · ir a las N para revisar», que solo sale si hay alguna marcada.

## 5 · La nota (OpoSimulacro + dos cosas)
- Nota sobre 10 grande en Gochi.
- Frase de contexto: «Tu mejor simulacro hasta ahora · +0,9 que el anterior», o «Igual que el anterior», o nada si es el primero.
- Aciertos, fallos y en blanco.
- La cuenta de la penalización en una línea: «29 − 6 ÷ 3 = 27 netas de 40».
- **Por tema**: barras de acierto, fallo y en blanco. El «tema» es la lista, el apunte o la sección del mapa de donde sale cada pregunta.
- **Nuevo, «Tus simulacros»:** la misma gráfica de la entrada.
- Aviso: «Los 6 fallos ya están en tu tanda de mañana».
- Botones:
  - «Repasar los 6 fallos ahora» (una tanda normal con esas preguntas);
  - «Ver las 40 respuestas».

## 6 · Las respuestas
- Filtros: Todas · Fallos · En blanco · Aciertos, con un punto de color.
- Cada fila lleva:
  - el número (Gochi) y un punto de estado;
  - la pregunta;
  - tu respuesta tachada si fallaste;
  - la correcta en verde;
  - la referencia (tema y artículo si lo hay, como en el mapa);
  - «Ver en el apunte» si la pregunta está unida a un bloque.

## 7 · Escritorio
- A la izquierda va la pregunta, centrada, con un máximo de 760 px.
- Columna derecha de 360 px:
  - el reloj grande;
  - una barra de tiempo con «Vas a buen ritmo: 12 respondidas en 12 min»;
  - la cuadrícula de las 40;
  - «Entregar».
- Teclado: 1–4 eligen, B deja en blanco, R marca para revisar, → / ← cambian de pregunta, Esc abre «¿Entregas ya?».

## Datos y reglas
- Un simulacro no toca el progreso de ninguna pregunta. Al entregar, cada fallo hace lo mismo que un «Otra vez» en su próxima tanda: se marca para que salga mañana, sin cambiar su intervalo ahora.
- Lo que hay que guardar de cada simulacro:
  - fecha y examen;
  - ajustes;
  - el orden de las preguntas;
  - por cada pregunta, lo que elegiste o escribiste y si estaba marcada;
  - minutos y nota.
  
  Hace falta para «Los últimos», la gráfica y «Las respuestas».
- Si se cierra la app a mitad, al volver sale «Tienes un simulacro a medias · Seguir / Descartar», y el reloj sigue contando desde donde estaba.
- La nota es aciertos − fallos × penalización, dividido entre el total y multiplicado por 10, redondeada a 2 decimales y nunca por debajo de 0.
