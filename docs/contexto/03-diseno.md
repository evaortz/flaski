# 03 · Diseño: sistema visual y preferencias de la persona usuaria

## Principios (preferencias de la persona usuaria)

- **Aspecto profesional y limpio, estilo Notion** en la interfaz y **estilo shadcn/ui** en los gráficos.
- **Coherencia por encima de todo**: antes de crear un estilo nuevo, reutiliza tokens y componentes de `css/app.css`.
  Interpreta la intención de lo que pide en vez de aplicar valores al pie de la letra; deja margen para decidir
  dentro del sistema que ya existe (la propia persona usuaria pidió no dar instrucciones demasiado concretas).
- **Color de acento solo para CTAs principales y enlaces** (y, en los gráficos, para sus tonos). Nada de acento ni de
  negro en estados seleccionados. Dijo que había «mucho abuso del color de acento» y no le gustaron las pestañas en negro.
- **Segmentados y pestañas**: pista gris (`--soft`) y opción activa **blanca** (`--bg`) con sombra suave (patrón iOS:
  `.seg button[aria-pressed="true"]`).
- **Iconos de interfaz con Lucide** (`js/icons.js`); emojis solo donde los elige la persona usuaria (mazos, carpetas, tipos
  propios, icono de un apunte).
- **Selects nativos** con la estética de la app (relleno `--soft`, flecha `--select-arrow`), sin listbox propio.
- **Funciones útiles de verdad y probadas**: nada decorativo; cada función nueva lleva sus pruebas.
- **Textos en español natural**. **Nunca** escribir comparaciones en la interfaz como «como en Notion» o «como
  Obsidian»; esos nombres solo aparecen donde se dice de qué apps se puede importar o a cuáles exportar
  (p. ej. «un .zip de Notion u Obsidian»). Evitar frases confusas o enrevesadas (se han quitado frases de las
  novedades por no entenderse). Tutear, frases cortas, verbos concretos («Crear tarjeta», «Ver en los apuntes»).

## Tokens y componentes

- Colores neutros tipo Notion: `--bg` blanco / `#191919` en oscuro, `--soft`, `--hover`, `--press`, `--fg`, `--muted`,
  `--faint`, `--line`, `--line-strong`. Radio general `--r: 6px`.
- Acento por `data-accent` en `<html>` (14 colores, por defecto azul). Etiquetas y resaltados con la paleta de Notion
  (`--tag-*`, `--hl-*`, `--c-*`); el formato de texto de los apuntes usa esos mismos 9 colores.
- Modo oscuro completo: todo color nuevo necesita su valor oscuro (en los dos bloques: media query y `data-theme="dark"`).
- Botones: `.primary` (acento, solo CTA principal de la pantalla), `.ghost` (borde/neutro), `.link`, `.iconbtn`,
  `.small-btn`, `.danger`. Filas de navegación `.row-link`. Hojas modales `#sheet`. Chips de filtro `.fchip`.

## Tipografía

- **Atkinson Hyperlegible** (`--font`) para todo el texto corrido, botones y formularios.
- **General Sans** (`--font-head`) para títulos (h1–h3, título del apunte, marca) y para la interfaz de paneles y
  gráficos: cifras grandes, cabeceras de gráfico, KPIs, ejes, leyendas, rachas, amigos.
- «La del dispositivo» (`--font-native`) solo como opción para las tarjetas (Ajustes → Apariencia → Letra).
- Números en gráficos y contadores con `font-variant-numeric: tabular-nums`.

## Estilo de los gráficos (acordado con la persona usuaria)

Objetivo: gráficos **mínimos, que «no parezcan hechos con IA»**. Reglas:

1. **La respuesta primero.** Cada tarjeta de gráfico empieza con una etiqueta pequeña (`.lv-k`, muted), un **número
   grande** (`.lv-n`, ~34px, General Sans) y **una frase de una línea** que lo explica. El gráfico va debajo.
2. **Un solo tono: el acento del tema**, en escalones (oscuro = lo importante / hoy; claro = contexto).
   Rojo y verde **solo** para deltas de subida/bajada. Nada de paletas multicolor.
3. **Sin rejilla, sin eje Y, sin leyenda aparte**: solo una línea base y **etiquetas directas** junto a cada serie.
4. **Sin tooltips flotantes**: al pasar el ratón o arrastrar el dedo se actualizan el número y la frase de la
   cabecera de la propia tarjeta («**cabecera viva**»: atributos `data-live`, clases `.lv-*`, funciones
   `liveShow`/`liveReset` en `charts.js`). Al salir vuelve al valor de hoy.
5. **Periodos como pestañas de texto subrayadas**: `1 m · 3 m · 1 a · Todo` (no segmentados con fondo).
6. **Destacar solo una cosa**: la barra de hoy, la mejor hora, el último día… el resto en tono de contexto.
7. **Medidas comunes**: radio de 2px en barras y cuadrados; líneas de 1.5px; texto de ejes 11px en `--muted`;
   separadores finos del color de la superficie entre bandas apiladas; **rayado** (patrón a 45°) para «por aprender».
   Transiciones suaves al cambiar de periodo; respetar `prefers-reduced-motion`.

### Gráfico de referencia: «Tu progreso» (Inicio, `progressView` en `charts.js`)

- Bandas apiladas, de abajo arriba: **consolidadas**, **jóvenes**, **aprendiendo** (tonos del acento, de oscuro a
  claro) y, encima, **por aprender** rayado hasta el **total** de tarjetas.
- Se reconstruye día a día con `review_events` (cada respuesta guarda el `ivl` con el que dejó la tarjeta), sin
  guardar nada nuevo. Etapa según el intervalo: aprendiendo < 1 día, jóvenes < 21 días, consolidadas ≥ 21 días.
  «**Te sabes**» = jóvenes + consolidadas.
- Cabecera: «Tu progreso» · número grande (las que te sabes) · frase («de N tarjetas te las sabes»); al recorrer el
  gráfico cambia al día señalado (en pasado: «te las sabías»).
- Anotaciones directas sobre el gráfico: el día que entraron muchas tarjetas de un mazo («**+60 de Biología**») y el
  último hito alcanzado («**llegas a 100**»), con un punto pequeño.
- Periodos `PG_PERIODS` (1 m, 3 m, 1 a, Todo); el elegido se guarda en `prefs.home.progressPeriod`.
- Debajo, una línea con lo que toca los próximos días (`nextLine`).
- Este es el modelo para rehacer el resto de gráficos (Estadísticas incluidas).

### Otros gráficos de Inicio ya en este estilo

- **Actividad**: calendario de cuadrados en tonos del acento (siempre cuadrados y centrados), periodos con
  transición animada, cabecera viva con el día señalado.

## Novedades y bienvenida

- Mismo diseño en las dos (`.ob-*`): pantallas con título corto, una o dos frases claras y una captura real de la app
  en claro y oscuro (`img/onboarding`, `img/novedades`), regeneradas con Playwright.

## Lo que no hacer

- Acento en fondos de selección, pestañas negras, sombras fuertes, degradados, emojis decorativos en la interfaz.
- Leyendas con cuadraditos de colores, rejillas, tooltips flotantes en gráficos nuevos.
- Mezclar tipografías fuera de la regla Atkinson/General Sans.
- Textos que comparan con otras apps o que hay que leer dos veces.
