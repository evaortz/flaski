# Flaski · guía rápida para Claude

Flaski es una PWA en español de **flashcards con repaso espaciado (FSRS) y apuntes por bloques**, pensada para el móvil.
JavaScript con módulos ES **sin frameworks ni bundler** (HTML + CSS + JS tal cual), desplegada en **Netlify** (repo
`evaortz/flaski`, rama `main`) con **Supabase** para cuentas y datos. Sin credenciales de Supabase funciona en
**modo local** (todo en el navegador).

La persona usuaria escribe en español: responde en español, de forma concisa.

## Contexto detallado (léelo antes de cambios grandes)

- `docs/contexto/01-producto.md` — qué es Flaski, secciones y funciones.
- `docs/contexto/02-arquitectura.md` — mapa de archivos, capa de datos, estado `S`, patrones de `app.js`, SW, CSS, esquema y pruebas.
- `docs/contexto/03-diseno.md` — sistema de diseño, preferencias de la persona usuaria y **estilo de los gráficos**.
- `docs/contexto/04-flujo-de-trabajo.md` — cómo trabajar con la persona usuaria (propuestas, pruebas, commits, novedades).
- `docs/contexto/05-estado-y-pendientes.md` — lo último hecho y lo que queda por hacer.

## Arrancar en local

En PowerShell, desde la raíz del repo:

```powershell
$env:PORT = '8000'; node tests/serve.mjs     # sin PORT usa el 8123
```

Abre `http://localhost:8000`. El service worker cachea la app: si no ves un cambio, **Ctrl+Mayús+R** (o sube `VERSION` en `sw.js`).
`js/config.js` tiene la URL y la clave pública de Supabase de producción: en local la app habla con la nube real si
inicias sesión. Las pruebas, en cambio, sustituyen `config.js` y usan siempre el modo local.

## Pruebas (todo se ejecuta dentro de `tests/`)

```powershell
cd tests
npm install                                    # solo la primera vez (y npx playwright install chromium webkit)
node --test "unit/*.test.js"                   # = npm run test:unit  (lógica pura, Node)
npm run e2e:rapida                             # mientras trabajas: solo «movil» y solo lo que toca lo que has cambiado
npm run e2e:rapida -- plan apuntes             # …o las pruebas de esas pantallas (lista en tests/rapida.mjs)
npm run e2e:rapida -- --last-failed            # …o repetir solo lo que falló
npx playwright test                            # = npm run test:e2e: la batería completa, una vez al final del paso
$env:TRACE = '1'; npx playwright test e2e/plan.spec.js   # con traza, para depurar un fallo
npx playwright test --config capturas.config.js                # = npm run capturas (regenera img/onboarding e img/novedades)
```

- **Dos formas de lanzar la batería:** mientras trabajas, `npm run e2e:rapida` (menos de 1 min); al final del paso, la
  completa con `npx playwright test` (sin `--workers`: la configuración ya lo fija), en verde de una vez.
- El proyecto «escritorio» solo ejecuta las pruebas con `@ambos` en el título: las que dependen del tamaño, el teclado o
  el ratón. Una prueba nueva de maquetación, teclado o arrastre lleva `@ambos`; la lógica basta con verla en el móvil.
- Para tener datos, usa el fixture `seed` (listas, preguntas, apuntes, carpetas, listas de Explorar y progreso, antes de
  abrir la app) y `openDeck` / `openPage`; crea con la pantalla solo lo que la prueba prueba.
- Las e2e usan `tests/e2e/fixtures.js` (`test`, `openApp`, `nav`, `answer`, `seed`…): fuerzan modo local, bloquean jsDelivr y fallan si hay errores de JS en la página.
- `tests/e2e/nube.js` simula Supabase en memoria para probar el modo con cuenta.
- `tests/unit/sw.test.js` comprueba que **todo módulo importado desde `js/app.js` está en la lista `SHELL` de `sw.js`**.
- Tras implementar algo: ejecuta unitarias + e2e y di cuántas pasan/fallan.

## Reglas al cambiar archivos

- **Service worker**: cada vez que cambie cualquier archivo servido (js, css, html, fuentes, imágenes del shell…) sube
  `VERSION` en `sw.js` (`flaski-vNN` → `flaski-vNN+1`) y ejecuta `node version.mjs` desde `tests/` (pone la versión en las
  direcciones de los módulos de `index.html`; sin eso, Safari puede mezclar módulos de dos versiones). Si añades un archivo nuevo
  que la app carga al arrancar, añádelo a `SHELL` (y `version.mjs` lo añade a la lista de módulos).
- **Novedades**: si la función es visible para quien usa la app, actualiza las pantallas de `js/news.js`, sube
  `NEWS_VERSION` y regenera capturas (`npm run capturas`). Ver `04-flujo-de-trabajo.md`.
- **Esquema**: los cambios en `supabase/schema.sql` deben ser idempotentes (`if not exists`, `create or replace`);
  la persona usuaria los ejecuta a mano en el SQL Editor de Supabase. Avísale cuando haga falta.
- Textos de la interfaz en español natural, sin comparaciones con otras apps («como en Notion»). Ver `03-diseno.md`.
- No copies claves ni secretos en documentación o mensajes.

## Commits

- Claude edita y hace los commits, con mensajes **descriptivos en español** que resumen lo que nota la persona usuaria
  (estilo del historial: «Apuntes: exportar a Word, PDF…; importar Word, Markdown…»).
- **Nunca hagas `git push`**: la persona usuaria sube los cambios a mano.
- En Windows evita `node -e` con barras invertidas o comillas complejas: escribe un archivo o usa Edit.
