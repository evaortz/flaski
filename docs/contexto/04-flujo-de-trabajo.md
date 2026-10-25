# 04 · Flujo de trabajo con la persona usuaria

## Quién hace qué

- La persona usuaria revisa la app y piensa las funciones; a veces lo hace en un chat de claude.ai, que redacta prompts.
- Desde el 2026-10-05 quiere que **Claude Code haga directamente todas las ediciones de código** y los commits.
- Cuando llegue un prompt pegado de otro chat: tómalo como **intención, no como especificación**. Contrástalo con el
  código y avisa si algo ya está hecho, no cuadra o tiene una alternativa mejor (Claude puede discutir propuestas;
  por ejemplo, se acordó emparejar por id con origen transitivo al restaurar copias en la nube).
- Repo `evaortz/flaski` (GitHub, rama `main`), desplegado en **Netlify** con **Supabase**. **La persona usuaria hace el push**.

## Comunicación

- Escribe en español: **responde en español, conciso**. Sin emojis.
- Al terminar, resume qué cambió (lo que notará), resultado de las pruebas y si debe hacer algo a mano
  (ejecutar SQL en Supabase, recargar sin caché…).

## Antes de implementar

- **Cambios visuales grandes**: propón primero (maqueta o mockup visual, o descripción clara) y **espera su OK**.
- Cambios pequeños o arreglos claros: hazlos directamente.
- Lee `03-diseno.md` antes de tocar estilos y parte de los tokens y patrones existentes en `css/app.css`.

## Implementar

- Sigue los patrones de `app.js` (estado `S`, `render*`, `data-act` + delegación, `openSheet`, `toast`) y mete la
  lógica pura en su módulo con pruebas unitarias.
- Si cambias archivos servidos: **sube `VERSION` en `sw.js`** y añade a `SHELL` los archivos nuevos que se cargan al arrancar.
- Cambios de esquema en `supabase/schema.sql`, siempre idempotentes; avisa a la persona usuaria de que tiene que ejecutarlo
  en el SQL Editor de Supabase.
- Textos de la interfaz: español natural, sin comparaciones con otras apps.

## Probar

Desde `tests/`:

```powershell
node --test "unit/*.test.js"
npx playwright test                       # movil + escritorio
```

- Añade o ajusta pruebas e2e para lo nuevo (con `fixtures.js`; para el modo nube, `nube.js`).
- Mientras trabajas, pasa solo las pruebas relacionadas con lo que tocas. La batería completa, **una sola vez al final
  de la fase** (`npx playwright test`; los workers los fija `playwright.config.js`, la mitad de los núcleos). Tiene que
  salir en verde de una vez: si una falla solo con carga, arréglala para que espere a un estado de la página (no a un
  tiempo fijo ni a un evento que puede haber pasado ya).
- Para probar con datos sin tocar la cuenta: `http://localhost:8000/?local` (modo local de pruebas, botón «Cargar datos de ejemplo»).
- Informa de los recuentos (p. ej. «unitarias: N ok; e2e: M ok, 0 fallos»). Si algo falla y no es tuyo, dilo.
- Para ver la app: `$env:PORT = '8000'; node tests/serve.mjs` y `http://localhost:8000`. Si el navegador muestra la
  versión vieja: **Ctrl+Mayús+R** (el service worker sirve la caché si falla la red) o comprobar que subió `VERSION`.

## Novedades al publicar algo visible

1. Edita las pantallas en `js/news.js` (`SLIDES`: `id`, `title`, `text`, `alt`).
2. Sube `NEWS_VERSION` (formato actual `'2026-10'`) para que se muestren una vez a quien no las haya visto.
   `NEWS_ALWAYS` debe quedar en `false`.
3. Prepara la captura en `tests/novedades.spec.js` (o `capturas.spec.js` para la bienvenida) y regenera:
   `npx playwright test --config capturas.config.js` (salen en `img/novedades/` y `img/onboarding/`, claro y oscuro).
4. Si añades imágenes nuevas que deban ir sin conexión, valora añadirlas al `SHELL`.

## Commits

- Mensajes **en español, descriptivos**, centrados en lo que cambia para quien usa la app. Ejemplos del historial:
  - «Tablas: asas de fila y columna con su menú, + para añadir, celdas que crecen, ordenar y alinear; ayuda al día»
  - «Novedades: una sola vez por versión al entrar, y «Ver las últimas novedades» en Ajustes»
- Un commit por cambio coherente. **Nunca `git push`**. No subas `tests/test-results/` ni `settings.local.json`.
- Añade la línea de coautoría que indique el entorno.

## Trampas en Windows

- Shell principal PowerShell 5.1 (sin `&&`; usa `;` o `if ($?)`). También hay Git Bash.
- Evita `node -e "..."` con barras invertidas, comillas anidadas o `$`: escribe un script temporal o usa Edit/Write.
- Avisos de LF → CRLF de git son normales.
- Rutas con espacios entre comillas; usa rutas absolutas.
