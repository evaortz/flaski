# Rediseño de Flaski · lo que queda (25 oct 2026)

Lee esto al empezar la conversación nueva.
- Lienzo de diseño: «Flaski · Terminal» (artefacto de diseño).
- Vídeo de Novedades: «Flaski · Lo nuevo».
- Cola de pasos: `docs/rediseno/MENSAJES.md`. Estado de Claude Code: `docs/rediseno/ESTADO.md`.

## 1 · Remates que puede que aún no tenga Claude Code
Si ESTADO.md no los da por hechos, pégaselos:
- **Contraste** por debajo de 4,5:1:
  - Plan: la píldora del día especial (3,2) y «Normal» dentro de las barras de etapa (3,6).
  - Ajustes: «Borrar mi cuenta…» (4,3).
  - Estadísticas: «↑ 8» en verde (4,1).
- **Plan, tira de etapas en el móvil:** una etapa de 1 día mide 5 px de ancho. Mínimo 28 px.
- **Buscador de Ajustes:** si hay un resultado de «Ya no está en Ajustes», no enseñes también «Ningún ajuste con ese nombre».
- **Apunte en el móvil:** `overflow-x: clip` y `overscroll-behavior-x: none` en la página del apunte, por si acaso. Eva vio que se movía de lado; en el emulador no se reproduce.
- **Salir del modo Repasar del apunte:**
  - «✕ Salir de repasar» en el panel flotante de «Destapar».
  - La barra «Escribir | Repasar» fija (sticky) mientras se repasa.
  - Esc y el botón atrás de Android también salen.
  - Ahora, si bajas por el apunte, no hay forma de salir.
- **Minutos frente a lo que hay de verdad:**
  - Si hoy tocan 14 preguntas (unos 3 min) y el día tiene 60 min, el botón del Plan dice «Empezar la tanda · 3 min», no «60 min».
  - En Hoy, debajo: «Te sobra tiempo: ¿aprendes 10 nuevas más?».
- **Pregunta de entender:** al elegir «Escribir», «Dictar» o «Pensarlo», el botón se pone blanco con el texto blanco.
- **Tanda:** el texto gris de sincronización no puede empujar la pantalla hacia abajo.
- **Novedades:** poner el vídeo en la hoja de Novedades (ver `docs/rediseno/novedades/LEEME.md`).

## 2 · Lo que tiene que hacer Eva antes del push (en este orden)
1. Esperar a que Claude Code cierre el paso 5 con la batería completa y ESTADO.md al día.
2. En Supabase › SQL Editor: ejecutar el SQL que Claude Code dejó en `schema.sql`:
   - «¡Bravo!» y `recent_cheers`;
   - `deleted_at` en decks, pages y folders;
   - las políticas RLS con `deleted_at is null`;
   - `delete_my_account`;
   - la consulta que comprueba que todo es «on delete cascade».
3. Volver a desplegar la función «recordatorio» (por «¡Bravo!»).
4. Probar con tu cuenta de verdad, no en `?local`:
   - Amigos y los ánimos;
   - la papelera (borrar, deshacer, recuperar);
   - borrar una cuenta de prueba (nunca la tuya);
   - abrir la app en el móvil y en el ordenador a la vez, hacer un simulacro en uno y cambiar un ajuste en el otro, y comprobar que no se pierde nada.
5. Restaurar una copia de seguridad antigua (de antes del rediseño) en una cuenta de prueba y ver que todo aparece bien: acentos, plan, etiquetas y tipos de pregunta.
6. En el móvil de verdad, desde la wifi de casa con la IP del ordenador:
   - la voz en el iPhone;
   - el botón atrás de Android;
   - instalar en la pantalla de inicio (icono nuevo);
   - que el apunte no se mueva de lado.
7. Push.

## 3 · Lo que podemos hacer en la conversación nueva
- **Regrabar los clips del vídeo** con la versión final antes del push (los scripts están hechos y se tarda unos minutos). Y, si se quiere, una versión corta de unos 45 s para Novedades, dejando la de 2 min para web y redes.
- **Animaciones de la app:** propuesta de un juego corto de animaciones (150-300 ms, que se apaguen con «reducir movimiento») para dar la vuelta a la pregunta, responder, la barra de la tanda, el fin de tanda, abrir y cerrar hojas, cambiar de pestaña, el mapa y la racha. Enseñarlas animadas antes de pasarlas a Claude Code.
- **Mejorar las sugerencias** (`suggest.js`). Con texto pegado ya da 9 preguntas en vez de 3, pero hay margen para proponer mejores preguntas en general. Usar los temas de ejemplo y textos reales de oposición como batería.
- **Rendimiento:** prueba con 5.000 preguntas (Biblioteca, mapa, buscador y arranque por debajo de 1 s en un móvil normal).
