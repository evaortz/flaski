# Cola del rediseño · 5 pasos (en orden · una conversación nueva por paso)

Hechos: pasos 1 a 4 (y el logo). Siguiente: paso 5.

Reglas para que no se eternice:
- Un paso = una conversación. Los remates que salgan se pegan al principio del paso siguiente.
- Dentro de cada paso, trabaja por partes (a, b, c…) con un commit por parte, y no te pares entre partes salvo donde pone (OK).
- Batería completa solo al final del paso, con --workers=100 %; si falla algo, repite solo eso.
- Al acabar: commit (nunca push) y 5–10 líneas en ESTADO.md.

Pie común (pégalo al final de cada mensaje):
> Pruebas: durante el trabajo solo las relacionadas; la batería completa una vez al final con --workers=100%; si una falla, repite solo esa. No hagas push nunca; solo commits. Actualiza ESTADO.md al terminar.

---

## 1 · Primera vez, colores de acento y etiquetas
Lee docs/rediseno/ESTADO.md y estos LEEME con sus pantallas: primera-vez/, perfil-ajustes/ (solo «Color de acento» y «Lo que hoy sale siempre en cobalto») y etiquetas/.
a) Rehaz la primera vez con el flujo de primera-vez/ y añade los dos temas de ejemplo como apuntes (también a los datos de ?local). Reutiliza lo que sirva de onboarding.js.
b) Cambia la lista de acentos por los 9 nuevos (los ids antiguos pasan al más parecido) y quita el cobalto escrito a mano, también en modo oscuro, usando var(--accent) o un color-mix de él. Dime si encuentras más sitios con azul fijo.
c) Cambia las etiquetas al estilo «pegatinas» en todos los sitios donde salen, con la paleta nueva, y rehaz «Gestionar etiquetas».
Comprueba b y c en el navegador con Frambuesa y con Bosque, en claro y en oscuro.

