# Plan de estudio y Explorar (fase 12)

## Plan de estudio — «al milímetro»
Pantallas: plan-movil, plan-escritorio (planificador por meses), plan-semanas-escritorio, plan-editar-etapa,
plan-no-llegas, plan-primera-vez, examen-detalle, examen-nuevo.

Piezas de la pantalla:
1. Resumen arriba: «Vas bien: llegas a los dos exámenes» (verde/lavanda) o «Así no llegas al examen de X» (coral).
2. **Tu semana**: minutos de cada día (L–D, 0 = libre) + **días especiales** (rango de fechas con otros minutos,
   p. ej. vacaciones 15 min). La tanda de «Empezar» en Hoy usa los minutos del día.
3. **Hoy toca**: reparto de hoy (nuevas por carpeta + repasos), qué tema toca y «Empezar la tanda · N min».
4. **Tu temporada**: tira (móvil) / planificador (escritorio, Meses | Semanas) con etapas, exámenes, hoy y
   días especiales (fila propia + tinte ámbar suave detrás).
5. **Etapas**: rango de fechas + nivel por carpeta (Pausa · Repasar · Poco · Normal · Mucho) + orden de temas
   (listas) dentro de cada carpeta, con fecha límite opcional por tema. Al acabar una etapa empieza la siguiente.
6. **Cuando no llegas**: causa en una frase + 3 arreglos con su resultado (subir nivel, alargar etapa,
   más minutos un día). «Aplicar» o «Lo dejo así».
7. **Primera vez**: con los exámenes que ya hay y «¿cuánto tiempo tienes al día?», Flaski propone etapas.
8. **Examen**: detalle (si llegas, temario visto, lo que se resiste, «la última semana solo repasos»,
   qué pasa después) y nuevo examen (de qué + cuándo + cuántas nuevas al día hacen falta).

### Modelo de datos (esto SÍ cambia respecto a plan.js)
- `prefs.week = { mon..sun: minutos }`, `prefs.special = [{ from, to, minutes, label }]`.
- `prefs.stages = [{ id, name, from, to, levels: { [idCarpeta|idLista]: 'paused'|'reviews'|'low'|'normal'|'high' },
  order: { [idCarpeta]: [{ deck, until? }] } }]`.
- Nivel → lo que ya existe: paused → state 'paused'; reviews → 'reviews'; low/normal/high → 'active' con
  weight 1/2/4. Para cada día se toma la etapa vigente y se aplican `shares`, `allocate` y `examFloors` igual que hoy.
- Orden de temas: dentro de una carpeta, las nuevas salen solo de la primera lista no terminada (o de la
  que toque por fecha).
- Sin etapas definidas, se comporta como ahora (una etapa implícita «siempre» con los nodes actuales).
- Exámenes: siguen en `nodes[..].exam`; «la última semana solo repasos» crea/ajusta una etapa automática.

### Orden de trabajo
- **12a**: Tu semana + días especiales + Hoy toca (la tanda de Hoy usa los minutos del día) + exámenes
  (detalle y nuevo).
- **12b**: etapas (lista, editar, tira/planificador), orden de temas, cuando no llegas y primera vez.

## Explorar
(igual que antes: ver explorar-movil / explorar-escritorio y las notas anteriores)
- Filtros por objetivo: Todo · Idiomas · Oposiciones · Carrera · De tus amigos (campo `objetivo` en las listas incluidas).
- Destacado = tema de ejemplo «Por qué se te olvidan las cosas» con «Añadir y empezar».
- Nada de «N mil personas». «De tus amigos» = listas compartidas contigo; la nota de actividad solo si ya hay ese dato.
