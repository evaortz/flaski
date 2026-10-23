# Fases del rediseño (una conversación por fase)

## Reglas para todas las fases (ahorrar tokens)
- Lee `docs/rediseno/DISENO.md` y SOLO las capturas que nombra la fase.
- No leas app.js entero: busca con grep y abre solo los trozos que necesitas.
- No cambies lógica de repaso, datos ni tipos de pregunta, salvo que la fase lo pida.
- Los cambios van en pasos pequeños: al menos un commit por paso, y la app arranca sin errores en consola.
- Al acabar, añade 5–10 líneas a `docs/rediseno/ESTADO.md`: hecho, pendiente y dudas. No escribas resúmenes largos en el chat.
- Si algo no está decidido en DISENO.md, no lo inventes: apúntalo en ESTADO.md como duda.

| Fase | Qué | Capturas |
|---|---|---|
| 1 | Dividir app.js por pantallas (solo mover código) | — |
| 2 | Vocabulario (lista / pregunta / tanda) + 4 pestañas Hoy · Biblioteca · Explorar · Perfil | organizacion-1/2 |
| 3 | Biblioteca: carpetas con apuntes y listas juntos | biblioteca-movil, carpeta-movil, carpeta-escritorio, lista-movil |
| 4 | Hoy, móvil y escritorio, con «Tus amigos» al final | hoy-movil, hoy-escritorio |
| 5 | Aspecto de la tanda + 4 botones + fin de tanda | tanda-* |
| 6 | Editor: barra de selección cobalto + panel lateral «Crear pregunta» | editor-* |
| 7 | Perfil, plan y amigos | perfil-movil, plan-movil-*, amigos-movil |
| 8 | Selector de tipos de pregunta (cuando esté diseñado) | pendiente |
| 9 | Preguntas de entender: Explícalo / ¿Qué pasaría si…? | entender-*, tanda-fin |