## 2 · Crear preguntas: tipos, editor de una pregunta y sugerencias (OK)
Lee docs/rediseno/FASES.md (fase 8), las capturas tipos-movil y tipos-escritorio de docs/rediseno/pantallas, docs/rediseno/editor-pregunta/LEEME.md con sus pantallas y docs/rediseno/sugerencias/README.md.
a) Rehaz el selector de tipos y la hoja de crear/editar una pregunta (también «Varias de golpe», con la letra a mano en el título y un ejemplo que siga al tipo elegido). No cambies los tipos ni cómo se guardan. Antes de programar esta parte, dime cómo encajas los ~20 tipos en «los más usados + Más tipos» y espera mi OK.
b) Sugerencias sin IA: usa sugerencias/esperadas/*.json como batería de suggest.js; mide cuántas «imprescindible» salen hoy, mejora las reglas y repite la medida. Además: «Crear en» propone «Lista nueva» si el apunte no tiene lista; si la respuesta es una fecha, la pregunta es «¿Cuándo…?»; fechas y datos van antes que «Ordenar frase»; no te saltes frases con fecha de un mismo párrafo. Dime el antes y el después.

## 3 · Estudiar: mapa, repasar en el apunte y preguntas de entender (OK)
Lee docs/rediseno/ESTADO.md, docs/rediseno/mapa-editor/LEEME.md con sus pantallas, docs/rediseno/FASES.md (fase 9) y las capturas entender-* y tanda-fin de docs/rediseno/pantallas.
a) Vista Mapa en lista, carpeta y tema, con la ficha de una casilla, «elegir varias» y «Se te resisten».
b) Modo Repasar dentro del apunte (los 4 botones de la tanda) y el atajo >> / <>.
c) «Explícalo» y «¿Qué pasaría si…?».
Antes de programar, dime en un solo mensaje cómo agrupas las preguntas en casillas con los datos que ya hay y cómo se corrigen las preguntas de entender, y espera mi OK. Después haz a, b y c seguidas.

## 4 · Plan de estudio completo, Explorar y simulacro (OK)
Remates de Explorar (cada uno con su e2e), antes de empezar:
- Las listas que ya tienes dicen «Ver». Pon «La tienes» en la fila y quita «Se copiará a tu cuenta…» de su hoja.
- Vista previa de notas con varias plantillas: una fila por nota («die Wohnung · el piso»), no una por cara.
- «Tus listas compartidas» vacía: «Aún no has compartido ninguna. Abre una lista y pulsa «Compartir»».
- Búsqueda sin resultados: un solo mensaje, «Ninguna lista con «…»», no «Nada por aquí.» en cada sección.
- Si ya la tienes, «48 preguntas · tú tienes 56».

Lee docs/rediseno/ESTADO.md, docs/rediseno/plan-explorar/LEEME.md y docs/rediseno/simulacro/LEEME.md, con sus pantallas.
a) Tu semana con días especiales, Hoy toca (la tanda de Hoy usa los minutos del día) y las pantallas de examen.
b) Etapas: lista, editar, tira en móvil y planificador por meses y semanas en escritorio, orden de temas, «cuando no llegas» y la primera vez. Sin etapas, todo debe seguir funcionando como ahora.
c) Explorar.
d) Simulacro de examen: bloque en la ficha del examen, preparar, pregunta, «¿Entregas ya?», nota, «Las respuestas» y escritorio con teclado.
Antes de programar, dime en un solo mensaje:
- cómo guardarás week, special y stages en prefs, cómo encaja con plan.js y cómo lo resuelves por día;
- dónde guardas los simulacros (sin cambiar Supabase si se puede; si hace falta, dime qué cambio y espera);
- qué tipos de pregunta entran y cómo se corrigen.
Espera mi OK. Después haz a, b, c y d seguidas.

## 5 · Perfil, Ajustes, Amigos y cierre (OK solo para Supabase)
Remates del paso 4 (cada uno con su e2e), antes de empezar:
- Explorar: La Constitución sale con «Añadir» aunque ya la tengo («La Constitución Española · Título Preliminar»). Reconoce las listas de los temas de ejemplo por su id de origen; si no se puede, compara el nombre sin acentos.
- Explorar: la vista previa enseña «{{6 de diciembre de 1978}}». Pinta los huecos como en la tanda («[…]»).
- Estimaciones: en «N min · X preguntas» de Hoy y «salen unas X al día» del Plan, usa como mínimo 6 s por pregunta. Ahora sale «3 min · 27 preguntas» y «200 al día con 10 min».
- Simulacro, gráfica «Tus simulacros»: con notas de 0 no se ve nada. Escala de 0 a 10 (o del mínimo al máximo con margen), con el objetivo y todos los puntos dentro.
- Simulacro, opción elegida: rellena de blanco, con el texto azul y la letra en un círculo azul, como en SimuPregunta. Ahora apenas cambia el borde.
- Simulacro, aviso de penalización: solo si hay penalización, algún fallo y algo en blanco. El texto: «Dejaste N en blanco: si hubieras fallado esas, restarían X más». Nunca con nota 0.
- Simulacro, netas negativas: «… = −1,25 netas · la nota no baja de 0».
- Simulacro: al salir de «Repasar los fallos», vuelve a la nota, no a la lista.
- Simulacro, minutos: «te quedan N min» redondea hacia abajo; con menos de 1, «te queda menos de 1 min». Igual en «¿Entregas ya?».

Lee docs/rediseno/ESTADO.md, docs/rediseno/perfil-ajustes/LEEME.md, docs/rediseno/amigos/LEEME.md y docs/rediseno/papelera-cuenta/LEEME.md con sus pantallas.
a) Reordena Perfil y Ajustes (con el buscador) como dice el LEEME; no borres ningún ajuste sin decirme dónde ha ido.
b) Pantalla Amigos nueva y el texto «X te dice: …». Para «¡Bravo!» como tipo de ánimo, dime qué cambio necesitas en Supabase y espera mi OK; lo demás hazlo sin parar.
c) Papelera (borrar va a la papelera 30 días, «Deshacer», recuperar) y borrar la cuenta (pantalla de 3 pasos). Antes de programar c, dime qué necesitas en Supabase para el borrado suave y para borrar la cuenta, y espera mi OK.
d) Cierre: repasa toda la app en modo oscuro, a 375 px y a 1440 px, arregla lo que se vea roto y deja ESTADO.md al día. Después hago yo el push.
