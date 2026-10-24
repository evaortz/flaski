# Mensajes para Claude Code (uno por conversación nueva)

Pie común para todos:
> Pruebas: durante el trabajo solo las relacionadas; la batería completa una vez al final con --workers=100%; si una falla, repite solo esa. No hagas push nunca; solo commits. Actualiza ESTADO.md al terminar.

## 3b · Lista
Lee docs/rediseno/ESTADO.md y docs/rediseno/lista/LEEME.md con sus pantallas. Rehaz la pantalla de lista en móvil y escritorio como en las capturas (cabecera con descripción, menús «+» y «…», tipo de cada pregunta). El selector «Lista | Mapa» déjalo preparado pero oculto hasta la fase 10.

## 4d · Atrasos
Lee docs/rediseno/ESTADO.md y docs/rediseno/atrasos/LEEME.md con sus pantallas. Reparte los atrasos al volver y prioriza el examen cercano en Hoy, reutilizando los componentes de Hoy.

## 4e · Primera vez y temas de ejemplo
Lee docs/rediseno/ESTADO.md y docs/rediseno/primera-vez/LEEME.md con sus pantallas y temas. Rehaz la primera vez con ese flujo y añade los dos temas de ejemplo como apuntes (también a los datos de ?local). Antes de programar, dime qué partes de onboarding.js reutilizas y espera mi OK.

## 7 · Amigos
Lee docs/rediseno/ESTADO.md y docs/rediseno/amigos/LEEME.md con sus pantallas. Añade «¡Bravo!» como tipo de ánimo (dime antes qué cambio necesitas en Supabase y espera mi OK), el texto «X te dice: …» y la pantalla Amigos nueva.

## Sugerencias (sin IA)
Lee docs/rediseno/sugerencias/README.md. Usa esperadas/*.json como batería de pruebas de suggest.js: mide cuántas «imprescindible» salen hoy, mejora las reglas y repite la medida. Dime el antes y el después.

## 10 y 11 · Mapa y editor
Lee docs/rediseno/ESTADO.md y docs/rediseno/mapa-editor/LEEME.md con sus pantallas. Fase 10: vista Mapa en lista, carpeta y tema, con la ficha de una casilla, «elegir varias» y «Se te resisten». Fase 11: modo Repasar dentro del apunte (los 4 botones de la tanda) y el atajo >> / <>. Antes de programar, dime cómo agrupas las preguntas en casillas con los datos que ya hay y espera mi OK.

## 12a · Plan de estudio (semana, hoy toca, exámenes) y Explorar
Lee docs/rediseno/ESTADO.md y docs/rediseno/plan-explorar/LEEME.md con sus pantallas. Haz la parte 12a: Tu semana con días especiales, Hoy toca (la tanda de Hoy usa los minutos del día), las pantallas de examen y Explorar. Antes de programar, dime cómo guardarás week/special en prefs y cómo encaja con plan.js, y espera mi OK.

## 12b · Plan de estudio (etapas)
Lee docs/rediseno/plan-explorar/LEEME.md. Haz la parte 12b: etapas (lista, editar, tira en móvil y planificador por meses y semanas en escritorio), orden de temas, «cuando no llegas» y la primera vez. Sin etapas, todo debe seguir funcionando como ahora. Antes de programar, dime el modelo de stages y cómo lo resuelves por día, y espera mi OK.
