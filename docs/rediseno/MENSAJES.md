# Cola del rediseño (en orden · una conversación nueva por paso)

Hechas: 1–6, 3b, 4b, 4c. En curso: 4d (con sus remates).

Reglas para que no se eternice:
- Un paso = una conversación. Los remates que salgan se pegan al principio del paso siguiente, no en una conversación aparte.
- Solo se para a pedir OK en los pasos marcados con (OK). En los demás programa directamente.
- Batería completa solo al final de cada paso, con --workers=100 %; si falla algo, repite solo eso.
- Al acabar: commit (nunca push) y 5–10 líneas en ESTADO.md.

Pie común (pégalo al final de cada mensaje):
> Pruebas: durante el trabajo solo las relacionadas; la batería completa una vez al final con --workers=100%; si una falla, repite solo esa. No hagas push nunca; solo commits. Actualiza ESTADO.md al terminar.

---

## 1 · Primera vez y temas de ejemplo (4e)
Lee docs/rediseno/ESTADO.md y docs/rediseno/primera-vez/LEEME.md con sus pantallas y temas. Rehaz la primera vez con ese flujo y añade los dos temas de ejemplo como apuntes (también a los datos de ?local). Reutiliza lo que sirva de onboarding.js sin preguntarme.

## 2 · Aspecto: colores de acento y etiquetas
Lee docs/rediseno/perfil-ajustes/LEEME.md (apartados «Color de acento» y «Lo que hoy sale siempre en cobalto») y docs/rediseno/etiquetas/LEEME.md con etiquetas.jpg.
a) Cambia la lista de acentos por los 9 nuevos (los ids antiguos pasan al más parecido) y quita el cobalto escrito a mano (también en modo oscuro), usando var(--accent) o un color-mix de él. Dime si encuentras más sitios con azul fijo.
b) Cambia las etiquetas al estilo «pegatinas» en todos los sitios donde salen, con la paleta nueva (los colores antiguos pasan al más parecido), y rehaz «Gestionar etiquetas».
Compruébalo en el navegador con Frambuesa y con Bosque, en claro y en oscuro.

## 3 · Tipos de pregunta y editor de una pregunta (8) (OK)
Lee docs/rediseno/FASES.md (fase 8), las capturas tipos-movil y tipos-escritorio de docs/rediseno/pantallas y docs/rediseno/editor-pregunta/LEEME.md con sus pantallas. Rehaz el selector de tipos y la hoja de crear/editar una pregunta (también «Varias de golpe», con la letra a mano en el título y un ejemplo que siga al tipo elegido). No cambies los tipos ni cómo se guardan. Antes de programar, dime cómo encajas los ~20 tipos en «los más usados + Más tipos» y espera mi OK.

## 4 · Sugerencias sin IA
Lee docs/rediseno/sugerencias/README.md. Usa esperadas/*.json como batería de pruebas de suggest.js: mide cuántas «imprescindible» salen hoy, mejora las reglas y repite la medida. Además: «Crear en» debe proponer «Lista nueva» si el apunte no tiene lista; si la respuesta es una fecha, la pregunta es «¿Cuándo…?» y no «¿Qué fue…?»; las fechas y los datos van antes que «Ordenar frase»; no te saltes frases con fecha de un mismo párrafo (ej.: «El Terror lo dirigió Robespierre entre 1793 y 1794»). Dime el antes y el después.

## 5 · Mapa y repasar dentro del apunte (10 y 11) (OK)
Lee docs/rediseno/ESTADO.md y docs/rediseno/mapa-editor/LEEME.md con sus pantallas. Fase 10: vista Mapa en lista, carpeta y tema, con la ficha de una casilla, «elegir varias» y «Se te resisten». Fase 11: modo Repasar dentro del apunte (los 4 botones de la tanda) y el atajo >> / <>. Antes de programar, dime cómo agrupas las preguntas en casillas con los datos que ya hay y espera mi OK.

## 6 · Plan de estudio: semana, hoy toca y exámenes, y Explorar (12a) (OK)
Lee docs/rediseno/ESTADO.md y docs/rediseno/plan-explorar/LEEME.md con sus pantallas. Haz la parte 12a: Tu semana con días especiales, Hoy toca (la tanda de Hoy usa los minutos del día), las pantallas de examen y Explorar. Antes de programar, dime cómo guardarás week/special en prefs y cómo encaja con plan.js, y espera mi OK.

## 7 · Plan de estudio: etapas (12b) (OK)
Lee docs/rediseno/plan-explorar/LEEME.md. Haz la parte 12b: etapas (lista, editar, tira en móvil y planificador por meses y semanas en escritorio), orden de temas, «cuando no llegas» y la primera vez. Sin etapas, todo debe seguir funcionando como ahora. Antes de programar, dime el modelo de stages y cómo lo resuelves por día, y espera mi OK.

## 8 · Perfil, Ajustes y Amigos (13 y 7) (OK solo para Supabase)
Lee docs/rediseno/ESTADO.md, docs/rediseno/perfil-ajustes/LEEME.md y docs/rediseno/amigos/LEEME.md con sus pantallas. Reordena Perfil y Ajustes (con el buscador) como dice el LEEME; no borres ningún ajuste sin decirme dónde ha ido. Haz la pantalla Amigos nueva y el texto «X te dice: …». Para «¡Bravo!» como tipo de ánimo, dime antes qué cambio necesitas en Supabase y espera mi OK; lo demás hazlo sin parar.

## 9 · Preguntas de entender (9) (OK)
Lee docs/rediseno/FASES.md (fase 9) y las capturas entender-* y tanda-fin de docs/rediseno/pantallas. Haz «Explícalo» y «¿Qué pasaría si…?». Antes de programar, dime cómo se corrigen y espera mi OK.

## 10 · Cierre
Repasa toda la app en modo oscuro y a 375 px y 1440 px, arregla lo que se vea roto, pasa la batería completa y deja ESTADO.md al día. Después hago yo el push.
